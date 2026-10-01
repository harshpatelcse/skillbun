'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import { useAdminAccess } from '@/utils/client/adminAuth';
import { getFirebaseServices } from '@/utils/client/firebaseClient';
import { collection, getDocs } from 'firebase/firestore';
import { downloadBase64Pdf } from '@/utils/client/printAndDownload';
import { fetchAllWorkforceDocuments } from '@/utils/client/workforceDocuments.mjs';
import styles from './documents.module.css';

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
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'file':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
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
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
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
    default:
      return null;
  }
}


// Official SkillBun Workforce Legal PDF Documents
const PRODUCTION_DOCUMENTS = [
  {
    id: 'workforce_offer',
    category: 'Offer Letter',
    docType: 'OFFER_PACK',
    name: '4-Page Internship Offer Letter & Legal Agreement',
    prefix: 'HR-OFF',
    defaultHeading: 'INTERNSHIP OFFER LETTER & TERMS OF ENGAGEMENT',
    description: '4-Page formal legal agreement with annexures, agile sprint milestones, IP assignment, and stipend terms.',
  },
  {
    id: 'workforce_extension',
    category: 'Extension',
    docType: 'EXTENSION_LETTER',
    name: 'Internship Tenure Extension Legal Addendum',
    prefix: 'HR-EXT',
    defaultHeading: 'EXTENSION OF INTERNSHIP TENURE',
    description: 'Formal legal addendum extending completion date, sprint roadmap, and milestone deliverables.',
  },
];

