import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { generateCertificateId, generateWorkforceId, formatWorkforceDisplayId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId';
import { getActiveTemplateVersion } from '@/utils/common/docTemplateRegistry';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { getOrSetCache, invalidateCacheTag, createCachedJsonResponse } from '@/utils/server/redisCache';
import { CertificateMutationError, createIssuedCertificate, validateCertificateIssue } from '@/utils/server/certificateIntegrity.mjs';

export const runtime = 'nodejs';

const ADMIN_RATE_LIMITS = [
  { name: 'adminMinute', windowMs: 60 * 1000, maxRequests: 30, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'adminIpHour', windowMs: 60 * 60 * 1000, maxRequests: 200, getSubject: ({ address }) => `ip:${address}` },
];

async function verifyAdminAuth(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

  if (!token) {
    return { authorized: false, response: NextResponse.json({ error: 'Authentication required: Bearer token missing.' }, { status: 401 }) };
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    if (!adminAuth) {
      return { authorized: false, response: NextResponse.json({ error: 'Server authentication configuration error.' }, { status: 500 }) };
    }
    const decoded = await adminAuth.verifyIdToken(token);
    const isAdmin = await isUserAuthorizedAdmin(decoded);
    if (isAdmin) {
      return { authorized: true, email: (decoded.email || '').toLowerCase(), uid: decoded.uid };
    }
    return { authorized: false, response: NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 403 }) };
  } catch (e) {
    console.warn('[Admin Certificates Auth Warning]:', e.message);
    return { authorized: false, response: NextResponse.json({ error: 'Invalid or expired authentication token.' }, { status: 401 }) };
  }
}

