'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';

// Predefined starter templates for each supported environment
const STARTER_TEMPLATES = {
  javascript: `// Interactive JavaScript Environment
// Supports ES6+, async/await, and console logging

function calculateFibonacci(count) {
  const sequence = [0, 1];
  for (let i = 2; i < count; i++) {
    sequence.push(sequence[i - 1] + sequence[i - 2]);
  }
  return sequence;
}

console.log("Welcome to SkillBun Code Playground!");
console.log("Generating first 10 Fibonacci numbers...");
const fib = calculateFibonacci(10);
console.log("Fibonacci:", fib);

// Test asynchronous operations
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  await delay(100);
  console.log("Async operation completed successfully! ✓");
})();
`,
  python: `# Interactive Python 3 Environment
# Powered by Pyodide (CPython compiled to WebAssembly)

import math
import json

def analyze_dataset(numbers):
    avg = sum(numbers) / len(numbers)
    variance = sum((x - avg) ** 2 for x in numbers) / len(numbers)
    std_dev = math.sqrt(variance)
    return {
        "count": len(numbers),
        "mean": round(avg, 2),
        "std_deviation": round(std_dev, 2),
        "min": min(numbers),
        "max": max(numbers)
    }

print("Running Python 3 WebAssembly in SkillBun Sandbox...")
scores = [88, 92, 79, 95, 85, 91, 100, 74, 89]
results = analyze_dataset(scores)
print("Analysis Results:")
print(json.dumps(results, indent=2))
`,
  html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      text-align: center;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
    }
    .card {
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      margin: 20px auto;
      background: #1e293b;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    .badge {
      display: inline-block;
      background: #10b981;
      color: #022c22;
      font-weight: 700;
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 20px;
      letter-spacing: 0.05em;
    }
    button {
      margin-top: 16px;
      background: #10b981;
      color: #022c22;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.1s ease;
    }
    button:active { transform: scale(0.96); }
    #counter { font-size: 2rem; font-weight: 800; margin: 12px 0; color: #34d399; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">SKILLBUN SANDBOX</span>
    <h2>Interactive Live Preview</h2>
    <p>Test web components and styles in real-time.</p>
    <div id="counter">0</div>
    <button onclick="increment()">Click to Counter</button>
  </div>
  <script>
    let count = 0;
    function increment() {
      count++;
      document.getElementById('counter').innerText = count;
      console.log('Button clicked! Current count:', count);
    }
  </script>
