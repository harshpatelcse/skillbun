export function passwordResetOrigin({ configuredOrigin, requestOrigin = '', environment = process.env.NODE_ENV }) {
  const parse = value => {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid application origin.');
    return url;
  };
  if (environment !== 'production' && requestOrigin) {
    try {
      const local = parse(requestOrigin);
      if (local.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(local.hostname)) return local.origin;
    } catch {}
  }
  const configured = parse(configuredOrigin);
  if (configured.protocol !== 'https:' || configured.port || ['localhost', '127.0.0.1'].includes(configured.hostname)) throw new Error('Canonical HTTPS application origin is required.');
  return configured.origin;
}

export function canonicalPasswordResetLink(rawLink, base) {
  const link = new URL(rawLink);
  const origin = new URL(base);
  link.protocol = origin.protocol;
  link.host = origin.host;
  link.username = '';
  link.password = '';
  return link.toString();
}
