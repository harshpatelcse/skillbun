'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../components/AuthProvider';
import WorkspaceSidebar from '../../components/WorkspaceSidebar';
import { getFirebaseServices } from '@/utils/client/firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { readAllStoredRoadmapProgress } from '@/utils/shared/progressStore';
import styles from './certifications.module.css';

function safeGet(obj, key) {
  const keyStr = String(key);
  if (obj && Object.prototype.hasOwnProperty.call(obj, keyStr)) {
    return Reflect.get(obj, keyStr);
  }
  return undefined;
}

function CertificateIcon() {
  return (
    <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className={styles.copyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CertificationsClient({ roadmapsInfo }) {
  const { user, authLoading, progressVersion } = useAuth();
  const [certs, setCerts] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(true);
  const [localProgress, setLocalProgress] = useState([]);
  const [copiedId, setCopiedId] = useState('');

  // 1. Fetch certificates from Firestore
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setTimeout(() => {
        setLoadingCerts(false);
      }, 0);
      return;
    }

    const fetchCertificates = async () => {
      const services = getFirebaseServices();
      if (!services.configured) {
        setLoadingCerts(false);
        return;
      }

      try {
        const q = query(
          collection(services.db, 'certificates'),
          where('uid', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((doc) => {
          const data = doc.data();
          let date = new Date();
          if (data.createdAt?.toDate) {
            date = data.createdAt.toDate();
          } else if (data.createdAt) {
            date = new Date(data.createdAt);
          }
          return {
            id: doc.id,
            ...data,
            dateObject: date,
          };
        });

        // Sort descending by date
        list.sort((a, b) => b.dateObject - a.dateObject);
        setCerts(list);
      } catch (err) {
        console.error('Failed to load certificates from Firestore:', err);
      } finally {
        setLoadingCerts(false);
      }
    };

    fetchCertificates();
  }, [user, authLoading]);

  // 2. Fetch local storage progress
  useEffect(() => {
    const progress = readAllStoredRoadmapProgress();
    setTimeout(() => {
      setLocalProgress(progress);
    }, 0);
  }, [progressVersion]);

  // 3. Filter roadmaps that are actively in progress (progress > 0% and < 100%)
  const activeRoadmaps = useMemo(() => {
    const list = [];
    localProgress.forEach(({ slug, completedNodeIds }) => {
      if (!slug || completedNodeIds.length === 0) return;
      const info = safeGet(roadmapsInfo, slug);
      if (!info) return;

      const total = info.totalNodes || 10;
      const done = completedNodeIds.length;
      const pct = Math.round((done / total) * 100);

      // Only show roadmaps that are started but not yet completed
      if (pct > 0 && pct < 100) {
        list.push({
          slug,
          title: info.title,
          done,
          total,
          pct,
        });
      }
    });

    // Sort by highest progress percentage first
    list.sort((a, b) => b.pct - a.pct);
    return list;
  }, [localProgress, roadmapsInfo]);

  const copyToClipboard = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  if (authLoading || (user && loadingCerts)) {
    return (
      <main className={styles.page}>
        <div className={styles.bgGridOverlay} aria-hidden="true" />
        <div className={styles.container}>
          <section className={styles.board}>
            <WorkspaceSidebar active="certifications" />
            <div className={styles.loadingColumn}>
              <div className={styles.spinner}></div>
              <p>Loading your certifications...</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.bgGridOverlay} aria-hidden="true" />
        <div className={styles.container}>
          <section className={styles.board}>
            <WorkspaceSidebar active="certifications" />
            <div className={styles.mainColumn}>
              <article className={`${styles.panel} ${styles.glassPanel}`}>
                <div className={styles.loginRequired}>
                  <CertificateIcon />
                  <h2>Access Denied</h2>
                  <p>Please log in to view and manage your certifications.</p>
                  <Link href={`/auth?next=${encodeURIComponent('/dashboard/certifications')}`} className={styles.primaryButton}>
                    Log In / Sign Up
                  </Link>
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.bgGridOverlay} aria-hidden="true" />
      <div className={styles.container}>
        <section className={styles.board}>
          <WorkspaceSidebar active="certifications" />

          <div className={styles.mainColumn}>
            {certs.length > 0 ? (
              <div className={styles.certsList}>
                <div className={styles.listHeader}>
                  <h2>Your Certifications</h2>
                  <p>Congratulations on mastering these fields! You can share your certificates publicly or print them.</p>
                </div>
                <div className={styles.certsGrid}>
                  {certs.map((cert) => (
                    <article key={cert.id} className={`${styles.certCard} ${styles.glassPanel}`}>
                      <div className={styles.certBadge}>🏆 VERIFIED</div>
                      <div className={styles.certMeta}>
                        <h3>{cert.roadmapTitle}</h3>
                        <p className={styles.studentName}>Recipient: <strong>{cert.name}</strong></p>
                        <p className={styles.scoreRow}>
                          Score: <span className={styles.scoreHighlight}>{cert.score}%</span>
                        </p>
                        <p className={styles.dateRow}>
                          Earned on: {cert.dateObject.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <div className={styles.idRow}>
                          <span>ID: <code>{cert.id}</code></span>
                          <button
                            className={styles.copyBtn}
                            onClick={() => copyToClipboard(cert.id)}
                            title="Copy Certificate ID"
                            aria-label="Copy Certificate ID"
                          >
                            {copiedId === cert.id ? <CheckIcon /> : <CopyIcon />}
                          </button>
                        </div>
                      </div>
                      <div className={styles.certActions}>
                        <Link href={`/certificate/${cert.id}`} className={styles.viewBtn}>
                          Open Certificate ↗
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <article className={`${styles.panel} ${styles.glassPanel} ${styles.emptyPanel}`}>
                <div className={styles.emptyState}>
                  <CertificateIcon />
                  <h2>Unlock Your First Certificate!</h2>
                  <p className={styles.emptySub}>
                    Earn verified certificates to prove your expertise. Complete 60% of any roadmap, take the quiz, and score 70% or higher to get certified.
                  </p>
                  <Link href="/roadmap" className={styles.primaryButton}>
                    Explore Roadmaps
                  </Link>
                </div>
              </article>
            )}

            {/* Active Roadmaps Section (encouraging completion) */}
            <article className={`${styles.panel} ${styles.glassPanel} ${styles.progressPanel}`}>
              <h2>Active Roadmap Progress</h2>
              {activeRoadmaps.length > 0 ? (
                <div className={styles.progressGrid}>
                  {activeRoadmaps.map((road) => (
                    <div key={road.slug} className={styles.progressItem}>
                      <div className={styles.progressTop}>
                        <h4>{road.title}</h4>
                        <span className={styles.progressPercent}>{road.pct}%</span>
                      </div>
                      <div className={styles.track}>
                        <span className={styles.fill} style={{ '--bar-width': `${road.pct}%` }} />
                      </div>
                      <div className={styles.progressBottom}>
                        <span className={styles.nodesCount}>{road.done}/{road.total} skills mastered</span>
                        <Link href={`/roadmap/${road.slug}`} className={styles.continueBtn}>
                          Continue Journey →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.noProgressText}>
                  <p>No active roadmap progress found. Hop into a roadmap and start learning to unlock certification quizzes!</p>
                  <Link href="/roadmap" className={styles.textLink}>
                    Browse Roadmaps →
                  </Link>
                </div>
              )}
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
