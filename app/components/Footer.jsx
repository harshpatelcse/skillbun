'use client';

import Image from 'next/image';
import Link from 'next/link';
import LanguageSelector from './LanguageSelector';
import { useTranslation } from './I18nProvider';

export default function Footer() {
  const { t, locale } = useTranslation();

  return (
    <footer lang={locale}>
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="logo">
            <Image src="/logo.png" alt="SkillBun Logo" width={38} height={38} unoptimized />
            <span>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
          </div>
          <p>{t('footer.brandBio', 'Hop into the right career. Helping computer science, software engineering, and tech students worldwide find their perfect path through AI-powered guidance and structured roadmaps.')}</p>
          <div className="footer-socials">
            <a className="social-btn" href="https://www.instagram.com/skillbun.tech/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="17.5" cy="6.5" r="1.2" />
              </svg>
            </a>
            <a className="social-btn" href="https://www.linkedin.com/company/skillbun-tech/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
          </div>
        </div>
        <div className="footer-col">
          <h4>{t('footer.platform', 'Platform')}</h4>
          <ul>
            <li><Link href="/quiz">{t('footer.quiz', 'Career Quiz')}</Link></li>
            <li><Link href="/#careers">{t('footer.roadmaps', 'Career Roadmaps')}</Link></li>
            <li><Link href="/counsellor">{t('footer.bunbot', 'BunBot')}</Link></li>
            <li><Link href="/dashboard">{t('footer.dashboard', 'Dashboard')}</Link></li>
            <li><Link href="/certificate">{t('footer.verifyCertificate', 'Verify Certificate')}</Link></li>
            <li><Link href="/alumni">{t('footer.alumniVault', 'Alumni & Workforce Vault')}</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>{t('footer.company', 'Company')}</h4>
          <ul>
            <li><Link href="/about">{t('footer.aboutUs', 'About Us')}</Link></li>
            <li><Link href="/privacy">{t('footer.privacyPolicy', 'Privacy Policy')}</Link></li>
            <li><Link href="/terms">{t('footer.termsOfUse', 'Terms of Use')}</Link></li>
            <li><Link href="/contact">{t('footer.contactUs', 'Contact Us')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <p style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          © 2026 <span>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span> {t('footer.copyright', 'by Reish. Made with love for tech students worldwide.')}
        </p>
        <div className="badge-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="badge">{t('footer.badges.globalPaths', 'Global Tech Paths')}</span>
          <span className="badge">{t('footer.badges.csEngg', 'CS & Software Engg')}</span>
          <span className="badge">{t('footer.badges.roadmaps100', '100+ Free Roadmaps')}</span>
          <span className="badge">{t('footer.badges.aiPowered', 'AI Powered')}</span>
          <LanguageSelector variant="footer" />
        </div>
      </div>
    </footer>
  );
}
