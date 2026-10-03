import Link from 'next/link';

export const metadata = {
  title: 'Page Not Found',
  description: 'Oops! This page hopped away. Head back to SkillBun and find your perfect tech career path.',
};

export default function NotFound() {
  return (
    <div className="notfound-page">
      {/* Floating code snippets background */}
      <div className="notfound-floaters" aria-hidden="true">
        <span className="nf-floater" style={{ top: '12%', left: '8%', animationDelay: '0s' }}>404: page not found</span>
        <span className="nf-floater" style={{ top: '25%', right: '10%', animationDelay: '1.2s' }}>git checkout main</span>
        <span className="nf-floater" style={{ top: '60%', left: '5%', animationDelay: '2.4s' }}>npm run home</span>
        <span className="nf-floater" style={{ top: '75%', right: '7%', animationDelay: '0.6s' }}>catch (e) {'{'} redirect() {'}'}</span>
        <span className="nf-floater" style={{ top: '40%', left: '12%', animationDelay: '1.8s' }}>while(lost) ask(BunBot)</span>
        <span className="nf-floater" style={{ top: '50%', right: '15%', animationDelay: '3s' }}>return &lt;Home /&gt;</span>
      </div>

      {/* Bunny mascot with confused expression */}
      <div className="notfound-bunny-wrap">
        <svg className="notfound-bunny-svg" viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Left Ear — droopy */}
          <ellipse cx="68" cy="68" rx="16" ry="44" fill="#f0f0f0" transform="rotate(-25 68 68)" />
          <ellipse cx="68" cy="68" rx="8" ry="34" fill="#f9a8d4" transform="rotate(-25 68 68)" />
          {/* Right Ear — droopy */}
          <g className="nf-ear-wiggle">
            <ellipse cx="132" cy="68" rx="16" ry="44" fill="#f0f0f0" transform="rotate(25 132 68)" />
            <ellipse cx="132" cy="68" rx="8" ry="34" fill="#f9a8d4" transform="rotate(25 132 68)" />
          </g>
          {/* Body */}
          <ellipse cx="100" cy="170" rx="55" ry="45" fill="#f0f0f0" />
          {/* Head */}
          <circle cx="100" cy="118" r="46" fill="#f0f0f0" />
          {/* Eyes — spiral/confused */}
          <g className="nf-eye-spin">
            <circle cx="85" cy="113" r="9" fill="white" stroke="#1a1a2e" strokeWidth="2" />
            <path d="M82 113 Q85 109 88 113 Q85 117 82 113" stroke="#1a1a2e" strokeWidth="1.5" fill="none" />
          </g>
          <g className="nf-eye-spin" style={{ animationDelay: '0.15s' }}>
            <circle cx="115" cy="113" r="9" fill="white" stroke="#1a1a2e" strokeWidth="2" />
            <path d="M112 113 Q115 109 118 113 Q115 117 112 113" stroke="#1a1a2e" strokeWidth="1.5" fill="none" />
          </g>
          {/* Nose */}
          <ellipse cx="100" cy="126" rx="5" ry="3.5" fill="#f9a8d4" />
          {/* Mouth — wobbly/worried */}
          <path d="M90 132 Q95 128 100 132 Q105 128 110 132" stroke="#ccc" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* Cheeks */}
          <circle cx="77" cy="122" r="9" fill="#fca5a5" opacity="0.5" />
          <circle cx="123" cy="122" r="9" fill="#fca5a5" opacity="0.5" />
          {/* Question marks on tummy */}
          <rect x="72" y="152" width="56" height="30" rx="8" fill="var(--bg)" stroke="var(--danger)" strokeWidth="1.5" />
          <text x="100" y="163" textAnchor="middle" fill="var(--danger)" fontFamily="monospace" fontSize="8" fontWeight="bold">ERROR</text>
          <text x="100" y="174" textAnchor="middle" fill="var(--muted)" fontFamily="monospace" fontSize="7">404</text>
          {/* Paws */}
          <ellipse cx="60" cy="195" rx="15" ry="10" fill="#f0f0f0" />
          <ellipse cx="140" cy="195" rx="15" ry="10" fill="#f0f0f0" />
        </svg>
      </div>

      {/* Error content */}
      <div className="notfound-content">
        <span className="notfound-code">404</span>
        <h1 className="notfound-title">Oops! This page hopped away</h1>
        <p className="notfound-desc">
          Looks like the page you&apos;re looking for doesn&apos;t exist, was moved, or is taking a nap.
          Let&apos;s get you back on track!
        </p>

        {/* Quick action buttons */}
        <div className="notfound-actions">
          <Link href="/" className="btn-primary notfound-btn-home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Back to Home
          </Link>
          <Link href="/counsellor" className="notfound-btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
              <rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/>
            </svg>
            Ask BunBot
          </Link>
        </div>

        {/* Suggested pages */}
        <div className="notfound-suggestions">
          <p className="notfound-suggest-label">Maybe you were looking for:</p>
          <div className="notfound-suggest-links">
            <Link href="/quiz" className="notfound-suggest-pill">Career Quiz</Link>
            <Link href="/counsellor" className="notfound-suggest-pill">BunBot</Link>
            <Link href="/#careers" className="notfound-suggest-pill">Career Paths</Link>
            <Link href="/about" className="notfound-suggest-pill">About Us</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
