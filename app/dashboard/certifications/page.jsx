import fs from 'fs';
import path from 'path';
import CertificationsClient from './CertificationsClient';

export const metadata = {
  title: { absolute: 'My Certifications - SkillBun' },
  description: 'View, verify, and download your earned SkillBun career roadmap certificates.',
};

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

function readRoadmapsMap() {
  const roadmapsDir = path.join(process.cwd(), 'public', 'data', 'roadmaps');
  const roadmaps = {};

  try {
    const files = fs.readdirSync(roadmapsDir).filter((fileName) => {
      const safeName = path.basename(fileName);
      return safeName === fileName && /^[a-zA-Z0-9_-]+\.json$/.test(fileName);
    });

    for (const fileName of files) {
      const slug = fileName.replace(/\.json$/, '');

      try {
        const safePath = path.normalize(path.join(roadmapsDir, fileName));
        const baseDir = roadmapsDir.endsWith(path.sep) ? roadmapsDir : roadmapsDir + path.sep;
        if (!safePath.startsWith(baseDir)) {
          continue;
        }
        const content = fs.readFileSync(safePath, 'utf8');
        const roadmap = JSON.parse(content);
        const title = roadmap.title || slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const tree = normalizeRoadmapTree(roadmap);
        const nodes = flattenProgressNodes(tree);

        roadmaps[slug] = {
          title,
          totalNodes: nodes.length,
        };
      } catch (err) {
        console.error(`Failed to read/parse roadmap: ${fileName}`, err);
      }
    }
  } catch (err) {
    console.error('Failed to read roadmaps directory:', err);
  }

  return roadmaps;
}

export default function CertificationsPage() {
  const roadmapsInfo = readRoadmapsMap();

  return <CertificationsClient roadmapsInfo={roadmapsInfo} />;
}
