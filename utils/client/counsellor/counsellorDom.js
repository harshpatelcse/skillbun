'use client';

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { clearHumanProof } from './counsellorState';
import { RATE_LIMIT_KEY, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, getRateLimitData } from './counsellorApi';
import { readProfileSnapshot } from '../../shared/profileStore';

if (typeof marked?.setOptions === 'function') {
  marked.setOptions({
    headerIds: false,
    mangle: false,
    breaks: true
  });
}

export function getEl(id) {
  return document.getElementById(id);
}

export function toggleSecurityBanner(show) {
  const banner = getEl('securityBanner');
  if (!banner) return;
  banner.style.display = show ? 'block' : 'none';
}

export function getStoredProfile() {
  const { name, degree, year } = readProfileSnapshot();
  return { name, degree, year };
}

export function redirectToProfileSetup(destination) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/onboarding?next=${encodeURIComponent('/' + destination.replace('.html', ''))}`;
}

export function loadProfile(state) {
  const { name, degree, year } = getStoredProfile();
  if (!degree || !year) {
    redirectToProfileSetup('counsellor');
    return false;
  }

  state.userProfile = { name: name || 'Student', degree, year };

  const badge = getEl('userBadge');
  const dropdownName = getEl('dropdownName');
  const dropdownDegree = getEl('dropdownDegree');
  const dropdownYear = getEl('dropdownYear');

  if (badge) badge.textContent = `User: ${name}`;
  if (dropdownName) dropdownName.textContent = name;
  if (dropdownDegree) dropdownDegree.textContent = degree;
  if (dropdownYear) dropdownYear.textContent = year;
  return true;
}

export function getSvgIcon(iconKey) {
  const str = String(iconKey || '');
  if (str.includes('💰')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  if (str.includes('⚡') || str.includes('💻')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  if (str.includes('🚀')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/></svg>`;
  if (str.includes('☁️')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a5.5 5.5 0 0 1-5.5-5.5c0-2.4 1.5-4.4 3.7-5.1A7 7 0 0 1 20 11a5.5 5.5 0 0 1-2.5 8z"/></svg>`;
  if (str.includes('🛡️') || str.includes('🔐') || str.includes('🐧')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  if (str.includes('📜') || str.includes('🎓') || str.includes('📚')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`;
  if (str.includes('📅')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  if (str.includes('📈') || str.includes('📊')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  if (str.includes('💼') || str.includes('📄')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
  if (str.includes('🌐') || str.includes('🤝')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  if (str.includes('🎯')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
  if (str.includes('🤖') || str.includes('🧠')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/></svg>`;
  
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
}

export function hideSuggestionsSection() {
  const wrapper = getEl('chatSuggestionsWrapper');
  if (wrapper) wrapper.style.display = 'none';

  const header = document.querySelector('.chat-suggestions-header');
  if (header) header.style.display = 'none';

  const container = getEl('chatSuggestions');
  if (container) container.style.display = 'none';
}

export function showSuggestionsSection() {
  const wrapper = getEl('chatSuggestionsWrapper');
  if (wrapper) wrapper.style.display = 'block';

  const header = document.querySelector('.chat-suggestions-header');
  if (header) header.style.display = 'flex';

  const container = getEl('chatSuggestions');
  if (container) container.style.display = 'flex';
}

export function renderSuggestionChips(chips = [], onChipClick = () => {}) {
  const container = getEl('chatSuggestions');
  if (!container) return;

  if (!chips || chips.length === 0) {
    hideSuggestionsSection();
    return;
  }

  showSuggestionsSection();
  container.style.display = 'flex';
  container.style.opacity = '0';
  container.innerHTML = '';
  chips.forEach((chip) => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-chip';
    btn.innerHTML = `<span class="chip-icon">${getSvgIcon(chip.icon)}</span> ${escapeHTML(chip.text)}`;
    btn.addEventListener('click', () => onChipClick(chip.text));
    container.appendChild(btn);
  });

  setTimeout(() => {
    container.style.transition = 'opacity 0.25s ease-in-out';
    container.style.opacity = '1';
  }, 30);
}

const BOT_SVG_AVATAR = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/></svg>`;

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

export function sanitizeHTML(unsafeHtml) {
  return DOMPurify.sanitize(String(unsafeHtml ?? ''), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'textarea', 'select', 'option', 'img', 'video', 'audio', 'source', 'picture'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/)|#)/i
  });
}

export function renderBotHTML(text) {
  const safeText = String(text ?? '');

  if (typeof marked?.parse === 'function') {
    return sanitizeHTML(marked.parse(safeText));
  }

  const escaped = escapeHTML(safeText)
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return '<p>' + escaped + '</p>';
}

export function appendMessage(state, role, text) {
  const container = getEl('chatMessages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${role}`;
  if (role === 'bot') {
    avatar.innerHTML = BOT_SVG_AVATAR;
  } else {
    avatar.textContent = state.userProfile.name ? state.userProfile.name.charAt(0).toUpperCase() : 'U';
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  if (role === 'user') {
    msgDiv.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    msgDiv.appendChild(p);
  } else {
    msgDiv.innerHTML = '';
    const cleanHtml = sanitizeHTML(renderBotHTML(text));
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');
    while (doc.body.firstChild) {
      msgDiv.appendChild(doc.body.firstChild);
    }
  }

  row.appendChild(avatar);
  row.appendChild(msgDiv);
  container.appendChild(row);

  // Auto-scroll
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 50);
}

