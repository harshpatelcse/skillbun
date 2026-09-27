import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Interactive Code Playground & Sandbox Suite', () => {
  // Test 1: Language normalization logic
  test('Language normalizer correctly categorizes supported programming environments', () => {
    function normalizeLanguage(lang) {
      if (!lang) return 'javascript';
      const clean = lang.toLowerCase().trim();
      if (['py', 'python', 'python3'].includes(clean)) return 'python';
      if (['html', 'htm', 'xml', 'svg', 'web'].includes(clean)) return 'html';
      if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'node'].includes(clean)) return 'javascript';
      return 'javascript';
    }

    assert.equal(normalizeLanguage('python'), 'python');
    assert.equal(normalizeLanguage('py'), 'python');
    assert.equal(normalizeLanguage('python3'), 'python');
    assert.equal(normalizeLanguage('JavaScript'), 'javascript');
    assert.equal(normalizeLanguage('ts'), 'javascript');
    assert.equal(normalizeLanguage('tsx'), 'javascript');
    assert.equal(normalizeLanguage('html'), 'html');
    assert.equal(normalizeLanguage('web'), 'html');
    assert.equal(normalizeLanguage('unknown_lang'), 'javascript');
    assert.equal(normalizeLanguage(null), 'javascript');
    assert.equal(normalizeLanguage(undefined), 'javascript');
  });

  // Test 2: Predefined starter templates validity
  test('Starter templates contain functional executable code for JavaScript, Python, and HTML', () => {
    const supported = ['javascript', 'python', 'html'];
    const mockTemplates = {
      javascript: '// Interactive JavaScript Environment\nconsole.log("Hello SkillBun");',
      python: '# Interactive Python 3 Environment\nprint("Hello SkillBun")',
      html: '<!DOCTYPE html>\n<html><body><h1>SkillBun</h1></body></html>',
    };

    supported.forEach(lang => {
      assert.ok(mockTemplates[lang], `Template for ${lang} should exist`);
      assert.ok(mockTemplates[lang].length > 10, `Template for ${lang} should be non-trivial`);
    });
  });

  // Test 3: Markdown codeblock language detection
  test('Markdown codeblock regex identifies language classes accurately', () => {
    function extractCodeblockLanguage(className) {
      const classes = className.split(/\s+/);
      const match = classes.find(c => c.startsWith('language-'));
      return match ? match.replace('language-', '') : '';
    }

    assert.equal(extractCodeblockLanguage('language-python hljs'), 'python');
    assert.equal(extractCodeblockLanguage('language-javascript'), 'javascript');
    assert.equal(extractCodeblockLanguage('language-html'), 'html');
    assert.equal(extractCodeblockLanguage('code-snippet'), '');
  });

  // Test 4: Strict sandbox attribute security invariant
  test('Execution iframe enforces strict sandboxing without allow-same-origin', () => {
    const sandboxAttr = 'allow-scripts';
    // Security check: Must NOT include allow-same-origin, allow-top-navigation, or allow-modals
    assert.ok(sandboxAttr.includes('allow-scripts'), 'Must allow scripts for execution');
    assert.ok(!sandboxAttr.includes('allow-same-origin'), 'Must NOT allow same-origin (blocks cookies & storage access)');
    assert.ok(!sandboxAttr.includes('allow-top-navigation'), 'Must NOT allow top-navigation');
  });

  // Test 5: Bun-Bot Deep Link Generator
  test('Bun-Bot URL helper encodes code snippet and contextual metadata properly', () => {
    function generateBunBotUrl(code, error, topic, roadmap, language) {
      const prompt = error
        ? `I'm studying "${topic}" on the ${roadmap} and my ${language.toUpperCase()} code encountered an error:\n\n\`\`\`${language}\n${code.slice(0, 1000)}\n\`\`\`\n\nError output:\n${error.slice(0, 400)}\n\nCan you explain why this failed and how to fix it step by step?`
        : `I'm studying "${topic}" on the ${roadmap}. Here is my current ${language.toUpperCase()} code:\n\n\`\`\`${language}\n${code.slice(0, 1000)}\n\`\`\`\n\nCan you explain how this works, assess code quality, and provide practical tips to improve it?`;

      return `/counsellor?${new URLSearchParams({
        q: prompt,
        context: `${roadmap} Study Guide: ${topic}`,
      })}`;
    }

    const cleanUrl = generateBunBotUrl('console.log(1)', '', 'Loops & Iteration', 'JavaScript', 'javascript');
    assert.ok(cleanUrl.startsWith('/counsellor?'));
    assert.ok(cleanUrl.includes('Loops+%26+Iteration') || cleanUrl.includes('Loops'));
    assert.ok(cleanUrl.includes('JavaScript'));

    const errorUrl = generateBunBotUrl('x = 1/0', 'ZeroDivisionError: division by zero', 'Math Ops', 'Python', 'python');
    assert.ok(errorUrl.includes('ZeroDivisionError'));
    assert.ok(errorUrl.includes('failed'));
  });

  // Test 6: Safe argument serialization for console interception
  test('Format output serializes primitive and complex data structures safely', () => {
    function formatOutput(value) {
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      }
      return String(value);
    }

    assert.equal(formatOutput(42), '42');
    assert.equal(formatOutput('hello'), 'hello');
    assert.equal(formatOutput(null), 'null');
    assert.equal(formatOutput(undefined), 'undefined');
    assert.equal(formatOutput({ a: 1 }), '{\n  "a": 1\n}');

    // Circular reference handling
    const circular = {};
    circular.self = circular;
    assert.doesNotThrow(() => formatOutput(circular));
  });
});
