# SkillBun SEO: simple go-live checklist

Prepared: 3 October 2026. Yeh checklist repository mein kiye SEO changes ko live hone ke baad Google/Bing se connect aur measure karne ke liye hai. Google ranking, indexing, traffic ya first position guaranteed nahi hai.

## 1. Changes deploy karo

Normal reviewed release ke through site deploy karo. Is SEO work ke liye koi naya package, API key, paid SEO tool ya backend service required nahi hai. Existing `NEXT_PUBLIC_APP_URL`, agar configured hai, production mein `https://skillbun.tech` hona chahiye. Existing app/security environment settings ko change mat karo.

Release ke baad ye links open karo:

- `https://skillbun.tech/career-guidance`: public guide aur quiz start link.
- `https://skillbun.tech/roadmap`: Saved/Explore ke neeche complete roadmap directory.
- `https://skillbun.tech/sitemap.xml`: public pages aur 100 roadmap URLs.
- `https://skillbun.tech/robots.txt`: sitemap link aur public crawling.

Local verification: `npm run audit:seo -- http://127.0.0.1:3000`. Production verification: `npm run audit:seo -- https://skillbun.tech`. Agar approved canonical host alag hai, third argument mein canonical origin do. Script read-only hai; public pages aur noindex metadata check karta hai. Yeh Google indexing ka proof nahi hai.

## 2. Google Search Console verify karo

1. [Google Search Console](https://search.google.com/search-console) kholo aur apne Google account se sign in karo.
2. Existing `skillbun.tech` property already verified hai toh usi ko use karo. Duplicate property banana zaroori nahi.
3. Property nahi hai toh **Add property → Domain → skillbun.tech** choose karo.
4. Google jo exact DNS TXT record de, use apne domain DNS provider mein add karo. Existing DNS records delete/replace mat karo.
5. DNS verification complete karo. Record ko verification ke baad bhi rehne do.
6. **Sitemaps** mein `https://skillbun.tech/sitemap.xml` submit karo.
7. **URL Inspection → Test live URL** se homepage, `/career-guidance`, `/roadmap`, `/projects`, `/roadmap/frontend` aur `/roadmap/data_science` check karo. Valid pages ke liye **Request indexing** use kar sakte ho. Ek hi URL ko baar-baar submit karne se ranking boost nahi hota.

DNS verification se site code mein secret ya verification token hard-code karne ki zaroorat nahi. Ownership, sitemap acceptance aur actual indexing user ke Search Console account mein verify karne hain; local code check se yeh confirm nahi hote.

## 3. Bing mein submit karo

1. [Bing Webmaster Tools](https://www.bing.com/webmasters/) kholo.
2. Verified Search Console property import karo, ya Bing ka ownership verification complete karo.
3. `https://skillbun.tech/sitemap.xml` submit karo.

IndexNow is task ka required dependency nahi hai. Ordinary sitemap discovery se start kar sakte ho.

## 4. Pehle relevant searches target karo

[Keyword strategy](SEO_KEYWORD_STRATEGY.md) aur [complete keyword CSV](SEO_KEYWORDS.csv) dekho. CSV research candidates hain; measured search volume, keyword difficulty ya current ranking nahi.

Priority examples:

| Search intent | Target page |
|---|---|
| Free AI career guidance for tech students; tech career quiz | `/career-guidance` |
| Free developer roadmaps; tech career learning paths | `/roadmap` |
| Frontend developer roadmap; HTML CSS JavaScript learning path | `/roadmap/frontend` |
| Full stack developer roadmap | `/roadmap/fullstack` |
| Data science roadmap | `/roadmap/data_science` |
| AI ML engineer roadmap | `/roadmap/ai_ml_engineer` |
| Cybersecurity learning roadmap | `/roadmap/cybersecurity` |
| DevOps and cloud roadmap | `/roadmap/devops_cloud` |
| Tech portfolio and capstone project ideas | `/projects` |

Har keyword ki alag duplicate page mat banao. Ek helpful page same intent ke multiple searches cover kar sakta hai. `meta keywords` mein hundreds of words paste karne se Google ranking nahi badhti.

## 5. Actual performance se next changes decide karo

- Search Console **Performance → Search results** mein queries, pages, impressions, clicks, CTR aur average position dekho. India aur other relevant countries ko compare kar sakte ho; kisi country ko artificially claim mat karo.
- Deployment date note karo. Sufficient data aane par equal-length periods compare karo; daily position changes par unnecessary rewrites mat karo.
- High impressions, low CTR: page ka title/description query intent ke closer banao, promise wahi jo page deliver karta hai.
- Relevant query par low position: stronger practical examples, project walkthroughs, prerequisites aur accurate internal links add karo.
- Pages report mein intended public pages ke indexing issues inspect karo. Personal account, quiz, exam, individual certificate, document-vault aur placeholder pages ka `noindex` intentional hai.
- **Core Web Vitals** report real users ka data dikhata hai. Mobile LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 useful targets hain; local page opening in scores ka substitute nahi.

## 6. Authority aur useful content build karo

Original, reviewed project walkthroughs aur career comparisons publish karo jo students ko actual decisions mein help karein. Real college clubs, developer communities aur project contributors se relevant links earn karo; paid backlink spam, fake testimonials, copied articles aur hundreds of thin city/keyword pages avoid karo.

Advanced roles ke roadmap ko guaranteed beginner-to-job course mat bolo. Vendor exams aur external resources ki fees/access alag ho sakti hain. SkillBun certificate ko degree, vendor certification, accreditation ya job guarantee ke equivalent mat present karo.

## Verification boundary

Repository changes aur local HTTP/UI checks deployment ya Google approval ke equivalent nahi hain. Search Console ownership/index coverage, real rankings, keyword volumes, rich-result eligibility aur field Core Web Vitals ko connected accounts/live deployment ke baad separately verify karna hai.

## Official references

- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google sitemap guide](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google URL Inspection help](https://support.google.com/webmasters/answer/9012289)
- [Google title-link guidance](https://developers.google.com/search/docs/appearance/title-link)
- [Google people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
