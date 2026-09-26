'use client';
import { useMemo, useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../components/AuthProvider';
import { readStoredRoadmapProgress } from '@/utils/shared/progressStore';
import { getStudyGuideResources } from '@/utils/shared/studyGuideResources';
import { trackEvent } from '@/lib/analytics';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import connections from '../../../public/data/roadmap_connections.json';
import './roadmap.css';

function isSafeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return true;
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}
function askBunBot(t, r) {
  return `/counsellor?${new URLSearchParams({ q: `Explain ${t} in simple terms`, context: `${r} Roadmap` })}`;
}

/* Flatten tree nodes for progress counting */
function flattenTree(nodes) {
  const result = [];
  function walk(list) {
    list.forEach(n => {
      if (n.countInProgress !== false) result.push(n);
      if (n.children?.length) walk(n.children);
    });
  }
  walk(nodes);
  return result;
}

function normalizeTopicNode(topic) {
  return {
    ...topic,
    tag: topic.tag || 'essential',
    difficulty: topic.difficulty || (topic.tag === 'advanced' ? 'advanced' : 'beginner'),
    exp: typeof topic.exp === 'number' ? topic.exp : (topic.tag === 'advanced' ? 300 : 100),
    resources: Array.isArray(topic.resources) ? topic.resources : [],
    children: Array.isArray(topic.children) ? topic.children.map(normalizeTopicNode) : [],
  };
}

