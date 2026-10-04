# SkillBun keyword and content strategy

Research date: **3 October 2026**. Scope: tech career discovery, learning roadmaps, portfolio project ideas, and SkillBun credential verification.

## What this research establishes

The objective is to make SkillBun discoverable for relevant student questions and specific tech learning paths. No implementation can ensure that SkillBun appears first, or appears at all, for every related search. Google explicitly says there is no automatic first-place ranking method.

[`SEO_KEYWORDS.csv`](./SEO_KEYWORDS.csv) is the working query inventory. **Every keyword in it is an unmeasured candidate**, derived from the product, its public roadmap curriculum, and likely search intent. It is not a report of real searches, search volume, keyword difficulty, Google rankings, competitor rankings, or Search Console impressions. Google Search Console, Keyword Planner, and paid keyword tools were not connected. No search-result sampling or demand estimates are presented as evidence.

The public Google documentation listed below was retrieved successfully on the research date. Repository observations were checked against the current local source. Live indexing and demand must be measured separately after deployment.

### Evidence inspected

| Evidence | Verified local finding | How it informs targeting |
| --- | --- | --- |
| `public/data/roadmaps/*.json` | Exactly 100 roadmap files with role titles, descriptions, learning topics, and prerequisites | One existing canonical roadmap per role; use its own curriculum vocabulary |
| `app/roadmap/page.jsx` | Public roadmap directory with subject categories | Broad developer and tech-roadmap queries belong to `/roadmap` |
| `app/roadmap/[slug]/page.jsx` | Public dynamic roadmap route reads the corresponding local JSON | Preserve exact underscore slugs; do not invent hyphenated copies |
| `app/page.jsx`, `app/about/page.jsx` | Profile context, adaptive career quiz, recommendations, roadmaps, Bun-Bot, and SkillBun certificates | Career-discovery queries fit the public product explanation |
| `app/about/page.jsx` | SkillBun services are described as free; third-party resources can have separate terms | Qualify free claims as SkillBun access, not free vendor exams or all external courses |
| `app/quiz/layout.jsx`, `app/counsellor/layout.jsx` | Interactive sessions intentionally use `noindex` | Route acquisition queries to public guidance; preserve session privacy |
| `public/data/projects_curated.json` | 14 project briefs across 8 domains | Target project ideas and blueprints, not downloadable finished source code |
| `app/certificate/page.jsx` | Public lookup accepts an individual credential ID | `/certificate` serves branded verification intent |

`/career-guidance` is the substantive public guide added with this SEO work. Use it for quiz/guidance discovery; `/quiz` and `/counsellor` remain the interactive next steps. The CSV includes a few explicitly labelled gaps for editorial planning: an assigned target does not mean that every proposed question is already fully answered.

## Canonical intent map

| Canonical path | Primary intent | Representative candidates | Boundary |
| --- | --- | --- | --- |
| `/` | Find the SkillBun product | SkillBun; free tech career guidance platform | Explain the product and direct visitors to the appropriate guide or roadmap |
| `/career-guidance` | Choose a tech path; understand the career quiz | AI career guidance for students; tech career quiz; how to choose a tech career | Explain method and limitations; do not describe the quiz as a validated psychometric or diagnostic test |
| `/roadmap` | Browse and compare learning paths | developer roadmaps; free tech career roadmaps; computer science learning paths | Directory owns broad plural intent |
| `/roadmap/[existing_slug]` | Learn a specific role or skill sequence | frontend developer roadmap; machine learning engineer learning path | Each role page owns its specific roadmap and prerequisite queries |
| `/projects` | Find practical portfolio ideas | computer science project ideas; developer portfolio projects | The current catalogue contains briefs, not a finished-code repository |
| `/certificate` | Verify a SkillBun credential | SkillBun certificate verification; verify SkillBun certificate ID | No search targets based on private recipient names or individual credential URLs |
| `/about` | Understand SkillBun and its free policy | what is SkillBun; is SkillBun free | Keep claims accurate and distinguish linked third-party services |
| `/contact` | Reach SkillBun | SkillBun contact | Use the real contact details; do not invent local offices |

Use one canonical page for synonymous queries. For example, `full stack developer roadmap`, `fullstack roadmap`, and `full stack development learning path` all map to `/roadmap/fullstack`. Do not create one page for every spelling, city, year, or keyword variation.

## Priorities

Priorities indicate **editorial fit and implementation order**, not measured popularity or ease of ranking.

- **P1:** Brand discovery, public guidance, the roadmap directory, and core student paths: frontend, backend, full stack, Python, Java, Android, Flutter, data analyst, data science, data engineering, AI/ML, cybersecurity, DevOps/cloud, and UI/UX. Improve these first because they directly express the core product and offer useful onward journeys.
- **P2:** The remaining specialised roadmap curriculum and project-specific ideas. They already have distinct subject matter; improve explanations and links where the source supports them.
- **P3:** Content gaps and audience/language expansions. Validate need and write useful material before trying to rank for them. P3 does not mean poor demand; demand is unknown.

### First pages to review editorially

