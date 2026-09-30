export const PLAYGROUND_LIMITS = Object.freeze({
  codeCharacters: 65_536,
  outputMessages: 200,
  outputCharacters: 65_536,
  messageCharacters: 4096,
  javascriptStartupMs: 10_000,
  pythonStartupMs: 60_000,
  javascriptExecutionMs: 3000,
  pythonExecutionMs: 5000,
});

export function normalizePlaygroundLanguage(language) {
  const value = String(language || '').trim().toLowerCase();
  if (!value || ['js', 'javascript', 'ecmascript'].includes(value)) return 'javascript';
  if (['py', 'python', 'python3'].includes(value)) return 'python';
  if (['html', 'htm', 'xml', 'svg', 'web'].includes(value)) return 'html';
  return 'unsupported';
}

export function playgroundSupportMessage(language) {
  if (normalizePlaygroundLanguage(language) !== 'unsupported') return '';
  return `${String(language || 'This language').slice(0, 60)} is not an executable runtime here. Your snippet is preserved. Choose browser JavaScript, Python, or a static HTML/CSS preview; TypeScript, JSX and Node.js require separate tooling.`;
}

export const STATIC_PREVIEW_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
