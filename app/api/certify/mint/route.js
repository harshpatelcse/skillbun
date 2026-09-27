import { NextResponse } from 'next/server';
import { mintExamCertificate, ExamError } from '@/utils/server/certificationState.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { validateSchema } from '@/utils/server/inputValidator';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { generateCertificateId, generateWorkforceId, formatWorkforceDisplayId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId';
import { getActiveTemplateVersion } from '@/utils/common/docTemplateRegistry';

export const runtime = 'nodejs';

const CERT_MINT_RATE_LIMITS = [
  { name: 'userMinute', windowMs: 60 * 1000, maxRequests: 5, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'userHour', windowMs: 60 * 60 * 1000, maxRequests: 30, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'ipHour', windowMs: 60 * 60 * 1000, maxRequests: 50, getSubject: ({ address }) => `ip:${address}` },
];

export async function POST(request) {
  try {
    // 1. Verify User Authentication
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Authentication required to issue certificate.' }, { status: 401 });
    }

    let decodedToken;
    try {
      const adminAuth = getFirebaseAdminAuth();
      if (!adminAuth) {
        return NextResponse.json({ error: 'Server authentication configuration error.' }, { status: 500 });
      }
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired authentication token. Please log in again.' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase();
    const isAdmin = await isUserAuthorizedAdmin(decodedToken);
    const address = getClientAddress(request);

    // 2. Rate Limiting Protection
    const rateLimit = await checkServerRateLimit({
      namespace: 'certMint',
      subject: { uid, address },
      limits: CERT_MINT_RATE_LIMITS,
      increment: true,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many certificate minting requests. Please wait a moment.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) },
        }
      );
    }

    // 3. Parse Request Payload
    let rawBody;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 });
    }

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody) || (rawBody.cert_type !== undefined && typeof rawBody.cert_type !== 'string')) return NextResponse.json({ error: 'Invalid certificate payload.' }, { status: 400 });
    const certType = (rawBody.cert_type || 'ROADMAP').toUpperCase();

    const db = getFirebaseAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Database service unavailable.' }, { status: 500 });
    }

    // ==========================================
    // FLOW A: Standard ROADMAP Certificate (Self-Mint after Quiz)
    // ==========================================
    if (certType === 'ROADMAP') {
      const schemaCheck = validateSchema(rawBody, {
        attemptId: { type: 'string', required: true, minLength: 10, maxLength: 120, label: 'Exam Attempt ID' },
        name: { type: 'string', required: true, minLength: 1, maxLength: 100, label: 'Candidate Name' },
        roadmapSlug: { type: 'string', required: true, minLength: 1, maxLength: 80, pattern: /^[a-z0-9_]+$/, label: 'Roadmap Slug' },
        roadmapTitle: { type: 'string', required: true, minLength: 1, maxLength: 150, label: 'Roadmap Title' },
        cert_type: { type: 'string', required: false },
      }, {
        fieldName: 'Certificate mint payload',
        allowUnknown: false,
        maxKeys: 5,
      });

      if (!schemaCheck.isValid) {
        return NextResponse.json({ error: schemaCheck.error }, { status: 400 });
      }

      const { attemptId, roadmapSlug } = schemaCheck.value;
      const result = await mintExamCertificate(db, { uid, email, attemptId, roadmapSlug, certId: generateCertificateId() });

      try {
        const { invalidateCacheTag } = await import('@/utils/server/redisCache');
        await Promise.all([
          invalidateCacheTag('admin:certs'),
          invalidateCacheTag('admin:analytics'),
        ]);
      } catch {}

      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    // ==========================================
    // FLOW B: Workforce Credentials (INTERNSHIP, TRAINING, LOR) - Admin Only
    // ==========================================
    if (['INTERNSHIP', 'TRAINING', 'LOR'].includes(certType)) {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Only administrators can issue workforce credentials.' }, { status: 403 });
      }

      const {
        employee_id,
        name,
        email: candidateEmail,
        stream_or_track,
        start_date,
        end_date,
        recommendation_text,
        issued_by,
      } = rawBody;

      if (!employee_id || typeof employee_id !== 'string') {
        return NextResponse.json({ error: 'employee_id is required.' }, { status: 400 });
      }

      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return NextResponse.json({ error: 'Candidate name is required.' }, { status: 400 });
      }

      if (!candidateEmail || typeof candidateEmail !== 'string') {
        return NextResponse.json({ error: 'Candidate email is required.' }, { status: 400 });
      }

      if (!stream_or_track || typeof stream_or_track !== 'string') {
        return NextResponse.json({ error: 'Stream or training track title is required.' }, { status: 400 });
      }

      // Check employee record
      const employeeDoc = await db.collection('employees').doc(employee_id.trim()).get();
      if (!employeeDoc.exists) {
        return NextResponse.json({ error: 'Referenced employee record not found.' }, { status: 404 });
      }

      const employeeData = employeeDoc.data();
      if (employeeData.status === 'TERMINATED') {
        return NextResponse.json({ error: 'Cannot issue credentials to a terminated employee.' }, { status: 400 });
      }

      if (certType === 'LOR') {
        if (!recommendation_text || typeof recommendation_text !== 'string' || recommendation_text.trim().length < 20) {
          return NextResponse.json({ error: 'A valid recommendation text (minimum 20 characters) is required for LOR.' }, { status: 400 });
        }
      }

      // Generate custom ID according to credential type
      let prefix = WORKFORCE_PREFIXES.INTERNSHIP;
      if (certType === 'TRAINING') prefix = WORKFORCE_PREFIXES.TRAINING;
      if (certType === 'LOR') prefix = WORKFORCE_PREFIXES.LOR;

      const certId = generateWorkforceId(prefix);
      const displayId = formatWorkforceDisplayId(certId);
      const certRef = db.collection('certificates').doc(certId);

      const now = new Date();
      const certData = {
        id: certId,
        display_id: displayId,
        cert_type: certType,
        employee_id: employee_id.trim(),
        uid: employeeData.user_uid || uid,
        name: name.trim(),
        email: candidateEmail.trim().toLowerCase(),
        department: employeeData.department || '',
        designation: employeeData.designation || '',
        stream_or_track: stream_or_track.trim(),
        start_date: start_date ? String(start_date).slice(0, 10) : employeeData.joining_date || null,
        end_date: end_date ? String(end_date).slice(0, 10) : employeeData.contract_end_date || null,
        recommendation_text: certType === 'LOR' ? recommendation_text.trim() : null,
        issued_by: issued_by || 'Harsh Patel',
        issued_by_email: email,
        template_version: getActiveTemplateVersion(certType),
        is_revoked: false,
        createdAt: now,
        updatedAt: now,
      };

      await certRef.set(certData);

      try {
        const { invalidateCacheTag } = await import('@/utils/server/redisCache');
        await Promise.all([
          invalidateCacheTag('admin:certs'),
          invalidateCacheTag('admin:analytics'),
        ]);
      } catch {}

      return NextResponse.json({
        success: true,
        certId,
        displayId,
        cert_type: certType,
        certificate: certData,
        message: `${certType.replace('_', ' ')} credential minted successfully.`,
      });
    }

    return NextResponse.json({ error: `Invalid cert_type: "${certType}".` }, { status: 400 });
  } catch (error) {
    if (error instanceof ExamError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[Certify Mint API Error]:', error);
    return NextResponse.json({ error: 'Failed to mint certificate. Please try again.' }, { status: 500 });
  }
}
