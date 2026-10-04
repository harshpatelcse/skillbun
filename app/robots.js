export default function robots() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech').replace(/\/+$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Account pages must remain crawlable so bots can read their noindex.
        // Access control is enforced separately; robots.txt is not an auth gate.
        disallow: ['/api/'],
      },
      {
        // Preserve crawler access; allowing a bot does not guarantee search visibility.
        userAgent: [
          'GPTBot',
          'ClaudeBot',
          'PerplexityBot',
          'Google-Extended',
          'GoogleOther',
          'ChatGPT-User',
          'Bytespider',
          'CCBot',
          'Diffbot',
          'FacebookBot',
        ],
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
