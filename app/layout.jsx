import './globals.css';
import Image from 'next/image';
import Link from 'next/link';
import { Fredoka, Nunito } from 'next/font/google';
import { headers, cookies } from 'next/headers';
import UserMenu from './components/UserMenu';
import ThemeToggle from './components/ThemeToggle';
import SearchBar from './components/SearchBar';
import { AuthProvider } from './components/AuthProvider';
import AnalyticsProvider from './components/AnalyticsProvider';
import { I18nProvider } from './components/I18nProvider';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/utils/shared/i18n';
import LanguageSelector from './components/LanguageSelector';
import Footer from './components/Footer';

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-fredoka',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'SkillBun – 100% Free AI Tech Career Roadmaps & Verified Certifications',
    template: '%s | SkillBun',
  },
  description: 'SkillBun is a 100% Free AI-powered career discovery platform for computer science, software engineering, and tech students worldwide. Explore 100+ free step-by-step career roadmaps, adaptive AI quizzes, Bun-Bot AI counsellor, and earn free verified digital certificates.',
  keywords: [
    'SkillBun',
    'Free Tech Career Roadmaps',
    'Free Developer Certifications',
    'Free AI Career Counsellor',
    'Free Coding Quiz',
    'Global Tech Career Paths',
    'Computer Science Skill Trees',
    'Frontend Roadmap Free',
    'Backend Roadmap Free',
    'AI ML Roadmap Free',
    'Software Developer Career',
    'SkillBun Certifications Free',
    'Student Career Discovery',
  ],
  authors: [{ name: 'SkillBun Team', url: siteUrl }],
  creator: 'SkillBun',
  publisher: 'SkillBun',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: './',
  },
  openGraph: {
    title: 'SkillBun – 100% Free AI Tech Career Roadmaps & Verified Certifications',
    description: '100% Free tech career roadmaps, adaptive AI quizzes, Bun-Bot AI mentor, and verified certificates for computer science and tech students globally.',
    url: './',
    siteName: 'SkillBun',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'SkillBun Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'SkillBun – 100% Free AI Tech Career Roadmaps & Certifications',
    description: '100% Free AI guidance, 100+ tech career roadmaps, adaptive quizzes, and free verified certificates for students worldwide.',
    images: ['/logo.png'],
    creator: '@SkillBun',
  },
};

const jsonLdStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: 'SkillBun',
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      image: `${siteUrl}/logo.png`,
      description: 'SkillBun helps computer science, software engineering, and tech students worldwide find their ideal career path through 100% free AI guidance, 100+ structured roadmaps, and free verified certificates.',
      isAccessibleForFree: true,
      sameAs: [
        'https://www.linkedin.com/company/skillbun-tech/',
        'https://www.instagram.com/skillbun.tech/',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'SkillBun',
      description: '100% Free AI-powered tech career discovery, adaptive career quizzes, and structured learning roadmaps.',
      isAccessibleForFree: true,
      publisher: {
        '@id': `${siteUrl}/#organization`,
      },
    },
  ],
};

export default async function RootLayout({ children }) {
  // Request-scoped nonces require dynamic HTML rendering.
  const nonce = (await headers()).get('x-nonce') || undefined;
  const cookieStore = await cookies();
  const savedLocale = cookieStore.get('sb_locale')?.value;
  const initialLocale = SUPPORTED_LOCALES.some((l) => l.code === savedLocale) ? savedLocale : DEFAULT_LOCALE;

  return (
    <html lang="en" dir="ltr" className={`${fredoka.variable} ${nunito.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#F4F7F2" />
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdStructuredData) }}
        />
        {/* Google Consent Mode v2 Default (denied until user grants consent) */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          var consentStatus = 'denied';
          try {
            if (localStorage.getItem('sb_consent_choice') === 'accepted') consentStatus = 'granted';
          } catch(e){}
          gtag('consent', 'default', {
            'analytics_storage': consentStatus,
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'personalization_storage': 'denied'
          });
        `}} />
        {/* Theme initialization — runs before paint to prevent flash */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var saved = localStorage.getItem('sb_theme');
              var valid = saved === 'light' || saved === 'dark';
              var t = valid ? saved : 'light';
              document.documentElement.setAttribute('data-theme', t);
              document.documentElement.style.colorScheme = t;
              var themeMeta = document.querySelector('meta[name="theme-color"]');
              if (themeMeta) themeMeta.setAttribute('content', t === 'dark' ? '#0D1117' : '#F4F7F2');
            } catch(e){}
          })();
        `}} />
      </head>
      <body>
        <a href="#main-content" className="skip-nav">Skip to content</a>
        <AuthProvider>
          <AnalyticsProvider nonce={nonce}>
            <I18nProvider initialLocale={initialLocale}>
              <nav>
                <div className="nav-logo">
                  <Link href="/" className="nav-logo-link">
                    <Image src="/logo.png" alt="SkillBun Logo" width={38} height={38} priority unoptimized />
                    <span>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
                  </Link>
                </div>
                <SearchBar />

                <div className="nav-cta">
                  <LanguageSelector />
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </nav>
              <main id="main-content">{children}</main>
              <Footer />
            </I18nProvider>
          </AnalyticsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
