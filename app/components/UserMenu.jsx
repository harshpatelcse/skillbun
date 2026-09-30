'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import ThemeToggle from './ThemeToggle';

const GUEST_ITEMS = [
  { href: '/projects', label: 'Projects Hub', icon: 'projects' },
  { href: '/auth?next=/dashboard&mode=login', label: 'Log In', icon: 'login' },
  { href: '/auth?next=/dashboard&mode=signup', label: 'Sign Up', icon: 'signup' },
  { href: '/certificate', label: 'Verify Certificate', icon: 'verify' },
];

const INCOMPLETE_PROFILE_ITEMS = [
  { href: '/projects', label: 'Projects Hub', icon: 'projects' },
  { href: '/onboarding?next=/dashboard', label: 'Complete Profile', icon: 'profile' },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/certificate', label: 'Verify Certificate', icon: 'verify' },
  { href: '/contact', label: 'Support Center', icon: 'support', external: false },
];

const COMPLETE_PROFILE_ITEMS = [
  { href: '/projects', label: 'Projects Hub', icon: 'projects' },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/onboarding?next=/dashboard&edit=1', label: 'Profile Settings', icon: 'profile' },
  { href: '/roadmap?view=saved', label: 'Saved Paths', icon: 'saved' },
  { href: '/certificate', label: 'Verify Certificate', icon: 'verify' },
  { href: '/contact', label: 'Support Center', icon: 'support', external: false },
];

function MenuIcon({ name }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const icons = {
    projects: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="8" rx="2" />
        <rect x="14" y="3" width="7" height="5" rx="2" />
        <rect x="14" y="12" width="7" height="9" rx="2" />
        <rect x="3" y="15" width="7" height="6" rx="2" />
      </>
    ),
    profile: (
      <>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    saved: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
    support: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.8 2.8 0 0 1 5 1.8c0 2-2.5 2-2.5 4" />
        <path d="M12 18h.01" />
      </>
    ),
    login: (
      <>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="m10 17 5-5-5-5" />
        <path d="M15 12H3" />
      </>
    ),
    signup: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6" />
        <path d="M22 11h-6" />
      </>
    ),
    spark: <path d="M13 2 9 10l-7 3 7 3 4 8 4-8 7-3-7-3-4-8Z" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    verify: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 11 2 2 4-4" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </>
    ),
  };

  return <svg className="user-menu-icon" {...commonProps}>{icons[name]}</svg>;
}

function MenuLink({ item, onSelect }) {
  const content = (
    <>
      <MenuIcon name={item.icon} />
      <span>{item.label}</span>
    </>
  );

  if (item.external) {
    return (
      <a href={item.href} className="user-menu-item" role="menuitem" onClick={onSelect}>
        {content}
      </a>
    );
  }

  return (
    <Link href={item.href} className="user-menu-item" role="menuitem" onClick={onSelect}>
      {content}
    </Link>
  );
}

function ThemeMenuRow() {
  return (
    <div className="user-menu-theme-row">
      <span className="user-menu-theme-copy">
        <span className="user-menu-theme-title">Theme</span>
        <span className="user-menu-theme-meta">Light or dark mode</span>
      </span>
      <ThemeToggle />
    </div>
  );
}

