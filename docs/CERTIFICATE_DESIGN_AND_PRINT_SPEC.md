# Certificate design, versioning, and print

This guide describes the existing credential system. It does not authorize redesigning released certificates or editing frozen assets. Current verification limits and open defects are in [Current status](CURRENT_STATUS.md).

Deleting a student account also deletes its owned earned roadmap certificates; their verification links then stop resolving. Workforce credentials and legal records are retained separately. This deletion policy does not change frozen template files or historical rendering. See [Operations](OPERATIONS.md) for ownership checks, legacy limits and release verification.

Public pages load the sanitized verification API, while raw ownership fields remain private under the updated Firestore rules. Manual issuance cannot overwrite an existing ID or alias, and issued identity/title/score/template fields cannot be patched. For corrections, revoke the original and issue a new ID; the original snapshot must remain unchanged.

## Issuance and historical rendering

Student-earned roadmap credentials use the authenticated server flow: `/api/certify/start` → `/api/certify/submit` → `/api/certify/mint`. Eligibility, answers, grading, quotas, and minting are server-authoritative. Firestore clients cannot write exam attempts or certificates.

The admin Certificate Studio has a separate privileged manual issuance path, including roadmap credentials, that does not run the student's exam flow. POST accepts a validated custom ID but creates the record transactionally only after checking both the document ID and existing public aliases. A collision returns 409 instead of overwriting a credential. PATCH accepts only a boolean `is_revoked`; identity, title, score and template fields are immutable. Corrections require revocation and issuance under a new ID. Sources: `utils/server/certificateIntegrity.mjs`, `app/api/admin/certificates/route.js` and `app/api/admin/certificates/[id]/route.js`.

The registry in [`docTemplateRegistry.js`](../utils/common/docTemplateRegistry.js) governs these categories:

| Category | Rendering |
| --- | --- |
| Roadmap, internship, training, letter of recommendation | Versioned web renderer at `/certificate/[id]`; browser print/save |
| Offer, extension, termination | Server PDF templates under `utils/server/pdf/templates/` |

New issuance records the active `template_version`; the design contract requires a preserved content snapshot. Display and PDF generation resolve the **stored version**, never the current issuance default. Legacy records with a missing version resolve to `v1`; an explicit unsupported version must produce an error rather than silently rendering another version.

Released templates, the Canva overlay, and registered brand assets are frozen. For an approved new design:

1. Run `npm run template:new -- web v2` or the appropriate PDF target, such as `offerLetter v2`.
2. Implement the new renderer and version-scoped assets; keep released files intact.
3. Register the implementation and supported version in the shared registry and relevant renderer/PDF dispatcher.
4. Verify historical records still resolve to their original version before changing the active version for new issuance.
5. Run `npm run guard:templates`, relevant tests, lint, and build. A guard failure is not permission to rewrite the frozen manifest.

## Visual and print contract

Preserve the SkillBun logo/wordmark, official Reish artwork, and the certificate page's current design. The roadmap credential uses the pinned Canva background with aligned name, roadmap title, watermark, and unique-ID overlays. Internship/training credentials retain their parchment layout, gold frame, seal, and QR area. A letter of recommendation uses its letterhead layout.

[`triggerDocumentPrint`](../utils/client/printAndDownload.js) sets a descriptive temporary document title, injects A4 orientation, invokes browser print, and restores the original state. Certificates use landscape; letters use portrait. The suggested save filename depends on the browser and is not a cross-browser guarantee.

For any approved future template:

- Preserve desktop proportions in print; avoid mobile rules shrinking the page into a narrow column.
- Scope responsive layout rules to `@media screen and (...)` where print must retain its own layout.
- Use locally scoped CSS module selectors. Retain semantic `<header>`/`<footer>` elements with classes; changing them to `<div>` is not necessary. Global print rules belong in an appropriate global stylesheet or a locally scoped rule.
- Check text clipping, long names/titles, background printing, logo rendering, margins, and QR scanning on real exported PDFs. Unit tests do not prove printer or inbox behavior.

## IDs and verification

Corporate display IDs can contain slashes, for example `SKB/2026/HR-OFF/8K29DF`. Firestore document keys use the canonical hyphen form `SKB-2026-HR-OFF-8K29DF`; never pass display slashes as a document ID. Use the existing ID helpers and stored `display_id`, preserving older academic-ID formats. Do not convert every hyphen back to a slash indiscriminately.

Public pages use `/api/certificates/verify?id=...`. Its server-side lookup resolves canonical, display and supported legacy IDs with bounded queries and explicit ambiguity handling. The response includes only allowlisted public rendering fields. Raw Firestore reads require owner/admin authorization; public pages must not query raw certificate records through the client SDK.

Both `/certificate` search and the detailed page distinguish revoked credentials from active credentials. The detailed page also shows unsupported-version errors. Email, UID, employee/attempt IDs and administrative metadata are excluded from public API responses. Application and matching privacy rules are deployed; controlled owner/admin and real-record print checks remain listed in [Current status](CURRENT_STATUS.md).

## QR implementation

[`QRCodeSvg.jsx`](../app/components/QRCodeSvg.jsx) uses the installed `qrcode` package to construct an SVG with high error correction and the official logo in its center. It does not use `qrcode.react`. Keep the existing size and placement of each released template; QR sizes differ between layouts.

The certificate page builds QR/share destinations from the current browser origin, with `https://skillbun.tech` as the server-rendering fallback, followed by `/certificate/<canonical-id>`. Production credentials should be opened and exported on the canonical `skillbun.tech` host. Local previews deliberately retain their local origin. Existing URL generation is documented here without changing released templates.

## Verification before release

- Run `npm run guard:templates`, `npm test`, `npm run lint`, and `npm run build` with Node 22. Use observed results rather than a fixed historical test count.
- Preview existing roadmap, internship, training, and LOR records, including long names, revoked records, legacy records, and an unsupported version.
- Check desktop/mobile display in both themes, print orientation, exported PDF readability, and QR resolution.
- Confirm the actual deployment target before publishing. There is no standing instruction to push to multiple remotes.

Service setup, backup boundaries, and production checks are covered in [Operations](OPERATIONS.md).
