'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import WorkspaceSidebar from '../components/WorkspaceSidebar';
import { useAuth } from '../components/AuthProvider';
import { readAllStoredRoadmapProgress } from '@/utils/shared/progressStore';
import { subscribeDataSync } from '@/utils/client/dataSyncManager';
import styles from './roadmap-hub.module.css';

function categoryLabel(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.label || 'Roadmap';
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function totalNodesFor(roadmap) {
  return roadmap.totalNodes || roadmap.completedCount || 0;
}

function remainingNodesFor(roadmap) {
  return Math.max(totalNodesFor(roadmap) - roadmap.completedCount, 0);
}

function nextCheckpointPercent(percent) {
  if (percent >= 100) return 100;
  return Math.min(100, Math.ceil((percent + 1) / 25) * 25);
}

const categoryCodes = {
  web_app: 'WEB',
  ai_data: 'AI',
  cybersecurity: 'SEC',
  cloud_devops: 'OPS',
  design_product: 'UX',
  systems_emerging: 'SYS',
  business_ops: 'BIZ',
};

function RoadmapCard({ categories, roadmap, featured = false }) {
  return (
    <article className={`${styles.roadmapCard} ${featured ? styles.featuredCard : ''}`}>
      <div className={styles.cardTopline}>
        <span>{categoryLabel(categories, roadmap.category)}</span>
        <span>{roadmap.totalNodes || 0} nodes</span>
      </div>
      <h3>{roadmap.title}</h3>
      <p>{roadmap.description}</p>
      <div className={styles.cardMeta}>
        <span>{roadmap.salary ? `Editorial estimate: ${roadmap.salary}` : `${roadmap.resourceCount || 0} resources`}</span>
        <span>{featured ? 'Featured path' : 'Skill tree'}</span>
      </div>
      <Link href={`/roadmap/${roadmap.slug}`} className={styles.secondaryButton}>
        Open Roadmap
      </Link>
    </article>
  );
}

function ProgressCard({ categories, roadmap }) {
  const totalNodes = totalNodesFor(roadmap);
  const remainingNodes = remainingNodesFor(roadmap);
  const checkpoint = nextCheckpointPercent(roadmap.percent);
  const checkpointLabel = roadmap.percent >= 100 ? 'Complete' : `${checkpoint}% checkpoint`;
  const progressBeads = [20, 40, 60, 80, 100];

  return (
    <article className={styles.progressCard}>
      <div className={styles.progressCardTopline}>
        <span>{categoryLabel(categories, roadmap.category)}</span>
        <small>{checkpointLabel}</small>
      </div>
      <div className={styles.progressHeader}>
        <div>
          <span>Saved path</span>
          <h3>{roadmap.title}</h3>
        </div>
        <strong>{roadmap.percent}%</strong>
      </div>
      <p className={styles.progressDescription}>{roadmap.description}</p>
      <div className={styles.progressTrack} aria-label={`${roadmap.percent}% completed`}>
        <span style={{ '--bar-width': `${roadmap.percent}%` }} />
      </div>
      <div className={styles.progressBeads} aria-hidden="true">
        {progressBeads.map((bead) => (
          <span key={bead} className={roadmap.percent >= bead ? styles.progressBeadActive : ''} />
        ))}
      </div>
      <div className={styles.progressMeta}>
        <span><strong>{roadmap.completedCount}</strong> done</span>
        <span><strong>{remainingNodes}</strong> left</span>
        <span><strong>{totalNodes}</strong> nodes</span>
      </div>
      <Link href={`/roadmap/${roadmap.slug}`} className={styles.primaryButton}>
        Continue Path
      </Link>
    </article>
  );
}

function SavedEmptyState({ onExplore }) {
  return (
    <div className={styles.savedEmptyState}>
      <div className={styles.emptyBlueprint} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p className={styles.kicker}>My Saved Roadmaps</p>
        <h3>Your progress dock is ready</h3>
        <p>Open any roadmap and complete one node. SkillBun will pin that path here automatically.</p>
        <div className={styles.emptyActions}>
          <button type="button" className={styles.primaryButton} onClick={onExplore}>
            Explore Roadmaps
          </button>
          <Link href="/quiz" className={styles.ghostButton}>
            Career Quiz
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RoadmapHubClient({ categories, roadmaps }) {
  const { progressVersion } = useAuth();
  const [progressRows, setProgressRows] = useState(() => (typeof window !== 'undefined' ? readAllStoredRoadmapProgress() : []));
  const [activeView, setActiveView] = useState('saved');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('web_app');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      if (view === 'explore' || view === 'saved') {
        setTimeout(() => {
          setActiveView(view);
        }, 0);
      }
    }
  }, []);

  const handleViewChange = (view) => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  };

  useEffect(() => {
    const syncProgress = () => setProgressRows(readAllStoredRoadmapProgress());

    syncProgress();
    window.addEventListener('storage', syncProgress);
    window.addEventListener('sb_progress_change', syncProgress);

    const unsubscribe = subscribeDataSync(({ tag }) => {
      if (tag === 'user:progress' || tag === 'user:profile') {
        syncProgress();
      }
    });

    return () => {
      window.removeEventListener('storage', syncProgress);
      window.removeEventListener('sb_progress_change', syncProgress);
      unsubscribe();
    };
  }, [progressVersion]);

  const roadmapBySlug = useMemo(() => (
    new Map(roadmaps.map((roadmap) => [roadmap.slug, roadmap]))
  ), [roadmaps]);

  const myRoadmaps = useMemo(() => (
    progressRows
      .map(({ slug, completedNodeIds }) => {
        const roadmap = roadmapBySlug.get(slug);

        if (!roadmap) {
          return null;
        }

        const completedSet = new Set(completedNodeIds);
        const knownCompleted = roadmap.nodeIds.filter((nodeId) => completedSet.has(nodeId)).length;
        const completedCount = roadmap.nodeIds.length ? knownCompleted : completedNodeIds.length;
        const totalNodes = roadmap.totalNodes || completedCount;
        const percent = totalNodes ? clampPercent(Math.round((completedCount / totalNodes) * 100)) : 0;

        return {
          ...roadmap,
          completedCount,
          totalNodes,
          percent,
        };
      })
      .filter((roadmap) => roadmap && roadmap.completedCount > 0)
      .sort((a, b) => b.completedCount - a.completedCount || a.title.localeCompare(b.title))
  ), [progressRows, roadmapBySlug]);

  const explorableCategories = useMemo(() => (
    categories.filter((category) => category.id !== 'all')
  ), [categories]);

  const selectedCategory = useMemo(() => (
    categories.find((category) => category.id === activeCategory) || explorableCategories[0]
  ), [activeCategory, categories, explorableCategories]);

  const selectedCategoryRoadmaps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return roadmaps.filter((roadmap) => {
      const matchesCategory = roadmap.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || roadmap.title.toLowerCase().includes(normalizedQuery)
        || roadmap.description.toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query, roadmaps]);

  const categoryCounts = useMemo(() => (
    categories.reduce((counts, category) => {
      counts[category.id] = category.id === 'all'
        ? roadmaps.length
        : roadmaps.filter((roadmap) => roadmap.category === category.id).length;
      return counts;
    }, {})
  ), [categories, roadmaps]);

  const completedNodeTotal = myRoadmaps.reduce((total, roadmap) => total + roadmap.completedCount, 0);
  const savedNodeTotal = myRoadmaps.reduce((total, roadmap) => total + totalNodesFor(roadmap), 0);
  const remainingNodeTotal = myRoadmaps.reduce((total, roadmap) => total + remainingNodesFor(roadmap), 0);
  const averageProgress = myRoadmaps.length
    ? clampPercent(Math.round(myRoadmaps.reduce((total, roadmap) => total + roadmap.percent, 0) / myRoadmaps.length))
    : 0;
  const topRoadmap = myRoadmaps[0];
  const topRoadmapCheckpoint = topRoadmap ? nextCheckpointPercent(topRoadmap.percent) : 0;
  const topRoadmapRemaining = topRoadmap ? remainingNodesFor(topRoadmap) : 0;
  const resumeQueueRoadmaps = myRoadmaps.slice(1);
  const savedCategoryStats = useMemo(() => {
    const counts = myRoadmaps.reduce((map, roadmap) => {
      map.set(roadmap.category, (map.get(roadmap.category) || 0) + 1);
      return map;
    }, new Map());

    return Array.from(counts.entries())
      .map(([categoryId, count]) => ({
        id: categoryId,
        count,
        label: categoryLabel(categories, categoryId),
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [categories, myRoadmaps]);
  const activePanelTitle = activeView === 'saved' ? 'My Saved Roadmaps' : 'Explore Roadmaps';
  const categoryTotal = categoryCounts[activeCategory] || 0;
  const hasCategoryQuery = Boolean(query.trim());
  const headerSummary = activeView === 'saved'
    ? [
      { value: myRoadmaps.length, label: 'saved' },
      { value: completedNodeTotal, label: 'done' },
      { value: remainingNodeTotal, label: 'left' },
    ]
    : [
      { value: selectedCategoryRoadmaps.length, label: 'shown' },
      { value: categoryTotal, label: 'category' },
      { value: roadmaps.length, label: 'total' },
    ];

  return (
    <main className={styles.page}>
      <div className={styles.bgGridOverlay} aria-hidden="true" />
      <div className={`${styles.floater} ${styles.floatOne}`} aria-hidden="true">
        {'roadmap.open()'}
      </div>
      <div className={`${styles.floater} ${styles.floatTwo}`} aria-hidden="true">
        {'{ paths: all }'}
      </div>

      <div className={styles.container}>
        <section className={styles.board} aria-label="Roadmap workspace">
          <WorkspaceSidebar active="roadmaps" title="Roadmaps" status="ROADMAPS.ONLINE" />

          <div className={styles.mainColumn}>
            <header className={styles.workspaceHeader}>
              <div>
                <p className={styles.kicker}>Roadmaps</p>
                <h2>Track active paths and explore what to learn next.</h2>
                <div className={styles.viewSwitcher} role="tablist" aria-label="Roadmap views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'saved'}
                    className={activeView === 'saved' ? styles.viewButtonActive : ''}
                    onClick={() => handleViewChange('saved')}
                  >
                    My Saved Roadmaps
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'explore'}
                    className={activeView === 'explore' ? styles.viewButtonActive : ''}
                    onClick={() => handleViewChange('explore')}
                  >
                    Explore Roadmaps
                  </button>
                </div>
              </div>
              <div className={styles.headerStats} aria-label="Roadmap summary">
                {headerSummary.map((item) => (
                  <span key={item.label}><strong>{item.value}</strong>{item.label}</span>
                ))}
              </div>
            </header>

            <section className={`${styles.panel} ${styles.glassPanel}`} aria-labelledby="active-roadmap-view-title">
              {activeView === 'saved' ? (
                <>
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={styles.kicker}>{activePanelTitle}</p>
                      <h2 id="active-roadmap-view-title">Your roadmap command center</h2>
                    </div>
                    <Link href="/quiz" className={styles.ghostButton}>
                      Career Quiz
                    </Link>
                  </div>

                  {myRoadmaps.length > 0 ? (
                    <div className={styles.savedExperience}>
                      <section className={styles.savedHero} aria-label="Top saved roadmap">
                        <div className={styles.savedHeroCopy}>
                          <span className={styles.savedStatus}>Top saved path</span>
                          <h3>{topRoadmap.title}</h3>
                          <p>{topRoadmap.description}</p>
                          <div className={styles.savedHeroMeta}>
                            <span>{categoryLabel(categories, topRoadmap.category)}</span>
                            <span>{topRoadmap.completedCount}/{totalNodesFor(topRoadmap)} nodes</span>
                            <span>{topRoadmap.resourceCount || 0} resources</span>
                          </div>
                          <div className={styles.savedHeroActions}>
                            <Link href={`/roadmap/${topRoadmap.slug}`} className={styles.primaryButton}>
                              Continue Top Path
                            </Link>
                            <button type="button" className={styles.ghostButton} onClick={() => handleViewChange('explore')}>
                              Find Next Path
                            </button>
                          </div>
                        </div>
                        <div className={styles.savedDialPanel}>
                          <div className={styles.progressDial} style={{ '--progress-angle': `${topRoadmap.percent * 3.6}deg` }}>
                            <div className={styles.progressDialText}>
                              <span>{topRoadmap.percent}%</span>
                              <small>progress</small>
                            </div>
                          </div>
                          <p>
                            {topRoadmap.percent >= 100
                              ? 'All tracked nodes are complete.'
                              : `${topRoadmapRemaining} nodes left. Next: ${topRoadmapCheckpoint}% checkpoint.`}
                          </p>
                        </div>
                      </section>

                      <div className={styles.savedInsights} aria-label="Saved roadmap stats">
                        <div className={styles.savedInsight}>
                          <span>Average Progress</span>
                          <strong>{averageProgress}%</strong>
                          <small>across saved paths</small>
                        </div>
                        <div className={styles.savedInsight}>
                          <span>Completed Nodes</span>
                          <strong>{completedNodeTotal}</strong>
                          <small>marked done</small>
                        </div>
                        <div className={styles.savedInsight}>
                          <span>Remaining Nodes</span>
                          <strong>{remainingNodeTotal}</strong>
                          <small>left to clear</small>
                        </div>
                        <div className={styles.savedCategoryPanel}>
                          <span>Saved Categories</span>
                          <div>
                            {savedCategoryStats.slice(0, 4).map((category) => (
                              <small key={category.id}>
                                {category.label}
                                <strong>{category.count}</strong>
                              </small>
                            ))}
                          </div>
                        </div>
                      </div>

                      {resumeQueueRoadmaps.length > 0 ? (
                        <>
                          <div className={styles.savedQueueHeader}>
                            <div>
                              <p className={styles.kicker}>Resume Queue</p>
                              <h3>Other saved paths ready to continue</h3>
                            </div>
                            <span>{resumeQueueRoadmaps.length} more / {savedNodeTotal} total nodes</span>
                          </div>

                          <div className={styles.myRoadmapGrid}>
                            {resumeQueueRoadmaps.map((roadmap) => (
                              <ProgressCard key={roadmap.slug} categories={categories} roadmap={roadmap} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className={styles.savedNextPanel}>
                          <div>
                            <p className={styles.kicker}>Next Slot</p>
                            <h3>Add another roadmap when you are ready</h3>
                            <p>Your current saved path stays in focus above. Explore a second path when you want a backup track.</p>
                          </div>
                          <button type="button" className={styles.ghostButton} onClick={() => handleViewChange('explore')}>
                            Explore More
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <SavedEmptyState onExplore={() => handleViewChange('explore')} />
                  )}
                </>
              ) : (
                <>
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={styles.kicker}>{activePanelTitle}</p>
                      <h2 id="active-roadmap-view-title">Pick a category, then open a roadmap</h2>
                      <div className={styles.categorySwitcher} aria-label="Roadmap categories">
                        {explorableCategories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            aria-pressed={activeCategory === category.id}
                            className={activeCategory === category.id ? styles.categoryButtonActive : ''}
                            onClick={() => {
                              setActiveCategory(category.id);
                              setQuery('');
                            }}
                          >
                            <span className={styles.categoryMark}>{categoryCodes[category.id] || category.label.slice(0, 3)}</span>
                            <span className={styles.categoryName}>{category.label}</span>
                            <strong>{categoryCounts[category.id] || 0}</strong>
                          </button>
                        ))}
                        <label className={`${styles.searchBox} ${styles.categorySearch}`}>
                          <span className={styles.srOnly}>Search roadmaps</span>
                          <span className={styles.searchGlyph} aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="7" />
                              <path d="m16 16 4 4" />
                            </svg>
                          </span>
                          <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search roadmaps..."
                          />
                        </label>
                      </div>
                    </div>
                    <span className={styles.resultCount}>{selectedCategoryRoadmaps.length} shown</span>
                  </div>

                  <div className={styles.categoryHeader}>
                    <div>
                      <p className={styles.kicker}>{selectedCategory?.label || 'Category'}</p>
                      <h3>
                        {hasCategoryQuery
                          ? `${selectedCategoryRoadmaps.length} matching ${selectedCategoryRoadmaps.length === 1 ? 'roadmap' : 'roadmaps'}`
                          : `${categoryTotal} roadmaps in this category`}
                      </h3>
                    </div>
                  </div>

                  {selectedCategoryRoadmaps.length > 0 ? (
                    <div className={styles.catalogGrid}>
                      {selectedCategoryRoadmaps.map((roadmap) => (
                        <RoadmapCard key={roadmap.slug} categories={categories} roadmap={roadmap} />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <p>No roadmaps match that search.</p>
                      <span>Try a different career name or category.</span>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
