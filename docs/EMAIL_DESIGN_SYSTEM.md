# SkillBun Email Design System

This is the reference for generated mail composed through [`utils/server/emailTheme.js`](../utils/server/emailTheme.js): retention messages, workforce dispatches, account mail and structured AI drafts. Full custom HTML can supply its own document. Firebase provider-managed mail is a separate rendering path.

## Layout contract

`buildEmail()` produces a masthead, title block, content and footer on one flat surface. The masthead holds the logo, document tag and scale rule; the title block holds the eyebrow, headline, lede and metadata; templates compose the content from shared motifs.

- The page and sheet have the same flat colour. Do not introduce a floating card, sheet border or sheet shadow.
- Do not put a grid, pattern, gradient, tint or texture on the body or outer page table.
- Keep decoration inside content blocks. Draw ornaments with table cells or CSS gradients, with a solid background-colour fallback. Do not use ornament images.
- Preserve the supplied SkillBun mark and wordmark. The existing email renderer uses the transparent `/logo-tight.png` raster asset; do not overwrite frozen brand assets.
- Keep copy factual. Do not invent student progress, rankings, money values, scarcity, outcomes or testimonials.

### Responsive width

These are the current media-query targets. Body size refers to the `sb-body` cell; individual motifs may set their own font sizes.

| Viewport | Sheet cap | Side padding | Body cell size |
|---|---|---|---|
| Up to 620px | Available width | 22px | 15.5px |
| 621–767px | 600px | 40px | 15.5px |
| 768–1099px | 680px | 46px | 15.5px |
| 1100–1499px | 740px | 56px | 16px |
| 1500px and above | 860px | 72px | 17px |

Preserve the sheet table's `width="600"` attribute and inline `width:100%; max-width:600px`. Classic Outlook's Word renderer uses the table width when responsive CSS is unavailable. Clients that strip style blocks retain the inline cap and 22px side padding. The desktop padding is enabled by media queries, so narrow clients still have a readable fallback.

The shared hooks are `sb-sheet`, `sb-pad`, `sb-body`, `sb-lede` and `sb-display`. Keep the lede narrower than the sheet, and check long personalised fields for overflow.

## Palette and typography

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `pageBg` / `card` | `#FFFFFF` | `#0D0D0D` | One flat surface |
| `ink` / `text` | `#1A1A1A` | `#EDEDEA` | Headings, body and filled marks |
| `muted` | `#6E6D68` | `#A3A29C` | Lede, labels and captions |
| `faint` | `#706F69` | `#A3A29C` | Document tags and secondary indices |
| `hairline` | `#E7E7E3` | `#2C2C29` | Rules and separators |
| `border` | `#DCDCD7` | `#333330` | Tag outlines and empty segments |
| `surfaceRaised` | `#FAFAF8` | `#1D1D1B` | Contained perfboard panels |
| `surfaceSunken` | `#F5F5F2` | `#212120` | Neutral notes |
| `brand` | `#27B652` | `#3ED971` | Small active markers |
| `danger` | `#B42318` | `#F87171` | Security signal |
| `dangerText` | `#7A271A` | `#FCA5A5` | Security notice text |
| `dangerSubtle` | `#FEF3F2` | `#2A1A1A` | Security notice background |

The compatibility aliases `accent`, `green`, `darkGreen`, `deepGreen` and `lime` resolve to ink. Typography uses Nunito for body copy, Fredoka for the wordmark and JetBrains Mono for metadata, with native fallback stacks when an inbox strips web fonts.

## Shared motifs

Compose templates from these helpers instead of duplicating their layout. Inputs have different escaping contracts; consult the next section before inserting dynamic data.

