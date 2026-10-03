'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getTranslation,
  detectBrowserLocale,
} from '@/utils/shared/i18n';

const I18nContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, fallback) => fallback || key,
  locales: SUPPORTED_LOCALES,
  currentLocaleInfo: SUPPORTED_LOCALES[0],
});

export function I18nProvider({ children, initialLocale = DEFAULT_LOCALE }) {
  const [locale, setLocaleState] = useState(initialLocale);

  // Sync client overrides (?lang= or localStorage) after mount without SSR hydration mismatch
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        const isValid = (code) => SUPPORTED_LOCALES.some((l) => l.code === code);
        if (urlLang && isValid(urlLang)) {
          setLocaleState((current) => (urlLang !== current ? urlLang : current));
          return;
        }

        const savedLocale = localStorage.getItem('sb_locale');
        if (savedLocale && isValid(savedLocale)) {
          setLocaleState((current) => (savedLocale !== current ? savedLocale : current));
        }
      } catch {
        // ignore
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Sync document HTML attributes and cookies with active locale
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const activeLocale = SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];
      // Core account and learning workflows are currently English. Translated
      // regions declare their own language instead of relabelling English text.
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
      document.cookie = `sb_locale=${activeLocale.code}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [locale]);

  // Listen for browser popstate or custom locale change events
  useEffect(() => {
    const handlePopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && SUPPORTED_LOCALES.some((l) => l.code === urlLang)) {
          setLocaleState(urlLang);
        }
      } catch {
        // ignore
      }
    };

    const handleLocaleChange = (e) => {
      const targetLocale = e?.detail?.locale;
      if (targetLocale && SUPPORTED_LOCALES.some((l) => l.code === targetLocale)) {
        setLocaleState(targetLocale);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('sb_locale_change', handleLocaleChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('sb_locale_change', handleLocaleChange);
    };
  }, []);

  const setLocale = useCallback((newLocale) => {
    if (!SUPPORTED_LOCALES.some((l) => l.code === newLocale)) return;
    setLocaleState(newLocale);
    try {
      localStorage.setItem('sb_locale', newLocale);
      document.cookie = `sb_locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('lang', newLocale);
        window.history.replaceState({}, '', url.toString());
      }
      window.dispatchEvent(new CustomEvent('sb_locale_change', { detail: { locale: newLocale } }));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const t = useCallback(
    (keyPath, fallback) => {
      return getTranslation(locale, keyPath, fallback);
    },
    [locale]
  );

  const currentLocaleInfo = useMemo(() => {
    return SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      locales: SUPPORTED_LOCALES,
      currentLocaleInfo,
    }),
    [locale, setLocale, t, currentLocaleInfo]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, fallback) => fallback || key,
      locales: SUPPORTED_LOCALES,
      currentLocaleInfo: SUPPORTED_LOCALES[0],
    };
  }
  return context;
}