</body>
</html>
`,
};

function normalizeLanguage(lang) {
  if (!lang) return 'javascript';
  const clean = lang.toLowerCase().trim();
  if (['py', 'python', 'python3'].includes(clean)) return 'python';
  if (['html', 'htm', 'xml', 'svg', 'web'].includes(clean)) return 'html';
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'node'].includes(clean)) return 'javascript';
  return 'javascript';
}

export default function CodePlayground({
  initialCode = '',
  initialLanguage = 'javascript',
  topicName = 'Study Topic',
  roadmapTitle = 'SkillBun Roadmap',
}) {
  const normLang = normalizeLanguage(initialLanguage);
  const [language, setLanguage] = useState(normLang);
  const [code, setCode] = useState(initialCode || STARTER_TEMPLATES[normLang] || STARTER_TEMPLATES.javascript);
  const [outputs, setOutputs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('console'); // 'console' | 'preview'
  const [executionTime, setExecutionTime] = useState(null);
  const [pyodideStatus, setPyodideStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [copied, setCopied] = useState(false);

  // Synchronize incoming prop changes during render (React recommended pattern)
  const [prevProps, setPrevProps] = useState({ code: initialCode, language: initialLanguage });
  if (initialCode !== prevProps.code || initialLanguage !== prevProps.language) {
    const updatedLang = normalizeLanguage(initialLanguage);
    setPrevProps({ code: initialCode, language: initialLanguage });
    setLanguage(updatedLang);
    setCode(initialCode || STARTER_TEMPLATES[updatedLang] || STARTER_TEMPLATES.javascript);
    setOutputs([
      {
        type: 'system',
        content: `Loaded code snippet for "${topicName}" (${updatedLang.toUpperCase()})`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    setExecutionTime(null);
  }

  const editorRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const iframeRef = useRef(null);
  const pyodideRef = useRef(null);

  // Compute line count for gutter
  const lineCount = useMemo(() => {
    const lines = code.split('\n').length;
    return Math.max(lines, 1);
  }, [code]);

  // Synchronize textarea scroll with line numbers gutter
  const handleScroll = useCallback(() => {
    if (editorRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = editorRef.current.scrollTop;
    }
  }, []);

  // Append new log entry to outputs console
  const appendOutput = useCallback((type, content) => {
    setOutputs(prev => [
      ...prev.slice(-199), // retain last 200 outputs to prevent memory creep
      {
        type,
        content: typeof content === 'string' ? content : String(content),
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  // Clear console buffer
  const clearConsole = useCallback(() => {
    setOutputs([]);
    setExecutionTime(null);
  }, []);

  // Reset current language template
  const resetToTemplate = useCallback(() => {
    const template = STARTER_TEMPLATES[language] || STARTER_TEMPLATES.javascript;
    setCode(template);
    clearConsole();
    appendOutput('system', `Reset editor to default ${language.toUpperCase()} template.`);
  }, [language, clearConsole, appendOutput]);

  // Copy code to clipboard
  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [code]);

  // -------------------------------------------------------------
  // JAVASCRIPT RUNNER (Sandboxed Iframe with Console Interception)
  // -------------------------------------------------------------
  const runJavaScript = useCallback(async (src) => {
    const startTime = performance.now();
    clearConsole();
    appendOutput('system', 'Executing JavaScript in isolated sandbox...');

    return new Promise((resolve) => {
      // Create a temporary hidden sandboxed iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      // Strict security: sandbox only scripts, NO allow-same-origin (blocks cookies/storage)
      iframe.sandbox = 'allow-scripts';

      const timeoutId = setTimeout(() => {
        appendOutput('error', 'Execution timed out (limit: 3000ms). Possible infinite loop detected.');
        cleanup();
        resolve();
      }, 3000);

      const messageListener = (event) => {
        // Ensure message came from our worker
        if (event.source !== iframe.contentWindow) return;
        const { type, logType, message } = event.data || {};
        if (type === 'sk_log') {
          appendOutput(logType || 'log', message);
        } else if (type === 'sk_complete') {
          const duration = Math.round(performance.now() - startTime);
          setExecutionTime(duration);
          if (message !== undefined && message !== 'undefined') {
            appendOutput('result', `Return: ${message}`);
          }
          appendOutput('system', `✓ Execution finished in ${duration}ms`);
          cleanup();
          resolve();
        } else if (type === 'sk_error') {
          const duration = Math.round(performance.now() - startTime);
          setExecutionTime(duration);
          appendOutput('error', message);
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageListener);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      };

      window.addEventListener('message', messageListener);

      const safeHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body>
          <script>
            (function() {
              function send(type, logType, message) {
                window.parent.postMessage({ type: type, logType: logType, message: message }, '*');
              }
              function formatArg(arg) {
                if (arg === undefined) return 'undefined';
                if (arg === null) return 'null';
                if (typeof arg === 'object') {
                  try { return JSON.stringify(arg); } catch (e) { return String(arg); }
                }
                return String(arg);
              }

              console.log = function() {
                var args = Array.prototype.slice.call(arguments).map(formatArg).join(' ');
                send('sk_log', 'log', args);
              };
              console.info = function() {
                var args = Array.prototype.slice.call(arguments).map(formatArg).join(' ');
                send('sk_log', 'info', args);
              };
              console.warn = function() {
                var args = Array.prototype.slice.call(arguments).map(formatArg).join(' ');
                send('sk_log', 'warn', args);
              };
              console.error = function() {
                var args = Array.prototype.slice.call(arguments).map(formatArg).join(' ');
                send('sk_log', 'error', args);
              };

              window.onerror = function(msg, url, line, col, err) {
                send('sk_error', 'error', (err && err.message) ? err.message : msg);
                return true;
              };
              window.onunhandledrejection = function(e) {
                send('sk_error', 'error', 'Unhandled Promise Rejection: ' + (e.reason ? (e.reason.message || e.reason) : 'Error'));
              };

              try {
                var codeToRun = ${JSON.stringify(src)};
                var result = eval(codeToRun);
                if (result instanceof Promise) {
                  result.then(function(res) {
                    send('sk_complete', 'result', formatArg(res));
                  }).catch(function(err) {
                    send('sk_error', 'error', err ? (err.message || String(err)) : 'Promise Error');
                  });
                } else {
                  send('sk_complete', 'result', formatArg(result));
                }
              } catch (err) {
                send('sk_error', 'error', err ? (err.stack || err.message || String(err)) : 'Runtime error');
              }
            })();
          </script>
        </body>
        </html>
      `;

      document.body.appendChild(iframe);
      iframe.srcdoc = safeHtml;
    });
  }, [clearConsole, appendOutput]);

  // -------------------------------------------------------------
  // PYTHON RUNNER (Pyodide WebAssembly in Browser)
  // -------------------------------------------------------------
  const initPyodide = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current;
    if (typeof window !== 'undefined' && window.__skillbun_pyodide__) {
      pyodideRef.current = window.__skillbun_pyodide__;
      return pyodideRef.current;
    }

    setPyodideStatus('loading');
    appendOutput('system', 'Initializing Python WebAssembly environment (Pyodide)...');

    // Load Pyodide CDN script dynamically if not present
    if (typeof window !== 'undefined' && !window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Pyodide WebAssembly script from CDN.'));
        document.head.appendChild(script);
      });
    }

    const pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });

    window.__skillbun_pyodide__ = pyodide;
    pyodideRef.current = pyodide;
    setPyodideStatus('ready');
    appendOutput('system', '✓ Python 3.12 WebAssembly environment ready!');
    return pyodide;
  }, [appendOutput]);

  const runPython = useCallback(async (src) => {
    const startTime = performance.now();
    clearConsole();

    try {
      const pyodide = await initPyodide();
      appendOutput('system', 'Executing Python script...');

      // Redirect stdout and stderr using Python StringIO
      pyodide.runPython(`
import sys
from io import StringIO
__sb_stdout__ = StringIO()
__sb_stderr__ = StringIO()
sys.stdout = __sb_stdout__
sys.stderr = __sb_stderr__
`);

      // Run student code
      const result = await pyodide.runPythonAsync(src);

      // Extract captured output
      const stdout = pyodide.runPython('__sb_stdout__.getvalue()');
      const stderr = pyodide.runPython('__sb_stderr__.getvalue()');

      if (stdout) {
        stdout.split('\n').forEach(line => {
          if (line) appendOutput('log', line);
        });
      }
      if (stderr) {
        stderr.split('\n').forEach(line => {
          if (line) appendOutput('warn', line);
        });
      }
      if (result !== undefined && result !== null) {
        appendOutput('result', `Return: ${result}`);
      }

      const duration = Math.round(performance.now() - startTime);
      setExecutionTime(duration);
      appendOutput('system', `✓ Python execution finished in ${duration}ms`);
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      setExecutionTime(duration);
      appendOutput('error', err.message || String(err));
    }
  }, [initPyodide, clearConsole, appendOutput]);

  // -------------------------------------------------------------
  // HTML / WEB LIVE PREVIEW RUNNER
  // -------------------------------------------------------------
  const runHtmlPreview = useCallback((src) => {
    clearConsole();
    appendOutput('system', 'Rendering live HTML preview in isolated sandbox...');
    setActiveTab('preview');

    if (iframeRef.current) {
      // Intercept console.log inside iframe
      const injectedScript = `
        <script>
          (function() {
            var oldLog = console.log;
            console.log = function() {
              var args = Array.prototype.slice.call(arguments).join(' ');
              window.parent.postMessage({ type: 'sk_html_log', message: args }, '*');
              if (oldLog) oldLog.apply(console, arguments);
            };
          })();
        </script>
      `;
      iframeRef.current.srcdoc = injectedScript + src;
      setExecutionTime(1);
    }
  }, [clearConsole, appendOutput]);

  // Listen for messages from live HTML preview
  useEffect(() => {
    const handleHtmlLog = (e) => {
      if (e.data && e.data.type === 'sk_html_log') {
        appendOutput('log', `[Live Preview] ${e.data.message}`);
      }
    };
    window.addEventListener('message', handleHtmlLog);
    return () => window.removeEventListener('message', handleHtmlLog);
  }, [appendOutput]);

  // Master Run Dispatcher
  const runCode = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      if (language === 'javascript') {
        await runJavaScript(code);
      } else if (language === 'python') {
        await runPython(code);
      } else if (language === 'html') {
        runHtmlPreview(code);
      }
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, language, code, runJavaScript, runPython, runHtmlPreview]);

  // Handle Tab key and Auto-Indent
  const handleKeyDown = useCallback((e) => {
    // Run shortcut: Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
      return;
    }

    const textarea = editorRef.current;
    if (!textarea) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        // Shift+Tab: Remove 2 leading spaces if present
        const currentVal = textarea.value;
        const lineStart = currentVal.lastIndexOf('\n', start - 1) + 1;
        if (currentVal.slice(lineStart, lineStart + 2) === '  ') {
          const updated = currentVal.substring(0, lineStart) + currentVal.substring(lineStart + 2);
          setCode(updated);
          requestAnimationFrame(() => {
            textarea.selectionStart = Math.max(start - 2, lineStart);
            textarea.selectionEnd = Math.max(end - 2, lineStart);
          });
        }
      } else {
        // Tab: Insert 2 spaces
        const updated = code.substring(0, start) + '  ' + code.substring(end);
        setCode(updated);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    } else if (e.key === 'Enter') {
      // Auto-indent: inherit indentation of current line
      const start = textarea.selectionStart;
      const currentVal = textarea.value;
      const lineStart = currentVal.lastIndexOf('\n', start - 1) + 1;
      const currentLine = currentVal.substring(lineStart, start);
      const match = currentLine.match(/^(\s+)/);
      if (match) {
        e.preventDefault();
        const indent = match[1];
        const updated = currentVal.substring(0, start) + '\n' + indent + currentVal.substring(start);
        setCode(updated);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
        });
      }
    }
  }, [code, runCode]);

  // Generate deep-link to BunBot counsellor for debugging/explaining code
  const lastError = outputs.slice().reverse().find(o => o.type === 'error')?.content || '';
  const bunBotUrl = useMemo(() => {
    const prompt = lastError
      ? `I'm studying "${topicName}" on the ${roadmapTitle} and my ${language.toUpperCase()} code encountered an error:\n\n\`\`\`${language}\n${code.slice(0, 1000)}\n\`\`\`\n\nError output:\n${lastError.slice(0, 400)}\n\nCan you explain why this failed and how to fix it step by step?`
      : `I'm studying "${topicName}" on the ${roadmapTitle}. Here is my current ${language.toUpperCase()} code:\n\n\`\`\`${language}\n${code.slice(0, 1000)}\n\`\`\`\n\nCan you explain how this works, assess code quality, and provide practical tips to improve it?`;

    return `/counsellor?${new URLSearchParams({
      q: prompt,
      context: `${roadmapTitle} Study Guide: ${topicName}`,
    })}`;
  }, [topicName, roadmapTitle, language, code, lastError]);

  return (
    <div className="sk-code-playground" role="region" aria-label="Interactive Code Playground">
      {/* Top Toolbar */}
      <header className="sk-playground-toolbar">
        <div className="sk-playground-lang-group">
          <label htmlFor="sk-playground-lang-select" className="sk-playground-label">
            Environment:
          </label>
          <select
            id="sk-playground-lang-select"
            className="sk-playground-select"
            value={language}
            onChange={(e) => {
              const newLang = e.target.value;
              setLanguage(newLang);
              setCode(STARTER_TEMPLATES[newLang] || '');
              clearConsole();
              if (newLang === 'html') setActiveTab('preview');
              else setActiveTab('console');
            }}
          >
            <option value="javascript">JavaScript (ES6 / Node)</option>
            <option value="python">Python 3 (Pyodide WASM)</option>
            <option value="html">HTML5 / Web (Live Preview)</option>
          </select>

          {language === 'python' && (
            <span className={`sk-pyodide-status ${pyodideStatus}`}>
              {pyodideStatus === 'loading' ? '⚡ Loading WASM...' : pyodideStatus === 'ready' ? '✓ WASM Ready' : 'Python 3'}
            </span>
          )}
        </div>

        <div className="sk-playground-actions">
          <button
            type="button"
            className="sk-btn-tool"
            onClick={copyCode}
            aria-label="Copy code to clipboard"
            title="Copy code"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            )}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            type="button"
            className="sk-btn-tool"
            onClick={resetToTemplate}
            aria-label="Reset code to starter template"
            title="Reset code"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>Reset</span>
          </button>

          <button
            type="button"
            className="sk-btn-run"
            onClick={runCode}
            disabled={isRunning || (language === 'python' && pyodideStatus === 'loading')}
            aria-label="Run code (Ctrl + Enter)"
            title="Run code (Ctrl + Enter)"
          >
            {isRunning ? (
              <div className="sk-spinner-small" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
            <span>{isRunning ? 'Running...' : 'Run Code'}</span>
            <kbd className="sk-shortcut-badge">Ctrl+↵</kbd>
          </button>
        </div>
      </header>

      {/* Editor & Output Split Layout */}
      <div className="sk-playground-grid">
        {/* Code Editor Pane */}
        <div className="sk-editor-pane">
          <div className="sk-editor-container">
            {/* Line numbers gutter */}
            <div className="sk-line-numbers" ref={lineNumbersRef} aria-hidden="true">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="sk-line-num">{i + 1}</div>
              ))}
            </div>

            {/* Code textarea */}
            <textarea
              ref={editorRef}
              className="sk-code-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              aria-label="Code Editor"
              placeholder="Write or paste your code snippet here..."
            />
          </div>
        </div>

        {/* Output & Console Pane */}
        <div className="sk-output-pane">
          {/* Output Tabs Bar */}
          <div className="sk-output-tabs">
            <button
              type="button"
              className={`sk-output-tab ${activeTab === 'console' ? 'active' : ''}`}
              onClick={() => setActiveTab('console')}
            >
              Console Output
              {outputs.length > 0 && <span className="sk-log-count">{outputs.length}</span>}
            </button>

            {language === 'html' && (
              <button
                type="button"
                className={`sk-output-tab ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                Live Preview
              </button>
            )}

            <div className="sk-output-meta">
              {executionTime !== null && (
                <span className="sk-timing-badge">⚡ {executionTime}ms</span>
              )}
              {activeTab === 'console' && outputs.length > 0 && (
                <button
                  type="button"
                  className="sk-btn-clear"
                  onClick={clearConsole}
                  title="Clear console"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Console Output Screen */}
          {activeTab === 'console' && (
            <div className="sk-console-terminal" role="log" aria-label="Execution Output">
              {outputs.length === 0 ? (
                <div className="sk-console-empty">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                  <p>Console is empty. Click <strong>Run Code</strong> or press <strong>Ctrl+Enter</strong> to execute.</p>
                </div>
              ) : (
                <div className="sk-console-stream">
                  {outputs.map((out, idx) => (
                    <div key={idx} className={`sk-console-line ${out.type}`}>
                      <span className="sk-log-time">{out.timestamp}</span>
                      <span className="sk-log-indicator">
                        {out.type === 'error' ? '✖' : out.type === 'warn' ? '▲' : out.type === 'result' ? '←' : out.type === 'system' ? 'ℹ' : '›'}
                      </span>
                      <pre className="sk-log-text">{out.content}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HTML Live Preview Iframe */}
          <div
            className="sk-preview-wrapper"
            style={{ display: activeTab === 'preview' ? 'block' : 'none' }}
          >
            <iframe
              ref={iframeRef}
              className="sk-preview-iframe"
              sandbox="allow-scripts"
              title="Live HTML Preview"
            />
          </div>

          {/* AI BunBot Debug & Explain Assist Row */}
          <footer className="sk-playground-footer">
            <Link
              href={bunBotUrl}
              className={`sk-btn-ai-assist ${lastError ? 'has-error' : ''}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0ZM7 10h8M7 14h5"/>
              </svg>
              <span>{lastError ? 'Debug Error with Bun-Bot →' : 'Explain Code with Bun-Bot →'}</span>
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
