'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import WorkspaceSidebar from '../components/WorkspaceSidebar';
import { readAllStoredRoadmapProgress } from '@/utils/shared/progressStore';
import { subscribeDataSync } from '@/utils/client/dataSyncManager';
import styles from './dashboard.module.css';

function safeGet(obj, key) {
  const keyStr = String(key);
  if (obj && Object.prototype.hasOwnProperty.call(obj, keyStr)) {
    return Reflect.get(obj, keyStr);
  }
  return undefined;
}

const DEFAULT_FEATURED_SLUGS = ['soc_analyst', 'frontend', 'flutter_developer', 'game_development'];

const roadmapHrefByProject = {
  'soc_analyst': '/roadmap/soc_analyst',
  'frontend': '/roadmap/frontend',
  'flutter_developer': '/roadmap/flutter_developer',
  'game_development': '/roadmap/game_development',
};

const interestIntelMap = {
  'Cybersecurity': [
    { icon: 'chart', text: 'Security lab tasks are queued for the SOC Analyst path.' },
    { icon: 'cloud', text: 'Cloud notes are pinned for the next salary research pass.' },
    { icon: 'file', text: 'Threat Intelligence watchlist needs source review.' },
    { icon: 'folder', text: 'Portfolio sprint: publish the Blue Team lab writeup.' },
  ],
  'Web Development': [
    { icon: 'chart', text: 'Performance audit tasks are queued for the Frontend Developer path.' },
    { icon: 'cloud', text: 'Next.js rendering notes are pinned for the next pass.' },
    { icon: 'file', text: 'Component library watchlist needs API review.' },
    { icon: 'folder', text: 'Portfolio sprint: publish the React portfolio project.' },
  ],
  'AI / Machine Learning': [
    { icon: 'chart', text: 'Model evaluation tasks are queued for the AI/ML path.' },
    { icon: 'cloud', text: 'GPU instance quotas are pinned for the next training pass.' },
    { icon: 'file', text: 'AI/ML watchlist needs source review before saving.' },
    { icon: 'folder', text: 'Portfolio sprint: publish the LLM fine-tuning notes.' },
  ],
  'default': [
    { icon: 'chart', text: 'Security lab tasks are queued for the SOC Analyst path.' },
    { icon: 'cloud', text: 'Cloud notes are pinned for the next salary research pass.' },
    { icon: 'file', text: 'AI/ML watchlist needs source review before saving.' },
    { icon: 'folder', text: 'Portfolio sprint: publish the DSA project notes.' },
  ]
};

function Icon({ name }) {
  const paths = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    quiz: (
      <>
        <path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-.9.7-1.6 1.2-1.6 2.6" />
        <path d="M12 17h.01" />
        <rect x="5" y="3" width="14" height="18" rx="2" />
      </>
    ),
    map: (
      <>
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M4.2 4.2l2.1 2.1" />
        <path d="M17.7 17.7l2.1 2.1" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
        <path d="M4.2 19.8l2.1-2.1" />
        <path d="M17.7 6.3l2.1-2.1" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-.9.7-1.6 1.2-1.6 2.6" />
        <path d="M12 17h.01" />
      </>
    ),
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    up: (
      <>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    flame: (
      <>
        <path d="M8.5 14.5A3.5 3.5 0 0 0 12 20a5 5 0 0 0 5-5c0-2.9-1.7-4.8-3.2-6.4-.9-.9-1.7-1.8-1.8-2.9-2.6 1.6-4 3.7-3.5 6.1" />
        <path d="M12 20a2.5 2.5 0 0 0 2.5-2.5c0-1.2-.6-2-1.4-2.8-.5-.5-.9-1-1.1-1.7-1.2.8-2 1.8-2 3A2.5 2.5 0 0 0 12 20Z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-4" />
        <path d="M12 16V8" />
        <path d="M16 16v-6" />
      </>
    ),
    cloud: <path d="M17.5 19H8a5 5 0 1 1 .8-9.9A6.5 6.5 0 0 1 21 12.5a3.5 3.5 0 0 1-3.5 6.5Z" />,
    file: (
      <>
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </>
    ),
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    send: (
      <>
        <path d="M22 2 11 13" />
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      </>
    ),
  };

  const pathContent = safeGet(paths, name);

  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {pathContent}
    </svg>
  );
}

