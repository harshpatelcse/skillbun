import fs from 'fs';
import path from 'path';

export const revalidate = 86400; // Revalidate sitemap once per day

export default async function sitemap() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech').replace(/\/+$/, '');

  // Core static site routes
  const staticRouteDefs = [
    { path: '', changeFrequency: 'daily', priority: 1.0 },
    { path: '/roadmap', changeFrequency: 'daily', priority: 0.9 },
    { path: '/career-guidance', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/projects', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/certificate', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  ];

  const staticRoutes = staticRouteDefs.map((def) => {
    const fullUrl = `${baseUrl}${def.path}`;
    return {
      url: fullUrl,
      changeFrequency: def.changeFrequency,
      priority: def.priority,
    };
  });

  // Dynamically load all 100 roadmap JSON slugs
  const roadmapsDir = path.join(process.cwd(), 'public', 'data', 'roadmaps');
  let roadmapRoutes = [];

  try {
    if (fs.existsSync(roadmapsDir)) {
      const files = fs.readdirSync(roadmapsDir);
      roadmapRoutes = files
        .filter((file) => /^[a-z0-9_]+\.json$/.test(file))
        .map((file) => {
          const slug = file.replace(/\.json$/, '');
          const roadmapUrl = `${baseUrl}/roadmap/${slug}`;
          return {
            url: roadmapUrl,
            changeFrequency: 'weekly',
            priority: 0.85,
          };
        });
    }
  } catch (error) {
    console.error('Error generating sitemap roadmap routes:', error);
  }

  return [...staticRoutes, ...roadmapRoutes];
}