| Path | Focus | Useful visible answer |
| --- | --- | --- |
| `/career-guidance` | Tech career guidance and quiz intent | Who the tool helps, what the quiz considers, what the result means, and how to choose a first roadmap |
| `/roadmap/frontend` | Frontend developer roadmap | HTML/CSS/JavaScript foundations, React progression, accessibility, and a project checkpoint |
| `/roadmap/backend` | Backend developer roadmap | Programming prerequisites, APIs, databases, authentication, caching, and deployment |
| `/roadmap/fullstack` | Full stack developer roadmap | Frontend/backend sequence and when to build an end-to-end project |
| `/roadmap/python_developer` | Python developer roadmap | Core language, testing, packages, and a practical backend or automation direction |
| `/roadmap/java_developer` | Java developer roadmap | Java foundations, Spring Boot progression, testing, and service development |
| `/roadmap/data_analyst` | Data analyst roadmap | Spreadsheets, SQL, statistics, visualisation, and an analysis portfolio |
| `/roadmap/data_science` | Data science roadmap | Python, statistics, experiments, model evaluation, and prerequisites |
| `/roadmap/data_engineering` | Data engineer roadmap | SQL, data modelling, pipelines, orchestration, and data quality |
| `/roadmap/ai_ml_engineer` | Machine learning engineer roadmap | Maths and Python prerequisites, model training, evaluation, and deployment |
| `/roadmap/cybersecurity` | Cybersecurity roadmap | Networking/Linux foundations, defensive practice, and authorised lab work |
| `/roadmap/devops_cloud` | DevOps roadmap | Linux, networking, CI/CD, containers, cloud, and infrastructure automation |
| `/roadmap/ui_ux_design` | UI/UX designer roadmap | Research, accessible interface design, Figma, prototyping, and portfolio evidence |
| `/projects` | Portfolio and capstone project ideas | Scope, learning outcomes, prerequisites, deliverables, and links to relevant roadmaps |

A roadmap for an advanced role must state prerequisites rather than promise that a complete beginner can perform it immediately. The CSV deliberately avoids adding a generic `for beginners` suffix to all 100 tracks.

## How to use the CSV

Each row contains a query, intent cluster, one target URL, editorial priority, language/audience, evidence status, content basis, required content action, and measurement status. The inventory contains 699 candidate queries across 107 canonical targets, including all 100 current roadmaps. Priorities are 154 P1, 529 P2, and 16 P3; 5 queries are Hinglish content-gap candidates. Curated subject-specific variants complement role-name queries; they are vocabulary suggestions, not instructions to repeat every term in the page.

1. Filter to P1 and a single target URL. Choose one primary query that accurately summarises that page.
2. Check the live page against the stated `content_basis` and `content_action`. Fill a genuine answer gap before adding an unsupported claim to metadata.
3. Use clear, natural wording in the title, visible introduction, headings, link anchors, and explanation. Do not paste the inventory into body copy, hidden text, alt text, or metadata.
4. Keep titles distinct and concise. A character-count preview can help editorially, but Google does not promise a fixed displayed character count. Snippets may be rewritten and truncated for the device.
5. Link the public guide to relevant role pages, link the directory to all real roadmaps, and link project ideas to their matching learning paths. Use ordinary crawlable links with descriptive anchor text.
6. Keep query-string filters and alternate tabs associated with their canonical page. They are not separate keyword landing pages.
7. After deployment, replace assumptions with actual Search Console query/page data. Keep unobserved candidates marked as unmeasured.

The `keywords` meta tag does **not** improve Google Search rankings. The inventory is a research and editorial tool; useful visible content, discoverable links, and technically indexable pages do the work.

## India, student, and Hinglish opportunities

India is a relevant audience, but SkillBun also serves learners worldwide. Do not turn every global roadmap into a duplicate India-only page or repeat Indian city names in page text.

The CSV includes selective candidates such as `tech career guidance for students in India`, `career options for BTech CSE students`, `career guidance for BCA students`, and `coding kaha se shuru kare`. These require an honest, explicit answer for that audience. They are labelled as gaps unless the public guide provides sufficient coverage. Explain how a CS/IT learner can use the same roadmap; avoid admission, degree-recognition, or guaranteed employment claims.

The current locale selector is not by itself evidence that Google has a separately addressable Hindi site. Do not add `hreflang` for URLs that do not exist. Consider a real Hindi guide only when it has complete, reviewed translation, an appropriate URL, self-canonical metadata, reciprocal language links, and a maintenance owner. Do not stuff Romanised Hindi variants into an English page merely to claim coverage.

Do not target broad `career after 12th`, medicine, law, civil-service exams, admission counselling, counselling near me, or unrelated school-subject queries with the current tech-focused content. Do not use live salary, hiring-demand, placement-rate, or job-vacancy keywords unless there is a maintained source-backed answer. Current editorial salary estimates are not verified labour-market measurements.

## Useful content gaps, in order

