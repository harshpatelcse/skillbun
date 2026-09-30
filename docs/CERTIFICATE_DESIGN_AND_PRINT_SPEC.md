# Certificate design, versioning, and print

This guide describes the existing credential system. It does not authorize redesigning released certificates or editing frozen assets. Current verification limits and open defects are in [Current status](CURRENT_STATUS.md).

Deleting a student account also deletes its owned earned roadmap certificates; their verification links then stop resolving. Workforce credentials and legal records are retained separately. This deletion policy does not change frozen template files or historical rendering. See [Operations](OPERATIONS.md) for ownership checks, legacy limits and release verification.

Public pages load the sanitized verification API, while raw ownership fields remain private under the updated Firestore rules. Manual issuance cannot overwrite an existing ID or alias, and issued identity/title/score/template fields cannot be patched. For corrections, revoke the original and issue a new ID; the original snapshot must remain unchanged.

## Issuance and historical rendering

Student-earned roadmap credentials use the authenticated server flow: `/api/certify/start` → `/api/certify/submit` → `/api/certify/mint`. Eligibility, answers, grading, quotas, and minting are server-authoritative. Firestore clients cannot write exam attempts or certificates.

The admin Certificate Studio has a separate privileged manual issuance path, including roadmap credentials, that does not run the student's exam flow. **Known integrity gaps:** its POST accepts a custom ID and uses an unconditional write, so an existing credential can be overwritten; its PATCH can change issued identity, title and score fields. These paths do not fully enforce the historical snapshot contract below. Add collision-safe creation and define controlled correction/revocation policy before claiming all records are immutable. Sources: `app/api/admin/certificates/route.js` and `app/api/admin/certificates/[id]/route.js`.

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

Public verification should resolve a canonical ID with a single-document lookup. A fallback collection query is subject to owner/admin list permissions; it is not an anonymous lookup guarantee. Keep ownership fields and internal consumers in sync if public-data access changes.

The detailed page displays revocation and unsupported-version states. **Known gap:** the `/certificate` search result currently labels any located record authentic without checking revocation. The detailed page's revocation check does not fix that search result. Public Firestore reads also expose all fields stored on the record, including email/UID; a sanitized public view requires coordinated API, rules, and client work.

## QR implementation

[`QRCodeSvg.jsx`](../app/components/QRCodeSvg.jsx) uses the installed `qrcode` package to construct an SVG with high error correction and the official logo in its center. It does not use `qrcode.react`. Keep the existing size and placement of each released template; QR sizes differ between layouts.

The current certificate page builds QR/share destinations with `https://skillbun.vercel.app/certificate/<canonical-id>`. The intended canonical site is `https://skillbun.tech`; verify that the legacy host redirects correctly before publishing credentials. Existing URL generation is documented here without changing released templates.

## Verification before release

- Run `npm run guard:templates`, `npm test`, `npm run lint`, and `npm run build` with Node 22. Use observed results rather than a fixed historical test count.
- Preview existing roadmap, internship, training, and LOR records, including long names, revoked records, legacy records, and an unsupported version.
- Check desktop/mobile display in both themes, print orientation, exported PDF readability, and QR resolution.
- Confirm the actual deployment target before publishing. There is no standing instruction to push to multiple remotes.

Service setup, backup boundaries, and production checks are covered in [Operations](OPERATIONS.md).