export default function DashboardClient({ roadmapsInfo }) {
  const { profile, authLoading, progressVersion } = useAuth();
  const [localProgress, setLocalProgress] = useState(() => (typeof window !== 'undefined' ? readAllStoredRoadmapProgress() : []));

  // Read progress dynamically on progress version changes, mount, or cross-tab sync
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalProgress(readAllStoredRoadmapProgress());
    }, 0);

    const unsubscribe = subscribeDataSync((tag) => {
      if (tag === 'user:progress' || tag === 'user:profile') {
        setLocalProgress(readAllStoredRoadmapProgress());
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [progressVersion]);

  // Determine active project progress list
  const activeProjects = useMemo(() => {
    const list = [];
    const processedSlugs = new Set();

    // 1. Gather all paths that have some progress in localStorage
    localProgress.forEach(({ slug, completedNodeIds }) => {
      if (!slug || completedNodeIds.length === 0) return;
      const info = safeGet(roadmapsInfo, slug);
      if (!info) return;

      processedSlugs.add(slug);
      list.push({
        slug,
        label: info.title,
        done: completedNodeIds.length,
        total: info.totalNodes || 13,
      });
    });

    // 2. Fill with default featured paths if active paths are less than 4
    DEFAULT_FEATURED_SLUGS.forEach(slug => {
      if (processedSlugs.size >= 4 || processedSlugs.has(slug)) return;
      const info = safeGet(roadmapsInfo, slug) || { title: slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), totalNodes: 13 };

      processedSlugs.add(slug);
      list.push({
        slug,
        label: info.title,
        done: 0,
        total: info.totalNodes,
      });
    });

    return list;
  }, [localProgress, roadmapsInfo]);

  // Calculate overall progress across listed projects
  const { doneCount, totalCount, overallProgress, remainingCount } = useMemo(() => {
    let done = 0;
    let total = 0;

    activeProjects.forEach(p => {
      done += p.done;
      total += p.total;
    });

    const overall = total === 0 ? 0 : Math.round((done / total) * 100);
    const remaining = total - done;

    return { doneCount: done, totalCount: total, overallProgress: overall, remainingCount: remaining };
  }, [activeProjects]);

  // Determine dynamic stats cards values
  const statsMetrics = useMemo(() => {
    return [
      { label: 'Total XP', value: String(doneCount * 100), note: 'Validated growth', icon: 'bolt', tone: 'gold' },
      { label: 'Active Paths', value: String(localProgress.filter(p => p.completedNodeIds.length > 0).length), note: 'Based on your activity', icon: 'up', tone: 'mint' },
      { label: 'Skills Mastered', value: String(doneCount), note: 'Validated nodes', icon: 'check', tone: 'green' },
      { label: 'Remaining', value: String(remainingCount), note: 'Open skill nodes', icon: 'flame', tone: 'warm' },
    ];
  }, [doneCount, localProgress, remainingCount]);

  // Dynamic standing bars value
  const standingBars = useMemo(() => {
    const calculatedStanding = totalCount === 0 ? 0 : Math.min(98, Math.max(10, Math.round((doneCount / totalCount) * 100)));
    return [
      { label: 'Avg User', value: 53, tone: 'muted' },
      { label: 'You', value: calculatedStanding || 15, tone: 'active' },
      { label: 'Top 1%', value: 99, tone: 'top' },
    ];
  }, [doneCount, totalCount]);

  // Dynamic standing kicker copy
  const standingKicker = useMemo(() => {
    const myStanding = standingBars.find(b => b.label === 'You')?.value || 15;
    if (myStanding >= 90) return 'Top 1% of learners';
    if (myStanding >= 70) return 'Top 10% of learners';
    if (myStanding >= 50) return 'Top 25% of learners';
    return 'SkillBun active explorer';
  }, [standingBars]);

  // Determine dynamic reminders card
  const reminderInfo = useMemo(() => {
    // Find the first path with actual progress
    const activePath = activeProjects.find(p => p.done > 0 && p.done < p.total);
    if (activePath) {
      return {
        title: `You left off at ${activePath.label}`,
        copy: `What's next: Complete the next skill node to reach ${activePath.done + 1}/${activePath.total}.`,
        href: safeGet(roadmapHrefByProject, activePath.slug) || `/roadmap/${activePath.slug}`,
        btnLabel: 'Continue Journey',
      };
    }

    // Default when no progress has been made
    return {
      title: 'Ready to start your journey?',
      copy: "What's next: Complete the adaptive quiz to get your personalized recommendations.",
      href: '/quiz',
      btnLabel: 'Take Career Quiz',
    };
  }, [activeProjects]);

  // Industry Intel specific to interest
  const intelList = useMemo(() => {
    const interest = profile?.interest || 'default';
    return safeGet(interestIntelMap, interest) || interestIntelMap['default'];
  }, [profile?.interest]);

  return (
    <main className={styles.page}>
      <div className={styles.bgGridOverlay} aria-hidden="true" />
      <div className={`${styles.floater} ${styles.floatOne}`} aria-hidden="true">
        {'<Progress />'}
      </div>
      <div className={`${styles.floater} ${styles.floatTwo}`} aria-hidden="true">
        {`{ xp: ${doneCount * 100} }`}
      </div>

      <div className={styles.container}>
        <section className={styles.board} aria-label="Dashboard workspace">
          <WorkspaceSidebar active="dashboard" />

          <div className={styles.mainColumn}>
            {/* Stats Metrics Grid */}
            <div className={styles.metricsGrid} aria-label="Dashboard summary">
              {statsMetrics.map((metric) => (
                <article key={metric.label} className={`${styles.metricCard} ${styles.glassPanel}`}>
                  <div>
                    <p className={styles.metricLabel}>{metric.label}</p>
                    <div className={styles.metricValueRow}>
                      <strong>{metric.value}</strong>
                      {metric.label === 'Total XP' && doneCount > 0 ? <span className={styles.verifiedMark} aria-label="Verified progress" /> : null}
                    </div>
                    <p className={styles.metricNote}>{metric.note}</p>
                  </div>
                  <span className={`${styles.metricIcon} ${safeGet(styles, metric.tone) || ''}`}>
                    <Icon name={metric.icon} />
                  </span>
                </article>
              ))}
            </div>

            {/* Performance Panel */}
            <article className={`${styles.panel} ${styles.performancePanel} ${styles.glassPanel}`}>
              <div className={styles.panelHeader}>
                <h2>Performance & Goals</h2>
                <span>{standingKicker}</span>
              </div>

              <div className={styles.chartBlock}>
                <h3>Estimated Global Standing</h3>
                <div className={styles.standingBars}>
                  {standingBars.map((bar) => (
                    <div key={bar.label} className={styles.standingRow}>
                      <span>{bar.label} ({bar.value}%)</span>
                      <div className={styles.track}>
                        <span
                          className={`${styles.fill} ${safeGet(styles, bar.tone) || ''}`}
                          style={{ '--bar-width': `${bar.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.chartBlock}>
                <h3>Career-Ready Progress</h3>
                <div className={styles.careerTrack}>
                  <span style={{ '--bar-width': `${overallProgress}%` }} />
                </div>
                <div className={styles.progressSplit}>
                  <span>{doneCount} done, {overallProgress}%</span>
                  <span>{remainingCount} remaining</span>
                </div>
              </div>
            </article>

            {/* Bottom Grid: Intel + Project Donut */}
            <div className={styles.bottomGrid}>
              <article className={`${styles.panel} ${styles.intelPanel} ${styles.glassPanel}`}>
                <h2>Industry Intel</h2>
                <ul className={styles.intelList}>
                  {intelList.map((item) => (
                    <li key={item.text}>
                      <span className={styles.intelIcon}>
                        <Icon name={item.icon} />
                      </span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={`${styles.panel} ${styles.donutPanel} ${styles.glassPanel}`}>
                <h2>Project Progress</h2>
                <div className={styles.donutWrap}>
                  <div
                    className={styles.donut}
                    style={{ '--progress': `${overallProgress * 3.6}deg` }}
                    aria-label={`${overallProgress}% completed`}
                  >
                    <span>{overallProgress}%</span>
                    <small>overall</small>
                  </div>
                  <div className={styles.legend}>
                    <span><i className={styles.completedDot} />Completed</span>
                    <span><i className={styles.progressDot} />In Progress</span>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <aside className={styles.sideColumn} aria-label="Dashboard details">
            {/* Reminder Dynamic Panel */}
            <article className={`${styles.panel} ${styles.reminderPanel} ${styles.glassPanel}`}>
              <h2>Reminders</h2>
              <p className={styles.reminderTitle}>{reminderInfo.title}</p>
              <p className={styles.reminderCopy}>{reminderInfo.copy}</p>
              <Link href={reminderInfo.href} className={styles.primaryButton}>
                {reminderInfo.btnLabel}
              </Link>
            </article>

            {/* Projects List with Real Progress */}
            <article className={`${styles.panel} ${styles.projectsPanel} ${styles.glassPanel}`}>
              <h2>Projects</h2>
              <div className={styles.projectList}>
                {activeProjects.map((project) => {
                  const percent = Math.round((project.done / project.total) * 100);
                  const pathHref = safeGet(roadmapHrefByProject, project.slug) || `/roadmap/${project.slug}`;
                  return (
                    <Link
                      key={project.label}
                      href={pathHref}
                      className={styles.projectItem}
                    >
                      <div className={styles.projectTopline}>
                        <span>{project.label}</span>
                        <span>{project.done}/{project.total} done, {percent}%</span>
                      </div>
                      <div className={styles.miniTrack}>
                        <span style={{ '--bar-width': `${percent}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </article>

            {/* BunBot Form Panel */}
            <article className={`${styles.panel} ${styles.bunBotPanel} ${styles.glassPanel}`}>
              <div className={styles.pixarBunnyContainer} aria-hidden="true">
                <div className={styles.pixarBunny}>
                  <div className={`${styles.pbEar} ${styles.pbFur} ${styles.pbEarLeft}`} />
                  <div className={`${styles.pbEar} ${styles.pbFur} ${styles.pbEarRight}`} />

                  <div className={`${styles.pbBody} ${styles.pbFur}`}>
                    <div className={`${styles.pbArm} ${styles.pbFur} ${styles.pbArmLeft}`} />
                    <div className={`${styles.pbLeg} ${styles.pbFur} ${styles.pbLegLeft}`} />
                    <div className={`${styles.pbLeg} ${styles.pbFur} ${styles.pbLegRight}`} />
                  </div>

                  <div className={`${styles.pbArm} ${styles.pbFur} ${styles.pbArmRight}`} />

                  <div className={`${styles.pbHead} ${styles.pbFur}`}>
                    <div className={`${styles.pbCheek} ${styles.pbFur} ${styles.pbCheekLeft}`} />
                    <div className={`${styles.pbCheek} ${styles.pbFur} ${styles.pbCheekRight}`} />

                    <div className={`${styles.pbEye} ${styles.pbEyeLeft}`}>
                      <div className={styles.pbIris}>
                        <div className={styles.pbPupil}>
                          <div className={styles.pbCatchlight1} />
                          <div className={styles.pbCatchlight2} />
                        </div>
                      </div>
                    </div>
                    <div className={`${styles.pbEye} ${styles.pbEyeRight}`}>
                      <div className={styles.pbIris}>
                        <div className={styles.pbPupil}>
                          <div className={styles.pbCatchlight1} />
                          <div className={styles.pbCatchlight2} />
                        </div>
                      </div>
                    </div>

                    <div className={styles.pbSnout}>
                      <div className={styles.pbNose} />
                      <div className={styles.pbMouth}>
                        <div className={styles.pbTongue} />
                        <div className={styles.pbTeeth} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.botContent}>
                <p className={styles.botTitle}>
                  <span className={styles.darkYellow}>Brain fogged?</span>
                  <br />
                  <span className={styles.darkYellow}>Talk to BunBot!</span>
                </p>
                <form action="/counsellor" method="GET" className={styles.askForm}>
                  <label className={styles.srOnly} htmlFor="dashboard-question">Ask BunBot</label>
                  <input id="dashboard-question" name="q" type="text" placeholder="Ask me anything..." autoComplete="off" required />
                  <button type="submit" className={styles.darkGlowBtn} aria-label="Send to BunBot">
                    <Icon name="send" />
                    <span className={styles.srOnly}>Send to BunBot</span>
                  </button>
                </form>
              </div>
            </article>
          </aside>
        </section>

        <section className={styles.rhythmPanel} aria-label="Next dashboard actions">
          <div className={styles.rhythmCopy}>
            <p className={styles.sidebarKicker}>Focus Queue</p>
            <h2>Three moves to keep today on track.</h2>
          </div>
          <div className={styles.rhythmTags}>
            <span>Complete one SOC case note</span>
            <span>Review a frontend task</span>
            <span>Ask BunBot about blockers</span>
          </div>
        </section>
      </div>
    </main>
  );
}
