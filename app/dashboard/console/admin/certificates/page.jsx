'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cinzel, pixelify } from '@/app/fonts';
import QRCodeSvg from '@/app/components/QRCodeSvg';
import OfficialSeal from '@/app/components/OfficialSeal';
import { useAuth } from '@/app/components/AuthProvider';
import { useAdminAccess } from '@/utils/client/adminAuth';
import { getFirebaseServices } from '@/utils/client/firebaseClient';
import { collection, getDocs } from 'firebase/firestore';
import { triggerDocumentPrint } from '@/utils/client/printAndDownload';
import certStyles from '@/app/certificate/[id]/certificate.module.css';
import styles from './certificates.module.css';
import { subscribeDataSync, notifyDataMutated } from '@/utils/client/dataSyncManager';


function OrnateCorner({ position = 'TL' }) {
  const transforms = {
    TL: '',
    TR: 'scaleX(-1)',
    BL: 'scaleY(-1)',
    BR: 'scale(-1, -1)',
  };

  return (
    <svg
      viewBox="0 0 100 100"
      className={`${certStyles.certCorner} ${certStyles[`certCorner${position}`]}`}
      style={{ transform: transforms[position] }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M0 3 H100 M3 0 V100" stroke="#8C6D23" strokeWidth="3" />
      <path d="M0 7 H100 M7 0 V100" stroke="#F5E8C7" strokeWidth="1.5" />
      <path d="M0 11 H100 M11 0 V100" stroke="#C5A059" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M0 15 H100 M15 0 V100" stroke="#8C6D23" strokeWidth="1.5" />
      <path
        d="M15 15 C28 15 40 20 46 30 C52 39 48 50 38 55 C29 59 19 54 17 45 C15 35 23 26 33 26 C40 26 45 31 43 37 C41 42 36 44 33 40 C30 37 31 33 35 33"
        stroke="#9D782F"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M15 15 C15 28 20 40 30 46 C39 52 50 48 55 38 C59 29 54 19 45 17 C35 15 26 23 26 33 C26 40 31 45 37 43 C42 41 44 36 40 33 C37 30 33 31 33 35"
        stroke="#9D782F"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="26" cy="26" r="4.5" fill="#8C6D23" />
      <circle cx="26" cy="26" r="2.5" fill="#FDF6D8" />
      <circle cx="15" cy="15" r="2.5" fill="#8C6D23" />
      <path d="M26 26 Q44 18 62 19 Q50 24 44 32" fill="#C5A059" opacity="0.85" />
      <path d="M26 26 Q18 44 19 62 Q24 50 32 44" fill="#C5A059" opacity="0.85" />
    </svg>
  );
}

function IndiaFlagIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 2) / 3)}
      viewBox="0 0 36 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: '2px',
        overflow: 'hidden',
        boxShadow: '0 0 1px rgba(0,0,0,0.4)',
        flexShrink: 0,
      }}
      aria-label="Flag of India"
    >
      <rect width="36" height="8" fill="#FF9933" />
      <rect y="8" width="36" height="8" fill="#FFFFFF" />
      <rect y="16" width="36" height="8" fill="#138808" />
      <circle cx="18" cy="12" r="3.2" stroke="#000080" strokeWidth="0.7" fill="none" />
      <circle cx="18" cy="12" r="0.7" fill="#000080" />
      {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345].map((angle, i) => (
        <line
          key={i}
          x1="18"
          y1="12"
          x2={18 + 3 * Math.cos((angle * Math.PI) / 180)}
          y2={12 + 3 * Math.sin((angle * Math.PI) / 180)}
          stroke="#000080"
          strokeWidth="0.35"
        />
      ))}
    </svg>
  );
}

function formatRecommendationText(rawText, candidateName) {
  const firstName = candidateName ? candidateName.trim().split(' ')[0] : 'The candidate';
  if (!rawText || !rawText.trim()) {
    return `${firstName} demonstrated exceptional dedication, professional excellence, and proactive collaboration during their engagement at SkillBun. They contributed to key project and organizational milestones with distinguished commitment and high standards of execution. We wish them continued success in all future endeavors.`;
  }
  return rawText
    .replace(/^This is to certify that\s+[A-Za-z\s]+(has\s+)?(demonstrated|completed|shown|contributed)/i, `${firstName} $2`)
    .replace(/^This is to certify that\s+/i, '')
    .replace(/\bcore engineering milestones\b/gi, 'key organizational milestones')
    .replace(/\bengineering milestones\b/gi, 'project milestones')
    .replace(/\bhigh technical excellence\b/gi, 'professional excellence')
    .replace(/\btechnical excellence\b/gi, 'professional excellence')
    .replace(/\btechnical dedication\b/gi, 'professional dedication');
}

function Icon({ name, size = 16, className = '', style = {} }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style },
  };

  switch (name) {
    case 'certificate':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      );
    case 'award':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="6" />
          <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case 'palette':
      return (
        <svg {...common}>
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'printer':
      return (
        <svg {...common}>
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      );
    case 'ban':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      );
    case 'tools':
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    default:
      return null;
  }
}

const TEMPLATE_DESIGNS = [
  {
    id: 'ROADMAP',
    name: 'Academic Roadmap Assessment Certificate',
    bgImage: '/certificate-template.png',
    badge: 'Roadmap Track',
    codeFormat: 'SKBXXXX-XX-XX-XXXX',
    description: 'Official assessment certificate awarded upon scoring 70%+ on 10 randomized adaptive questions.',
  },
  {
    id: 'INTERNSHIP',
    name: 'Certificate of Internship Completion',
    bgImage: null,
    badge: 'Workforce Tenure',
    codeFormat: 'SKB/2026/INT-REC/XXXXXX',
    description: 'Awarded to interns upon successful completion of milestone tenure and deliverables.',
  },
  {
    id: 'TRAINING',
    name: 'Practical Industry Training Certificate',
    bgImage: '/training-cert-template.png',
    badge: 'Industry Training',
    codeFormat: 'SKB/2026/TRN-PRC/XXXXXX',
    description: 'Issued for advanced practical software engineering and systems design training.',
  },
  {
    id: 'LOR',
    name: 'Official Letter of Recommendation (LOR)',
    bgImage: null,
    badge: 'Executive LOR',
    codeFormat: 'SKB/2026/LOR-REC/XXXXXX',
    description: 'Signed leadership endorsement highlighting exceptional agile engineering ownership.',
  },
];

