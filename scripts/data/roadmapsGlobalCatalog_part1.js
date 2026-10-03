/**
 * SkillBun 100 Roadmaps Global Standard Catalog - Part 1
 * Web, Mobile, Desktop Applications
 */

const PART1_CATALOG = {
  // ─── 1. WEB & MOBILE DEVELOPMENT ───
  frontend: {
    title: 'Frontend Developer',
    description: 'Master modern web interfaces, responsive design architectures, component lifecycles, state management, and high-performance user experiences.',
    goal: {
      objective: 'Engineer responsive, accessible, and high-performance client-side web applications that delight users and scale seamlessly across global devices.',
      salary: '$75,000 - $135,000 / yr (₹6 - ₹20 LPA)',
      salary_range: { usd: { min: 75000, max: 135000, period: 'yr' }, inr_lpa: { min: 6, max: 20, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Frontend Engineer', 'UI Engineer', 'Client Platform Engineer', 'Web Applications Developer'],
      career_pillars: ['UI Architecture & State', 'Performance & Core Web Vitals', 'Accessibility & Design Systems']
    },
    learn: {
      summary: 'Build a rigorous foundation in semantic HTML5, modern CSS layouts (Flexbox/Grid), JavaScript ES2024+, TypeScript, React/Next.js, and client-side performance engineering.',
      key_competencies: ['Semantic HTML5 & Accessibility (a11y)', 'Modern CSS & Tailwind CSS', 'JavaScript & TypeScript Mastery', 'React Ecosystem & Next.js App Router', 'State Management & Server State', 'Web Vitals & Performance Optimization'],
      prerequisites: ['Basic computer literacy', 'Understanding of how web browsers work', 'Curiosity for user interface design']
    },
    boost: {
      capstone_projects: [
        { title: 'Interactive Analytics Dashboard', tech_stack: ['Next.js', 'TypeScript', 'Tailwind', 'Recharts'], description: 'Build an enterprise SaaS dashboard featuring real-time charts, filterable data tables, dark/light theme persistence, and offline caching.' },
        { title: 'Headless E-Commerce Experience', tech_stack: ['React', 'Next.js', 'Stripe', 'Zustand'], description: 'Design an ultra-fast headless storefront with optimistic UI updates, cart synchronization, and lighthouse score of 98+.' }
      ],
      certifications: ['Meta Front-End Developer Professional Certificate', 'OpenJS Node.js Application Developer (JSNAD)', 'W3C Front-End Web Developer'],
      interview_focus: ['JavaScript Event Loop, Closures & Prototypal Inheritance', 'React Reconciliation & Hook Internals', 'Frontend System Design & Infinite Scrolling', 'Web Performance & Asset Optimization']
    }
  },

  backend: {
    title: 'Backend Developer',
    description: 'Design robust server architectures, distributed databases, scalable REST/gRPC APIs, microservices, and secure transaction workflows.',
    goal: {
      objective: 'Architect resilient server-side services, high-throughput data processing pipelines, and mission-critical APIs that power modern digital platforms.',
      salary: '$80,000 - $145,000 / yr (₹7 - ₹24 LPA)',
      salary_range: { usd: { min: 80000, max: 145000, period: 'yr' }, inr_lpa: { min: 7, max: 24, period: 'lpa' } },
      experience_level: 'Entry to Staff (0 - 6+ Years)',
      target_roles: ['Backend Engineer', 'API Platform Engineer', 'Distributed Systems Developer', 'Server Architect'],
      career_pillars: ['API Design & Protocols', 'Relational & NoSQL Data Architecture', 'Microservices & Distributed Systems']
    },
    learn: {
      summary: 'Master server-side runtimes (Node.js, Go, Python, Java), relational and document databases, caching strategies, containerization, and message queues.',
      key_competencies: ['REST, GraphQL & gRPC APIs', 'PostgreSQL & MongoDB Database Design', 'Redis In-Memory Caching & Rate Limiting', 'Authentication, OAuth2 & JWT Security', 'Docker & Asynchronous Message Queues (Kafka/RabbitMQ)'],
      prerequisites: ['Foundational programming skills', 'Understanding of client-server architecture', 'Basic SQL queries']
    },
    boost: {
      capstone_projects: [
        { title: 'Distributed Event-Driven Order Processing Engine', tech_stack: ['Go/Node.js', 'PostgreSQL', 'Redis', 'Kafka', 'Docker'], description: 'Architect an idempotent payment and order state machine handling concurrent checkouts with distributed locking.' },
        { title: 'High-Concurrency URL Shortener & Analytics Gateway', tech_stack: ['Node.js/Go', 'Redis', 'PostgreSQL', 'Grafana'], description: 'Build an analytics proxy capable of processing 10,000 req/sec with bloom filters, rate limiting, and GeoIP routing.' }
      ],
      certifications: ['AWS Certified Developer - Associate', 'MongoDB Certified Developer Associate', 'Linux Foundation Certified Node.js Services Developer (JSNSD)'],
      interview_focus: ['System Design (Rate Limiting, URL Shortener, Chat Systems)', 'Database Indexing, ACID Transactions & Sharding', 'Concurrency, Goroutines / Event Loop Mechanics', 'Security Hardening & API Gateway Patterns']
    }
  },

  fullstack: {
    title: 'Full Stack Developer',
    description: 'Bridge client interfaces and backend distributed services, mastering end-to-end web engineering from pixel to database to production deployment.',
    goal: {
      objective: 'Deliver complete, autonomous product features by seamlessly connecting modern UI frameworks with resilient server backends, databases, and CI/CD pipelines.',
      salary: '$85,000 - $150,000 / yr (₹8 - ₹25 LPA)',
      salary_range: { usd: { min: 85000, max: 150000, period: 'yr' }, inr_lpa: { min: 8, max: 25, period: 'lpa' } },
      experience_level: 'Entry to Lead (0 - 6+ Years)',
      target_roles: ['Full Stack Engineer', 'Software Engineer', 'Product Engineer', 'Founding Engineer'],
      career_pillars: ['End-to-End Product Architecture', 'Unified TypeScript Fullstack Patterns', 'Cloud Deployment & DevOps Automation']
    },
    learn: {
      summary: 'Master modern full-stack frameworks (Next.js, Remix), relational and NoSQL databases, REST/GraphQL APIs, authentication, testing, and containerized cloud deployment.',
      key_competencies: ['TypeScript Across Client & Server', 'Next.js App Router & Server Actions', 'PostgreSQL, Prisma & Database Migrations', 'Fullstack Authentication (Supabase/Firebase/Auth.js)', 'Automated CI/CD & Cloud Infrastructure'],
      prerequisites: ['HTML, CSS and JavaScript basics', 'Elementary database understanding', 'Git version control']
    },
    boost: {
      capstone_projects: [
        { title: 'Fullstack AI Collaborative Workspace', tech_stack: ['Next.js', 'PostgreSQL', 'Prisma', 'Tailwind', 'WebSocket'], description: 'Build a multi-user collaborative canvas with real-time cursor sync, document revision history, and AI summarization.' },
        { title: 'Enterprise Recruitment & ATS Portal', tech_stack: ['Next.js', 'PostgreSQL', 'Tailwind', 'Docker', 'Stripe'], description: 'Develop a candidate pipeline tracker with resume parsing, role-based access control, and automated email workflows.' }
      ],
      certifications: ['Meta Full-Stack Engineer Professional Certificate', 'AWS Certified Solutions Architect - Associate', 'GitHub Actions Certified'],
      interview_focus: ['Fullstack System Architecture & Server-Side Rendering vs Client Rendering', 'Database Schema Normalization & Query Optimization', 'State Management & Cache Invalidation', 'End-to-End Security & Session Token Life Cycle']
    }
  },

  nextjs_developer: {
    title: 'Next.js Developer',
    description: 'Specialize in modern React production meta-frameworks, Server Components, streaming SSR, dynamic routing, and Edge runtime architectures.',
    goal: {
      objective: 'Build enterprise-grade, SEO-optimized, blazing-fast web applications utilizing React Server Components and edge computing architectures.',
      salary: '$80,000 - $140,000 / yr (₹7 - ₹22 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 7, max: 22, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Next.js Developer', 'React/Next.js Engineer', 'Web Platform Developer', 'Modern Frontend Specialist'],
      career_pillars: ['Server Components & Streaming', 'Rendering Strategies (SSR/SSG/ISR)', 'Edge Middleware & Deployment']
    },
    learn: {
      summary: 'Master Next.js App Router, React Server Components (RSC), Server Actions, Parallel/Intercepting Routes, middleware, caching layers, and Vercel edge deployment.',
      key_competencies: ['Next.js App Router Architecture', 'React Server Components & Suspense', 'Server Actions & Form Mutations', 'Route Handlers & Edge Middleware', 'Static, Dynamic & Incremental Static Regeneration'],
      prerequisites: ['Solid React fundamentals', 'Modern JavaScript / TypeScript', 'Understanding of HTTP and web servers']
    },
    boost: {
      capstone_projects: [
        { title: 'High-Traffic Content Publishing Platform', tech_stack: ['Next.js App Router', 'TypeScript', 'Tailwind', 'PostgreSQL'], description: 'Develop an editorial platform with dynamic ISR, on-demand cache revalidation, MDX rendering, and sub-second page loads.' }
      ],
      certifications: ['Meta Front-End Developer Certificate', 'Vercel Next.js Community Expert'],
      interview_focus: ['Next.js Caching Tiers (Request Memoization, Data Cache, Full Route Cache)', 'Server vs Client Component Boundaries', 'Edge Functions vs Node.js Serverless Execution', 'Core Web Vitals Optimization']
    }
  },

  angular_developer: {
    title: 'Angular Developer',
    description: 'Build enterprise-grade, scalable single-page applications with Angular standalone components, Signals, RxJS reactive patterns, and NgRx.',
    goal: {
      objective: 'Architect robust enterprise web applications using Angular’s strict opinionated ecosystem, dependency injection, and modern reactivity model.',
      salary: '$80,000 - $140,000 / yr (₹6.5 - ₹20 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 6.5, max: 20, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Angular Engineer', 'Enterprise Frontend Developer', 'TypeScript UI Engineer'],
      career_pillars: ['Reactive Programming with RxJS', 'Angular Architecture & Dependency Injection', 'Enterprise State Management']
    },
    learn: {
      summary: 'Master Angular 17+, Standalone Components, Angular Signals, RxJS Observables, Reactive Forms, Router Guards, NgRx state management, and SSR with Angular Universal.',
      key_competencies: ['Angular Standalone Components & Signals', 'RxJS Reactive Streams & Operators', 'Dependency Injection & Hierarchical Injectors', 'Angular Router & Route Resolvers', 'NgRx Store, Effects & Entity'],
      prerequisites: ['Strong TypeScript foundation', 'Object-Oriented Programming (OOP)', 'Web fundamentals (HTML/CSS)']
    },
    boost: {
      capstone_projects: [
        { title: 'Enterprise Banking & Portfolio Management Portal', tech_stack: ['Angular 17+', 'TypeScript', 'RxJS', 'NgRx', 'Angular Material'], description: 'Build a complex financial dashboard with real-time websocket price tickers, multi-step transaction forms, and strict role authorization.' }
      ],
      certifications: ['Google Cloud Certified Professional Cloud Developer', 'Angular Certified Developer'],
      interview_focus: ['Angular Change Detection Mechanics (Default vs OnPush)', 'Signals vs RxJS Subjects', 'Dependency Injection Scopes', 'Memory Leak Prevention in Subscriptions']
    }
  },

  vue_developer: {
    title: 'Vue Developer',
    description: 'Master the progressive Vue 3 framework, Composition API, Pinia state management, Vite build tooling, and Nuxt 3 fullstack SSR.',
    goal: {
      objective: 'Build approachable, maintainable, and high-performance modern web apps using Vue 3, the Composition API, and the Nuxt ecosystem.',
      salary: '$75,000 - $135,000 / yr (₹6 - ₹19 LPA)',
      salary_range: { usd: { min: 75000, max: 135000, period: 'yr' }, inr_lpa: { min: 6, max: 19, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Vue.js Developer', 'Frontend Engineer', 'Nuxt.js Fullstack Developer'],
      career_pillars: ['Composition API Reactivity', 'Pinia State Architecture', 'Nuxt SSR & Jamstack Architecture']
    },
    learn: {
      summary: 'Deep dive into Vue 3 core reactivity (ref, reactive, computed), script setup syntax, component design, Pinia, Vue Router, and full-stack Nuxt 3 development.',
      key_competencies: ['Vue 3 Composition API & Reactivity Engine', 'Pinia State Store Architecture', 'Vue Router 4 & Navigation Lifecycle', 'Nuxt 3 Server-Side Rendering', 'Vite Bundling & Vitest Unit Testing'],
      prerequisites: ['HTML5, Modern CSS & JavaScript ES6+', 'Basic component thinking', 'Git workflows']
    },
    boost: {
      capstone_projects: [
        { title: 'Modern E-Commerce Storefront with Nuxt 3', tech_stack: ['Vue 3', 'Nuxt 3', 'Pinia', 'Tailwind', 'Stripe'], description: 'Develop an e-commerce catalog featuring server-side rendering, faceted search filters, and persistent cart checkout.' }
      ],
      certifications: ['Certified Vue.js Developer', 'Meta Front-End Developer Certificate'],
      interview_focus: ['Vue 3 Reactivity Proxy Mechanics vs Vue 2 Object.defineProperty', 'Composition API vs Options API', 'Pinia vs Vuex Differences', 'Nuxt Universal Rendering Hydration']
    }
  },

  svelte_developer: {
    title: 'Svelte Developer',
    description: 'Build compile-time optimized, zero-virtual-DOM web applications with Svelte 5 runes, SvelteKit fullstack routing, and responsive reactive primitives.',
    goal: {
      objective: 'Engineer lightning-fast web applications that compile down to lean vanilla JavaScript with minimal runtime overhead using Svelte and SvelteKit.',
      salary: '$80,000 - $140,000 / yr (₹6.5 - ₹20 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 6.5, max: 20, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Svelte Developer', 'Frontend Engineer', 'SvelteKit Fullstack Engineer'],
      career_pillars: ['Compiler-Driven UI Architecture', 'Svelte 5 Runes & Reactivity', 'SvelteKit Fullstack Runtimes']
    },
    learn: {
      summary: 'Master Svelte core architecture, Svelte 5 Runes ($state, $derived, $effect), SvelteKit routing, form actions, server loading functions, and static site generation.',
      key_competencies: ['Svelte 5 Runes & Compile-Time Reactivity', 'SvelteKit Routing, Page Loaders & Form Actions', 'Stores, Transitions & Spring Animations', 'Component Slots & Snippets', 'SSR, Prerendering & Edge Deployment'],
      prerequisites: ['Solid JavaScript fundamentals', 'Familiarity with modern CSS', 'General web architecture']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time Markdown Collaboration Tool', tech_stack: ['Svelte 5', 'SvelteKit', 'TypeScript', 'WebSockets'], description: 'Build an ultra-lightweight collaborative note editor with live sync, compile-time speed, and instant offline PWA support.' }
      ],
      certifications: ['Meta Front-End Developer Certificate'],
      interview_focus: ['Compile-Time vs Virtual DOM Paradigms', 'Svelte 5 Runes Reactivity Engine', 'SvelteKit Form Actions & Progressive Enhancement', 'Bundle Size & Performance Profile']
    }
  },

  php_laravel_developer: {
    title: 'PHP & Laravel Developer',
    description: 'Craft modern, maintainable web applications, RESTful APIs, and scalable SaaS platforms using modern PHP 8.3+, Laravel 11, Eloquent ORM, and Livewire.',
    goal: {
      objective: 'Deliver robust enterprise backends, rapid MVP web apps, and automated workflows leveraging the rich and battle-tested Laravel ecosystem.',
      salary: '$70,000 - $125,000 / yr (₹5 - ₹18 LPA)',
      salary_range: { usd: { min: 70000, max: 125000, period: 'yr' }, inr_lpa: { min: 5, max: 18, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Laravel Developer', 'PHP Backend Engineer', 'Fullstack Web Developer'],
      career_pillars: ['Modern Object-Oriented PHP', 'Laravel MVC & Service Container', 'Database Architecture & Queues']
    },
    learn: {
      summary: 'Master PHP 8.3 features, Laravel 11 MVC patterns, Eloquent relationships, Blade templating, Livewire reactive components, queue workers, and Redis caching.',
      key_competencies: ['PHP 8.3+ Types, Enums & Attributes', 'Laravel Routing, Middleware & Service Providers', 'Eloquent ORM, Migrations & Seeders', 'Asynchronous Queues, Jobs & Events', 'Laravel Sanctum / Passport API Authentication'],
      prerequisites: ['Basic programming syntax', 'Relational database concepts (MySQL)', 'Basic HTML & CSS']
    },
    boost: {
      capstone_projects: [
        { title: 'Multi-Tenant SaaS Subscription Platform', tech_stack: ['Laravel 11', 'MySQL', 'Stripe Billing', 'Redis', 'Tailwind CSS'], description: 'Build a multi-tenant business billing system with team workspaces, subscription webhook listeners, and automated invoicing.' }
      ],
      certifications: ['Laravel Certified Developer', 'Zend Certified PHP Engineer'],
      interview_focus: ['Laravel Service Container & Dependency Injection', 'Eloquent N+1 Query Problem & Eager Loading', 'Queue Workers & Failed Job Handling', 'RESTful API Design & API Resources']
    }
  },

  ruby_on_rails_developer: {
    title: 'Ruby on Rails Developer',
    description: 'Build developer-friendly, convention-over-configuration web platforms and startup backends using Ruby 3+, Rails 7+, Hotwire, and Active Record.',
    goal: {
      objective: 'Ship high-velocity web products with clean domain models, convention-over-configuration architecture, and seamless real-time UI interactivity.',
      salary: '$85,000 - $145,000 / yr (₹7 - ₹22 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 7, max: 22, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Ruby on Rails Developer', 'Backend Software Engineer', 'Product Engineer'],
      career_pillars: ['Ruby Metaprogramming & Idioms', 'Rails Convention-Over-Configuration', 'Hotwire & Real-Time Turbo Streams']
    },
    learn: {
      summary: 'Master Ruby object model, Rails 7 conventions, Active Record associations, Hotwire (Turbo & Stimulus), Sidekiq background processing, and RSpec automated testing.',
      key_competencies: ['Ruby 3.3 Core & Object Metaprogramming', 'Rails MVC, Routing & Controllers', 'Active Record Modeling & Migrations', 'Hotwire Turbo Drive, Frames & Streams', 'Background Job Processing with Sidekiq & Redis'],
      prerequisites: ['Basic programming understanding', 'Web protocols & HTTP basics', 'Relational database fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time Team Discussion & Issue Tracker', tech_stack: ['Ruby 3', 'Rails 7', 'Hotwire Turbo', 'PostgreSQL', 'Redis'], description: 'Build a modern linear-style issue tracker with instant live updates using Turbo Streams, keyboard shortcuts, and email notifications.' }
      ],
      certifications: ['Ruby Association Certified Programmer'],
      interview_focus: ['Active Record Query Optimization & Scopes', 'Hotwire vs Single Page Application (SPA) Paradigms', 'Ruby Blocks, Procs & Lambdas', 'Background Jobs & Race Condition Defenses']
    }
  },

  dotnet_developer: {
    title: '.NET Developer',
    description: 'Engineer high-performance enterprise systems, cloud microservices, and secure APIs using C# 12, .NET 8, ASP.NET Core, and Entity Framework Core.',
    goal: {
      objective: 'Build mission-critical, enterprise-grade backend platforms, microservices, and distributed cloud applications on Microsoft .NET and Azure.',
      salary: '$85,000 - $145,000 / yr (₹6.5 - ₹22 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 6.5, max: 22, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 6+ Years)',
      target_roles: ['.NET Developer', 'C# Software Engineer', 'ASP.NET Core Specialist', 'Enterprise Solutions Developer'],
      career_pillars: ['C# Modern Language Features', 'ASP.NET Core Web API Architecture', 'Entity Framework Core & SQL Optimization']
    },
    learn: {
      summary: 'Master modern C# 12, ASP.NET Core Web APIs, Entity Framework Core, LINQ queries, asynchronous programming, dependency injection, and Azure cloud deployment.',
      key_competencies: ['C# 12 Language & Memory Management', 'ASP.NET Core Web API & Minimal APIs', 'Entity Framework Core & LINQ', 'Asynchronous Programming (async/await & Tasks)', 'Docker Containerization & Azure App Services'],
      prerequisites: ['Object-Oriented Programming (OOP)', 'Basic understanding of relational databases (SQL Server)', 'C# or Java syntax familiarity']
    },
    boost: {
      capstone_projects: [
        { title: 'Enterprise Healthcare Appointment & Billing System', tech_stack: ['.NET 8', 'C#', 'EF Core', 'SQL Server', 'Azure'], description: 'Develop a HIPAA-compliant medical records and scheduling API with token authentication, audit logs, and PDF receipt generation.' }
      ],
      certifications: ['Microsoft Certified: Azure Developer Associate (AZ-204)'],
      interview_focus: ['C# Memory Management (Garbage Collection, Struct vs Class)', 'Dependency Injection Lifetimes (Transient, Scoped, Singleton)', 'Entity Framework Tracking vs AsNoTracking', 'Async/Await Internals & Thread Pool Starvation']
    }
  },

  java_developer: {
    title: 'Java Developer',
    description: 'Master enterprise software engineering, resilient microservices, distributed transaction processing, and scalable architectures using Java 21 and Spring Boot 3.',
    goal: {
      objective: 'Design and deploy robust, high-throughput enterprise systems, distributed microservices, and banking-grade backends using Java and the Spring ecosystem.',
      salary: '$85,000 - $150,000 / yr (₹7 - ₹24 LPA)',
      salary_range: { usd: { min: 85000, max: 150000, period: 'yr' }, inr_lpa: { min: 7, max: 24, period: 'lpa' } },
      experience_level: 'Entry to Staff (0 - 6+ Years)',
      target_roles: ['Java Developer', 'Spring Boot Engineer', 'Enterprise Backend Architect', 'Java Microservices Specialist'],
      career_pillars: ['Core Java & JVM Mechanics', 'Spring Boot & Spring Cloud Microservices', 'Enterprise Messaging & Relational Databases']
    },
    learn: {
      summary: 'Master modern Java 21 (Virtual Threads, Records, Pattern Matching), Spring Boot 3, Spring Data JPA, Hibernate, Kafka message streaming, and Docker orchestration.',
      key_competencies: ['Java 21 Syntax, Virtual Threads & Concurrency', 'Spring Boot 3 REST APIs & Dependency Injection', 'Spring Data JPA & Hibernate ORM Tuning', 'Apache Kafka Distributed Event Streaming', 'JUnit 5, Mockito & Integration Testing'],
      prerequisites: ['Solid Object-Oriented Programming (OOP)', 'Basic data structures & algorithms', 'Relational database fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Fintech Payment Gateway & Transaction Ledger', tech_stack: ['Java 21', 'Spring Boot 3', 'PostgreSQL', 'Kafka', 'Docker'], description: 'Build an ACID-compliant double-entry ledger with distributed tracing, idempotency keys, and asynchronous transaction publishing.' }
      ],
      certifications: ['Oracle Certified Professional: Java SE 17/21 Developer', 'Spring Certified Professional'],
      interview_focus: ['JVM Memory Model, Garbage Collection & Virtual Threads', 'Spring Framework Lifecycle & AOP Proxies', 'Database Isolation Levels & Pessimistic/Optimistic Locking', 'Kafka Consumer Groups & Partitioning']
    }
  },

  python_developer: {
    title: 'Python Developer',
    description: 'Harness the versatility of Python for modern web backends, automated data pipelines, asynchronous APIs, and cloud services using FastAPI, Django, and Celery.',
    goal: {
      objective: 'Build high-velocity web services, asynchronous REST/gRPC APIs, data pipelines, and automation engines powered by modern Python standards.',
      salary: '$80,000 - $140,000 / yr (₹6 - ₹22 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 6, max: 22, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Python Developer', 'Backend Software Engineer', 'API Developer', 'Python Automation Engineer'],
      career_pillars: ['Idiomatic Python & Asyncio', 'FastAPI & Django Web Frameworks', 'Distributed Task Queues & Microservices']
    },
    learn: {
      summary: 'Master modern Python 3.12, type hinting, asynchronous programming (asyncio), FastAPI, Django, SQLAlchemy, Celery background workers, and automated testing with pytest.',
      key_competencies: ['Python 3.12 Core, Decorators & Generators', 'FastAPI, Pydantic & Asynchronous Routing', 'Django Framework, ORM & Admin Console', 'Celery, Redis & Distributed Task Processing', 'pytest, Mocking & Continuous Integration'],
      prerequisites: ['Basic programming logic', 'Command line basics', 'Introductory database understanding']
    },
    boost: {
      capstone_projects: [
        { title: 'Asynchronous Content Ingestion & Summarization API', tech_stack: ['Python 3.12', 'FastAPI', 'Celery', 'Redis', 'PostgreSQL'], description: 'Build a high-performance background web scraper and document processing pipeline with webhook notifications.' }
      ],
      certifications: ['PCEP & PCAP Certified Associate in Python Programming', 'AWS Certified Developer - Associate'],
      interview_focus: ['Python GIL (Global Interpreter Lock) & Concurrency Models', 'Generators, Context Managers & Decorator Internals', 'Pydantic Data Validation & Asyncio Event Loops', 'Database Connection Pooling & Query Profiling']
    }
  },

  go_developer: {
    title: 'Go Developer',
    description: 'Master high-concurrency systems, low-latency microservices, cloud-native networking, and distributed computing with Golang.',
    goal: {
      objective: 'Engineer blazingly fast, lightweight, and highly concurrent microservices and infrastructure tools that power global cloud infrastructure.',
      salary: '$90,000 - $160,000 / yr (₹8 - ₹26 LPA)',
      salary_range: { usd: { min: 90000, max: 160000, period: 'yr' }, inr_lpa: { min: 8, max: 26, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 6+ Years)',
      target_roles: ['Go Software Engineer', 'Cloud-Native Developer', 'Backend Infrastructure Engineer', 'Distributed Systems Engineer'],
      career_pillars: ['Goroutines & Channel Concurrency', 'Low-Latency Microservices & gRPC', 'Cloud-Native Containerized Operations']
    },
    learn: {
      summary: 'Master Go language fundamentals, memory management, pointers, concurrency with goroutines and channels, gRPC/Protobuf, Gin/Echo frameworks, and Docker orchestration.',
      key_competencies: ['Go Syntax, Structs, Interfaces & Generics', 'Goroutines, Channels & the Go Scheduler', 'gRPC & Protocol Buffers Communication', 'PostgreSQL with pgx & GORM Optimization', 'Benchmarking, Profiling (pprof) & Unit Testing'],
      prerequisites: ['Basic programming in any language (C, Java, Python, or JS)', 'Understanding of concurrency & threads', 'Basic networking concepts']
    },
    boost: {
      capstone_projects: [
        { title: 'High-Throughput Distributed Rate Limiter & API Gateway', tech_stack: ['Go', 'Redis', 'gRPC', 'Docker', 'Prometheus'], description: 'Design a token-bucket rate limiter handling 50,000 concurrent requests with sub-millisecond p99 latency.' }
      ],
      certifications: ['Linux Foundation Certified Kubernetes Application Developer (CKAD)', 'Google Cloud Certified Cloud Developer'],
      interview_focus: ['Go Scheduler (GMP Model) & Goroutine Stack Scaling', 'Channel Deadlocks & Race Condition Detection', 'Interface Internals (iface/eface)', 'gRPC Streaming vs Traditional REST Overheads']
    }
  },

  rust_developer: {
    title: 'Rust Developer',
    description: 'Engineer memory-safe, zero-cost abstraction systems, high-performance web backends, and low-level software using modern Rust.',
    goal: {
      objective: 'Build blazingly fast, memory-safe, zero-overhead software systems, high-frequency network services, and infrastructure tooling.',
      salary: '$95,000 - $170,000 / yr (₹9 - ₹28 LPA)',
      salary_range: { usd: { min: 95000, max: 170000, period: 'yr' }, inr_lpa: { min: 9, max: 28, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 6+ Years)',
      target_roles: ['Rust Systems Engineer', 'High-Performance Backend Developer', 'Infrastructure Tooling Engineer', 'Blockchain Systems Developer'],
      career_pillars: ['Ownership, Borrowing & Lifetimes', 'Asynchronous Runtimes (Tokio/Axum)', 'Zero-Cost Abstractions & Systems Programming']
    },
    learn: {
      summary: 'Master Rust memory safety without garbage collection, the borrow checker, smart pointers, pattern matching, async programming with Tokio, and web frameworks like Axum and Actix-web.',
      key_competencies: ['Ownership, Borrow Checker & Lifetimes', 'Traits, Generics & Zero-Cost Abstractions', 'Tokio Async Runtime & Futures', 'Web Services with Axum & SQLx', 'Concurrency Safety without Data Races'],
      prerequisites: ['Prior programming experience in C/C++, Java, or Go', 'Basic understanding of memory pointers and stacks', 'Command-line proficiency']
    },
    boost: {
      capstone_projects: [
        { title: 'Fast In-Memory Key-Value Cache Engine', tech_stack: ['Rust', 'Tokio', 'RESP Protocol', 'Criterion Benchmarking'], description: 'Build a multithreaded Redis-compatible in-memory store supporting concurrent reads/writes with zero runtime data races.' }
      ],
      certifications: ['Linux Foundation Certified Systems Engineer'],
      interview_focus: ['Borrow Checker Rules & Lifetime Annotations', 'Arc, Rc, RefCell & Mutex Internal Differences', 'Tokio Async Task Scheduling & Pinning', 'Memory Layout & Zero-Cost Traits']
    }
  },

  scala_developer: {
    title: 'Scala Developer',
    description: 'Combine functional programming and object-oriented paradigms for scalable backend services, distributed systems, and big data streaming with Scala 3.',
    goal: {
      objective: 'Architect resilient, highly parallelized distributed backends and big data computing pipelines using pure functional programming on the JVM.',
      salary: '$90,000 - $160,000 / yr (₹8 - ₹25 LPA)',
      salary_range: { usd: { min: 90000, max: 160000, period: 'yr' }, inr_lpa: { min: 8, max: 25, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 6+ Years)',
      target_roles: ['Scala Software Engineer', 'Distributed Backend Developer', 'Big Data / Spark Engineer'],
      career_pillars: ['Pure Functional Programming', 'Akka / Pekko Actor Concurrency', 'Type-Level Programming & Spark Processing']
    },
    learn: {
      summary: 'Master Scala 3 syntax, algebraic data types (ADTs), higher-order functions, Cats/ZIO effect systems, Pekko/Akka actor systems, and distributed processing with Apache Spark.',
      key_competencies: ['Scala 3 Syntax, Enums & Extension Methods', 'Functional Programming (Monads, Functors, Pure Functions)', 'Cats Effect & ZIO Concurrent Runtimes', 'Akka/Pekko Actor Concurrency', 'Apache Spark Distributed Data Processing'],
      prerequisites: ['Java or JVM foundation', 'Basic discrete math and recursion', 'Object-Oriented Programming principles']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time Financial Telemetry Pipeline', tech_stack: ['Scala 3', 'Cats Effect', 'Kafka', 'PostgreSQL'], description: 'Build a purely functional event processing engine that validates and aggregates streaming transactions with zero side-effects.' }
      ],
      certifications: ['Databricks Certified Associate Developer for Apache Spark'],
      interview_focus: ['Monads & Referential Transparency', 'Scala Implicits & Given/Using in Scala 3', 'Actor Model Fault Tolerance & Supervision Strategies', 'Spark Catalyst Optimizer Execution Plans']
    }
  },

  elixir_phoenix_developer: {
    title: 'Elixir & Phoenix Developer',
    description: 'Build ultra-scalable, fault-tolerant, real-time web platforms using the BEAM virtual machine, Elixir concurrency, and Phoenix LiveView.',
    goal: {
      objective: 'Create bulletproof, low-latency, real-time web applications and distributed messaging services leveraging the fault-tolerant Erlang/BEAM ecosystem.',
      salary: '$90,000 - $155,000 / yr (₹7.5 - ₹24 LPA)',
      salary_range: { usd: { min: 90000, max: 155000, period: 'yr' }, inr_lpa: { min: 7.5, max: 24, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Elixir Developer', 'Phoenix Fullstack Engineer', 'Real-Time Systems Developer'],
      career_pillars: ['BEAM VM & OTP Supervision', 'Phoenix LiveView Real-Time Web', 'Functional Concurrency & Ecto']
    },
    learn: {
      summary: 'Master Elixir functional programming, pattern matching, processes, OTP GenServers, supervision trees, Phoenix Framework, Phoenix LiveView, and Ecto database migrations.',
      key_competencies: ['Elixir Syntax, Pattern Matching & Immutability', 'OTP GenServers, Supervisors & Task Trees', 'Phoenix Web Framework & Routing', 'Phoenix LiveView Reactive Web Interfaces', 'Ecto Changesets, Queries & Database Operations'],
      prerequisites: ['Understanding of functional programming basics', 'Basic web application architecture', 'Relational database fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Live Multiplayer Whiteboard & Chat Engine', tech_stack: ['Elixir', 'Phoenix LiveView', 'PubSub', 'PostgreSQL'], description: 'Build a zero-JavaScript real-time collaborative workspace supporting thousands of concurrent users per node.' }
      ],
      interview_focus: ['BEAM Process Isolation & "Let it Crash" Philosophy', 'GenServer State Loop & Message Mailbox', 'Phoenix LiveView WebSockets vs REST', 'Ecto Changeset Validations']
    }
  },

  graphql_api_developer: {
    title: 'GraphQL API Developer',
    description: 'Design flexible, high-performance schema-driven APIs, federated enterprise graphs, and efficient client data-fetching layers.',
    goal: {
      objective: 'Architect unified enterprise GraphQL schemas that eliminate over-fetching, power multi-client applications, and unify backend microservices.',
      salary: '$85,000 - $145,000 / yr (₹7 - ₹22 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 7, max: 22, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['GraphQL Engineer', 'API Platform Developer', 'Backend Software Engineer'],
      career_pillars: ['Schema Design (SDL) & Resolvers', 'Apollo Federation & Subgraphs', 'DataLoader & N+1 Query Elimination']
    },
    learn: {
      summary: 'Master GraphQL Schema Definition Language (SDL), query resolvers, mutations, subscriptions, Apollo Server/Client, DataLoader caching, and enterprise Apollo Federation.',
      key_competencies: ['GraphQL Schema Definition Language & Types', 'Resolver Execution Lifecycle & Context', 'N+1 Query Resolution with DataLoader', 'Apollo Federation & Distributed Graphs', 'GraphQL Subscriptions via WebSockets'],
      prerequisites: ['Solid understanding of REST APIs', 'Node.js, Go, or Python backend basics', 'Database query fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Federated Supergraph for Multi-Brand Retail', tech_stack: ['Apollo Router', 'Node.js/TypeScript', 'GraphQL', 'Redis', 'Docker'], description: 'Build a federated supergraph unifying product, inventory, and review microservices into a single cohesive API endpoint.' }
      ],
      certifications: ['Apollo Certified Associate Developer'],
      interview_focus: ['N+1 Problem & DataLoader Batching Internals', 'Federation @key, @extends, and Entity Resolvers', 'Query Depth Limiting & Complexity Defense', 'GraphQL Caching Strategies']
    }
  },

  api_platform_engineer: {
    title: 'API Platform Engineer',
    description: 'Design, secure, and operate enterprise API gateways, developer portals, rate limiting, and contract governance at scale.',
    goal: {
      objective: 'Establish reliable, secure, and standardized API infrastructure, developer portals, and gateway routing for high-scale engineering organizations.',
      salary: '$90,000 - $160,000 / yr (₹8 - ₹25 LPA)',
      salary_range: { usd: { min: 90000, max: 160000, period: 'yr' }, inr_lpa: { min: 8, max: 25, period: 'lpa' } },
      experience_level: 'Mid to Staff (2 - 6+ Years)',
      target_roles: ['API Platform Engineer', 'Gateway Solutions Architect', 'Infrastructure Platform Developer'],
      career_pillars: ['API Gateway Architecture (Kong/Envoy)', 'Contract Governance & OpenAPI', 'Zero Trust API Security & mTLS']
    },
    learn: {
      summary: 'Master API gateways (Kong, Envoy, Apigee), OpenAPI/Swagger specs, OAuth 2.0/mTLS security, rate-limiting algorithms, developer portal generation, and telemetry.',
      key_competencies: ['API Gateway Routing (Kong, Envoy)', 'OpenAPI Spec & Contract Testing', 'OAuth 2.0, mTLS & JWT Validation', 'Token Bucket & Leaky Bucket Rate Limiting', 'API Analytics & Distributed Tracing'],
      prerequisites: ['Backend API development experience', 'HTTP protocol deep knowledge', 'Basic Kubernetes & Docker knowledge']
    },
    boost: {
      capstone_projects: [
        { title: 'Enterprise API Gateway & Developer Developer Hub', tech_stack: ['Envoy/Kong', 'Docker', 'OpenAPI', 'Redis', 'Go'], description: 'Deploy an API gateway featuring automated JWT validation, distributed rate limiting, and dynamic OpenAPI mock servers.' }
      ],
      certifications: ['Linux Foundation Certified Kubernetes Application Developer (CKAD)'],
      interview_focus: ['Gateway vs Service Mesh Responsibilities', 'Rate Limiting Algorithms (Sliding Window vs Leaky Bucket)', 'Zero Trust mTLS Enforcement', 'API Versioning & Breaking Change Management']
    }
  },

  wordpress_developer: {
    title: 'WordPress Developer',
    description: 'Build modern, secure, and custom WordPress websites, Gutenberg block plugins, headless architectures, and WooCommerce e-commerce engines.',
    goal: {
      objective: 'Develop high-performance, secure, and tailor-made WordPress solutions ranging from custom Gutenberg blocks to enterprise headless installations.',
      salary: '$60,000 - $110,000 / yr (₹4.5 - ₹16 LPA)',
      salary_range: { usd: { min: 60000, max: 110000, period: 'yr' }, inr_lpa: { min: 4.5, max: 16, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['WordPress Developer', 'PHP/CMS Engineer', 'WooCommerce Specialist'],
      career_pillars: ['Custom Gutenberg Block Engineering', 'Theme & Plugin Architecture', 'Headless WordPress & REST/GraphQL']
    },
    learn: {
      summary: 'Master modern PHP, WordPress core hooks (actions & filters), custom post types, Gutenberg block creation with React, WooCommerce customization, and headless setups.',
      key_competencies: ['WordPress Hooks (Actions & Filters)', 'Custom Gutenberg Blocks (React & @wordpress/scripts)', 'Custom Theme & Plugin Development', 'WooCommerce Architecture & Hooks', 'Headless WordPress (WPGraphQL / REST API)'],
      prerequisites: ['HTML, CSS and modern JavaScript', 'Basic PHP syntax', 'MySQL database fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Custom Headless Real Estate Listing Portal', tech_stack: ['Next.js', 'WordPress', 'WPGraphQL', 'Tailwind CSS'], description: 'Build a headless real estate portal leveraging WordPress as a headless CMS and Next.js for instant static page generation.' }
      ],
      interview_focus: ['WordPress Action vs Filter Hooks', 'Gutenberg Block Attributes & Deprecation Handlers', 'Security Sanitization (wp_kses, sanitize_text_field)', 'Database Optimization for High-Traffic WP Sites']
    }
  },

  shopify_developer: {
    title: 'Shopify Developer',
    description: 'Master custom e-commerce storefront development using Liquid, the Shopify CLI, Storefront API, Hydrogen, and custom Shopify app engineering.',
    goal: {
      objective: 'Engineer high-converting e-commerce experiences and custom merchant applications utilizing Liquid and headless Shopify Hydrogen architectures.',
      salary: '$70,000 - $125,000 / yr (₹5 - ₹18 LPA)',
      salary_range: { usd: { min: 70000, max: 125000, period: 'yr' }, inr_lpa: { min: 5, max: 18, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Shopify Developer', 'E-Commerce Frontend Engineer', 'Shopify Plus Specialist'],
      career_pillars: ['Liquid Theme Development', 'Headless Commerce (Hydrogen & Remix)', 'Shopify App Development (Node/Remix)']
    },
    learn: {
      summary: 'Master Shopify theme architecture (JSON templates, sections, blocks), Liquid templating, Shopify CLI, Storefront GraphQL API, Hydrogen, and Shopify Functions.',
      key_competencies: ['Liquid Templating Engine & Objects', 'Shopify 2.0 Section & Block Architecture', 'Storefront GraphQL API & Cart Operations', 'Headless E-Commerce with Hydrogen/Remix', 'Shopify App Development & Admin API'],
      prerequisites: ['HTML, CSS and modern JavaScript', 'Understanding of e-commerce checkout flows', 'Git version control']
    },
    boost: {
      capstone_projects: [
        { title: 'Bespoke Custom Apparel Storefront with 3D Preview', tech_stack: ['Shopify Liquid', 'JavaScript', 'Tailwind', 'Storefront API'], description: 'Develop a high-conversion Shopify 2.0 theme featuring dynamic bundle builders, slide-out cart, and sub-second load times.' }
      ],
      certifications: ['Shopify Partner Academy Certifications'],
      interview_focus: ['Liquid Render Lifecycle & Performance Limits', 'Headless Shopify Architecture with Hydrogen', 'Shopify Functions vs Legacy Scripts', 'Cart Mutation Performance & Optimistic UI']
    }
  },

  // ─── 2. MOBILE & DESKTOP APPS ───
  android: {
    title: 'Android Developer',
    description: 'Build native, modern Android applications using Kotlin, Jetpack Compose, Coroutines, Flow, Room database, and clean architecture principles.',
    goal: {
      objective: 'Architect robust, performant native Android mobile applications that deliver smooth 60fps experiences across the diverse global Android device ecosystem.',
      salary: '$75,000 - $135,000 / yr (₹5.5 - ₹20 LPA)',
      salary_range: { usd: { min: 75000, max: 135000, period: 'yr' }, inr_lpa: { min: 5.5, max: 20, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Android Engineer', 'Mobile Application Developer', 'Kotlin Specialist'],
      career_pillars: ['Declarative UI with Jetpack Compose', 'Asynchronous Kotlin Coroutines & Flow', 'Clean Architecture (MVVM/MVI)']
    },
    learn: {
      summary: 'Master Kotlin language, Jetpack Compose UI, Android Lifecycle, StateFlow, Room local database, Retrofit networking, Hilt dependency injection, and Play Store publishing.',
      key_competencies: ['Kotlin Language & Functional Primitives', 'Jetpack Compose Declarative UI', 'Coroutines & StateFlow Asynchronous State', 'Android Architecture Components (MVVM/MVI)', 'Hilt Dependency Injection & Room Persistence'],
      prerequisites: ['Object-Oriented Programming (Java or Kotlin)', 'Basic mobile interface understanding', 'Android Studio familiarity']
    },
    boost: {
      capstone_projects: [
        { title: 'Offline-First Fitness & Workout Companion', tech_stack: ['Kotlin', 'Jetpack Compose', 'Room DB', 'Hilt', 'Coroutines'], description: 'Build an offline-first fitness tracker with animated exercise routines, SQLite synchronization, and background notification alarms.' }
      ],
      certifications: ['AWS Certified Developer - Associate'],
      interview_focus: ['Android Activity & Fragment Lifecycles', 'Jetpack Compose Recomposition Optimization', 'Coroutines Dispatchers & Exception Handling', 'Memory Leak Detection with LeakCanary']
    }
  },

  ios_developer: {
    title: 'iOS Developer',
    description: 'Master native Apple platform development using Swift 6, SwiftUI, Swift Concurrency, Core Data / SwiftData, and human interface guidelines.',
    goal: {
      objective: 'Craft delightful, buttery-smooth native iOS and iPadOS applications that embody Apple’s design aesthetic and technical excellence.',
      salary: '$80,000 - $145,000 / yr (₹6 - ₹22 LPA)',
      salary_range: { usd: { min: 80000, max: 145000, period: 'yr' }, inr_lpa: { min: 6, max: 22, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['iOS Developer', 'Apple Platform Engineer', 'Mobile Software Engineer'],
      career_pillars: ['SwiftUI Declarative Architecture', 'Modern Swift Concurrency (async/await, Actors)', 'Apple Human Interface Guidelines & Performance']
    },
    learn: {
      summary: 'Master modern Swift 6, SwiftUI views and state management, SwiftData/Core Data, URLSession networking, async/await, Combine, and App Store submission pipelines.',
      key_competencies: ['Swift 6 Language & Memory Model (ARC)', 'SwiftUI Views, Modifiers & NavigationStack', 'Swift Concurrency (Tasks, Actors, async/await)', 'SwiftData & Core Data Local Persistence', 'XCTest Unit & UI Testing Framework'],
      prerequisites: ['Basic programming knowledge', 'Access to macOS and Xcode', 'Design sensitivity for iOS aesthetics']
    },
    boost: {
      capstone_projects: [
        { title: 'Personal Finance & Subscription Tracker', tech_stack: ['Swift 6', 'SwiftUI', 'SwiftData', 'StoreKit 2', 'Charts'], description: 'Build an iOS app with interactive monthly expenditure charts, FaceID biometric authentication, and StoreKit subscription purchasing.' }
      ],
      certifications: ['Meta iOS Developer Professional Certificate'],
      interview_focus: ['Automatic Reference Counting (ARC) & Retain Cycles', 'Swift Structs vs Classes & Copy-on-Write', 'Swift Concurrency Actors & Data Race Safety', 'SwiftUI View Lifecycle & State Redraws']
    }
  },

  flutter_developer: {
    title: 'Flutter Developer',
    description: 'Build pixel-perfect, cross-platform mobile, web, and desktop applications from a single codebase using Dart and Flutter.',
    goal: {
      objective: 'Deliver high-performance, beautifully animated applications across iOS, Android, and Web from a single unified Flutter and Dart codebase.',
      salary: '$75,000 - $130,000 / yr (₹5 - ₹18 LPA)',
      salary_range: { usd: { min: 75000, max: 130000, period: 'yr' }, inr_lpa: { min: 5, max: 18, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Flutter Developer', 'Cross-Platform Mobile Engineer', 'Dart Developer'],
      career_pillars: ['Flutter Widget Tree & Custom Painting', 'State Management (BLoC / Riverpod)', 'Native Platform Channels & CI/CD']
    },
    learn: {
      summary: 'Master Dart object-oriented programming, Flutter widget lifecycles, state management with BLoC and Riverpod, Dio networking, animations, and platform channels.',
      key_competencies: ['Dart Language, Null Safety & Streams', 'Flutter Widget Architecture (Stateless/Stateful)', 'BLoC & Riverpod State Management', 'Custom Animations & RenderObject Canvas', 'Platform Channels & Native Method Calls'],
      prerequisites: ['Basic object-oriented programming', 'Understanding of mobile UX', 'Git version control']
    },
    boost: {
      capstone_projects: [
        { title: 'On-Demand Delivery & Order Tracking App', tech_stack: ['Flutter', 'Dart', 'BLoC', 'Google Maps API', 'Firebase'], description: 'Build a cross-platform delivery app featuring real-time GPS map tracking, cart management, and push notifications.' }
      ],
      interview_focus: ['Flutter RenderTree, ElementTree & WidgetTree', 'BLoC Pattern vs Provider / Riverpod', 'MethodChannel Communication Mechanics', 'App Launch Time & Frame Rate Optimization']
    }
  },

  react_native_developer: {
    title: 'React Native Developer',
    description: 'Leverage your React and JavaScript skills to build cross-platform native iOS and Android apps with Expo, Reanimated, and native modules.',
    goal: {
      objective: 'Build truly native-feeling iOS and Android mobile applications sharing code with modern React web applications using Expo and React Native.',
      salary: '$80,000 - $140,000 / yr (₹6 - ₹20 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 6, max: 20, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['React Native Engineer', 'Cross-Platform Mobile Developer', 'Mobile Frontend Specialist'],
      career_pillars: ['New Architecture (Fabric & TurboModules)', 'Expo Ecosystem & EAS Workflows', 'Smooth Gestures & 60fps Animations']
    },
    learn: {
      summary: 'Master React Native core components, Expo Router, React Navigation, React Native Reanimated 3, Gesture Handler, offline storage with SQLite/MMKV, and EAS deployment.',
      key_competencies: ['React Native Components & Flexbox Layouts', 'Expo Router & File-Based Navigation', 'Reanimated 3 & Gesture Handler Mechanics', 'State Management & Offline Storage (MMKV)', 'Native Bridges, TurboModules & Fabric'],
      prerequisites: ['Strong React & JavaScript/TypeScript knowledge', 'Basic mobile device understanding', 'Git workflows']
    },
    boost: {
      capstone_projects: [
        { title: 'Social Community & Audio Streaming App', tech_stack: ['React Native', 'Expo', 'TypeScript', 'Reanimated 3', 'Supabase'], description: 'Develop a modern audio streaming mobile app with background playback controls, fluid gesture drawers, and real-time community chat.' }
      ],
      certifications: ['Meta React Native Specialization'],
      interview_focus: ['React Native New Architecture (JSI, Fabric, TurboModules)', 'JavaScript Thread vs UI Thread Synchronization', 'Gesture Handling & Reanimated Worklets', 'Memory & Image Caching in React Native']
    }
  },

  desktop_app_developer: {
    title: 'Desktop App Developer',
    description: 'Build native and cross-platform desktop applications for Windows, macOS, and Linux using Electron, Tauri, Rust, and modern web technologies.',
    goal: {
      objective: 'Deliver secure, low-memory, and cross-platform desktop software leveraging Electron, Tauri, and native operating system integration APIs.',
      salary: '$85,000 - $145,000 / yr (₹6.5 - ₹22 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 6.5, max: 22, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Desktop Software Engineer', 'Cross-Platform Application Developer', 'Electron / Tauri Engineer'],
      career_pillars: ['IPC Security & Process Architecture', 'Tauri Rust Native Backend Integration', 'OS Native System Tray & Auto-Updates']
    },
    learn: {
      summary: 'Master Electron main vs renderer processes, IPC communication, security context isolation, Tauri architecture with Rust, local file system operations, and automated desktop packaging.',
      key_competencies: ['Electron Process Model (Main vs Renderer)', 'IPC (Inter-Process Communication) Security', 'Tauri Architecture & Rust Command Handlers', 'Local SQLite Database & File System Access', 'Cross-Platform Packaging (MSIX, DMG, AppImage)'],
      prerequisites: ['HTML, CSS and JavaScript/TypeScript', 'Basic Node.js or Rust understanding', 'Desktop operating system fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Developer System Telemetry & Log Explorer', tech_stack: ['Tauri', 'Rust', 'React', 'Tailwind'], description: 'Build an ultra-lightweight desktop app monitoring local CPU/RAM, parsing GB-sized log files with multi-threading, and alerting via system tray.' }
      ],
      interview_focus: ['Electron Security Best Practices (Context Isolation, Node Integration)', 'Tauri vs Electron Resource Consumption', 'Desktop IPC Deadlock Prevention', 'Code Signing & Automatic Updating Architecture']
    }
  },

  macos_developer: {
    title: 'macOS Developer',
    description: 'Craft high-performance, native Mac software using Swift, AppKit, SwiftUI, Apple Silicon optimizations, and macOS system frameworks.',
    goal: {
      objective: 'Build native macOS applications that embrace the Mac interface paradigms, menu bar workflows, Apple Silicon optimizations, and security sandboxing.',
      salary: '$90,000 - $155,000 / yr (₹7.5 - ₹24 LPA)',
      salary_range: { usd: { min: 90000, max: 155000, period: 'yr' }, inr_lpa: { min: 7.5, max: 24, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['macOS Developer', 'Apple Systems Engineer', 'Desktop Software Developer'],
      career_pillars: ['AppKit & SwiftUI Mac Interactivity', 'App Sandboxing & Entitlements', 'macOS Performance & Apple Silicon Tuning']
    },
    learn: {
      summary: 'Master Swift on macOS, AppKit fundamentals, SwiftUI for Mac, menu bar apps, window management, drag-and-drop protocols, sandboxing security, and notarization.',
      key_competencies: ['Swift on macOS & Apple Silicon Architecture', 'AppKit Controls (NSWindow, NSView, NSMenu)', 'SwiftUI Mac-Specific Adaptations', 'App Sandbox, File Security Scopes & Notarization', 'System Extensions & Background Services'],
      prerequisites: ['Swift language proficiency', 'Mac user familiarity', 'Xcode environment knowledge']
    },
    boost: {
      capstone_projects: [
        { title: 'Menu Bar Developer Utility & Clipboard History', tech_stack: ['Swift', 'SwiftUI', 'AppKit', 'Core Data'], description: 'Develop a menu bar companion app capturing clipboard history with global hotkeys, search, and encrypted local storage.' }
      ],
      interview_focus: ['AppKit vs SwiftUI Tradeoffs on macOS', 'Sandbox Security Scopes & File Bookmarks', 'Global Hotkey Interception & Accessibility Permissions', 'Apple Notarization & Code Signing Requirements']
    }
  },

  windows_app_developer: {
    title: 'Windows App Developer',
    description: 'Build modern native Windows client applications using WinUI 3, the Windows App SDK, C#, XAML, MVVM, and Microsoft Store packaging.',
    goal: {
      objective: 'Engineer modern, fluid, and responsive native Windows desktop applications using WinUI 3, Windows App SDK, and the Fluent Design System.',
      salary: '$80,000 - $140,000 / yr (₹6 - ₹20 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 6, max: 20, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Windows App Developer', 'C# Desktop Engineer', 'WinUI / WPF Software Developer'],
      career_pillars: ['WinUI 3 & Fluent Design', 'MVVM Pattern with CommunityToolkit', 'Windows App SDK Native Integration']
    },
    learn: {
      summary: 'Master C# desktop development, WinUI 3, XAML styling, MVVM architecture, CommunityToolkit.Mvvm, Windows notification APIs, and MSIX deployment packaging.',
      key_competencies: ['C# Language & .NET Runtime', 'WinUI 3 & Windows App SDK Controls', 'XAML Layouts, Data Binding & Templates', 'MVVM Pattern & Dependency Injection', 'MSIX Packaging & Microsoft Store Release'],
      prerequisites: ['C# or OOP fundamentals', 'Visual Studio IDE basics', 'General Windows OS architecture']
    },
    boost: {
      capstone_projects: [
        { title: 'Fluent Markdown Notes & Task Manager', tech_stack: ['C#', 'WinUI 3', 'XAML', 'SQLite', 'MSIX'], description: 'Build a sleek Windows app embracing Mica material, tabbed windows, markdown rendering, and local SQLite data persistence.' }
      ],
      certifications: ['Microsoft Certified: Azure Developer Associate'],
      interview_focus: ['XAML Data Binding (x:Bind vs Binding)', 'MVVM Property Notification & Command Handling', 'Windows App SDK Process Architecture', 'MSIX Packaging & Sandbox Isolation']
    }
  }
};

module.exports = { PART1_CATALOG };
