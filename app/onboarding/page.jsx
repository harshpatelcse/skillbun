'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { normalizeInternalPath } from '@/utils/shared/routes';
import { useAuth } from '../components/AuthProvider';
import posthog from 'posthog-js';
import styles from './onboarding.module.css';

const DEGREE_OPTIONS = [
  'BS / B.Sc. – Computer Science',
  'BS / B.Sc. – Software Engineering',
  'BS / B.Sc. – Information Technology / Computing Systems',
  'BS / B.Sc. – Data Science & Artificial Intelligence',
  'BS / B.Sc. – Cybersecurity & Networks',
  'B.Tech / B.E. – Computer Science & Engineering',
  'B.Tech – Information Technology & AI',
  'B.Tech / B.E. – Electronics / Electrical / Other Engineering',
  'BCA – Bachelor of Computer Applications',
  'MS / M.Sc. / MCA – Computer Science & Applications',
  'Coding Bootcamp Graduate / Intensive Program',
  'Self-Taught Developer / Career Switcher',
  'High School / Pre-College Student',
  'Other Degree / Field',
];

const YEAR_OPTIONS = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  'Graduated / Working',
  'Pre-College / School Student',
];

const INTEREST_OPTIONS = [
  'Web Development (Full-Stack / Frontend / Backend)',
  'Web Development',
  'AI / Machine Learning',
  'Mobile App Development',
  'Data Science',
  'Cybersecurity',
  'Cloud Computing',
  'UI/UX Design',
  'Game Development',
  'Not sure yet – help me explore!',
];

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = normalizeInternalPath(searchParams.get('next'), '/dashboard');
  const continuePath = next === '/dashboard' ? '/quiz' : next;
  const editMode = searchParams.get('edit') === '1';
  const { user, profile, authLoading, profileLoading, isProfileComplete, saveProfile } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savedDestination, setSavedDestination] = useState('');
  const [adultDeclarationInput, setAdultDeclaration] = useState(null);
  const adultDeclaration = adultDeclarationInput ?? profile.ageBand === '18-plus';

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/auth?next=${encodeURIComponent(editMode ? `/onboarding?edit=1&next=${encodeURIComponent(next)}` : next)}`);
      return;
    }

    if (!saving && !savedDestination && !authLoading && !profileLoading && isProfileComplete && !editMode) {
      router.replace(continuePath);
    }
  }, [authLoading, continuePath, editMode, isProfileComplete, next, profileLoading, router, savedDestination, saving, user]);

  async function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const degree = String(formData.get('degree') || '').trim();
    const year = String(formData.get('year') || '').trim();
    const interest = String(formData.get('interest') || '').trim();

    if (!name || !degree || !year) {
      setError('Please fill in all required fields (Name, Degree, and Current Year).');
      return;
    }
    if (!adultDeclaration) {
      setError('Confirm that you are 18 or older. Accounts for younger students require a guardian approval flow that is not currently available.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    // Determine target destination based on submit button
    const submitter = e.nativeEvent?.submitter;
    const customDestination = submitter?.getAttribute('data-destination');

    try {
      await saveProfile({ name, degree, year, interest, ageBand: '18-plus' });

      if (editMode) {
        posthog.capture('profile_updated', {
          degree,
          academic_year: year,
          has_interest: Boolean(interest),
        });
        setSuccess('Profile updated successfully! Your career roadmaps have been synchronized.');
        setSaving(false);

        // If a specific destination was requested or custom query next
        if (customDestination) {
          router.push(customDestination);
        }
      } else {
        const targetPath = normalizeInternalPath(customDestination, continuePath);
        posthog.capture('profile_completed', {
          degree,
          academic_year: year,
          has_interest: Boolean(interest),
          destination: targetPath,
        });
        if (formData.get('marketingConsent') === 'on') {
          try {
            const token = await user.getIdToken();
            const response = await fetch('/api/unsubscribe', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ email: user.email, action: 'resubscribe' }),
              signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) throw new Error('Email preference was not confirmed.');
          } catch {
            // A failed optional preference update must not misreport a saved profile as failed.
            setSuccess('Profile saved. We could not confirm your email preference. You can review it in Account Settings or continue now.');
            setSavedDestination(targetPath);
            setSaving(false);
            return;
          }
        }
        router.replace(targetPath);
      }
    } catch (saveError) {
      console.error('Failed to save Firebase profile:', saveError);
      setError('Could not save your profile. Please check your network connection and try again.');
      setSaving(false);
    }
  }

  if (authLoading || profileLoading || !profile.hydrated || !user || (isProfileComplete && !editMode && !saving && !savedDestination)) {
    return (
      <div className={styles.loadingContainer}>
        <div className={`welcome-bunny ${styles.welcomeBunny}`}>
          <Image src="/logo.png" alt="SkillBun Logo" width={48} height={48} priority />
        </div>
        <p className={styles.loadingText}>Setting things up...</p>
      </div>
    );
  }

  const isGoogle = Array.isArray(profile.providers) && profile.providers.includes('google.com');
  const userInitial = (profile.name || user.displayName || user.email || 'S').charAt(0).toUpperCase();

  return (
    <div className={styles.formContainer}>
      {editMode && (
        <nav className={styles.topNav} aria-label="Breadcrumb navigation">
          <Link href={next || '/dashboard'} className={styles.backLink}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to Dashboard
          </Link>

          <Link href="/settings" className={styles.settingsLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
            Account Settings
          </Link>
        </nav>
      )}

      <div className={styles.header}>
        {!editMode ? (
          <>
            <div className={styles.logoWrapper}>
              <Image src="/logo.png" alt="SkillBun Logo" width={52} height={52} priority />
              <span className={styles.brandWordmark}>ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
            </div>
            <h1 className={styles.title}>
              Welcome to SkillBun! 🎓
            </h1>
            <p className={styles.subtitle}>
              Tell us a little about yourself so SkillBun can personalize your learning roadmap, AI quiz recommendations, and Bun-Bot guidance.
            </p>
          </>
        ) : (
          <>
            <div className={styles.logoWrapper}>
              <Image src="/logo.png" alt="SkillBun Logo" width={42} height={42} priority />
            </div>
            <h1 className={styles.title}>
              Profile Settings
            </h1>
            <p className={styles.subtitle}>
              Manage your academic background, degree program, and career interest areas.
            </p>
          </>
        )}
      </div>

      {editMode && user && (
        <div className={styles.accountBadge}>
          <div className={styles.accountInfo}>
            <div className={styles.accountAvatar}>
              {userInitial}
            </div>
            <div className={styles.accountDetails}>
              <span className={styles.accountEmail}>{user.email}</span>
              <span className={styles.accountMeta}>
                {isGoogle ? 'Signed in via Google' : 'Email Account'}
              </span>
            </div>
          </div>
          {user.emailVerified || isGoogle ? (
            <span className={styles.badgeVerified}>Verified</span>
          ) : (
            <span className={styles.badgeUnverified}>Unverified</span>
          )}
        </div>
      )}

      {success && (
        <div className={styles.successBanner} role="status">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {savedDestination ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <button type="button" className={`btn-form ${styles.btnSubmit}`} onClick={() => router.replace(savedDestination)}>
            Continue
          </button>
          <Link href="/settings" className={styles.btnSecondary}>Review Email Preferences</Link>
        </div>
      ) : <form onSubmit={handleSubmit}>
        <label style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', marginBottom: '1.25rem', color: 'var(--text)' }}>
          <input type="checkbox" checked={adultDeclaration} onChange={(event) => setAdultDeclaration(event.target.checked)} required disabled={saving} />
          <span>I am 18 or older. SkillBun self-service accounts are currently available to adults.</span>
        </label>
        <div className="form-group">
          <label>Your Full Name *</label>
          <input
            name="name"
            type="text"
            defaultValue={profile.hasName ? profile.name : (user.displayName || '')}
            required
            placeholder="Enter your name"
            className={`form-control ${styles.inputControl}`}
          />
        </div>

        <div className="form-group">
          <label>Degree / Program *</label>
          <select name="degree" defaultValue={profile.degree || ''} required>
            <option value="">Select your degree or educational background</option>
            {DEGREE_OPTIONS.map((deg) => (
              <option key={deg} value={deg}>{deg}</option>
            ))}
            {profile.degree && !DEGREE_OPTIONS.includes(profile.degree) && (
              <option value={profile.degree}>{profile.degree}</option>
            )}
          </select>
        </div>

        <div className="form-group">
          <label>Current Year / Stage *</label>
          <select name="year" defaultValue={profile.year || ''} required>
            <option value="">Select current year</option>
            {YEAR_OPTIONS.map((yr) => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
            {profile.year && !YEAR_OPTIONS.includes(profile.year) && (
              <option value={profile.year}>{profile.year}</option>
            )}
          </select>
        </div>

        <div className="form-group">
          <label>Area of Interest (Optional)</label>
          <select name="interest" defaultValue={profile.interest || ''}>
            <option value="">Choose an area that excites you</option>
            {INTEREST_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
            {profile.interest && !INTEREST_OPTIONS.includes(profile.interest) && (
              <option value={profile.interest}>{profile.interest}</option>
            )}
          </select>
        </div>

        {editMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1.25rem' }}>
            <button
              type="submit"
              className={`btn-form ${styles.btnSubmit}`}
              disabled={saving}
            >
              {saving ? 'Saving changes...' : 'Save Changes'}
            </button>
            <Link
              href={next || '/dashboard'}
              className={styles.btnSecondary}
            >
              Return to Dashboard
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1.25rem' }}>
            <label style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', color: 'var(--text)', fontSize: '0.9rem' }}>
              <input type="checkbox" name="marketingConsent" disabled={saving} />
              <span>Send me optional learning reminders and SkillBun updates by email. I can unsubscribe anytime. Essential account messages are separate.</span>
            </label>
            <button
              type="submit"
              data-destination={continuePath}
              className={`btn-form ${styles.btnSubmit}`}
              disabled={saving}
            >
              {saving ? 'Saving...' : continuePath === '/quiz' ? 'Save & Take Diagnostic Quiz (Recommended)' : 'Save & Continue'}
            </button>
            <button
              type="submit"
              data-destination="/roadmap"
              className={styles.btnSecondary}
              disabled={saving}
            >
              {continuePath === '/quiz' ? 'Skip Quiz & Explore Roadmaps Directly' : 'Explore Roadmaps Instead'}
            </button>
          </div>
        )}

        {editMode ? (
          <p className={styles.settingsShortcut}>
            Looking to change your password or security settings?{' '}
            <Link href="/settings">Go to Account Settings →</Link>
          </p>
        ) : (
          <p className={styles.footerNote}>
            This helps our AI quiz and counsellor give you personalized advice. You can update this anytime in your Profile Settings.
          </p>
        )}
      </form>}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className={styles.loadingContainer}>
        <div className={`welcome-bunny ${styles.welcomeBunny}`}>
          <Image src="/logo.png" alt="SkillBun Logo" width={48} height={48} priority />
        </div>
        <p className={styles.loadingText}>Setting things up...</p>
      </div>
    }>
      <OnboardingForm />
    </Suspense>
  );
}
