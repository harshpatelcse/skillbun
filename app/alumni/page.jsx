'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import styles from './alumni.module.css';

export default function AlumniPortalPage() {
  const { user } = useAuth();
  return <AlumniPortalContent key={`${user?.uid || 'guest'}:${user?.email || ''}`} user={user} />;
}

function VaultIcon({ name, size = 18 }) {
  const paths = {
    certificate: 'm12 3 9 5-9 5-9-5 9-5ZM6 10v7c4 3 8 3 12 0v-7M21 8v8',
    book: 'M4 19.5V5a2.5 2.5 0 0 1 2.5-2.5H20V22H6.5a2.5 2.5 0 0 1 0-5H20',
    document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h6',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    warning: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
    folder: 'M3 5h6l2 2h10v14H3V5Z',
    shield: 'm12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Zm-4 10 3 3 5-6',
    lock: 'M6 11V7a6 6 0 0 1 12 0v4M4 11h16v11H4V11Z',
    check: 'm5 12 4 4L19 6',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', flexShrink: 0 }}><path d={paths[name] || paths.document} /></svg>;
}

function AlumniPortalContent({ user }) {
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const pendingRequest = useRef(null);
  useEffect(() => () => pendingRequest.current?.abort(), []);

  const searchDocuments = useCallback(async (searchKey) => {
    const key = (searchKey || '').trim();
    if (!key) return;

    setLoading(true);
    setError('');
    setDocuments([]);
    setHasSearched(true);
    setSearchedQuery(key);
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;

    try {
      let token = '';
      if (user) {
        token = await user.getIdToken();
      }
      if (controller.signal.aborted) return;

      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`/api/alumni/documents?query=${encodeURIComponent(key)}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      });
      const data = await res.json();
      if (controller.signal.aborted || pendingRequest.current !== controller) return;

      if (!res.ok) {
        throw new Error(data.message || (typeof data.error === 'string' ? data.error : data.error?.message) || 'Unable to retrieve document records.');
      }
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (err) {
      if (controller.signal.aborted || pendingRequest.current !== controller) return;
      setError(err.name === 'TimeoutError' ? 'The document lookup timed out. Please try again.' : err.message || 'Network error occurred while fetching records.');
      setDocuments([]);
    } finally {
      if (!controller.signal.aborted && pendingRequest.current === controller) setLoading(false);
    }
  }, [user]);

  // Auto-search if user is logged in
  useEffect(() => {
    let active = true;
    if (user?.email && !hasSearched) {
      queueMicrotask(() => {
        if (active) {
          setQuery(user.email);
          searchDocuments(user.email);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [user, hasSearched, searchDocuments]);

  const handleSubmit = (e) => {
    e.preventDefault();
    searchDocuments(query);
  };

  const getBadgeIcon = (type) => {
    switch (type) {
      case 'INTERNSHIP':
      case 'ROADMAP':
        return <VaultIcon name="certificate" />;
      case 'TRAINING':
        return <VaultIcon name="book" />;
      case 'LOR':
        return <VaultIcon name="document" />;
      case 'EXTENSION_LETTER':
      case 'EXTENSION':
        return <VaultIcon name="document" />;
      case 'OFFER_LETTER':
        return <VaultIcon name="document" />;
      case 'TERMINATION_NOTICE':
        return <VaultIcon name="document" />;
      default:
        return <VaultIcon name="document" />;
    }
  };

  return (
    <main className={styles.container}>
      <header className={styles.hero}>
        <div className={styles.badge}>
          <span>Official Verification Hub</span>
        </div>
        <h1 className={styles.title}>
          SkillBun <span className={styles.titleHighlight}>Alumni</span> Document Vault
        </h1>
        <p className={styles.subtitle}>
          Securely verify, view, and retrieve your official SkillBun internship certificates, offer letters, extension addendums, training credentials, and letters of recommendation.
        </p>
      </header>

      <div className={styles.searchWrap}>
        <form onSubmit={handleSubmit} className={styles.searchForm}>
          <input
            type="text"
            aria-label="Personal email or document reference ID"
            className={styles.searchInput}
            placeholder="Enter your personal email or Document Ref ID (e.g. SKB/2026/INT-REC/...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            maxLength={254}
            disabled={loading}
          />
          <button type="submit" className={styles.searchButton} disabled={loading || !query.trim()}>
            {loading ? 'Searching...' : <><VaultIcon name="search" /> Verify Records</>}
          </button>
        </form>
        <p className={styles.helperText}>
          Search with your registered email or official Reference Code (e.g. <code>SKB/2026/INT-REC/XXXXXX</code> or <code>SKBXXXX-XX-XX-XXXX</code>)
        </p>
      </div>

      {error && (
        <div role="alert" className={styles.emptyState} style={{ borderColor: 'var(--danger)', marginBottom: '2rem' }}>
          <div className={styles.emptyIcon}><VaultIcon name="warning" size={48} /></div>
          <div className={styles.emptyTitle}>Lookup Issue</div>
          <div className={styles.emptyText}>{error}</div>
        </div>
      )}

      {hasSearched && !loading && documents.length === 0 && !error && (
        <div role="status" className={styles.emptyState}>
          <div className={styles.emptyIcon}><VaultIcon name="folder" size={48} /></div>
          <div className={styles.emptyTitle}>No Records Found</div>
          <div className={styles.emptyText}>
            No verified certificates or workforce letters found for <strong>{searchedQuery}</strong>. Ensure the query is exact.
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
              Found {documents.length} Verified Document{documents.length === 1 ? '' : 's'}
            </h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Verified via SkillBun Trust Registry
            </span>
          </div>

          <div className={styles.grid}>
            {documents.map((doc) => (
              <div key={doc.id} className={styles.card}>
                <div>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardType}>
                      {getBadgeIcon(doc.type)} {(doc.type || 'DOCUMENT').replace(/_/g, ' ')}
                    </span>
                    <span className={styles.cardRef}>{doc.display_id || doc.id}</span>
                  </div>

                  <h3 className={styles.cardTitle}>{doc.title}</h3>

                  <div className={styles.cardMeta}>
                    {doc.recipient_name && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Issued To:</span>
                        <span className={styles.metaValue}>{doc.recipient_name}</span>
                      </div>
                    )}
                    {doc.department && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Department:</span>
                        <span className={styles.metaValue}>{doc.department}</span>
                      </div>
                    )}
                    {doc.designation && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Role:</span>
                        <span className={styles.metaValue}>{doc.designation}</span>
                      </div>
                    )}
                    {(doc.start_date || doc.end_date) && (
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Tenure:</span>
                        <span className={styles.metaValue}>
                          {doc.start_date || 'N/A'} to {doc.end_date || 'Present'}
                        </span>
                      </div>
                    )}
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Status:</span>
                      <span className={`${styles.statusPill} ${doc.is_revoked ? styles.statusRevoked : styles.statusValid}`}>
                        <VaultIcon name={doc.is_revoked ? 'close' : 'check'} size={14} /> {doc.is_revoked ? 'Revoked' : 'Active & Verified'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  {doc.verification_url ? (
                    <Link
                      href={doc.verification_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.verifyButton}
                    >
                      <VaultIcon name="shield" /> View Official Credential
                    </Link>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', width: '100%', padding: '0.4rem 0' }}>
                      <VaultIcon name="lock" size={14} /> Formal Workforce Archival Record
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
