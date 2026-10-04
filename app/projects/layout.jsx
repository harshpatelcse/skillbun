export const metadata = {
  title: { absolute: 'Tech Portfolio & Capstone Project Ideas | SkillBun' },
  description: 'Explore tech portfolio and capstone project ideas with practical blueprints, suggested stacks and related career roadmaps for student developers.',
  alternates: { canonical: '/projects' },
  openGraph: {
    title: 'Tech Portfolio & Capstone Project Ideas | SkillBun',
    description: 'Find practical project blueprints, suggested stacks and related learning roadmaps for your developer portfolio.',
    url: '/projects',
    siteName: 'SkillBun',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'SkillBun Logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'Tech Portfolio & Capstone Project Ideas | SkillBun',
    description: 'Find practical project blueprints, suggested stacks and related learning roadmaps for your developer portfolio.',
    images: ['/logo.png'],
  },
};

export default function ProjectsLayout({ children }) {
  return children;
}
