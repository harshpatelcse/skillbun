# SkillBun audit fixes — simple deployment guide

## Latest local continuation — 8 October 2026

Ye changes release `2.10.68` aur matching lockfile mein included hain. Git push ko production deployment proof mat samjho; Vercel par isi revision ka Ready status aur live checks separately verify karo. Certification startup cloud progress read karta hai aur stalled metadata load 20 seconds mein controlled error deta hai; server exam safeguards unchanged hain.

1. **Deletion fix release karo.** Live test mein fresh login ke baad bhi empty DELETE request `Unexpected account deletion parameters` se reject hui. Local fix empty stream accept karta hai; nonempty/failed/stalled stream reject hoti hai. Validated application release ke baad approved disposable account se fresh login karke deletion dobara check karo. Is run mein account delete nahi hua.
2. **Dependency patch included hai.** Next aur uske companion packages `16.3.8` par hain; `source-map-js` `1.2.2` par hai. Runtime dependency audit clean hai. Full audit ke 5 `braces` entries sirf existing lint chain ke hain; current unpatched tooling ko suppress karne ke liye framework downgrade mat karo.
3. **Rules dobara deploy karna required nahi.** Production rule source local file se match hai, aur local emulator ke 22 tests pass hain. Local rules testing ke liye Node 22, Java 21+, Firebase CLI 15.29.0 aur `npm run test:rules` use karo. CI setup included hai. Koi naya production env variable ya credential required nahi.
4. **Backup/retention decision pending hai.** Cloud mein 7 indexes READY hain, lekin TTL policies aur backup schedules absent hain; PITR aur database delete protection disabled hain. Backup schedule/retention, PITR aur restore-test budget owner decide kare. Optional TTL candidates `emailSignupChallenges.deleteAfter` aur `serverRateLimits.expiresAt` hain; TTL deletes incur usage. **`accountDeletions` markers par TTL mat lagao**: stale sessions/in-flight writers ko block karna zaroori hai. No automatic retention deletion or paid feature was enabled.
5. **Free-first auth policy preserve karo.** Email provider enabled aur no blocking function current selected setup ke hisaab se correct hai. Identity Platform upgrade/function deployment optional paid decision hai. Google signup bachane ke liye global signup ya email login disable mat karo.
6. **Remaining live checks:** Google popup + new OTP inbox, eligible exam/mint/PDF/QR, approved admin/intern workforce flow, production RAG performance, analytics consent network checks, Search Console/Bing ownership and sitemap acceptance. Reset-email delivery user-confirmed hai; guide opening aur below-60% exam rejection live pass hain. IAM least-privilege/backup restore/secret custody ko local tests se complete mat mark karo.

Search Console mein current browser account ko `skillbun.tech` property access denied mila; property picker mein accessible site nahi thi. Existing verified owner account se login karke sitemap/indexing result check karna hoga. Nayi ownership verification ya access grant is audit mein perform nahi hua.

Neeche 6 October release ka historical deployment record hai; usko latest local fix ki deployment proof mat samjho.

Release continuation: `2.10.67`, 6 October 2026. Is release mein storage/account isolation, C# search validation, BunBot context/CAPTCHA cleanup, truthful product copy, workforce PDF snapshot/validation aur learning resources ke targeted fixes hain. Commit `095aa3ba` ka GitHub CI pass hai; Vercel deployment `dpl_ForpUFhwaTpRvb6SJD9oCRFQUvrr` Production Ready aur `skillbun.tech`/`www.skillbun.tech` aliases par verified hai. Post-deployment logs mein 448/448 read-only checks aur 100/100 roadmap JSON matches pass hain. Ye dated release evidence hai; subsequent changes ki deployment separately verify karni hai.

## Is continuation ke liye user-side steps