export default function AdminCertificatesPage() {
  const { user, authLoading } = useAuth();
  const { isAdmin, checking } = useAdminAccess(user, authLoading);

  // Studio Mode: 'registry' | 'studio' | 'mint'
  const [activeTab, setActiveTab] = useState('registry');

  // Registry state
  const [certs, setCerts] = useState([]);
  const [loadingCerts, setLoadingCerts] = useState(true);
  const [metrics, setMetrics] = useState({
    totalCount: 0,
    roadmapCount: 0,
    workforceCount: 0,
    activeCount: 0,
    revokedCount: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Live Canvas Studio state (Simulation variables)
  const [selectedDesignId, setSelectedDesignId] = useState('ROADMAP');
  const [simName, setSimName] = useState('Alex Sharma');
  const [simTrack, setSimTrack] = useState('Full Stack Web Development');
  const [simScore, setSimScore] = useState(94);
  const [simCertId, setSimCertId] = useState('SKB8F92-4C-10-9A7E');
  const [simDate, setSimDate] = useState('31-08-2026');
  const [simDepartment, setSimDepartment] = useState('Core Engineering');
  const [simDesignation, setSimDesignation] = useState('Software Engineering Intern');
  const [simStartDate, setSimStartDate] = useState('01-06-2026');
  const [simEndDate, setSimEndDate] = useState('31-08-2026');
  const [simLorText, setSimLorText] = useState(
    'Alex demonstrated exceptional dedication, professional excellence, and proactive collaboration during their engagement at SkillBun. They contributed to key project milestones with distinguished commitment and high standards of execution.'
  );

  // Minting Form state
  const [mintType, setMintType] = useState('ROADMAP');
  const [mintName, setMintName] = useState('');
  const [mintEmail, setMintEmail] = useState('');
  const [mintTrack, setMintTrack] = useState('Full Stack Web Development');
  const [mintScore, setMintScore] = useState(90);
  const [mintDepartment, setMintDepartment] = useState('Development & Engineering');
  const [mintDesignation, setMintDesignation] = useState('Engineering Intern');
  const [mintStartDate, setMintStartDate] = useState('');
  const [mintEndDate, setMintEndDate] = useState('');
  const [mintLorText, setMintLorText] = useState('');
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: string }

  // Fetch certificates from admin API
  const fetchCertificates = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoadingCerts(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`/api/admin/certificates?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.certificates)) {
        setCerts(data.certificates || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      } else {
        // Resilient client-side Firestore fallback
        try {
          const { db } = getFirebaseServices();
          if (db) {
            const snap = await getDocs(collection(db, 'certificates'));
            let certList = snap.docs.map((d) => {
              const c = d.data();
              return {
                id: d.id,
                certId: d.id,
                ...c,
                name: c.name || c.studentName || 'Student',
                roadmapTitle: c.roadmapTitle || c.roadmapSlug || 'Roadmap',
                cert_type: c.cert_type || 'ROADMAP',
              };
            });

            if (typeFilter !== 'ALL') {
              certList = certList.filter((c) => (c.cert_type || 'ROADMAP') === typeFilter);
            }
            if (statusFilter === 'ACTIVE') {
              certList = certList.filter((c) => !c.is_revoked);
            } else if (statusFilter === 'REVOKED') {
              certList = certList.filter((c) => c.is_revoked);
            }
            if (searchTerm) {
              const q = searchTerm.toLowerCase();
              certList = certList.filter(
                (c) =>
                  c.name?.toLowerCase().includes(q) ||
                  c.email?.toLowerCase().includes(q) ||
                  c.id?.toLowerCase().includes(q) ||
                  c.roadmapTitle?.toLowerCase().includes(q)
              );
            }

            setCerts(certList);
            const allCerts = snap.docs.map((d) => d.data());
            setMetrics({
              totalCount: allCerts.length,
              roadmapCount: allCerts.filter((c) => !c.cert_type || c.cert_type === 'ROADMAP').length,
              workforceCount: allCerts.filter((c) => c.cert_type === 'INTERNSHIP' || c.cert_type === 'TRAINING' || c.cert_type === 'LOR').length,
              activeCount: allCerts.filter((c) => !c.is_revoked).length,
              revokedCount: allCerts.filter((c) => c.is_revoked).length,
            });
          }
        } catch (clientErr) {
          console.warn('[Certificates Client Fallback Warning]:', clientErr);
        }
      }
    } catch (err) {
      console.error('Failed to load certificates:', err);
    } finally {
      setLoadingCerts(false);
    }
  }, [user, isAdmin, typeFilter, statusFilter, searchTerm]);

  // Initial load & real-time sync
  useEffect(() => {
    let isMounted = true;
    const initLoad = async () => {
      if (!user || !isAdmin) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/certificates', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (isMounted && data.success) {
          setCerts(data.certificates || []);
          if (data.metrics) setMetrics(data.metrics);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoadingCerts(false);
      }
    };

    if (user && isAdmin) {
      initLoad();
    }

    const unsubscribeSync = subscribeDataSync((evt) => {
      if (isMounted && (evt.tag === 'admin:certs' || evt.type === 'DATA_MUTATED')) {
        initLoad();
      }
    });

    return () => {
      isMounted = false;
      unsubscribeSync();
    };
  }, [user, isAdmin]);

  // Re-fetch when filters change in registry mode
  useEffect(() => {
    if (activeTab === 'registry') {
      const timer = setTimeout(() => {
        fetchCertificates();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchCertificates]);

  // Revoke / Reinstate Certificate action
  const handleToggleRevoke = async (cert) => {
    const nextState = !cert.is_revoked;
    const confirmText = nextState
      ? `Are you sure you want to REVOKE certificate (${cert.display_id || cert.id}) for ${cert.name}?`
      : `Re-instate certificate (${cert.display_id || cert.id}) for ${cert.name}?`;

    if (!window.confirm(confirmText)) return;

    setActionLoadingId(cert.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/certificates/${encodeURIComponent(cert.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_revoked: nextState }),
      });

      const data = await res.json();
      if (data.success) {
        setCerts((prev) =>
          prev.map((c) => (c.id === cert.id ? { ...c, is_revoked: nextState } : c))
        );
        fetchCertificates();
        notifyDataMutated('admin:certs');
      } else {
        alert(data.error || 'Failed to update certificate status.');
      }
    } catch (err) {
      alert('Error updating certificate.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete Certificate action
  const handleDeleteCert = async (cert) => {
    if (!window.confirm(`PERMANENT DELETE WARNING: Are you sure you want to permanently delete certificate (${cert.display_id || cert.id}) for ${cert.name}? This action cannot be undone.`)) {
      return;
    }

    setActionLoadingId(cert.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/certificates/${encodeURIComponent(cert.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (data.success) {
        setCerts((prev) => prev.filter((c) => c.id !== cert.id));
        fetchCertificates();
        notifyDataMutated('admin:certs');
      } else {
        alert(data.error || 'Failed to delete certificate.');
      }
    } catch (err) {
      alert('Error deleting certificate.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Submit Minting Form
  const handleMintSubmit = async (e) => {
    e.preventDefault();
    if (!mintName.trim() || !mintTrack.trim()) {
      setFeedback({ type: 'error', text: 'Candidate name and track title are required.' });
      return;
    }

    setMintSubmitting(true);
    setFeedback(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/certificates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cert_type: mintType,
          name: mintName.trim(),
          email: mintEmail.trim(),
          stream_or_track: mintTrack.trim(),
          roadmapTitle: mintTrack.trim(),
          score: Number(mintScore) || 100,
          department: mintDepartment,
          designation: mintDesignation,
          start_date: mintStartDate || null,
          end_date: mintEndDate || null,
          recommendation_text: mintLorText.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          text: `Certificate (${data.displayId || data.certId}) minted successfully for ${mintName}!`,
        });
        // Reset form
        setMintName('');
        setMintEmail('');
        fetchCertificates();
        notifyDataMutated('admin:certs');
      } else {
        setFeedback({ type: 'error', text: data.error || 'Minting failed.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network error issuing certificate.' });
    } finally {
      setMintSubmitting(false);
    }
  };

  const currentDesign = TEMPLATE_DESIGNS.find((d) => d.id === selectedDesignId) || TEMPLATE_DESIGNS[0];

  if (authLoading || checking) {
    return (
      <div className={styles.certContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1.05rem', fontWeight: '600' }}>Verifying admin authorization...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className={styles.certContainer}>
        <div className={styles.authGateCard}>
          <h2 style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: '#ef4444', marginBottom: '0.75rem' }}>
            403 — Admin Privileges Required
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
            This operations studio is restricted to authorized platform administrators.
          </p>
          <Link href="/dashboard" className={styles.btnPrimary}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.certContainer}>
      {/* Top Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <div className={styles.titleBadge}>
            <h1 className={styles.titleText}>Certificate & Credential Studio</h1>
            <span className={styles.securityPill}>
              <Icon name="shield" size={13} style={{ marginRight: '0.35rem' }} /> Base32 Cryptographic Trust Engine
            </span>
          </div>
          <p className={styles.subtitle}>
            Unified operations console to search, live-preview, issue, revoke, and verify all 4 platform certificate types using the exact Canva overlay specs.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link href="/dashboard/console/admin" className={styles.actionBtnSecondary}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Command Center
          </Link>
          <Link href="/dashboard/console/admin/emails" className={styles.actionBtnSecondary}>
            Mail Studio
          </Link>
          <Link href="/dashboard/console/admin/workforce" className={styles.actionBtnSecondary}>
            Workforce Hub
          </Link>
        </div>
      </div>

      {/* Metrics Summary Bar */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={`${styles.metricIconBox} ${styles.iconGreen}`}><Icon name="certificate" size={20} /></div>
          <div>
            <div className={styles.metricVal}>{metrics.totalCount}</div>
            <div className={styles.metricLabel}>Total Credentials</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconBox} ${styles.iconBlue}`}><Icon name="award" size={20} /></div>
          <div>
            <div className={styles.metricVal}>{metrics.roadmapCount}</div>
            <div className={styles.metricLabel}>Roadmap Certs</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconBox} ${styles.iconPurple}`}><Icon name="briefcase" size={20} /></div>
          <div>
            <div className={styles.metricVal}>{metrics.workforceCount}</div>
            <div className={styles.metricLabel}>Workforce Credentials</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={`${styles.metricIconBox} ${styles.iconAmber}`}><Icon name="check" size={20} /></div>
          <div>
            <div className={styles.metricVal}>{metrics.activeCount}</div>
            <div className={styles.metricLabel}>Active Verified</div>
          </div>
        </div>
      </div>

      {/* Studio Navigation Tabs */}
      <div className={styles.studioTabs}>
        <button
          type="button"
          onClick={() => setActiveTab('registry')}
          className={`${styles.tabBtn} ${activeTab === 'registry' ? styles.tabBtnActive : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="certificate" size={15} /> Certificates Registry ({certs.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('studio')}
          className={`${styles.tabBtn} ${activeTab === 'studio' ? styles.tabBtnActive : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="palette" size={15} /> Live Design & Canvas Overlay Studio</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mint')}
          className={`${styles.tabBtn} ${activeTab === 'mint' ? styles.tabBtnActive : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="zap" size={15} /> Issue / Mint Certificate</span>
        </button>
      </div>

      {/* TAB 1: ALL CERTIFICATES REGISTRY */}
      {activeTab === 'registry' && (
        <div>
          {/* Filter & Search Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by student name, email, cert ID, track..."
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>

            <div className={styles.filterControls}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="ALL">All Types ({metrics.totalCount})</option>
                <option value="ROADMAP">Roadmap Assessment ({metrics.roadmapCount})</option>
                <option value="INTERNSHIP">Internship Completion</option>
                <option value="TRAINING">Industry Training</option>
                <option value="LOR">Letter of Recommendation (LOR)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Verified ({metrics.activeCount})</option>
                <option value="REVOKED">Revoked ({metrics.revokedCount})</option>
              </select>

              <button
                type="button"
                onClick={fetchCertificates}
                className={styles.actionBtnSecondary}
                style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem' }}
                title="Refresh from Firestore"
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="refresh" size={13} /> Refresh</span>
              </button>
            </div>
          </div>

          {/* Table View */}
          <div className={styles.tableCard}>
            {loadingCerts ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="clock" size={15} /> Loading real certificate records from Firestore...</p>
              </div>
            ) : certs.length === 0 ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--muted)' }}><Icon name="certificate" size={38} /></div>
                <p style={{ margin: 0 }}>No certificates match your query filters.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.certTable}>
                  <thead>
                    <tr>
                      <th>Recipient / Candidate</th>
                      <th>Type & Stream</th>
                      <th>Score / Grade</th>
                      <th>Unique Credential ID</th>
                      <th>Issued Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.map((cert) => {
                      const isRevoking = actionLoadingId === cert.id;
                      const badgeClass =
                        cert.cert_type === 'INTERNSHIP'
                          ? styles.badgeInternship
                          : cert.cert_type === 'TRAINING'
                          ? styles.badgeTraining
                          : cert.cert_type === 'LOR'
                          ? styles.badgeLor
                          : styles.badgeRoadmap;

                      return (
                        <tr key={cert.id}>
                          <td>
                            <div style={{ fontWeight: '750', color: 'var(--text)' }}>{cert.name}</div>
                            {cert.email && (
                              <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{cert.email}</div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span className={`${styles.certTypeBadge} ${badgeClass}`}>
                                {cert.cert_type || 'ROADMAP'}
                              </span>
                              <span style={{ fontWeight: '600' }}>
                                {cert.stream_or_track || cert.roadmapTitle || 'General Track'}
                              </span>
                            </div>
                            {cert.department && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                                {cert.department}
                              </div>
                            )}
                          </td>
                          <td>
                            {cert.score !== undefined ? (
                              <span style={{ fontWeight: '800', color: 'var(--green)' }}>{cert.score}%</span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>N/A</span>
                            )}
                          </td>
                          <td>
                            <code style={{ background: 'var(--surface-raised)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--accent)' }}>
                              {cert.display_id || cert.id}
                            </code>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {cert.createdAt ? new Date(cert.createdAt).toLocaleDateString('en-IN') : 'N/A'}
                          </td>
                          <td>
                            {cert.is_revoked ? (
                              <span className={styles.statusPillRevoked}>REVOKED</span>
                            ) : (
                              <span className={styles.statusPillActive}>ACTIVE</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.4rem' }}>
                              {/* Verify Link */}
                              <Link
                                href={`/certificate/${encodeURIComponent(cert.id)}`}
                                target="_blank"
                                className={styles.tableActionBtn}
                                title="Open Public Verification Page"
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>Verify <Icon name="external" size={11} /></span>
                              </Link>

                              {/* Toggle Revoke */}
                              <button
                                type="button"
                                onClick={() => handleToggleRevoke(cert)}
                                disabled={isRevoking}
                                className={`${styles.tableActionBtn} ${cert.is_revoked ? '' : styles.tableActionBtnDanger}`}
                                title={cert.is_revoked ? 'Re-instate Credential' : 'Revoke Credential'}
                              >
                                {cert.is_revoked ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Icon name="check" size={13} /> Restore
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Icon name="ban" size={13} /> Revoke
                                  </span>
                                )}
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteCert(cert)}
                                disabled={isRevoking}
                                className={`${styles.tableActionBtn} ${styles.tableActionBtnDanger}`}
                                title="Delete Certificate Record"
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: LIVE DESIGN & CANVAS OVERLAY STUDIO (EXACT /certificate/[id] ENGINE) */}
      {activeTab === 'studio' && (
        <div className={styles.studioLayout}>
          {/* Controls Left Column */}
          <div className={styles.studioControlsCard}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text)', marginBottom: '0.2rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Icon name="palette" size={16} /> Certificate Design Switcher</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                Live simulator matching the exact public overlay engine from <code>/certificate/[id]</code>.
              </p>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Select Certificate Design Template</label>
              <select
                value={selectedDesignId}
                onChange={(e) => setSelectedDesignId(e.target.value)}
                className={styles.inputField}
              >
                {TEMPLATE_DESIGNS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                {currentDesign.description}
              </div>
            </div>

            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.85rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text)', marginBottom: '0.65rem' }}>
                Dynamic Overlay Data:
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Student Full Name</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className={styles.inputField}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Roadmap / Stream Title</label>
                <input
                  type="text"
                  value={simTrack}
                  onChange={(e) => setSimTrack(e.target.value)}
                  className={styles.inputField}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Score / Grade (%)</label>
                  <input
                    type="number"
                    value={simScore}
                    onChange={(e) => setSimScore(e.target.value)}
                    className={styles.inputField}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Issued Date</label>
                  <input
                    type="date"
                    value={simDate}
                    onChange={(e) => setSimDate(e.target.value)}
                    className={styles.inputField}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Unique Certificate Fingerprint</label>
                <input
                  type="text"
                  value={simCertId}
                  onChange={(e) => setSimCertId(e.target.value)}
                  className={styles.inputField}
                />
              </div>

              {selectedDesignId === 'INTERNSHIP' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.5rem' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Start Date</label>
                    <input
                      type="text"
                      value={simStartDate}
                      onChange={(e) => setSimStartDate(e.target.value)}
                      className={styles.inputField}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>End Date</label>
                    <input
                      type="text"
                      value={simEndDate}
                      onChange={(e) => setSimEndDate(e.target.value)}
                      className={styles.inputField}
                    />
                  </div>
                </div>
              )}

              {selectedDesignId === 'LOR' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.5rem' }}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Department</label>
                      <input
                        type="text"
                        value={simDepartment}
                        onChange={(e) => setSimDepartment(e.target.value)}
                        className={styles.inputField}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Designation</label>
                      <input
                        type="text"
                        value={simDesignation}
                        onChange={(e) => setSimDesignation(e.target.value)}
                        className={styles.inputField}
                      />
                    </div>
                  </div>
                  <div className={styles.formGroup} style={{ marginTop: '0.5rem' }}>
                    <label className={styles.formLabel}>Recommendation Text</label>
                    <textarea
                      value={simLorText}
                      onChange={(e) => setSimLorText(e.target.value)}
                      className={styles.textareaField}
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Canvas Viewport Right Column — Exact 1:1 Rendering */}
          <div className={styles.canvasViewport}>
            <div className={styles.canvasTopBar}>
              <div style={{ fontWeight: '800', fontSize: '0.92rem', color: 'var(--text)' }}>
                Exact Public Render: {currentDesign.name}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => triggerDocumentPrint({
                    title: selectedDesignId === 'LOR'
                      ? `${simCandidateName || 'Candidate'} - Letter of Recommendation - SkillBun`
                      : `${simCandidateName || 'Candidate'} - ${selectedDesignId} Certificate - SkillBun`,
                    orientation: selectedDesignId === 'LOR' ? 'portrait' : 'landscape',
                  })}
                  className={styles.actionBtnSecondary}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="printer" size={14} /> Print / PDF</span>
                </button>
                <Link
                  href={`/certificate/${encodeURIComponent(simCertId)}`}
                  target="_blank"
                  className={styles.actionBtnSecondary}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', color: 'var(--green)' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="external" size={13} /> Open /certificate/[id]</span>
                </Link>
              </div>
            </div>

            {/* Exact Public Certificate Frame Matching /certificate/[id]/page.jsx */}
            <div style={{ width: '100%', maxWidth: selectedDesignId === 'LOR' ? '860px' : '1080px', margin: '0 auto' }}>
              {selectedDesignId === 'LOR' ? (
                <section className={certStyles.lorLetterhead}>
                  {/* Top Institutional Header */}
                  <div className={certStyles.lorHeader}>
                    <div className={certStyles.lorBrandLockup}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo-tight.png" alt="SkillBun Logo" className={certStyles.lorBrandLogo} />
                      <div className={certStyles.lorBrandDetails}>
                        <div className={certStyles.lorBrandWordmark}>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</div>
                        <div className={certStyles.lorBrandSubtitle}>
                          CAREER &amp; SKILLS
                        </div>
                      </div>
                    </div>

                    <div className={certStyles.lorGovtAttribution}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/reish-mark.png" alt="Reish Mark" className={certStyles.lorReishLogo} />
                      <div className={certStyles.lorReishDetails}>
                        <span className={certStyles.lorGovtTag}>MANAGED &amp; ISSUED BY</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/reish-wordmark.png" alt="REISH" className={certStyles.lorReishWordmarkImg} />
                      </div>
                    </div>
                  </div>

                  {/* Reference Meta Strip */}
                  <div className={certStyles.lorMetaStrip}>
                    <div className={certStyles.lorMetaItem}>
                      <span className={certStyles.lorMetaLabel}>Reference ID:</span>
                      <strong className={certStyles.lorMetaValue}>{simCertId}</strong>
                    </div>
                    <div className={certStyles.lorMetaItem}>
                      <span className={certStyles.lorMetaLabel}>Date of Issuance:</span>
                      <strong className={certStyles.lorMetaValue}>{simDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                    </div>
                  </div>

                  {/* Title Section */}
                  <div className={certStyles.lorTitleBlock}>
                    <div className={certStyles.titleFlourishDivider}>
                      <span className={certStyles.flourishSymbol}>❖</span>
                      <div className={certStyles.flourishLine} />
                      <span className={certStyles.flourishStar}>★</span>
                      <div className={certStyles.flourishLine} />
                      <span className={certStyles.flourishSymbol}>❖</span>
                    </div>
                    <h1 className={`${certStyles.lorMainTitle} ${cinzel.className}`}>
                      Letter of Recommendation
                    </h1>
                    <div className={certStyles.lorSubTitleBadge}>
                      OFFICIAL EXECUTIVE APPRAISAL &amp; ENDORSEMENT
                    </div>
                  </div>

                  {/* Formal Salutation */}
                  <div className={certStyles.lorSalutationBlock}>
                    TO WHOMSOEVER IT MAY CONCERN
                  </div>

                  {/* Candidate Engagement Summary Grid */}
                  <div className={certStyles.lorCandidateGrid}>
                    <div className={certStyles.lorCandidatePill}>
                      <span className={certStyles.lorPillLabel}>Candidate Name</span>
                      <span className={certStyles.lorPillValue}>{simName}</span>
                    </div>
                    <div className={certStyles.lorCandidatePill}>
                      <span className={certStyles.lorPillLabel}>Designation &amp; Role</span>
                      <span className={certStyles.lorPillValue}>{simDesignation || 'Professional Intern'}</span>
                    </div>
                    <div className={certStyles.lorCandidatePill}>
                      <span className={certStyles.lorPillLabel}>Department / Track</span>
                      <span className={certStyles.lorPillValue}>{simDepartment || 'Operations & Management'}</span>
                    </div>
                    <div className={certStyles.lorCandidatePill}>
                      <span className={certStyles.lorPillLabel}>Tenure of Engagement</span>
                      <span className={certStyles.lorPillValue}>
                        {simStartDate && simEndDate ? `${simStartDate} to ${simEndDate}` : 'Verified Tenure'}
                      </span>
                    </div>
                  </div>

                  {/* Structured Recommendation Body */}
                  <div className={certStyles.lorBodyContent}>
                    <p>
                      It is with high professional regard and absolute confidence that I write this official Letter of Recommendation on behalf of <strong>{simName}</strong>, who completed their tenure at <strong>SkillBun</strong> (operated by <strong>Reish</strong>) serving in the capacity of <strong>{simDesignation || 'Intern'}</strong> within the <strong>{simDepartment || 'Operations'}</strong> department.
                    </p>

                    <p>
                      {formatRecommendationText(
                        simLorText ||
                        `Throughout their engagement, ${simName} consistently demonstrated outstanding analytical capability, diligent execution, and disciplined adherence to organizational milestones. They proactively tackled complex challenges with initiative and creativity, collaborating seamlessly across multi-disciplinary teams while maintaining uncompromising standards of professionalism and integrity.`,
                        simName
                      )}
                    </p>

                    <p>
                      Their positive attitude, strategic problem-solving aptitude, and fast-learning agility make them an invaluable asset to any high-performance team or advanced academic institution. I give <strong>{simName}</strong> my highest endorsement for all forthcoming career, postgraduate, and professional opportunities.
                    </p>
                  </div>

                  {/* Executive Sign-off & Live Scannable Vector QR Code Block */}
                  <div className={certStyles.lorAuthFooter}>
                    <div className={certStyles.lorSigBlock}>
                      <div className={certStyles.lorSignOffSalutation}>Sincerely,</div>
                      <div className={certStyles.lorSignatureCanvas}>
                        <div className={certStyles.lorSignatoryName}>Harsh Patel</div>
                        <div className={certStyles.lorSignatoryRole}>Founder &amp; Managing Director, SkillBun</div>
                        <div className={certStyles.lorSignatoryOrg}>Operated by Reish</div>
                        <div className={certStyles.lorSignatoryContact}>harsh@skillbun.tech</div>
                      </div>
                    </div>

                    <div className={certStyles.lorQrArea}>
                      <div className={certStyles.qrCodeWrapper}>
                        <QRCodeSvg value={`https://skillbun.vercel.app/certificate/${(simCertId || '').replace(/\//g, '-')}`} size={84} />
                      </div>
                      <span className={certStyles.lorQrLabel}>Scan to Verify Online</span>
                    </div>
                  </div>

                  {/* Bottom Institutional Trust & Footnote Strip */}
                  <div className={certStyles.lorVerificationFootnote}>
                    <div className={certStyles.msmeSealBadge}>
                      <IndiaFlagIcon size={18} />
                      <span>Govt. of India MSME Registered Entity</span>
                    </div>
                    <div className={certStyles.footnoteUrl}>
                      Ref: {simCertId}
                    </div>
                  </div>
                </section>
              ) : selectedDesignId === 'INTERNSHIP' ? (
                /* Landscape Certificate of Internship — Classic Academic Prestige */
                <section className={certStyles.internshipCertFrame}>
                  {/* Vintage Ornate Corner Accents */}
                  <OrnateCorner position="TL" />
                  <OrnateCorner position="TR" />
                  <OrnateCorner position="BL" />
                  <OrnateCorner position="BR" />

                  {/* Inner Gold Frame */}
                  <div className={certStyles.internshipInnerContainer}>
                    {/* Top Institutional Header */}
                    <header className={certStyles.internshipHeader}>
                      <div className={certStyles.internshipBrandLockup}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-tight.png" alt="SkillBun Logo" className={certStyles.internshipBrandLogo} />
                        <div className={certStyles.internshipBrandDetails}>
                          <div className={certStyles.internshipBrandWordmark}>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</div>
                          <div className={certStyles.internshipBrandSubtitle}>
                            CAREER &amp; SKILLS
                          </div>
                        </div>
                      </div>

                      <div className={certStyles.internshipGovtAttribution}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/reish-mark.png" alt="Reish Mark" className={certStyles.internshipReishLogo} />
                        <div className={certStyles.internshipReishDetails}>
                          <span className={certStyles.internshipGovtTag}>MANAGED &amp; ISSUED BY</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/reish-wordmark.png" alt="REISH" className={certStyles.internshipReishWordmarkImg} />
                        </div>
                      </div>
                    </header>

                    {/* Title Section */}
                    <div className={certStyles.internshipTitleBlock}>
                      <div className={certStyles.titleFlourishDivider}>
                        <span className={certStyles.flourishSymbol}>❖</span>
                        <div className={certStyles.flourishLine} />
                        <span className={certStyles.flourishStar}>★</span>
                        <div className={certStyles.flourishLine} />
                        <span className={certStyles.flourishSymbol}>❖</span>
                      </div>
                      <h1 className={`${certStyles.internshipMainTitle} ${cinzel.className}`}>
                        Certificate of Completion
                      </h1>
                      <div className={certStyles.internshipSubTitleBadge}>
                        PROFESSIONAL INTERNSHIP MERIT CREDENTIAL
                      </div>
                    </div>

                    {/* Recipient Statement */}
                    <div className={certStyles.internshipRecipientSection}>
                      <p className={certStyles.internshipCertifyText}>This is to certify that</p>
                      <h2 className={`${certStyles.internshipCandidateName} ${cinzel.className}`}>
                        {simName}
                      </h2>
                      <div className={certStyles.internshipNameUnderline}>
                        <div className={certStyles.nameUnderlineDiamond} />
                      </div>
                    </div>

                    {/* Role & Track Description */}
                    <div className={certStyles.internshipAchievementBlock}>
                      <p className={certStyles.internshipRoleStatement}>
                        has successfully completed the professional internship as{' '}
                        <strong className={certStyles.highlightRole}>
                          {simDesignation || 'Software Engineering Intern'}
                        </strong>
                        {' '}in{' '}
                        <strong className={certStyles.highlightStream}>
                          {simTrack || 'Software Engineering'}
                        </strong>
                      </p>
                      <p className={certStyles.internshipOrgStatement}>
                        conducted under the professional direction of <strong>SkillBun</strong> (operated by <strong>Reish</strong>).
                      </p>
                    </div>

                    {/* Key Meta Badges: Duration, Grade, Mode */}
                    <div className={certStyles.internshipMetricsGrid}>
                      <div className={certStyles.internshipMetricPill}>
                        <span className={certStyles.metricPillLabel}>Internship Duration</span>
                        <span className={certStyles.metricPillVal}>
                          {simStartDate && simEndDate
                            ? `${simStartDate} to ${simEndDate}`
                            : '01-06-2026 to 31-08-2026'}
                        </span>
                      </div>

                      <div className={certStyles.internshipMetricPill}>
                        <span className={certStyles.metricPillLabel}>Performance Rating</span>
                        <span className={certStyles.metricPillVal}>
                          Grade A ({simScore || 94}%)
                        </span>
                      </div>

                      <div className={certStyles.internshipMetricPill}>
                        <span className={certStyles.metricPillLabel}>Mode of Engagement</span>
                        <span className={certStyles.metricPillVal}>
                          Virtual / Remote Operations
                        </span>
                      </div>
                    </div>

                    {/* Formal Performance Statement */}
                    <div className={certStyles.internshipConductStatement}>
                      <p>
                        {formatRecommendationText(simLorText, simName)}
                      </p>
                    </div>

                    {/* Signatures, Official Seal & QR Code Block */}
                    <div className={certStyles.internshipAuthFooter}>
                      {/* Left: Credential ID, Date & Signature */}
                      <div className={certStyles.internshipSigBlock}>
                        <div className={certStyles.internshipIdDate}>
                          <div>Certificate ID: <strong>{simCertId}</strong></div>
                          <div>Date of Issue: <strong>{simDate || simEndDate || new Date().toLocaleDateString('en-GB')}</strong></div>
                        </div>

                        <div className={certStyles.signatureCanvas}>
                          <div className={certStyles.signatoryName}>Signing Authority</div>
                          <div className={certStyles.signatoryRole}>Managing Director, SkillBun</div>
                        </div>
                      </div>

                      {/* Center: Gold Embossed Dual Brand Seal Stamp */}
                      <div className={certStyles.internshipSealArea}>
                        <OfficialSeal />
                      </div>

                      {/* Right: Live Vector Scannable QR Code */}
                      <div className={certStyles.internshipQrArea}>
                        <div className={certStyles.qrCodeWrapper}>
                          <QRCodeSvg value={`https://skillbun.vercel.app/certificate/${(simCertId || '').replace(/\//g, '-')}`} size={88} />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Trust & Verification URL Strip */}
                    <div className={certStyles.internshipVerificationFootnote}>
                      <div className={certStyles.msmeSealBadge}>
                        <IndiaFlagIcon size={18} />
                        <span>Govt. of India MSME Registered Entity</span>
                      </div>
                      <div className={certStyles.footnoteUrl}>
                        Scan the above QR to verify online
                      </div>
                    </div>
                  </div>
                </section>
              ) : selectedDesignId === 'TRAINING' ? (
                /* Landscape Certificate of Practical Industry Training */
                <section className={certStyles.internshipCertFrame}>
                  {/* Vintage Ornate Corner Accents */}
                  <OrnateCorner position="TL" />
                  <OrnateCorner position="TR" />
                  <OrnateCorner position="BL" />
                  <OrnateCorner position="BR" />

                  <div className={certStyles.internshipInnerContainer}>
                    {/* Top Institutional Header */}
                    <div className={certStyles.internshipHeader}>
                      <div className={certStyles.internshipBrandLockup}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-tight.png" alt="SkillBun Logo" className={certStyles.internshipBrandLogo} />
                        <div className={certStyles.internshipBrandDetails}>
                          <div className={certStyles.internshipBrandWordmark}>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</div>
                          <div className={certStyles.internshipBrandSubtitle}>
                            CAREER &amp; SKILLS
                          </div>
                        </div>
                      </div>

                      <div className={certStyles.internshipGovtAttribution}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/reish-mark.png" alt="Reish Mark" className={certStyles.internshipReishLogo} />
                        <div className={certStyles.internshipReishDetails}>
                          <span className={certStyles.internshipGovtTag}>MANAGED &amp; ISSUED BY</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/reish-wordmark.png" alt="REISH" className={certStyles.internshipReishWordmarkImg} />
                        </div>
                      </div>
                    </div>

                    {/* Title Section */}
                    <div className={certStyles.internshipTitleBlock}>
                      <div className={certStyles.titleFlourishDivider}>
                        <span className={certStyles.flourishSymbol}>❖</span>
                        <div className={certStyles.flourishLine} />
                        <span className={certStyles.flourishStar}>★</span>
                        <div className={certStyles.flourishLine} />
                        <span className={certStyles.flourishSymbol}>❖</span>
                      </div>
                      <h1 className={`${certStyles.internshipMainTitle} ${cinzel.className}`}>
                        Certificate of Training
                      </h1>
                      <div className={certStyles.internshipSubTitleBadge}>
                        PRACTICAL INDUSTRY TRAINING &amp; MERIT CREDENTIAL
                      </div>
                    </div>

                    {/* Recipient Statement */}
                    <div className={certStyles.internshipRecipientSection}>
                      <p className={certStyles.internshipCertifyText}>This is to certify that</p>
                      <h2 className={`${certStyles.internshipCandidateName} ${cinzel.className}`}>
                        {simName}
                      </h2>
                      <div className={certStyles.internshipNameUnderline}>
                        <div className={certStyles.nameUnderlineDiamond} />
                      </div>
                    </div>

                    {/* Training Track Description */}
                    <div className={certStyles.internshipAchievementBlock}>
                      <p className={certStyles.internshipRoleStatement}>
                        has successfully undergone and completed the intensive practical industry training in{' '}
                        <strong className={certStyles.highlightRole}>
                          {simTrack || 'Full-Stack Web Engineering & Distributed Cloud Systems'}
                        </strong>
                      </p>
                      <p className={certStyles.internshipOrgStatement}>
                        conducted under the professional mentorship of <strong>SkillBun</strong> (operated by <strong>Reish</strong>).
                      </p>
                    </div>

                    {/* Key Meta Badges */}
                    <div className={certStyles.internshipMetricsGrid}>
                      <div className={certStyles.internshipMetricPill}>
                        <span className={certStyles.metricPillLabel}>Training Tenure</span>
                        <span className={certStyles.metricPillVal}>
                          {simStartDate && simEndDate
                            ? `${simStartDate} to ${simEndDate}`
                            : 'Practical Labs & Sprints'}
                        </span>
                      </div>

                      <div className={certStyles.internshipMetricPill}>
                        <span className={certStyles.metricPillLabel}>Performance Rating</span>
                        <span className={certStyles.metricPillVal}>
                          Grade A ({simScore}%)
                        </span>
                      </div>

                      <div className={certStyles.internshipMetricPill}>
                        <span className={certStyles.metricPillLabel}>Mode of Training</span>
                        <span className={certStyles.metricPillVal}>
                          Virtual / Project-Based Labs
                        </span>
                      </div>
                    </div>

                    {/* Formal Performance Statement */}
                    <div className={certStyles.internshipConductStatement}>
                      <p>
                        {formatRecommendationText(
                          simLorText || 'During the training curriculum, the candidate demonstrated exceptional analytical capability, disciplined execution, and outstanding proficiency across all practical laboratory assignments and technical sprints.',
                          simName
                        )}
                      </p>
                    </div>

                    {/* Signatures, Official Seal & QR Code Block */}
                    <div className={certStyles.internshipAuthFooter}>
                      <div className={certStyles.internshipSigBlock}>
                        <div className={certStyles.internshipIdDate}>
                          <div>Certificate ID: <strong>{simCertId}</strong></div>
                          <div>Date of Issue: <strong>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div>
                        </div>

                        <div className={certStyles.signatureCanvas}>
                          <div className={certStyles.signatoryName}>Signing Authority</div>
                          <div className={certStyles.signatoryRole}>Managing Director, SkillBun</div>
                        </div>
                      </div>

                      <div className={certStyles.internshipSealArea}>
                        <OfficialSeal />
                      </div>

                      <div className={certStyles.internshipQrArea}>
                        <div className={certStyles.qrCodeWrapper}>
                          <QRCodeSvg value={`https://skillbun.vercel.app/certificate/${(simCertId || '').replace(/\//g, '-')}`} size={88} />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Trust & Verification URL Strip */}
                    <div className={certStyles.internshipVerificationFootnote}>
                      <div className={certStyles.msmeSealBadge}>
                        <IndiaFlagIcon size={18} />
                        <span>Govt. of India MSME Registered Entity</span>
                      </div>
                      <div className={certStyles.footnoteUrl}>
                        Scan the above QR to verify online
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                /* Standard Roadmap Assessment Certificate */
                <section className={certStyles.certificateFrame}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/certificate-template.png"
                    alt={`SkillBun Certificate of Completion — ${simName}`}
                    className={certStyles.templateImg}
                    draggable={false}
                  />
                  <div className={certStyles.skillbunOverlay} aria-hidden="true">
                    <span className={certStyles.skillbunText}>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
                  </div>
                  <h1 className={`${certStyles.recipientName} ${cinzel.className}`}>{simName}</h1>
                  <h2
                    className={`${certStyles.roadmapTitle} ${pixelify.className}`}
                    style={{ '--char-count': (simTrack || '').length }}
                  >
                    {simTrack}
                  </h2>
                  <div className={certStyles.qrMeta}>
                    <span className={certStyles.qrMetaId}>{simCertId}</span>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ISSUE / MINT CERTIFICATE */}
      {activeTab === 'mint' && (
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div className={styles.studioControlsCard}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}>
              <div style={{ fontWeight: '800', fontSize: '1.15rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Icon name="zap" size={18} /> Manual Certificate Minting Studio</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
                Directly issue verified Academic or Workforce credentials to students and interns. Generates unambiguous Base32 IDs and registers records into Firestore `/certificates`.
              </p>
            </div>

            <form onSubmit={handleMintSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* Type Selector */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Certificate Category & Type</label>
                <select
                  value={mintType}
                  onChange={(e) => setMintType(e.target.value)}
                  className={styles.inputField}
                >
                  <option value="ROADMAP">Academic Roadmap Assessment Certificate</option>
                  <option value="INTERNSHIP">Certificate of Internship Completion</option>
                  <option value="TRAINING">Practical Industry Training Certificate</option>
                  <option value="LOR">Official Letter of Recommendation (LOR)</option>
                </select>
              </div>

              {/* Candidate Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Candidate Full Name *</label>
                  <input
                    type="text"
                    required
                    value={mintName}
                    onChange={(e) => setMintName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className={styles.inputField}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Candidate Email Address</label>
                  <input
                    type="email"
                    value={mintEmail}
                    onChange={(e) => setMintEmail(e.target.value)}
                    placeholder="e.g. priya.sharma@example.com"
                    className={styles.inputField}
                  />
                </div>
              </div>

              {/* Stream / Track Title */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Roadmap / Specialization Track Title *</label>
                <input
                  type="text"
                  required
                  value={mintTrack}
                  onChange={(e) => setMintTrack(e.target.value)}
                  placeholder="e.g. Full Stack Web Development or Advanced AI/ML Engineering"
                  className={styles.inputField}
                />
              </div>

              {/* Conditional Fields based on Type */}
              {mintType === 'ROADMAP' ? (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Assessment Exam Score (%)</label>
                  <input
                    type="number"
                    min={70}
                    max={100}
                    value={mintScore}
                    onChange={(e) => setMintScore(e.target.value)}
                    className={styles.inputField}
                  />
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Department</label>
                      <input
                        type="text"
                        value={mintDepartment}
                        onChange={(e) => setMintDepartment(e.target.value)}
                        className={styles.inputField}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Role / Designation</label>
                      <input
                        type="text"
                        value={mintDesignation}
                        onChange={(e) => setMintDesignation(e.target.value)}
                        className={styles.inputField}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Tenure Start Date</label>
                      <input
                        type="date"
                        value={mintStartDate}
                        onChange={(e) => setMintStartDate(e.target.value)}
                        className={styles.inputField}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Tenure End Date</label>
                      <input
                        type="date"
                        value={mintEndDate}
                        onChange={(e) => setMintEndDate(e.target.value)}
                        className={styles.inputField}
                      />
                    </div>
                  </div>

                  {mintType === 'LOR' && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Custom Letter of Recommendation Body</label>
                      <textarea
                        value={mintLorText}
                        onChange={(e) => setMintLorText(e.target.value)}
                        placeholder="Enter specific performance observations and endorsement text..."
                        className={styles.textareaField}
                        rows={4}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={mintSubmitting}
                className={styles.btnPrimary}
                style={{ marginTop: '0.5rem' }}
              >
                {mintSubmitting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <Icon name="clock" size={15} /> Generating Cryptographic Certificate...
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <Icon name="zap" size={15} /> Mint & Register Verified Certificate
                  </span>
                )}
              </button>

              {/* Feedback Alert */}
              {feedback && (
                <div
                  className={`${styles.statusMessage} ${
                    feedback.type === 'success' ? styles.statusSuccess : styles.statusError
                  }`}
                >
                  {feedback.text}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
