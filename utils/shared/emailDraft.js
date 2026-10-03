import { buildEmail, emailText, emailButton, emailLearningGraphic, emailSectionLabel, emailStepRail, emailNote, escapeHtml } from '../server/emailTheme.js';
import { emailHtmlToText } from './emailContent.js';
import { EMAIL_CATEGORIES } from './emailRecommendation.js';
import { normalizeEmailRoadmapSlug } from './emailRoadmap.js';
import { EMAIL_DRAFT_VISUALS } from './emailDraftStandard.js';

export function validateEmailDraft(input, { requireQuality = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid email draft.');
  const limits = requireQuality
    ? { name: 80, subject: 80, headline: 90, intro: 240, ctaLabel: 40 }
    : { name: 80, subject: 140, headline: 160, intro: 450, ctaLabel: 60 };
  const output = {};
  const clean = (value, max) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\x00-\x1f\x7f]|https?:|www\.|[\w.+-]+@[\w.-]+|[{}]/i.test(value.replace(/\{\{(?:name|roadmapTitle)\}\}/g, ''))) throw new Error('Draft must contain plain text and supported placeholders only.');
    return value.trim();
  };
  for (const [key, max] of Object.entries(limits)) output[key] = clean(input[key], max);
  if (!Array.isArray(input.paragraphs) || input.paragraphs.length < 1 || input.paragraphs.length > (requireQuality ? 2 : 4)) throw new Error('Draft needs one to four paragraphs, or one to two for new AI variations.');
  output.paragraphs = input.paragraphs.map(p => clean(p, requireQuality ? 260 : 650));
  if (requireQuality || input.focus !== undefined || input.steps !== undefined) {
    if (!input.focus || typeof input.focus !== 'object' || Array.isArray(input.focus)) throw new Error('Draft needs a visual focus.');
    output.focus = { title: clean(input.focus.title, 70), detail: clean(input.focus.detail, 160) };
    if (!Array.isArray(input.steps) || input.steps.length !== 3) throw new Error('Draft needs exactly three practical steps.');
    output.steps = input.steps.map(step => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error('Invalid draft step.');
      return { title: clean(step.title, 60), body: clean(step.body, 180) };
    });
  }
  const text = JSON.stringify(output);
  if (/guarantee|unlimited.{0,20}retake|recruiter.{0,25}(queue|priority)|top\s*\d+\s*%|password|voucher|₹|\$\d/i.test(text)) throw new Error('Draft contains unsupported promotional or account claims.');
  if (requireQuality) {
    const actions = /^(add|answer|ask|build|check|choose|close|compare|complete|describe|explain|explore|find|identify|list|note|open|pick|practi[cs]e|read|reflect|review|revisit|select|sign in|solve|start|take|test|try|use|work|write)\b/i;
    const generic = /\b(unlock your potential|keep advancing|continue your learning journey|your next learning step|take the next step|reach new heights)\b/i;
    const same = values => new Set(values.map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''))).size !== values.length;
    if (output.steps.some(step => !actions.test(step.title) || step.body.length < 30) || same(output.steps.map(step => step.title)) || same(output.steps.map(step => step.body))) throw new Error('Draft steps must be distinct, concrete actions with useful guidance.');
    if (generic.test(output.headline) || generic.test(output.focus.title) || /^(click here|learn more|get started|continue|start now|let.?s go)[.!]?$/i.test(output.ctaLabel)) throw new Error('Draft needs a specific headline and action label.');
    if (/\d\s*%|\b\d+\s*(minutes?|hours?|days?|weeks?|months?|years?|points?|scores?)\b|\b(guaranteed|limited time|last chance|act now)\b/i.test(text)) throw new Error('AI copy must not invent metrics, timing or urgency.');
  }
  return output;
}
export function renderSavedEmail(draft, data = {}) {
  if (!Object.hasOwn(EMAIL_CATEGORIES, draft.category)) throw new Error('Invalid email category.');
  const content = validateEmailDraft(draft.content, { requireQuality: draft.schemaVersion >= 2 });
  const fill = text => text.replace(/\{\{(name|roadmapTitle)\}\}/g, (_, key) => String(data[key] || (key === 'name' ? 'Student' : 'your chosen track')));
  const htmlText = text => escapeHtml(fill(text));
  const slug = normalizeEmailRoadmapSlug(data.roadmapSlug);
  const path = draft.category === 'welcome' ? '/onboarding?next=/quiz' : slug ? `/roadmap/${slug}${draft.category === 'exam_nudge' ? '/certify' : ''}` : '/roadmap';
  const subject = fill(content.subject).replace(/[\r\n]/g, ' ').slice(0, 200);
  const visual = EMAIL_DRAFT_VISUALS[draft.category];
  const focus = content.focus || visual.focus;
  const steps = content.steps || visual.steps;
  const contentHtml = emailLearningGraphic({
    label: visual.label,
    title: htmlText(focus.title),
    detail: htmlText(focus.detail),
    nodes: visual.nodes,
  })
    + emailButton({ href: `https://skillbun.tech${path}`, label: htmlText(!slug && draft.category !== 'welcome' ? 'Find your roadmap' : content.ctaLabel) })
    + content.paragraphs.map(p => emailText(htmlText(p))).join('')
    + emailSectionLabel('Put it into practice')
    + emailStepRail(steps.map(step => ({ title: htmlText(step.title), body: htmlText(step.body) })))
    + emailNote(htmlText(visual.note));
  const html = buildEmail({ title: subject, headline: htmlText(content.headline), lede: htmlText(content.intro), eyebrow: EMAIL_CATEGORIES[draft.category], docTag: 'LEARNING UPDATE', contentHtml, isMarketing: true, preferenceUrl: data.preferenceUrl || '' });
  return { subject, html, text: emailHtmlToText(html), isMarketing: true };
}