export default function DocumentManagerPage() {
  const { user, authLoading } = useAuth();
  const { isAdmin, checking } = useAdminAccess(user, authLoading);

  // Studio Mode: 'registry' | 'studio' | 'issue'
  const [activeTab, setActiveTab] = useState('registry');

  // Registry State
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedDocForModal, setSelectedDocForModal] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Live PDF Studio Simulator State
  const [selectedDocId, setSelectedDocId] = useState('workforce_offer');
  const [salutation, setSalutation] = useState('Mr.');
  const [candidateName, setCandidateName] = useState('Alex Sharma');
  const [parentName, setParentName] = useState('R. K. Sharma');
  const [personalEmail, setPersonalEmail] = useState('alex.sharma@example.com');
  const [currentAddress, setCurrentAddress] = useState('42 Tech Park Avenue, Bengaluru, Karnataka, 560001');
  const [courseDegree, setCourseDegree] = useState('B.Tech in Computer Science');
  const [collegeName, setCollegeName] = useState('National Institute of Technology');
  const [department, setDepartment] = useState('Core Platform Engineering');
  const [designation, setDesignation] = useState('Software Engineering Intern');
  const [joiningDate, setJoiningDate] = useState('01 September 2026');
  const [contractEndDate, setContractEndDate] = useState('30 November 2026');
  const [stipendAmount, setStipendAmount] = useState('INR 10,000 / month');
  const [customRefId, setCustomRefId] = useState('SKB/2026/HR-OFF/8K29DF');

  // PDF Preview Engine State
  const [pdfBase64, setPdfBase64] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Issue Form State
  const [issueType, setIssueType] = useState('OFFER_PACK');
  const [issueName, setIssueName] = useState('');
  const [issueEmail, setIssueEmail] = useState('');
  const [issueDegree, setIssueDegree] = useState('B.Tech Computer Science');
  const [issueCollege, setIssueCollege] = useState('University of Technology');
  const [issueDept, setIssueDept] = useState('Core Engineering');
  const [issueDesignation, setIssueDesignation] = useState('Engineering Intern');
  const [issueJoiningDate, setIssueJoiningDate] = useState('');
  const [issueEndDate, setIssueEndDate] = useState('');
  const [issueStipend, setIssueStipend] = useState(10000);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Current selected template
  const currentTemplate = useMemo(() => {
    return PRODUCTION_DOCUMENTS.find((d) => d.id === selectedDocId) || PRODUCTION_DOCUMENTS[0];
  }, [selectedDocId]);

  // Fetch real PDF preview from backend
  const generateLivePdfPreview = useCallback(async () => {
    if (!user || !isAdmin) return;
    setPdfLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/workforce/pdf/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          docType: currentTemplate.docType,
          referenceId: customRefId,
          newContractEndDate: contractEndDate,
          employee: {
            salutation,
            full_name: candidateName,
            parent_name: parentName,
            personal_email: personalEmail,
            current_address: currentAddress,
            course_degree: courseDegree,
            college_name: collegeName,
            department,
            designation,
            joining_date: joiningDate,
            contract_end_date: contractEndDate,
            stipend_amount: parseInt(stipendAmount.replace(/[^0-9]/g, ''), 10) || 10000,
            stipend_currency: 'INR',
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.pdfBase64) {
        setPdfBase64(data.pdfBase64);
      }
    } catch (err) {
      console.error('Failed to generate PDF preview:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [
    user,
    isAdmin,
    currentTemplate.docType,
    customRefId,
    salutation,
    candidateName,
    parentName,
    personalEmail,
    currentAddress,
    courseDegree,
    collegeName,
    department,
    designation,
    joiningDate,
    contractEndDate,
    stipendAmount,
  ]);

  // Debounced auto-refresh of live PDF preview when simulator inputs change
  useEffect(() => {
    if (activeTab === 'studio') {
      const timer = setTimeout(() => {
        generateLivePdfPreview();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [activeTab, generateLivePdfPreview]);

  // Fetch documents from backend
  const fetchDocuments = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoadingDocs(true);
    try {
      const token = await user.getIdToken();
      setDocuments(await fetchAllWorkforceDocuments(token));
    } catch (err) {
      try {
        const { db } = getFirebaseServices();
        if (db) {
          const snap = await getDocs(collection(db, 'workforce_docs'));
          const docsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setDocuments(docsList);
        }
      } catch {}
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, [user, isAdmin]);

  // Initial Load
  useEffect(() => {
    let isMounted = true;
    if (user && isAdmin) {
      const init = async () => {
        try {
          const token = await user.getIdToken();
          const allDocuments = await fetchAllWorkforceDocuments(token);
          if (isMounted) setDocuments(allDocuments);
        } catch (e) {
          if (isMounted) {
            try {
              const { db } = getFirebaseServices();
              if (db) {
                const snap = await getDocs(collection(db, 'workforce_docs'));
                const docsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setDocuments(docsList);
              }
            } catch {}
          }
          console.error(e);
        } finally {
          if (isMounted) setLoadingDocs(false);
        }
      };
      init();
    }
    return () => {
      isMounted = false;
    };
  }, [user, isAdmin]);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (typeFilter !== 'ALL' && doc.doc_type !== typeFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          (doc.display_id || '').toLowerCase().includes(q) ||
          (doc.id || '').toLowerCase().includes(q) ||
          (doc.title || '').toLowerCase().includes(q) ||
          (doc.dispatched_to || '').toLowerCase().includes(q) ||
          (doc.metadata_snapshot?.full_name || '').toLowerCase().includes(q) ||
          (doc.metadata_snapshot?.designation || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (statusFilter === 'ACTIVE' && doc.is_revoked) return false;
      if (statusFilter === 'REVOKED' && !doc.is_revoked) return false;
      return true;
    });
  }, [documents, searchTerm, statusFilter, typeFilter]);

  // Metrics
  const metrics = useMemo(() => {
    return {
      total: documents.length,
      offers: documents.filter((d) => d.doc_type === 'OFFER_PACK').length,
      extensions: documents.filter((d) => d.doc_type === 'EXTENSION_LETTER').length,
      active: documents.filter((d) => !d.is_revoked).length,
      revoked: documents.filter((d) => d.is_revoked).length,
    };
  }, [documents]);

  // Toggle Revoke
  const handleToggleRevoke = async (docItem) => {
    const nextState = !docItem.is_revoked;
    const promptMsg = nextState
      ? `Revoke workforce legal document (${docItem.display_id || docItem.id})?`
      : `Re-instate legal document (${docItem.display_id || docItem.id})?`;

    if (!window.confirm(promptMsg)) return;

    setActionLoadingId(docItem.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/workforce/documents', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ docId: docItem.id, is_revoked: nextState }),
      });

      const data = await res.json();
      if (data.success) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === docItem.id ? { ...d, is_revoked: nextState } : d))
        );
      } else {
        alert(data.error || 'Failed to update document status.');
      }
    } catch (err) {
      alert('Error updating status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Download real PDF
  const handleDownloadPdf = async (docItem) => {
    setActionLoadingId(docItem.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/workforce/documents/${encodeURIComponent(docItem.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success && data.document?.pdf_base64) {
        downloadBase64Pdf(data.document.pdf_base64, `${docItem.display_id || docItem.id}.pdf`);
      } else {
        alert('Binary PDF not stored on record. Use the Live PDF Studio to generate a fresh copy.');
      }
    } catch (e) {
      alert('Error downloading PDF.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Download Simulated PDF from Studio
  const handleDownloadSimulatedPdf = () => {
    if (!pdfBase64) {
      generateLivePdfPreview();
      return;
    }
    downloadBase64Pdf(pdfBase64, `${customRefId.replace(/[\/\\]/g, '_')}_Official.pdf`);
  };

  // Issue Form Submit
  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!issueName.trim() || !issueEmail.trim()) {
      setFeedback({ type: 'error', text: 'Candidate name and email are required.' });
      return;
    }

    setIssueSubmitting(true);
    setFeedback(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/workforce/offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          salutation: 'Mr./Ms.',
          full_name: issueName.trim(),
          personal_email: issueEmail.trim().toLowerCase(),
          course_degree: issueDegree,
          college_name: issueCollege,
          department: issueDept,
          designation: issueDesignation,
          joining_date: issueJoiningDate || new Date().toISOString().slice(0, 10),
          contract_end_date: issueEndDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          stipend_amount: Number(issueStipend) || 10000,
          generate_pdf: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          text: `Document (${data.referenceId || 'Issued'}) generated and registered in Document Vault!`,
        });
        setIssueName('');
        setIssueEmail('');
        fetchDocuments();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to issue document.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network error generating document.' });
    } finally {
      setIssueSubmitting(false);
    }
  };

  if (authLoading || checking) {
    return (
      <div className={styles.docContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <p style={{ color: 'var(--muted)', fontSize: '1.05rem', fontWeight: '600' }}>Verifying admin access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className={styles.docContainer}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '3rem 2rem', textAlign: 'center', maxWidth: '500px', margin: '10vh auto' }}>
          <h2 style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: '#ef4444', marginBottom: '0.75rem' }}>
            403 — Unauthorized
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
            Document Vault is restricted to platform administrators.
          </p>
          <Link href="/dashboard" style={{ background: 'var(--green)', color: '#000', padding: '0.6rem 1.25rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 800 }}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.docContainer}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <div className={styles.titleBadge}>
            <h1 className={styles.titleText}>Workforce Legal Document & PDF Vault</h1>
            <span className={styles.securityPill}><Icon name="shield" size={13} style={{ marginRight: '0.35rem' }} /> pdf-lib Legal Engine</span>
          </div>
          <p className={styles.subtitle}>
            Inspect, live-preview, compile, and manage official SkillBun workforce legal PDF agreements, 4-page offer packs, tenure extension addendums, and offboarding records.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link href="/dashboard/console/admin" className={styles.actionBtnSecondary}>
            Command Center
          </Link>
          <Link href="/dashboard/console/admin/certificates" className={styles.actionBtnSecondary}>
            Certificate Studio
          </Link>
          <Link href="/dashboard/console/admin/emails" className={styles.actionBtnSecondary}>
            Mail Studio
          </Link>
        </div>
      </div>

      {/* Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text)', fontFamily: 'var(--font-fredoka)' }}>{metrics.total}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase' }}>Total Issued Docs</div>
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#3b82f6', fontFamily: 'var(--font-fredoka)' }}>{metrics.offers}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase' }}>4-Page Offer Packs</div>
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#a855f7', fontFamily: 'var(--font-fredoka)' }}>{metrics.extensions}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase' }}>Tenure Extensions</div>
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--green)', fontFamily: 'var(--font-fredoka)' }}>{metrics.active}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase' }}>Active Legal Records</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => setActiveTab('registry')}
          className={`${styles.mainModeBtn} ${activeTab === 'registry' ? styles.mainModeBtnActive : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="folder" size={15} /> Issued Documents Vault ({filteredDocuments.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('studio')}
          className={`${styles.mainModeBtn} ${activeTab === 'studio' ? styles.mainModeBtnActive : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="file" size={15} /> Live Legal PDF Studio & Generator</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('issue')}
          className={`${styles.mainModeBtn} ${activeTab === 'issue' ? styles.mainModeBtnActive : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="zap" size={15} /> Issue & Register New Document</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: ISSUED DOCUMENTS VAULT                                 */}
      {/* ============================================================ */}
      {activeTab === 'registry' && (
        <div>
          {/* Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.85rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.45rem 0.85rem', flex: 1, minWidth: '260px', maxWidth: '480px' }}>
              <Icon name="search" size={14} style={{ color: 'var(--muted)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by candidate name, reference ID, designation..."
                style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', width: '100%', fontSize: '0.85rem' }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Icon name="close" size={12} /></button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--text)', fontSize: '0.82rem', outline: 'none', cursor: 'pointer' }}
              >
                <option value="ALL">All Document Types</option>
                <option value="OFFER_PACK">Offer Pack (4 Pages)</option>
                <option value="EXTENSION_LETTER">Tenure Extension</option>
                <option value="TERMINATION_NOTICE">Termination Notice</option>
                <option value="ACTIVATION_WELCOME">Activation Welcome</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--text)', fontSize: '0.82rem', outline: 'none', cursor: 'pointer' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Valid</option>
                <option value="REVOKED">Revoked</option>
              </select>

              <button
                type="button"
                onClick={fetchDocuments}
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.45rem 0.85rem', color: 'var(--text)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: '600' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="refresh" size={13} /> Refresh</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            {loadingDocs ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="clock" size={15} /> Loading workforce documents from Firestore `/workforce_docs`...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--muted)' }}><Icon name="folder" size={38} /></div>
                <p style={{ margin: 0 }}>No workforce documents found matching your filter criteria.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '0.9rem 1rem' }}>Candidate</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Document Type</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Reference ID</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Issued Date</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((docItem) => {
                      const meta = docItem.metadata_snapshot || {};
                      const isAction = actionLoadingId === docItem.id;

                      return (
                        <tr key={docItem.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <div style={{ fontWeight: '750', color: 'var(--text)' }}>
                              {meta.full_name || docItem.employee_name || 'Candidate Name'}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                              {docItem.dispatched_to || meta.personal_email || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              background: docItem.doc_type === 'OFFER_PACK' ? 'rgba(59, 130, 246, 0.15)' :
                                          docItem.doc_type === 'EXTENSION_LETTER' ? 'rgba(168, 85, 247, 0.15)' :
                                          docItem.doc_type === 'TERMINATION_NOTICE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: docItem.doc_type === 'OFFER_PACK' ? '#3b82f6' :
                                     docItem.doc_type === 'EXTENSION_LETTER' ? '#a855f7' :
                                     docItem.doc_type === 'TERMINATION_NOTICE' ? '#ef4444' : 'var(--green)',
                            }}>
                              {docItem.doc_type}
                            </span>
                            <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                              {meta.designation || docItem.title}
                            </div>
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <code style={{ background: 'var(--surface-raised)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--accent)' }}>
                              {docItem.display_id || docItem.id}
                            </code>
                          </td>
                          <td style={{ padding: '0.9rem 1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {docItem.issued_at ? new Date(docItem.issued_at).toLocaleDateString('en-IN') : 'N/A'}
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            {docItem.is_revoked ? (
                              <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '0.74rem', fontWeight: '800', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                                REVOKED
                              </span>
                            ) : (
                              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--green)', fontSize: '0.74rem', fontWeight: '800', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                                VALID
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedDocForModal(docItem)}
                                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="eye" size={12} /> View</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(docItem)}
                                disabled={isAction}
                                style={{ background: 'var(--green)', border: 'none', color: '#000', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer' }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="download" size={12} /> PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleRevoke(docItem)}
                                disabled={isAction}
                                style={{
                                  background: 'var(--surface-raised)',
                                  border: '1px solid var(--border)',
                                  color: docItem.is_revoked ? 'var(--green)' : '#ef4444',
                                  padding: '0.35rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                }}
                              >
                                {docItem.is_revoked ? 'Restore' : 'Revoke'}
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

      {/* ============================================================ */}
      {/* TAB 2: LIVE LEGAL PDF STUDIO & GENERATOR                     */}
      {/* ============================================================ */}
      {activeTab === 'studio' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Controls Left */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text)', marginBottom: '0.2rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Icon name="file" size={16} /> PDF Template & Variable Studio</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                Live simulator matching the exact production `pdf-lib` legal generator.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)' }}>Document Type</label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
              >
                {PRODUCTION_DOCUMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                {currentTemplate.description}
              </div>
            </div>

            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.85rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text)', marginBottom: '0.65rem' }}>
                Candidate & Contract Variables:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Salutation</label>
                  <input
                    type="text"
                    value={salutation}
                    onChange={(e) => setSalutation(e.target.value)}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Candidate Name</label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Parent / Guardian Name</label>
                <input
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Joining Date</label>
                  <input
                    type="text"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Contract End Date</label>
                  <input
                    type="text"
                    value={contractEndDate}
                    onChange={(e) => setContractEndDate(e.target.value)}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Monthly Stipend</label>
                <input
                  type="text"
                  value={stipendAmount}
                  onChange={(e) => setStipendAmount(e.target.value)}
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: '700' }}>Reference ID</label>
                <input
                  type="text"
                  value={customRefId}
                  onChange={(e) => setCustomRefId(e.target.value)}
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem', color: 'var(--text)', fontSize: '0.82rem', width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Live Preview (Right): REAL MULTI-PAGE PDF VIEWER */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text)' }}>
                Compiled PDF Output: {currentTemplate.name}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleDownloadSimulatedPdf}
                  style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800', cursor: 'pointer' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="download" size={13} /> Download Real PDF</span>
                </button>
              </div>
            </div>

            {/* REAL PDF IFRAME PREVIEW */}
            <div style={{ width: '100%', minHeight: '860px', background: '#525659', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {pdfLoading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, color: '#ffffff', fontWeight: '700', fontSize: '1rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Icon name="clock" size={16} /> Compiling Real PDF with pdf-lib...</span>
                </div>
              )}
              {pdfBase64 ? (
                <iframe
                  src={`data:application/pdf;base64,${pdfBase64}#toolbar=1&navpanes=1`}
                  title="Real PDF Preview"
                  style={{ width: '100%', height: '860px', border: 'none' }}
                />
              ) : (
                <div style={{ padding: '4rem', textAlign: 'center', color: '#ffffff' }}>
                  <p>Generating PDF preview...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: ISSUE & REGISTER NEW DOCUMENT                          */}
      {/* ============================================================ */}
      {activeTab === 'issue' && (
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}>
              <div style={{ fontWeight: '800', fontSize: '1.15rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Icon name="zap" size={18} /> Manual Workforce Document Issuance</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--muted)' }}>
                Issue an official legal agreement, offer letter pack, or extension letter. Generates cryptographic reference ID, registers record in Firestore `/workforce_docs`, and pre-compiles PDF.
              </p>
            </div>

            <form onSubmit={handleIssueSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Document Category</label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                >
                  <option value="OFFER_PACK">4-Page Internship Offer Letter & Terms</option>
                  <option value="EXTENSION_LETTER">Tenure Extension Addendum</option>
                  <option value="TERMINATION_NOTICE">Notice of Conclusion / Offboarding</option>
                  <option value="ACTIVATION_WELCOME">Day-1 Workspace Activation</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Candidate Full Name *</label>
                  <input
                    type="text"
                    required
                    value={issueName}
                    onChange={(e) => setIssueName(e.target.value)}
                    placeholder="e.g. Alex Sharma"
                    style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Candidate Email *</label>
                  <input
                    type="email"
                    required
                    value={issueEmail}
                    onChange={(e) => setIssueEmail(e.target.value)}
                    placeholder="e.g. alex.sharma@example.com"
                    style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Department</label>
                  <input
                    type="text"
                    value={issueDept}
                    onChange={(e) => setIssueDept(e.target.value)}
                    style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Designation</label>
                  <input
                    type="text"
                    value={issueDesignation}
                    onChange={(e) => setIssueDesignation(e.target.value)}
                    style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Joining Date</label>
                  <input
                    type="date"
                    value={issueJoiningDate}
                    onChange={(e) => setIssueJoiningDate(e.target.value)}
                    style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Contract End Date</label>
                  <input
                    type="date"
                    value={issueEndDate}
                    onChange={(e) => setIssueEndDate(e.target.value)}
                    style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text)', display: 'block', marginBottom: '0.35rem' }}>Monthly Stipend (INR)</label>
                <input
                  type="number"
                  value={issueStipend}
                  onChange={(e) => setIssueStipend(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.55rem', color: 'var(--text)', fontSize: '0.85rem' }}
                />
              </div>

              <button
                type="submit"
                disabled={issueSubmitting}
                style={{ background: 'var(--green)', color: '#000', border: 'none', borderRadius: '10px', padding: '0.75rem 1.25rem', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', marginTop: '0.5rem' }}
              >
                {issueSubmitting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <Icon name="clock" size={15} /> Generating PDF & Storing in Vault...
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <Icon name="zap" size={15} /> Issue Document & Save to Vault
                  </span>
                )}
              </button>

              {feedback && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.84rem', background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: feedback.type === 'success' ? 'var(--green)' : '#ef4444', border: '1px solid currentColor' }}>
                  {feedback.text}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedDocForModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setSelectedDocForModal(null)}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '650px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem', color: 'var(--text)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-fredoka)', fontSize: '1.25rem' }}>
                Document Details: {selectedDocForModal.display_id || selectedDocForModal.id}
              </h3>
              <button onClick={() => setSelectedDocForModal(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Icon name="close" size={16} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
              <div><strong>Document Type:</strong> {selectedDocForModal.doc_type}</div>
              <div><strong>Candidate Name:</strong> {selectedDocForModal.metadata_snapshot?.full_name || selectedDocForModal.employee_name || 'N/A'}</div>
              <div><strong>Email:</strong> {selectedDocForModal.dispatched_to || selectedDocForModal.metadata_snapshot?.personal_email || 'N/A'}</div>
              <div><strong>Designation & Dept:</strong> {selectedDocForModal.metadata_snapshot?.designation} ({selectedDocForModal.metadata_snapshot?.department})</div>
              <div><strong>Issued Date:</strong> {selectedDocForModal.issued_at ? new Date(selectedDocForModal.issued_at).toLocaleString('en-IN') : 'N/A'}</div>
              <div><strong>Status:</strong> {selectedDocForModal.is_revoked ? 'REVOKED' : 'ACTIVE VALID'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button onClick={() => setSelectedDocForModal(null)} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                Close
              </button>
              <button onClick={() => handleDownloadPdf(selectedDocForModal)} style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '800', cursor: 'pointer' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="download" size={13} /> Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
