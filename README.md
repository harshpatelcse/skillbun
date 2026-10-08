# SkillBun

SkillBun is a career discovery and learning platform for tech students. It combines profile-based career guidance, 100 learning roadmaps, protected study guides, Bun-Bot counselling, certification exams, and workforce administration.

The application uses Next.js App Router, React, Firebase Auth/Firestore, and shared dark/light themes. Student features have no application paywall; hosting and external services retain their own quotas and costs.

## Current implementation

- Career discovery uses ten preference/scenario questions and ranked recommendations. It is separate from the scored certification exam. Quiz results and counsellor history are currently session-only.
- The roadmap catalog contains 100 paths with node completion, XP, learning resources, and encrypted guides. See the current inventory for counts and verification limits.
- Certification uses a server-authoritative start, submit, and mint flow with eligibility checks, fixed question banks, attempt limits, and version-pinned certificates.
- Projects is a catalog of practice blueprints, without project submissions or grading.
- Admin tools cover students, analytics, reviewed email drafts/dispatch, credentials, workforce documents, and milestones.

The code playground supports isolated JavaScript/Python execution and static HTML/CSS previews; unsupported runtimes are labelled explicitly. Full-site translation remains partial. Certificate privacy/integrity rules are deployed. Release 2.10.68 includes account-deletion validation and certification startup fixes awaiting production verification; reset-email delivery is confirmed, while new-signup OTP and certificate/workforce journeys still require verification. Read [Current feature status](docs/CURRENT_STATUS.md) for the dated evidence and remaining limits.

## Run locally

Use **Node.js 22.x**. Configure a local environment file from [`.env.example`](.env.example) without overwriting existing credentials, then:

```powershell
$env:ONNXRUNTIME_NODE_INSTALL = 'skip'
npm ci
npm run dev
```

Open the localhost URL printed by the server. Reuse an existing repository server when one is already running. Firebase, encryption, and mail features require their existing service configuration; see [Operations](docs/OPERATIONS.md).

## Checks

```text
npm run guard:templates
npm run lint
npm test
npm run build
```

These checks do not deploy Firebase rules, verify live mail delivery, or exercise every signed-in production journey. Keep secrets, local source backups, generated output, and machine-local agent tools out of Git.

## Documentation

| Guide | Use it for |
| --- | --- |
| [Current feature status](docs/CURRENT_STATUS.md) | Implemented features, verification evidence, limitations, and pending work |
| [Operations](docs/OPERATIONS.md) | Local setup, service configuration, deployment, content maintenance, and recovery |
| [Verified email signup](docs/EMAIL_SIGNUP_SECURITY.md) | OTP rules, verified-email access, and the optional registration hook |
| [Certificate design and print](docs/CERTIFICATE_DESIGN_AND_PRINT_SPEC.md) | Immutable templates, IDs, QR links, and print validation |
| [Email design system](docs/EMAIL_DESIGN_SYSTEM.md) | Shared rendering, inbox compatibility, and synthetic previews |
| [Email recommendation engine](docs/EMAIL_RECOMMENDATION_ENGINE.md) | Eligibility, frequency limits, draft generation, and explicit dispatch |
| [AI email standard](docs/ai-email-standard.md) | Reusable copy, validation, public grounding, and approved graphics |
| [RAG architecture](docs/rag-architecture.md) | Public corpus boundaries, retrieval, optional models, and index maintenance |

Update these guides when behavior changes. Completed phase plans, dated audits, and placeholder specifications are not maintained alongside them.

Built and maintained by Reish. See [LICENSE](LICENSE) for usage terms.
