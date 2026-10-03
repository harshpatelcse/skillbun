/** Preference signals are exploration aids, never calibrated probabilities. */
export function scoreDiscoveryChoice(state, option, catalog) {
  const tags = [...new Set(Array.isArray(option?.tags) ? option.tags : [])]
    .filter(tag => typeof tag === 'string' && Object.hasOwn(catalog, tag));
  // A broad answer that names several careers contributes one signal overall,
  // rather than receiving more influence just because its tag list is longer.
  for (const tag of tags) {
    state.tagScores[tag] = (state.tagScores[tag] || 0) + 1 / tags.length;
    const mappedPillar = catalog[tag].pillar;
    if (Object.hasOwn(state.pillarScores, mappedPillar)) state.pillarScores[mappedPillar] += 1 / tags.length;
  }
  const pillar = catalog[tags[0]]?.pillar;
  return { tags, pillar };
}

export function rankDiscoveryCareers(state, catalog) {
  return Object.keys(catalog).sort((left, right) =>
    (state.tagScores[right] || 0) - (state.tagScores[left] || 0)
    || (state.pillarScores[catalog[right].pillar] || 0) - (state.pillarScores[catalog[left].pillar] || 0)
    || left.localeCompare(right));
}

export function catalogCareer(slug, catalog, { description = '', related = false } = {}) {
  if (!Object.hasOwn(catalog, slug)) return null;
  const metadata = catalog[slug];
  return {
    catalogGrounded: true,
    title: metadata.title,
    description: description || metadata.description,
    skills: metadata.skills,
    salaryRange: metadata.salary || 'No estimate is published for this path.',
    salaryNote: metadata.salaryNote,
    recommendationLabel: related ? 'Related path to explore' : 'Suggested path',
    nextSteps: 'Try a small project from this roadmap and check whether you enjoy the work. These suggestions do not predict career success or employment.',
    roadmapUrl: slug,
  };
}

export function groundDiscoveryResults(response, state, catalog) {
  const seen = new Set();
  const careers = [];
  for (const career of response?.careers || []) {
    const slug = career?.roadmapUrl;
    if (!Object.hasOwn(catalog, slug) || seen.has(slug)) continue;
    seen.add(slug);
    careers.push(catalogCareer(slug, catalog, { description: career.description }));
    if (careers.length === 3) break;
  }
  for (const slug of rankDiscoveryCareers(state, catalog)) {
    if (careers.length === 3) break;
    if (!seen.has(slug)) { seen.add(slug); careers.push(catalogCareer(slug, catalog)); }
  }
  return { type: 'result', careers };
}
