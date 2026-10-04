const title = 'Certificate Verification | SkillBun';
const description = 'Verify a SkillBun career or workforce certificate by its unique credential ID. Check the official credential record, recipient details, and verification status.';

export const metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/certificate' },
  openGraph: {
    title,
    description,
    url: '/certificate',
    siteName: 'SkillBun',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'SkillBun Logo' }],
  },
  twitter: {
    card: 'summary',
    title,
    description,
    images: ['/logo.png'],
  },
};

export default function CertificateLayout({ children }) {
  return children;
}
