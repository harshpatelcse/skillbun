/**
 * SkillBun Retention Email Renderer
 *
 * Bridges the template catalogue to the email design system: escapes dynamic
 * data once, then hands the hero fields and composed body to buildEmail().
 */

import { RETENTION_TEMPLATES, renderTemplateContent } from './retentionTemplates.js';
import { buildEmail, buildBaseEmailWrapper, escapeHtml } from './emailTheme.js';
import { emailHtmlToText } from '../shared/emailContent.js';
import { normalizeEmailRoadmapSlug } from '../shared/emailRoadmap.js';

export { RETENTION_TEMPLATES, buildBaseEmailWrapper, escapeHtml };

/**
 * Exact inverse of escapeHtml, for the one field that is not HTML.
 *
 * Templates compose the subject from the same pre-escaped values they use in the
 * body, but a Subject header is plain text — an inbox shows the entity verbatim,
 * so "AI &amp; Machine Learning" is what the student would read. `&amp;` is
 * decoded last so an escaped entity in the source ("&amp;lt;") unwinds one level
 * only, not two.
 */
function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

const ROADMAP_TITLE_FALLBACK = 'chosen track';

/*
 * Values that are legitimate answers elsewhere in the product but are not the
 * name of a track. The analytics console falls back to the student's onboarding
 * interest when they have no roadmap progress yet, and "Not sure yet – help me
 * explore!" is one of the options that form offers — which is how a live subject
 * line came to read "you're Not sure yet – help me explore! certified".
 */
const NOT_A_TRACK = /^(n\/?a|none|null|undefined|unknown|other|not sure\b[\s\S]*|[-–—.]+)$/i;

/* Tokens that must not be sentence-cased when a shouted title is repaired. */
const ACRONYMS = new Map(
  [
    'AI', 'ML', 'UI', 'UX', 'API', 'AR', 'VR', 'SRE', 'NLP', 'QA', 'IT', 'CS',
    'SQL', 'AWS', 'GCP', 'SOC', 'CI', 'CD', 'PHP', 'CSS', 'HTML', 'JS', 'TS',
    'AI/ML',
  ].map((token) => [token, token])
);
ACRONYMS.set('IOT', 'IoT');
ACRONYMS.set('IOS', 'iOS');
ACRONYMS.set('DEVOPS', 'DevOps');
ACRONYMS.set('MLOPS', 'MLOps');
ACRONYMS.set('SAAS', 'SaaS');

/**
 * Make a track name safe to drop into a sentence.
 *
 * Callers reach this with three shapes: a real title ("Full Stack Web
 * Development"), a roadmap slug, or a shouted slug — the analytics console
 * upper-cases what it reads from progress, which put "FULL STACK WEB
 * DEVELOPMENT" mid-sentence. A title that already has mixed case is returned
 * untouched, so "UI/UX Design" survives intact.
 */
function normalizeRoadmapTitle(value) {
  const raw = String(value ?? '').trim();
  if (!raw || NOT_A_TRACK.test(raw)) return ROADMAP_TITLE_FALLBACK;

  // Underscores are always separators; hyphens only when there is no space at
  // all, so a genuine "Full-Stack Developer" keeps its hyphen.
  const isSlug = !/\s/.test(raw) && /[_-]/.test(raw);
  const spaced = (isSlug ? raw.replace(/[_-]+/g, ' ') : raw.replace(/_+/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced || NOT_A_TRACK.test(spaced)) return ROADMAP_TITLE_FALLBACK;

  const isShouted = spaced === spaced.toUpperCase() && /[A-Z]{2,}/.test(spaced);
  if (!isShouted && !isSlug) return spaced;

  return spaced.replace(/[A-Za-z][A-Za-z']*/g, (word) => {
    const upper = word.toUpperCase();
    if (ACRONYMS.has(upper)) return ACRONYMS.get(upper);
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function generateRetentionEmailHtml(templateId, data = {}) {
  const name = escapeHtml(data.name || 'Student');
  // These two fields are only consumed by helpers that escape raw text themselves.
  const email = String(data.email || '');
  const roadmapTitle = escapeHtml(normalizeRoadmapTitle(data.roadmapTitle));
  const count = data.progressCount;
  const total = data.totalTopics;
  const totalTopics = total !== null && total !== undefined && total !== '' && Number.isSafeInteger(Number(total)) && Number(total) > 0 ? Number(total) : null;
  const progressCount = count !== null && count !== undefined && count !== '' && Number.isSafeInteger(Number(count)) && Number(count) >= 0 ? Math.min(Number(count), totalTopics ?? Number(count)) : null;
  const degree = String(data.degree || 'Not provided');
  const roadmapSlug = normalizeEmailRoadmapSlug(data.roadmapSlug);

  const { subject, eyebrow, headline, lede, docTag, chips, contentHtml, isMarketing } = renderTemplateContent(
    templateId,
    { name, email, roadmapTitle, progressCount, totalTopics, roadmapSlug, degree }
  );

  const plainSubject = decodeHtmlEntities(subject);

  const html = buildEmail({
    title: plainSubject,
    eyebrow,
    headline,
    lede,
    docTag,
    chips,
    contentHtml,
    isMarketing,
    email,
    preferenceUrl: data.preferenceUrl || '',
  });

  return { subject: plainSubject, html, text: emailHtmlToText(html), isMarketing };
}
