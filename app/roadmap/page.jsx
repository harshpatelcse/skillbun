import fs from 'fs';
import path from 'path';
import { headers } from 'next/headers';
import RoadmapHubClient from './RoadmapHubClient';
import RoadmapDirectory from './RoadmapDirectory';

const ROADMAPS_DIR = path.join(process.cwd(), 'public', 'data', 'roadmaps');
const ROADMAP_SLUG_PATTERN = /^[a-z0-9_]+$/;

const categories = [
  { id: 'all', label: 'All' },
  { id: 'web_app', label: 'Web & App' },
  { id: 'ai_data', label: 'AI & Data' },
  { id: 'cybersecurity', label: 'Cybersecurity' },
  { id: 'cloud_devops', label: 'Cloud & DevOps' },
  { id: 'design_product', label: 'Design & Product' },
  { id: 'systems_emerging', label: 'Systems & Emerging' },
  { id: 'business_ops', label: 'Business/Ops' },
];

const featuredSlugs = new Set([
  'ai_ml_engineer',
  'fullstack',
  'frontend',
  'data_science',
  'cybersecurity',
  'devops_cloud',
  'ui_ux_design',
  'flutter_developer',
]);

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech').replace(/\/+$/, '');

export const metadata = {
  title: { absolute: 'Free Tech Career Roadmaps & Learning Paths | SkillBun' },
  description: 'Explore free developer and tech career roadmaps for frontend, backend, AI, data science, cybersecurity and cloud. Find what to learn and build next.',
  keywords: [
    'Tech Career Roadmaps',
    'Developer Learning Paths',
    'Fullstack Roadmap',
    'AI ML Roadmap',
    'Global Tech Career Paths',
    'Computer Science Roadmaps',
    'Software Engineer Learning Paths',
    'SkillBun Roadmaps',
  ],
  alternates: {
    canonical: `${siteUrl}/roadmap`,
  },
  openGraph: {
    title: 'Free Tech Career Roadmaps & Learning Paths | SkillBun',
    description: 'Explore free developer and tech career roadmaps for frontend, backend, AI, data science, cybersecurity and cloud.',
    url: `${siteUrl}/roadmap`,
    siteName: 'SkillBun',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'SkillBun Roadmaps' }],
  },
  twitter: {
    card: 'summary',
    title: 'Free Tech Career Roadmaps | SkillBun',
    description: 'Find what to learn next with developer roadmaps, study resources and project ideas.',
    images: ['/logo.png'],
  },
};