1. **Hosting revision check karo.** Git release ke baad Vercel Production mein wahi commit Ready aur `skillbun.tech` par assigned hona chahiye. Failed deployment mein existing protections ko disable mat karo.
2. **Existing guide key preserve karo.** `DOCS_ENCRYPTION_KEY` aur matching controlled source backups zaroor available rahein. 3,335 encrypted guides + index local authentication pass hue; deployment ke baad signed-in sample guide kholkar verify karo. Key rotate karna is patch ka part nahi hai.
3. **Koi naya service/env setup required nahi hai.** Is continuation ne Firestore rules, schemas, AI provider keys, SMTP settings ya environment-variable names change nahi kiye. Neeche purane release ki configuration guidance sirf existing settings ko verify karne ke liye hai; rules ko bina change ke dobara deploy karna required nahi hai.
4. **Controlled integration checks pending hain.** Owner/admin/intern access matrix, live certificate mint/PDF, actual SMTP delivery, Google popup/OTP inbox, backup restore aur cloud IAM ko approved test workflow mein verify karo. Audit mein real data deletion, certificate issuance ya mail send nahi hua.
5. **Residual checks record karo.** Production dependency audit clean hai. Full audit mein ek unpatched lint-only `braces` advisory ke 5 dependency-chain entries hain; compatible patched release aane par tooling update/recheck karo. Resource audit mein blocked/inconclusive URLs retained hain; unko broken declare karke bulk remove mat karo.

## 1. Release se pehle checks complete karo

Final unit tests, lint, production build aur template guard ka result [remediation report](AUDIT_REMEDIATION.md) mein record karo. Local preview `http://127.0.0.1:3000` par mobile roadmap categories, light/dark theme, BunBot topic return, language scope aur modal keyboard behavior check karo. Generated logs, cache folders, dependencies, local credentials aur agent tools release mein include mat karo.

Repo rule ke hisaab se current release version `2.10.66` se `2.10.67` hai; package aur lockfile root versions match karte hain. README ka removed inline changelog wapas add nahi kiya gaya.

## 2. Hosting environment verify karo

Vercel project **skillbun** mein aapki explicit approval ke baad naya 256-bit random `EMAIL_PREFERENCE_SECRET` sensitive Production setting ke roop mein configure kiya gaya hai, aur `APP_ORIGIN=https://skillbun.tech` set hai. Existing secrets ko decrypt/export nahi kiya gaya; koi secret value chat ya Git mein nahi gayi. Baaki existing service configuration preserve hai. Future verification/rotation ke liye actual secrets sirf hosting secret fields mein rakho.

| Setting | Kya chahiye |
| --- | --- |
| `APP_ORIGIN` | Exact `https://skillbun.tech`. Path, user information ya custom port mat add karo. Production password-reset destination isi canonical HTTPS origin se banta hai. |
| `NEXT_PUBLIC_APP_URL` | `https://skillbun.tech`; public configuration badalne ke baad rebuild/redeploy chahiye. |
| `EMAIL_PREFERENCE_SECRET` | Dedicated stable random secret, minimum 32 characters. Agar unset hai to production sirf explicit `HUMAN_PROOF_SECRET` ka minimum-32-character value use kar sakta hai. Short/default placeholder value production ke liye valid nahi hai. |
| `HUMAN_PROOF_SECRET` | Existing human-proof/sign-up configuration ka strong stable secret. Isko rotate karne se current human proofs aur fallback preference links invalidate ho sakte hain. Dedicated email secret rakhna rotation ko alag rakhta hai. |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | Existing Firebase Admin credentials correct project ke liye available rehne chahiye. Firestore durable quota fallback, profiles, consent aur exam state ko inki access chahiye. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional primary shared Redis store. Agar Redis unavailable/unconfigured ho to Firestore fallback healthy hona chahiye. Dono shared stores fail hone par protected production features 503 return karenge; memory-only allowance se abuse gate bypass nahi hoga. |

Existing SMTP, Turnstile, AI-provider aur encryption values preserve karo. Is repair ke liye production AI keys se content regenerate karna ya bulk calls chalana zaruri nahi hai. OTP/reset/system mail ka configured sender `noreply@skillbun.tech` aur human replies `harsh@skillbun.tech` hi rehna chahiye.

Preference secret ko deployments ke beech stable rakho. Naya signed unsubscribe link 90 din valid hota hai; signing-secret rotation purane links ko invalidate karegi.

## 3. Firestore rules aur application saath release karo

Changed `firestore.rules` ko pehle emulator/staging mein test karo: owner profile save with server metadata, immutable server fields, active staff valid milestone update, invalid type/status/URL/time rejection aur terminated staff denial. Sirf source text check rules execution ka proof nahi hai.

