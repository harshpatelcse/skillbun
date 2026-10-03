/**
 * SkillBun Offline Knowledge & Intent Engine for BunBot AI Career Advisor.
 * 100% Free, Zero-API-Key, Zero-Quota Open-Source Knowledge System.
 */

const SKILLBUN_CONTACT_EMAIL = 'harsh@skillbun.tech';

const ROADMAP_MAPPINGS = [
  { keywords: ['frontend', 'react', 'css', 'html', 'vue', 'angular', 'svelte'], slug: 'frontend', name: 'Frontend Developer' },
  { keywords: ['backend', 'node', 'express', 'django', 'fastapi', 'spring', 'api'], slug: 'backend', name: 'Backend Developer' },
  { keywords: ['fullstack', 'full stack', 'mern', 'mean', 'nextjs'], slug: 'fullstack', name: 'Fullstack Engineer' },
  { keywords: ['ai', 'ml', 'machine learning', 'artificial intelligence', 'deep learning'], slug: 'ai_ml_engineer', name: 'AI/ML Engineer' },
  { keywords: ['generative ai', 'genai', 'llm', 'prompt', 'chatgpt'], slug: 'generative_ai_app_developer', name: 'Generative AI Developer' },
  { keywords: ['data science', 'data scientist', 'pandas', 'numpy'], slug: 'data_science', name: 'Data Scientist' },
  { keywords: ['data analyst', 'sql', 'powerbi', 'tableau', 'excel'], slug: 'data_analyst', name: 'Data Analyst' },
  { keywords: ['devops', 'docker', 'kubernetes', 'ci/cd', 'jenkins'], slug: 'devops_cloud', name: 'DevOps & Cloud Engineer' },
  { keywords: ['cloud', 'aws', 'azure', 'gcp'], slug: 'aws_cloud_engineer', name: 'AWS Cloud Engineer' },
  { keywords: ['cybersecurity', 'security', 'ethical hacking', 'pen testing'], slug: 'cybersecurity', name: 'Cybersecurity Specialist' },
  { keywords: ['android', 'kotlin', 'java app', 'mobile app'], slug: 'android', name: 'Android Developer' },
  { keywords: ['ios', 'swift', 'apple developer'], slug: 'ios_developer', name: 'iOS Developer' },
  { keywords: ['flutter', 'cross platform'], slug: 'flutter_developer', name: 'Flutter Developer' },
  { keywords: ['python'], slug: 'python_developer', name: 'Python Developer' },
  { keywords: ['java'], slug: 'java_developer', name: 'Java Enterprise Developer' },
  { keywords: ['ui', 'ux', 'design', 'figma'], slug: 'ui_ux_design', name: 'UI/UX Designer' },
  { keywords: ['blockchain', 'web3', 'solidity', 'crypto'], slug: 'blockchain_web3', name: 'Blockchain & Web3 Engineer' },
  { keywords: ['game', 'unity', 'unreal'], slug: 'game_development', name: 'Game Developer' },
  { keywords: ['c++', 'c/c++', 'embedded', 'systems'], slug: 'c_cpp_systems_developer', name: 'C/C++ Systems Developer' },
  { keywords: ['qa', 'testing', 'automation testing', 'selenium'], slug: 'qa_automation', name: 'QA Automation Engineer' },
];

function extractUserProfileFromHistory(contents = []) {
  const profile = { name: 'Student', degree: 'Tech Student', year: '1st Year' };

  for (const item of contents) {
    if (item?.role === 'user' && Array.isArray(item?.parts)) {
      for (const part of item.parts) {
        const text = part?.text || '';
        const nameMatch = text.match(/Name:\s*([^\n]+)/i);
        const degreeMatch = text.match(/Degree:\s*([^\n]+)/i);
        const yearMatch = text.match(/Current Year:\s*([^\n]+)/i);

        if (nameMatch?.[1]) profile.name = nameMatch[1].trim();
        if (degreeMatch?.[1]) profile.degree = degreeMatch[1].trim();
        if (yearMatch?.[1]) profile.year = yearMatch[1].trim();
      }
    }
  }

  return profile;
}

