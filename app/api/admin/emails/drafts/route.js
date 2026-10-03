import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { draftCollection, createSavedDraft, findUnsentDraft, getSavedDraft } from '@/utils/server/emailDraftLibrary';
import { loadEmailStudent } from '@/utils/server/emailStudentContext';
import { recommendEmail } from '@/utils/shared/emailRecommendation';
import { renderSavedEmail } from '@/utils/shared/emailDraft';
import { generateRetentionEmailHtml } from '@/utils/server/retentionEmails';

export const runtime = 'nodejs';
export const maxDuration = 60;
const limits = [{ name: 'draftMinute', windowMs: 60000, maxRequests: 3, getSubject: ({ uid }) => uid }, { name: 'draftHour', windowMs: 3600000, maxRequests: 20, getSubject: () => 'all-admins' }];
export async function GET(request) {
  const admin = await requireWorkforceAdmin(request);
  if (admin.response) return admin.response;
  try {
    const db = getFirebaseAdminFirestore();
    if (!db) return NextResponse.json({ error: 'Email library storage is unavailable.' }, { status: 503 });
    const params = new URL(request.url).searchParams;
    const category = params.get('category') || 'welcome';
    const prefix = (params.get('search') || '').trim().toLowerCase().slice(0, 80);
    const collection = draftCollection(db, category);
    let query = collection.orderBy('nameKey').limit(31);
    if (prefix) query = query.startAt(prefix).endAt(prefix + '\uf8ff');
    const cursor = params.get('cursor');
    if (cursor) {
      if (!/^[a-f0-9]{32}$/.test(cursor)) throw new Error('Invalid page cursor.');
      const doc = await collection.doc(cursor).get();
      if (!doc.exists) throw new Error('Page cursor not found.');
      query = query.startAfter(doc);
    }
    const snap = await query.get();
    return NextResponse.json({ drafts: snap.docs.slice(0, 30).map(doc => doc.data()), nextCursor: snap.size > 30 ? snap.docs[29].id : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load this library page.' }, { status: 400 }); }
}
export async function POST(request) {
  const admin = await requireWorkforceAdmin(request);
  if (admin.response) return admin.response;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return NextResponse.json({ error: 'Request is too large.' }, { status: 400 });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const db = getFirebaseAdminFirestore();
    if (!db) return NextResponse.json({ error: 'Email library storage is unavailable.' }, { status: 503 });
    let student, recommendation;
    if (body.uid) {
      student = await loadEmailStudent(db, getFirebaseAdminAuth(), body.uid);
      recommendation = recommendEmail(student);
      if (!recommendation.eligible) return NextResponse.json({ error: recommendation.reason, recommendation }, { status: 409 });
    }
    const category = recommendation?.category || body.category;
    draftCollection(db, category); // Validate before consuming generation quota.
    let draft;
    if (body.draftId) {
      draft = await getSavedDraft(db, body.draftId);
      if (draft.category !== category) return NextResponse.json({ error: 'This variation does not match the current recommendation.' }, { status: 409 });
    } else if (body.action !== 'generate' && recommendation?.id) {
      return NextResponse.json({ recommendation, templateId: recommendation.id, preview: generateRetentionEmailHtml(recommendation.id, { ...student, ...recommendation }) });
    } else {
      if (body.action !== 'generate') draft = await findUnsentDraft(db, category, student?.sentEmailHistory);
      if (!draft) {
        const rate = await checkServerRateLimit({ namespace: 'emailDrafts', subject: { uid: admin.uid }, limits, increment: true });
        if (!rate.allowed) return NextResponse.json(
          { error: 'Draft generation limit reached. Use a saved variation or try later.' },
          { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))) } },
        );
        draft = await createSavedDraft(db, category, admin.uid);
      }
    }
    if (!body.draftId && student?.sentEmailHistory.some(log => (typeof log === 'string' ? log : log.templateId) === draft.id)) return NextResponse.json({ error: 'The AI repeated an existing variation. Create another variation from the library.' }, { status: 409 });
    return NextResponse.json({ draft, recommendation, templateId: draft.id, preview: renderSavedEmail(draft, { ...student, ...recommendation }) });
  } catch (error) {
    const safe = /^(Configure the existing|AI drafting|A variation|Please choose|Invalid student)/.test(error.message);
    return NextResponse.json({ error: safe ? error.message : 'Could not prepare and save this draft. Please try again.' }, { status: 503 });
  }
}
