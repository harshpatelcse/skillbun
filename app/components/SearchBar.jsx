"use client";

import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { useTranslation } from './I18nProvider';
import { startSearchRequest, nextSearchIndex } from '@/utils/client/searchRequest.mjs';

export default function SearchBar() {
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const cancelRequest = useRef(null);
  const isLoading = !response || response.query !== query;
  const hasError = !isLoading && response.error;
  const results = !isLoading && !hasError ? response.data : { pages: [], roadmaps: [] };
  const options = [
    ...results.pages.map((page) => ({ href: page.href, type: 'page' })),
    ...results.roadmaps.map((roadmap) => ({ href: `/roadmap/${roadmap.slug}`, type: 'roadmap' })),
  ];
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const mobileTriggerRef = useRef(null);
  const router = useRouter();

  const openSearch = () => {
    setIsOpen(true);
  };

  const closeSearch = () => {
    cancelRequest.current?.();
    setIsOpen(false);
    setResponse(null);
    setActiveIndex(-1);
  };

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex, listId]);

  // Keyboard shortcut (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
      if (e.key === 'Escape' && isOpen) {
        closeSearch();
        // The desktop combobox keeps focus; the hidden mobile panel returns
        // focus to its trigger. Outside-click and Tab never move focus here.
        if (mobileTriggerRef.current?.getClientRects().length) mobileTriggerRef.current.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search: closing, changing the query, and unmounting cancel old work.
  useEffect(() => {
    if (!isOpen) return;
    const cancel = startSearchRequest({
      query,
      onResult: (data) => {
        setResponse({ query, data });
        if (query.trim().length > 1) {
          trackEvent('search_query', {
            query_length: query.trim().length,
            results_count: data.pages.length + data.roadmaps.length,
          });
        }
      },
      onError: () => setResponse({ query, error: true }),
    });
    cancelRequest.current = cancel;
    return cancel;
  }, [query, isOpen]);

  const handleResultClick = (href, resultType) => {
    trackEvent('search_result_selected', { result_type: resultType, destination: href });
    closeSearch();
    setQuery('');
    router.push(href);
  };

  const handleInputKeyDown = (event) => {
    if (event.isComposing || event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openSearch();
      setActiveIndex(nextSearchIndex(event.key, activeIndex, options.length));
    } else if (event.key === 'Enter' && isOpen && options[activeIndex]) {
      event.preventDefault();
      const selected = options[activeIndex];
      handleResultClick(selected.href, selected.type);
    }
  };

  return (
    <div
      className={`search-container ${isOpen ? 'is-open' : ''}`}
      lang={locale}
      ref={searchRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeSearch();
      }}
    >
      <button
        type="button"
        ref={mobileTriggerRef}
        className="search-mobile-trigger"
        aria-label="Open search"
        aria-expanded={isOpen}
        onClick={openSearch}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      <div className="search-panel">
        <div
          className={`search-input-wrapper ${isOpen ? 'active' : ''}`}
          onClick={openSearch}
        >
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listId : undefined}
            aria-activedescendant={isOpen && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            maxLength={100}
            className="search-input"
            placeholder={t('nav.searchPlaceholder', 'Search roadmaps, pages...')}
            aria-label={t('nav.searchPlaceholder', 'Search roadmaps and pages')}
            value={query}
            onChange={(e) => {
              cancelRequest.current?.();
              setResponse(null);
              setActiveIndex(-1);
              setQuery(e.target.value);
              openSearch();
            }}
            onKeyDown={handleInputKeyDown}
            onFocus={openSearch}
          />
          <div className="search-shortcut">
            <kbd>⌘K</kbd>
          </div>
        </div>

        {isOpen && (
          <div className="search-dropdown">
            {isLoading ? (
              <div className="search-loading" role="status">
                <span className="search-spinner"></span> {t('common.searching', 'Searching...')}
              </div>
            ) : hasError ? (
              <div className="search-empty" role="status">
                {t('common.searchUnavailable', 'Search is unavailable. Please try again.')}
              </div>
            ) : results.pages.length === 0 && results.roadmaps.length === 0 ? (
              <div className="search-empty" role="status">
                {t('common.noResults', 'No results found for')} "{query}"
              </div>
            ) : null}
            <div id={listId} role="listbox" aria-label={t('nav.searchResults', 'Search results')} aria-busy={isLoading}>
            {!isLoading && !hasError && (
              <>
                {results.pages.length > 0 && (
                  <div className="search-group" role="group" aria-labelledby={`${listId}-pages`}>
                    <div className="search-group-label" id={`${listId}-pages`} role="presentation">{t('common.pages', 'Pages')}</div>
                    {results.pages.map((page, index) => (
                      <div
                        key={page.title}
                        className="search-item"
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={activeIndex === index}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleResultClick(page.href, 'page')}
                      >
                        <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        {page.title}
                      </div>
                    ))}
                  </div>
                )}

                {results.roadmaps.length > 0 && (
                  <div className="search-group" role="group" aria-labelledby={`${listId}-roadmaps`}>
                    <div className="search-group-label" id={`${listId}-roadmaps`} role="presentation">{t('common.roadmaps', 'Roadmaps')}</div>
                    {results.roadmaps.map((roadmap, index) => (
                      <div
                        key={roadmap.slug}
                        className="search-item"
                        id={`${listId}-${results.pages.length + index}`}
                        role="option"
                        aria-selected={activeIndex === results.pages.length + index}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(results.pages.length + index)}
                        onClick={() => handleResultClick(`/roadmap/${roadmap.slug}`, 'roadmap')}
                      >
                        <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        {roadmap.title}
                      </div>
                    ))}
                  </div>
                )}

              </>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
