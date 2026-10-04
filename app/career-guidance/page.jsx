import Link from 'next/link';
import { headers } from 'next/headers';
import styles from './career-guidance.module.css';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://skillbun.tech').replace(/\/+$/, '');
const title = 'Free Career Guidance for CS, BCA & BTech Students | SkillBun';
const description = 'Choose a tech career with free guidance for CS, BCA and BTech students. Compare paths, try an AI career quiz, and turn your next step into a learning roadmap.';

export const metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: `${siteUrl}/career-guidance` },
  openGraph: {
    type: 'website',
    title,
    description,
    url: `${siteUrl}/career-guidance`,
    siteName: 'SkillBun',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'SkillBun Logo' }],
  },
  twitter: {
    card: 'summary',
    title,
    description,
    images: ['/logo.png'],
  },
};

const comparisons = [
  {
    title: 'Frontend or backend development?',
    first: {
      name: 'Frontend development',
      href: '/roadmap/frontend',
      work: 'Build the parts people see and interact with: pages, forms, navigation and accessible interfaces.',
      trial: 'Create a responsive study planner with a form, filters and useful empty states. Start with HTML, CSS and JavaScript.',
    },
    second: {
      name: 'Backend development',
      href: '/roadmap/backend',
      work: 'Build the services behind an application: APIs, data storage, validation and permissions.',
      trial: 'Build a small task API that validates input and stores records. Explain how it handles a missing record or invalid request.',
    },
    takeaway: 'Choose based on which problems you enjoy solving. Fullstack combines both, but learning one side first can make the first project more manageable.',
  },
  {
    title: 'Data analyst or data scientist?',
    first: {
      name: 'Data analyst',
      href: '/roadmap/data_analyst',
      work: 'Answer practical questions with data, using spreadsheets, SQL, visualisation and clear explanations.',
      trial: 'Use a public dataset to answer one question. Clean the data, make a chart and describe a limitation in your conclusion.',
    },
    second: {
      name: 'Data scientist',
      href: '/roadmap/data_science',
      work: 'Use statistics, experiments and predictive models to study patterns and test hypotheses.',
      trial: 'Build a simple prediction baseline and evaluate it on data the model has not seen. Learn Python and statistics alongside the exercise.',
    },
    takeaway: 'Enjoying charts does not automatically mean you will enjoy modelling. Try an analysis task before deciding how deeply you want to study mathematics and machine learning.',
  },
  {
    title: 'Cybersecurity or cloud and DevOps?',
    first: {
      name: 'Cybersecurity',
      href: '/roadmap/cybersecurity',
      work: 'Understand threats, investigate events and improve how systems protect information.',
      trial: 'Review permissions and logs in a local lab. Start with networking, operating systems and security fundamentals. Practise only on systems you own or have permission to test.',
    },
    second: {
      name: 'Cloud and DevOps',
      href: '/roadmap/devops_cloud',
      work: 'Make applications easier to release, operate and recover through automation and infrastructure.',
      trial: 'Containerise a small app locally, automate a test and document how to restart it after failure. Study Linux and networking first.',
    },
    takeaway: 'Both reward patient troubleshooting. Security focuses on risk and protection; cloud and DevOps focus on reliable delivery and operation. They share useful foundations.',
  },
  {
    title: 'UI/UX design or fullstack development?',
    first: {
      name: 'UI/UX design',
      href: '/roadmap/ui_ux_design',
      work: 'Understand user needs and design clear flows, layouts and interactions that people can use.',
      trial: 'Observe someone completing a task, sketch an improved flow and test a simple prototype. Explain what changed after their feedback.',
    },
    second: {
      name: 'Fullstack development',
      href: '/roadmap/fullstack',
      work: 'Connect the interface, application logic and data into a working product.',
      trial: 'Extend a small frontend with one API and persistent storage. Keep the feature narrow enough to finish and explain.',
    },
    takeaway: 'Design involves research and iteration, not only visual taste. Development involves user decisions too, but adds implementation, testing and maintenance responsibilities.',
  },
];

const questions = [
  {
    question: 'How do I choose a tech career if I have no experience?',
    answer: 'Begin with the kind of task you want to try, rather than a job title. Build a small interface, analyse a dataset or explore a local systems lab. Compare your experience with a second activity. A career quiz can help you shortlist options, while a finished exercise gives you something concrete to judge.',
  },
  {
    question: 'Is this career guidance useful for BCA and BTech students?',
    answer: 'Yes. SkillBun uses your degree, year, interests and quiz answers as context for tech career suggestions. Your degree name alone does not decide the best path. Compare the roadmap foundations with what you already know and practise the topics you have not used yet.',
  },
  {
    question: 'Is the AI career quiz an aptitude test?',
    answer: 'It is a career discovery quiz that explores interests, preferences and technical scenarios. Treat its recommendations as options to investigate. It is not a validated psychometric aptitude assessment, a diagnosis of your ability or a prediction of employment.',
  },
  {
    question: 'Can I browse roadmaps without taking the quiz?',
    answer: 'Yes. Open the roadmap directory and choose a field directly. The quiz is useful when you want help narrowing your choices. Sign-in is needed for account features such as synced progress, full study guides and certification.',
  },
  {
    question: 'Does a SkillBun certificate guarantee a job?',
    answer: 'No. A SkillBun certificate records that you passed the platform’s roadmap assessment. It is not a university qualification, a vendor certification or a job guarantee. Combine your learning record with projects you can demonstrate and explain.',
  },
  {
    question: 'Should I learn several roadmaps at the same time?',
    answer: 'Start with one main path and use a second only when it supports the project you are building. For example, a frontend project may need a small amount of backend knowledge. Revisit your choice after completing a useful task instead of switching every time a new technology becomes popular.',
  },
];

