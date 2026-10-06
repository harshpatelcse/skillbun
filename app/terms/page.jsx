const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech';

export const metadata = {
  title: { absolute: 'Terms of Use – SkillBun' },
  description: 'SkillBun Terms of Use — conditions, guidelines, and rules for platform usage.',
  alternates: {
    canonical: `${siteUrl}/terms`,
  },
  openGraph: {
    title: 'Terms of Use – SkillBun',
    description: 'SkillBun Terms of Use — conditions, guidelines, and rules for platform usage.',
    url: `${siteUrl}/terms`,
    siteName: 'SkillBun',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'SkillBun Logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Use – SkillBun',
    description: 'Conditions, guidelines and rules for using SkillBun.',
    images: ['/logo.png'],
  },
};

export default function TermsPage() {
  return (
    <div className="static-page">
      <h1>Terms of Use</h1>
      <p><em>Effective date: October 3, 2026</em></p>

      <h2>1. Acceptance of the Terms</h2>
      <p>
        By accessing, browsing, registering for, or using the services provided by SkillBun (collectively, the "Platform"), you agree to be bound by these Terms of Use ("Terms") and all applicable local, national, and international laws and regulations. If you do not agree to all of these Terms, you are prohibited from using or accessing the Platform. These Terms should be read together with our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        SkillBun is an AI-assisted career discovery and interactive educational ecosystem designed to guide tech students. The Platform provides users with tools such as adaptive career quizzes, custom technology roadmaps, progress tracking, peer-sharing assets, a verifiable certification system, and an AI career advisor ("Bun-Bot").
      </p>
      <p>
        <strong>AI disclosure:</strong> Bun-Bot and parts of the Adaptive Quiz are powered by artificial intelligence. You are interacting with an AI system, not a human counsellor. AI outputs may be incomplete or inaccurate and must be independently verified (see Section 8).
      </p>

      <h2>3. Eligibility &amp; Accounts</h2>
      <p>
        To access key features (like saving roadmap milestones, chatting with Bun-Bot, and taking the certification exams), you must create an account. You can register using Google Sign-In or your email address, powered by Firebase Authentication.
      </p>
      <ul>
        <li>You agree to provide accurate, current, and complete profile information during the onboarding flow.</li>
        <li>You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</li>
        <li>Self-service accounts are currently available only to adults aged 18 or older. You must confirm this age eligibility before signup and onboarding. Do not create an account if you are below 18.</li>
        <li>SkillBun does not currently offer a verified parental or guardian approval flow for younger students. An age declaration is self-reported and is not independent age verification.</li>
        <li>SkillBun reserves the right to terminate accounts that are inactive, fraudulent, or involved in malicious activity.</li>
      </ul>

      <h2>4. Intellectual Property Rights &amp; License</h2>
      <p>
        Unless otherwise stated, all material on the Platform, including but not limited to the SkillBun wordmark, logos, "bunny" branding motifs, source code, UI/UX designs, algorithms, and aggregated roadmap schemas, is the exclusive intellectual property of Team SkillBun.
      </p>
      <ul>
        <li><strong>Creative Commons License:</strong> SkillBun-authored learning content, including the 3,335 study guide documents available on the Platform, is licensed under the <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank" rel="noopener noreferrer"><strong>Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND 4.0)</strong></a>. You may share unmodified material for non-commercial purposes with appropriate attribution and a link to the license. You may not distribute adapted material under this license. Linked third-party videos, documentation, courses, and books remain subject to their respective owners' terms and licenses.</li>
        <li><strong>Encrypted Vault Protection:</strong> Our study guides and quiz question banks are protected by a proprietary multi-layer encryption standard called SkillBun Vault (SBV1). Access is provided through authorised Platform features. Unauthorised access or attempts to bypass authentication or security controls may result in account restrictions and legal action. These access controls do not remove rights granted by the cited content license or applicable law.</li>
      </ul>

      <h2>5. Academic Integrity &amp; Certification Proctoring</h2>
      <p>
        SkillBun offers digital certificates as records of passing its roadmap assessments. Reaching at least 60% roadmap progress unlocks the exam; passing it does not certify completion of every roadmap topic or professional competence. The certification exam incorporates integrity controls:
      </p>
      <ul>
        <li>The exam interface blocks text selection, right-click context menus, and copy/paste. It detects window focus loss, displays a warning, and terminates an attempt after the configured violation limit; it cannot prevent switching windows or guarantee that external assistance is detected.</li>
        <li>The certification workspace features user-identifying watermarks (name, email address, and IP address) and LLM-refusal text overlays to deter external assistance.</li>
        <li><strong>Exam Attempt Rules:</strong> Users are restricted to 2 continuous exam attempts. Failing both triggers a mandatory 1-hour study cooldown. A maximum of 3 attempts is permitted per 24-hour window per roadmap.</li>
        <li>Each question must be answered within 45 seconds; the exam requires a score of 70% or higher to pass.</li>
        <li>Any attempt to bypass the timer, spoof results, use automated scripts, or leverage external AI tools to solve the assessment constitutes a breach of these Terms and will result in the forfeiture of your certificates.</li>
      </ul>
      <p>
        By starting a proctored exam you acknowledge and consent to the watermark and anti-cheat processing described above and in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>6. Certificates — Scope &amp; Disclaimers</h2>
      <p>
        SkillBun certificates are issued as records of completion of SkillBun's own assessments. They represent a verified milestone within a SkillBun roadmap.
      </p>
      <ul>
        <li>SkillBun certificates are <strong>not degrees, diplomas, or government-recognised qualifications</strong>, and are not affiliated with, accredited by, or endorsed by any university, UGC, AICTE, or government body.</li>
        <li>Issued credential details are intended to remain unchanged. A certificate may be <strong>revoked</strong> (marked invalid on the public verification page) if it was obtained in breach of these Terms. Deleting your student account also deletes its earned roadmap certificates, so those verification links will stop working. Workforce credentials and legal records are handled separately under our <a href="/privacy">Privacy Policy</a>.</li>
        <li>Anyone with a certificate link or ID can view the public verification page, which displays the holder's name, credential details, and issue date.</li>
      </ul>

      <h2>7. Acceptable Use Policy</h2>
      <p>
        When using SkillBun, you agree <strong>not</strong> to:
      </p>
      <ul>
        <li>Systematically scrape, crawl, download, or mine data, schemas, or study guide markdown files from the Platform.</li>
        <li>Circumvent or attempt to bypass security measures, Cloudflare Turnstile human-verification challenges, or rate limiters on AI services.</li>
        <li>Submit, upload, or transmit any offensive, defamatory, or unlawful material, or input highly sensitive personally identifiable information (PII) in AI prompt fields.</li>
        <li>Impersonate another person during a proctored exam or attempt to obtain a certificate on someone else's behalf.</li>
        <li>DDoS, overload, or otherwise compromise the performance or availability of our servers.</li>
      </ul>

      <h2>8. Disclaimers &amp; Limitations of Liability</h2>
      <p>
        The Platform is provided on an "AS IS" and "AS AVAILABLE" basis. While we strive to provide highly accurate roadmap structures and verified learning resources, Team SkillBun makes no warranties, expressed or implied, regarding:
      </p>
      <ul>
        <li>The absolute correctness, completion, or up-to-date nature of study guides, video playlists, or AI-generated recommendations.</li>
        <li>Guaranteed job placements, college admissions, internships, salaries, or financial outcomes. Salary ranges shown in roadmaps are <strong>SkillBun editorial planning estimates, not a verified salary survey</strong>. Actual offers vary by location, employer, experience, and date; the displayed ranges are not promises of earnings.</li>
        <li>The accuracy of LLM outputs. AI language models are subject to hallucinations, and responses from Bun-Bot should be validated independently.</li>
      </ul>
      <p>
        To the maximum extent permitted by applicable law, Team SkillBun and its members shall not be liable for any indirect, incidental, special, or consequential damages (including, without limitation, loss of data, career opportunities, or tuition fees) arising out of your use of or inability to use the Platform. Nothing in these Terms limits any right you have under mandatory consumer-protection law, including India's Consumer Protection Act, 2019.
      </p>

      <h2>9. Your Privacy &amp; Data Rights</h2>
      <p>
        Our handling of your personal data — including analytics consent, AI providers, proctored-exam watermarks, public certificates, retention, and your rights of access, correction, erasure, and grievance redressal — is described in our <a href="/privacy">Privacy Policy</a>, which forms part of these Terms.
      </p>

      <h2>10. Grievance Redressal</h2>
      <p>
        If you have a complaint about the Platform, a certificate, content, or any of these Terms, contact our Grievance Officer:
      </p>
      <ul>
        <li><strong>Name:</strong> Harsh Patel (Founder)</li>
        <li><strong>Email:</strong> <a href="mailto:harsh@skillbun.tech">harsh@skillbun.tech</a></li>
      </ul>
      <p>
        We acknowledge grievances within 30 days and aim to resolve them promptly. This section is without prejudice to any statutory grievance or redressal mechanism available to you.
      </p>

      <h2>11. Governing Law &amp; Jurisdiction</h2>
      <p>
        These Terms and any dispute or claim arising out of or in connection with them shall be governed by and construed in accordance with the laws of India. Subject to any mandatory consumer-protection venue rights, any legal action or proceeding relating to your access to, or use of, the Platform shall be instituted in a state or federal court located in New Delhi, Delhi, India, and you hereby consent to the personal jurisdiction of such courts.
      </p>

      <h2>12. Modifications to the Platform &amp; Terms</h2>
      <p>
        SkillBun is a dynamic project and will iterate over time. We reserve the right to modify, suspend, or discontinue any part of the Platform at any time. We may also revise these Terms from time to time. The date of the latest update will always be indicated in the "Effective date" section. Your continued use of the Platform after changes are posted constitutes acceptance of the new Terms.
      </p>

      <h2>13. Contact Information</h2>
      <p>
        For any questions regarding these Terms of Use, intellectual property permissions, or feedback, please contact us at: <a href="mailto:harsh@skillbun.tech">harsh@skillbun.tech</a>
      </p>
    </div>
  );
}
