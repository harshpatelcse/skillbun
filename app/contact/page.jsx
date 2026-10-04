import './contact.css';

const supportCards = [
  {
    kind: 'action',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    eyebrow: 'Primary support',
    title: 'Help & Support',
    description: 'Platform questions, feedback, feature requests, account issues, or anything that needs the team.',
    ctaHref: 'mailto:harsh@skillbun.tech',
    ctaLabel: 'Email Support (Harsh)',
  },
  {
    kind: 'action',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/>
      </svg>
    ),
    eyebrow: 'Business & Partnerships',
    title: 'Partnerships & Inquiries',
    description: 'Collaborations, escalations, partnerships, or broader SkillBun conversations.',
    ctaHref: 'mailto:harsh@skillbun.tech',
    ctaLabel: 'Email Harsh',
  },
  {
    kind: 'info',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/>
        <path d="M8 7h8"/>
        <path d="M8 11h8"/>
        <path d="M8 15h5"/>
      </svg>
    ),
    eyebrow: 'Before you send',
    title: 'Share the right context',
    items: [
      'Your full name and role.',
      'What you were trying to do.',
      'Any screenshots, links, or steps.',
    ],
  },
  {
    kind: 'info',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
      </svg>
    ),
    eyebrow: 'Best fit',
    title: 'What we can help with',
    items: [
      'Quiz, results, and roadmap questions.',
      'Profile, onboarding, and account access.',
      'Feature feedback and partnership follow-up.',
    ],
  },
];

const faqItems = [
  {
    question: 'How does the AI career quiz work?',
    answer:
      'Our adaptive career discovery quiz uses your background, technical interests, work preferences, and answers to practical scenarios to suggest career paths. The recommendations help you explore options; the quiz does not certify technical proficiency.',
  },
  {
    question: 'Are the career roadmaps and certifications completely free?',
    answer:
      'Yes, 100%! All 100+ interactive tech roadmaps, curated study guides, video resources, Bun-Bot AI counsellor guidance, and official digital certificates are completely free for all students and learners with zero paywalls.',
  },
  {
    question: 'How do I earn and verify an official SkillBun Certificate?',
    answer:
      'At 60% roadmap progress, you unlock a timed exam with 10 questions randomly selected from a fixed 50-question bank. Scoring at least 70% lets you earn a SkillBun certificate with a QR code and public verification URL. The exam includes focus-loss warnings and copy controls.',
  },
  {
    question: 'How do I talk to Bun-Bot AI Counsellor?',
    answer:
      'Open the Bun-Bot counsellor page from SkillBun or a roadmap link, then sign in to chat. You can ask role-specific questions, clarify technical concepts, explore project ideas, and discuss your learning plans.',
  },
  {
    question: 'How is my learning progress tracked and saved?',
    answer:
      'When you are signed in, completed roadmap nodes are saved to your account so you can resume on another device. Your profile and earned certificates are also linked to your account. Career quiz results stay in the current quiz session and are not saved across devices.',
  },
  {
    question: 'Can I retake the career quiz or explore multiple roadmaps?',
    answer:
      'Yes. You can retake the career discovery quiz as your interests evolve, or explore and study multiple roadmaps across AI, Fullstack, DevOps, Cybersecurity, Mobile, and more. Roadmaps with recorded progress appear in your saved paths. Certification exams have separate attempt limits and cooldowns.',
  },
  {
    question: 'What resources are included in each roadmap topic?',
    answer:
      'Roadmap topics can include study guides, video tutorials, documentation links, and project ideas. Available resources vary by topic. Full study guides require a signed-in account.',
  },
  {
    question: 'Why do I need to log in to read full study guides?',
    answer:
      'To protect our proprietary educational content and track individual student milestone completion, detailed deep-dive study guides are securely decrypted and served to authenticated student accounts.',
  },
  {
    question: 'Can I share my SkillBun Certificate on LinkedIn or resumes?',
    answer:
      'Yes. Certificates have a public verification link at skillbun.tech/certificate/[id] that shows the recorded credential details and revocation status while the record exists. Deleting your student account also deletes its roadmap certificates; workforce and legal records are retained separately.',
  },
  {
    question: 'How can I suggest a new roadmap, report an issue, or contribute?',
    answer:
      'Email harsh@skillbun.tech to suggest topics, report broken links, or propose roadmap improvements. Include the relevant page link and steps to reproduce an issue. Our official Instagram and LinkedIn channels are listed above for public updates.',
  },
];

const faqColumnSize = Math.ceil(faqItems.length / 2);
const faqColumns = [
  faqItems.slice(0, faqColumnSize),
  faqItems.slice(faqColumnSize),
];

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech';

