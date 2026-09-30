export function buildDashboardProjects(progressRows, roadmapsInfo) {
  return progressRows.flatMap(({ slug, completedNodeIds }) => {
    if (!Object.hasOwn(roadmapsInfo, slug)) return [];
    const info = roadmapsInfo[slug];
    const completed = new Set(completedNodeIds);
    const completedNodes = info.nodes.filter((node) => completed.has(node.id));
    if (completedNodes.length === 0) return [];

    return [{
      slug,
      label: info.title,
      done: completedNodes.length,
      total: info.nodes.length,
      earnedXp: completedNodes.reduce((sum, node) => sum + (node.exp || 100), 0),
    }];
  });
}
