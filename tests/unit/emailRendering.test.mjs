import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { emailSamples } from '../fixtures/emailSamples.mjs';
import { generateRetentionEmailHtml } from '../../utils/server/retentionEmails.js';
import { buildEmail, escapeHtml as escapeEmailHtml, TOKENS, WORDMARK } from '../../utils/server/emailTheme.js';
import { decodeEmailEntities, emailHtmlToText, isEmailDocument, prepareEmailPreview } from '../../utils/shared/emailContent.js';
import { emailRoadmapContext, normalizeEmailRoadmapSlug } from '../../utils/shared/emailRoadmap.js';
import { loadEmailRoadmapContext } from '../../utils/server/emailRoadmapContext.js';
import { unsubscribeUrl, verifyUnsubscribeToken } from '../../utils/server/emailPreferences.mjs';

test('the mailer escapeHtml export escapes untrusted text like the shared email theme', async () => {
  const source = await fs.readFile(new URL('../../utils/server/zohoMailer.js', import.meta.url), 'utf8');
  const helper = source.match(/export function escapeHtml\(value\)\s*\{[\s\S]*?\r?\n\}/)?.[0];
  assert.ok(helper);
  const escapeHtml = new Function('escapeEmailHtml', `${helper.replace('export ', '')}; return escapeHtml;`)(escapeEmailHtml);
  assert.equal(escapeHtml('<img src=x> & "name"'), '&lt;img src=x&gt; &amp; &quot;name&quot;');
});

test('all 24 templates retain branding, theme rules, usable links and complete text', async () => {
  const samples = await emailSamples();
  assert.equal(Object.keys(samples).length, 24);
  for (const [id, email] of Object.entries(samples)) {
    assert.ok(email.html.includes(WORDMARK), id);
    assert.match(email.html, /prefers-color-scheme: dark/, id);
    assert.match(email.html, /\[data-ogsc\]/, id);
    assert.match(email.html, /\[data-ogsb\]/, id);
    assert.ok(email.text.length > 150, id);
    assert.doesNotMatch(email.text, /<table|font-family:|&amp; Engineering/, id);
    assert.ok(Buffer.byteLength(email.html) < 90000, `${id}: avoid clipping-sized output`);
    for (const [, href] of email.html.matchAll(/href="([^"]+)"/g)) assert.match(href, /^(https:\/\/|mailto:)/, `${id}: ${href}`);
    const lede = email.html.match(/<p class="sb-muted sb-lede"[^>]*>/)?.[0];
    assert.match(lede, /font-family:/, id);
  }
});

test('signup verification mail preserves the six-digit code, expiry and transactional delivery rules', async () => {
  const { signup_verification: email } = await emailSamples();
  assert.equal(email.from, 'SkillBun <noreply@skillbun.tech>');
  assert.equal(email.replyTo, 'harsh@skillbun.tech');
  assert.equal(email.to, 'sample@example.com');
  assert.equal(email.subject, 'Verify your SkillBun email');
  assert.match(email.html, /004271/);
  assert.match(email.text, /verification code is 004271\./);
  assert.match(email.html, /expires in 10 minutes/);
  assert.match(email.text, /within 10 minutes/);
  for (const content of [email.html, email.text]) {
    assert.match(content, /Only the most recent code works/);
    assert.match(content, /Never share/);
    assert.match(content, /No account will be created and no password will change without verification/);
    assert.doesNotMatch(content, /unsubscribe|reset-password\?oobCode|SAMPLE-ONLY-NOT-A-CREDENTIAL/i);
  }
  assert.equal(email.headers?.['List-Unsubscribe'], undefined);
  assert.equal(email.headers?.['List-Unsubscribe-Post'], undefined);
});

test('zero, complete, unknown and invalid progress never turn into example data', () => {
  const zero = generateRetentionEmailHtml('reengagement_v2', { progressCount: 0, totalTopics: 40 });
  assert.match(zero.text, /0%/); assert.match(zero.text, /0 topics/); assert.doesNotMatch(zero.text, /12 topics/);
  const complete = generateRetentionEmailHtml('reengagement_v2', { progressCount: 40, totalTopics: 40 });
  assert.match(complete.text, /100%/);
  for (const data of [{}, { progressCount: 0 }, { progressCount: -1, totalTopics: 40 }, { progressCount: '<img src=x>', totalTopics: 40 }, { progressCount: NaN, totalTopics: 40 }]) {
    const email = generateRetentionEmailHtml('reengagement_v1', data);
    assert.doesNotMatch(email.text, /NaN|null|undefined|Full Stack|12 topics|\d+\/24/);
    assert.match(email.text, /latest progress/);
    assert.doesNotMatch(email.html, /<img src=x>/);
  }
});

