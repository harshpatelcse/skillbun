/** Load the full registry while keeping server pagination cursors opaque. */
export async function fetchAllWorkforceDocuments(token, { fetcher = fetch, signal } = {}) {
  const documents = [];
  const seen = new Set();
  let pageToken = null;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetcher(`/api/admin/workforce/documents?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      ...(signal ? { signal } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !Array.isArray(data.documents)) {
      throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Unable to load workforce documents.');
    }
    documents.push(...data.documents);
    pageToken = data.has_more ? data.nextPageToken : null;
    if (data.has_more && (typeof pageToken !== 'string' || !pageToken || seen.has(pageToken))) {
      throw new Error('The document registry returned an invalid page cursor.');
    }
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return documents;
}
