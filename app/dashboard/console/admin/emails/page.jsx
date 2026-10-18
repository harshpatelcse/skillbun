'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import { useAdminAccess } from '@/utils/client/adminAuth';
import { prepareEmailPreview, isEmailDocument } from '@/utils/shared/emailContent';
import { buildBaseEmailWrapper, escapeHtml, RETENTION_TEMPLATES } from '@/utils/server/retentionEmails';
import styles from './emails.module.css';
import EmailDraftLibrary from './EmailDraftLibrary';
import BulkRetentionCampaign from '../analytics/BulkRetentionCampaign';

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
    case 'zap':
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...common}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
    case 'moon':
      return (
        <svg {...common}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'flask':
      return (
        <svg {...common}>
          <path d="M10 2v7.31L4.1 20.3a2 2 0 0 0 1.7 2.7h12.4a2 2 0 0 0 1.7-2.7L14 9.31V2" />
          <line x1="8" y1="2" x2="16" y2="2" />
          <line x1="8.5" y1="14" x2="15.5" y2="14" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
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


// Extended Template Catalog combining Retention & Workforce templates
const ALL_TEMPLATES = [
  // Category 1: Onboarding
  {
    id: 'welcome_v1',
    category: 'Onboarding',
    name: 'Onboarding V1: ₹35,000 Course Value Unlocked',
    categoryLabel: 'Onboarding',
    description: 'Emphasizes ₹35,000 worth of free interactive tech roadmaps & encrypted study vault.',
  },
  {
    id: 'welcome_v2',
    category: 'Onboarding',
    name: 'Onboarding V2: 2026 Tech Salary Benchmark',
    categoryLabel: 'Onboarding',
    description: 'Triggers competitive urgency against other student applicants.',
  },
  {
    id: 'welcome_v3',
    category: 'Onboarding',
    name: 'Onboarding V3: $500 Encrypted SBV1 Study Vault',
    categoryLabel: 'Onboarding',
    description: 'Focuses on exclusive privilege access to SkillBun Vault study guides.',
  },

  // Category 2: Re-engagement
  {
    id: 'reengagement_v1',
    category: 'Re-engagement',
    name: 'Re-engage V1: Rank & Streak Decaying Alert',
    categoryLabel: 'Re-engagement',
    description: 'Warns student about active streak loss and ranking decay.',
  },
  {
    id: 'reengagement_v2',
    category: 'Re-engagement',
    name: 'Re-engage V2: 3-Minute Quick Win to Exam Ticket',
    categoryLabel: 'Re-engagement',
    description: 'Encourages completing just 1 quick topic node to reach certification.',
  },
  {
    id: 'reengagement_v3',
    category: 'Re-engagement',
    name: 'Re-engage V3: Recruiter Queue Visibility Alert',
    categoryLabel: 'Re-engagement',
    description: 'Highlights priority recruiter discovery for candidates with 60%+ progress.',
  },

  // Category 3: Exam Ready
  {
    id: 'exam_nudge_v1',
    category: 'Exam Ready',
    name: 'Exam Ready V1: Top 7% Elite Candidate Invitation',
    categoryLabel: 'Exam Ready',
    description: 'Celebrates 60%+ completion and invites student to certify.',
  },
  {
    id: 'exam_nudge_v2',
    category: 'Exam Ready',
    name: 'Exam Ready V2: Free ₹15,000 Proctored Exam Ticket',
    categoryLabel: 'Exam Ready',
    description: 'Positions proctored exam as a ₹15,000 waived fee gift.',
  },
  {
    id: 'exam_nudge_v3',
    category: 'Exam Ready',
    name: 'Exam Ready V3: Recruiters Verifying SkillBun QR Links',
    categoryLabel: 'Exam Ready',
    description: 'Emphasizes tamper-proof verification on LinkedIn & resume.',
  },

  // Category 4: Exam Retake
  {
    id: 'exam_failed_v1',
    category: 'Exam Retake',
    name: 'Retake V1: 100% Free Unlimited Retake Ticket',
    categoryLabel: 'Exam Retake',
    description: 'Reassures student that retakes are free and unlimited.',
  },
  {
    id: 'exam_failed_v2',
    category: 'Exam Retake',
    name: 'Retake V2: Review SBV1 Encrypted Study Vault',
    categoryLabel: 'Exam Retake',
    description: 'Advises reading encrypted study guides during 1-hour cooldown.',
  },
  {
    id: 'exam_failed_v3',
    category: 'Exam Retake',
    name: 'Retake V3: Missed Passing by Just 2 Questions',
    categoryLabel: 'Exam Retake',
    description: 'Boosts confidence for near-pass candidates after 1-hour cooldown.',
  },

  // Category 5: Alumni & Certs
  {
    id: 'cert_congrats_v1',
    category: 'Alumni Certs',
    name: 'Alumni V1: Verified Specialist Status & QR Badge',
    categoryLabel: 'Alumni Certs',
    description: 'Promotes LinkedIn QR badge sharing and resume addition.',
  },
  {
    id: 'cert_congrats_v2',
    category: 'Alumni Certs',
    name: 'Alumni V2: Next High-Salary Track Combo',
    categoryLabel: 'Alumni Certs',
    description: 'Recommends complementary high-paying tech tracks.',
  },
  {
    id: 'cert_congrats_v3',
    category: 'Alumni Certs',
    name: 'Alumni V3: Priority Recruiter Directory Unlocked',
    categoryLabel: 'Alumni Certs',
    description: 'Informs certified alumnus about public recruiter verification indexing.',
  },

  // Category 6: Transactional & Security
  {
    id: 'transactional_alert_v1',
    category: 'Security Alerts',
    name: 'Security V1: Account Security & Authentication Alert',
    categoryLabel: 'Security Alerts',
    description: 'Security notice. Omits marketing unsubscribe per compliance rules.',
  },
  {
    id: 'transactional_alert_v2',
    category: 'Security Alerts',
    name: 'Security V2: Password & Login Session Guard Notice',
    categoryLabel: 'Security Alerts',
    description: 'Session guard notice. Omits marketing unsubscribe per compliance rules.',
  },
  {
    id: 'transactional_alert_v3',
    category: 'Security Alerts',
    name: 'Security V3: Critical Account Credential Status Alert',
    categoryLabel: 'Security Alerts',
    description: 'Credential alert. Omits marketing unsubscribe per compliance rules.',
  },

  // Category 7: Workforce & Operations
  {
    id: 'workforce_offer',
    category: 'Workforce',
    name: 'Workforce: Internship Offer of Engagement & Terms',
    categoryLabel: 'Workforce',
    description: 'Includes terms of engagement, 4-page PDF attachment notice & Zoho credentials.',
  },
  {
    id: 'workforce_activation',
    category: 'Workforce',
    name: 'Workforce: Onboarding Complete & Workspace Access',
    categoryLabel: 'Workforce',
    description: 'Delivers active Zoho Mail credentials and Day 1 onboarding instructions.',
  },
  {
    id: 'workforce_extension',
    category: 'Workforce',
    name: 'Workforce: Extension of Internship Tenure Addendum',
    categoryLabel: 'Workforce',
    description: 'Formal tenure extension notice with revised end date and signing instructions.',
  },
  {
    id: 'workforce_termination',
    category: 'Workforce',
    name: 'Workforce: Tenure Conclusion & Alumni Credentials',
    categoryLabel: 'Workforce',
    description: 'Offboarding record, granted certificates registry, and Alumni Document Vault link.',
  },

  // Category 8: Custom Blank
  {
    id: 'custom_blank',
    category: 'Custom Studio',
    name: 'Custom HTML: Write & Design from Scratch',
    categoryLabel: 'Custom Studio',
    description: 'Create an arbitrary custom branded email with custom subject and HTML.',
  },
].map(template => {
  const current = RETENTION_TEMPLATES[template.id];
  return current ? { ...template, name: current.name, description: current.description } : template;
});

const CATEGORIES = [
  'All',
  'Onboarding',
  'Re-engagement',
  'Exam Ready',
  'Exam Retake',
  'Alumni Certs',
  'Security Alerts',
  'Workforce',
  'Custom Studio',
];

export default function AdminEmailsPage() {
  const { user, authLoading } = useAuth();
  const { isAdmin, checking } = useAdminAccess(user, authLoading);

  // Studio Mode state: 'campaigns' | 'templates' | 'ai_drafts'
  const [activeStudioTab, setActiveStudioTab] = useState('campaigns');
  const [studentsList, setStudentsList] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // Template & Category state
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplateId, setSelectedTemplateId] = useState('welcome_v1');

  // Simulation variables
  const [simName, setSimName] = useState('Alex Sharma');
  const [simEmail, setSimEmail] = useState('alex.sharma@example.com');
  const [simRoadmap, setSimRoadmap] = useState('Full Stack Web Development');
  const [simProgress, setSimProgress] = useState(0);
  const [simRoadmapSlug, setSimRoadmapSlug] = useState('fullstack');
  const [simDegree, setSimDegree] = useState('B.Tech - Computer Science');

  // Editable Subject & HTML state
  const [editedSubject, setEditedSubject] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // Viewport & theme simulator
  const [viewport, setViewport] = useState('desktop'); // 'desktop' | 'mobile'
  const [previewBg, setPreviewBg] = useState('light');
  const [stripStyles, setStripStyles] = useState(false);
  const [blockImages, setBlockImages] = useState(false);

  // Dispatch state
  const [targetRecipient, setTargetRecipient] = useState('');
  const [forceOverride, setForceOverride] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingTarget, setIsSendingTarget] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: string }

  const textareaRef = useRef(null);

  // Filter templates by category
  const filteredTemplates = ALL_TEMPLATES.filter((t) => {
    if (selectedCategory === 'All') return true;
    return t.category === selectedCategory;
  });

  // Fetch / Generate preview when template or variables change
  const loadTemplateContent = useCallback(async (templateId, isReset = false) => {
    setLoadingPreview(true);
    setStatusMessage(null);
    try {
      const token = user ? await user.getIdToken() : '';
      const res = await fetch('/api/admin/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          templateId,
          isPreview: true,
          studentName: simName,
          recipientEmail: simEmail,
          roadmapTitle: simRoadmap,
          roadmapSlug: simRoadmapSlug,
          progressCount: simProgress === '' ? null : Number(simProgress),
          degree: simDegree,
        }),
      });

      const data = await res.json();
      if (data.success && data.preview) {
        if (isReset || !editedSubject) {
          setEditedSubject(data.preview.subject || '');
        }
        setEditedHtml(data.preview.html || '');
      }
    } catch (err) {
      console.error('Failed to load email preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  }, [user, simName, simEmail, simRoadmap, simProgress, simRoadmapSlug, simDegree, editedSubject]);

  // Switch template
  const handleSelectTemplate = (template) => {
    setSelectedTemplateId(template.id);
    if (template.id === 'custom_blank') {
      setEditedSubject(`An update from SkillBun for ${simName}`);
      setEditedHtml(`
<!-- Body only. The masthead lockup, title block and footer are added automatically. -->

<p class="sb-text" style="margin: 0 0 18px 0; font-size: 15.5px; line-height: 1.72; color: #1A1A1A;">Hi ${escapeHtml(simName)},</p>

<p class="sb-text" style="margin: 0 0 18px 0; font-size: 15.5px; line-height: 1.72; color: #1A1A1A;">Write your announcement here. Keep it left-aligned and plain. Use the <code>sb-text</code> and <code>sb-muted</code> classes on anything with a colour so it flips correctly in dark mode.</p>

<!-- Section heading: hairline rule + label -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; margin: 30px 0 16px 0;">
  <tr><td class="sb-hr" height="1" style="height: 1px; background-color: #E7E7E3; font-size: 0; line-height: 0;">&nbsp;</td></tr>
  <tr><td class="sb-muted" style="padding-top: 14px; font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #6E6D68;">What's new</td></tr>
</table>

<!-- Bulleted lines -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; margin: 0 0 26px 0;">
  <tr>
    <td width="16" style="width: 16px; padding: 5px 12px 5px 0; vertical-align: top;"><div class="sb-dot" style="width: 4px; height: 4px; border-radius: 50%; background-color: #1A1A1A; margin-top: 9px; font-size: 0; line-height: 0;">&nbsp;</div></td>
    <td class="sb-text" style="padding: 5px 0; font-size: 15px; line-height: 1.68; color: #1A1A1A;">First point goes here</td>
  </tr>
  <tr>
    <td width="16" style="width: 16px; padding: 5px 12px 5px 0; vertical-align: top;"><div class="sb-dot" style="width: 4px; height: 4px; border-radius: 50%; background-color: #1A1A1A; margin-top: 9px; font-size: 0; line-height: 0;">&nbsp;</div></td>
    <td class="sb-text" style="padding: 5px 0; font-size: 15px; line-height: 1.68; color: #1A1A1A;">Second point goes here</td>
  </tr>
</table>

<!-- Call to action -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="left" style="border-collapse: separate; margin: 6px 0 22px 0;"><tr>
  <td class="sb-btn" bgcolor="#1A1A1A" style="background-color: #1A1A1A; border-radius: 8px;">
    <a href="https://skillbun.tech/roadmap" target="_blank" class="sb-btn-a" style="display: inline-block; padding: 13px 26px; font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 8px;">Explore roadmaps</a>
  </td>
</tr></table>
<div style="clear: both; font-size: 0; line-height: 0;">&nbsp;</div>
      `.trim());
    } else {
      loadTemplateContent(template.id, true);
    }
  };

  // Initial load
  useEffect(() => {
    let isMounted = true;
    if (user && isAdmin) {
      const fetchInitial = async () => {
        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/admin/emails/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token ? `Bearer ${token}` : '',
            },
            body: JSON.stringify({
              templateId: selectedTemplateId,
              isPreview: true,
              studentName: simName,
              recipientEmail: simEmail,
              roadmapTitle: simRoadmap,
          roadmapSlug: simRoadmapSlug,
              progressCount: simProgress === '' ? null : Number(simProgress),
              degree: simDegree,
            }),
          });
          const data = await res.json();
          if (isMounted && data.success && data.preview) {
            setEditedSubject(data.preview.subject || '');
            setEditedHtml(data.preview.html || '');
          }
        } catch (err) {
          console.error('Failed to load initial email preview:', err);
        }
      };
      fetchInitial();
    }
    return () => {
      isMounted = false;
    };
  }, [user, isAdmin, selectedTemplateId, simName, simEmail, simRoadmap, simProgress, simRoadmapSlug, simDegree]);

  // Load registered students for bulk campaigns
  useEffect(() => {
    let isMounted = true;
    if (user && isAdmin) {
      const fetchStudents = async () => {
        setStudentsLoading(true);
        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/admin/analytics', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (isMounted && data.users && Array.isArray(data.users)) {
            setStudentsList(data.users);
          }
        } catch (err) {
          console.error('Failed to load students for campaigns:', err);
        } finally {
          if (isMounted) setStudentsLoading(false);
        }
      };
      fetchStudents();
    }
    return () => { isMounted = false; };
  }, [user, isAdmin]);

  // Insert variable tag at cursor
  const handleInsertVariable = (variableTag) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = editedHtml;
    const newVal = currentVal.substring(0, start) + variableTag + currentVal.substring(end);

    setEditedHtml(newVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableTag.length, start + variableTag.length);
    }, 50);
  };

  // Copy HTML to clipboard
  const handleCopyHtml = () => {
    if (!editedHtml) return;
    navigator.clipboard.writeText(editedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dispatch Test Email to founder/self
  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    setStatusMessage(null);
    try {
      const token = user ? await user.getIdToken() : '';
      const res = await fetch('/api/admin/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          customSubject: editedSubject,
          customHtml: editedHtml,
          studentName: simName,
          recipientEmail: 'harsh@skillbun.tech',
          isTest: true,
          roadmapTitle: simRoadmap,
          roadmapSlug: simRoadmapSlug,
          progressCount: simProgress === '' ? null : Number(simProgress),
          degree: simDegree,
          forceOverride: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Test email successfully dispatched to harsh@skillbun.tech (Message ID: ${data.messageId || 'Generated'})`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to dispatch test email via Zoho SMTP.',
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error dispatching test email.' });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Dispatch to targeted recipient
  const handleSendTargetRecipient = async () => {
    const recipient = targetRecipient.trim().toLowerCase();
    if (!recipient || !recipient.includes('@')) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid recipient email address.' });
      return;
    }

    setIsSendingTarget(true);
    setStatusMessage(null);
    try {
      const token = user ? await user.getIdToken() : '';
      const res = await fetch('/api/admin/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          customSubject: editedSubject,
          customHtml: editedHtml,
          studentName: simName,
          recipientEmail: recipient,
          roadmapTitle: simRoadmap,
          roadmapSlug: simRoadmapSlug,
          progressCount: simProgress === '' ? null : Number(simProgress),
          degree: simDegree,
          forceOverride: Boolean(forceOverride),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Email dispatched to ${recipient}!`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Delivery failed.',
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Network error dispatching email.' });
    } finally {
      setIsSendingTarget(false);
    }
  };

  const fullPreviewHtml = isEmailDocument(editedHtml) ? editedHtml
    : buildBaseEmailWrapper(editedHtml, editedSubject, !selectedTemplateId.startsWith('transactional') && !selectedTemplateId.startsWith('workforce'), simEmail);
  const previewHtml = prepareEmailPreview(fullPreviewHtml, { theme: previewBg, stripStyles, blockImages });

  if (authLoading || checking) {
    return (
      <div className={styles.emailContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1.05rem', fontWeight: '600' }}>Verifying admin authorization...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className={styles.emailContainer}>
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
    <div className={styles.emailContainer}>
      {/* Top Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <div className={styles.titleBadge}>
            <h1 className={styles.titleText}>SkillBun Email & Campaign Studio</h1>
            <span className={styles.securityPill}>
              <Icon name="zap" size={13} style={{ marginRight: '0.35rem' }} /> Zoho SMTP Pro
            </span>
          </div>
          <p className={styles.subtitle}>
            Manage, customize, live-preview, test, and dispatch all 23 platform retention templates, security notices, and workforce offer letters.
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
          <Link href="/dashboard/console/admin/analytics" className={styles.actionBtnSecondary}>
            Student CRM
          </Link>
          <Link href="/dashboard/console/admin/workforce" className={styles.actionBtnSecondary}>
            Workforce Hub
          </Link>
        </div>
      </div>

      {/* Studio Mode Selector Tabs */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          onClick={() => setActiveStudioTab('campaigns')}
          className={`${styles.modeTab} ${activeStudioTab === 'campaigns' ? styles.modeTabActive : ''}`}
        >
          <Icon name="send" size={15} /> Student Retention Campaigns
        </button>
        <button
          type="button"
          onClick={() => setActiveStudioTab('templates')}
          className={`${styles.modeTab} ${activeStudioTab === 'templates' ? styles.modeTabActive : ''}`}
        >
          <Icon name="clipboard" size={15} /> Template Catalog & Visual Editor
        </button>
        <button
          type="button"
          onClick={() => setActiveStudioTab('ai_drafts')}
          className={`${styles.modeTab} ${activeStudioTab === 'ai_drafts' ? styles.modeTabActive : ''}`}
        >
          <Icon name="zap" size={15} /> AI Email Draft Library
        </button>
      </div>

      {/* MODE 1: Student Retention Campaigns */}
      {activeStudioTab === 'campaigns' && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem', color: 'var(--green)', fontFamily: 'var(--font-fredoka), sans-serif', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Icon name="send" size={18} /> Automated Student Retention Engine
            </h2>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)', lineHeight: '1.5' }}>
              Diagnoses each student&apos;s latest learning progress, certifications, and activity timestamps to deliver personalized lifecycle emails (Welcome, Continue Learning, Exam Nudge, Certificate Congratulations) with automatic 72-hour frequency caps.
            </p>
          </div>

          <BulkRetentionCampaign
            students={studentsList}
            user={user}
            loading={studentsLoading}
          />
        </div>
      )}

      {/* MODE 3: AI Draft Library */}
      {activeStudioTab === 'ai_drafts' && (
        <div style={{ marginBottom: '2rem' }}>
          <EmailDraftLibrary user={user} defaultOpen />
        </div>
      )}

      {/* MODE 2: Template Catalog & Visual Editor */}
      {activeStudioTab === 'templates' && (
        <>
          {/* Category Pills */}
          <div className={styles.categoryTabs}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`${styles.categoryTab} ${selectedCategory === cat ? styles.categoryTabActive : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 2-Column Main Studio */}
          <div className={styles.studioLayout}>
            {/* Left Column: Template Catalog & In-Browser Editor */}
            <div className={styles.editorPanel}>
          {/* Template Catalog */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="clipboard" size={15} /> Template Catalog</span> ({filteredTemplates.length})
              </h3>
            </div>
            <div className={styles.templateList}>
              {filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`${styles.templateItem} ${selectedTemplateId === t.id ? styles.templateItemActive : ''}`}
                >
                  <div className={styles.templateItemName}>
                    <span>{t.name}</span>
                    {selectedTemplateId === t.id && (
                      <span style={{ color: 'var(--green)', fontSize: '0.72rem', fontWeight: '800' }}>ACTIVE</span>
                    )}
                  </div>
                  <div className={styles.templateItemDesc}>{t.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Candidate Simulation Variables */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="user" size={15} /> Dynamic Candidate Data Auto-Fill</span>
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Candidate Name ({'{name}'})</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className={styles.inputField}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Candidate Email ({'{email}'})</label>
                <input
                  type="text"
                  value={simEmail}
                  onChange={(e) => setSimEmail(e.target.value)}
                  className={styles.inputField}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Roadmap Track ({'{roadmapTitle}'})</label>
                <input
                  type="text"
                  value={simRoadmap}
                  onChange={(e) => setSimRoadmap(e.target.value)}
                  className={styles.inputField}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Degree ({'{degree}'})</label>
                <input
                  type="text"
                  value={simDegree}
                  onChange={(e) => setSimDegree(e.target.value)}
                  className={styles.inputField}
                />
              </div>
            </div>
          </div>

          <div className={styles.cardSection}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="email-roadmap-slug">Roadmap ID (for links and topic totals)</label>
              <input id="email-roadmap-slug" className={styles.inputField} value={simRoadmapSlug} onChange={e => setSimRoadmapSlug(e.target.value)} placeholder="For example: fullstack" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="email-progress">Completed topics (leave blank if unknown)</label>
              <input id="email-progress" className={styles.inputField} type="number" min="0" step="1" value={simProgress} onChange={e => setSimProgress(e.target.value)} />
            </div>
          </div>
          {/* Subject & HTML Editor */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Icon name="edit" size={15} /> Subject & Content Editor</span>
              </h3>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => loadTemplateContent(selectedTemplateId, true)}
                  className={styles.actionBtnSecondary}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  title="Reset to official template default"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="refresh" size={13} /> Reset</span>
                </button>
              </div>
            </div>

            {/* Subject Field */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Subject Line</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{editedSubject.length} chars</span>
              </label>
              <input
                type="text"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className={styles.inputField}
                placeholder="Enter email subject line..."
              />
            </div>

            {/* Variable Tag Inserter */}
            <div style={{ marginBottom: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                Quick Insert Dynamic Tags:
              </div>
              <div className={styles.variableBar}>
                <button type="button" onClick={() => handleInsertVariable('{name}')} className={styles.variableChip}>
                  + {'{name}'}
                </button>
                <button type="button" onClick={() => handleInsertVariable('{email}')} className={styles.variableChip}>
                  + {'{email}'}
                </button>
                <button type="button" onClick={() => handleInsertVariable('{roadmapTitle}')} className={styles.variableChip}>
                  + {'{roadmapTitle}'}
                </button>
                <button type="button" onClick={() => handleInsertVariable('{degree}')} className={styles.variableChip}>
                  + {'{degree}'}
                </button>
                <button type="button" onClick={() => handleInsertVariable('{progressCount}')} className={styles.variableChip}>
                  + {'{progressCount}'}
                </button>
              </div>
            </div>

            {/* HTML Body Editor */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>HTML / Body Content</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Live rendered on the right</span>
              </label>
              <textarea
                ref={textareaRef}
                value={editedHtml}
                onChange={(e) => setEditedHtml(e.target.value)}
                className={styles.textareaField}
                placeholder="Enter HTML markup here..."
                rows={12}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Device Preview & Dispatch Panel */}
        <div className={styles.previewPanel}>
          {/* Toolbar */}
          <div className={styles.previewToolbar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className={styles.deviceControls}>
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  className={`${styles.deviceBtn} ${viewport === 'desktop' ? styles.deviceBtnActive : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  Desktop (640px)
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  className={`${styles.deviceBtn} ${viewport === 'mobile' ? styles.deviceBtnActive : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                  </svg>
                  Mobile (375px)
                </button>
              </div>

              <div className={styles.deviceControls}>
                <button
                  type="button"
                  onClick={() => setPreviewBg('dark')}
                  className={`${styles.deviceBtn} ${previewBg === 'dark' ? styles.deviceBtnActive : ''}`}
                  title="Preview the email in dark mode"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="moon" size={13} /> Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewBg('light')}
                  className={`${styles.deviceBtn} ${previewBg === 'light' ? styles.deviceBtnActive : ''}`}
                  title="Preview the email in light mode"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Icon name="sun" size={13} /> Light</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyHtml}
              className={styles.actionBtnSecondary}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              {copied ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <Icon name="check" size={13} /> Copied!
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <Icon name="clipboard" size={13} /> Copy HTML
              </span>
            )}
            </button>
          </div>

          <div style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
            <label style={{ marginRight: '1rem' }}><input type="checkbox" checked={stripStyles} onChange={e => setStripStyles(e.target.checked)} /> Remove embedded styles</label>
            <label><input type="checkbox" checked={blockImages} onChange={e => setBlockImages(e.target.checked)} /> Block images</label>
            <p>Browser preview only. Gmail, Outlook and other inboxes may render differently. Preview settings do not change the sent email.</p>
          </div>
          {/* Preview Viewport Frame */}
          <div
            className={`${styles.previewFrameContainer} ${
              previewBg === 'dark' ? styles.previewFrameContainerDark : styles.previewFrameContainerLight
            }`}
          >
            {loadingPreview ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: 'var(--muted)' }}>
                <p>Generating email preview...</p>
              </div>
            ) : (
              <iframe
                title="Email Preview"
                srcDoc={previewHtml}
                className={`${styles.previewFrame} ${viewport === 'mobile' ? styles.previewFrameMobile : ''}`}
                sandbox="allow-same-origin"
              />
            )}
          </div>

          {/* Dispatch Box */}
          <div className={styles.dispatchBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><Icon name="send" size={16} /> Email Dispatch & Zoho SMTP Testing</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                From: <code>noreply@skillbun.tech</code>
              </span>
            </div>

            {/* Test Action */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest || isSendingTarget}
                className={styles.btnTest}
              >
                {isSendingTest ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                  <Icon name="clock" size={14} /> Sending Test...
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                  <Icon name="flask" size={14} /> Send Test Email to Me (harsh@skillbun.tech)
                </span>
              )}
              </button>
            </div>

            <div style={{ height: '1px', background: 'var(--border)', margin: '0.3rem 0' }}></div>

            {/* Targeted Candidate Dispatch */}
            <div className={styles.formGroup} style={{ margin: 0 }}>
              <label className={styles.formLabel}>Send Directly to Specific Candidate:</label>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  value={targetRecipient}
                  onChange={(e) => setTargetRecipient(e.target.value)}
                  placeholder="student@example.com"
                  className={styles.inputField}
                  style={{ flex: '1', minWidth: '220px' }}
                />
                <button
                  type="button"
                  onClick={handleSendTargetRecipient}
                  disabled={isSendingTest || isSendingTarget || !targetRecipient}
                  className={styles.btnPrimary}
                >
                  {isSendingTarget ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <Icon name="clock" size={14} /> Dispatching...
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                    <Icon name="mail" size={14} /> Dispatch Email
                  </span>
                )}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <input
                type="checkbox"
                id="forceOverrideCheck"
                checked={forceOverride}
                onChange={(e) => setForceOverride(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="forceOverrideCheck" style={{ fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name="zap" size={13} /> Force Send (Override unsubscribe filter for critical transactional / operational notices)
              </label>
            </div>

            {/* Status Feedback Banner */}
            {statusMessage && (
              <div
                className={`${styles.statusMessage} ${
                  statusMessage.type === 'success' ? styles.statusSuccess : styles.statusError
                }`}
              >
                {statusMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
    )}
  </div>
);
}
