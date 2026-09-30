# Email recommendations and saved AI variations

The CRM recommends a relevant lifecycle category from recorded student activity. It never rotates across unrelated categories simply to find an unused template.

## Recommendation rules

- By default, suppress marketing for unsubscribed students, missing email addresses, and students sent a marketing email within 72 hours. The separate admin Force Send option can explicitly override unsubscribe/frequency suppression; it is not applied by the recommendation engine.
- Acknowledge a real roadmap certificate issued within the last 14 days, once per recorded certificate event. Older history without event IDs is conservatively matched by category and roadmap.
- Recommend exam review only for a confirmed completed unsuccessful exam within seven days. An exam start or attempt counter is not proof of failure.
- Recommend certification preparation at verified 60% roadmap completion; the actual exam page still enforces attempts and cooldowns. Passed exams and issued certificates suppress that roadmap's exam invitation.
- Welcome new accounts with no completed topics during their first seven days.
- Recommend continuing learning after at least three days without recorded login, progress or exam activity.
- Otherwise show “No email due” and explain why.

Dates that are missing are not fabricated. Progress totals come from the public roadmap catalog, matching the target roadmap. Recommendations and recipients are revalidated on the server before CRM sends.

## Growing the variation library

“Prepare recommended mail” uses an unsent built-in variation from the selected category first, then an unsent saved AI variation. When those are exhausted, it generates and saves one new variation before opening the preview. Nothing generates on each dashboard render and there is no background send campaign.

The analytics page opens the AI mail generator and saved library above the student table. The Email Studio and each eligible student's expanded CRM row also provide library access. It provides category selection, name-prefix search, pagination, preview and explicit creation of another variation. Each eligible student's recommendation card has a direct “Generate new AI mail” button that saves a fresh variation and opens its preview. The CRM can select saved variations for the matching student category.

Each variation stores reusable plain-text content with `{{name}}` and `{{roadmapTitle}}` placeholders. Personalization occurs locally in the server renderer; student names, addresses, answers and activity records are not sent to the model. The shared email theme supplies branding, layout, dark/light CSS, unsubscribe footer and controlled SkillBun links.

Generated variations remain drafts for admin review. They do not send automatically. Exact duplicate generations use the existing record instead of creating another copy. Sent history records the variation ID, lifecycle category, roadmap, event, message ID and test flag. History appends use a transaction to avoid overwriting another append.

## Storage and provider configuration

- Immutable variations: `emailTemplateLibrary/{category}/variations/{contentHash}`.
- Temporary generation leases: `emailDraftLocks/{category}`. A 60-second lease prevents overlapping generations for one category; ownership is checked before release.
- All library access uses authenticated admin API routes and the Firebase Admin SDK. No public/client access rules are added. Existing default-deny rules protect these collections.
- The configured provider order is Groq (`GROQ_API_KEY`, `openai/gpt-oss-20b`, low reasoning), TokenRouter (`TOKENROUTER_API_KEY`, `TOKENROUTER_MODEL`, default `z-ai/glm-5.3-free`), then OpenRouter (`OPENROUTER_API_KEY`, `openrouter/free`, reasoning disabled). Unconfigured providers are skipped. AI drafting needs at least one of these server-only keys; built-in templates remain available without them. `GEMINI_API_KEY` is not used. This drafting chain is narrower than the quiz/counsellor chain.
- Generation shares those providers' quota. Limits are three generations per admin per minute and twenty across admins per hour. The complete generation operation has a 45-second deadline, with individual caps of 20 seconds for Groq/OpenRouter and 30 seconds for TokenRouter, shortened by the remaining budget. Provider errors leave the existing library intact.
- Firebase Admin credentials and database write access must be configured on the deployment. Collections are created on first successful generation; the queries use automatic single-field indexes unless these have been disabled in the project.

JSON syntax from the provider is additionally checked for field lengths, allowed placeholders, plain text and prohibited claims before persistence. The model cannot provide HTML, recipient addresses or link destinations. Draft review remains necessary for semantic quality. Provider references: [Groq JSON output documentation](https://console.groq.com/docs/structured-outputs), [OpenRouter API documentation](https://openrouter.ai/docs/api/reference/overview).

## Dispatch and recovery

CRM sends claim a five-minute lease in `emailDispatchLocks/{uid}` inside a Firestore transaction. The claim checks the recipient, unsubscribe state, duplicate variation and marketing quiet period again. Successful sends transactionally append history. An expired in-progress lease or an uncertain SMTP outcome is held for review instead of automatically retrying a potentially delivered message.

When the interface requests dispatch review, inspect the delivery evidence and explicitly resolve the outcome as sent or not sent. This is supported by `/api/admin/emails/send` with `dispatchAction: 'resolve'`. Never clear counters or repeatedly press Send to resolve uncertainty. Single and bulk counter resets clear only history; they do not establish whether an uncertain email was delivered.

These operations are initiated by an administrator. No scheduled or unattended retention campaign is configured in `vercel.json` or the included Firebase function.

## Verification and scope

Focused recommendation and rendering tests cover lifecycle eligibility, 60% thresholds, unknown outcomes, recent activity, cooldowns, unsubscribes, category exhaustion, reusable rendering, duplicate identity, provider request validation, saved-template reuse and unauthorized access. Provider tests use synthetic responses and send no emails.

Run `npm test` for recommendation, draft, rendering, dispatch-lock and counter-reset coverage. Service doubles verify the logic without external AI calls, real Firestore writes or email delivery. Validate the authenticated library workflow, configured provider response, draft persistence and delivery to a controlled mailbox in the target deployment before treating the feature as operationally verified. See [Operations](OPERATIONS.md) and [Current status](CURRENT_STATUS.md) for configuration and current validation scope.

Changes concern email recommendations, library storage, preview and sending. Branding, homepage splash, hero/floaters, footer and light/dark support are preserved. Authentication checks, certification rules, quiz/counsellor runtime and environment names are preserved. Existing manual Email Studio and Workforce routes remain separate from CRM lifecycle recommendations.