export default function UserMenu() {
  const router = useRouter();
  const menuRef = useRef(null);
  const { user, profile, authLoading, profileLoading, isProfileComplete, signOutUser, deleteAccount } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');

  useEffect(() => {
    if (!accountOpen && !navOpen) {
      return;
    }

    const handleClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setAccountOpen(false);
        setNavOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setNavOpen(false);
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [accountOpen, navOpen]);

  const closeNavMenu = () => {
    setNavOpen(false);
  };

  const toggleNavMenu = (event) => {
    event.stopPropagation();
    setNavOpen((current) => !current);
    setAccountOpen(false);
  };

  const handleSignOut = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    setSigningOut(true);
    setAccountError('');
    setAccountOpen(false);
    closeNavMenu();

    try {
      await signOutUser();
      router.push('/');
    } catch (error) {
      console.error('Failed to sign out:', error);
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (deletingAccount || signingOut) return;

    const confirmed = window.confirm(
      'Delete your SkillBun account? This removes your login account, profile, roadmap progress, quiz/exam history, and roadmap certificates. Workforce credentials, employment records, and legal documents are retained. This cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setDeletingAccount(true);
    setAccountError('');

    try {
      const result = await deleteAccount();
      if (result?.warning) window.alert(result.warning);
      setAccountOpen(false);
      closeNavMenu();
      router.push('/');
    } catch (error) {
      console.error('Failed to delete account:', error);
      const message = error?.code === 'auth/requires-recent-login'
        ? 'For safety, log out and log back in before deleting your account.'
        : error?.message || 'Could not delete your account. Please try again.';
      setAccountError(message);
      setDeletingAccount(false);
    }
  };

  const toggleAccountMenu = (event) => {
    event.stopPropagation();
    setAccountOpen((current) => !current);
    closeNavMenu();
  };

  const siteMenuButton = (
    <button
      type="button"
      className={`mobile-menu-btn user-site-menu-btn ${navOpen ? 'active' : ''}`}
      id="mobileMenuBtn"
      aria-label="Toggle account and theme menu"
      aria-expanded={navOpen}
      aria-haspopup="menu"
      aria-controls="userMobileMenuPanel"
      onClick={toggleNavMenu}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="7" x2="20" y2="7"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="17" x2="20" y2="17"></line>
      </svg>
    </button>
  );

  if (authLoading || (user && profileLoading) || !profile?.hydrated) {
    return (
      <div className="mobile-dropdown-group user-menu-shell">
        <div className="user-menu-wrapper" ref={menuRef}>
          {siteMenuButton}
          {navOpen && (
            <div
              id="userMobileMenuPanel"
              className="user-menu-dropdown user-mobile-nav-panel"
              role="menu"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="user-menu-heading">
                <span className="user-menu-heading-title">SkillBun menu</span>
                <span className="user-menu-heading-meta">Loading your account options...</span>
              </div>
              <ThemeMenuRow />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mobile-dropdown-group user-menu-shell">
        <div className="user-menu-wrapper" ref={menuRef}>
          <div className={`user-control-cluster user-control-cluster-guest ${accountOpen ? 'is-account-open' : ''} ${navOpen ? 'is-nav-open' : ''}`}>
            <button
              type="button"
              className={`user-profile-pill user-profile-pill-guest ${accountOpen ? 'is-open' : ''}`}
              onClick={toggleAccountMenu}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              title="Open get started menu"
            >
              <span className="user-pill-avatar user-pill-avatar-guest" aria-hidden="true">
                <MenuIcon name="spark" />
              </span>
              <span className="user-pill-name user-pill-name-desktop">Get Started</span>
              <span className="user-pill-name user-pill-name-mobile">Get Started</span>
              <svg className={`user-pill-chevron ${accountOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <span className="user-control-divider" aria-hidden="true" />
            {siteMenuButton}
          </div>

          {accountOpen && (
            <div className="user-menu-dropdown user-menu-dropdown-guest" role="menu" onClick={(event) => event.stopPropagation()}>
              <div className="user-menu-heading">
                <span className="user-menu-heading-title">Welcome to SkillBun</span>
                <span className="user-menu-heading-meta">Start your career guidance profile.</span>
              </div>
              <div className="user-menu-list">
                {GUEST_ITEMS.map((item) => (
                  <MenuLink key={item.label} item={item} onSelect={() => setAccountOpen(false)} />
                ))}
              </div>
            </div>
          )}

          {navOpen && (
            <div
              id="userMobileMenuPanel"
              className="user-menu-dropdown user-menu-dropdown-guest user-mobile-nav-panel"
              role="menu"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="user-menu-heading">
                <span className="user-menu-heading-title">Welcome to SkillBun</span>
                <span className="user-menu-heading-meta">Start your career guidance profile.</span>
              </div>
              <div className="user-menu-list">
                {GUEST_ITEMS.map((item) => (
                  <MenuLink key={item.label} item={item} onSelect={closeNavMenu} />
                ))}
              </div>
              <div className="user-menu-divider" />
              <ThemeMenuRow />
            </div>
          )}
        </div>
      </div>
    );
  }

  const displayName = profile?.hasName ? (profile?.name || 'Student') : (user?.email?.split('@')[0] || 'Student');
  const firstName = (displayName || 'Student').split(' ')[0] || 'Student';
  const initials = (displayName || 'Student')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'S';
  const mobileInitial = initials[0] || 'S';
  const userEmail = (user?.email || '').toLowerCase().trim();
  const isGoogleLogin = Array.isArray(user?.providerData) &&
    user.providerData.some((p) => p.providerId === 'google.com');
  const isFounderAdmin = userEmail === 'harsh@skillbun.tech' && isGoogleLogin;
  const baseItems = isProfileComplete ? COMPLETE_PROFILE_ITEMS : INCOMPLETE_PROFILE_ITEMS;
  const accountItems = baseItems;

  return (
    <div className="mobile-dropdown-group user-menu-shell user-menu-shell-authenticated">
      <div className="user-menu-wrapper" ref={menuRef}>
        <div className={`user-control-cluster user-control-cluster-auth ${accountOpen ? 'is-account-open' : ''} ${navOpen ? 'is-nav-open' : ''}`}>
          <button
            type="button"
            className={`user-profile-pill user-profile-pill-split ${accountOpen ? 'is-open' : ''}`}
            onClick={toggleAccountMenu}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            title={`Logged in as ${displayName}`}
          >
            <span className="user-pill-avatar">
              <span className="user-pill-initials user-pill-initials-full">{initials}</span>
              <span className="user-pill-initials user-pill-initials-mobile">{mobileInitial}</span>
            </span>
            <span className="user-pill-name">{firstName}</span>
            <svg className={`user-pill-chevron ${accountOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <span className="user-control-divider" aria-hidden="true" />
          {siteMenuButton}
        </div>

        {accountOpen && (
          <div className="user-menu-dropdown" role="menu" onClick={(event) => event.stopPropagation()}>
            <div className="user-menu-heading user-menu-heading-auth">
              <span className="user-menu-heading-avatar">{initials}</span>
              <span className="user-menu-heading-copy">
                <span className="user-menu-heading-title">{displayName}</span>
                <span className="user-menu-heading-meta">
                  {isProfileComplete ? 'Student Account' : 'Profile setup needed'}
                </span>
              </span>
            </div>

            <div className="user-menu-list">
              {accountItems.map((item) => (
                <MenuLink key={item.label} item={item} onSelect={() => setAccountOpen(false)} />
              ))}
            </div>

            <div className="user-menu-divider" />
            <ThemeMenuRow />
            <div className="user-menu-divider" />

            <button
              className="user-menu-item user-menu-signout"
              onClick={handleSignOut}
              disabled={signingOut || deletingAccount}
              role="menuitem"
            >
              <MenuIcon name="logout" />
              <span>{signingOut ? 'Signing out...' : 'Log Out'}</span>
            </button>

            <button
              className="user-menu-item user-menu-delete"
              onClick={handleDeleteAccount}
              disabled={signingOut || deletingAccount}
              role="menuitem"
            >
              <MenuIcon name="trash" />
              <span>{deletingAccount ? 'Deleting account...' : 'Delete Account'}</span>
            </button>

            {accountError && <p className="user-menu-error" role="status">{accountError}</p>}
          </div>
        )}

        {navOpen && (
          <div
            id="userMobileMenuPanel"
            className="user-menu-dropdown user-mobile-nav-panel"
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="user-menu-heading user-menu-heading-auth">
              <span className="user-menu-heading-avatar">{initials}</span>
              <span className="user-menu-heading-copy">
                <span className="user-menu-heading-title">{displayName}</span>
                <span className="user-menu-heading-meta">
                  {isProfileComplete ? 'Student Account' : 'Profile setup needed'}
                </span>
              </span>
            </div>

            <div className="user-menu-list">
              {accountItems.map((item) => (
                <MenuLink key={item.label} item={item} onSelect={closeNavMenu} />
              ))}
            </div>

            <div className="user-menu-divider" />
            <ThemeMenuRow />
            <div className="user-menu-divider" />

            <button
              className="user-menu-item user-menu-signout"
              onClick={handleSignOut}
              disabled={signingOut || deletingAccount}
              role="menuitem"
            >
              <MenuIcon name="logout" />
              <span>{signingOut ? 'Signing out...' : 'Log Out'}</span>
            </button>

            <button
              className="user-menu-item user-menu-delete"
              onClick={handleDeleteAccount}
              disabled={signingOut || deletingAccount}
              role="menuitem"
            >
              <MenuIcon name="trash" />
              <span>{deletingAccount ? 'Deleting account...' : 'Delete Account'}</span>
            </button>

            {accountError && <p className="user-menu-error" role="status">{accountError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
