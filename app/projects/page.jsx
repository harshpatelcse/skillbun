'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import projectsData from '@/public/data/projects_curated.json';
import styles from './projects.module.css';
import posthog from 'posthog-js';

const DOMAIN_OPTIONS = [
  { key: 'all', label: 'All Domains' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'backend', label: 'Backend' },
  { key: 'fullstack', label: 'Full-Stack' },
  { key: 'ai_ml', label: 'AI / ML' },
  { key: 'devops', label: 'DevOps' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'cybersecurity', label: 'Cybersecurity' },
  { key: 'data_science', label: 'Data Science' },
];

const DIFFICULTY_OPTIONS = [
  { key: 'all', label: 'All Levels' },
  { key: 'Beginner', label: 'Beginner' },
  { key: 'Intermediate', label: 'Intermediate' },
  { key: 'Advanced', label: 'Advanced' },
];

function ProjectIcon({ name }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    blueprint: <><rect x="6" y="4" width="14" height="18" rx="2" /><path d="M10 4V2h6v2M10 10h6M10 14h6M10 18h4" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
    tools: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.18 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '5px' }}>{paths[name]}</svg>;
}

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [activeModalProject, setActiveModalProject] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!activeModalProject) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.querySelector('button')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveModalProject(null);
      } else if (event.key === 'Tab') {
        const items = [...(modalRef.current?.querySelectorAll('button:not(:disabled), a[href]') || [])];
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [activeModalProject]);

  const filteredProjects = useMemo(() => {
    return projectsData.filter((project) => {
      // Domain filter
      if (selectedDomain !== 'all' && project.domain !== selectedDomain) {
        return false;
      }
      // Difficulty filter
      if (selectedDifficulty !== 'all' && project.difficulty !== selectedDifficulty) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = project.title.toLowerCase().includes(q);
        const matchesSummary = project.summary.toLowerCase().includes(q);
        const matchesTech = project.techStack.some((t) => t.toLowerCase().includes(q));
        return matchesTitle || matchesSummary || matchesTech;
      }
      return true;
    });
  }, [searchQuery, selectedDomain, selectedDifficulty]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleBadge}>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.18 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            Hands-On Learning
          </span>
        </div>
        <h1 className={styles.title}>SkillBun Projects Hub</h1>
        <p className={styles.subtitle}>
          Explore real-world, portfolio-ready projects across engineering tracks. Build practical skills, follow step-by-step blueprints, and accelerate your career.
        </p>
      </header>

      {/* Quiz Banner */}
      <div className={styles.quizBanner}>
        <div className={styles.quizBannerContent}>
          <span className={styles.quizIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
              <path d="M7 3v6"/>
              <path d="M17 3v6"/>
              <path d="M6 18c0-3 3-5 6-5s6 2 6 5v3H6v-3z"/>
            </svg>
          </span>
          <div>
            <div className={styles.quizBannerTitle}>Not sure which project fits your skill level?</div>
            <div className={styles.quizBannerDesc}>
              Take our 2-minute diagnostic career quiz to get personalized recommendations matched to your strengths.
            </div>
          </div>
        </div>
        <Link href="/onboarding?next=/quiz" className={styles.quizBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
          Take Career Quiz
        </Link>
      </div>

      {/* Controls: Search & Filters */}
      <div className={styles.controls}>
        <div className={styles.searchBarWrapper}>
          <span className={styles.searchIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search projects by title, keyword, or tech stack (e.g. React, Python, Docker)..."
            aria-label="Search projects"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Domain Filter */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Domain:</span>
          {DOMAIN_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.filterChip} ${selectedDomain === opt.key ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedDomain(opt.key)}
              aria-pressed={selectedDomain === opt.key}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Difficulty Filter */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Level:</span>
          {DIFFICULTY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.filterChip} ${selectedDifficulty === opt.key ? styles.filterChipActive : ''}`}
              onClick={() => setSelectedDifficulty(opt.key)}
              aria-pressed={selectedDifficulty === opt.key}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className={styles.grid}>
        {filteredProjects.length > 0 ? (
          filteredProjects.map((project) => {
            let diffClass = styles.difficultyBeginner;
            if (project.difficulty === 'Intermediate') diffClass = styles.difficultyIntermediate;
            if (project.difficulty === 'Advanced') diffClass = styles.difficultyAdvanced;

            return (
              <div key={project.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardHeaderRow}>
                    <span className={styles.domainBadge}>{project.domain.replace('_', ' ')}</span>
                    <span className={`${styles.difficultyBadge} ${diffClass}`}>{project.difficulty}</span>
                  </div>

                  <h2 className={styles.projectTitle}>{project.title}</h2>
                  <p className={styles.projectSummary}>{project.summary}</p>

                  <div className={styles.timeTag}>
                    <span><ProjectIcon name="clock" /> Est. Time:</span>
                    <span>{project.estimatedHours}</span>
                  </div>

                  <div className={styles.techStack}>
                    {project.techStack.map((tech) => (
                      <span key={tech} className={styles.techTag}>
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      posthog.capture('project_blueprint_viewed', {
                        project_id: project.id,
                        project_domain: project.domain,
                        difficulty: project.difficulty,
                      });
                      setActiveModalProject(project);
                    }}
                  >
                    <span><ProjectIcon name="blueprint" /> View Blueprint</span>
                  </button>
                  <Link href={`/roadmap/${project.roadmapSlug}`} className={styles.btnSecondary}>
                    <span><ProjectIcon name="map" /> Roadmap</span>
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyBunny}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No matching projects found</h3>
            <p className={styles.emptyText}>Try searching for a different keyword or clearing your filters.</p>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => {
                setSearchQuery('');
                setSelectedDomain('all');
                setSelectedDifficulty('all');
              }}
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Modal View for Project Blueprint */}
      {activeModalProject && (
        <div className={styles.modalOverlay} onClick={() => setActiveModalProject(null)}>
          <div ref={modalRef} className={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="project-blueprint-title">
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setActiveModalProject(null)}
              aria-label="Close modal"
            >
              <ProjectIcon name="close" />
            </button>

            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className={styles.domainBadge}>{activeModalProject.domain.replace('_', ' ')}</span>
                <span className={styles.difficultyBadge}>{activeModalProject.difficulty}</span>
              </div>
              <h2 id="project-blueprint-title" className={styles.modalTitle}>{activeModalProject.title}</h2>
              <div className={styles.timeTag}><ProjectIcon name="clock" /> Estimated duration: {activeModalProject.estimatedHours}</div>
            </div>

            <p className={styles.projectSummary}>{activeModalProject.summary}</p>

            <div className={styles.modalSectionTitle}><ProjectIcon name="tools" /> Technologies & Tools</div>
            <div className={styles.techStack} style={{ marginBottom: '1.5rem' }}>
              {activeModalProject.techStack.map((tech) => (
                <span key={tech} className={styles.techTag}>
                  {tech}
                </span>
              ))}
            </div>

            <div className={styles.modalSectionTitle}><ProjectIcon name="check" /> Key Deliverables & Requirements</div>
            <ul className={styles.deliverablesList}>
              {activeModalProject.deliverables.map((item, index) => (
                <li key={index} className={styles.deliverableItem}>
                  <span className={styles.checkIcon}><ProjectIcon name="check" /></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <Link
                href={`/roadmap/${activeModalProject.roadmapSlug}`}
                className={styles.quizBtn}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <ProjectIcon name="map" /> Open Career Skill Tree
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
