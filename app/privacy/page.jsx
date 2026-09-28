import PrivacyPreferences from '../components/PrivacyPreferences';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech';

export const metadata = {
  title: 'Privacy Policy – SkillBun',
  description: 'SkillBun Privacy Policy — details on how we collect, protect, and handle your data.',
  alternates: {
    canonical: `${siteUrl}/privacy`,
  },
  openGraph: {
    title: 'Privacy Policy – SkillBun',
    description: 'SkillBun Privacy Policy — details on how we collect, protect, and handle your data.',
    url: `${siteUrl}/privacy`,
    siteName: 'SkillBun',
  },
};

export default function PrivacyPage() {
  return (
    <div className="static-page">
      <h1>Privacy Policy</h1>
      <PrivacyPreferences />
      <p><em>Last updated: September 28, 2026</em></p>

      <p>
        At SkillBun, accessible from <a href="https://skillbun.tech" target="_blank" rel="noopener noreferrer">skillbun.tech</a> (and its subdomains), one of our main priorities is the privacy of our visitors and users. This Privacy Policy outlines the types of information collected and recorded by SkillBun, how we use it, who we share it with, how long we keep it, and the rights you have over your data. It is written to align with India's Digital Personal Data Protection Act, 2023 (DPDP Act) and the IT (Reasonable Security Practices) Rules, 2011, as well as internationally recognised privacy standards such as the EU/UK General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Who We Are (Data Controller)</h2>
      <p>
        SkillBun is operated by Team SkillBun, with its principal place of operations in India. For the purposes of applicable data protection law, SkillBun is the "Data Fiduciary" / "data controller" for the personal data described in this policy.
      </p>
      <p>
        Our designated contact for all privacy and data-processing questions (Grievance Officer / data protection contact) is:
      </p>
      <ul>
        <li><strong>Name:</strong> Harsh Patel (Founder)</li>
        <li><strong>Email:</strong> <a href="mailto:harsh@skillbun.tech">harsh@skillbun.tech</a></li>
      </ul>
      <p>
        We acknowledge privacy grievances within 30 days and aim to resolve them within the timelines prescribed under applicable law (including the 90-day outer limit under the DPDP framework once fully in force).
      </p>

      <h2>2. Information We Collect</h2>
      <p>
        We collect information to provide personalised career guidance and to keep the platform secure. The categories of information we collect include:
      </p>
      <ul>
        <li><strong>Account Information:</strong> When you register using Google Sign-In or email/password authentication, we receive your email address, display name, and profile picture URL via Firebase Authentication.</li>
        <li><strong>User Profile Data:</strong> During onboarding you may provide your academic degree/program, year of study, learning interests, and target tech roles. Parts of your profile are also cached in your own browser's local storage (for example, your name, email, degree, year, and interest) so the quiz and Bun-Bot can pre-fill context on your device.</li>
        <li><strong>Progress &amp; Quiz Responses:</strong> We store your answers to the adaptive career quiz, assessment scores, certification attempt history, and completed roadmap nodes.</li>
        <li><strong>Certification &amp; Proctoring Data:</strong> During proctored certification exams, your on-screen exam watermark displays your name, email address, and IP address to deter impersonation and external assistance. Your IP address is also used (transiently) for exam rate limiting and abuse prevention. Attempt records stored by the server include your email address, roadmap, scores, and timestamps.</li>
        <li><strong>Certificates:</strong> When you earn a certificate, a verification record is created that includes your name, email, user identifier, roadmap title, score, and issue date. Your <em>name and roadmap title</em> are displayed on the public verification page (see Section 8).</li>
        <li><strong>Security &amp; Interaction Data:</strong> We process IP addresses, device/browser signals, and human-verification results (via Cloudflare Turnstile) for security, rate limiting, bot mitigation, and abuse prevention.</li>
        <li><strong>Email Preferences:</strong> We store your email subscription and unsubscribe status, and a history of the automated emails we have sent you (subject, category, and date), so we can respect your preferences and frequency limits.</li>
        <li><strong>Analytics Data (only with your consent):</strong> If you accept analytics cookies, we collect usage analytics as described in Section 6.</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li>To personalise your career recommendation outputs and build adaptive learning roadmaps.</li>
        <li>To power Bun-Bot, providing contextually relevant study suggestions and curriculum breakdowns.</li>
        <li>To issue, verify, and display public certifications and academic achievements.</li>
        <li>To detect, prevent, and mitigate fraudulent activity, exam impersonation, bot abuse, and scraping attempts.</li>
        <li>To send transactional emails (for example, password resets) and — subject to your unsubscribe preference — lifecycle and re-engagement emails, with a minimum 72-hour gap between marketing-style messages.</li>
        <li>To comply with legal obligations and respond to lawful requests.</li>
      </ul>
      <p>
        We do not sell, rent, or trade your personal data to third parties for money.
      </p>

      <h2>4. Legal Bases &amp; Consent</h2>
      <p>
        Depending on where you are, we rely on the following bases for processing:
      </p>
      <ul>
        <li><strong>Your consent</strong> — for optional analytics (see Section 6) and for marketing-style lifecycle emails (you can unsubscribe at any time from any such email or from your Settings page).</li>
        <li><strong>Performance of a contract</strong> — to provide the account, quiz, roadmap, and certification services you request.</li>
        <li><strong>Legitimate interests / legal obligation</strong> — for security, anti-abuse, proctoring, rate limiting, and compliance with Indian law (including CERT-In cyber-incident obligations).</li>
      </ul>
      <p>
        Where processing relies on your consent, you may withdraw it at any time with comparable ease (for analytics, via the "Change cookie preferences" button below or on this page; for emails, via the unsubscribe link), and we will stop the relevant processing within a reasonable time.
      </p>

      <h2>5. AI Processing &amp; Service Providers</h2>
      <p>
        The Adaptive Quiz and Bun-Bot chat are powered by a server-side, multi-provider AI gateway. When you submit a query or quiz context, the relevant prompt content is transmitted over encrypted channels to one or more of the following AI inference providers, in cascading order until a valid response is obtained:
      </p>
      <ul>
        <li>Groq (api.groq.com)</li>
        <li>TokenRouter (api.tokenrouter.com)</li>
        <li>Hugging Face Inference Router (router.huggingface.co)</li>
        <li>OpenRouter (openrouter.ai)</li>
        <li>Pollinations (text.pollinations.ai) — a public, zero-credential fallback tier</li>
        <li>Optionally, a self-hosted Ollama endpoint, and a built-in offline fallback engine that runs on our own infrastructure.</li>
      </ul>
      <p>
        We advise you not to submit highly sensitive personal information in free-text AI chat fields. Responses are passed through brand-sanitisation filters before being returned to you.
      </p>
      <p>
        Other service providers that process data on our behalf include:
      </p>
      <ul>
        <li><strong>Google Firebase</strong> — authentication and Cloud Firestore data storage.</li>
        <li><strong>Vercel</strong> — application hosting, edge network, and (consent-gated) analytics/speed insights.</li>
        <li><strong>Cloudflare</strong> — Turnstile human verification and edge security.</li>
        <li><strong>Zoho</strong> — transactional and lifecycle email dispatch via SMTP.</li>
        <li><strong>Upstash / Vercel KV</strong> — rate-limiting and cache storage.</li>
        <li><strong>api.ipify.org</strong> — during proctored exams only, your browser requests your own public IP address so it can be rendered in your exam watermark.</li>
      </ul>

      <h2>6. Analytics, Cookies &amp; Local Storage</h2>
      <p>
        Analytics on SkillBun are strictly <strong>opt-in</strong>. If you decline (or do nothing), no analytics or measurement scripts are loaded. If you accept, we load:
      </p>
      <ul>
        <li><strong>Google Analytics 4</strong> (measurement ID G-XTFMS5Q59C) with ad personalisation permanently denied — used to understand aggregate feature usage.</li>
        <li><strong>PostHog</strong> — product analytics with autocapture, pageview capture, exception capture, and session recording disabled; only explicitly dispatched product events are sent. If you are signed in, your anonymous user identifier (not your email) may be attached so we can understand your learning journey.</li>
        <li><strong>Vercel Analytics &amp; Speed Insights</strong> — privacy-friendly page-view and web-vitals measurement.</li>
      </ul>
      <p>
        You can accept, decline, or change your choice at any time using the "Change cookie preferences" control at the top of this page. Declining immediately disables and unloads the analytics tooling.
      </p>
      <p>
        Independently of analytics, we use a small number of strictly necessary browser storage entries to operate features you explicitly use: your session and Firebase auth token, your theme preference (<code>sb_theme</code>), your language preference (<code>sb_locale</code>), your signed human-verification token, your onboarding profile cache, your roadmap progress cache, quiz state, and email-preference mirrors. We do not use cross-site advertising cookies or tracking pixels.
      </p>

      <h2>7. Proctored Exam Watermark</h2>
      <p>
        To protect the integrity of our certifications, the exam interface overlays a faint watermark containing your name, account email, and public IP address, along with an automated refusal notice addressed to external AI assistants. This watermark exists to deter impersonation, content theft, and unauthorised assistance. By starting a proctored exam, you acknowledge this processing. The watermark data is not pasted into public web pages; attempt records retained on our servers contain your email and exam metadata (see Section 10).
      </p>

      <h2>8. Public Certificate Verification</h2>
      <p>
        Certificates you earn are verifiable by anyone who has your certificate link or ID at <code>/certificate/[id]</code>. The public verification display shows your <strong>name, program/department details, credential title, score (for some certificate types), and issue date</strong>. Your email address and internal identifiers are stored in the verification record to make verification reliable, but they are not rendered on the public page.
      </p>
      <p>
        Certificates are issued as immutable credential records — see our <a href="/terms">Terms of Use</a> for how this interacts with your rights. SkillBun certificates are records of completion of SkillBun's own assessments; they are <strong>not</strong> degrees, diplomas, or government-recognised qualifications.
      </p>

      <h2>9. International Data Transfers</h2>
      <p>
        SkillBun operates from India and uses infrastructure and AI providers located primarily in the United States and the European Union. When you use SkillBun, your personal data (including AI prompt content) may be transferred to and processed in countries other than your own. Where required (for example, for users in the EU/UK), we rely on appropriate safeguards such as standard contractual clauses with our processors. India's DPDP framework permits cross-border transfers except to countries restricted by government notification.
      </p>

      <h2>10. Data Retention</h2>
      <ul>
        <li><strong>Profile &amp; progress data:</strong> retained while your account is active.</li>
        <li><strong>Certification attempt records:</strong> retained for integrity, audit, and cooldown enforcement; expired attempts become ineligible for grading after 8.5 minutes plus a short grace window.</li>
        <li><strong>Certificates:</strong> retained as immutable credential records so third parties can verify them over time. Requests for erasure of a certificate are handled individually (see Section 11) and may involve revoking rather than deleting the credential.</li>
        <li><strong>Email dispatch history:</strong> retained so we can honour frequency limits and your unsubscribe preference.</li>
        <li><strong>Rate-limit and security records:</strong> retained for short rolling windows (minutes to hours) in our rate-limit stores.</li>
        <li><strong>System logs:</strong> retained per our security policies and applicable Indian requirements (including CERT-In's log-retention direction).</li>
      </ul>

      <h2>11. Your Rights &amp; Choices</h2>
      <p>
        Depending on your jurisdiction, you have the following rights over your personal data:
      </p>
      <ul>
        <li><strong>Access</strong> — request a summary of the personal data we hold about you and how it is processed.</li>
        <li><strong>Correction &amp; erasure</strong> — request correction of inaccurate data or deletion of your data.</li>
        <li><strong>Grievance redressal</strong> — raise a complaint via the contact in Section 1; you may also escalate to the Data Protection Board of India (once operational) or your local supervisory authority.</li>
        <li><strong>Nomination</strong> — nominate another individual to exercise your rights on your behalf (per the DPDP Act).</li>
        <li><strong>Withdraw consent</strong> — for analytics and marketing-style emails, at any time and with comparable ease.</li>
        <li><strong>EU/UK additional rights</strong> — restriction of processing, data portability, objection to processing, and the right not to be subject to purely automated decisions with significant effects, with responses within one month (extendable for complex requests).</li>
      </ul>
      <p>
        <strong>Self-service deletion:</strong> you can delete your account through your Profile Settings page. This deletes your Firebase authentication record, your Firestore profile document, your roadmap progress, and your quiz attempt history. Some records may be retained where required for integrity, legal compliance, or credential verification, and immutable public certificates are handled as described in Section 8. For manual requests — access, correction, deletion, or anything else privacy-related — email <a href="mailto:harsh@skillbun.tech">harsh@skillbun.tech</a>.
      </p>

      <h2>12. Children's Privacy</h2>
      <p>
        SkillBun is designed for university and college technology students, and we do not knowingly collect personal information from children. Under India's DPDP framework, individuals below 18 are treated as children and require verifiable parental or guardian consent; under the EU/UK GDPR, the consent age for children ranges from 13 to 16 depending on the country; and under US COPPA the threshold is 13. We are building age-appropriate consent flows to meet the strictest applicable standard. If you believe a child has provided us with personal information, contact us immediately at <a href="mailto:harsh@skillbun.tech">harsh@skillbun.tech</a> so we can remove it.
      </p>

      <h2>13. Security</h2>
      <p>
        All communication is encrypted in transit using TLS/HTTPS. Study guides and quiz question banks are protected by the SkillBun Vault (SBV1) framework — multi-layered cryptography including HKDF key derivation, AES-256-GCM authenticated encryption, and content integrity hashing. Data access is enforced through granular Firestore security rules, server-authoritative APIs, and token-revocation checks. We maintain incident-response procedures aligned with CERT-In's 6-hour incident reporting direction and, once in force, the DPDP breach-notification requirements (notify affected users without delay and the Data Protection Board within 72 hours).
      </p>

      <h2>14. Revisions to This Privacy Policy</h2>
      <p>
        We may update this Privacy Policy periodically to reflect changes in our services, security protocols, or legal requirements. The "Last updated" date at the top of this page indicates the latest revision. Material changes will be highlighted on this page, and your continued use of the platform constitutes agreement to the updated policy.
      </p>

      <h2>15. Contact Us</h2>
      <p>
        For any questions, grievances, or legal inquiries regarding this Privacy Policy, or to exercise any of your rights, contact our Grievance Officer: <a href="mailto:harsh@skillbun.tech">harsh@skillbun.tech</a>
      </p>
    </div>
  );
}