function normalizeProjectNode(project, roadmapId, stage, index) {
  if (!project) return null;

  return {
    id: `${roadmapId}_stage_${stage.step || index + 1}_project`,
    name: `Project: ${project.title}`,
    icon: '🏆',
    tag: 'advanced',
    difficulty: project.difficulty || 'advanced',
    exp: typeof project.exp === 'number' ? project.exp : 400,
    description: project.description || 'Build a portfolio-ready project for this stage.',
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
    icon: stage.icon || '🎯',
    tag: 'essential',
    description: stage.description || `Complete the ${stage.title} branches before moving ahead.`,
    resources: [],
    children: project ? [...topics, project] : topics,
    countInProgress: false,
    unlockChildren: 'always',
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

const TREE_CARD_WIDTH = 270;
const TREE_ROOT_WIDTH = 420;
const TREE_GAP = 24;
const COMPACT_ROADMAP_QUERY = '(max-width: 1100px), (pointer: coarse)';

function subscribeCompactRoadmap(onChange) {
  const query = window.matchMedia(COMPACT_ROADMAP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getCompactRoadmapSnapshot() {
  return window.matchMedia(COMPACT_ROADMAP_QUERY).matches;
}

function getCompactRoadmapServerSnapshot() {
  return true;
}
const SPARK_COLORS = ['#2ECC71', '#A8FF3E', '#FFD700', '#58D68D'];
const SPARK_DISTANCES = [42, 55, 48, 60, 45, 57, 50, 62, 46, 54];

function readStoredProgress(slug) {
  return readStoredRoadmapProgress(slug);
}

function getLeafCount(node) {
  if (!node.children?.length) return 1;
  return node.children.reduce((sum, child) => sum + getLeafCount(child), 0);
}

function getBranchWidth(node, depth = 0) {
  const cardWidth = depth === 0 ? TREE_ROOT_WIDTH : TREE_CARD_WIDTH;
  if (!node.children?.length) return cardWidth;

  const childrenWidth = node.children.reduce((sum, child) => sum + getBranchWidth(child, depth + 1), 0);
  return Math.max(cardWidth, childrenWidth + TREE_GAP * (node.children.length - 1));
}

function getTerminalNodes(node) {
  if (!node.children?.length) return [node];
  return node.children.flatMap(child => getTerminalNodes(child));
}

export default function GameMap({ roadmap, slug, initialTab }) {
  const router = useRouter();
  const nextRoadmap = useMemo(() => connections[slug] || null, [slug]);
  const { user, authLoading, saveRoadmapProgress, progressVersion } = useAuth();
  const [progress, setProgress] = useState(() => readStoredProgress(slug));
  const [progressSource, setProgressSource] = useState({ slug, version: progressVersion });
  // Reconcile the existing cache signal before rendering stage counts and the next skill.
  if (progressSource.slug !== slug || progressSource.version !== progressVersion) {
    setProgressSource({ slug, version: progressVersion });
    setProgress(readStoredProgress(slug));
  }
  const [expanded, setExpanded] = useState(null);
  const [confetti, setConfetti] = useState(null);
  const [progressNotice, setProgressNotice] = useState('');
  const [selectedDocNode, setSelectedDocNode] = useState(null);
  const compactRoadmap = useSyncExternalStore(subscribeCompactRoadmap, getCompactRoadmapSnapshot, getCompactRoadmapServerSnapshot);
  const [viewChoice, setViewChoice] = useState(null);
  const isListView = viewChoice ? viewChoice === 'list' : compactRoadmap;
  const [openStages, setOpenStages] = useState({});
  const treeScrollRef = useRef(null);
  const pendingNodeRef = useRef(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab && ['learn', 'goal', 'boost'].includes(initialTab)) {
      return initialTab;
    }
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname.endsWith('/goal')) return 'goal';
      if (pathname.endsWith('/boost')) return 'boost';
      if (pathname.endsWith('/learn')) return 'learn';
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (['learn', 'goal', 'boost'].includes(tab)) return tab;
    }
    return 'learn';
  });

  useEffect(() => {
    const syncTab = () => {
      const pathname = window.location.pathname;
      const pathTab = pathname.endsWith('/goal')
        ? 'goal'
        : pathname.endsWith('/boost')
        ? 'boost'
        : pathname.endsWith('/learn')
        ? 'learn'
        : null;

      const params = new URLSearchParams(window.location.search);
      const tab = pathTab || params.get('tab');
      if (['learn', 'goal', 'boost'].includes(tab)) {
        setActiveTab(tab);
      } else {
        setActiveTab('learn');
      }
    };

    syncTab();
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const basePath = url.pathname.replace(/\/(goal|learn|boost)$/, '');
      url.searchParams.set('tab', newTab);
      window.history.pushState({ tab: newTab }, '', `${basePath}?tab=${newTab}`);
    }
  };


  useEffect(() => {
    if (slug) {
      trackEvent('roadmap_viewed', { slug, title: roadmap?.title || slug });
    }
  }, [slug, roadmap?.title]);

  const roadmapTree = useMemo(() => normalizeRoadmapTree(roadmap), [roadmap]);
  const allNodes = flattenTree(roadmapTree);
  const total = allNodes.length;
  const doneCount = allNodes.filter(n => progress.includes(n.id)).length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const totalXp = useMemo(() => {
    return typeof roadmap?.total_exp === 'number'
      ? roadmap.total_exp
      : allNodes.reduce((sum, n) => sum + (n.exp || 100), 0);
  }, [roadmap?.total_exp, allNodes]);
  const earnedXp = useMemo(() => {
    return allNodes.filter(n => progress.includes(n.id)).reduce((sum, n) => sum + (n.exp || 100), 0);
  }, [allNodes, progress]);

  const toggle = async (id) => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setProgressNotice('Log in to save this roadmap to your SkillBun account.');
      router.push(`/auth?next=${encodeURIComponent(`/roadmap/${slug}`)}`);
      return;
    }

    const wasDone = progress.includes(id);
    const next = wasDone ? progress.filter(x => x !== id) : [...progress, id];
    const previous = progress;
    if (!wasDone) { setConfetti(id); setTimeout(() => setConfetti(null), 1200); }
    setProgress(next);
    setProgressNotice('');

    try {
      await saveRoadmapProgress(slug, next);
      if (!wasDone) {
        const completedNode = allNodes.find((node) => node.id === id);
        trackEvent('roadmap_node_completed', {
          roadmap_slug: slug,
          node_id: id,
          node_tag: completedNode?.tag || 'essential',
          completed_nodes: next.length,
          completion_percent: total === 0 ? 0 : Math.round((next.length / total) * 100),
        });
      }
    } catch (error) {
      console.error('Failed to save roadmap progress:', error);
      setProgress(previous);
      setProgressNotice('Could not save progress to Firebase. Please try again.');
    }
  };

  const done = (id) => progress.includes(id);

  const isRootGateComplete = (node) => (
    node.children?.length ? getTerminalNodes(node).some(terminal => done(terminal.id)) : done(node.id)
  );

  // Find a next skill using the same gates as the completion controls.
  const findNextSkill = (nodes, stageId, parentUnlocked, parentDone, depth = 0) => {
    for (const node of nodes) {
      const unlocked = parentUnlocked && (depth === 0 || parentDone);
      if (unlocked && node.countInProgress !== false && !done(node.id)) {
        return { nodeId: node.id, stageId };
      }
      const next = findNextSkill(node.children || [], stageId, unlocked, node.unlockChildren === 'always' || done(node.id), depth + 1);
      if (next) return next;
    }
    return null;
  };
  let nextSkill = null;
  for (let index = 0; index < roadmapTree.length && !nextSkill; index++) {
    const root = roadmapTree[index];
    nextSkill = findNextSkill([root], root.id, index === 0 || isRootGateComplete(roadmapTree[index - 1]), true);
  }
  const defaultStageId = nextSkill?.stageId || roadmapTree[0]?.id;

  const continueLearning = () => {
    if (!nextSkill) return;
    pendingNodeRef.current = nextSkill.nodeId;
    setOpenStages(previous => ({ ...previous, [nextSkill.stageId]: true }));
    setExpanded(nextSkill.nodeId);
  };

  useLayoutEffect(() => {
    const scroll = treeScrollRef.current;
    if (!scroll || isListView) return;
    let previousWidth = 0;
    const centerTree = () => {
      if (previousWidth === scroll.clientWidth) return;
      previousWidth = scroll.clientWidth;
      scroll.scrollLeft = Math.max(0, (scroll.scrollWidth - scroll.clientWidth) / 2);
    };
    centerTree();
    const observer = new ResizeObserver(centerTree);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [activeTab, isListView]);

  useLayoutEffect(() => {
    if (!pendingNodeRef.current) return;
    const target = document.getElementById(`sk-node-toggle-${pendingNodeRef.current}`);
    if (target) {
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      target.focus({ preventScroll: true });
      pendingNodeRef.current = null;
    }
  }, [expanded, openStages, isListView]);

  const panTree = (direction) => {
    const scroll = treeScrollRef.current;
    if (!scroll) return;
    scroll.scrollBy({
      left: direction * scroll.clientWidth * 0.7,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !selectedDocNode) setExpanded(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedDocNode]);

  /* Render recursively without a nested component type, so updates preserve keyboard focus. */
  function renderTreeNode({ node, depth = 0, parentUnlocked = true, parentDone = true }) {
    const isDone = done(node.id);
    const isUnlocked = parentUnlocked && (depth === 0 || parentDone);
    const isOpen = expanded === node.id;
    const isCelebrating = confetti === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const childrenUnlocked = node.unlockChildren === 'always' || isDone;
    const childCount = hasChildren ? node.children.length : 0;
    const childWidths = hasChildren ? node.children.map(child => getBranchWidth(child, depth + 1)) : [];
    const branchWidth = getBranchWidth(node, depth);
    const childColumns = childWidths.map((width, idx) => `minmax(${width}px, ${getLeafCount(node.children[idx])}fr)`).join(' ');
    const treeWidth = childWidths.length
      ? childWidths.reduce((sum, width) => sum + width, 0) + TREE_GAP * (childWidths.length - 1)
      : TREE_CARD_WIDTH;
    const lineLeft = childWidths.length ? childWidths[0] / 2 : 0;
    const lineRight = childWidths.length ? childWidths[childWidths.length - 1] / 2 : 0;
    const icon = node.icon || '📘';

    return (
      <div
        className={`sk-branch sk-branch-depth-${Math.min(depth, 3)}`}
        style={{ '--branch-width': `${branchWidth}px` }}
      >
        {/* This node */}
        <div className={`sk-node depth-${Math.min(depth, 3)} ${isDone ? 'done' : ''} ${isUnlocked ? '' : 'locked'} ${isCelebrating ? 'celebrate' : ''}`}>
          <div className="sk-node-card">
            <div className="sk-node-shimmer"></div>
            <div className="sk-node-row">
              <div className={`sk-node-icon ${isDone ? 'done' : ''}`}>{icon}</div>
              <div className="sk-node-info">
                <div className="sk-node-title-row">
                  <h3>
                    <button
                      type="button"
                      className="sk-node-toggle"
                      id={`sk-node-toggle-${node.id}`}
                      aria-expanded={isOpen}
                      aria-controls={`sk-node-detail-${node.id}`}
                      onClick={() => setExpanded(isOpen ? null : node.id)}
                    >
                      {node.name}
                    </button>
                  </h3>
                  {node.tag === 'advanced' && <span className="sk-pill adv">⚡ ADV</span>}
                  {node.tag === 'essential' && <span className="sk-pill ess">CORE</span>}
                  <span className="sk-pill exp">+{node.exp || 100} XP</span>
                </div>
                <p>{node.description}</p>
              </div>
              <div className="sk-node-actions">
                <button
                  className={`sk-check ${isDone ? 'done' : ''}`}
                  type="button"
                  aria-label={`${isDone ? 'Undo completion of' : 'Complete'} ${node.name}`}
                  disabled={!isUnlocked || authLoading}
                  onClick={(e) => { e.stopPropagation(); if (isUnlocked) toggle(node.id); }}
                  title={isUnlocked ? (user ? (isDone ? 'Undo' : 'Complete') : 'Log in to save progress') : 'Complete prerequisite first'}
                >
                  {isDone && <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 4 4L19 6" /></svg>}
                </button>
                {(hasChildren || node.resources?.length > 0) && (
                  <span className={`sk-arrow ${isOpen ? 'open' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                )}
              </div>
            </div>
              <div className="sk-detail" id={`sk-node-detail-${node.id}`} hidden={!isOpen}>
                {isOpen && <>
                <button
                  className={`sk-btn-mark ${isDone ? 'done' : ''}`}
                  disabled={!isUnlocked || authLoading}
                  onClick={(e) => { e.stopPropagation(); if (isUnlocked) toggle(node.id); }}
                >
                  {isUnlocked ? (isDone ? '✅ Completed — Undo?' : `🎯 Mark Complete (+${node.exp || 100} XP)`) : 'Complete prerequisite first'}
                </button>
                {node.resources?.filter(r => isSafeUrl(r.url)).length > 0 && (
                  <div className="sk-res-section">
                    <h4>📚 Resources</h4>
                    {node.resources.filter(r => isSafeUrl(r.url)).map((r, i) => (
                      <a
                        href={r.url}
                        target={r.type === 'doc' ? undefined : "_blank"}
                        rel="noopener noreferrer"
                        className={`sk-res ${r.type === 'doc' ? 'sk-res-doc-btn' : ''}`}
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (r.type === 'doc') {
                            e.preventDefault();
                            e.currentTarget.focus({ preventScroll: true });
                            setSelectedDocNode({
                              topicId: node.id,
                              topicName: node.name,
                              topicDesc: node.description,
                              roadmapTitle: roadmap.title,
                              docUrl: r.url,
                              resources: node.resources,
                              isUnlocked: isUnlocked,
                              isDone: isDone,
                              nodeId: node.id,
                              exp: node.exp || 100,
                              difficulty: node.difficulty || 'intermediate',
                            });
                          }
                        }}
                      >
                        <span className="sk-res-type" style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {r.type === 'doc' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                          ) : r.type === 'video' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="15" x="2" y="3" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          )}
                        </span>
                        {r.type === 'doc' ? (
                          <span className="sk-res-doc-title">
                            Study Guide by <span className="sk-brand-text">ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
                          </span>
                        ) : (
                          <span>{r.title}</span>
                        )}
                        <span className="sk-res-go">{r.type === 'doc' ? '→' : '↗'}</span>
                      </a>
                    ))}
                  </div>
                )}
                <Link href={askBunBot(node.name, roadmap.title)} className="sk-btn-ai" onClick={e => e.stopPropagation()}>Ask BunBot</Link>
                </>}
              </div>
          </div>
          {/* Celebration */}
          {isCelebrating && (
            <div className="sk-confetti">
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className="sk-spark" style={{ '--angle': `${i * 36}deg`, '--dist': `${SPARK_DISTANCES[i]}px`, background: SPARK_COLORS[i % SPARK_COLORS.length] }}></span>
              ))}
            </div>
          )}
        </div>

        {/* Children branches */}
        {hasChildren && (
          <div className="sk-children">
            {/* Vertical connector from parent down */}
            <div className="sk-connector"></div>
            {/* Children row with horizontal line via ::before */}
            <div
              className={`sk-child-nodes ${childCount === 1 ? 'single-child' : ''}`}
              style={{
                '--child-count': childCount,
                '--child-columns': childColumns,
                '--tree-width': `${treeWidth}px`,
                '--line-left': `${lineLeft}px`,
                '--line-right': `${lineRight}px`,
              }}
            >
              {node.children.map(child => (
                <div className="sk-child-branch" key={child.id}>
                  <div className="sk-child-vline"></div>
                  {renderTreeNode({ node: child, depth: depth + 1, parentUnlocked: isUnlocked, parentDone: childrenUnlocked })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sk-wrapper" data-roadmap-view={isListView ? 'list' : 'tree'}>
      {/* Background */}
      <div className="sk-bg">
        <div className="sk-bg-orb sk-bg-1"></div>
        <div className="sk-bg-orb sk-bg-2"></div>
        <div className="sk-grid"></div>
        {['{ }','< />','( )','[ ]','=>','::','&&','||'].map((s, i) => (
          <span key={i} className="sk-float" style={{ left: `${5 + i * 12}%`, animationDelay: `${i * 1.5}s`, animationDuration: `${14 + i * 2}s` }}>{s}</span>
        ))}
      </div>

      {/* Hero */}
      <div className="sk-hero">
        <div className="sk-hero-glow"></div>
        <div className="sk-hero-inner">
          <div className="sk-hero-left">
            <div className="sk-badge">🌳 SKILL TREE</div>
            <h1 className="sk-title">{roadmap.title}</h1>
            <p className="sk-desc">{roadmap.description}</p>
            <div className="sk-stats">
              <div className="sk-stat"><span className="sk-stat-v">{total}</span><span className="sk-stat-l">Skills</span></div>
              <div className="sk-sep"></div>
              <div className="sk-stat"><span className="sk-stat-v">{doneCount}</span><span className="sk-stat-l">Done</span></div>
              <div className="sk-sep"></div>
              <div className="sk-stat"><span className="sk-stat-v sk-green">{earnedXp}</span><span className="sk-stat-l">/ {totalXp} XP</span></div>
            </div>
            {progressNotice && <p className="sk-sync-note">{progressNotice}</p>}
            <div className="sk-cert-btn-container">
              {pct >= 60 ? (
                <button
                  className="sk-cert-btn unlocked"
                  onClick={() => router.push(`/roadmap/${slug}/certify`)}
                >
                  🏆 Get Certified — Take Quiz!
                </button>
              ) : (
                <button
                  className="sk-cert-btn locked"
                  disabled
                  title="Complete at least 60% of this roadmap to unlock the certification quiz!"
                >
                  🔒 Get Certified ({pct}%)
                </button>
              )}
            </div>
          </div>
          <div className="sk-hero-right">
            <div className="sk-ring">
              <svg viewBox="0 0 120 120">
                <defs><linearGradient id="skG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#2ECC71"/><stop offset="100%" stopColor="#A8FF3E"/></linearGradient></defs>
                <circle cx="60" cy="60" r="52" className="sk-ring-bg"/>
                <circle cx="60" cy="60" r="52" className="sk-ring-bar" stroke="url(#skG)" strokeDasharray={`${(pct/100)*326.73} 326.73`}/>
              </svg>
              <div className="sk-ring-txt"><span className="sk-ring-pct">{pct}%</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Pillar Navigation Tabs: Learn, Goal, Boost */}
      <div className="sk-pillar-nav-wrapper">
        <div className="sk-pillar-nav" role="tablist" aria-label="Roadmap Pillars">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'learn'}
            className={`sk-pillar-tab ${activeTab === 'learn' ? 'active' : ''}`}
            onClick={() => handleTabChange('learn')}
          >
            <span className="sk-pillar-tab-icon">📘</span>
            <span className="sk-pillar-tab-text">Learn</span>
            <span className="sk-pillar-tab-badge">{total} Nodes</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'goal'}
            className={`sk-pillar-tab ${activeTab === 'goal' ? 'active' : ''}`}
            onClick={() => handleTabChange('goal')}
          >
            <span className="sk-pillar-tab-icon">🎯</span>
            <span className="sk-pillar-tab-text">Goal</span>
            <span className="sk-pillar-tab-badge">Global $ & ₹</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'boost'}
            className={`sk-pillar-tab ${activeTab === 'boost' ? 'active' : ''}`}
            onClick={() => handleTabChange('boost')}
          >
            <span className="sk-pillar-tab-icon">🚀</span>
            <span className="sk-pillar-tab-text">Boost</span>
            <span className="sk-pillar-tab-badge">Projects & Certs</span>
          </button>
        </div>
      </div>

      {/* 1. LEARN TAB: The Interactive Skill Tree */}
      {activeTab === 'learn' && (
        <>
          <div className="sk-tree-toolbar" aria-label="Roadmap navigation">
            <div className="sk-view-switch" role="group" aria-label="Roadmap view">
              <button type="button" aria-pressed={!isListView} onClick={() => setViewChoice('tree')}>Tree</button>
              <button type="button" aria-pressed={isListView} onClick={() => setViewChoice('list')}>List</button>
            </div>
            {nextSkill && <button type="button" className="sk-continue" onClick={continueLearning}>Continue learning</button>}
            {!isListView && (
              <div className="sk-tree-pan" role="group" aria-label="Move through the tree">
                <button type="button" onClick={() => panTree(-1)} aria-label="Move tree left"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 6-6 6 6 6" /></svg></button>
                <button type="button" onClick={() => panTree(1)} aria-label="Move tree right"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m10 6 6 6-6 6" /></svg></button>
              </div>
            )}
          </div>
          {!isListView && <p className="sk-tree-hint">Scroll sideways or use the arrows to explore branches. Switch to List for a compact view.</p>}
          <div className="sk-tree-scroll" ref={treeScrollRef} tabIndex={isListView ? undefined : 0} role="region" aria-label={`${roadmap.title} learning ${isListView ? 'stages' : 'tree'}`}>
            <div className="sk-tree">
              {roadmapTree.map((rootNode, idx) => {
                const rootUnlocked = idx === 0 || isRootGateComplete(roadmapTree[idx - 1]);
                const stageNodes = flattenTree([rootNode]);
                const stageDone = stageNodes.filter(node => done(node.id)).length;
                const stageOpen = openStages[rootNode.id] ?? rootNode.id === defaultStageId;

                return (
                  <div className="sk-root-step" key={rootNode.id}>
                    {isListView && (
                      <h2 className="sk-stage-heading">
                        <button type="button" className="sk-stage-toggle" aria-expanded={stageOpen} aria-controls={`sk-stage-${rootNode.id}`} onClick={() => setOpenStages(previous => ({ ...previous, [rootNode.id]: !stageOpen }))}>
                          <span className="sk-stage-number">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="sk-stage-info"><span className="sk-stage-name">{rootNode.name}</span><span className="sk-stage-progress">{stageDone} / {stageNodes.length} skills complete{!rootUnlocked ? ' · Prerequisite needed' : ''}</span></span>
                          <svg className={stageOpen ? 'open' : ''} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                      </h2>
                    )}
                    <div className="sk-stage-content" id={`sk-stage-${rootNode.id}`} hidden={isListView && !stageOpen}>
                      {renderTreeNode({ node: rootNode, depth: 0, parentUnlocked: rootUnlocked })}
                    </div>
                    {idx < roadmapTree.length - 1 && <div className="sk-step-connector" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next Recommended Roadmap */}
          {nextRoadmap && (
            <div className="sk-next-section">
              <div className="sk-next-label">Next Career Milestone</div>
              <button 
                className="sk-next-card"
                onClick={() => router.push(`/roadmap/${nextRoadmap.next}`)}
                title={`Go to ${nextRoadmap.title} Roadmap`}
              >
                <div className="sk-next-glow"></div>
                <div className="sk-next-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/>
                  </svg>
                </div>
                <div className="sk-next-info">
                  <span className="sk-next-tag">Next Step</span>
                  <h3 className="sk-next-title">{nextRoadmap.title}</h3>
                </div>
                <div className="sk-next-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </button>
            </div>
          )}
        </>
      )}

      {/* 2. GOAL TAB: Career Mission & Global Dual-Currency Benchmarks */}
      {activeTab === 'goal' && (
        <div className="sk-pillar-panel sk-goal-panel">
          <div className="sk-panel-card sk-goal-hero-card">
            <div className="sk-panel-badge">🎯 CAREER OBJECTIVE</div>
            <h2>{roadmap.title} Mission</h2>
            <p className="sk-goal-lead">{roadmap.goal?.objective || roadmap.description}</p>
            <div className="sk-goal-meta-row">
              <span className="sk-pill ess">{roadmap.goal?.experience_level || 'Entry to Senior (0 - 5+ Years)'}</span>
              <span className="sk-pill adv">Global Tech Standard</span>
            </div>
          </div>

          <div className="sk-panel-card sk-salary-card">
            <div className="sk-panel-badge">💰 GLOBAL COMPENSATION BENCHMARKS</div>
            <h3>Dual-Currency Salary Spectrum</h3>
            <p className="sk-salary-sub">Calibrated benchmarks across remote engineering teams, Silicon Valley hubs, and regional tech ecosystems.</p>
            <div className="sk-salary-grid">
              <div className="sk-salary-box">
                <span className="sk-salary-tag">Big Tech & Global Remote</span>
                <div className="sk-salary-amount sk-green">
                  {roadmap.goal?.salary_range?.usd
                    ? `$${(roadmap.goal.salary_range.usd.min / 1000).toFixed(0)}k - $${(roadmap.goal.salary_range.usd.max / 1000).toFixed(0)}k`
                    : '$80k - $140k'}
                  <span className="sk-salary-period">/ yr USD</span>
                </div>
                <span className="sk-salary-note">Worldwide Remote & US / European Tech Hubs</span>
              </div>
              <div className="sk-salary-box">
                <span className="sk-salary-tag">Regional Tech Hubs</span>
                <div className="sk-salary-amount">
                  {roadmap.goal?.salary_range?.inr_lpa
                    ? `₹${roadmap.goal.salary_range.inr_lpa.min} - ₹${roadmap.goal.salary_range.inr_lpa.max}`
                    : '₹6 - ₹20'}
                  <span className="sk-salary-period">LPA (INR)</span>
                </div>
                <span className="sk-salary-note">India, APAC & Emerging Tech Startup Hubs</span>
              </div>
            </div>
          </div>

          {roadmap.goal?.target_roles?.length > 0 && (
            <div className="sk-panel-card">
              <div className="sk-panel-badge">💼 TARGET ROLES</div>
              <h3>Industry Job Titles</h3>
              <p className="sk-panel-desc">Key engineering roles hiring worldwide for this skill profile.</p>
              <div className="sk-role-pills">
                {roadmap.goal.target_roles.map((role, i) => (
                  <span key={i} className="sk-role-pill">
                    <span className="sk-role-bullet">•</span>
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="sk-panel-card">
            <div className="sk-panel-badge">🏛️ ARCHITECTURAL PILLARS</div>
            <h3>Core Engineering Pillars</h3>
            <div className="sk-pillar-grid">
              {(roadmap.goal?.career_pillars || ['Foundational Systems', 'Architecture & Scale', 'Production Reliability']).map((pillar, i) => (
                <div key={i} className="sk-pillar-box">
                  <div className="sk-pillar-num">0{i + 1}</div>
                  <h4>{pillar}</h4>
                </div>
              ))}
            </div>
            {roadmap.learn?.summary && (
              <div className="sk-learn-summary-box">
                <p>{roadmap.learn.summary}</p>
              </div>
            )}
            <div className="sk-panel-action-row">
              <button
                type="button"
                className="sk-cert-btn unlocked"
                onClick={() => handleTabChange('learn')}
              >
                Explore Interactive Skill Tree (Learn) →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. BOOST TAB: Projects, Certifications & Interview Prep */}
      {activeTab === 'boost' && (
        <div className="sk-pillar-panel sk-boost-panel">
          <div className="sk-panel-card sk-boost-hero-card">
            <div className="sk-panel-badge">🚀 CAREER ACCELERATION</div>
            <h2>Proof of Work & Portfolio Boost</h2>
            <p className="sk-goal-lead">Stand out to global engineering managers and technical recruiters with portfolio-grade capstones, industry certifications, and Bun-Bot interview preparation.</p>
          </div>

          <div className="sk-panel-card">
            <div className="sk-panel-badge">🏆 PORTFOLIO-GRADE CAPSTONES</div>
            <h3>Recommended Projects for {roadmap.title}</h3>
            <p className="sk-panel-desc">Production-grade deliverables to showcase genuine engineering depth on your GitHub profile and resume.</p>
            <div className="sk-project-list">
              {(roadmap.boost?.capstone_projects || []).map((proj, i) => (
                <div key={i} className="sk-project-item">
                  <div className="sk-project-header">
                    <h4>{proj.title}</h4>
                    <span className="sk-pill adv">Capstone #{i + 1}</span>
                  </div>
                  <p className="sk-project-desc">{proj.description}</p>
                  <div className="sk-project-tags">
                    {(proj.tech_stack || []).map((t, idx) => (
                      <span key={idx} className="sk-project-tag">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sk-boost-dual-grid">
            <div className="sk-panel-card">
              <div className="sk-panel-badge">📜 INDUSTRY CREDENTIALS</div>
              <h3>Globally Recognized Certifications</h3>
              <ul className="sk-bullet-list">
                {(roadmap.boost?.certifications || ['Standard Cloud Associate', 'Domain Professional']).map((cert, i) => (
                  <li key={i}>
                    <span className="sk-list-check">✓</span>
                    <span>{cert}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sk-panel-card">
              <div className="sk-panel-badge">⚡ INTERVIEW FOCUS</div>
              <h3>Key Technical Interview Topics</h3>
              <ul className="sk-bullet-list">
                {(roadmap.boost?.interview_focus || ['System Design', 'Algorithms & Problem Solving', 'Domain Depth']).map((topic, i) => (
                  <li key={i}>
                    <span className="sk-list-check">⚡</span>
                    <span>{topic}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="sk-panel-card sk-cta-card">
            <div className="sk-panel-badge">🤖 MENTORSHIP & VERIFICATION</div>
            <h3>Ready to accelerate your {roadmap.title} journey?</h3>
            <p className="sk-panel-desc">Practice technical interview questions with Bun-Bot or take the official SkillBun proctored certification exam.</p>
            <div className="sk-cta-buttons">
              <Link
                href={`/counsellor?${new URLSearchParams({ q: `Simulate a technical interview for a ${roadmap.title} role. Ask me real interview questions one by one.`, context: `${roadmap.title} Roadmap` })}`}
                className="sk-btn-ai sk-cta-ai"
              >
                🤖 Simulate Interview with BunBot
              </Link>
              <Link
                href={`/roadmap/${slug}/certify`}
                className="sk-cert-btn unlocked sk-cta-cert"
              >
                🏆 Take Certification Exam
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Study Guide Drawer */}
      {selectedDocNode && (
        <StudyGuideDrawer
          key={selectedDocNode.docUrl}
          node={{ ...selectedDocNode, isDone: done(selectedDocNode.nodeId) }}
          user={user}
          onClose={() => setSelectedDocNode(null)}
          onToggleComplete={() => toggle(selectedDocNode.nodeId)}
          progressNotice={progressNotice}
          authLoading={authLoading}
        />
      )}
    </div>
  );
}

// Shared reading experience for every roadmap study guide.
function ReaderIcon({ name, size = 20 }) {
  const paths = {
    book: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
    play: 'm9 5 11 7-11 7V5Z',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
    external: 'M15 3h6v6m0-6L10 14M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4',
    lock: 'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4V10Zm8 5v3',
    refresh: 'M3 11a9 9 0 1 1 2.7 7M3 4v7h7',
    chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0ZM7 10h8M7 14h5',
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.book} /></svg>;
}

function StudyGuideDrawer({ node, user, onClose, onToggleComplete, authLoading, progressNotice }) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const articleRef = useRef(null);
  const tabRefs = useRef([]);
  const [activePanel, setActivePanel] = useState('guide');
  const [selectedVideoKey, setSelectedVideoKey] = useState(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [guide, setGuide] = useState({ status: 'loading', html: '', outline: [], owner: null });
  const compact = useSyncExternalStore(subscribeCompactRoadmap, getCompactRoadmapSnapshot, getCompactRoadmapServerSnapshot);
  const [outlineOpen, setOutlineOpen] = useState(null);
  const status = authLoading || guide.owner !== (user?.uid || null) ? 'loading' : guide.status;
  const { videos, links } = useMemo(() => getStudyGuideResources(node.resources), [node.resources]);
  const selectedVideo = videos.find(video => video.key === selectedVideoKey) || videos[0];
  const loginUrl = `/auth?next=${encodeURIComponent(`/roadmap/${node.docUrl?.match(/\/data\/docs\/([^/]+)\//)?.[1] || ''}`)}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const owner = user?.uid || null;
    const update = value => { if (active) setGuide({ html: '', outline: [], owner, ...value }); };
    async function loadGuide() {
      // Defer state updates and wait for the existing auth provider to settle.
      await Promise.resolve();
      if (!active) return;
      update({ status: 'loading' });
      if (authLoading) return;
      if (!user) { update({ status: 'login' }); return; }
      const match = node.docUrl?.match(/\/data\/docs\/([^/]+)\/([^/]+)\.md$/);
      if (!match) { update({ status: 'error' }); return; }
      try {
        const token = await user.getIdToken();
        if (!active) return;
        const response = await fetch(`/api/docs/${match[1]}/${match[2]}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401) { update({ status: 'login' }); return; }
        if (!response.ok) throw new Error('Failed to load study guide');
        const markdown = await response.text();
        if (!markdown.trim()) throw new Error('Empty study guide');
        if (!active) return;
        const content = DOMPurify.sanitize(marked.parse(markdown), { RETURN_DOM: true });
        const outline = Array.from(content.querySelectorAll('h2, h3')).map((heading, index) => {
          heading.id = `sk-guide-section-${index}`;
          heading.tabIndex = -1;
          return { id: heading.id, title: heading.textContent, level: heading.tagName };
        }).filter(heading => heading.title.trim());
        const words = content.textContent.trim().split(/\s+/).length;
        update({ status: 'ready', html: content.innerHTML, outline, minutes: Math.max(1, Math.ceil(words / 200)) });
      } catch (error) {
        if (error.name !== 'AbortError') update({ status: 'error' });
      }
    }
    loadGuide();
    return () => { active = false; controller.abort(); };
  }, [node.docUrl, user, authLoading, retry]);

  const changePanel = panel => {
    setActivePanel(panel);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };
  const jumpToSection = id => {
    const heading = articleRef.current?.querySelector(`#${id}`);
    if (!heading) return;
    heading.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    heading.focus({ preventScroll: true });
  };

  return (
    <dialog
      ref={dialogRef}
      className="sk-drawer-overlay"
      aria-labelledby="sk-drawer-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const targets = Array.from(event.currentTarget.querySelectorAll('button:not([disabled]), a[href], summary, iframe, [tabindex]:not([tabindex="-1"])'))
          .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="sk-drawer">
        <header className="sk-drawer-header">
          <div className="sk-drawer-title-info">
            <div className="sk-reader-brand">
              <Image src="/logo.png" alt="SkillBun Logo" width={28} height={28} />
              <span>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
              <span className="sk-reader-label">Study guide</span>
            </div>
            <h2 id="sk-drawer-title">{node.topicName}</h2>
            <p className="sk-drawer-context">{node.roadmapTitle}</p>
          </div>
          <button type="button" className="sk-drawer-close" onClick={onClose} aria-label="Close study guide"><ReaderIcon name="close" /></button>
        </header>

        <div className="sk-reader-tabs" role="tablist" aria-label="Study materials" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : activePanel === 'guide' ? 1 : 0;
          changePanel(nextIndex === 0 ? 'guide' : 'resources');
          tabRefs.current[nextIndex]?.focus();
        }}>
          <button ref={element => { tabRefs.current[0] = element; }} type="button" role="tab" id="sk-reader-guide-tab" aria-selected={activePanel === 'guide'} aria-controls="sk-reader-guide-panel" tabIndex={activePanel === 'guide' ? 0 : -1} onClick={() => changePanel('guide')}><ReaderIcon name="book" /> Study guide</button>
          <button ref={element => { tabRefs.current[1] = element; }} type="button" role="tab" id="sk-reader-resources-tab" aria-selected={activePanel === 'resources'} aria-controls="sk-reader-resources-panel" tabIndex={activePanel === 'resources' ? 0 : -1} onClick={() => changePanel('resources')}><ReaderIcon name="play" /> Videos & resources <span>{videos.length + links.length}</span></button>
        </div>

        <div className="sk-drawer-body" ref={bodyRef}>
          <div className="sk-reader-panel" role="tabpanel" id="sk-reader-guide-panel" aria-labelledby="sk-reader-guide-tab" hidden={activePanel !== 'guide'} tabIndex={0}>
            {status === 'loading' ? (
              <div className="sk-reader-state" role="status"><div className="sk-spinner" /><h3>Opening your study guide</h3><p>Getting this topic ready to read.</p></div>
            ) : status === 'login' ? (
              <div className="sk-reader-state">
                <div className="sk-reader-state-icon"><ReaderIcon name="lock" size={32} /></div>
                <h3>Your next topic, explained.</h3>
                <p>Log in to read the SkillBun study guide and save your learning progress. Videos and resource links are available to everyone.</p>
                <div className="sk-reader-state-actions"><Link href={loginUrl} className="sk-btn-login">Log in to read this guide</Link><button type="button" onClick={() => { changePanel('resources'); tabRefs.current[1]?.focus(); }}>Explore resources <ReaderIcon name="external" size={16} /></button></div>
              </div>
            ) : status === 'error' ? (
              <div className="sk-reader-state" role="alert">
                <div className="sk-reader-state-icon"><ReaderIcon name="book" size={32} /></div><h3>This guide couldn't load</h3><p>Try again, or explore the supporting resources while you wait.</p>
                <div className="sk-reader-state-actions"><button type="button" className="sk-btn-login" onClick={() => setRetry(value => value + 1)}><ReaderIcon name="refresh" size={18} /> Try again</button><button type="button" onClick={() => { changePanel('resources'); tabRefs.current[1]?.focus(); }}>Explore resources</button></div>
              </div>
            ) : (
              <div className="sk-reader-layout" data-has-outline={guide.outline.length > 0}>
                {guide.outline.length > 0 && (
                  <details className="sk-reader-outline" open={outlineOpen ?? !compact} onToggle={event => setOutlineOpen(event.currentTarget.open)}>
                    <summary>On this page</summary>
                    <nav aria-label="Guide sections">{guide.outline.map(heading => <button type="button" key={heading.id} data-level={heading.level} onClick={() => jumpToSection(heading.id)}>{heading.title}</button>)}</nav>
                  </details>
                )}
                <article ref={articleRef} className="sk-markdown-content" aria-label={`${node.topicName} study guide`} dangerouslySetInnerHTML={{ __html: guide.html }} />
              </div>
            )}
          </div>

          <div className="sk-reader-panel" role="tabpanel" id="sk-reader-resources-panel" aria-labelledby="sk-reader-resources-tab" hidden={activePanel !== 'resources'} tabIndex={0}>
            {activePanel === 'resources' && <div className="sk-reader-resources">
              {selectedVideo && <div className="sk-reader-video-section">
                <h3 className="sk-reader-section-title">Watch & understand <span>{videos.length} {videos.length === 1 ? 'video' : 'videos'}</span></h3>
                <div className="sk-reader-video-layout">
                  <div className="sk-reader-player">
                    {selectedVideo.embedUrl ? <iframe key={selectedVideo.key} width="100%" src={selectedVideo.embedUrl} title={selectedVideo.title} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <div className="sk-reader-video-fallback"><ReaderIcon name="play" size={36} /><p>Watch this tutorial on {selectedVideo.host}.</p><a href={selectedVideo.watchUrl} target="_blank" rel="noopener noreferrer">Open video <ReaderIcon name="external" size={16} /></a></div>}
                    <div className="sk-video-title"><span>{selectedVideo.title}</span><a href={selectedVideo.watchUrl} target="_blank" rel="noopener noreferrer" aria-label={`${selectedVideo.embedUrl ? 'Watch on YouTube' : 'Open video'}: ${selectedVideo.title} (opens in a new tab)`}>{selectedVideo.embedUrl ? 'Watch on YouTube' : 'Open video'}<ReaderIcon name="external" size={18} /></a></div>
                  </div>
                  {videos.length > 1 && <div className="sk-reader-video-list" role="group" aria-label="Choose a tutorial">{videos.map((video, index) => <button type="button" key={video.key} aria-pressed={video.key === selectedVideo.key} onClick={() => setSelectedVideoKey(video.key)}><span className="sk-reader-video-number">{index + 1}</span><span>{video.title}</span><ReaderIcon name="play" size={16} /></button>)}</div>}
                </div>
              </div>}
              {links.length > 0 && <div className="sk-reader-link-section"><h3 className="sk-reader-section-title">Read & explore <span>{links.length} {links.length === 1 ? 'resource' : 'resources'}</span></h3><div className="sk-reader-links">{links.map(resource => <a className="sk-reader-resource-link" href={resource.url} key={resource.key} target="_blank" rel="noopener noreferrer"><ReaderIcon name="book" /><span><strong>{resource.title}</strong><small>{resource.host}</small></span><ReaderIcon name="external" size={18} /></a>)}</div></div>}
              {!videos.length && !links.length && <div className="sk-reader-state"><div className="sk-reader-state-icon"><ReaderIcon name="book" size={32} /></div><h3>Keep learning with the guide</h3><p>There are no additional links for this topic yet. BunBot can help explain a concept or work through an example.</p></div>}
            </div>}
          </div>
        </div>

        <footer className="sk-drawer-actions">
          <div className="sk-reader-status" role="status"><ReaderIcon name={node.isDone ? 'check' : !node.isUnlocked ? 'lock' : 'book'} size={18} /><span>{progressNotice || (node.isDone ? 'Topic completed' : !node.isUnlocked ? 'Complete the prerequisite to unlock progress' : status === 'ready' ? `About ${guide.minutes} min read` : 'Learn at your own pace')}</span></div>
          <div className="sk-reader-footer-buttons">
            <Link href={askBunBot(node.topicName, node.roadmapTitle)} className="sk-btn-ai"><ReaderIcon name="chat" size={18} /> Ask BunBot</Link>
            <button type="button" className={`sk-btn-mark ${node.isDone ? 'done' : ''}`} disabled={!node.isUnlocked || authLoading || saving} onClick={async () => { setSaving(true); try { await onToggleComplete(); } finally { setSaving(false); } }}><ReaderIcon name={node.isDone ? 'refresh' : 'check'} size={18} />{saving ? 'Saving...' : node.isDone ? 'Undo completion' : !user ? 'Log in to save progress' : node.exp ? `Mark complete (+${node.exp} XP)` : 'Mark complete'}</button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
