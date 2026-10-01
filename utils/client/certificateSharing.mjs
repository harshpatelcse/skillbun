export function certificateShareUrl(id, siteUrl = 'https://skillbun.tech') {
  const origin = new URL(siteUrl || 'https://skillbun.tech').origin;
  return `${origin}/certificate/${encodeURIComponent(String(id || '').replace(/\//g, '-'))}`;
}

export function linkedInCertificateUrl(cert, { siteUrl, organizationId } = {}) {
  const certType = (cert.cert_type || 'ROADMAP').toUpperCase();
  let name = `${cert.roadmapTitle || 'Career Roadmap'} Certification`;
  if (certType === 'INTERNSHIP') name = `Internship Certificate - ${cert.stream_or_track || cert.department || 'Engineering'}`;
  if (certType === 'TRAINING') name = `Training Certificate - ${cert.stream_or_track || 'Technical Track'}`;
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME', name,
    certUrl: certificateShareUrl(cert.id || cert.display_id, siteUrl),
    certId: cert.display_id || cert.id,
  });
  if (organizationId) params.set('organizationId', organizationId);
  else params.set('organizationName', 'SkillBun');
  const date = cert.createdAtDate;
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    params.set('issueYear', String(date.getFullYear()));
    params.set('issueMonth', String(date.getMonth() + 1));
  }
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