Release window mein final application revision aur usi revision ke rules publish karo. Correct Firebase project select karke **sirf intended Firestore rules** deploy karo; unrelated Functions/IAM configuration ko accidental full deploy se change mat karo. Hosting application ko bhi final checked revision se deploy karo. Purane rules par naya client chalane se age declaration/profile save fail ho sakta hai; purane client aur naye exam protocol ka mix bhi avoid karo.

Production mein deployed commit/revision aur rules deployment record compare karo. Deployment successful dikhna authenticated flows ka proof nahi hai; next step ke controlled checks bhi karo.

## 4. Existing users ke changes samjho

- **Age:** existing student profile mein `ageBand: '18-plus'` missing ho to user se onboarding mein explicit 18-or-older declaration li jayegi. Age infer karke bulk backfill mat karo. Ye self-declaration hai, identity/age document verification nahi. Younger students ke liye verified guardian flow abhi available nahi hai.
- **Marketing:** existing missing consent ka meaning opted-in nahi hai. Bulk `marketingConsent: true` mat set karo. User ko unchecked onboarding option ya authenticated Account Settings se choice dene do. Force-send consent/suppression override nahi karta. Transactional security/account messages alag category hain.
- **Old email links:** email-only unsigned unsubscribe links anonymous action authorize nahi karenge. User sign in karke Settings mein preference manage kar sakta hai. Naye emails signed links use karenge; purani email-only bypass route wapas enable mat karo.
- **Exam:** protocol 2 har question ko server se deadline ke saath serve karta hai. Purane protocol ke ACTIVE attempts new timing ko bypass nahi kar sakte; unki short expiry ke baad student naya attempt start kare. Existing history/cooldown/certificate records bulk delete mat karo.
- **Workforce:** terminated/revoked staff ko fresh login se old milestone access nahi milna chahiye. Offboarding ka saved `terminated_at` marker repeated/concurrent certificate aur mail creation rokta hai, COMPLETED status wale alumni record par bhi. Historical certificates jinka owner galat issuer UID hai unko separately inventory/review karo; bina record-specific evidence ke bulk ownership migration mat karo. Safe mail-failure message delivery review maangta hai; uncertain SMTP action ko blindly retry karne ke bajay dispatch record review karo. Marker ya action lock clear karke normal offboarding dobara mat chalao.

## 5. Live smoke check

Low-volume checks apne controlled test identities ke saath karo. Real student records ya emails ko test data mat banao.

1. Apex aur www HTTPS kholkar root/deep link/query redirect verify karo. Cloudflare **Full (strict)** preserve karo; SSL failure chhupane ke liye mode weak mat karo.
2. Guest roadmap → Ask BunBot → login → required onboarding ke baad wahi topic khulna chahiye. Normal homepage CTA ka quiz journey bhi check karo.
3. Legacy test profile ko explicit age declaration ke baad save karo; server metadata ho to bhi normal profile update work kare. Account Settings se valid preference read/opt-in/opt-out check karo; other-user aur unsigned access denied ho.
4. Test workforce account mein active assigned task work kare; unassigned/terminated fresh-token identity denied ho. Direct SDK invalid writes bhi rules deny karein.
5. Local/staging controlled exam mein late answer incorrect, finalized answer immutable aur retry safe hona chahiye. Correct difficulty mix, pass threshold, daily quota aur cooldown preserve hon. Real live certificate mint ko generic smoke test ka side effect mat banao.
6. Sensitive API success/errors par no-store headers aur safe error messages verify karo. Shared protection store down ho to retryable 503 aaye; provider/mail call unchecked na chale.
7. Mobile roadmap category hit targets, no horizontal page overflow, both themes, reduced motion, language scope aur modal Tab/Shift+Tab/Escape/focus restore verify karo.

SMTP delivery, Google popup login, Firebase direct-signup blocking, IAM, analytics consent, full role/ownership matrix aur every external video/resource ko sirf local build se verified mat mark karo. Unke actual controlled check results remediation report mein alag record karo.

## 6. Monitoring aur recovery

Release ke baad 503 protection failures, auth/profile permission errors, exam-answer retries aur workforce action locks dekho. Error request ID se diagnose karo; raw secret-bearing error payload public response mein add mat karo. Issue ho to application/rules ka compatible tested pair restore karo, consent or timing guards remove karke temporary success mat dikhao. Link/credential checked dates periodic editorial review ke liye use karo.