| Helper | Purpose and input shape |
|---|---|
| `emailText(html)` | Body paragraph containing trusted markup |
| `emailPoints(items)` | Bulleted lines; array of trusted markup strings |
| `emailSectionLabel(text)` | Small uppercase section label |
| `emailDivider()` | Hairline rule |
| `emailScaleRule({ ticks })` | Drafting-scale masthead rule; default 31 ticks |
| `emailCircuitRule({ pads })` | Footer rule; default 3 pads |
| `emailFrame(innerHtml, { label })` | Crop-mark frame around a content block |
| `emailChipBlock({ eyebrow, title, meta, pins })` | Titled technical block; default 4 pins |
| `emailLearningGraphic({ label, title, detail, nodes })` | Suggested learning process with up to 3 stages; not evidence of student completion |
| `emailNodeRail(nodes, { flush })` | Learning-path rail; `[{ title, body, state }]`, with `done`, `current` or `todo` state; strings also accepted |
| `emailStepRail(steps)` | Numbered procedure; `[{ title, body }]` or strings |
| `emailSpecSheet(rows, { title, flush })` | Datasheet rows; `[[label, valueHtml], ...]` |
| `emailStatBand(stats)` | Small band of figures; `[{ value, label }]` |
| `emailProgressTrack({ percent, label, caption, segments })` | Segmented progress track; default 16 segments |
| `emailWaffle({ total, filled, label, caption, cols })` | Topic-count grid; default 12 columns |
| `emailCredentialStrip(items, { title })` | IDs and links; `[[label, value, { mono?, href? }], ...]` |
| `emailTags(items)` | Short technology/topic labels |
| `emailNote(html, tone)` | Neutral or danger callout |
| `emailButton({ href, label, align })` | Primary CTA; left aligned by default |
| `emailLink({ href, label })` | Secondary underlined link |
| `emailSignoff({ name, role })` | Formal sign-off |

Use a node rail for a learning path and a step rail for an ordinary procedure. Use `{ flush: true }` where supported when nesting a motif inside a frame, to avoid doubling the bottom gap. Progress and stat motifs must represent available data honestly.

## Escaping, subjects and missing data

Escape dynamic values exactly once at the correct boundary. There is no universal rule that all helper inputs are pre-escaped.

- Markup inputs such as `emailText(html)`, `emailPoints(items)`, frame content, and button/link labels trust their caller. Escape untrusted values before interpolating them into that markup.
- Raw-text inputs are escaped by their helpers. Examples include frame labels, chip-block eyebrows, spec-sheet row labels, credential-strip labels and values, tags, sign-off names/roles and metadata chips. Pass raw strings to these inputs.
- `emailLearningGraphic` escapes its label and node labels, while its title and detail accept trusted markup.
- Link helpers escape the HTML attribute representation of `href`; callers still choose and validate the destination. HTML escaping alone is not URL validation.

In [`retentionEmails.js`](../utils/server/retentionEmails.js), `name` and the normalised `roadmapTitle` are escaped before template rendering. `email` and `degree` remain raw strings for the helpers that escape them. Preserve this distinction when adding or changing a template.

Subjects are plain text. Retention subject generation decodes the shared HTML entities once, with `&amp;` decoded last, rather than exposing `&amp;` or `&#39;` to the reader. Do not put HTML markup or pre-escaped data directly into mail headers. `buildEmail()` escapes its plain-text `title` and strips tags from the already-trusted `lede` for the preheader; it must not double-escape the lede.

Personalisation follows these rules:

| Field | Missing or invalid data |
|---|---|
| `name` | `Student` |
| `email` | Empty string; do not invent an address |
| `degree` | `Not provided` |
| `roadmapTitle` | `chosen track` |
| `totalTopics` | Unknown unless a positive safe integer is available |
| `progressCount` | Unknown unless a nonnegative safe integer is available; bounded by the actual total when known |

Roadmap totals come from [`emailRoadmapContext`](../utils/shared/emailRoadmap.js), using the same counted nodes as certification, including legacy stage projects. Do not assume a fixed 24-topic roadmap, fabricate progress for unknown records, or clamp valid 0% and 100% progress to decorative intermediate values.

Slug and uppercase roadmap titles are normalised for reading, while acronyms such as AI, ML, UI, UX, iOS and DevOps are preserved. Empty titles, `N/A` and undecided-interest text use `chosen track` rather than inventing a completed or selected roadmap.

## Email-client fallbacks and theme sync

Email CSS support varies by client and version. Table cells provide the structural layout; the button anchor also uses `display:inline-block` for clients that support it.

- Keep `mso-padding-alt:13px 26px` on the button cell and `mso-padding-alt:0` on the anchor. This provides padding for classic Outlook without doubling it elsewhere.
- Tags use individual single-cell tables with `align="left"` so their padding and row spacing survive classic Outlook.
- Rounded corners may degrade to square. Gradients and background images may be stripped; solid colours must retain a legible result.
- Inline SVG is not a reliable email asset across inboxes. The existing transparent raster logo is the image exception; motifs remain table/CSS constructions.
- Rails use adjoining cell borders. Thin lines and ticks use inner elements inside table cells. Progress-track segment and gap widths sum to 100%.

