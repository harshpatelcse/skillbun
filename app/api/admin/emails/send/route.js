import { unsubscribeUrl } from '@/utils/server/emailPreferences.mjs';
import { emailHtmlToText, isEmailDocument } from '@/utils/shared/emailContent';
import { loadEmailRoadmapContext } from '@/utils/server/emailRoadmapContext';
import { loadEmailStudent } from '@/utils/server/emailStudentContext';
import { getSavedDraft } from '@/utils/server/emailDraftLibrary';
import { renderSavedEmail } from '@/utils/shared/emailDraft';
import { recommendEmail, emailCategory } from '@/utils/shared/emailRecommendation';
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { assertAccountActive } from '@/utils/server/accountLifecycle.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { generateRetentionEmailHtml, buildBaseEmailWrapper } from '@/utils/server/retentionEmails';
import {
  buildOfferDispatchEmail,
  buildActivationWelcomeEmail,
  buildExtensionDispatchEmail,
  buildTerminationDispatchEmail,
} from '@/utils/server/workforceEmailTemplates';
import { getTransporter } from '@/utils/server/zohoMailer';
import { getPasswordResetFrom } from '@/utils/server/env';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import {
  claimRecommendedEmailDispatch,
  finalizeRecommendedEmailDispatch,
  markEmailDispatchUnknown,
  releaseEmailDispatch,
  resolveEmailDispatch,
} from '@/utils/server/emailDispatchLock';

export const runtime = 'nodejs';

const ADMIN_CONFIRMATION_EMAIL = 'harsh@skillbun.tech';

const EMAIL_RATE_LIMITS = [
  { name: 'emailMinute', windowMs: 60 * 1000, maxRequests: 10, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'emailIpHour', windowMs: 60 * 60 * 1000, maxRequests: 60, getSubject: ({ address }) => `ip:${address}` },
];

