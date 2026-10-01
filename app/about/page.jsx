import Link from 'next/link';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech';

export const metadata = {
  title: { absolute: 'About SkillBun – Empowering Tech Students with AI Career Guidance' },
  description: 'Learn how SkillBun bridges the gap between academic computer science curricula and modern tech industry expectations through AI guidance, roadmaps, and verified certifications worldwide.',
  alternates: {
    canonical: `${siteUrl}/about`,
  },
  openGraph: {
    title: 'About SkillBun – Empowering Tech Students with AI Career Guidance',
    description: 'Learn how SkillBun helps tech and computer science students worldwide find their ideal career path through AI guidance, structured roadmaps, and verified certifications.',
    url: `${siteUrl}/about`,
    siteName: 'SkillBun',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'SkillBun About' }],
  },
};

export default function AboutPage() {
  return (
    <div className="static-page">
      <h1>About SkillBun</h1>
      <p><em>Last updated: September 30, 2026</em></p>

      <p>
        SkillBun is an AI-powered career discovery and skill verification platform designed for computer science, software engineering, and tech students worldwide.
        We built this platform to bridge the gap between academic curricula and industry demands, reducing career confusion and converting abstract guidance into concrete, executable next steps.
      </p>

      <h2>The Problem We're Solving</h2>
      <p>
        The technology landscape evolves faster than university syllabi. Students often find themselves overwhelmed by the sheer volume of choices—from Data Science and Full-Stack Development to Cloud Architecture and Cybersecurity.
        Without personalized mentorship, it is easy to invest time in outdated tech stacks or misaligned career paths. SkillBun provides that missing personalized, data-driven mentorship layer at scale.
      </p>

      <h2>What We Built</h2>
      <p>
        Our ecosystem revolves around five core capabilities designed to provide a continuous, adaptive learning journey:
      </p>
      <ul>
        <li><strong>Adaptive AI Quiz Engine:</strong> A career discovery quiz that adapts to your answers about interests, work preferences, and technical scenarios to recommend career paths.</li>
        <li><strong>100+ Interactive Career Roadmaps:</strong> High-fidelity, granular career trees (AI/ML, Fullstack, DevOps, Cybersecurity, Mobile Development, Systems Programming) that visually demonstrate exactly what skills to learn, and in what order.</li>
        <li><strong>Bun-Bot (AI Career Counsellor):</strong> A dedicated AI chat that uses your profile and current conversation to help with career questions, roadmap choices, and study planning.</li>
        <li><strong>SkillBun Vault (SBV1) Study Guides:</strong> Encrypted topic guides with curated video and documentation resources available through roadmap nodes. Resources vary by topic, and full guides require sign-in.</li>
        <li><strong>Verified Digital Certification:</strong> Reaching 60% roadmap progress unlocks a 10-question exam with focus and copy controls. A score of at least 70% earns a publicly verifiable certificate at <code>/certificate/[id]</code>.</li>
      </ul>

      <h2>100% Free Policy</h2>
      <p>
        SkillBun is <strong>100% Completely Free</strong> for all students. We believe high-quality career guidance and skill verification should be universally accessible. All 100+ roadmaps, study guides, AI quizzes, Bun-Bot counsellor chats, and digital certificates are 100% free without subscriptions, paywalls, or credit card requirements.
      </p>

      <h2>Our Technology & Ethics</h2>
      <p>
        We believe in transparent, secure infrastructure. SkillBun leverages advanced open-access LLMs and native intelligence engines strictly for personalized guidance, orchestrated through robust validation pipelines.
        We enforce rigorous technical safeguards including rate limiting, human-verification controls (Cloudflare Turnstile), and secure data isolation. Profile and roadmap-progress data are stored in Cloud Firestore with Firebase security rules that restrict each user to their own documents.
      </p>

      <h2>Our Mission</h2>
      <p>
        Our core mission is straightforward: to make career direction clearer, faster, and more actionable for the next generation of software engineers, cloud architects, and tech leaders globally—without hiding essential guidance behind paywalls, intrusive advertisements, or unnecessary complexity.
      </p>

      <h2>Team</h2>
      <p>
        Built and maintained by Reish.
      </p>
      <div style={{ marginTop: '2rem' }}>
        <Link href="/contact" className="cta-button" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', backgroundColor: 'var(--brand-color, #22c55e)', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
          Contact Us
        </Link>
      </div>
    </div>
  );
}
