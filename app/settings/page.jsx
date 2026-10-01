'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import WorkspaceSidebar from '../components/WorkspaceSidebar';
import { validateEmail } from '@/utils/shared/emailValidator';
import styles from './settings.module.css';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isUnsubscribeAction =
    searchParams.get('action') === 'unsubscribe' || searchParams.get('unsubscribe') === '1';
  const queryEmail = (searchParams.get('email') || '').trim();

  const {
    user,
    profile,
    authLoading,
    profileLoading,
    resetPassword,
    resendVerification,
    deleteAccount,
  } = useAuth();

  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Email Unsubscribe state
  const [customUnsubscribeEmail, setCustomUnsubscribeEmail] = useState(null);
  const unsubscribeEmail = isUnsubscribeAction
    ? customUnsubscribeEmail ?? (queryEmail || user?.email || '')
    : user?.email || '';
  const preferenceEmail = unsubscribeEmail.trim().toLowerCase();
  const [emailPreference, setEmailPreference] = useState(null);
  const preferenceRevision = useRef(0);
  const hasPreferenceStatus = emailPreference?.email === preferenceEmail;
  const isUnsubscribed = hasPreferenceStatus && emailPreference.unsubscribed;
  const [unsubStatus, setUnsubStatus] = useState('');
  const [unsubLoading, setUnsubLoading] = useState(false);

  // Handle Unsubscribe Action from Email Footer Link
  useEffect(() => {
    const revision = ++preferenceRevision.current;
    if (!validateEmail(preferenceEmail).isValid) return;
    const controller = new AbortController();
    // Wait for public email edits to settle instead of querying each keystroke.
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/unsubscribe?email=${encodeURIComponent(preferenceEmail)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || typeof data.unsubscribed !== 'boolean') return;
        if (!controller.signal.aborted && revision === preferenceRevision.current) {
          setEmailPreference({ email: preferenceEmail, unsubscribed: data.unsubscribed });
        }
      } catch {}
    }, isUnsubscribeAction ? 400 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      preferenceRevision.current += 1;
    };
  }, [isUnsubscribeAction, preferenceEmail]);

  // Standard authentication gate redirect
  useEffect(() => {
    if (isUnsubscribeAction || deletingAccount) return;

    if (!authLoading && !user) {
      router.replace('/auth?next=/settings');
      return;
    }

    // Account controls must remain reachable when onboarding is incomplete or
    // an interrupted erasure has already removed the student profile.
  }, [authLoading, deletingAccount, isUnsubscribeAction, router, user]);

  const handleUnsubscribeToggle = async (action = 'unsubscribe') => {
    if (unsubLoading) return;
    const emailCheck = validateEmail(unsubscribeEmail);
    if (!emailCheck.isValid) {
      setUnsubStatus(emailCheck.error);
      return;
    }
    const target = emailCheck.normalizedEmail;
    const revision = ++preferenceRevision.current;

    setUnsubLoading(true);
    setUnsubStatus('');

    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target, action }),
      });
      const data = await res.json();
      if (revision !== preferenceRevision.current) return;

      if (res.ok && data.success) {
        setEmailPreference({ email: target, unsubscribed: action === 'unsubscribe' });
        setUnsubStatus(data.message);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('sb_email_unsubscribed', action === 'unsubscribe' ? 'true' : 'false');
          } catch {}
        }
      } else {
        setUnsubStatus(`❌ ${data.error || 'Failed to update preferences.'}`);
      }
    } catch (err) {
      if (revision !== preferenceRevision.current) return;
      setUnsubStatus(`❌ ${err.message || 'Network error updating email preferences.'}`);
    } finally {
      setUnsubLoading(false);
    }
  };

  // If visitor clicked Unsubscribe link from email (public access, no login wall required)
  if (isUnsubscribeAction) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2.5rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--card-shadow)', color: 'var(--text)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
        <h1 style={{ fontFamily: 'var(--font-fredoka), sans-serif', fontSize: '1.8rem', marginTop: 0 }}>
          SkillBun Email Preference Center
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Manage your email notifications and marketing updates for SkillBun.
        </p>

        {unsubStatus && (
          <div style={{ padding: '0.8rem 1rem', borderRadius: '10px', background: 'var(--green-subtle)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: '700', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {unsubStatus}
          </div>
        )}

        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            Email Address:
          </label>
          <input
            type="email"
            value={unsubscribeEmail}
            onChange={(e) => { setCustomUnsubscribeEmail(e.target.value); setUnsubStatus(''); }}
            disabled={unsubLoading}
            placeholder="Enter your registered email..."
            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
          />

          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text)' }}>
            <strong>Status:</strong> {!hasPreferenceStatus ? 'Current preference has not been confirmed.' : isUnsubscribed ? <span style={{ color: '#ef4444', fontWeight: '800' }}>Unsubscribed from Marketing Emails</span> : <span style={{ color: 'var(--green)', fontWeight: '800' }}>Active Subscriber</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {isUnsubscribed ? (
            <button
              onClick={() => handleUnsubscribeToggle('resubscribe')}
              disabled={unsubLoading}
              className="btn-primary"
              style={{ padding: '0.8rem 1.6rem', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
            >
              {unsubLoading ? 'Saving...' : '🔔 Re-Enable Email Notifications'}
            </button>
          ) : (
            <button
              onClick={() => handleUnsubscribeToggle('unsubscribe')}
              disabled={unsubLoading}
              style={{ padding: '0.8rem 1.6rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid #ef4444', fontWeight: '800', cursor: 'pointer' }}
            >
              {unsubLoading ? 'Updating...' : '🔕 Unsubscribe from Marketing Emails'}
            </button>
          )}
          <Link href="/" className="btn-secondary" style={{ padding: '0.8rem 1.6rem', borderRadius: '10px', textDecoration: 'none', fontWeight: '600' }}>
            Return to SkillBun
          </Link>
        </div>
      </div>
    );
  }

  if (authLoading || profileLoading || !profile.hydrated || !user) {
    return (
      <div style={{ opacity: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingTop: '60px', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
        Loading Settings...
      </div>
    );
  }

  const isGoogle = Array.isArray(profile.providers) && profile.providers.includes('google.com');
  const providerLabel = isGoogle ? 'Google Account' : 'Email & Password';

  async function handlePasswordReset() {
    setError('');
    setStatus('');
    setLoading(true);

    try {
      await resetPassword(user.email);
      setStatus('Password reset email sent. Please check your inbox.');
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please wait a bit before trying again.');
      } else {
        setError(err.message || 'Could not send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setError('');
    setStatus('');
    setLoading(true);

    try {
      await resendVerification();
      setStatus('Verification email sent successfully.');
    } catch (err) {
      setError(err.message || 'Could not send verification email.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    setError('');
    setStatus('Deleting your account. Please keep this page open while we confirm completion.');
    setLoading(true);
    setDeletingAccount(true);
    setShowDeleteModal(false);

    try {
      const result = await deleteAccount();
      if (result?.warning) window.alert(result.warning);
      router.replace('/');
    } catch (err) {
      setStatus('');
      if (err.code === 'auth/requires-recent-login') {
        setError('Security check: Please log out and log back in, then immediately delete your account.');
      } else {
        setError(err.message || 'Could not delete your account. Please try again.');
      }
      setLoading(false);
      setDeletingAccount(false);
    }
  }

  return (
    <div className={styles.settingsPage}>
      <WorkspaceSidebar />
      <main className={styles.settingsContainer}>
        <div className={styles.settingsHeader}>
          <h1 className={styles.title}>Account Settings</h1>
          <p className={styles.subtitle}>Manage your login methods, email preferences, and security.</p>
        </div>

        {status && <div className={styles.statusBanner} role="status">{status}</div>}
        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        {/* SECTION 1: Account Information */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Account Overview</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.label}>Full Name</span>
              <span className={styles.value}>{profile.name || user.displayName || 'Not Set'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Email Address</span>
              <span className={styles.value}>
                {user.email}
                {user.emailVerified ? (
                  <span className={styles.badgeSuccess}>Verified</span>
                ) : (
                  <span className={styles.badgeWarning}>Unverified</span>
                )}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Sign-in Method</span>
              <span className={styles.value}>{providerLabel}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Degree / Program</span>
              <span className={styles.value}>{profile.degree || 'Not Set'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Current Year</span>
              <span className={styles.value}>{profile.year || 'Not Set'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Area of Interest</span>
              <span className={styles.value}>{profile.interest || 'Not Specified'}</span>
            </div>
          </div>

          <div className={styles.actionRow} style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href="/onboarding?next=/settings&edit=1"
              className={styles.btnSecondary}
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
              Edit Profile Details
            </Link>

            {!user.emailVerified && !isGoogle && (
              <button
                onClick={handleResendVerification}
                disabled={loading}
                className={styles.btnSecondary}
              >
                {loading ? 'Sending...' : 'Resend Email Verification'}
              </button>
            )}
          </div>
        </section>

        {/* SECTION 2: Email Notification Preferences */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>📧 Email Notification Preferences</h2>
          <p className={styles.cardSubtitle} style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Control whether you receive career roadmap nudges, cert updates, and learning reminders.
          </p>

          {unsubStatus && (
            <div style={{ padding: '0.6rem 1rem', borderRadius: '8px', background: 'var(--green-subtle)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: '700', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {unsubStatus}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-raised)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div>
              <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text)' }}>
                Marketing & Retention Emails
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                Roadmap streak reminders, exam readiness nudges, and new track releases.
              </span>
            </div>

            <button
              type="button"
              disabled={unsubLoading}
              onClick={() => handleUnsubscribeToggle(isUnsubscribed ? 'resubscribe' : 'unsubscribe')}
              style={{
                cursor: 'pointer',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                background: isUnsubscribed ? 'var(--green-subtle)' : 'rgba(239,68,68,0.12)',
                color: isUnsubscribed ? 'var(--green)' : '#ef4444',
                border: `1px solid ${isUnsubscribed ? 'var(--green)' : '#ef4444'}`,
                fontWeight: '700',
                fontSize: '0.82rem',
              }}
            >
              {unsubLoading ? 'Updating...' : isUnsubscribed ? '🔔 Enable Emails' : '🔕 Unsubscribe'}
            </button>
          </div>
        </section>

        {/* SECTION 3: Password & Security */}
        {!isGoogle && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Password & Security</h2>
            <p className={styles.cardSubtitle}>
              Request a secure password reset link sent directly to <strong>{user.email}</strong>.
            </p>
            <div className={styles.actionRow}>
              <button
                onClick={handlePasswordReset}
                disabled={loading}
                className={styles.btnSecondary}
              >
                {loading ? 'Sending...' : 'Send Password Reset Email'}
              </button>
            </div>
          </section>
        )}

        {/* SECTION 4: Danger Zone */}
        <section className={`${styles.card} ${styles.dangerZone}`}>
          <h2 className={styles.cardTitleDanger}>Danger Zone</h2>
          <p className={styles.cardSubtitle}>
            Permanently delete your login account, profile, roadmap progress, quiz/exam history, and roadmap certificates. Workforce credentials and legal records are retained.
          </p>
          <div className={styles.actionRow}>
            <button
              onClick={() => setShowDeleteModal(true)}
              className={styles.btnDanger}
              disabled={loading}
            >
              {deletingAccount ? 'Deleting Account...' : 'Delete My Account'}
            </button>
          </div>
        </section>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
              <h3 className={styles.modalTitle}>Delete Account?</h3>
              <p className={styles.modalText}>
                Are you sure you want to permanently delete your account (<strong>{user.email}</strong>)? Your profile, roadmap progress, quiz/exam history, and roadmap certificates will be erased. Workforce credentials, employment records, and legal documents will be retained. This cannot be undone.
              </p>
              <div className={styles.modalActions}>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className={styles.btnSecondary}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className={styles.btnDanger}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Yes, Delete Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ opacity: 1, display: 'flex', minHeight: '100vh', paddingTop: '60px', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
        Loading Settings...
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
