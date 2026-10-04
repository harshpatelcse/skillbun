import Link from 'next/link';
import styles from './roadmap-directory.module.css';

export default function RoadmapDirectory({ categories, roadmaps }) {
  const groups = categories
    .filter((category) => category.id !== 'all')
    .map((category) => ({
      ...category,
      roadmaps: roadmaps.filter((roadmap) => roadmap.category === category.id),
    }))
    .filter((category) => category.roadmaps.length > 0);

  return (
    <section className={styles.directory} aria-labelledby="roadmap-directory-title" id="roadmap-directory">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Find your next learning path</p>
        <h2 id="roadmap-directory-title">Tech career roadmaps</h2>
        <p>
          Browse {roadmaps.length} free roadmaps by field. Each path breaks a role into topics you can work through,
          from foundations to practical skills. Open a roadmap to explore its learning sequence and available resources.
        </p>
        <p className={styles.related}>
          Unsure where to begin? Read our <Link href="/career-guidance">career guidance for tech students</Link>,
          or find <Link href="/projects">project ideas to practise what you learn</Link>.
        </p>
      </header>

      <div className={styles.groups}>
        {groups.map((group, index) => (
          <details key={group.id} className={styles.group} open={index === 0}>
            <summary>
              <h3>{group.label}</h3>
              <span className={styles.count}>{group.roadmaps.length} roadmaps</span>
            </summary>
            <ul className={styles.links}>
              {group.roadmaps.map((roadmap) => (
                <li key={roadmap.slug}>
                  <Link href={`/roadmap/${roadmap.slug}`} prefetch={false}>
                    {roadmap.title} roadmap
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