test('account text is escaped exactly once, while names and links remain safe', () => {
  const email = generateRetentionEmailHtml('transactional_alert_v3', { degree: 'Computer Science & Engineering', email: "o'connor&test@example.com", name: '<script>alert(1)</script>' });
  assert.match(email.html, /Computer Science &amp; Engineering/);
  assert.doesNotMatch(email.html, /&amp;amp;|<script>/);
  assert.match(email.text, /Computer Science & Engineering/);
  assert.equal(decodeEmailEntities('&amp;lt;'), '&lt;');
  assert.equal(emailHtmlToText('<p>&lt;b&gt;literal&lt;/b&gt; &amp; &#8377;0</p>'), '<b>literal</b> & ₹0');
});

test('deep links and attempt wording match the certification contract', () => {
  for (const id of ['exam_nudge_v1', 'exam_nudge_v2', 'exam_failed_v1', 'exam_failed_v3']) {
    const email = generateRetentionEmailHtml(id, { roadmapSlug: 'fullstack', progressCount: 0, totalTopics: 40 });
    assert.match(email.html, /https:\/\/skillbun.tech\/roadmap\/fullstack\/certify/);
    assert.match(email.text, /1.hour/i);
    assert.doesNotMatch(email.text, /adaptive questions|Free retakes \/ day|whenever you're ready/);
  }
  const unknown = generateRetentionEmailHtml('exam_nudge_v1', {});
  assert.match(unknown.text, /Find your roadmap/);
  assert.doesNotMatch(unknown.text, /exam is now available/);
  assert.equal(normalizeEmailRoadmapSlug('../.env'), '');
});

test('legacy and declared-tree progress count only valid completed nodes', async () => {
  assert.deepEqual(emailRoadmapContext({ format: 'tree', tree: [{ id: 'group', countInProgress: false, children: [{ id: 'a' }, { id: 'b' }] }] }, ['a', 'a', 'fake']), { totalTopics: 2, progressCount: 1 });
  assert.deepEqual(emailRoadmapContext({ id: 'legacy', stages: [{ topics: [{ id: 'a' }], project: { title: 'Build' } }] }, ['legacy_stage_1_project']), { totalTopics: 2, progressCount: 1 });
  const context = await loadEmailRoadmapContext('fullstack', []);
  assert.ok(context.totalTopics > 0); assert.equal(context.progressCount, 0);
  assert.deepEqual(await loadEmailRoadmapContext('../.env'), { roadmapSlug: '', totalTopics: null });
});

test('preview themes, missing styles and blocked images never mutate outgoing HTML', () => {
  const html = buildEmail({ title: 'Test', headline: 'Test', lede: 'Intro', contentHtml: '<p>Body</p>' });
  const light = prepareEmailPreview(html, { theme: 'light' });
  const dark = prepareEmailPreview(html, { theme: 'dark' });
  assert.match(light, /@media not all/); assert.match(dark, /@media all/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.doesNotMatch(prepareEmailPreview(html, { stripStyles: true }), /@media|fonts.googleapis.com/);
  assert.doesNotMatch(prepareEmailPreview(html, { blockImages: true }), /<img[^>]*src=/);
  assert.ok(isEmailDocument('<!DOCTYPE HTML><HTML lang="en"><HEAD></HEAD><BODY></BODY></HTML>'));
});

test('recipientless previews avoid signing tokens while real marketing links remain mailbox-bound', () => {
  for (const email of ['', undefined, 'not-an-email']) assert.equal(unsubscribeUrl(email), 'https://skillbun.tech/settings');
  const link = new URL(unsubscribeUrl(' Sample@Example.com '));
  assert.equal(link.searchParams.get('email'), 'sample@example.com');
  assert.equal(verifyUnsubscribeToken(link.searchParams.get('token'), 'sample@example.com'), true);
  assert.equal(verifyUnsubscribeToken(link.searchParams.get('token'), 'other@example.com'), false);
});

test('transactional mail does not depend on the marketing preference signing key', () => {
  const original = { NODE_ENV: process.env.NODE_ENV, EMAIL_PREFERENCE_SECRET: process.env.EMAIL_PREFERENCE_SECRET, HUMAN_PROOF_SECRET: process.env.HUMAN_PROOF_SECRET };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_PREFERENCE_SECRET;
    delete process.env.HUMAN_PROOF_SECRET;
    assert.doesNotThrow(() => buildEmail({ title: 'Verify your email', headline: 'Verify your email', contentHtml: '<p>Verification code</p>', email: 'sample@example.com', isMarketing: false }));
    assert.doesNotThrow(() => buildEmail({ title: 'Keep learning', headline: 'Keep learning', contentHtml: '<p>Preview only</p>', isMarketing: true }));
    assert.throws(() => unsubscribeUrl('sample@example.com'), /signing is not configured/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('faint informational text passes normal-text contrast in both themes', () => {
  const luminance = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const palette of Object.values(TOKENS)) {
    for (const bg of [palette.pageBg, palette.surfaceRaised]) {
      const [high, low] = [luminance(palette.faint), luminance(bg)].sort((a, b) => b - a);
      assert.ok((high + 0.05) / (low + 0.05) >= 4.5);
    }
  }
});

test('long roadmap titles and large totals keep email size bounded', () => {
  const email = generateRetentionEmailHtml('reengagement_v1', { name: 'A'.repeat(150), roadmapTitle: 'Distributed Systems '.repeat(15), progressCount: 1000, totalTopics: 2000 });
  assert.ok(Buffer.byteLength(email.html) < 90000);
  assert.match(email.text, /50%/);
});

test('admin send uses actual text, preserves zero, keeps auth and rejects workforce demo dispatch', async () => {
  let source = await fs.readFile(new URL('../../app/api/admin/emails/send/route.js', import.meta.url), 'utf8');
  source = source.replace(/import[\s\S]*?from\s*['"][^'"]+['"];\s*/g, '').replace(/export const runtime = 'nodejs';/, '').replace('export async function POST', 'async function POST');
  const sent = [];
  let marketingConsent = true;
  const db = { collection: name => ({
    doc: id => ({ get: async () => ({ exists: name === 'users' && id === 'student', data: () => ({ marketingConsent }) }) }),
    where: () => ({ get: async () => ({ docs: [] }) }),
  }) };
  const names = ['NextResponse', 'getFirebaseAdminAuth', 'getFirebaseAdminFirestore', 'isUserAuthorizedAdmin', 'checkServerRateLimit', 'getClientAddress', 'loadEmailRoadmapContext', 'generateRetentionEmailHtml', 'emailHtmlToText', 'isEmailDocument', 'getTransporter', 'getPasswordResetFrom', 'unsubscribeUrl'];
  const values = [{ json: Response.json }, () => ({ verifyIdToken: async () => ({ uid: 'admin', email: 'admin@example.com' }), getUserByEmail: async () => ({ uid: 'student' }) }), () => db, async () => true, async () => ({ allowed: true }), () => '127.0.0.1', loadEmailRoadmapContext, generateRetentionEmailHtml, emailHtmlToText, isEmailDocument, () => ({ sendMail: async mail => { sent.push(mail); return { messageId: 'sample' }; } }), () => 'SkillBun <noreply@skillbun.tech>', unsubscribeUrl];
  const post = new Function(...names, source + '; return POST;')(...values);
  const request = (body, auth = true) => new Request('http://localhost/api/admin/emails/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: 'Bearer synthetic' } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post(request({}, false))).status, 401);
  assert.equal((await post(request({ templateId: 'workforce_offer', recipientEmail: 'sample@example.com', customHtml: '<p>Sample offer</p>' }))).status, 400);
  assert.equal(sent.length, 0);
  const sentResponse = await post(request({ templateId: 'reengagement_v2', recipientEmail: 'sample@example.com', roadmapSlug: 'fullstack', progressCount: 0 }));
  assert.equal((await sentResponse.json()).success, true);
  assert.equal(sent.length, 1); assert.match(sent[0].text, /0 topics/); assert.match(sent[0].text, /\/roadmap\/fullstack/);
  assert.equal(sent[0].replyTo, 'harsh@skillbun.tech');
  assert.equal(sent[0].headers['List-Unsubscribe-Post'], undefined);
  const preferenceLink = sent[0].headers['List-Unsubscribe'].slice(1, -1);
  const preference = new URL(preferenceLink);
  assert.equal(verifyUnsubscribeToken(preference.searchParams.get('token'), 'sample@example.com'), true);
  assert.ok(sent[0].html.includes(preferenceLink.replaceAll('&', '&amp;')));
  assert.ok(sent[0].text.includes(preferenceLink), 'mail text and HTML must use the same signed recipient link as the header');
  marketingConsent = false;
  assert.equal((await post(request({ templateId: 'reengagement_v2', recipientEmail: 'sample@example.com', forceOverride: true }))).status, 409);
  assert.equal(sent.length, 1, 'a force override cannot send without affirmative marketing consent');
  await post(request({ templateId: 'transactional_alert_v1', recipientEmail: 'sample@example.com' }));
  assert.match(sent[1].text, /change your password/);
  assert.equal(sent[1].headers['List-Unsubscribe'], undefined);
});