function getLatestUserQuery(contents = []) {
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    const item = contents[i];
    if (item?.role === 'user' && Array.isArray(item?.parts)) {
      const text = item.parts.map((p) => p?.text || '').join(' ').trim();
      if (text && !text.includes('YOUR ROLE:')) {
        return text;
      }
    }
  }
  return '';
}

export function generateOfflineCounsellorResponse(contents = [], searchContext = '') {
  const profile = extractUserProfileFromHistory(contents);
  const query = getLatestUserQuery(contents);
  const lower = query.toLowerCase();

  const webSearchHeader = searchContext ? `\n\n🌐 **Real-time Live Web Search Results:**\n${searchContext}\n` : '';

  // 0. Non-Tech / Off-Topic Refusal
  const OFF_TOPIC_REGEX = /\b(chai|tea|recipe|cook|cooking|dish|restaurant|cricket|football|basketball|ipl|match|movie|film|actor|actress|song|singing|poem|poetry|joke|jokes|weather|rain|temperature|politics|election|minister|love|dating|relationship|crush|astrology|horoscope|zodiac|food|burger|pizza|crypto|bitcoin|stock market)\b/i;
  const IS_TECH_KEYWORD = /\b(tech|code|coding|program|programming|developer|engineer|engineering|software|hardware|java|python|js|javascript|react|node|html|css|ai|ml|data|sql|cloud|aws|devops|security|cyber|roadmap|college|university|bca|btech|mca|job|jobs|hiring|career|salary|lpa|skillbun|harsh|contact|email)\b/i;

  if (OFF_TOPIC_REGEX.test(lower) && !IS_TECH_KEYWORD.test(lower)) {
    return `Hello **${profile.name}**! I am **BunBot**, SkillBun's AI Career Advisor specialized strictly in tech careers, computer science, software engineering, and SkillBun roadmaps. 🤖\n\n` +
      `This question seems to be outside my domain of tech career guidance!\n\n` +
      `💡 *If you think we made a mistake, please take a screenshot and email us at **[${SKILLBUN_CONTACT_EMAIL}](mailto:${SKILLBUN_CONTACT_EMAIL})**.*`;
  }

  // 1. Founder & Support / Contact Intent
  if (/founder|owner|creator|built skillbun|created skillbun|harsh|contact|email|support|reach|helpdesk/i.test(lower)) {
    return `Hello **${profile.name}**! 👋\n\n**SkillBun** was founded by **Harsh** ([harsh@skillbun.tech](mailto:harsh@skillbun.tech)) to empower computer science, software engineering, and tech students worldwide with AI-powered career discovery, 100+ interactive roadmaps, and verifiable certifications!\n\nYou can reach out directly to Harsh and the core team anytime at **[${SKILLBUN_CONTACT_EMAIL}](mailto:${SKILLBUN_CONTACT_EMAIL})**.`;
  }

  // 2. Salary / Package / Placement Intent
  if (/salary|lpa|package|pay|compensation|placements|fresher salary/i.test(lower)) {
    const career = ROADMAP_MAPPINGS.find(item => item.keywords.some(keyword => lower.includes(keyword)));
    const destination = career ? '/roadmap/' + career.slug + '/goal' : '/roadmap';
    return 'SkillBun roadmap Goal tabs publish **indicative editorial salary estimates**, with separate USD and India INR ranges. These are not verified salary surveys or promised offers. Actual pay depends on location, employer, experience and the role.\n\n' +
      'I cannot verify current compensation from the sources available in this answer. See the [' + (career ? career.name + ' Goal tab' : 'roadmap catalog') + '](' + destination + ') for the catalog estimate, then compare current employer listings for your specific location.';
  }

  // 3. Exam / Higher Studies Intent
  if (/gate|nimcet|cdac|mtech|mca|higher studies|entrance exam|master/i.test(lower)) {
    return `Great question, **${profile.name}**! Here is an overview of popular higher education & exam options in tech:\n\n` +
      `### 📚 Key Higher Education Pathways for Tech Students\n` +
      `- **Master's in Computer Science (MS CS / M.Sc)**: Top choice globally for advanced AI/ML, systems, and specialized engineering roles.\n` +
      `- **NIMCET (India)**: Premier entrance exam for MCA admissions into top National Institutes of Technology (NITs).\n` +
      `- **GATE (CS/IT or DA)**: Unlocks M.Tech admissions at IITs/NITs and PSU jobs. GATE Data Science & AI (DA) paper is also a great option.\n` +
      `- **Industry Certifications (AWS, CKA, OSCP)**: Directly valued by global employers for cloud and security tracks.\n\n` +
      `Depending on whether your goal is an immediate job or research/specialization, balancing hands-on projects with your studies during your **${profile.year}** is key!`;
  }

  // 4. Project & Portfolio Intent
  if (/project|portfolio|resume project|build|idea/i.test(lower)) {
    return `Hey **${profile.name}**! Building real-world projects is the #1 way to impress recruiters and engineering managers worldwide. Here are high-impact project ideas for **${profile.degree}** students:\n\n` +
      `### 🚀 Standout Project Ideas\n` +
      `1. **Fullstack App**: E-commerce platform or LMS with Auth, Payments, and Admin Dashboard ([Fullstack Roadmap](/roadmap/fullstack)).\n` +
      `2. **AI-Powered Tool**: RAG Document QA Chatbot or AI Content Summarizer using Python & LangChain ([AI/ML Roadmap](/roadmap/ai_ml_engineer)).\n` +
      `3. **DevOps Pipeline**: Deploy a microservice application to AWS/GCP with Docker, Kubernetes, and GitHub Actions ([DevOps Roadmap](/roadmap/devops_cloud)).\n\n` +
      `💡 **Tip**: Host live working demos on Vercel/Render and put the GitHub link directly at the top of your resume!`;
  }

  // 5. Certification Intent
  if (/certificate|certification|certify|exam|test/i.test(lower)) {
    return `Awesome **${profile.name}**! SkillBun offers **Verifiable Roadmap Certificates**! 🎓\n\n` +
      `### 📜 How to Earn Your SkillBun Certificate\n` +
      `1. Reach at least **60% progress** on any roadmap (e.g. [Frontend](/roadmap/frontend), [Python](/roadmap/python_developer)).\n` +
      `2. Take the proctored **Roadmap Assessment Exam** directly on the roadmap page.\n` +
      `3. Score **70% or higher** (7 out of 10 questions correct) to earn your unique, shareable certificate with QR code verification!`;
  }

  // 6. BCA / Non-IIT / Tier 3 Hiring Intent
  if (/bca|bsc|tier 3|non iit|off campus|referral|linkedin/i.test(lower)) {
    return `Hey **${profile.name}**, as a **${profile.degree}** student, college background does **NOT** limit your career in tech!\n\n` +
      `### 🌟 Global Tech Hiring Playbook for ${profile.degree} Students\n` +
      `- **GitHub & Live Demos**: 2 stellar projects hosted live beat 10 textbook certificates.\n` +
      `- **Active LinkedIn**: Share weekly learning proof ("Day X of learning React/Python"). Tag engineers for feedback.\n` +
      `- **Open Source & Hackathons**: Participate in global hackathons (Devpost, MLH), Unstop, and open-source GitHub repositories to gain verifiable proof of work.\n` +
      `- **Direct Referrals**: Message alumni or tech leads politely on LinkedIn asking for code feedback before asking for a referral.`;
  }

  // 7. Roadmap Match
  const matchedRoadmaps = ROADMAP_MAPPINGS.filter((item) =>
    item.keywords.some((kw) => lower.includes(kw))
  );

  if (matchedRoadmaps.length > 0) {
    const primary = matchedRoadmaps[0];
    const secondaryList = matchedRoadmaps.slice(1, 4);

    let output = `Hey **${profile.name}**! Here is tailored advice for **${primary.name}** based on your **${profile.degree}** (${profile.year}) profile:\n\n` +
      `### 🎯 Recommended Track: [${primary.name}](/roadmap/${primary.slug})\n` +
      `- **SkillBun Interactive Roadmap**: [Explore ${primary.name} Track](/roadmap/${primary.slug})\n` +
      `- **Pay estimates**: See the [Goal tab](/roadmap/${primary.slug}/goal). Estimates are indicative, not verified offers.\n\n` +
      `### 🛠️ Key Steps to Master:\n` +
      `1. **Core Fundamentals**: Learn standard syntax, data structures, and foundational concepts.\n` +
      `2. **Real-world Projects**: Build 2-3 portfolio-grade projects and publish them on GitHub.\n` +
      `3. **Certification & Practice**: Take our adaptive SkillBun quiz and complete roadmap milestones.\n\n`;

    if (secondaryList.length > 0) {
      output += `### 🔗 Related Career Roadmaps You Might Explore:\n` +
        secondaryList.map((r) => `- [${r.name}](/roadmap/${r.slug})`).join('\n') + '\n\n';
    }

    output += `Feel free to ask me any specific question about skills, topics, or interview preparation for this track!`;
    return output;
  }

  // 8. Total Roadmap Count Intent
  if (/how many roadmaps|total roadmaps|number of roadmaps|roadmap count|how many tracks|how many paths/i.test(lower)) {
    return `Hello **${profile.name}**! 🚀\n\n**SkillBun** features **100+ interactive career roadmaps** covering every major tech domain globally!\n\n` +
      `### 🗺️ Featured SkillBun Roadmaps (100+ Available)\n` +
      `- **Web Development**: [Frontend](/roadmap/frontend) | [Backend](/roadmap/backend) | [Fullstack](/roadmap/fullstack)\n` +
      `- **Artificial Intelligence**: [AI/ML Engineer](/roadmap/ai_ml_engineer) | [AI Research Engineer](/roadmap/ai_research_engineer)\n` +
      `- **Cloud & DevOps**: [DevOps & Cloud](/roadmap/devops_cloud) | [AWS Cloud Engineer](/roadmap/aws_cloud_engineer) | [Kubernetes](/roadmap/kubernetes_engineer)\n` +
      `- **Data & Analytics**: [Data Science](/roadmap/data_science) | [Analytics Engineer](/roadmap/analytics_engineer) | [Data Engineering](/roadmap/data_engineering)\n` +
      `- **Cybersecurity & Systems**: [Cybersecurity](/roadmap/cybersecurity) | [API Platform Engineer](/roadmap/api_platform_engineer) | [Linux SysAdmin](/roadmap/linux_sysadmin)\n` +
      `- **Mobile App Dev**: [Android](/roadmap/android) | [iOS](/roadmap/ios) | [Flutter](/roadmap/flutter)\n` +
      `- **Game Dev & Design**: [Game Development](/roadmap/game_development) | [Unity Developer](/roadmap/unity_developer) | [UI/UX Design](/roadmap/ui_ux_design)\n\n` +
      `...and 80+ more specialized tracks! Click on any roadmap link above to jump directly into your learning path on SkillBun.`;
  }

  // 9. Default Friendly Counsellor Guidance
  return `Hello **${profile.name}**! I'm **BunBot**, your personal AI Career Advisor here at SkillBun. 🤖\n\n` +
    `I can help you with:\n` +
    `- **Career Roadmaps**: Find the best path for Web Dev, AI/ML, DevOps, Cybersecurity, Data Science & 90+ tracks.\n` +
    `- **SkillBun Roadmaps**: Direct links to interactive maps like [Frontend Roadmap](/roadmap/frontend), [Fullstack Roadmap](/roadmap/fullstack), and [AI/ML Roadmap](/roadmap/ai_ml_engineer).\n` +
    `- **Global Tech Career Insight**: How to compare role-specific pay sources, prepare for interviews, and explore skills.\n` +
    `- **SkillBun Support**: Drop a line to [${SKILLBUN_CONTACT_EMAIL}](mailto:${SKILLBUN_CONTACT_EMAIL}).\n\n` +
    `What specific tech field or career path would you like to explore today?` + webSearchHeader;
}
