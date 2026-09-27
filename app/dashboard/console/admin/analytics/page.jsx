'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import { useAdminAccess } from '@/utils/client/adminAuth';
import { getFirebaseServices } from '@/utils/client/firebaseClient';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { recommendEmail as getRecommendedTemplate, emailCategory } from '@/utils/shared/emailRecommendation';
import BulkRetentionCampaign from './BulkRetentionCampaign';
import EmailDraftLibrary from '../emails/EmailDraftLibrary';
import { RETENTION_TEMPLATES } from '@/utils/server/retentionEmails';
import { subscribeDataSync, notifyDataMutated } from '@/utils/client/dataSyncManager';

function formatDateTime(isoString) {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'N/A';
  }
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
    case 'lock':
      return (
        <svg {...common}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'crown':
      return (
        <svg {...common}>
          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'certificate':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'chevron-up':
      return (
        <svg {...common}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common}>
          <polyline points="6 9 12 15 18 9" />
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
    case 'alert':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'bellOff':
      return (
        <svg {...common}>
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
          <path d="M18 8a6 6 0 0 0-9.33-5" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    case 'fileText':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    case 'flask':
      return (
        <svg {...common}>
          <path d="M10 2v7.31L4.69 19.3A2 2 0 0 0 6.44 22h11.12a2 2 0 0 0 1.75-2.7L14 9.31V2" />
          <line x1="8.5" y1="2" x2="15.5" y2="2" />
          <line x1="8" y1="14" x2="16" y2="14" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AnalyticsDashboardPage() {
  const { user, authLoading } = useAuth();
  const { isAdmin, isFounder, role, checking } = useAdminAccess(user, authLoading);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'certs' || tabParam === 'certificates') {
        return 'certificates';
      }
    }
    return 'users';
  });
  const [expandedUserUid, setExpandedUserUid] = useState(null);
  const [deletingUid, setDeletingUid] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [previewModalContent, setPreviewModalContent] = useState(null);

  // Retention email template selection state per user
  const [selectedTemplates, setSelectedTemplates] = useState({});
  const [preparedTemplates, setPreparedTemplates] = useState({});
  const [sendingEmailKey, setSendingEmailKey] = useState(null);
  const [resettingSentCounters, setResettingSentCounters] = useState(false);

  const userEmail = (user?.email || '').trim().toLowerCase();

  useEffect(() => {
    if (authLoading || checking) return;
    if (!user || !isAdmin) return;

    let active = true;

    async function fetchAnalyticsData() {
      try {
        setLoading(true);
        let token = '';
        if (user?.getIdToken) {
          try {
            token = await user.getIdToken();
          } catch {}
        }

        const res = await fetch('/api/admin/analytics', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const resData = await res.json().catch(() => ({}));

        let users = Array.isArray(resData.users) ? resData.users : [];
        let certificates = Array.isArray(resData.certificates) ? resData.certificates : [];

        // Resilient client-side Firestore fallback if server Admin API returned empty or credential missing
        if ((!res.ok || (users.length === 0 && certificates.length === 0)) && active) {
          try {
            const { db } = getFirebaseServices();
            if (db) {
              const certsSnap = await getDocs(collection(db, 'certificates'));
              certificates = certsSnap.docs.map((d) => {
                const cData = d.data();
                return {
                  id: d.id,
                  certId: d.id,
                  uid: cData.uid || '',
                  name: cData.name || cData.studentName || cData.userName || 'Student',
                  email: cData.email || cData.userEmail || '',
                  roadmapTitle: cData.roadmapTitle || cData.roadmapSlug || 'Roadmap',
                  roadmapSlug: cData.roadmapSlug || '',
                  score: typeof cData.score === 'number' ? cData.score : 0,
                  cert_type: cData.cert_type || 'ROADMAP',
                  is_revoked: cData.is_revoked || false,
                  createdAt: cData.createdAt ? new Date(cData.createdAt.toDate?.() || cData.createdAt).toISOString() : null,
                };
              });

              const usersSnap = await getDocs(collection(db, 'users'));
              users = usersSnap.docs.map((d) => {
                const uData = d.data();
                const uid = d.id;
                const uCerts = certificates.filter(
                  (c) => c.uid === uid || (c.email && uData.email && c.email.toLowerCase() === uData.email.toLowerCase())
                );
                return {
                  uid,
                  ...uData,
                  certificates: uCerts,
                  progress: [],
                  quizAttempts: [],
                  sentEmailHistory: Array.isArray(uData.sentEmailHistory) ? uData.sentEmailHistory : [],
                  isUnsubscribed: false,
                };
              });
            }
          } catch (clientFallbackErr) {
            console.warn('[Analytics Client Fallback Warning]:', clientFallbackErr);
          }
        }

        if (active && (users.length > 0 || certificates.length > 0 || res.ok)) {
          setData({
            stats: {
              totalStudents: users.length,
              totalCertificates: certificates.length,
              totalRoadmaps: resData.stats?.totalRoadmaps || 100,
              quizQuestionBank: resData.stats?.quizQuestionBank || 3335,
            },
            users,
            certificates,
          });
        } else if (!res.ok) {
          throw new Error(resData.error || `Server responded with status ${res.status}`);
        }
      } catch (err) {
        console.error('Analytics load error:', err);
        if (active) {
          setStatusMessage({
            type: 'error',
            text: `Failed to load analytics: ${err.message}`,
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAnalyticsData();

    const unsubscribeSync = subscribeDataSync((evt) => {
      if (active && (evt.tag === 'admin:analytics' || evt.tag === 'admin:certs' || evt.type === 'DATA_MUTATED')) {
        fetchAnalyticsData();
      }
    });

    return () => {
      active = false;
      unsubscribeSync();
    };
  }, [user, isAdmin, authLoading, checking]);

  // CSV Export functionality
  const handleExportCSV = () => {
    const usersList = data?.users || [];
    if (usersList.length === 0) {
      alert('No user data available to export.');
      return;
    }

    const headers = ['UID', 'Name', 'Email', 'Subscribed Status', 'Unsubscribed Date', 'Degree', 'Year', 'Target Interest', 'Roadmaps Count', 'Exam Attempts Count', 'Certificates Count', 'Emails Sent Count', 'Joined Date', 'Last Login Time'];
    const rows = usersList.map((u) => [
      `"${u.uid}"`,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      `"${u.isUnsubscribed ? 'Unsubscribed' : 'Subscribed'}"`,
      `"${formatDateTime(u.unsubscribedAt)}"`,
      `"${(u.degree || '').replace(/"/g, '""')}"`,
      `"${(u.year || '').replace(/"/g, '""')}"`,
      `"${(u.interest || '').replace(/"/g, '""')}"`,
      u.progress?.length || 0,
      u.quizAttempts?.length || 0,
      u.certificates?.length || 0,
      u.sentEmailHistory?.length || 0,
      `"${formatDateTime(u.createdAt)}"`,
      `"${formatDateTime(u.lastSignInTime)}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SkillBun_Student_Database_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete User Handler
  const handleDeleteUser = async (targetUser) => {
    const confirmMsg = `DELETE USER CONFIRMATION\n\nAre you sure you want to permanently delete student "${targetUser.name}" (${targetUser.email})?\n\nThis will permanently delete their profile, active roadmap progress, and Auth account. The email "${targetUser.email}" will be freed up for a brand new account signup.\n\nProceed with deletion?`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingUid(targetUser.uid);
    setStatusMessage(null);

    try {
      let idToken = '';
      if (user?.getIdToken) {
        try {
          idToken = await user.getIdToken();
        } catch {}
      }

      try {
        const res = await fetch(`/api/admin/users/${targetUser.uid}?adminEmail=${encodeURIComponent(userEmail)}&email=${encodeURIComponent(targetUser.email || '')}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        });

        if (!res.ok) {
          console.warn(`[Admin User Delete API non-200: ${res.status}], attempting direct client Firestore delete`);
        }
      } catch (apiErr) {
        console.warn('[Admin User Delete API Exception], attempting direct client Firestore delete:', apiErr);
      }

      // Always execute client Firestore delete for guaranteed consistency
      try {
        const { db } = getFirebaseServices();
        if (db) {
          await deleteDoc(doc(db, 'users', targetUser.uid));
        }
      } catch (clientDelErr) {
        console.warn('[Client Delete Fallback Warning]:', clientDelErr);
      }

      setData((prev) => {
        if (!prev) return prev;
        const updatedUsers = (prev.users || []).filter((u) => u.uid !== targetUser.uid);
        return {
          ...prev,
          stats: {
            ...prev.stats,
            totalStudents: updatedUsers.length,
          },
          users: updatedUsers,
        };
      });

      if (expandedUserUid === targetUser.uid) {
        setExpandedUserUid(null);
      }

      setStatusMessage({
        type: 'success',
        text: `Student account "${targetUser.name}" (${targetUser.email}) successfully deleted! Email is now freed up for new registration.`,
      });
      notifyDataMutated('admin:analytics', { deletedUid: targetUser.uid });
    } catch (err) {
      console.error('User deletion error:', err);
      setStatusMessage({ type: 'error', text: `Failed to delete user: ${err.message}` });
    } finally {
      setDeletingUid(null);
    }
  };

  // Reset All Sent Email Counters Handler
  const handleResetAllSentCounters = async () => {
    const confirmMsg = `RESET ALL SENT EMAIL COUNTERS\n\nAre you sure you want to reset the sent email counter for ALL registered students?\n\nThis will clear all previous sent email tracking records in Firestore across all student accounts so every student resets to 0 Sent. Proceed?`;
    if (!window.confirm(confirmMsg)) return;

    setResettingSentCounters(true);
    setStatusMessage(null);

    try {
      let token = '';
      if (user?.getIdToken) {
        token = await user.getIdToken();
      }

      const res = await fetch('/api/admin/emails/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ resetAll: true }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok || resData.error) {
        throw new Error(resData.error || `HTTP ${res.status}`);
      }

      setData((prev) => {
        if (!prev) return prev;
        const updatedUsers = (prev.users || []).map((u) => ({
          ...u,
          sentEmailHistory: [],
        }));
        return { ...prev, users: updatedUsers };
      });

      setStatusMessage({
        type: 'success',
        text: resData.message || 'Sent email counters successfully reset to 0 for all students!',
      });
      notifyDataMutated('admin:analytics', { action: 'RESET_COUNTERS' });
    } catch (err) {
      console.error('Reset all sent email counters error:', err);
      setStatusMessage({
        type: 'error',
        text: `Failed to reset sent email counters: ${err.message}`,
      });
    } finally {
      setResettingSentCounters(false);
    }
  };

  // Reset Single Student Sent Email Counter Handler
  const handleResetUserSentCounter = async (targetUser) => {
    const confirmMsg = `RESET STUDENT EMAIL COUNTER\n\nReset sent email counter to 0 for "${targetUser.name}" (${targetUser.email})?`;
    if (!window.confirm(confirmMsg)) return;

    setStatusMessage(null);

    try {
      let token = '';
      if (user?.getIdToken) {
        token = await user.getIdToken();
      }

      const res = await fetch('/api/admin/emails/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ resetAll: false, targetEmail: targetUser.email, targetUid: targetUser.uid }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok || resData.error) {
        throw new Error(resData.error || `HTTP ${res.status}`);
      }

      setData((prev) => {
        if (!prev) return prev;
        const updatedUsers = (prev.users || []).map((u) => {
          if (u.uid === targetUser.uid) {
            return { ...u, sentEmailHistory: [] };
          }
          return u;
        });
        return { ...prev, users: updatedUsers };
      });

      setStatusMessage({
        type: 'success',
        text: resData.message || `Sent email counter reset to 0 for ${targetUser.email}!`,
      });
    } catch (err) {
      console.error('Reset student email counter error:', err);
      setStatusMessage({
        type: 'error',
        text: `Failed to reset sent email counter: ${err.message}`,
      });
    }
  };

  // Preparing a recommendation reuses an unseen saved draft, or generates and saves one when needed.
  const prepareRecommendation = async (targetUser, draftId, action = 'prepare') => {
    setSendingEmailKey(targetUser.uid + (action === 'generate' ? '-ai-generate' : '-preview-modal'));
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/emails/drafts', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: targetUser.uid, action, ...(draftId ? { draftId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSelectedTemplates(prev => ({ ...prev, [targetUser.uid]: result.templateId }));
      setPreparedTemplates(prev => ({ ...prev, [targetUser.uid]: { id: result.templateId, name: result.draft?.content.name || result.recommendation.label } }));
      setPreviewModalContent({ ...result.preview, templateId: result.templateId, to: targetUser.email, studentName: targetUser.name });
    } catch (error) { setStatusMessage({ type: 'error', text: error.message }); }
    finally { setSendingEmailKey(null); }
  };
  const handlePreviewEmail = async targetUser => {
    if (sendingEmailKey === 'bulk') return;
    const selected = selectedTemplates[targetUser.uid];
    if (!selected || selected.startsWith('ai_')) return prepareRecommendation(targetUser, selected);
    setSendingEmailKey(targetUser.uid + '-preview-modal');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/emails/send', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: selected, recipientEmail: targetUser.email, recommendationUid: targetUser.uid, isPreview: true }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error);
      setPreviewModalContent(result.preview);
    } catch (error) { setStatusMessage({ type: 'error', text: error.message }); }
    finally { setSendingEmailKey(null); }
  };

  // Retention Email Dispatcher Handler (Sample Send to Admin or Live Send to Student)
  const handleSendRetentionEmail = async (targetUser, isSampleTest = false, forceOverride = false) => {
    if (sendingEmailKey === 'bulk') return;
    const recommended = getRecommendedTemplate(targetUser);
    const templateId = selectedTemplates[targetUser.uid] || recommended.id;
    if (!recommended.eligible) { setStatusMessage({ type: 'error', text: recommended.reason }); return; }
    if (!templateId) { await prepareRecommendation(targetUser); return; }
    const actionKey = `${targetUser.uid}-${isSampleTest ? 'sample' : forceOverride ? 'force' : 'send'}`;

    let confirmPrompt = '';
    if (isSampleTest) {
      confirmPrompt = `SEND SAMPLE TEST CONFIRMATION\n\nSend a real test email copy of "${templateId.toUpperCase()}" to harsh@skillbun.tech via Zoho SMTP for inbox inspection?`;
    } else if (forceOverride) {
      confirmPrompt = `FORCE SEND (OVERRIDE UNSUBSCRIBE) CONFIRMATION\n\nCandidate "${targetUser.name}" (${targetUser.email}) has UNSUBSCRIBED from marketing updates.\n\nAre you sure you want to FORCE DISPATCH template "${templateId.toUpperCase()}" anyway?`;
    } else {
      confirmPrompt = `LIVE CANDIDATE DISPATCH CONFIRMATION\n\nSend live retention email to candidate "${targetUser.name}" (${targetUser.email}) using template "${templateId.toUpperCase()}"?\n\nCandidate Auto-Filled Data:\n• Name: ${targetUser.name}\n• Email: ${targetUser.email}\n• Degree: ${targetUser.degree}`;
    }

    if (!window.confirm(confirmPrompt)) return;

    setSendingEmailKey(actionKey);
    setStatusMessage(null);

    try {
      let idToken = '';
      if (user?.getIdToken) {
        try {
          idToken = await user.getIdToken();
        } catch {}
      }

      const roadmapTitle =
        targetUser.progress?.[0]?.slug
          ? targetUser.progress[0].slug.replace(/_/g, ' ').toUpperCase()
          : targetUser.interest && targetUser.interest !== 'N/A'
          ? targetUser.interest
          : '';

      const progressCount = targetUser.progress?.[0]?.completedNodeIds?.length ?? null;

      const res = await fetch('/api/admin/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          recipientEmail: isSampleTest ? 'harsh@skillbun.tech' : targetUser.email,
          studentName: targetUser.name,
          templateId,
          recommendationUid: targetUser.uid,
          isTest: isSampleTest,
          roadmapTitle,
          progressCount,
          roadmapSlug: targetUser.progress?.[0]?.slug,
          completedNodeIds: targetUser.progress?.[0]?.completedNodeIds,
          degree: targetUser.degree,
          isPreview: false,
          forceOverride,
          adminEmail: userEmail,
        }),
      });

      let resData = null;
      let rawText = '';
      try {
        rawText = await res.text();
        resData = JSON.parse(rawText);
      } catch {
        resData = null;
      }

      if (!res.ok || !resData?.success) {
        let extractedError = resData?.error || resData?.message;
        let diagnosticDetails = resData?.stack || resData?.details || (resData ? JSON.stringify(resData, null, 2) : rawText);
        if (!extractedError) {
          if (rawText) {
            extractedError = `HTTP ${res.status}: ${rawText.slice(0, 300)}`;
          } else {
            extractedError = `HTTP ${res.status} (${res.statusText || 'Server Error'})`;
          }
        }
        const err = new Error(extractedError);
        err.diagnosticDetails = diagnosticDetails;
        throw err;
      }

      if (!isSampleTest) {
        setData((prev) => {
          if (!prev) return prev;
          const updatedUsers = (prev.users || []).map((u) => {
            if (u.uid === targetUser.uid) {
              const currentHistory = Array.isArray(u.sentEmailHistory) ? u.sentEmailHistory : [];
              const updatedHistory = [...currentHistory, { templateId, category: recommended.category, roadmapSlug: recommended.roadmapSlug, eventKey: recommended.eventKey, sentAt: new Date().toISOString(), adminEmail: userEmail, forceOverride }];
              return { ...u, sentEmailHistory: updatedHistory };
            }
            return u;
          });
          return { ...prev, users: updatedUsers };
        });

        setSelectedTemplates((prev) => {
          const copy = { ...prev };
          delete copy[targetUser.uid];
          return copy;
        });
      }

      setStatusMessage({
        type: 'success',
        text: resData.message || (isSampleTest ? 'Sample test email sent to harsh@skillbun.tech!' : `Retention email sent to ${targetUser.email}!`),
      });
    } catch (emailErr) {
      console.error('Retention email send error:', emailErr);
      setStatusMessage({
        type: 'error',
        text: `Failed to send retention email: ${emailErr.message}`,
        details: emailErr.diagnosticDetails || emailErr.stack || String(emailErr),
      });
    } finally {
      setSendingEmailKey(null);
    }
  };

  const handleBulkEmailSent = ({ uid, ...dispatch }) => {
    const log = {
      ...dispatch,
      adminEmail: dispatch.adminEmail || userEmail,
      forceOverride: Boolean(dispatch.forceOverride),
    };
    setData(previous => {
      if (!previous) return previous;
      const users = (previous.users || []).map(student => {
        if (student.uid !== uid) return student;
        const history = Array.isArray(student.sentEmailHistory) ? student.sentEmailHistory : [];
        if (log.dispatchId && history.some(entry => entry && typeof entry === 'object' && entry.dispatchId === log.dispatchId)) return student;
        return {
          ...student,
          sentEmailHistory: [...history, log],
        };
      });
      return { ...previous, users };
    });
  };

  if (authLoading || checking) {
    return (
      <div style={{ maxWidth: '800px', margin: '4rem auto', textAlign: 'center', color: 'var(--text)' }}>
        <p style={{ fontSize: '1.2rem', color: 'var(--muted)' }}>Verifying admin privileges...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2.5rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--card-shadow)', color: 'var(--text)' }}>
        <div style={{ marginBottom: '1rem', color: 'var(--green)' }}><Icon name="lock" size={44} /></div>
        <h1 style={{ fontFamily: 'var(--font-fredoka), sans-serif', fontSize: '1.8rem', marginTop: 0 }}>
          Admin Authentication Required
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          This section is restricted to authorized platform administrators. Please sign in with your admin account.
        </p>
        <Link href="/auth?next=/dashboard/console/admin/analytics" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.8rem 1.6rem', borderRadius: '10px', textDecoration: 'none', fontWeight: '700' }}>
          <Icon name="globe" size={16} /> Sign in with Google
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2.5rem', background: 'var(--card-bg)', border: '1px solid #ef4444', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--card-shadow)', color: 'var(--text)' }}>
        <div style={{ marginBottom: '1rem', color: '#ef4444' }}><Icon name="alert" size={44} /></div>
        <h1 style={{ fontFamily: 'var(--font-fredoka), sans-serif', fontSize: '1.8rem', marginTop: 0, color: '#ef4444' }}>
          403 — Access Denied
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Signed in as <strong>{userEmail}</strong>. This account does not possess administrator permissions for SkillBun.
        </p>
        <Link href="/dashboard" className="btn-primary" style={{ display: 'inline-block', padding: '0.8rem 1.6rem', borderRadius: '10px', textDecoration: 'none', fontWeight: '700' }}>
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  const usersList = data?.users || [];
  const certsList = data?.certificates || [];

  const stats = data?.stats || {
    totalStudents: usersList.length,
    totalCertificates: certsList.length,
    totalRoadmaps: 100,
    quizQuestionBank: 3335,
  };

  const searchLower = searchTerm.trim().toLowerCase();

  const filteredUsers = usersList.filter((u) => {
    if (!searchLower) return true;
    return (
      (u.name || '').toLowerCase().includes(searchLower) ||
      (u.email || '').toLowerCase().includes(searchLower) ||
      (u.degree || '').toLowerCase().includes(searchLower) ||
      (u.interest || '').toLowerCase().includes(searchLower) ||
      (u.uid || '').toLowerCase().includes(searchLower)
    );
  });

  const filteredCerts = certsList.filter((c) => {
    if (!searchLower) return true;
    return (
      (c.name || '').toLowerCase().includes(searchLower) ||
      (c.email || '').toLowerCase().includes(searchLower) ||
      (c.roadmapTitle || '').toLowerCase().includes(searchLower) ||
      (c.id || '').toLowerCase().includes(searchLower)
    );
  });

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem', minHeight: '85vh', color: 'var(--text)' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--green-subtle)', color: 'var(--green)', padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 10px var(--green)' }}></span>
            {isFounder ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name="crown" size={14} /> Founder Master Admin • Real Platform Telemetry
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name="shield" size={14} /> {role?.toUpperCase() || 'ADMIN'} • Real Platform Telemetry
              </span>
            )}
          </div>
          <h1 style={{ fontFamily: 'var(--font-fredoka), sans-serif', fontSize: '2.2rem', margin: '0 0 0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            SkillBun Admin Database & Analytics
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Real-time access to registered student profiles, last login timestamps, exam attempts, and certificates.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportCSV}
            style={{
              cursor: 'pointer',
              padding: '0.6rem 1.2rem',
              borderRadius: '10px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--green)',
              color: 'var(--green)',
              fontWeight: '700',
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Icon name="download" size={16} /> Export Database (CSV)
          </button>
          <button
            type="button"
            onClick={handleResetAllSentCounters}
            disabled={resettingSentCounters}
            title="Reset sent email counter to 0 for all registered students"
            style={{
              cursor: resettingSentCounters ? 'not-allowed' : 'pointer',
              padding: '0.6rem 1.2rem',
              borderRadius: '10px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontWeight: '700',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: resettingSentCounters ? 0.6 : 1,
            }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7" /></svg>
            {resettingSentCounters ? 'Resetting...' : 'Reset Sent Counters'}
          </button>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/dashboard/console/admin" style={{ textDecoration: 'none', padding: '0.6rem 1.2rem', borderRadius: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: '600', fontSize: '0.88rem' }}>
              ← Admin Hub
            </Link>
            <Link href="/dashboard/console/admin/workforce" style={{ textDecoration: 'none', padding: '0.6rem 1.2rem', borderRadius: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: '600', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Icon name="users" size={15} /> Workforce Hub
            </Link>
          </div>
          <Link href="/dashboard" style={{ textDecoration: 'none', padding: '0.6rem 1.2rem', borderRadius: '10px', background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--muted)', fontWeight: '600', fontSize: '0.88rem' }}>
            ← Student Dashboard
          </Link>
        </div>
      </div>

      {/* Notification Toast with Diagnostic Console */}
      {statusMessage && (
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          marginBottom: '1.5rem',
          background: statusMessage.type === 'success' ? 'var(--green-subtle)' : 'rgba(239, 68, 68, 0.15)',
          color: statusMessage.type === 'success' ? 'var(--green)' : '#ef4444',
          border: `1px solid ${statusMessage.type === 'success' ? 'var(--green)' : '#ef4444'}`,
          fontWeight: '700',
          fontSize: '0.9rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <Icon name={statusMessage.type === 'success' ? 'check' : 'alert'} size={18} />
              {statusMessage.text}
            </span>
            <button
              onClick={() => setStatusMessage(null)}
              aria-label="Dismiss notification"
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '0.2rem' }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          {statusMessage.details && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Icon name="search" size={14} /> Full Diagnostic Server Payload:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(statusMessage.details);
                    alert('Diagnostic payload copied to clipboard.');
                  }}
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid currentColor',
                    color: 'inherit',
                    borderRadius: '4px',
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <Icon name="copy" size={13} /> Copy Diagnostic Error
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '0.75rem',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.4)',
                color: 'var(--text)',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '220px',
                overflowY: 'auto',
                fontWeight: '400',
              }}>
                {statusMessage.details}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Instant Email HTML Preview Modal */}
      {previewModalContent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1.25rem' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.5px' }}>
                  Live Email Template Preview ({previewModalContent.templateId})
                </span>
                <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.1rem', color: 'var(--text)' }}>
                  Subject: {previewModalContent.subject}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                  Candidate: <strong>{previewModalContent.studentName || 'Student'}</strong> ({previewModalContent.to})
                </div>
              </div>
              <button
                onClick={() => setPreviewModalContent(null)}
                aria-label="Close preview modal"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'var(--text)', display: 'inline-flex', alignItems: 'center' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div
              style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, background: '#05070a' }}
              dangerouslySetInnerHTML={{ __html: previewModalContent.html }}
            />
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setPreviewModalContent(null)}
                style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '0.55rem 1.4rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.88rem', cursor: 'pointer' }}
              >
                Done Previewing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registered Students</div>
          <div style={{ fontSize: '2.4rem', fontWeight: '800', fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--green)', marginTop: '0.2rem' }}>
            {loading ? '...' : stats.totalStudents}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issued Certificates</div>
          <div style={{ fontSize: '2.4rem', fontWeight: '800', fontFamily: 'var(--font-fredoka), sans-serif', color: '#a855f7', marginTop: '0.2rem' }}>
            {loading ? '...' : stats.totalCertificates}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tech Roadmaps</div>
          <div style={{ fontSize: '2.4rem', fontWeight: '800', fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--text)', marginTop: '0.2rem' }}>
            {stats.totalRoadmaps}
          </div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Question Bank</div>
          <div style={{ fontSize: '2.4rem', fontWeight: '800', fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--text)', marginTop: '0.2rem' }}>
            {stats.quizQuestionBank}+
          </div>
        </div>
      </div>

      {/* Main Database & Registry Section */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem', boxShadow: 'var(--card-shadow)' }}>
        {/* Navigation Tabs & Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('users')}
              style={{
                cursor: 'pointer',
                padding: '0.6rem 1.2rem',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'users' ? 'var(--green)' : 'transparent',
                color: activeTab === 'users' ? '#000' : 'var(--muted)',
                fontWeight: '700',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Icon name="users" size={16} /> Registered Students ({usersList.length})
            </button>

            <button
              onClick={() => setActiveTab('certificates')}
              style={{
                cursor: 'pointer',
                padding: '0.6rem 1.2rem',
                borderRadius: '10px',
                border: 'none',
                background: activeTab === 'certificates' ? 'var(--green)' : 'transparent',
                color: activeTab === 'certificates' ? '#000' : 'var(--muted)',
                fontWeight: '700',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Icon name="certificate" size={16} /> Issued Certificates ({certsList.length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="Search name, email, degree, interest, cert ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-raised)',
                color: 'var(--text)',
                fontSize: '0.85rem',
                outline: 'none',
                minWidth: '280px',
              }}
            />
            <Link
              href="/certificate"
              style={{
                textDecoration: 'none',
                padding: '0.55rem 1rem',
                borderRadius: '10px',
                background: 'var(--green-subtle)',
                border: '1px solid var(--green)',
                color: 'var(--green)',
                fontWeight: '700',
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Icon name="globe" size={15} /> Public Cert Verification
            </Link>
          </div>
        </div>

        {/* TAB 1: Registered Students Table */}
        {activeTab === 'users' && (
          <div>
            <BulkRetentionCampaign
              students={usersList}
              user={user}
              loading={loading}
              blocked={Boolean(sendingEmailKey && sendingEmailKey !== 'bulk')}
              onEmailSent={handleBulkEmailSent}
              onBusyChange={isBusy => setSendingEmailKey(current => isBusy ? 'bulk' : current === 'bulk' ? null : current)}
            />
            <EmailDraftLibrary user={user} defaultOpen />
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                <p>Loading real student records from database...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ marginBottom: '0.5rem', color: 'var(--muted)' }}><Icon name="folder" size={40} /></div>
                {searchTerm ? (
                  <p style={{ margin: 0 }}>No student records match "{searchTerm}".</p>
                ) : (
                  <p style={{ margin: 0 }}>No student accounts registered in database yet. New signups will automatically appear here in real-time.</p>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Student / Email</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Email Status</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Degree & Year</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Target Interest</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Last Active / Login</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Roadmaps / Exams</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Sent Emails</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', minWidth: '200px' }}>Actions & Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isExpanded = expandedUserUid === u.uid;
                      const isDeleting = deletingUid === u.uid;

                      const recommended = getRecommendedTemplate(u);
                      const currentTemplate = selectedTemplates[u.uid] || recommended.id || '';
                      const savedChoice = preparedTemplates[u.uid];
                      const isPreviewModalLoading = sendingEmailKey === `${u.uid}-preview-modal` || sendingEmailKey === `${u.uid}-ai-generate`;
                      const isAiGenerating = sendingEmailKey === `${u.uid}-ai-generate`;
                      const isSampleLoading = sendingEmailKey === `${u.uid}-sample`;
                      const isSendLoading = sendingEmailKey === `${u.uid}-send`;
                      const isForceLoading = sendingEmailKey === `${u.uid}-force`;
                      const sentLogs = Array.isArray(u.sentEmailHistory) ? u.sentEmailHistory : [];

                      return (
                        <React.Fragment key={u.uid}>
                          {/* Standard User Row */}
                          <tr
                            style={{
                              borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                              background: isExpanded ? 'var(--surface-raised)' : 'transparent',
                              transition: 'background 0.2s ease',
                            }}
                          >
                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              <div style={{ fontWeight: '700', color: 'var(--text)' }}>{u.name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', wordBreak: 'break-word' }}>{u.email}</div>
                            </td>

                            {/* Email Subscription Status Badge */}
                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              {u.isUnsubscribed ? (
                                <span
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#ef4444',
                                    border: '1px solid #ef4444',
                                    padding: '0.25rem 0.65rem',
                                    borderRadius: '12px',
                                    fontWeight: '800',
                                    fontSize: '0.78rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    whiteSpace: 'nowrap',
                                    lineHeight: '1.2',
                                  }}
                                  title={u.unsubscribedAt ? `Unsubscribed on ${formatDateTime(u.unsubscribedAt)}` : 'Unsubscribed'}
                                >
                                  <Icon name="bellOff" size={13} /> Unsubscribed
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: 'var(--green-subtle)',
                                    color: 'var(--green)',
                                    border: '1px solid var(--green)',
                                    padding: '0.25rem 0.65rem',
                                    borderRadius: '12px',
                                    fontWeight: '800',
                                    fontSize: '0.78rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    whiteSpace: 'nowrap',
                                    lineHeight: '1.2',
                                  }}
                                >
                                  <Icon name="bell" size={13} /> Subscribed
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text)' }}>
                              <span style={{ fontWeight: '600' }}>{u.degree}</span>
                              {u.year && u.year !== 'N/A' && <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block' }}>Year {u.year}</span>}
                            </td>

                            <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text)' }}>
                              <span style={{ background: 'var(--surface-raised)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', display: 'inline-block' }}>
                                {u.interest}
                              </span>
                            </td>

                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              <div style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Icon name="clock" size={13} /> {formatDateTime(u.lastSignInTime)}
                              </div>
                            </td>

                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                                {u.progress?.length || 0} roadmaps
                              </div>
                              {u.quizAttempts?.length > 0 && (
                                <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: '800', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
                                  <Icon name="fileText" size={12} /> {u.quizAttempts.length} Exam Attempts
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              <span
                                style={{
                                  background: sentLogs.length > 0 ? 'var(--green-subtle)' : 'var(--surface-raised)',
                                  color: sentLogs.length > 0 ? 'var(--green)' : 'var(--muted)',
                                  border: `1px solid ${sentLogs.length > 0 ? 'var(--green)' : 'var(--border)'}`,
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '12px',
                                  fontWeight: '800',
                                  fontSize: '0.78rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  whiteSpace: 'nowrap',
                                  lineHeight: '1.2',
                                }}
                              >
                                <Icon name="mail" size={13} /> {sentLogs.length} Sent
                              </span>
                            </td>

                            {/* Action Buttons */}
                            <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedUserUid(isExpanded ? null : u.uid)}
                                  style={{
                                    cursor: 'pointer',
                                    background: isExpanded ? 'var(--green)' : 'var(--surface-raised)',
                                    color: isExpanded ? '#000' : 'var(--text)',
                                    border: '1px solid var(--border)',
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {isExpanded ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                      Hide Details <Icon name="chevron-up" size={13} />
                                    </span>
                                  ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                      View Data <Icon name="chevron-down" size={13} />
                                    </span>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => handleDeleteUser(u)}
                                  style={{
                                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                                    background: '#ef4444',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                                    opacity: isDeleting ? 0.6 : 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                  }}
                                  title="Delete User & Free Email Address"
                                >
                                  {isDeleting ? 'Deleting...' : (
                                    <>
                                      <Icon name="trash" size={13} /> Delete User
                                    </>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Dropdown Accordion Row DIRECTLY UNDER THIS USER */}
                          {isExpanded && (
                            <tr style={{ background: 'var(--surface-raised)', borderBottom: '2px solid var(--green)' }}>
                              <td colSpan={8} style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                  <h4 style={{ margin: 0, fontFamily: 'var(--font-fredoka), sans-serif', fontSize: '1.05rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Icon name="user" size={16} /> Linked Profile & Activity Breakdown: {u.name} ({u.email})
                                  </h4>
                                  <button
                                    onClick={() => setExpandedUserUid(null)}
                                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--muted)', fontWeight: 'bold', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                  >
                                    <Icon name="close" size={14} /> Close
                                  </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
                                  {/* Profile Details */}
                                  <div>
                                    <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <Icon name="user" size={14} /> Account & Activity Timestamps
                                    </h4>
                                    <div style={{ fontSize: '0.82rem', lineHeight: '1.8', color: 'var(--text)' }}>
                                      <div><strong>UID:</strong> <code style={{ fontSize: '0.78rem' }}>{u.uid}</code></div>
                                      <div><strong>Full Name:</strong> {u.name}</div>
                                      <div><strong>Email:</strong> {u.email}</div>
                                      <div>
                                        <strong>Subscription Status:</strong>{' '}
                                        {u.isUnsubscribed ? (
                                          <span style={{ color: '#ef4444', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Icon name="bellOff" size={13} /> UNSUBSCRIBED {u.unsubscribedAt ? `(${formatDateTime(u.unsubscribedAt)})` : ''}
                                          </span>
                                        ) : (
                                          <span style={{ color: 'var(--green)', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Icon name="bell" size={13} /> Active Subscriber
                                          </span>
                                        )}
                                      </div>
                                      <div><strong>Degree Program:</strong> {u.degree}</div>
                                      <div><strong>Academic Year:</strong> {u.year}</div>
                                      <div><strong>Primary Interest:</strong> {u.interest}</div>
                                      <div><strong>Auth Providers:</strong> {u.providers?.join(', ') || 'Password'}</div>
                                      <div style={{ marginTop: '0.4rem', color: 'var(--green)', fontWeight: '700' }}>
                                        <strong>Last Login / Active:</strong> <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="clock" size={13} /> {formatDateTime(u.lastSignInTime)}</span>
                                      </div>
                                      <div><strong>Account Joined Date:</strong> <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="calendar" size={13} /> {formatDateTime(u.createdAt)}</span></div>
                                    </div>
                                  </div>

                                  {/* Active Roadmap Progress */}
                                  <div>
                                    <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <Icon name="map" size={14} /> Roadmap Activity ({u.progress?.length || 0})
                                    </h4>
                                    {u.progress?.length > 0 ? (
                                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text)' }}>
                                        {u.progress.map((p, idx) => (
                                          <li key={idx} style={{ marginBottom: '0.3rem' }}>
                                            <strong>{p.slug}</strong> — {p.completedNodeIds?.length || 0} nodes finished
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>No active roadmap progress logged yet.</p>
                                    )}
                                  </div>

                                  {/* Exam Appearances & Quiz Attempts */}
                                  <div>
                                    <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <Icon name="fileText" size={14} /> Cert Exam Appearances ({u.quizAttempts?.length || 0})
                                    </h4>
                                    {u.quizAttempts?.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {u.quizAttempts.map((q, idx) => (
                                          <div key={idx} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                                            <div style={{ fontWeight: '700', color: 'var(--text)' }}>{q.slug}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                              Appeared: <strong>{q.attemptsCount || 1} time(s)</strong>
                                            </div>
                                            {q.lastAttemptAt && (
                                              <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                                                Last Attempt: {formatDateTime(q.lastAttemptAt)}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>
                                        No cert exam attempts logged yet. (Exams unlock at 60% roadmap progress).
                                      </p>
                                    )}
                                  </div>

                                  {/* Sent Email History Box */}
                                  <div>
                                    <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <Icon name="mail" size={14} /> Sent Email History ({sentLogs.length})
                                    </h4>
                                    {sentLogs.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                                        {sentLogs.map((log, idx) => (
                                          <div key={idx} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.78rem' }}>
                                            <div style={{ fontWeight: '700', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                              <Icon name="check" size={13} /> {log.templateId} {log.forceOverride ? '(FORCE OVERRIDDEN)' : ''}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                                              Sent: {formatDateTime(log.sentAt)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>No retention emails sent to this candidate yet.</p>
                                    )}
                                  </div>
                                </div>

                                {/* ONE-CLICK RETENTION EMAIL DISPATCHER WITH PREVIEW, SAMPLE TEST & FORCE SEND CONTROLS */}
                                <div
                                  style={{
                                    background: u.isUnsubscribed ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0, 229, 153, 0.08)',
                                    border: `1.5px solid ${u.isUnsubscribed ? '#ef4444' : 'var(--green)'}`,
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    marginTop: '1.5rem',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <div>
                                      <strong style={{ color: u.isUnsubscribed ? '#ef4444' : 'var(--green)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Icon name="mail" size={16} /> SkillBun Retention Email Engine & Subscription Control
                                      </strong>
                                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                                        Status:{' '}
                                        {u.isUnsubscribed ? (
                                          <strong style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Icon name="bellOff" size={13} /> UNSUBSCRIBED {u.unsubscribedAt ? `(${formatDateTime(u.unsubscribedAt)})` : ''}
                                          </strong>
                                        ) : (
                                          <strong style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Icon name="bell" size={13} /> ACTIVE SUBSCRIBER
                                          </strong>
                                        )}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Smart Non-Repeating Auto-Recommendation Banner */}
                                  <div
                                    style={{
                                      background: 'var(--surface-raised)',
                                      border: `1px solid ${u.isUnsubscribed ? '#ef4444' : 'var(--green)'}`,
                                      padding: '0.6rem 0.85rem',
                                      borderRadius: '8px',
                                      marginBottom: '0.9rem',
                                      fontSize: '0.82rem',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <div>
                                      <strong>Recommended next step:</strong>{' '}
                                      <span style={{ color: u.isUnsubscribed ? '#ef4444' : 'var(--green)', fontWeight: '800' }}>{recommended.label}</span>
                                      <p style={{ margin: '0.4rem 0', color: 'var(--muted)' }}>{recommended.reason}</p>
                                      {recommended.isRotated && (
                                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: 'var(--green-subtle)', color: 'var(--green)', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: '700' }}>
                                          Same-category variation ({recommended.alreadySentCount} sent)
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                      <button
                                        type="button"
                                        disabled={!recommended.eligible || Boolean(sendingEmailKey)}
                                        onClick={() => prepareRecommendation(u)}
                                        style={{
                                          cursor: 'pointer',
                                          padding: '0.4rem 0.7rem',
                                          borderRadius: '6px',
                                          background: 'var(--surface-raised)',
                                          color: 'var(--green)',
                                          border: '1px solid var(--green)',
                                          fontWeight: '800',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {isPreviewModalLoading ? 'Preparing…' : 'Prepare recommended mail'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!recommended.eligible || Boolean(sendingEmailKey)}
                                        onClick={() => prepareRecommendation(u, undefined, 'generate')}
                                        style={{
                                          cursor: 'pointer',
                                          padding: '0.4rem 0.7rem',
                                          borderRadius: '6px',
                                          background: 'var(--green)',
                                          color: '#000000',
                                          border: 'none',
                                          fontWeight: '800',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {isAiGenerating ? 'Generating & saving…' : 'Generate new AI mail'}
                                      </button>
                                    </div>
                                  </div>

                                  {recommended.eligible && <EmailDraftLibrary user={user} fixedCategory={recommended.category} onChoose={draft => prepareRecommendation(u, draft.id)} />}
                                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {/* 18 Variations Grouped Email Template Selector */}
                                    <select
                                      value={currentTemplate}
                                      onChange={(e) => setSelectedTemplates((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                                      style={{
                                        padding: '0.65rem 1rem',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-raised)',
                                        color: 'var(--text)',
                                        fontWeight: '700',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        flex: '1',
                                        minWidth: '280px',
                                      }}
                                    >
                                      <option value="">{recommended.eligible ? 'Prepare a fresh variation' : 'No email due'}</option>
                                      {Object.entries(RETENTION_TEMPLATES).filter(([id]) => recommended.category && emailCategory(id) === recommended.category && !u.sentEmailHistory?.some(log => (typeof log === 'string' ? log : log.templateId) === id)).map(([id, template]) => <option key={id} value={id}>{template.name}</option>)}
                                      {savedChoice?.id.startsWith('ai_') && <option value={savedChoice.id}>{savedChoice.name} (saved AI draft)</option>}
                                    </select>

                                    {/* Action 1: Instant In-Browser Preview Modal */}
                                    <button
                                      type="button"
                                      disabled={!recommended.eligible || isPreviewModalLoading || isSampleLoading || isSendLoading || isForceLoading}
                                      onClick={() => handlePreviewEmail(u)}
                                      style={{
                                        cursor: isPreviewModalLoading ? 'not-allowed' : 'pointer',
                                        padding: '0.65rem 1.1rem',
                                        borderRadius: '10px',
                                        background: 'var(--surface-raised)',
                                        border: '1px solid var(--green)',
                                        color: 'var(--green)',
                                        fontWeight: '700',
                                        fontSize: '0.83rem',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        opacity: isPreviewModalLoading ? 0.6 : 1,
                                      }}
                                      title="Instantly opens rendered HTML email preview in a modal"
                                    >
                                      {isPreviewModalLoading ? 'Previewing...' : (
                                        <>
                                          <Icon name="eye" size={14} /> Preview Body
                                        </>
                                      )}
                                    </button>

                                    {/* Action 2: Send Sample Test Email to Admin */}
                                    <button
                                      type="button"
                                      disabled={!recommended.eligible || isPreviewModalLoading || isSampleLoading || isSendLoading || isForceLoading}
                                      onClick={() => handleSendRetentionEmail(u, true, false)}
                                      style={{
                                        cursor: isSampleLoading ? 'not-allowed' : 'pointer',
                                        padding: '0.65rem 1.1rem',
                                        borderRadius: '10px',
                                        background: 'var(--surface-raised)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text)',
                                        fontWeight: '700',
                                        fontSize: '0.83rem',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        opacity: isSampleLoading ? 0.6 : 1,
                                      }}
                                      title="Sends a real test copy to harsh@skillbun.tech via Zoho SMTP"
                                    >
                                      {isSampleLoading ? 'Sending Sample...' : (
                                        <>
                                          <Icon name="flask" size={14} /> Send Test Email to Me
                                        </>
                                      )}
                                    </button>

                                    {/* Action 3: Standard Send to Student (Respects Unsubscribe) */}
                                    {!u.isUnsubscribed && (
                                      <button
                                        type="button"
                                        disabled={!recommended.eligible || isPreviewModalLoading || isSampleLoading || isSendLoading || isForceLoading}
                                        onClick={() => handleSendRetentionEmail(u, false, false)}
                                        style={{
                                          cursor: isSendLoading ? 'not-allowed' : 'pointer',
                                          padding: '0.65rem 1.3rem',
                                          borderRadius: '10px',
                                          background: 'var(--green)',
                                          color: '#000000',
                                          border: 'none',
                                          fontWeight: '800',
                                          fontSize: '0.85rem',
                                          whiteSpace: 'nowrap',
                                          boxShadow: '0 4px 12px rgba(0, 229, 153, 0.4)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.4rem',
                                          opacity: isSendLoading ? 0.6 : 1,
                                        }}
                                      >
                                        {isSendLoading ? 'Sending Email...' : (
                                          <>
                                            <Icon name="send" size={14} /> Send to {u.name}
                                          </>
                                        )}
                                      </button>
                                    )}

                                    {/* Action 4: Force Send Button (Overrides Unsubscribe Opt-Out!) */}
                                    {u.isUnsubscribed && (
                                      <button
                                        type="button"
                                        disabled={!recommended.eligible || isPreviewModalLoading || isSampleLoading || isSendLoading || isForceLoading}
                                        onClick={() => handleSendRetentionEmail(u, false, true)}
                                        style={{
                                          cursor: isForceLoading ? 'not-allowed' : 'pointer',
                                          padding: '0.65rem 1.3rem',
                                          borderRadius: '10px',
                                          background: '#ef4444',
                                          color: '#ffffff',
                                          border: 'none',
                                          fontWeight: '800',
                                          fontSize: '0.85rem',
                                          whiteSpace: 'nowrap',
                                          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.4rem',
                                          opacity: isForceLoading ? 0.6 : 1,
                                        }}
                                        title="Overrides candidate's unsubscribe preference and dispatches the email anyway"
                                      >
                                        {isForceLoading ? 'Force Sending...' : (
                                          <>
                                            <Icon name="zap" size={14} /> Force Send (Override Unsubscribe)
                                          </>
                                        )}
                                      </button>
                                    )}

                                    {/* Action 5: Reset Sent Counter for this specific student */}
                                    {sentLogs.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetUserSentCounter(u)}
                                        style={{
                                          cursor: 'pointer',
                                          padding: '0.65rem 1.1rem',
                                          borderRadius: '10px',
                                          background: 'var(--surface-raised)',
                                          border: '1px solid var(--border)',
                                          color: 'var(--muted)',
                                          fontWeight: '700',
                                          fontSize: '0.83rem',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={`Reset ${u.name}'s sent email counter to 0`}
                                      >
                                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: '0.4rem' }}><path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7" /></svg>
                                        Reset Counter (0 Sent)
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Prominent Danger Zone Box for Deleting User Account & Freeing Email */}
                                <div
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    border: '2px dashed #ef4444',
                                    borderRadius: '12px',
                                    padding: '1rem 1.25rem',
                                    marginTop: '1rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '1rem',
                                  }}
                                >
                                  <div>
                                    <strong style={{ color: '#ef4444', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                                      <Icon name="trash" size={16} /> Admin Action: Permanently Delete Student Account
                                    </strong>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                                      Erases Firestore user profile, progress data, exam attempts, and Firebase Auth account ({u.email}). <strong>Frees email so student can create a brand new account.</strong>
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    disabled={isDeleting}
                                    style={{
                                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                                      padding: '0.65rem 1.3rem',
                                      borderRadius: '10px',
                                      background: '#ef4444',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontWeight: '800',
                                      fontSize: '0.9rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                                      opacity: isDeleting ? 0.6 : 1,
                                    }}
                                  >
                                    {isDeleting ? 'Deleting Account...' : (
                                      <>
                                        <Icon name="trash" size={15} /> Delete User & Free Email
                                      </>
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Issued Certificates Registry */}
        {activeTab === 'certificates' && (
          <div>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                <p>Loading real certificate records from database...</p>
              </div>
            ) : filteredCerts.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ marginBottom: '0.5rem', color: 'var(--muted)' }}><Icon name="certificate" size={40} /></div>
                {searchTerm ? (
                  <p style={{ margin: 0 }}>No certificates match "{searchTerm}".</p>
                ) : (
                  <p style={{ margin: 0 }}>No certificates issued in database yet. Earned student certificates will automatically appear here.</p>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Student / Recipient</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Roadmap Track</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Exam Score</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Certificate ID</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCerts.map((cert) => (
                      <tr key={cert.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <div style={{ fontWeight: '700', color: 'var(--text)' }}>{cert.name}</div>
                          {cert.email && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{cert.email}</div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text)' }}>{cert.roadmapTitle}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--green)', fontWeight: '800' }}>{cert.score}%</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <code style={{ background: 'var(--surface-raised)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--accent)' }}>
                            {cert.id}
                          </code>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                          <Link
                            href={`/certificate/${cert.id}`}
                            target="_blank"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              color: 'var(--green)',
                              fontWeight: '700',
                              textDecoration: 'none',
                              background: 'var(--green-subtle)',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>View Certificate <Icon name="external" size={12} /></span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
