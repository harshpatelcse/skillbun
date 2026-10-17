'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import { useAdminAccess } from '@/utils/client/adminAuth';
import styles from './admin.module.css';
import AdminDashboard from './AdminDashboard';
import useAdminOverview from './useAdminOverview';

function AuthorizedDashboard({ user, isFounder, role }) {
  const overview = useAdminOverview(user);
  return <AdminDashboard user={user} isFounder={isFounder} role={role} {...overview} />;
}

export default function AdminRootPage() {
  const { user, authLoading } = useAuth();
  const { isAdmin, isFounder, role, checking } = useAdminAccess(user, authLoading);
  const userEmail = (user?.email || '').toLowerCase().trim();

  if (authLoading || checking) {
    return (
      <div className={styles.gateContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ width: 44, height: 44, margin: '0 auto 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <p style={{ fontSize: '1.05rem', fontWeight: '600' }}>Verifying admin authorization...</p>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className={styles.gateContainer}>
        <div className={styles.authGateCard}>
          <div style={{ width: 56, height: 56, margin: '0 auto 1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--text)', marginBottom: '0.75rem' }}>
            SkillBun Command Center
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            This internal operations portal is strictly restricted to authorized platform administrators. Please authenticate with your admin account.
          </p>
          <Link
            href="/auth?next=/dashboard/console/admin"
            style={{
              background: 'var(--green)',
              color: '#000',
              padding: '0.85rem 1.8rem',
              borderRadius: '10px',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Sign In with Google
          </Link>
        </div>
      </div>
    );
  }

  // Signed in, but unauthorized
  if (!isAdmin) {
    return (
      <div className={styles.gateContainer}>
        <div className={styles.authGateCard} style={{ borderColor: '#ef4444' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: '#ef4444', marginBottom: '0.75rem' }}>
            403 — Access Denied
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
            Signed in as <strong>{userEmail}</strong>. You are recognized as a student account and do not have administrative privileges.
          </p>
          <Link
            href="/dashboard"
            style={{
              background: 'var(--surface-raised)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontWeight: '600',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            ← Back to Student Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <AuthorizedDashboard key={user.uid} user={user} isFounder={isFounder} role={role} />;
}
