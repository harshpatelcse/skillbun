import ComingSoon from '@/app/components/ComingSoon';

export const metadata = {
  title: { absolute: 'Coming Soon – SkillBun' },
  description: 'This feature is coming soon.',
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};

export default function ComingSoonPage() {
  return (
    <ComingSoon />
  );
}