export async function GET(request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) return auth.response;

    // Rate limiting
    const address = getClientAddress(request);
    const rateLimit = await checkServerRateLimit({
      namespace: 'adminCerts',
      subject: { uid: auth.uid, address },
      limits: ADMIN_RATE_LIMITS,
      increment: true,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) } });
    }

    const url = new URL(request.url);
    const certType = url.searchParams.get('type') || '';
    const status = url.searchParams.get('status') || '';
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();

    const db = getFirebaseAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Database connection unavailable.' }, { status: 500 });
    }

    const allRawCerts = await getOrSetCache(
      'admin:certs:all_raw',
      60,
      async () => {
        const certsSnap = await db.collection('certificates').orderBy('createdAt', 'desc').get();
        return certsSnap.docs.map((doc) => {
          const data = doc.data();
          const toIso = (val) => {
            if (!val) return null;
            if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'string') return val;
            return null;
          };

          const cType = (data.cert_type || 'ROADMAP').toUpperCase();

          return {
            id: doc.id,
            display_id: data.display_id || (doc.id.startsWith('SKB-') && doc.id.includes('-HR-') ? doc.id.replace(/-/g, '/') : doc.id),
            cert_type: cType,
            uid: data.uid || '',
            employee_id: data.employee_id || '',
            name: data.name || data.studentName || data.userName || 'Student',
            email: (data.email || data.userEmail || '').toLowerCase(),
            roadmapTitle: data.roadmapTitle || data.stream_or_track || 'Roadmap Track',
            roadmapSlug: data.roadmapSlug || '',
            department: data.department || '',
            designation: data.designation || '',
            stream_or_track: data.stream_or_track || data.roadmapTitle || '',
            score: typeof data.score === 'number' ? data.score : 100,
            start_date: data.start_date || null,
            end_date: data.end_date || null,
            recommendation_text: data.recommendation_text || '',
            issued_by: data.issued_by || 'SkillBun Academic Verification Authority',
            is_revoked: Boolean(data.is_revoked),
            revoked_at: toIso(data.revoked_at),
            revoked_by: data.revoked_by || null,
            createdAt: toIso(data.createdAt) || new Date().toISOString(),
          };
        });
      },
      { tags: ['admin:certs'], swr: true }
    );

    let certificates = [...allRawCerts];

    // Compute metrics
    const totalCount = certificates.length;
    const roadmapCount = certificates.filter((c) => c.cert_type === 'ROADMAP').length;
    const workforceCount = certificates.filter((c) => ['INTERNSHIP', 'TRAINING', 'LOR'].includes(c.cert_type)).length;
    const activeCount = certificates.filter((c) => !c.is_revoked).length;
    const revokedCount = certificates.filter((c) => c.is_revoked).length;

    // Filter by type
    if (certType && certType !== 'ALL') {
      if (certType === 'WORKFORCE') {
        certificates = certificates.filter((c) => ['INTERNSHIP', 'TRAINING', 'LOR'].includes(c.cert_type));
      } else {
        certificates = certificates.filter((c) => c.cert_type === certType.toUpperCase());
      }
    }

    // Filter by status
    if (status === 'ACTIVE') {
      certificates = certificates.filter((c) => !c.is_revoked);
    } else if (status === 'REVOKED') {
      certificates = certificates.filter((c) => c.is_revoked);
    }

    // Search query
    if (search) {
      certificates = certificates.filter((c) => {
        return (
          c.id.toLowerCase().includes(search) ||
          c.display_id.toLowerCase().includes(search) ||
          c.name.toLowerCase().includes(search) ||
          c.email.toLowerCase().includes(search) ||
          c.roadmapTitle.toLowerCase().includes(search) ||
          c.stream_or_track.toLowerCase().includes(search) ||
          (c.department && c.department.toLowerCase().includes(search))
        );
      });
    }

    return createCachedJsonResponse(request, {
      success: true,
      certificates,
      count: certificates.length,
      metrics: {
        totalCount,
        roadmapCount,
        workforceCount,
        activeCount,
        revokedCount,
      },
    });
  } catch (err) {
    console.error('[SkillBun server operation]', { code: err?.code || 'INTERNAL_ERROR' });
    return NextResponse.json({ error: 'Failed to retrieve certificate records.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) return auth.response;

    // Rate limiting
    const address = getClientAddress(request);
    const rateLimit = await checkServerRateLimit({
      namespace: 'adminCerts',
      subject: { uid: auth.uid, address },
      limits: ADMIN_RATE_LIMITS,
      increment: true,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) } });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 });
    }

    body = validateCertificateIssue(body);
    const certType = body.cert_type;
    const candidateName = String(body.name || '').trim();
    const candidateEmail = String(body.email || '').trim().toLowerCase();
    const streamOrTrack = String(body.stream_or_track || body.roadmapTitle || '').trim();
    const roadmapSlug = String(body.roadmapSlug || '').trim().toLowerCase();
    const score = Number(body.score !== undefined ? body.score : 100);
    const department = String(body.department || 'Engineering').trim();
    const designation = String(body.designation || 'Intern').trim();
    const startDate = body.start_date ? String(body.start_date).slice(0, 10) : null;
    const endDate = body.end_date ? String(body.end_date).slice(0, 10) : null;
    const recommendationText = String(body.recommendation_text || '').trim();
    const customCertId = String(body.custom_id || '').trim();

    if (!candidateName || candidateName.length < 2) {
      return NextResponse.json({ error: 'Candidate name is required.' }, { status: 400 });
    }

    if (!streamOrTrack) {
      return NextResponse.json({ error: 'Stream / Roadmap Track title is required.' }, { status: 400 });
    }

    const db = getFirebaseAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Database connection unavailable.' }, { status: 500 });
    }

    let certId = customCertId;
    let displayId = customCertId ? formatWorkforceDisplayId(customCertId) : '';

    if (!certId) {
      if (certType === 'ROADMAP') {
        certId = generateCertificateId();
        displayId = certId;
      } else if (certType === 'INTERNSHIP') {
        certId = generateWorkforceId(WORKFORCE_PREFIXES.INTERNSHIP);
        displayId = formatWorkforceDisplayId(certId);
      } else if (certType === 'TRAINING') {
        certId = generateWorkforceId(WORKFORCE_PREFIXES.TRAINING);
        displayId = formatWorkforceDisplayId(certId);
      } else if (certType === 'LOR') {
        certId = generateWorkforceId(WORKFORCE_PREFIXES.LOR);
        displayId = formatWorkforceDisplayId(certId);
      } else {
        certId = generateCertificateId();
        displayId = certId;
      }
    }

    let recipientUid = '';
    if (candidateEmail) {
      try {
        const recipient = await getFirebaseAdminAuth().getUserByEmail(candidateEmail);
        if (recipient.emailVerified === true && recipient.email?.toLowerCase() === candidateEmail) recipientUid = recipient.uid;
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
      }
    }
    const now = new Date();
    const newCert = {
      id: certId,
      display_id: displayId,
      cert_type: certType,
      name: candidateName,
      email: candidateEmail,
      ...(recipientUid ? { uid: recipientUid } : {}),
      roadmapTitle: streamOrTrack,
      roadmapSlug: roadmapSlug || streamOrTrack.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      stream_or_track: streamOrTrack,
      department,
      designation,
      score: isNaN(score) ? 100 : score,
      start_date: startDate,
      end_date: endDate,
      recommendation_text: (certType === 'LOR' || certType === 'INTERNSHIP') ? (recommendationText || null) : null,
      issued_by: (certType === 'LOR' || certType === 'INTERNSHIP') ? 'Harsh Patel' : 'SkillBun Academic Verification Authority',
      issued_by_admin: auth.email,
      template_version: getActiveTemplateVersion(certType),
      is_revoked: false,
      createdAt: now,
      updatedAt: now,
    };

    await createIssuedCertificate(db, newCert);

    // Invalidate cached certificate records and analytics
    try {
      await Promise.all([
        invalidateCacheTag('admin:certs'),
        invalidateCacheTag('admin:analytics'),
      ]);
    } catch {}

    return NextResponse.json({
      success: true,
      certId,
      displayId,
      certificate: newCert,
      message: `✅ Certificate (${displayId}) issued successfully!`,
    });
  } catch (err) {
    if (err instanceof CertificateMutationError || err?.code === 'auth/account-deleting') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status || 409 });
    }
    console.error('[SkillBun server operation]', { code: err?.code || 'INTERNAL_ERROR' });
    return NextResponse.json({ error: 'Failed to issue certificate. Please try again.' }, { status: 500 });
  }
}
