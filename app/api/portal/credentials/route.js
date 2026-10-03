import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { decryptCredentials } from '@/utils/server/workforceCrypto';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';

export const dynamic = 'force-dynamic';

function serializeDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function serializeCertificate(id, data) {
  return {
    id,
    cert_type: data.cert_type || 'ROADMAP',
    stream_or_track: data.stream_or_track || data.roadmapTitle || '',
    created_at: serializeDate(data.createdAt),
    is_revoked: Boolean(data.is_revoked),
  };
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return NextResponse.json({ error: 'Missing or malformed Authorization header.' }, { status: 401 });
    }

    let decodedToken;
    try {
      const auth = getFirebaseAdminAuth();
      decodedToken = await auth.verifyIdToken(token);
    } catch (authErr) {
      console.error('[SkillBun server operation]', { code: authErr?.code || 'INTERNAL_ERROR' });
      return NextResponse.json({ error: 'Invalid or expired authentication token.' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const revealCredentials = new URL(request.url).searchParams.get('reveal') === 'true';
    const userEmail = (decodedToken.email || '').toLowerCase().trim();

    if (!userEmail) {
      return NextResponse.json({ error: 'Authenticated user has no verified email address.' }, { status: 400 });
    }

    // Rate limiting: 10 requests per minute per user
    const rateLimit = await checkServerRateLimit({
      namespace: 'portal_creds',
      subject: uid,
      limits: [
        { name: 'userMinute', windowMs: 60 * 1000, maxRequests: 10 },
      ],
    });

    if (rateLimit && !rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many credential reveal requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const db = getFirebaseAdminFirestore();
    const snapshot = await db
      .collection('employees')
      .where('personal_email', '==', userEmail)
      .where('status', 'in', ['OFFER_SENT', 'ACTIVE', 'EXTENDED', 'COMPLETED'])
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: 'No active employee workspace found for your account.' },
        { status: 404 }
      );
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    if (data.portal_access_revoked === true) return NextResponse.json({ error: 'Workspace access has been revoked.' }, { status: 403 });

    let decrypted = {
      work_email: '',
      password: '',
      access_notes: '',
    };

    if (revealCredentials && data.encrypted_credentials) {
      try {
        decrypted = decryptCredentials(data.encrypted_credentials);
      } catch (cryptoErr) {
        console.error('[Portal credential decryption failed]', { code: 'CREDENTIAL_DECRYPTION_FAILED' });
        return NextResponse.json(
          { error: 'Failed to decrypt workspace credentials on server.' },
          { status: 500 }
        );
      }
    }

    const certificatesSnapshot = await db.collection('certificates')
      .where('employee_id', '==', doc.id)
      .get();

    const certificates = certificatesSnapshot.docs
      .map((certificateDoc) => serializeCertificate(certificateDoc.id, certificateDoc.data()))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return NextResponse.json({
      success: true,
      credentials: {
        work_email: decrypted.work_email || data.work_email || '',
        password: revealCredentials ? decrypted.password || '' : '',
        access_notes: revealCredentials ? decrypted.access_notes || '' : '',
      },
      certificates,
      employee: {
        id: doc.id,
        full_name: data.full_name,
        salutation: data.salutation || 'Mr.',
        designation: data.designation,
        department: data.department,
        status: data.status,
        joining_date: serializeDate(data.joining_date),
        contract_end_date: serializeDate(data.contract_end_date),
        stipend_amount: data.stipend_amount,
        personal_email: data.personal_email,
      },
    });
  } catch (err) {
    console.error('[SkillBun server operation]', { code: err?.code || 'INTERNAL_ERROR' });
    return NextResponse.json(
      { error: 'Internal server error while accessing workspace credentials.' },
      { status: 500 }
    );
  }
}
