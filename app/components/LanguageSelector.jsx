'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from './I18nProvider';

export default function LanguageSelector({ variant = 'nav' }) {
  const { locale, setLocale, locales, currentLocaleInfo } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const listId = useId();

  useEffect(() => {
    if (isOpen) optionRefs.current[locales.findIndex((loc) => loc.code === locale)]?.focus();
  }, [isOpen, locale, locales]);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleDropdown = () => setIsOpen((prev) => !prev);

  const selectLocale = (code) => {
    setLocale(code);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const isFooter = variant === 'footer';

  return (
    <div
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        const current = optionRefs.current.indexOf(event.target);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? locales.length - 1 :
          (current + (event.key === 'ArrowDown' ? 1 : -1) + locales.length) % locales.length;
        optionRefs.current[next]?.focus();
      }}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleDropdown}
        aria-label="Select language"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: isFooter ? 'var(--card-bg, #ffffff)' : 'var(--card-bg, #ffffff)',
          border: '1.5px solid var(--border, #e2e8f0)',
          borderRadius: '8px',
          padding: isFooter ? '5px 10px' : '6px 12px',
          fontSize: '0.85rem',
          fontWeight: '600',
          fontFamily: 'var(--font-nunito), sans-serif',
          color: 'var(--text)',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--green, #22c55e)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = 'var(--border, #e2e8f0)';
        }}
      >
        {/* Globe SVG Vector Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--green, #22c55e)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>

        <span>{currentLocaleInfo.nativeName}</span>

        {/* Chevron SVG Vector Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            opacity: 0.7,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          id={listId}
          role="listbox"
          aria-label="Available languages"
          style={{
            position: 'absolute',
            top: isFooter ? 'auto' : 'calc(100% + 6px)',
            bottom: isFooter ? 'calc(100% + 6px)' : 'auto',
            right: 0,
            zIndex: 1000,
            minWidth: '190px',
            background: 'var(--card-bg, #ffffff)',
            border: '1.5px solid var(--border, #e2e8f0)',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {locales.map((loc, index) => {
            const isSelected = loc.code === locale;
            return (
              <button
                key={loc.code}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectLocale(loc.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isSelected ? 'var(--green-subtle-strong)' : 'transparent',
                  color: isSelected ? 'var(--green)' : 'var(--text)',
                  fontWeight: isSelected ? '700' : '500',
                  fontSize: '0.84rem',
                  fontFamily: 'var(--font-nunito), sans-serif',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'var(--green-subtle)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span>{loc.nativeName}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    opacity: 0.65,
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                  }}
                >
                  {loc.code}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
