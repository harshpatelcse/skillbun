# SkillBun resource audit — 4 October 2026

The catalog audit completed its planned inventory. Confirmed broken supplementary links were migrated to checked sources or retired while preserving each affected topic's study guide and a verified external learning option. External services that blocked or failed checks remain explicitly unresolved.

## Coverage

| Surface | Checked | Result |
|---|---:|---|
| Roadmap catalog | 100 roadmaps; 6,929 unique external URLs | 4,627 initial HTTP successes; 1,791 initial 404/410s; 511 other HTTP/network failures |
| Roadmap videos | 1,607 unique YouTube URLs | All returned oEmbed metadata after retries |
| Study-guide citations | 3,513 unique URLs | 3,137 overlap the roadmap inventory; all 376 guide-only URLs checked |
| Guide-only videos | 233 URLs | 230 available; 2 missing videos; 1 playlist inconclusive |

## Changes

- Migrated **543 resource entries (515 distinct URLs)** to verified destinations with accurate titles and resource types. The working log contains 545 migration events because the two TCP/IP Guide occurrences were retargeted twice; the final count includes each occurrence once.
- Retired **1,300 repeatedly GET-confirmed missing supplementary entries (1,266 URLs)**. Every affected node retains an existing encrypted guide and a checked external learning option.
- Preserved all 100 roadmap topic trees, descriptions, ordering, difficulty, EXP, goals, and certificates. The catalog retains **14,558 resource entries**.
- Updated links in **914 study guides**: 198 URL migrations and 986 dead hyperlink removals. Removed links became their existing text labels. One additional guide, `cybersecurity/cs_certifications_career`, already contained a regional-framing correction to its introduction, bringing the refreshed total to **915 guides**. That single sentence now uses global career context; no lesson, section, code block, or URL was removed by the correction.
- No branding, splash, hero/floaters, footer, theming, auth, API, encryption format, or roadmap rendering/progress logic changed in this resource patch.

## Verification and limits

All 23 focused resource, global-standard, and study-guide tests passed. A complete comparison with the base revision accounts for every resource edit and proves that non-resource roadmap data is unchanged. All 3,323 referenced guides resolve to encrypted files, and all 6,219 YouTube resource occurrences retain valid player/watch targets. The separate vault verification records authenticated refresh and unchanged-ciphertext checks.

## Fresh local verification — 6 October 2026

The continuation reran the resource comparison and authenticated the entire vault against the current sources. All **3,335 guides** and the encrypted manifest authenticate; all decrypted guide bytes match their source bytes. Exactly **915 guides** differ from the base revision, while **2,420 guide ciphertexts** and the manifest remain unchanged. Every guide edit is explained by the recorded link changes or the one introduction correction above. Code blocks, inline-code lines, and section headings match the base revision in every changed guide. No decrypted content was written during verification.

All **31 focused tests passed** across resource safety, global roadmap standards, study-guide resources, and vault refresh. The 100 topic structures are unchanged; the **14,558 resource entries** have valid fields and safe HTTPS or expected internal destinations. All **3,323 distinct catalog guide references** resolve to SBV1 files, and all **6,219 YouTube occurrences** expose valid embedded and external playback targets. A repeat vault comparison found zero further ciphertext or source changes.

This continuation checked local integrity and reconciled the report. The external availability evidence and unresolved counts below remain dated **4 October**; a new catalog-wide network crawl, signed-in guide read, regional playback, and editorial review of every lesson were not performed.

11 originally missing roadmap URLs remain preserved because follow-up responses or host controls were inconclusive. Across the surviving catalog, 516 URLs remain blocked or otherwise unverified; surviving guide citations have 308 such URLs. These are not claimed broken or fixed. HTTP success does not prove content completeness, enrollment access, regional playback, or factual accuracy. The one inconclusive playlist remains linked.

The durable [audit data](audits/live-resource-audit-2026-10-04.json) records every migrated/retired resource, retained learning alternative, guide link change, and unresolved URL for follow-up. No production AI credentials, remote account writes, bulk AI generation, or paid services were used.

Local preview: [BI developer roadmap](http://127.0.0.1:3000/roadmap/bi_developer).
