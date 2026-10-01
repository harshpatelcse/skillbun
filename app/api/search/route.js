import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { validateString, sanitizeCacheKey } from '@/utils/server/inputValidator';
import { getOrSetCache } from '@/utils/server/redisCache';

const ROADMAPS_DIR = path.join(process.cwd(), 'public', 'data', 'roadmaps');

let cachedRoadmaps = null;

function getRoadmaps() {
  if (cachedRoadmaps) return cachedRoadmaps;

  try {
    const files = fs.readdirSync(ROADMAPS_DIR);
    cachedRoadmaps = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const slug = file.replace('.json', '');
        try {
          const content = fs.readFileSync(path.join(ROADMAPS_DIR, file), 'utf-8');
          const json = JSON.parse(content);
          return { slug, title: json.title || slug, type: 'roadmap' };
        } catch {
          // Fallback if parsing fails
          const title = slug
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          return { slug, title, type: 'roadmap' };
        }
      });
    return cachedRoadmaps;
  } catch (error) {
    console.error('Failed to read roadmaps directory:', error);
    return [];
  }
}

const STATIC_PAGES = [
  { title: 'Home', href: '/', type: 'page' },
  { title: 'Projects Hub', href: '/projects', type: 'page' },
  { title: 'Features', href: '/#features', type: 'page' },
  { title: 'How it Works', href: '/#how', type: 'page' },
  { title: 'Career Paths', href: '/#careers', type: 'page' },
  { title: 'BunBot', href: '/counsellor', type: 'page' },
  { title: 'Connect with us', href: '/contact', type: 'page' },
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawQ = searchParams.get('q');

  if (rawQ !== null) {
    const qCheck = validateString(rawQ, {
      fieldName: 'Search query',
      maxLength: 100,
      allowEmpty: true,
      rejectSqlInjection: true,
    });
    if (!qCheck.isValid) {
      return NextResponse.json({ error: qCheck.error }, { status: 400 });
    }
  }

  const query = (rawQ || '').toLowerCase().trim();

  // Multi-tier cache: Check L1 memory / L2 Redis cache first
  const cacheKey = sanitizeCacheKey(`sb:search:v2:${query || '_default'}`);
  const responseData = await getOrSetCache(cacheKey, 300, async () => {
    const roadmaps = getRoadmaps();

    if (!query) {
      return {
        pages: STATIC_PAGES.slice(1, 5),
        roadmaps: roadmaps.slice(0, 6),
      };
    }

    const filteredPages = STATIC_PAGES.filter((p) => p.title.toLowerCase().includes(query));
    const filteredRoadmaps = roadmaps.filter((r) => r.title.toLowerCase().includes(query));

    return {
      pages: filteredPages.slice(0, 4),
      roadmaps: filteredRoadmaps.slice(0, 8),
    };
  });

  return NextResponse.json(responseData, {
    headers: {
      // Browser: 60s | CDN Edge: 300s | SWR: 24h
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