export function appendStreamingMessage(state, role, text, onComplete) {
  const container = getEl('chatMessages');
  if (!container) return;

  if (role === 'user') {
    appendMessage(state, role, text);
    if (onComplete) onComplete();
    return;
  }

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${role}`;
  avatar.innerHTML = BOT_SVG_AVATAR;

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  msgDiv.innerHTML = '';

  row.appendChild(avatar);
  row.appendChild(msgDiv);
  container.appendChild(row);

  // Live Typewriter Streaming Effect (ChatGPT & Google Gemini Style!)
  const tokens = String(text ?? '').split(/(\s+)/);
  let currentIndex = 0;
  let currentText = '';

  function typeNextToken() {
    if (state.signal.aborted || !row.isConnected) return;
    if (currentIndex >= tokens.length) {
      msgDiv.innerHTML = renderBotHTML(text);
      container.scrollTop = container.scrollHeight;
      if (onComplete) onComplete();
      return;
    }

    const count = Math.min(3, tokens.length - currentIndex);
    for (let i = 0; i < count; i++) {
      currentText += tokens[currentIndex + i];
    }
    currentIndex += count;

    msgDiv.innerHTML = renderBotHTML(currentText);
    container.scrollTop = container.scrollHeight;

    setTimeout(typeNextToken, 16);
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    currentIndex = tokens.length;
  }
  typeNextToken();
}

export function setCaptchaStatus(message, tone) {
  const statusEl = getEl('captchaStatus');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.style.color = tone === 'error' ? 'var(--danger)' : tone === 'ok' ? 'var(--success)' : 'var(--text)';
}

export function toggleDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = getEl('userDropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

export function logoutUser(state) {
  localStorage.removeItem('sb_name');
  localStorage.removeItem('sb_email');
  localStorage.removeItem('sb_degree');
  localStorage.removeItem('sb_year');
  localStorage.removeItem(RATE_LIMIT_KEY);
  clearHumanProof(state);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/';
}

export function updateUsageLimitCard() {
  const limitCountEl = getEl('limitCount');
  const limitBarEl = getEl('limitBar');
  const limitResetEl = getEl('limitReset');

  if (!limitCountEl || !limitBarEl || !limitResetEl) return;

  let { count, windowStart } = getRateLimitData();
  const now = Date.now();

  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    count = 0;
  }

  const remaining = Math.max(0, RATE_LIMIT_MAX - count);
  limitCountEl.textContent = `${remaining} / ${RATE_LIMIT_MAX}`;

  const mobileLimitCountEl = getEl('mobileLimitCount');
  if (mobileLimitCountEl) {
    mobileLimitCountEl.textContent = `${remaining}/${RATE_LIMIT_MAX}`;
  }

  const percent = Math.min(100, Math.max(0, (remaining / RATE_LIMIT_MAX) * 100));
  limitBarEl.style.width = `${percent}%`;

  limitBarEl.classList.remove('green', 'warning', 'danger');
  if (remaining >= 10) {
    limitBarEl.classList.add('green');
  } else if (remaining >= 5) {
    limitBarEl.classList.add('warning');
  } else {
    limitBarEl.classList.add('danger');
  }

  if (count === 0) {
    limitResetEl.textContent = 'Timer starts on first message';
  } else {
    const msLeft = (windowStart + RATE_LIMIT_WINDOW_MS) - now;
    if (msLeft <= 0) {
      limitResetEl.textContent = 'Resets soon';
    } else {
      const minsLeft = Math.floor(msLeft / 60000);
      const secsLeft = Math.floor((msLeft % 60000) / 1000);
      limitResetEl.textContent = `Resets in ${minsLeft}m ${secsLeft}s`;
    }
  }
}