export default async function CareerGuidancePage() {
  const nonce = (await headers()).get('x-nonce') || undefined;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${siteUrl}/career-guidance#webpage`,
        url: `${siteUrl}/career-guidance`,
        name: title,
        description,
        inLanguage: 'en',
        isPartOf: { '@id': `${siteUrl}/#website` },
        breadcrumb: { '@id': `${siteUrl}/career-guidance#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${siteUrl}/career-guidance#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Career guidance', item: `${siteUrl}/career-guidance` },
        ],
      },
    ],
  };

  return (
    <article className={styles.page}>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />

      <ol className={styles.breadcrumbs} aria-label="Breadcrumb">
        <li><Link href="/">Home</Link></li>
        <li aria-current="page">Career guidance</li>
      </ol>

      <header className={styles.hero}>
        <p className={styles.eyebrow}>A practical starting point</p>
        <h1>Free career guidance for tech students</h1>
        <p>Compare career paths, try a small project, and decide what to learn next with SkillBun.</p>
        <div className={styles.actions}>
          <Link href="/onboarding?next=/quiz" className={styles.primaryLink}>Start the free career quiz</Link>
          <Link href="/roadmap#roadmap-directory" className={styles.secondaryLink}>Browse learning roadmaps</Link>
        </div>
      </header>

      <div className={styles.readingLayout}>
        <aside className={styles.contents} aria-label="In this guide">
          <h2>In this guide</h2>
          <ul>
            <li><a href="#choose-a-career">Find your starting point</a></li>
            <li><a href="#compare-paths">Compare tech careers</a></li>
            <li><a href="#career-quiz">How the career quiz helps</a></li>
            <li><a href="#first-project">Try a two-week learning plan</a></li>
            <li><a href="#free-learning">Free learning and certificates</a></li>
            <li><a href="#questions">Common questions</a></li>
          </ul>
        </aside>

        <div className={styles.readingBody}>
          <section className={styles.section} id="choose-a-career" aria-labelledby="choose-title">
            <h2 id="choose-title">How to choose a tech career when everything looks interesting</h2>
            <p>
              If you are studying computer science, BCA or BTech, choosing between software development,
              data, design and infrastructure can feel harder than learning the first skill. You do not
              need to commit to a job title before you have tried the work. Start with a short list of
              roles and look for evidence from what you build.
            </p>
            <p>
              Separate <strong>interest</strong> from <strong>current ability</strong>. Interest tells you
              which problems you are curious enough to keep exploring. Ability develops through practice
              and feedback. Struggling with a first programming exercise does not rule out development;
              enjoying an AI demo does not yet tell you whether you enjoy statistics or model evaluation.
            </p>
            <h3>Use these questions to narrow your choices</h3>
            <ul className={styles.questionList}>
              <li><strong>Which activity would you try today?</strong> Making a page easier to use, explaining a pattern in data, investigating a system problem, or designing a better workflow?</li>
              <li><strong>What have you already practised?</strong> List tasks you can explain, including coursework and personal projects, rather than only languages on your resume.</li>
              <li><strong>Which foundations can you work on next?</strong> Consider programming, mathematics, communication, networking or visual design.</li>
              <li><strong>What can you finish with your available time and tools?</strong> A small working project teaches you more about a path than an unfinished collection of courses.</li>
            </ul>
            <p>
              Look at actual entry-level role descriptions in your target market to check expectations.
              Titles vary between employers, so compare the tasks and required skills rather than choosing
              from a salary headline alone.
            </p>
          </section>

          <section className={styles.section} id="compare-paths" aria-labelledby="compare-title">
            <h2 id="compare-title">Compare the work before you choose the roadmap</h2>
            <p>These are sample starting exercises, not prerequisites or promises of job readiness. Pick a pair that interests you and test the difference.</p>
            <div className={styles.comparisons}>
              {comparisons.map((comparison) => (
                <div className={styles.comparison} key={comparison.title}>
                  <h3>{comparison.title}</h3>
                  <div className={styles.comparisonColumns}>
                    {[comparison.first, comparison.second].map((career) => (
                      <div key={career.href}>
                        <h4><Link href={career.href}>{career.name} roadmap</Link></h4>
                        <p>{career.work}</p>
                        <p><strong>Try this:</strong> {career.trial}</p>
                      </div>
                    ))}
                  </div>
                  <p className={styles.takeaway}>{comparison.takeaway}</p>
                </div>
              ))}
            </div>
            <p>
              Already interested in a different field? The <Link href="/roadmap#roadmap-directory">full roadmap directory</Link> also
              includes mobile development, AI and machine learning, game development, systems and other tech paths.
            </p>
          </section>

          <section className={styles.section} id="career-quiz" aria-labelledby="quiz-title">
            <h2 id="quiz-title">How SkillBun’s AI career quiz helps you shortlist options</h2>
            <p>
              The free career quiz connects your profile with answers about your interests, work preferences
              and technical scenarios. It gives you a starting point for exploration, not a final verdict
              on your career.
            </p>
            <ol className={styles.steps}>
              <li><strong>Add your profile context.</strong> Begin with your name, degree, year and interests so the guidance has a starting point.</li>
              <li><strong>Complete the 10-question career discovery quiz.</strong> Answer based on your own preferences and understanding. The quiz adapts as you respond.</li>
              <li><strong>Review your top three career recommendations.</strong> Read the reasons and compare the suggested work with what you want to try.</li>
              <li><strong>Open a roadmap and test the direction.</strong> Choose a foundation topic, study its resources, then apply it in a small project.</li>
            </ol>
            <p>
              For follow-up help, <Link href="/counsellor">Bun-Bot, SkillBun’s AI career counsellor</Link>, can
              discuss roadmap choices and study planning using your profile and current conversation.
              Ask a concrete question such as “I know basic Python and enjoy working with spreadsheets;
              should I try data analysis or data science first?” Review AI suggestions against the roadmap,
              your own experience and reliable learning resources.
            </p>
          </section>

          <section className={styles.section} id="first-project" aria-labelledby="project-title">
            <h2 id="project-title">A suggested two-week plan to test one career path</h2>
            <p>
              Treat this as an adjustable experiment. If college work or other commitments limit your time,
              spread the same steps across a longer period.
            </p>
            <dl className={styles.plan}>
              <div><dt>Days 1–2: choose a question</dt><dd>Pick one roadmap and one small outcome. Write what the finished task should do and what you need to learn first.</dd></div>
              <div><dt>Days 3–5: learn the essentials</dt><dd>Work through the relevant foundation topics. Keep notes on concepts you can explain and the ones you still need to practise.</dd></div>
              <div><dt>Days 6–10: make something work</dt><dd>Build one narrow feature or analysis. Test normal and failure cases. Keep the work small enough to finish.</dd></div>
              <div><dt>Days 11–14: explain and reflect</dt><dd>Write a short README or case study covering your choices, results and limitations. Ask for feedback, then decide whether to continue the path or compare a second one.</dd></div>
            </dl>
            <p>
              Use the <Link href="/projects">SkillBun project ideas library</Link> for inspiration, then
              reduce a project to a first version you can complete. Your explanation of what worked,
              what failed and what you changed is part of the learning.
            </p>
          </section>

          <section className={styles.section} id="free-learning" aria-labelledby="free-title">
            <h2 id="free-title">What is free, and what does a certificate mean?</h2>
            <p>
              SkillBun’s career quiz, roadmaps, Bun-Bot guidance, study guides and roadmap certificates
              are free. Account features such as synced progress, full study guides and certification
              require sign-in. Linked third-party courses, books, cloud services and vendor exams may
              have their own fees, prerequisites or access limits.
            </p>
            <div className={styles.note}>
              <h3>Roadmap certification has an assessment</h3>
              <p>
                At least 60% recorded roadmap progress is required to unlock the certification exam.
                Passing requires at least 7 correct answers out of 10, or 70%. Attempt limits and
                study cooldowns apply. A certificate is earned by passing the assessment; simply
                opening or checking off a roadmap does not award one.
              </p>
              <p>
                The certificate is a publicly verifiable SkillBun learning credential. It is not a
                university degree, professional licence, vendor certification or promise of employment.
                Use it alongside demonstrable projects and your own explanation of the skills you practised.
              </p>
            </div>
          </section>

          <section className={styles.section} id="questions" aria-labelledby="questions-title">
            <h2 id="questions-title">Common questions about tech career guidance</h2>
            <div className={styles.faqs}>
              {questions.map(({ question, answer }) => (
                <details className={styles.faq} key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <div className={styles.nextStep}>
            <h2>Make your next step specific</h2>
            <p>Choose a path to explore, a skill to practise and a small project to finish. You can revise your direction as you learn.</p>
            <Link href="/onboarding?next=/quiz" className={styles.primaryLink}>Find a career starting point</Link>
            <p className={styles.aboutLink}>Learn more <Link href="/about">about SkillBun</Link> and how the platform works.</p>
          </div>
        </div>
      </div>
    </article>
  );
}
