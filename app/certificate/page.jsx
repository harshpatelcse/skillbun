'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CertificateLookupError, fetchPublicCertificate } from '@/utils/client/publicCertificate.mjs';
import styles from './verify.module.css';

export default function VerifyRegistryPage() {
  const [searchId, setSearchId] = useState('');
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const pendingRequest = useRef(null);

  useEffect(() => () => pendingRequest.current?.abort(), []);

  const handleVerify = async (e) => {
    e.preventDefault();
    const rawInput = searchId.trim();
    if (!rawInput) return;

    setLoading(true);
    setError('');
    setCert(null);
    setSearched(true);

    setErrorCode('');
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    try {
      const certificate = await fetchPublicCertificate(rawInput, { signal: controller.signal });
      if (!controller.signal.aborted && pendingRequest.current === controller) setCert(certificate);
    } catch (err) {
      if (controller.signal.aborted || pendingRequest.current !== controller) return;
      setErrorCode(err instanceof CertificateLookupError ? err.code : 'VERIFICATION_UNAVAILABLE');
      setError(typeof window !== 'undefined' && !window.navigator.onLine
        ? 'Network offline. Please check your internet connection and try again.'
        : err instanceof CertificateLookupError ? err.message : 'Certificate verification is temporarily unavailable. Please try again.');
    } finally {
      if (!controller.signal.aborted && pendingRequest.current === controller) setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.bgGridOverlay} aria-hidden="true" />

      <div className={styles.container}>
        <section className={`${styles.panel} ${styles.glassPanel}`}>
          <div className={styles.header}>
            <span className={styles.kicker}>SKILLBUN CREDENTIAL REGISTRY</span>
            <h1>Verify Certificate</h1>
            <p>Verify the authenticity and details of any SkillBun career certification.</p>
          </div>

          <form onSubmit={handleVerify} className={styles.searchForm}>
            <div className={styles.inputGroup}>
              <label htmlFor="verify-id">Enter Unique Certificate ID:</label>
              <div className={styles.searchRow}>
                <input
                  type="text"
                  id="verify-id"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  placeholder="e.g. SKB/2026/INT-REC/EJGHNG or SKB8F92-4C-10-9A7E"
                  className={styles.searchInput}
                  disabled={loading}
                  maxLength={128}
                  aria-invalid={errorCode === 'INVALID_ID'}
                  aria-describedby={error ? 'verification-error' : undefined}
                />
                <button type="submit" className={styles.primaryButton} disabled={loading || !searchId.trim()}>
                  {loading ? 'Verifying...' : 'Verify ID'}
                </button>
              </div>
            </div>
          </form>

          {searched && (
            <div className={styles.resultSection}>
              {loading && (
                <div className={styles.loadingBlock} role="status" aria-live="polite">
                  <div className={styles.spinner}></div>
                  <p>Searching the secure registry...</p>
                </div>
              )}

              {!loading && error && (
                <div className={styles.errorCard} role="alert" id="verification-error">
                  <span className={styles.statusBadgeFail}>{errorCode === 'INVALID_ID' ? 'INVALID ID' : errorCode === 'NOT_FOUND' ? 'NOT FOUND' : errorCode === 'AMBIGUOUS_ID' ? 'AMBIGUOUS ID' : 'VERIFICATION UNAVAILABLE'}</span>
                  <h3>{errorCode === 'NOT_FOUND' || errorCode === 'INVALID_ID' ? 'Certificate Not Verified' : 'Unable to Complete Verification'}</h3>
                  <p>{error}</p>
                </div>
              )}

              {!loading && cert && (
                <div className={cert.is_revoked ? styles.errorCard : styles.successCard} role="status" aria-live="polite">
                  <div className={styles.cardHeader}>
                    <span className={cert.is_revoked ? styles.statusBadgeFail : styles.statusBadgePass}>{cert.is_revoked ? 'REVOKED CREDENTIAL' : 'AUTHENTIC CREDENTIAL'}</span>
                    <h3>{cert.is_revoked ? 'This Credential Has Been Revoked' : 'Certificate Successfully Verified'}</h3>
                  </div>

                  <div className={styles.detailsList}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Recipient Name:</span>
                      <span className={styles.detailValue}>{cert.name}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Credential / Subject:</span>
                      <span className={styles.detailValue}>
                        {cert.designation || cert.stream_or_track || (cert.roadmapTitle ? `${cert.roadmapTitle} Roadmap` : 'Professional Credential')}
                      </span>
                    </div>
                    {(cert.performance_rating || cert.score !== undefined) && (
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Grade / Rating:</span>
                        <span className={styles.detailValue}>
                          {cert.performance_rating || `${cert.score}% Score`}
                        </span>
                      </div>
                    )}
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Issue Date:</span>
                      <span className={styles.detailValue}>
                        {cert.createdAtDate ? cert.createdAtDate.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        }) : cert.issue_date || 'Not recorded'}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Certificate ID:</span>
                      <span className={styles.detailValue}><code>{cert.display_id || cert.id}</code></span>
                    </div>
                  </div>

                  <div style={{ margin: '1.25rem 0', textAlign: 'center' }}>
                    <Link
                      href={`/certificate/${encodeURIComponent(cert.id)}`}
                      className={styles.primaryButton}
                      style={{ width: '100%', textDecoration: 'none', boxSizing: 'border-box' }}
                    >
                      {cert.is_revoked ? 'View Revoked Credential Details' : 'View Full Official Certificate'}
                    </Link>
                  </div>

                  <div className={styles.securityNote}>
                    <strong>Registry Notice:</strong> {cert.is_revoked
                      ? 'The issuing authority has revoked this credential. It is not valid as an active SkillBun credential.'
                      : 'This record confirms that the credential is present and has not been marked revoked in the SkillBun registry.'}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
