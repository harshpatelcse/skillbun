import { NextResponse } from 'next/server';
import { getFirebaseAdminFirestore, getFirebaseAdminAuth } from '@/utils/server/firebaseAdmin';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { formatWorkforceDisplayId, isValidCertificateId } from '@/utils/server/workforceId';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { getOrSetCache, createCachedJsonResponse } from '@/utils/server/redisCache';

export const runtime = 'nodejs';

function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}***${local[local.length - 1]}@${domain}`;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const rawQuery = (url.searchParams.get('query') || '').trim();

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (rawQuery.length > 254) return NextResponse.json({ error: 'Query is too long.' }, { status: 400 });
    const isRefCode = isValidCertificateId(rawQuery);

    let userEmail = '';
    let isAdmin = false;

    if (token) {
      try {
        const adminAuth = getFirebaseAdminAuth();
        if (!adminAuth) {
          return NextResponse.json({ error: 'Server authentication configuration error.' }, { status: 500 });
        }
        const decoded = await adminAuth.verifyIdToken(token);
        userEmail = decoded.email_verified === true ? (decoded.email || '').trim().toLowerCase() : '';
        isAdmin = await isUserAuthorizedAdmin(decoded);
      } catch (authErr) {
        console.warn('[Alumni Auth Warning]:', authErr?.message);
        return NextResponse.json({ error: 'Invalid or expired authentication token.' }, { status: 401 });
      }
    }

    // Security Gate: Non-reference lookups (email or general queries) strictly require valid authentication
    if (!isRefCode && !token) {
      return NextResponse.json({
        success: false,
        documents: [],
        error: 'Authentication required. Please sign in to look up records by email.',
      }, { status: 401 });
    }

    // Target Query Resolution & IDOR Prevention
    let searchQuery = '';
    if (isRefCode) {
      searchQuery = rawQuery;
    } else {
      const requestedEmail = (rawQuery || userEmail).toLowerCase();
      // Non-admins are strictly forbidden from searching another user's email
      if (requestedEmail !== userEmail && !isAdmin) {
        return NextResponse.json({
          success: false,
          documents: [],
          error: 'Forbidden: You can only retrieve documents issued to your own account.',
        }, { status: 403 });
      }
      searchQuery = requestedEmail;
    }

    if (!searchQuery) {
      return NextResponse.json({
        success: false,
        documents: [],
        message: 'Search query (email or reference code) is required.',
      }, { status: 400 });
    }

    const limit = await checkServerRateLimit({ namespace: 'alumniLookup', subject: getClientAddress(request),
      limits: [{ name: 'minute', windowMs: 60000, maxRequests: 30 }], increment: true });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many lookup requests.' }, {
      status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
    });
    const db = getFirebaseAdminFirestore();
    if (!db) return NextResponse.json({ error: 'Document service unavailable.' }, { status: 503 });
    const isEmail = searchQuery.includes('@');
    const normalizedRef = /^(SKB|SB)/i.test(searchQuery) ? searchQuery.toUpperCase().replace(/\//g, '-') : searchQuery;

    if (isRefCode) {
      // Viewer-independent cache key: the cached value is the public projection only
      // (masked recipient email, no PDF bytes). Owner/admin-private fields are merged
      // AFTER the cache read so an authorization-dependent payload is never shared
      // between viewers (prevents cross-user disclosure via a poisoned cache entry).
      const cacheKey = `alumni:ref:${normalizedRef}:anon`;
      const cachedResult = await getOrSetCache(
        cacheKey,
        60,
        async () => {
          const results = [];
          try {
            let docSnap = await db.collection('certificates').doc(normalizedRef).get();
            if (!docSnap.exists && normalizedRef !== searchQuery.toUpperCase()) {
              try {
                docSnap = await db.collection('certificates').doc(searchQuery.toUpperCase()).get();
              } catch {}
            }
            if (docSnap && docSnap.exists) {
              const data = docSnap.data();
              results.push({
                id: docSnap.id,
                display_id: data.display_id || (data.cert_type === 'ROADMAP' ? docSnap.id : formatWorkforceDisplayId(docSnap.id)),
                category: 'CERTIFICATE',
                type: data.cert_type || 'ROADMAP',
                title: data.stream_or_track || data.roadmapTitle || 'Internship Certificate of Completion',
                recipient_name: data.name || '',
                recipient_email: maskEmail(data.email || ''),
                department: data.department || '',
                designation: data.designation || '',
                start_date: data.start_date || '',
                end_date: data.end_date || '',
                issued_at: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || '',
                is_revoked: Boolean(data.is_revoked),
                verification_url: `/certificate/${docSnap.id}`,
              });
            }
          } catch (certErr) {
            console.warn('[Alumni Cert Query Warning]:', certErr);
          }

          try {
            let docSnap = await db.collection('workforce_docs').doc(normalizedRef).get();
            if (!docSnap.exists && normalizedRef !== searchQuery.toUpperCase()) {
              try {
                docSnap = await db.collection('workforce_docs').doc(searchQuery.toUpperCase()).get();
              } catch {}
            }
            if (docSnap && docSnap.exists) {
              const data = docSnap.data();
              const meta = data.metadata_snapshot || {};
              results.push({
                id: docSnap.id,
                display_id: data.display_id || formatWorkforceDisplayId(docSnap.id),
                category: 'WORKFORCE_DOCUMENT',
                type: data.doc_type || 'OFFER_LETTER',
                title: data.title || 'Workforce Document',
                recipient_name: meta.full_name || '',
                recipient_email: maskEmail(data.dispatched_to || meta.personal_email || ''),
                department: meta.department || '',
                designation: meta.designation || '',
                start_date: meta.joining_date || '',
                end_date: meta.extended_contract_end_date || meta.contract_end_date || '',
                issued_at: data.issued_at?.toDate ? data.issued_at.toDate().toISOString() : data.issued_at || '',
                is_revoked: Boolean(data.is_revoked),
                verification_url: null,
              });
            }
          } catch (docsErr) {
            console.warn('[Alumni Docs Query Warning]:', docsErr);
          }

          results.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));
          return {
            success: true,
            query: searchQuery,
            count: results.length,
            documents: results,
          };
        },
        { tags: ['admin:certs', 'admin:workforce_docs'], swr: true }
      );

      // Merge owner/admin-private fields AFTER the cache read so they are never cached.
      let responseResult = cachedResult;
      if (Array.isArray(cachedResult?.documents) && cachedResult.documents.length > 0) {
        const documents = await Promise.all(cachedResult.documents.map(async (doc) => {
          // Clone before mutating: getOrSetCache may return a shared L1 reference.
          const isWorkforce = doc.category === 'WORKFORCE_DOCUMENT';
          const enriched = isWorkforce ? { ...doc, pdf_base64: null } : { ...doc };
          if (!token) return enriched;
          try {
            const collection = isWorkforce ? 'workforce_docs' : 'certificates';
            const fresh = await db.collection(collection).doc(doc.id).get();
            if (!fresh.exists) return enriched;
            const data = fresh.data();
            const meta = data.metadata_snapshot || {};
            const ownerEmail = isWorkforce
              ? (data.dispatched_to || meta.personal_email || '').toLowerCase()
              : (data.email || '').toLowerCase();
            const isOwnerOrAdmin = isAdmin || (userEmail && userEmail === ownerEmail);
            if (!isOwnerOrAdmin) return enriched;
            enriched.recipient_email = isWorkforce
              ? (data.dispatched_to || meta.personal_email || '')
              : (data.email || '');
            if (isWorkforce) enriched.pdf_base64 = data.pdf_base64 || null;
            return enriched;
          } catch (enrichErr) {
            console.warn('[Alumni Enrich Warning]:', enrichErr);
            return enriched;
          }
        }));
        responseResult = { ...cachedResult, documents };
      }

      return createCachedJsonResponse(request, responseResult);
    }

    const results = [];

    // 1. Query certificates collection
    try {
      let certSnap;
      if (isEmail) {
        certSnap = await db.collection('certificates').where('email', '==', searchQuery).get();
      } else if (isAdmin) {
        certSnap = await db.collection('certificates').where('employee_id', '==', searchQuery).get();
      }

      certSnap?.docs?.forEach((doc) => {
        const data = doc.data();
        const certEmail = (data.email || '').toLowerCase();
        const isOwnerOrAdmin = isAdmin || (userEmail && userEmail === certEmail);

        results.push({
          id: doc.id,
          display_id: data.display_id || (data.cert_type === 'ROADMAP' ? doc.id : formatWorkforceDisplayId(doc.id)),
          category: 'CERTIFICATE',
          type: data.cert_type || 'ROADMAP',
          title: data.stream_or_track || data.roadmapTitle || 'Internship Certificate of Completion',
          recipient_name: data.name || '',
          recipient_email: isOwnerOrAdmin ? (data.email || '') : maskEmail(data.email || ''),
          department: data.department || '',
          designation: data.designation || '',
          start_date: data.start_date || '',
          end_date: data.end_date || '',
          issued_at: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || '',
          is_revoked: Boolean(data.is_revoked),
          verification_url: `/certificate/${doc.id}`,
        });
      });
    } catch (certErr) {
      console.warn('[Alumni Cert Query Warning]:', certErr);
    }

    // 2. Query workforce_docs collection
    try {
      let docsSnap;
      if (isEmail) {
        docsSnap = await db.collection('workforce_docs').where('dispatched_to', '==', searchQuery).get();
      } else if (isAdmin) {
        docsSnap = await db.collection('workforce_docs').where('employee_id', '==', searchQuery).get();
      }

      docsSnap?.docs?.forEach((doc) => {
        const data = doc.data();
        const meta = data.metadata_snapshot || {};
        const docRecipientEmail = (data.dispatched_to || meta.personal_email || '').toLowerCase();
        const isOwnerOrAdmin = isAdmin || (userEmail && userEmail === docRecipientEmail);

        results.push({
          id: doc.id,
          display_id: data.display_id || formatWorkforceDisplayId(doc.id),
          category: 'WORKFORCE_DOCUMENT',
          type: data.doc_type || 'OFFER_LETTER',
          title: data.title || 'Workforce Document',
          recipient_name: meta.full_name || '',
          recipient_email: isOwnerOrAdmin ? (data.dispatched_to || meta.personal_email || '') : maskEmail(data.dispatched_to || meta.personal_email || ''),
          department: meta.department || '',
          designation: meta.designation || '',
          start_date: meta.joining_date || '',
          end_date: meta.extended_contract_end_date || meta.contract_end_date || '',
          issued_at: data.issued_at?.toDate ? data.issued_at.toDate().toISOString() : data.issued_at || '',
          is_revoked: Boolean(data.is_revoked),
          verification_url: null,
          pdf_base64: isOwnerOrAdmin ? (data.pdf_base64 || null) : null,
        });
      });
    } catch (docsErr) {
      console.warn('[Alumni Docs Query Warning]:', docsErr);
    }

    // Sort newest first
    results.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));

    return NextResponse.json({
      success: true,
      query: searchQuery,
      count: results.length,
      documents: results,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Alumni Documents API Error]:', error);
    return NextResponse.json({
      success: false,
      error: 'Unable to retrieve alumni records.',
    }, { status: 500 });
  }
}