1. **Choosing between nearby tracks:** a real decision section comparing frontend/backend/full stack, data analyst/data scientist/data engineer, or cybersecurity/SOC/penetration testing. Explain typical work, prerequisites, overlap, and a small trial project. Link to existing roadmaps. Avoid thin comparison pages that restate titles.
2. **Starting with a CS/IT degree:** a short reviewed explanation for BTech CSE, BCA, IT, and self-taught learners. Address differences in starting skills without claiming universal degree or hiring rules. Add India-specific evidence only where needed and current.
3. **Project depth:** expand high-value project briefs with evaluation criteria, implementation milestones, and original examples. A distinct project detail URL is useful only if it contains a substantial answer beyond the existing modal. Do not advertise source-code downloads that are absent.
4. **Credential explanation:** clearly distinguish a SkillBun assessment certificate from a government-recognised degree, vendor certification, or guaranteed employer acceptance. Explain progress eligibility, assessment, verification, and limitations in public product copy.
5. **Reviewed Hindi guidance:** validate user need, translate a useful complete guide, and maintain it. This is an editorial project, not mass generation of transliterated pages.

For every new content page, record who reviewed it and when substantive advice was checked. Dates must describe real review or change; do not stamp the current year onto every page automatically.

## Measurement plan

The account owner should verify the `skillbun.tech` property in Google Search Console and submit the deployed canonical sitemap. Use URL Inspection on the homepage, guide, roadmap directory, a few specific roadmaps, and projects to inspect the rendered page and selected canonical. A successful submission is not proof of indexing or ranking.

Record the first available baseline, then compare equivalent 28-day windows once enough data exists. Segment by branded/non-branded queries, page family, country (India and other markets), and device. New or low-traffic pages may need more observation time; there is no guaranteed timetable.

| Metric | Meaning | Decision it supports |
| --- | --- | --- |
| Indexed canonical pages | Google actually indexed the intended page | Fix crawl, rendering, duplicate, or content-quality problems before chasing keywords |
| Query impressions | A real query has shown SkillBun in results | Upgrade that query from candidate to observed; check intent and page match |
| Clicks and CTR | People chose the result | Improve a truthful title/snippet when impressions exist but clicks lag; account for position and query mix |
| Average position | Aggregated position of the site's top result | Track trends with context; it is not a universal rank for every user |
| Organic visits to useful next steps | Searchers reach a roadmap, guidance CTA, or project | Assess product fit using existing consent-respecting analytics |
| Learning or account conversions | Visitors continue the intended journey | Improve usefulness and friction without exposing private activity to indexing |

Search Console can omit anonymised queries and aggregate data. Absence from a query export does not prove zero searches. Do not infer keyword volume from impressions alone or interpret a `site:` query as a complete index report.

Do not add a new tracking vendor solely for this plan. Search Console verification and sitemap submission are external owner actions; existing analytics should continue to respect the site's consent choices.

## Guardrails and practical limits

- Preserve SkillBun branding, splash, hero, footer, dark/light themes, protected data, and the established onboarding-to-quiz journey.
- Keep dashboard, authentication, assessments, personal results, chat sessions, and individual credentials out of keyword acquisition plans. A public verification feature does not require indexing people's credential details.
- Structured data must match visible content. It does not guarantee a rich result. Do not add fake ratings, invented testimonials, employer partnerships, or accreditation.
- Never buy spam backlinks or create city, keyword, and year doorway pages. Genuine references from relevant student communities or institutions should come from useful work and authorised outreach.
- Google ignores sitemap `priority` and `changefreq`; raising them cannot force ranking. Use accurate significant-change dates if supplying `lastmod`.
- AI Overviews and AI Mode have no special additional optimisation requirement according to Google's guidance. Ordinary technical eligibility and helpful content still apply. Do not promise an `llms.txt`, AI-crawler allow rule, or special schema will produce citations.
- This document is not evidence that production was deployed, crawled, indexed, or ranked. Verify those states in deployment checks and Search Console.

## Primary sources checked

All links below returned HTTP 200 on 3 October 2026. They are guidance sources, not keyword-volume evidence.

1. [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=en): no automatic first-place ranking; Google does not use the keywords meta tag; use clear content and discoverable links.
2. [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies?hl=en): keyword stuffing, doorway abuse, link spam, and scaled unoriginal content are prohibited practices.
3. [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=en): content should serve an existing audience with useful, trustworthy information.
4. [Influencing title links](https://developers.google.com/search/docs/appearance/title-link?hl=en): descriptive, concise titles; avoid repetition and boilerplate; Google may generate a different title link.
5. [Writing meta descriptions and snippets](https://developers.google.com/search/docs/appearance/snippet): write accurate, distinct page descriptions; snippets can be rewritten or truncated.
6. [Building and submitting sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=en): submit canonical URLs; `priority` and `changefreq` are ignored; `lastmod` must be verifiably accurate.
7. [Robots meta tag and X-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag?hl=en): indexing directives require crawler access; robots rules are not an access-control system.
8. [Search Console Performance report](https://support.google.com/webmasters/answer/7576553): definitions of impressions, clicks, CTR, and average position.
9. [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features?hl=en): no additional requirements or special optimisations for AI Overviews or AI Mode.