function titleFromSlug(slug) {
  return slug
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeTopicNode(topic) {
  return {
    ...topic,
    resources: Array.isArray(topic.resources) ? topic.resources : [],
    children: Array.isArray(topic.children) ? topic.children.map(normalizeTopicNode) : [],
  };
}

function normalizeProjectNode(project, roadmapId, stage, index) {
  if (!project) return null;

  return {
    id: `${roadmapId}_stage_${stage.step || index + 1}_project`,
    name: `Project: ${project.title}`,
    description: project.description || '',
    resources: project.url ? [{ title: project.title, url: project.url, type: 'article' }] : [],
    children: [],
  };
}

function normalizeStageNode(stage, roadmapId, index) {
  const topics = Array.isArray(stage.topics) ? stage.topics.map(normalizeTopicNode) : [];
  const project = normalizeProjectNode(stage.project, roadmapId, stage, index);

  return {
    id: `${roadmapId}_stage_${stage.step || index + 1}`,
    name: stage.title,
    description: stage.description || '',
    resources: [],
    children: project ? [...topics, project] : topics,
    countInProgress: false,
  };
}

function normalizeRoadmapTree(roadmap) {
  if (roadmap.format === 'tree' && Array.isArray(roadmap.tree)) {
    return roadmap.tree.map(normalizeTopicNode);
  }

  if (Array.isArray(roadmap.stages)) {
    const roadmapId = roadmap.id || 'roadmap';
    return roadmap.stages.map((stage, index) => normalizeStageNode(stage, roadmapId, index));
  }

  return [];
}

function flattenProgressNodes(nodes) {
  const result = [];

  function walk(list) {
    list.forEach((node) => {
      if (node.countInProgress !== false && node.id) {
        result.push(node);
      }

      if (node.children?.length) {
        walk(node.children);
      }
    });
  }

  walk(nodes);
  return result;
}

function countResources(nodes) {
  return nodes.reduce((total, node) => (
    total
    + (Array.isArray(node.resources) ? node.resources.length : 0)
    + (node.children?.length ? countResources(node.children) : 0)
  ), 0);
}

function inferCategory(slug, title) {
  const text = `${slug} ${title}`.toLowerCase();

  if (/(security|cyber|soc|dfir|grc|iam|malware|penetration|red_team|threat)/.test(text)) {
    return 'cybersecurity';
  }

  if (/(^|[\s_/])ai([\s_/]|$)|(^|[\s_/])ml([\s_/]|$)|data|analytics|bi_|computer_vision|nlp|recommendation|speech|prompt|reinforcement|geospatial/.test(text)) {
    return 'ai_data';
  }

  if (/(cloud|aws|azure|gcp|devops|kubernetes|terraform|iac|sre|site_reliability|platform|observability|release|serverless|finops|linux)/.test(text)) {
    return 'cloud_devops';
  }

  if (/(design|designer|ux|ui|product|content|service|writing|seo|marketing|scrum)/.test(text)) {
    return 'design_product';
  }

  if (/(game|unity|unreal|ar_vr|robotics|embedded|iot|blockchain|c_cpp|systems|technical_artist|rpa)/.test(text)) {
    return 'systems_emerging';
  }

  if (/(business|analyst|support|admin|governance|manager)/.test(text)) {
    return 'business_ops';
  }

  return 'web_app';
}

function readRoadmaps() {
  try {
    return fs
      .readdirSync(ROADMAPS_DIR)
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName) => {
        const slug = fileName.replace(/\.json$/, '');

        if (!ROADMAP_SLUG_PATTERN.test(slug)) {
          return null;
        }

        try {
          const content = fs.readFileSync(path.join(ROADMAPS_DIR, fileName), 'utf8');
          const roadmap = JSON.parse(content);
          const title = roadmap.title || titleFromSlug(slug);
          const tree = normalizeRoadmapTree(roadmap);
          const nodes = flattenProgressNodes(tree);

          return {
            slug,
            title,
            description: roadmap.description || `Explore the ${title} career roadmap.`,
            category: inferCategory(slug, title),
            totalNodes: nodes.length,
            nodeIds: nodes.map((node) => node.id),
            resourceCount: countResources(tree),
            featured: featuredSlugs.has(slug),
            salary: roadmap.goal?.salary || null,
          };
        } catch {
          const title = titleFromSlug(slug);

          return {
            slug,
            title,
            description: `Explore the ${title} career roadmap.`,
            category: inferCategory(slug, title),
            totalNodes: 0,
            nodeIds: [],
            resourceCount: 0,
            featured: false,
          };
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

export default async function RoadmapHubPage() {
  const roadmaps = readRoadmaps();
  const nonce = (await headers()).get('x-nonce') || undefined;
  const directorySchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${siteUrl}/roadmap#roadmap-directory`,
    name: 'SkillBun tech career roadmaps',
    numberOfItems: roadmaps.length,
    itemListElement: roadmaps.map((roadmap, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `${roadmap.title} roadmap`,
      url: `${siteUrl}/roadmap/${roadmap.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(directorySchema).replace(/</g, '\\u003c') }}
      />
      <RoadmapHubClient categories={categories} roadmaps={roadmaps} />
      <RoadmapDirectory categories={categories} roadmaps={roadmaps} />
    </>
  );
}