export const metadata = {
  title: { absolute: 'Contact Us – SkillBun Support & Inquiries' },
  description: 'Have questions, feedback, or need help with SkillBun roadmaps or certifications? Get in touch with the SkillBun team.',
  alternates: {
    canonical: `${siteUrl}/contact`,
  },
  openGraph: {
    title: 'Contact Us – SkillBun Support & Inquiries',
    description: 'Get in touch with the SkillBun team for support, feedback, or inquiries.',
    url: `${siteUrl}/contact`,
    siteName: 'SkillBun',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Contact SkillBun' }],
  },
  twitter: {
    card: 'summary',
    title: 'Contact Us – SkillBun Support & Inquiries',
    description: 'Get in touch with the SkillBun team for help with roadmaps, certificates or platform feedback.',
    images: ['/logo.png'],
  },
};

export default function ContactPage() {
  return (
    <main className="contact-wrapper">
      <div className="bg-grid-overlay"></div>

      <div className="floater-contact float-1" aria-hidden="true">
        {'<Connect />'}
      </div>
      <div className="floater-contact float-2" aria-hidden="true">
        {'{ status: 200 }'}
      </div>
      <div className="floater-contact float-3" aria-hidden="true">
        {'await response'}
      </div>

      <div className="contact-container">
        <section className="contact-board" aria-labelledby="contact-title">
          <header className="contact-intro glass-panel">
            <span className="glow-badge">SYSTEM.ONLINE</span>
            <p className="contact-kicker">SkillBun Support Desk</p>
            <h1 id="contact-title">Contact SkillBun.</h1>
            <p className="contact-hero-text">
              Pick the clearest lane, add the right context, and we can help without extra back-and-forth.
            </p>

            <div className="contact-meta-grid" aria-label="Support coverage">
              <span>Support</span>
              <span>Roadmaps</span>
              <span>Partners</span>
            </div>
          </header>

          <div className="support-grid" aria-label="Contact options">
            {supportCards.map((card) => (
              <article
                key={card.title}
                className={`support-card glass-panel ${
                  card.kind === 'action' ? 'support-card-primary' : 'support-card-secondary'
                }`}
              >
                <div className="support-card-icon" aria-hidden="true">
                  {card.icon}
                </div>
                <div className="support-card-body">
                  <p className="support-card-eyebrow">{card.eyebrow}</p>
                  <h2>{card.title}</h2>
                  {card.description ? <p className="support-card-text">{card.description}</p> : null}
                  {card.items ? (
                    <ul className="support-card-list">
                      {card.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {card.ctaHref ? (
                  <a href={card.ctaHref} className="contact-button">
                    {card.ctaLabel}
                  </a>
                ) : null}
              </article>
            ))}
          </div>

          <aside className="contact-side" aria-label="Support details">
            <div className="contact-route glass-panel">
              <p className="contact-hero-rail-label">Fastest route</p>
              <ul className="contact-hero-rail-list">
                <li>Choose the lane that matches your request.</li>
                <li>Add your role, issue, and screenshots.</li>
                <li>Use social channels for public updates.</li>
              </ul>
            </div>

            <div className="social-section glass-panel">
              <div className="section-heading section-heading-compact">
                <div>
                  <p className="section-kicker">Public channels</p>
                  <h2>Follow the build.</h2>
                </div>
                <p className="section-copy">
                  Official channels for launches, updates, and public-facing SkillBun moments.
                </p>
              </div>

              <div className="social-links">
                <a
                  href="https://www.instagram.com/skillbun.tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-badge"
                  aria-label="SkillBun Instagram (opens in a new tab)"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <circle cx="12" cy="12" r="5" />
                    <circle cx="17.5" cy="6.5" r="1.2" />
                  </svg>
                  Instagram
                </a>
                <a
                  href="https://www.linkedin.com/company/skillbun-tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-badge"
                  aria-label="SkillBun LinkedIn (opens in a new tab)"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                    <rect x="2" y="9" width="4" height="12" />
                    <circle cx="4" cy="4" r="2" />
                  </svg>
                  LinkedIn
                </a>
              </div>
            </div>
          </aside>
        </section>

        <section className="faq-panel" aria-labelledby="faq-title">
          <div className="section-heading section-heading-compact">
            <div>
              <p className="section-kicker">Quick answers</p>
              <h2 id="faq-title">Things you may not need to email us for.</h2>
            </div>
            <p className="section-copy">
              Short answers to the questions we see most often from students exploring SkillBun.
            </p>
          </div>

          <div className="faq-section">
            {faqColumns.map((column, columnIndex) => (
              <div className="faq-column" key={`faq-column-${columnIndex}`}>
                {column.map((item) => (
                  <details className="faq-item glass-panel" key={item.question}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