export async function POST(request) {
  let activeDispatch = null;
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload must be a JSON object.' }, { status: 400 });
    }
    const targetUser = body.targetUser || {};
    const isPreview = Boolean(body.isPreview);
    const forceOverride = Boolean(body.forceOverride);
    const templateId = String(body.templateId || 'welcome_v1').trim();
    const studentName = String(body.studentName || targetUser.name || 'Student').trim();
    const recipientEmail = String(body.recipientEmail || targetUser.email || '').trim().toLowerCase();
    const roadmapTitle = String(body.roadmapTitle || targetUser.roadmapTitle || '').trim();
    const progressCount = body.progressCount ?? targetUser.completedNodesCount ?? null;
    const degree = String(body.degree || targetUser.degree || '').trim();

    // 0. Verify Admin Authorization — Bearer token required, no fallbacks
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Authentication required: Bearer token missing.' }, { status: 401 });
    }

    let authUserEmail = '';

    try {
      const adminAuth = getFirebaseAdminAuth();
      if (!adminAuth) {
        return NextResponse.json({ error: 'Server authentication configuration error.' }, { status: 500 });
      }
      const decodedToken = await adminAuth.verifyIdToken(token);
      authUserEmail = (decodedToken.email || '').toLowerCase();
      const isAdmin = await isUserAuthorizedAdmin(decodedToken);
      if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized: Admin privileges required.' }, { status: 403 });
      }

      // Rate limiting
      const address = getClientAddress(request);
      const rateLimit = await checkServerRateLimit({ namespace: 'adminEmail', subject: { uid: decodedToken.uid, address }, limits: EMAIL_RATE_LIMITS, increment: true, requireDistributed: process.env.NODE_ENV === 'production' });
      if (!rateLimit.allowed) {
        return NextResponse.json({ error: 'Too many email requests. Please wait.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) } });
      }
    } catch (authErr) {
      console.warn('[SkillBun server operation]', { code: authErr?.code || 'INTERNAL_ERROR' });
      if (authErr?.message === 'Distributed rate limiting is unavailable.') return NextResponse.json({ error: 'Email protection is temporarily unavailable.' }, { status: 503 });
      return NextResponse.json({ error: 'Invalid or expired authentication token.' }, { status: 401 });
    }

    if (body.dispatchAction === 'resolve') {
      if (!/^[A-Za-z0-9:_-]{1,128}$/.test(body.uid || '') || !['sent', 'not_sent'].includes(body.dispatchResolution)) {
        return NextResponse.json({ error: 'A valid student ID and resolution are required.' }, { status: 400 });
      }
      const db = getFirebaseAdminFirestore();
      if (!db) return NextResponse.json({ error: 'Email history storage is unavailable.' }, { status: 503 });
      const result = await resolveEmailDispatch({ db, uid: body.uid, resolution: body.dispatchResolution, adminEmail: authUserEmail });
      if (result.kind === 'in_progress') {
        return NextResponse.json({ error: 'The email dispatch is still in progress. Check again after its lock expires.' }, {
          status: 409,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) },
        });
      }
      if (result.kind === 'missing') return NextResponse.json({ error: 'No uncertain email dispatch remains for this student. Refresh their email history before continuing.' }, { status: 409 });
      if (result.kind === 'invalid') return NextResponse.json({ error: 'The saved dispatch record is incomplete. Refresh email history and contact support before retrying.' }, { status: 409 });
      return NextResponse.json({ success: true, resolution: result.kind, dispatch: result.log || null });
    }

    const customSubject = typeof body.customSubject === 'string' ? body.customSubject.trim() : '';
    const customHtml = typeof body.customHtml === 'string' ? body.customHtml.trim() : '';

    const isMarketing = !templateId.startsWith('transactional') && !templateId.startsWith('workforce');
    const isTest = body.isTest === true && recipientEmail === ADMIN_CONFIRMATION_EMAIL;
    // The workforce studio owns real records and PDF attachments; this catalog has sample letters.
    if (!isPreview && templateId.startsWith('workforce') && !isTest) {
      return NextResponse.json({ error: 'Send official workforce letters from the Workforce console. This email catalog provides previews and founder test copies only.' }, { status: 400 });
    }
    if (isEmailDocument(customHtml) && (!/<head(?:\s|>)/i.test(customHtml) || !/<body(?:\s|>)/i.test(customHtml) || !/<\/html\s*>/i.test(customHtml))) {
      return NextResponse.json({ error: 'A complete HTML email needs head, body and closing html elements. Otherwise, provide body content only.' }, { status: 400 });
    }
    let roadmapContext = await loadEmailRoadmapContext(body.roadmapSlug ?? targetUser.progress?.[0]?.slug, body.completedNodeIds ?? targetUser.progress?.[0]?.completedNodeIds);
    let recommendedStudent, recommendation, savedDraft, recommendedDb;
    if (templateId.startsWith('ai_') || body.recommendationUid) {
      const db = getFirebaseAdminFirestore();
      if (!db) return NextResponse.json({ error: 'Email library storage is unavailable.' }, { status: 503 });
      recommendedDb = db;
      if (!body.recommendationUid) return NextResponse.json({ error: 'Select a student in the CRM to send a saved AI variation.' }, { status: 400 });
      recommendedStudent = await loadEmailStudent(db, getFirebaseAdminAuth(), body.recommendationUid);
      recommendation = recommendEmail(recommendedStudent);
      if (!recommendation.eligible) return NextResponse.json({ error: recommendation.reason }, { status: 409 });
      if (!isTest && recipientEmail !== recommendedStudent.email.toLowerCase()) return NextResponse.json({ error: 'Recipient does not match the selected student.' }, { status: 400 });
      if (customHtml || customSubject) return NextResponse.json({ error: 'Use the saved variation without a custom override in the recommendation flow.' }, { status: 400 });
      if (templateId.startsWith('ai_')) savedDraft = await getSavedDraft(db, templateId);
      if ((savedDraft?.category || emailCategory(templateId)) !== recommendation.category) return NextResponse.json({ error: 'This email category no longer matches the student. Refresh the recommendation.' }, { status: 409 });
      if (!isTest && recommendedStudent.sentEmailHistory.some(log => (typeof log === 'string' ? log : log.templateId) === templateId)) return NextResponse.json({ error: 'This student has already received this variation.' }, { status: 409 });
      roadmapContext = recommendation;
    }

    // Helper to resolve email subject & html based on template or custom override
    const resolveEmailContent = (tId, data) => {
      if (recommendedStudent) data = { ...data, name: recommendedStudent.name, degree: recommendedStudent.degree, ...roadmapContext };
      if (savedDraft) return renderSavedEmail(savedDraft, data);
      if (customHtml) {
        const sub = customSubject || `SkillBun Notification for ${data.name}`;
        return {
          subject: sub,
          html: isEmailDocument(customHtml) ? customHtml : buildBaseEmailWrapper(customHtml, sub, !tId.startsWith('transactional') && !tId.startsWith('workforce'), data.email, data.preferenceUrl),
          isMarketing: !tId.startsWith('transactional') && !tId.startsWith('workforce'),
        };
      }

      if (tId === 'workforce_offer') {
        const payload = buildOfferDispatchEmail({
          employee: {
            salutation: 'Mr./Ms.',
            full_name: data.name,
            designation: 'Engineering Intern',
            department: 'Technology & Engineering',
            course_degree: data.degree,
            joining_date: new Date(),
            contract_end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            stipend_amount: 0,
            personal_email: data.email,
            work_email: `${data.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'intern'}@skillbun.tech`,
          },
          referenceId: 'SB-OFF-2026-DEMO01',
          credentials: {
            work_email: `${data.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'intern'}@skillbun.tech`,
            password: 'TempPassword#2026',
            access_notes: 'Initial Zoho Mail Enterprise Provisioning',
          },
        });
        return { ...payload, subject: customSubject || payload.subject, isMarketing: false };
      }

      if (tId === 'workforce_activation') {
        const payload = buildActivationWelcomeEmail({
          employee: {
            salutation: 'Mr./Ms.',
            full_name: data.name,
            designation: 'Software Engineering Intern',
            department: 'Core Platform Engineering',
            joining_date: new Date(),
            personal_email: data.email,
            work_email: `${data.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'intern'}@skillbun.tech`,
          },
          credentials: {
            work_email: `${data.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'intern'}@skillbun.tech`,
            password: 'TempPassword#2026',
            access_notes: 'Active Zoho Mail Enterprise Account',
          },
        });
        return { ...payload, subject: customSubject || payload.subject, isMarketing: false };
      }

      if (tId === 'workforce_extension') {
        const payload = buildExtensionDispatchEmail({
          employee: {
            salutation: 'Mr./Ms.',
            full_name: data.name,
            designation: 'Engineering Intern',
            department: 'Tech Team',
            joining_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            contract_end_date: new Date(),
            personal_email: data.email,
          },
          referenceId: 'SB-EXT-2026-DEMO01',
          newContractEndDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        });
        return { ...payload, subject: customSubject || payload.subject, isMarketing: false };
      }

      if (tId === 'workforce_termination') {
        const payload = buildTerminationDispatchEmail({
          employee: {
            salutation: 'Mr./Ms.',
            full_name: data.name,
            designation: 'Engineering Intern',
            department: 'Tech Team',
            joining_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            contract_end_date: new Date(),
            personal_email: data.email,
          },
          reasonCode: 'COMPLETED',
          reason: 'Successful completion of internship tenure and deliverables.',
          grantedCredentials: [
            'Certificate of Internship Completion (SB-INT-2026-DEMO01)',
            'Practical Training Completion Certificate (SB-TRN-2026-DEMO01)',
            'Official Letter of Recommendation (SB-LOR-2026-DEMO01)',
          ],
          effectiveDate: new Date().toISOString().slice(0, 10),
        });
        return { ...payload, subject: customSubject || payload.subject, isMarketing: false };
      }

      const res = generateRetentionEmailHtml(tId, { ...data, ...roadmapContext });
      return {
        subject: customSubject || res.subject,
        html: res.html,
        text: res.text,
        isMarketing: !templateId.startsWith('transactional_alert'),
      };
    };

    // 1. Instant HTML Preview Mode
    if (isPreview) {
      const { subject, html, text } = resolveEmailContent(templateId, {
        name: studentName,
        email: recipientEmail || ADMIN_CONFIRMATION_EMAIL,
        roadmapTitle,
        progressCount,
        degree,
      });

      const plainTextBody = text || emailHtmlToText(html);

      return NextResponse.json({
        success: true,
        isPreview: true,
        preview: {
          templateId,
          subject,
          html,
          plainTextBody,
          to: recipientEmail || ADMIN_CONFIRMATION_EMAIL,
          studentName,
        },
      });
    }

    // 2. Production Send Mode
    const targetEmail = isPreview ? ADMIN_CONFIRMATION_EMAIL : (recipientEmail || ADMIN_CONFIRMATION_EMAIL);
    if (!targetEmail || !targetEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid recipient email address is required.' }, { status: 400 });
    }

    // A force-send override never overrides a student's marketing choice.
    if (!isPreview && !isTest && isMarketing) {
      const db = getFirebaseAdminFirestore();
      if (!db) return NextResponse.json({ error: 'Email preference storage is unavailable.' }, { status: 503 });
      const unsub = await db.collection('unsubscribes').doc(targetEmail.toLowerCase()).get();
      const user = await getFirebaseAdminAuth().getUserByEmail(targetEmail.toLowerCase()).catch(() => null);
      const profile = user ? (await db.collection('users').doc(user.uid).get()).data() : null;
      if (unsub.exists || profile?.isUnsubscribed === true || profile?.marketingConsent !== true) return NextResponse.json({ error: 'The recipient has not opted in to marketing emails.', isUnsubscribed: true }, { status: 409 });
    }

    // Sign on the server once; browser/admin previews never receive signing keys.
    const preferenceUrl = isMarketing ? unsubscribeUrl(targetEmail) : '';
    // Generate HTML Email
    const { subject, html, text, from, cc, replyTo } = resolveEmailContent(templateId, {
      name: studentName,
      email: targetEmail,
      roadmapTitle,
      progressCount,
      degree,
      preferenceUrl,
    });

    const plainTextBody = text || emailHtmlToText(html);

    if (recommendedStudent && !isTest) {
      const claim = await claimRecommendedEmailDispatch({
        db: recommendedDb,
        uid: recommendedStudent.uid,
        email: targetEmail,
        templateId,
        category: savedDraft?.category || recommendation.category,
        subject,
        roadmapSlug: roadmapContext.roadmapSlug || '',
        eventKey: recommendation?.eventKey || '',
        adminEmail: authUserEmail,
        forceOverride,
      });
      if (claim.kind === 'in_progress') {
        return NextResponse.json({ error: 'Another email dispatch for this student is still in progress.', dispatchInProgress: true }, {
          status: 409,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(claim.retryAfterMs / 1000))) },
        });
      }
      if (claim.kind === 'review') {
        return NextResponse.json({ error: 'An earlier dispatch has an uncertain outcome. Review the email history before sending again.', dispatchReviewRequired: true }, { status: 409 });
      }
      if (claim.kind === 'unsubscribed') return NextResponse.json({ error: 'This student has unsubscribed from marketing emails.', isUnsubscribed: true }, { status: 409 });
      if (claim.kind === 'already_sent') return NextResponse.json({ error: 'This student has already received this variation.' }, { status: 409 });
      if (claim.kind === 'gap') return NextResponse.json({ error: 'A marketing email was sent within the last 72 hours.' }, { status: 409 });
      activeDispatch = { db: recommendedDb, uid: recommendedStudent.uid, owner: claim.owner };
    }

    const bccRecipients = targetEmail.toLowerCase() !== ADMIN_CONFIRMATION_EMAIL
      ? ADMIN_CONFIRMATION_EMAIL
      : undefined;

    let emailSent = false;
    let smtpResponse = null;
    let errorDetail = null;
    let smtpAttempted = false;
    let dispatchLog = null;

    try {
      const transporter = getTransporter();
      const fromAddress = getPasswordResetFrom() || 'SkillBun Support <noreply@skillbun.tech>';
      const unsubscribeHeaderUrl = preferenceUrl;

      smtpAttempted = true;
      smtpResponse = await transporter.sendMail({
        from: from || fromAddress,
        cc,
        replyTo: replyTo || ADMIN_CONFIRMATION_EMAIL,
        to: targetEmail,
        bcc: bccRecipients,
        subject: isTest ? `[TEST — SAMPLE ONLY] ${subject}` : subject,
        text: plainTextBody,
        html,
        headers: {
          ...(isMarketing ? { 'List-Unsubscribe': `<${unsubscribeHeaderUrl}>` } : {}),
          'X-Entity-Ref-ID': `sb-email-${Date.now()}`,
        },
      });

      const normalizeAddress = value => (typeof value === 'string' ? value : value?.address || '').trim().toLowerCase();
      const acceptedRecipients = Array.isArray(smtpResponse?.accepted) ? smtpResponse.accepted.map(normalizeAddress) : null;
      const rejectedRecipients = Array.isArray(smtpResponse?.rejected) ? smtpResponse.rejected.map(normalizeAddress) : [];
      if (rejectedRecipients.includes(targetEmail.toLowerCase()) || (acceptedRecipients && !acceptedRecipients.includes(targetEmail.toLowerCase()))) {
        const rejection = new Error('The SMTP server did not accept the recipient address.');
        rejection.definitiveRecipientRejection = true;
        throw rejection;
      }

      emailSent = true;
    } catch (sendErr) {
      errorDetail = 'SMTP delivery could not be confirmed.';
      console.warn('[SkillBun server operation]', { code: sendErr?.code || 'INTERNAL_ERROR' });
      if (activeDispatch) {
        try {
          if (sendErr.definitiveRecipientRejection) {
            await releaseEmailDispatch(activeDispatch);
            activeDispatch = null;
          } else if (smtpAttempted) {
            await markEmailDispatchUnknown({ db: activeDispatch.db, uid: activeDispatch.uid, owner: activeDispatch.owner, reason: errorDetail });
          } else {
            await releaseEmailDispatch(activeDispatch);
            activeDispatch = null;
          }
        } catch (lockErr) {
          console.warn('[SkillBun server operation]', { code: lockErr?.code || 'INTERNAL_ERROR' });
        }
      }
    }

    if (emailSent) {
      if (activeDispatch) {
        try {
          dispatchLog = await finalizeRecommendedEmailDispatch({ db: activeDispatch.db, uid: activeDispatch.uid, owner: activeDispatch.owner, messageId: smtpResponse?.messageId || null });
          activeDispatch = null;
        } catch (logErr) {
          console.warn('[SkillBun server operation]', { code: logErr?.code || 'INTERNAL_ERROR' });
          try {
            await markEmailDispatchUnknown({
              db: activeDispatch.db,
              uid: activeDispatch.uid,
              owner: activeDispatch.owner,
              reason: 'SMTP accepted the email, but its sent history could not be confirmed.',
              smtpAcceptedAt: new Date().toISOString(),
            });
          } catch (lockErr) {
            console.warn('[SkillBun server operation]', { code: lockErr?.code || 'INTERNAL_ERROR' });
          }
          return NextResponse.json({
            success: false,
            error: 'SMTP accepted the email, but its sent history could not be confirmed. Review before retrying.',
            deliveryUncertain: true,
            dispatchReviewRequired: true,
          }, { status: 503 });
        }
      } else {
        // Keep legacy, non-recommendation sends on their existing history path.
        try {
          const db = getFirebaseAdminFirestore();
          if (db) {
            const usersSnap = await db.collection('users').where('email', '==', targetEmail.toLowerCase()).get();
            const userRef = usersSnap?.docs[0]?.ref;
            if (userRef) {
              const newLog = {
                templateId,
                subject,
                messageId: smtpResponse?.messageId || null,
                category: emailCategory(templateId),
                roadmapSlug: roadmapContext.roadmapSlug || '',
                eventKey: '',
                isTest,
                sentAt: new Date().toISOString(),
                adminEmail: authUserEmail || 'harsh@skillbun.tech',
                forceOverride: Boolean(forceOverride),
              };
              await db.runTransaction(async tx => {
                await assertAccountActive(db, userRef.id, tx);
                const snapshot = await tx.get(userRef);
                if (!snapshot.exists) return;
                const existingLogs = Array.isArray(snapshot.data()?.sentEmailHistory) ? snapshot.data().sentEmailHistory : [];
                tx.set(userRef, { sentEmailHistory: [...existingLogs, newLog] }, { merge: true });
              });
            }
          }
        } catch (logErr) {
          console.warn('[SkillBun server operation]', { code: logErr?.code || 'INTERNAL_ERROR' });
        }
      }

      return NextResponse.json({
        success: true,
        message: `✅ Retention email successfully sent to ${targetEmail}${forceOverride ? ' (FORCE OVERRIDDEN)' : ''}!`,
        messageId: smtpResponse?.messageId || null,
        sentTemplateId: templateId,
        bcc: bccRecipients || null,
        ...(dispatchLog ? { dispatch: dispatchLog } : {}),
      });
    } else {
      return NextResponse.json({
        error: `Zoho SMTP Dispatch Error: ${errorDetail || 'Could not connect to Zoho SMTP server.'}`,
        ...(activeDispatch ? { deliveryUncertain: true, dispatchReviewRequired: true } : { retryable: true }),
      }, { status: 200 });
    }
  } catch (err) {
    if (activeDispatch) {
      try {
        await markEmailDispatchUnknown({
          db: activeDispatch.db,
          uid: activeDispatch.uid,
          owner: activeDispatch.owner,
          reason: 'The send request ended unexpectedly after reserving this recipient.',
        });
      } catch (lockErr) {
        console.warn('[SkillBun server operation]', { code: lockErr?.code || 'INTERNAL_ERROR' });
      }
    }
    console.error('[SkillBun server operation]', { code: err?.code || 'INTERNAL_ERROR' });
    return NextResponse.json({
      success: false,
      error: 'Internal server error dispatching email.',
    }, { status: 500 });
  }
}