The theme contract combines:

1. `color-scheme` and `supported-color-schemes` metadata.
2. Matching root colour-scheme declarations.
3. `@media (prefers-color-scheme: dark)` rules.
4. `[data-ogsc]` and `[data-ogsb]` prefixed copies for Outlook clients that use those attributes.

Light values remain inline as the fallback. Add a class hook and corresponding entries in `darkRules()` for every new element whose colour changes with the theme. An inbox may still override colours or strip styles, so source compliance is not proof of device-theme behaviour in every mail client.

## Message sources

| Message family | Source |
|---|---|
| Onboarding, re-engagement, exam readiness, exam retake, certificate congratulations and transactional notices | [`retentionTemplates.js`](../utils/server/retentionTemplates.js) and [`retentionEmails.js`](../utils/server/retentionEmails.js) |
| Structured AI drafts | [AI email standard](ai-email-standard.md) |
| Offer, extension, termination/completion and activation dispatches | [`workforceEmailTemplates.js`](../utils/server/workforceEmailTemplates.js) |
| Password reset and signup verification code | [`zohoMailer.js`](../utils/server/zohoMailer.js) |

The retention template registry is the authoritative inventory. Marketing templates carry the unsubscribe line; transactional account messages do not. Do not maintain a second hard-coded template count in documentation.

Workforce builders include `buildOfferDispatchEmail`, `buildExtensionDispatchEmail`, `buildTerminationDispatchEmail` and `buildActivationWelcomeEmail`. They return subject, HTML, plain text, CC and Reply-To data; offer and activation builders also provide From data. Employee fields follow the stored snake_case schema.

Account entry points are `sendSkillBunPasswordResetEmail({ email, resetLink })` and `sendSkillBunSignupCodeEmail({ email, code, expiresInMinutes })`. Both use `buildEmail()` and are non-marketing messages. See [email signup security](EMAIL_SIGNUP_SECURITY.md) for the verification flow.

## Addressing contract

| Address | Role |
|---|---|
| `noreply@skillbun.tech` | Outgoing only; use `SkillBun <noreply@skillbun.tech>` or `SkillBun Hiring Team <noreply@skillbun.tech>` |
| `harsh@skillbun.tech` | Founder mailbox; all inbound replies, CC and Reply-To |

Do not invent unconfigured aliases such as careers, hiring, support, hello, admin or contact. Signed-document mail must say: **"Reply back to harsh@skillbun.tech with your signed copy within 3 business days."**

Zoho SMTP transport is configured through [`utils/server/env.js`](../utils/server/env.js) and used by the mailer. Required deployment configuration belongs in [operations](OPERATIONS.md), not in templates or committed credentials.

## Changing and verifying templates

For a retention template, update the registry entry and its `renderTemplateContent()` branch. Compose shared motifs, respect the raw-text/markup boundaries, and add dark rules for new colour hooks. Check other message families using the shared helper before modifying it.

Export synthetic previews without sending mail:

```sh
node scripts/preview-emails.mjs --export-only
```

This writes HTML/EML previews to ignored `output/email-preview/`. For the local gallery, run `node scripts/preview-emails.mjs` and open `http://127.0.0.1:3088`. These preview files are generated artifacts, not source files to commit.

Focused checks:

```sh
node --test tests/unit/emailRendering.test.mjs tests/unit/emailDraftVisuals.test.mjs
```

Review relevant variants in both themes, with styles/images unavailable and at narrow and wide viewport sizes. Check visible personalised text, plain-text subjects, unknown-data fallbacks, valid 0%/100% progress, tag wrapping, CTA padding, the 600px table fallback and horizontal overflow. Test malicious-looking text as data without turning it into markup.

A browser gallery does not establish Gmail, Outlook or Zoho inbox rendering or delivery. SMTP acceptance is also not proof of inbox arrival or visual correctness. Real-client checks remain necessary when changing shared mail layout; state which clients were actually checked. `scripts/test-email-inboxes.mjs` sends real mail and must only run for an explicitly authorised send to approved test recipients.

## Related references

- [Current feature status](CURRENT_STATUS.md)
- [Operations and configuration](OPERATIONS.md)
- [Email recommendation engine](EMAIL_RECOMMENDATION_ENGINE.md)
- [AI email standard](ai-email-standard.md)
- [Email signup security](EMAIL_SIGNUP_SECURITY.md)
