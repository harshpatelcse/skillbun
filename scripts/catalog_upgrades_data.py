import os
import json
import re

ROADMAPS_DIR = 'public/data/roadmaps'

# Upgrades catalog for boost capstone projects & interview focus
UPGRADES = {
    "analytics_engineer": {
        "capstones": [
            {
                "title": "Production dbt Analytics Warehouse with Snowflake & CI/CD",
                "tech_stack": ["dbt Core", "Snowflake", "GitHub Actions", "Elementary Data", "SQL"],
                "description": "Architect a modular analytics data warehouse utilizing dbt Core, automated CI testing with Slim CI, semantic layer definitions, and Elementary anomaly alerting."
            },
            {
                "title": "Real-Time Streaming Analytics & Semantic Layer Platform",
                "tech_stack": ["Cube.js", "Apache Kafka", "ClickHouse", "DuckDB", "Apache Superset"],
                "description": "Construct a high-throughput real-time analytical pipeline feeding a Cube.js semantic layer with sub-second query latency and role-based data access."
            }
        ],
        "interview_focus": [
            "dbt Incremental Models (Merge vs Append Strategies & Unique Keys)",
            "Data Modeling (Kimball Dimensional Modeling vs One Big Table / OBT)",
            "Snowflake Clustering Keys, Micro-Partitions & Warehouse Sizing",
            "Data Quality Frameworks (dbt tests, Elementary anomaly monitoring, Great Expectations)",
            "Semantic Layer Architecture (Metrics definitions & BI caching layers)"
        ]
    },
    "api_platform_engineer": {
        "capstones": [
            {
                "title": "High-Throughput Distributed API Gateway with Envoy & Redis",
                "tech_stack": ["Go", "Envoy Proxy", "Redis", "OpenTelemetry", "Docker"],
                "description": "Build an ultra-low-latency API gateway proxy featuring distributed sliding-window rate limiting, JWT validation, and automated circuit breaking with Envoy."
            },
            {
                "title": "Enterprise Developer Portal & Automated OpenAPI Contract Testing Suite",
                "tech_stack": ["Docusaurus", "Spectral", "Schemathesis", "GitHub Actions", "TypeScript"],
                "description": "Construct an automated API governance hub with live OpenAPI/Swagger documentation, Spectral linting rules, and fuzz-based contract validation in CI."
            }
        ],
        "interview_focus": [
            "API Rate Limiting Algorithms (Leaky Bucket, Token Bucket, Sliding Window Counter)",
            "API Versioning Strategies (URI vs Header vs Query Param) & Deprecation Lifecycles",
            "HTTP/2 vs HTTP/3 Multiplexing, gRPC Protobufs & REST Tradeoffs",
            "Idempotency Keys & Distributed Lock Implementation in Payment APIs",
            "Distributed Tracing (W3C Trace Context, OpenTelemetry Spans & Sampling Rates)"
        ]
    },
    "application_security_engineer": {
        "capstones": [
            {
                "title": "Automated DevSecOps CI/CD Security Pipeline",
                "tech_stack": ["Semgrep", "Trivy", "Sigstore Cosign", "GitHub Actions", "Python"],
                "description": "Build an automated security gate in GitHub Actions integrating Semgrep SAST, Trivy container scanning, Sigstore cryptographic artifact signing, and SARIF triage."
            },
            {
                "title": "Cloud-Native Web Application Firewall & Micro-Proxy",
                "tech_stack": ["Coraza / ModSecurity", "Go", "Redis", "Docker", "OWASP CRS"],
                "description": "Architect a high-performance WAF reverse proxy enforcing OWASP Core Rule Set, automated bot mitigation, and distributed IP reputation scoring."
            }
        ],
        "interview_focus": [
            "OWASP Top 10 Root Causes & Defenses (SQLi, SSRF, XSS, IDOR, Broken Object Level Auth)",
            "OAuth2.0 / OIDC Grant Flows, PKCE Mechanics & JWT Vulnerabilities (Alg=None, Key Confusion)",
            "Software Supply Chain Security (SLSA Framework, SBOM Generation, CycloneDX, Sigstore)",
            "Content Security Policy (CSP Level 3), CORS Headers & Subresource Integrity (SRI)",
            "Threat Modeling Methodologies (STRIDE, DREAD, Attack Trees) for Cloud Microservices"
        ]
    },
    "blockchain_web3": {
        "capstones": [
            {
                "title": "Constant-Product Automated Market Maker (AMM) with Flash Loan Protections",
                "tech_stack": ["Solidity", "Foundry", "Viem", "Next.js", "Tailwind CSS"],
                "description": "Architect a Uniswap v2 style constant-product AMM featuring ERC-20 swap mechanics, liquidity provisioning, reentrancy guards, and Foundry fuzz invariant tests."
            },
            {
                "title": "Decentralized Collateralized Lending Protocol & Liquidator Bot",
                "tech_stack": ["Solidity", "ERC-4626", "Chainlink Oracles", "Python", "Ethers.js"],
                "description": "Build an overcollateralized lending pool with interest rate curves, Chainlink price feed validation, and an automated off-chain liquidator bot."
            }
        ],
        "interview_focus": [
            "Reentrancy Attack Vectors (Single-Function, Cross-Function, Read-Only Reentrancy)",
            "EVM Storage Layout, Slot Packing & Gas Optimization (Calldata vs Memory vs Storage)",
            "ERC-4337 Account Abstraction (UserOperations, Bundlers, Paymasters & Smart Wallets)",
            "Oracle Manipulation Risks, Time-Weighted Average Price (TWAP) & Flash Loan Defenses",
            "Foundry Fuzz Testing, Invariant Handlers & Symbolic Execution Principles"
        ]
    },
    "business_analyst": {
        "capstones": [
            {
                "title": "Enterprise Digital Transformation BRD & Business Process Model",
                "tech_stack": ["BPMN 2.0", "Jira", "Confluence", "Lucidchart", "Gap Analysis"],
                "description": "Author an exhaustive Business Requirements Document (BRD) and As-Is / To-Be process maps for a corporate ERP migration with stakeholder RACI matrices."
            },
            {
                "title": "Data-Driven Process Mining & Customer Journey Analytics Audit",
                "tech_stack": ["Celonis", "SQL", "Power BI", "Python", "Value Stream Mapping"],
                "description": "Execute a process mining audit on corporate procurement logs, pinpointing bottleneck stages, throughput variances, and automation ROI projections."
            }
        ],
        "interview_focus": [
            "Requirements Elicitation Techniques (Workshops, Shadowing, Contextual Inquiry)",
            "Functional vs Non-Functional Requirements (Performance, Security, Compliance)",
            "BPMN 2.0 Syntax (Gateways, Pools, Lanes, Boundary Events) & Value Stream Mapping",
            "User Story Writing & Acceptance Criteria (Gherkin Given-When-Then Syntax)",
            "Change Management Models (ADKAR, Kotter) & Executive Stakeholder Conflict Resolution"
        ]
    },
    "c_cpp_systems_developer": {
        "capstones": [
            {
                "title": "High-Frequency Limit Order Book & Order Matching Engine",
                "tech_stack": ["Modern C++20", "Lock-Free Ring Buffer", "Zero-Copy Sockets", "SIMD", "Google Benchmark"],
                "description": "Construct an ultra-low-latency order matching engine processing FIFO limit and market orders with microsecond execution and lock-free memory management."
            },
            {
                "title": "High-Performance Multithreaded In-Memory Key-Value Store with LSM-Tree",
                "tech_stack": ["C++17", "epoll", "Write-Ahead Logging (WAL)", "MemTable", "Google Test"],
                "description": "Engineer an in-memory key-value database featuring an LSM-tree storage engine, background compaction, WAL durability, and asynchronous Linux epoll networking."
            }
        ],
        "interview_focus": [
            "C++ Memory Model, std::atomic & Memory Ordering (acquire-release vs sequential consistency)",
            "Move Semantics, Rvalue References & Perfect Forwarding (std::forward, std::move)",
            "RAII, Smart Pointers (std::unique_ptr vs std::shared_ptr control block) & Custom Deleters",
            "Virtual Function Tables (vtable), Dynamic Dispatch Overhead & Cache Locality",
            "Undefined Behavior, AddressSanitizer (ASan), Valgrind & Zero-Cost Abstractions"
        ]
    },
    "database_admin": {
        "capstones": [
            {
                "title": "Zero-Data-Loss PostgreSQL High Availability Cluster with Patroni & etcd",
                "tech_stack": ["PostgreSQL 16", "Patroni", "etcd", "pgBouncer", "HAProxy"],
                "description": "Deploy a resilient multi-node PostgreSQL HA cluster featuring DCS-backed automated failover via Patroni, connection pooling with pgBouncer, and split-brain defenses."
            },
            {
                "title": "Zero-Downtime Database Migration & Change Data Capture Pipeline",
                "tech_stack": ["Debezium", "Apache Kafka", "PostgreSQL", "ClickHouse", "Flyway"],
                "description": "Execute a zero-downtime database sharding and migration pipeline streaming WAL changes via Debezium CDC into an analytical data store with schema validation."
            }
        ],
        "interview_focus": [
            "ACID Properties & Transaction Isolation Levels (Read Committed to Serializable Anomalies)",
            "PostgreSQL MVCC, VACUUM Mechanics, Table Bloat & Write Amplification",
            "B-Tree vs Hash vs GIN vs GiST Indexing Strategies & EXPLAIN ANALYZE Execution Plans",
            "Point-in-Time Recovery (PITR), WAL Archiving & Backup Verification Automation",
            "Distributed Consensus (etcd / Raft) in Database Failover & Quorum Management"
        ]
    },
    "design_systems_engineer": {
        "capstones": [
            {
                "title": "Enterprise Multi-Brand Headless Component Library",
                "tech_stack": ["React", "Radix UI", "TypeScript", "Tailwind CSS", "Storybook 8"],
                "description": "Build an enterprise headless design system with full WAI-ARIA compliance, composable primitives, automated accessibility audits, and multi-theme support."
            },
            {
                "title": "Automated Cross-Platform Design Token Pipeline",
                "tech_stack": ["Style Dictionary", "Figma REST API", "GitHub Actions", "CSS Variables", "iOS/Android"],
                "description": "Architect a zero-friction design token pipeline transforming Figma token variables into production CSS variables, iOS Swift structs, and Android Jetpack Compose tokens."
            }
        ],
        "interview_focus": [
            "Design Token Architecture (Global Primitives vs Semantic Aliases vs Component Tokens)",
            "Compound Components Pattern, Prop Getters & Inversion of Control in React",
            "Web Accessibility (WCAG 2.2 Level AA, Focus Trapping, ARIA Live Regions, Screen Readers)",
            "Automated Visual Regression Testing (Chromatic, Playwright) & Breaking Change Detection",
            "CSS Specificity, Cascade Layers (@layer) & Subgrid Design System Scalability"
        ]
    },
    "devops_cloud": {
        "capstones": [
            {
                "title": "Production Multi-Tenant GitOps Platform with ArgoCD & Kubernetes",
                "tech_stack": ["Kubernetes", "ArgoCD", "Helm", "Argo Rollouts", "Prometheus"],
                "description": "Construct a self-healing GitOps deployment engine deploying multi-environment microservices with automated canary rollouts via Argo Rollouts and Prometheus metrics."
            },
            {
                "title": "Multi-Region Infrastructure as Code & Disaster Recovery Pipeline",
                "tech_stack": ["Terraform", "AWS VPC/EKS", "HashiCorp Vault", "Terratest", "GitHub Actions"],
                "description": "Architect a modular multi-region AWS cloud infrastructure with automated secret injection, infrastructure unit testing via Terratest, and automated RTO/RPO failover."
            }
        ],
        "interview_focus": [
            "Docker Layer Caching, Multi-Stage Builds & Distroless Container Security",
            "Kubernetes Pod Scheduling, Probes, Resource Requests/Limits & Eviction Lifecycle",
            "Zero-Downtime Deployment Strategies (Canary vs Blue-Green vs Rolling Updates)",
            "Terraform State Management, Locking with DynamoDB, Remote Backends & Drift Detection",
            "Secret Management in CI/CD (OIDC Federated Auth, Vault Dynamic Secrets, KMS)"
        ]
    },
    "dfir_analyst": {
        "capstones": [
            {
                "title": "Enterprise Ransomware Breach Investigation & Timeline Reconstruction",
                "tech_stack": ["Plaso / log2timeline", "Volatility 3", "Eric Zimmerman Tools", "Timesketch", "Wireshark"],
                "description": "Perform an end-to-end memory and disk forensic investigation of a simulated enterprise ransomware intrusion, reconstructing adversary lateral movement."
            },
            {
                "title": "Automated Endpoint Forensic Triage & YARA Threat Hunting Harness",
                "tech_stack": ["Velociraptor", "Python", "YARA", "Sigma Rules", "Timesketch"],
                "description": "Deploy an automated live-response artifact triage system using Velociraptor VQL queries and custom YARA memory scanners across 100+ simulated endpoints."
            }
        ],
        "interview_focus": [
            "Windows Forensic Artifacts ($MFT, USN Journal, Shimcache, Amcache, Prefetch, Shellbags)",
            "Memory Forensics (VAD Tree Analysis, Code Injection, Process Hollow Detection)",
            "Order of Volatility & Forensic Evidence Handling (Chain of Custody, Hash Verification)",
            "Event Log Analysis (Sysmon Events 1, 3, 7, 8, 10, Security Events 4624, 4672, 4720)",
            "Reconstructing Adversary Lateral Movement (Pass-the-Ticket, WMI, PsExec, RDP Tunnels)"
        ]
    },
    "digital_marketing_analyst": {
        "capstones": [
            {
                "title": "Multi-Touch Algorithmic Attribution Model & ROAS Forecaster",
                "tech_stack": ["Python", "Markov Chains", "Shapley Values", "BigQuery", "Looker Studio"],
                "description": "Build a probabilistic multi-touch attribution pipeline comparing first-touch, last-touch, and data-driven Markov chain credit allocation across paid channels."
            },
            {
                "title": "Automated Conversion Rate Optimization (CRO) & User Funnel Audit",
                "tech_stack": ["Google Analytics 4", "BigQuery", "SQL", "Hotjar", "Optimizely"],
                "description": "Design and execute an end-to-end user funnel drop-off analysis using raw GA4 BigQuery event exports, generating actionable A/B test hypotheses with power calculations."
            }
        ],
        "interview_focus": [
            "Attribution Modeling Tradeoffs (First-Click, Last-Click, Linear, Time-Decay vs Markov Chains)",
            "Google Analytics 4 Event-Driven Data Model & BigQuery Raw Export Schema",
            "A/B Testing Statistical Rigor (Sample Size Calculations, Minimum Detectable Effect, p-Values)",
            "Customer Acquisition Cost (CAC), Lifetime Value (LTV) Ratios & Payback Period Modeling",
            "Server-Side Tagging & Privacy Compliance (Cookieless Tracking, Consent Mode v2, GDPR)"
        ]
    },
    "elixir_phoenix_developer": {
        "capstones": [
            {
                "title": "High-Concurrency Real-Time Collaboration Canvas with Phoenix LiveView",
                "tech_stack": ["Elixir", "Phoenix LiveView", "OTP GenStage", "Phoenix PubSub", "Tailwind CSS"],
                "description": "Build a reactive multi-user whiteboard canvas featuring sub-10ms cursor synchronization, presence tracking via Phoenix Presence, and operational transform state."
            },
            {
                "title": "Distributed IoT Telemetry Ingestion Engine with BEAM OTP Supervision",
                "tech_stack": ["Elixir", "Broadway", "TimescaleDB", "Cowboy", "Docker"],
                "description": "Architect a fault-tolerant streaming ingestion pipeline processing 20,000 sensor telemetry messages per second with OTP backpressure and supervision trees."
            }
        ],
        "interview_focus": [
            "BEAM Virtual Machine Internals (Actor Model, Process Mailboxes, Preemptive Scheduling)",
            "OTP Architecture (GenServer, Supervisor One-for-One vs Rest-for-One, Application Trees)",
            "Phoenix LiveView Lifecycle (Mount, Handle Params, Handle Event, Live Navigation)",
            "Concurrency Primitives (Task, Agent, Registry, ETS Tables for In-Memory Caching)",
            "Metaprogramming in Elixir (Macros, Quote/Unquote, Compile-Time Code Generation)"
        ]
    },
    "embedded_iot": {
        "capstones": [
            {
                "title": "Industrial Edge Sensor Telemetry Node with FreeRTOS & MQTT",
                "tech_stack": ["C/C++", "ESP32 / STM32", "FreeRTOS", "mTLS", "MQTT-SN"],
                "description": "Develop an industrial telemetry node running FreeRTOS with task queues, hardware timer interrupts, low-power deep sleep profiling, and mTLS cryptographic telemetry."
            },
            {
                "title": "Secure Dual-Bank Over-The-Air (OTA) Firmware Update System",
                "tech_stack": ["C", "Custom Bootloader", "Ed25519 Signatures", "Flash Partitioning", "Rollback Protection"],
                "description": "Implement a fail-safe dual-bank bootloader capable of verifying cryptographic firmware signatures, performing atomic partition flips, and automatic rollback on crash."
            }
        ],
        "interview_focus": [
            "Interrupt Service Routines (ISRs), Interrupt Latency & Volatile Keyword Invariants",
            "RTOS Task Scheduling (Preemptive Priority, Rate-Monotonic, Priority Inversion & Inheritance)",
            "Hardware Communication Protocols (I2C Clock Stretching, SPI Clock Polarity/Phase, UART Buffering)",
            "Memory Constraints in Microcontrollers (Stack vs Heap, Static Allocation, Memory Alignment)",
            "Low-Power Design Strategies (Sleep Modes, Clock Gating, DMA Transfers without CPU Wake)"
        ]
    },
    "finops_engineer": {
        "capstones": [
            {
                "title": "Kubernetes Cluster Cost Allocation & Unit Economics Engine",
                "tech_stack": ["OpenCost", "Prometheus", "Grafana", "Slack Webhooks", "Python"],
                "description": "Deploy OpenCost across a production multi-tenant Kubernetes cluster, mapping CPU/RAM usage to business cost centers and publishing automated Slack budget alerts."
            },
            {
                "title": "Multi-Cloud Automated Idle Resource Reaper & Rightsizing Engine",
                "tech_stack": ["Python", "Boto3", "AWS Lambda", "Azure Automation", "CloudWatch Metrics"],
                "description": "Engineer a serverless FinOps automation framework identifying unattached EBS volumes, underutilized RDS instances, and generating automated GitHub PR rightsizing specs."
            }
        ],
        "interview_focus": [
            "FinOps Framework Phases (Inform, Optimize, Operate) & Cost Accountability Principles",
            "Cloud Pricing Models (On-Demand, Reserved Instances, Savings Plans, Spot Fleets)",
            "Kubernetes Resource Requests vs Limits & Their Impact on Cluster Node Autoscaling Costs",
            "Cloud Unit Economics (Cost per Customer, Cost per Query, Cost per API Call)",
            "Tagging Governance & Automated Policy Enforcement with AWS Organizations / OPA"
        ]
    },
    "generative_ai_app_developer": {
        "capstones": [
            {
                "title": "Enterprise Multimodal Agentic Research Assistant with LangGraph",
                "tech_stack": ["Python", "LangGraph", "Qdrant", "FastAPI", "Hybrid BM25/Vector Search"],
                "description": "Construct a multi-agent autonomous research system featuring cyclical reflection, tool calling, hybrid semantic retrieval, and citation verification."
            },
            {
                "title": "Autonomous Code Review & Security Remediation Agent",
                "tech_stack": ["TypeScript", "LangChain", "Claude API", "AST Parsing", "GitHub App Webhooks"],
                "description": "Build a GitHub App agent analyzing PR diffs via abstract syntax tree parsing, detecting OWASP vulnerabilities, and generating verifiable unit-tested pull request fixes."
            }
        ],
        "interview_focus": [
            "Retrieval Augmented Generation (RAG) Architecture (Chunking Strategies, Hybrid Search, Reranking)",
            "Agentic Workflows (ReAct Pattern, Plan-and-Solve, State Graphs with LangGraph)",
            "Token Context Window Management, KV-Caching & Streaming SSE Implementation",
            "Prompt Injection Defenses & Output Guardrails (NeMo Guardrails, JSON Schema Enforcement)",
            "Evaluation Metrics for Generative AI (Faithfulness, Answer Relevance, Context Recall)"
        ]
    },
    "geospatial_data_scientist": {
        "capstones": [
            {
                "title": "Satellite-Based Urban Deforestation & Wildfire Risk Mapping Engine",
                "tech_stack": ["Python", "Google Earth Engine", "Sentinel-2", "Rasterio", "XGBoost"],
                "description": "Process multi-spectral Sentinel-2 imagery computing NDVI and thermal indices to predict wildfire risk corridors with sub-10m spatial resolution."
            },
            {
                "title": "Urban Mobility & Transit Isochrone Optimization Network",
                "tech_stack": ["OSMNx", "GeoPandas", "PostGIS", "Kepler.gl", "Uber H3 Spatial Index"],
                "description": "Engineer an urban transit accessibility model utilizing Uber H3 hexagonal spatial indexing, computing real-time travel-time isochrones across multimodal transit."
            }
        ],
        "interview_focus": [
            "Coordinate Reference Systems (CRS), Geographic vs Projected (EPSG:4326 vs EPSG:3857)",
            "Vector vs Raster Data Operations (Zonal Statistics, Buffer, Intersect, Map Algebra)",
            "Spatial Indexing Algorithms (R-Tree, QuadTree, Geohash, Uber H3 Hexagonal Grid)",
            "PostGIS Spatial Queries (ST_Intersects, ST_DWithin, Spatial Joins & Index Tuning)",
            "Handling Massive Remote Sensing Datasets with Cloud-Optimized GeoTIFFs (COG) & STAC API"
        ]
    },
    "graphql_api_developer": {
        "capstones": [
            {
                "title": "Enterprise Federated GraphQL Supergraph with Apollo Federation v2",
                "tech_stack": ["Apollo Router", "Rust", "TypeScript", "Apollo Federation v2", "Rover CLI"],
                "description": "Architect a distributed GraphQL supergraph uniting inventory, user, and billing subgraphs with entity interfaces, subgraph composition checks, and schema contracts."
            },
            {
                "title": "Real-Time Collaborative GraphQL API with Subscriptions & DataLoader",
                "tech_stack": ["Node.js", "GraphQL Yoga", "Redis PubSub", "DataLoader", "Prisma"],
                "description": "Build a high-performance GraphQL API featuring real-time WebSocket subscriptions, query complexity analysis, and strict DataLoader batching to eliminate N+1 queries."
            }
        ],
        "interview_focus": [
            "GraphQL N+1 Query Problem & DataLoader Batching/Caching Mechanics",
            "Apollo Federation Architecture (Entities, Keys, External Fields, Query Plan Generation)",
            "Schema Design Best Practices (Relay Connection Specification, Input Object Unions)",
            "Security & DoS Protection (Query Depth Limiting, Complexity Cost Analysis, Introspection Control)",
            "GraphQL Over HTTP vs WebSockets vs Server-Sent Events (SSE) for Subscriptions"
        ]
    },
    "grc_analyst": {
        "capstones": [
            {
                "title": "Enterprise SOC 2 Type II & ISO 27001 Readiness Control Package",
                "tech_stack": ["SOC 2 Trust Services Criteria", "ISO 27001:2022", "Risk Register", "Jira", "Vanta/Drata"],
                "description": "Develop an exhaustive compliance control matrix, operational policies, and audit evidence collection repository for SOC 2 Type II and ISO 27001 certification."
            },
            {
                "title": "Third-Party Vendor Risk Management (TPRM) & Security Assessment Portal",
                "tech_stack": ["Python", "NIST SP 800-53", "SIG Core Questionnaire", "Streamlit", "Risk Scoring"],
                "description": "Build a programmatic vendor risk intake and assessment workflow evaluating vendor security posture, calculating residual risk scores, and generating board reports."
            }
        ],
        "interview_focus": [
            "Compliance Framework Mapping (SOC 2 vs ISO 27001 vs NIST CSF vs GDPR/HIPAA)",
            "Risk Assessment Methodologies (Inherent vs Residual Risk, Qualitative vs Quantitative FAIR)",
            "Audit Evidence Collection, Control Testing & Deficiency Remediation Workflows",
            "Third-Party Risk Management (TPRM) Lifecycle & Vendor Due Diligence",
            "Incident Notification Regulations & Data Subject Access Request (DSAR) Requirements"
        ]
    },
    "iam_engineer": {
        "capstones": [
            {
                "title": "Centralized OIDC/SAML2 Enterprise Single Sign-On & SCIM Gateway",
                "tech_stack": ["Keycloak", "OAuth2.0 / OIDC", "SAML 2.0", "SCIM 2.0", "FIDO2/WebAuthn"],
                "description": "Deploy an enterprise identity provider supporting SAML 2.0 and OIDC federation, passwordless WebAuthn MFA, and automated user provisioning via SCIM 2.0."
            },
            {
                "title": "Automated Just-In-Time (JIT) Cloud Privileged Access Management Engine",
                "tech_stack": ["Go", "AWS STS AssumeRole", "Slack API", "DynamoDB", "Terraform"],
                "description": "Engineer a self-service JIT access workflow in Slack allowing developers to request temporary elevated cloud permissions with manager approvals and immutable audit trails."
            }
        ],
        "interview_focus": [
            "OAuth2.0 vs OIDC vs SAML 2.0 Protocol Handshakes & Assertion Tokens",
            "Role-Based Access Control (RBAC) vs Attribute-Based Access Control (ABAC)",
            "Principle of Least Privilege & Cloud IAM Evaluation Logic (Explicit Deny, SCPs, Boundary Policies)",
            "Multi-Factor Authentication (MFA) Protocols, FIDO2/WebAuthn & Phishing-Resistant Credentials",
            "Automated User Lifecycle Management (SCIM Protocol, JIT Provisioning & Deprovisioning)"
        ]
    },
    "java_developer": {
        "capstones": [
            {
                "title": "High-Concurrency Banking Transaction Engine with Spring Boot 3 & Virtual Threads",
                "tech_stack": ["Java 21", "Spring Boot 3", "Project Loom Virtual Threads", "PostgreSQL", "Kafka"],
                "description": "Engineer an ACID-compliant double-entry ledger processing 15,000 transactions/sec utilizing Java 21 Virtual Threads, optimistic locking, and Kafka event streams."
            },
            {
                "title": "Event-Driven Distributed Order Fulfillment System with Resilience4j",
                "tech_stack": ["Spring Cloud", "Resilience4j", "PostgreSQL", "Docker", "Prometheus"],
                "description": "Construct a distributed microservices platform implementing Saga orchestration, distributed tracing, circuit breakers, and transactional outbox patterns."
            }
        ],
        "interview_focus": [
            "Java Virtual Machine (JVM) Memory Model (Heap, Metaspace, GC Algorithms ZGC & G1)",
            "Java 21 Features (Virtual Threads, Pattern Matching, Records, Sealed Classes)",
            "Spring Bean Lifecycle, Dependency Injection & @Transactional Propagation Levels",
            "Concurrency Primitives (synchronized, ReentrantLock, CompletableFuture, ConcurrentHashMap)",
            "Distributed Transactions (Saga Pattern, Two-Phase Commit, Transactional Outbox Pattern)"
        ]
    },
    "kubernetes_engineer": {
        "capstones": [
            {
                "title": "Production Multi-Tenant Kubernetes Platform with Cilium eBPF & GitOps",
                "tech_stack": ["Kubernetes 1.30", "Cilium CNI", "ArgoCD", "OPA Gatekeeper", "Prometheus"],
                "description": "Architect an enterprise multi-tenant Kubernetes platform enforcing strict eBPF network policies, OPA admission control, and zero-trust mutual TLS service meshing."
            },
            {
                "title": "Custom Kubernetes Operator for Automated Database Lifecycle & Backups",
                "tech_stack": ["Go", "Kubebuilder", "Controller Runtime", "Custom Resource Definitions (CRDs)", "Helm"],
                "description": "Develop a production Go operator managing custom database cluster resources, automated point-in-time snapshotting, and health-check reconciliation loops."
            }
        ],
        "interview_focus": [
            "Kubernetes Control Plane Architecture (API Server, etcd quorum, Kube-Scheduler, Kube-Controller-Manager)",
            "Kubelet Pod Lifecycle, Container Runtime Interface (CRI) & OOMKiller Mechanics",
            "Kubernetes Networking Model (CNI Plugins, ClusterIP, NodePort, Ingress Controllers, eBPF)",
            "Admission Controllers (Mutating vs Validating Webhooks) & Policy Enforcement (OPA/Kyverno)",
            "Custom Resource Definitions (CRDs) & Operator Reconcile Loop Idempotency"
        ]
    },
    "linux_system_admin": {
        "capstones": [
            {
                "title": "Automated Hardened Server Fleet Provisioning with Ansible & OpenSCAP",
                "tech_stack": ["Ansible", "CIS Benchmark Level 2", "OpenSCAP", "auditd", "Centralized Rsyslog/Loki"],
                "description": "Construct an automated infrastructure provisioning pipeline applying CIS Level 2 hardening benchmarks, auditd kernel logging, and automated compliance reporting."
            },
            {
                "title": "High-Availability Load Balancing & Failover Cluster with Keepalived & HAProxy",
                "tech_stack": ["HAProxy", "Keepalived VRRP", "BIND DNS", "SSL Termination", "Bash"],
                "description": "Deploy a redundant dual-node load balancer cluster utilizing VRRP virtual IP failover, active health checking, zero-downtime reconfiguration, and SSL offloading."
            }
        ],
        "interview_focus": [
            "Linux Boot Process (BIOS/UEFI -> GRUB -> Kernel -> Init / Systemd Targets)",
            "Process Management & Signals (fork, exec, signals SIGTERM vs SIGKILL, Zombie vs Orphan Processes)",
            "File System Architecture (Inodes, Superblocks, Hard Links vs Soft Links, VFS Layer)",
            "Troubleshooting Server Performance (top, vmstat, iostat, sar, strace, lsof, netstat/ss)",
            "Linux Networking Stack (iptables / nftables, routing tables, TCP socket states & tuning)"
        ]
    },
    "llmops_engineer": {
        "capstones": [
            {
                "title": "Production LLM Inference Gateway with Semantic Caching & Dynamic Fallback",
                "tech_stack": ["Python", "LiteLLM", "Redis Semantic Cache", "FastAPI", "Prometheus"],
                "description": "Architect an enterprise LLM proxy supporting multi-provider cascading, embedding-based semantic prompt caching, automated rate-limiting, and cost tracking."
            },
            {
                "title": "Continuous LLM Evaluation, RAG Triad & Guardrails CI Pipeline",
                "tech_stack": ["Ragas", "TruLens", "NeMo Guardrails", "GitHub Actions", "Docker"],
                "description": "Build an automated CI evaluation pipeline testing RAG pipeline hallucination rates, context relevance, answer accuracy, and toxic prompt defense benchmarks."
            }
        ],
        "interview_focus": [
            "LLM Serving Optimization (PagedAttention, Continuous Batching, vLLM vs TGI vs TensorRT-LLM)",
            "Quantization Methods (GPTQ, AWQ, GGUF, FP8/INT4 Precision Tradeoffs)",
            "Semantic Caching Mechanics & Vector Distance Threshold Calibration",
            "RAG Evaluation Metrics (Context Precision, Context Recall, Faithfulness, Answer Relevance)",
            "LLM Cost Optimization, Latency Budgets & Prompt Token Compression Techniques"
        ]
    },
    "macos_developer": {
        "capstones": [
            {
                "title": "Native System Hardware & Telemetry Monitor for Apple Silicon",
                "tech_stack": ["Swift", "SwiftUI", "IOKit", "Metal Canvas Rendering", "AppKit"],
                "description": "Build an ultra-efficient macOS menu bar utility monitoring CPU cluster load, GPU power wattage, thermal throttling, and unified memory bandwidth in real time."
            },
            {
                "title": "Local-First Developer Scratchpad & SQLite Clipboard History Manager",
                "tech_stack": ["Swift", "SwiftData", "AppKit", "Global Keyboard Shortcuts", "Accessibility API"],
                "description": "Engineer a native macOS productivity tool featuring encrypted clipboard history capture, global shortcut activation, Markdown preview, and zero battery drain."
            }
        ],
        "interview_focus": [
            "AppKit vs SwiftUI on macOS & NSViewRepresentable Bridging Patterns",
            "macOS Sandbox, Hardened Runtime, Entitlements & Notarization Workflow",
            "Apple Silicon Unified Memory Architecture & Optimization with Instruments",
            "Concurrency in Modern Swift (Actors, Async/Await, Sendable Protocol, Tasks)",
            "Inter-Process Communication on macOS (XPC Services, Mach Ports, Distributed Notifications)"
        ]
    },
    "malware_analyst": {
        "capstones": [
            {
                "title": "Automated Dynamic Malware Sandbox & Behavioral Analysis Pipeline",
                "tech_stack": ["CAPEv2 / Cuckoo", "Python", "Volatility 3", "Procmon", "Ghidra"],
                "description": "Deploy an isolated virtualized dynamic analysis sandbox capturing malware process creation, registry modifications, API hooking, and network C2 traffic."
            },
            {
                "title": "Reverse Engineering of Packed Trojan & Custom YARA Signature Pack",
                "tech_stack": ["x64dbg", "Ghidra", "YARA", "PEStudio", "FLOSS"],
                "description": "Unpack and reverse engineer a sophisticated Windows PE trojan, extracting encrypted configuration strings, analyzing assembly control flow, and writing YARA rules."
            }
        ],
        "interview_focus": [
            "PE File Format Structure (DOS Header, PE Header, Section Headers, IAT / EAT Table)",
            "Static Analysis vs Dynamic Analysis Techniques & Anti-Analysis / Anti-VM Evasion Checks",
            "Assembly Language Basics (x86/x64 Registers, Stack Frames, Calling Conventions, JMP/CALL)",
            "Memory Deobfuscation (Process Injection, Process Hollowing, Reflective DLL Loading)",
            "Authoring Resilient YARA Signatures (Wildcarding, Regular Expressions, Hex Byte Patterns)"
        ]
    },
    "mlops_engineer": {
        "capstones": [
            {
                "title": "Real-Time Feature Store & Low-Latency Model Inference Serving Platform",
                "tech_stack": ["Feast", "Redis", "Triton Inference Server", "ONNX Runtime", "Prometheus"],
                "description": "Deploy an enterprise feature store syncing offline parquet features to an in-memory Redis cluster for sub-10ms Triton model scoring with automated latency metrics."
            },
            {
                "title": "End-to-End Automated Continuous Training & Model Drift Pipeline",
                "tech_stack": ["Kubeflow Pipelines", "MLflow", "Great Expectations", "Evidently AI", "Docker"],
                "description": "Construct an automated MLOps pipeline detecting data drift with Evidently AI, validating datasets via Great Expectations, and triggering automated model retraining."
            }
        ],
        "interview_focus": [
            "Feature Store Architecture (Online Low-Latency Store vs Offline Historical Point-in-Time Join)",
            "Model Serving Infrastructures (Triton Inference Server vs TorchServe vs FastAPI)",
            "Model Serialization Formats (ONNX, TorchScript, TensorRT, PMML)",
            "Data & Concept Drift Detection Algorithms (Kolmogorov-Smirnov Test, Population Stability Index / PSI)",
            "A/B Testing, Shadow Deployments & Canary Releases for Machine Learning Models"
        ]
    },
    "network_engineer": {
        "capstones": [
            {
                "title": "Software-Defined Network Automation Engine with Netmiko & Nornir",
                "tech_stack": ["Python", "Nornir", "Netmiko", "Jinja2", "Git / GitHub Actions"],
                "description": "Build an automated network configuration engine generating vendor-agnostic router configurations from Jinja2 templates and validating routes with pyATS."
            },
            {
                "title": "Multi-Site Enterprise BGP/EVPN VXLAN Data Center Fabric",
                "tech_stack": ["GNS3 / EVE-NG", "Arista cEOS", "BGP EVPN", "VXLAN", "Wireshark"],
                "description": "Design and emulate a Spine-and-Leaf data center network utilizing an OSPF underlay, BGP EVPN control plane, and VXLAN overlay with asymmetric routing."
            }
        ],
        "interview_focus": [
            "TCP/IP Stack Deep Dive (TCP 3-Way Handshake, Window Scaling, Congestion Control, FIN/RST)",
            "BGP Routing Protocol (Path Attributes, Route Reflectors, AS-Path Prepending, MED vs Local Pref)",
            "VLANs, 802.1Q Trunking, Spanning Tree Protocols (STP / RSTP / MSTP) & Loop Prevention",
            "IP Subnetting, VLSM, Supernetting & CIDR Address Calculations",
            "Network Troubleshooting Methodology (ping, traceroute, mtr, Wireshark packet analysis)"
        ]
    },
    "nextjs_developer": {
        "capstones": [
            {
                "title": "High-Traffic Multi-Tenant Editorial Platform with Next.js App Router & ISR",
                "tech_stack": ["Next.js 15", "TypeScript", "Tailwind CSS", "PostgreSQL", "Incremental Static Regeneration"],
                "description": "Architect a multi-tenant publishing platform supporting sub-domain routing, on-demand ISR revalidation, Server Components, and Edge Middleware auth."
            },
            {
                "title": "Edge-Rendered SaaS Analytics Workspace with Server Actions & Streaming",
                "tech_stack": ["Next.js 15", "React Server Components", "Supabase", "Drizzle ORM", "Stripe"],
                "description": "Build an ultra-responsive SaaS product featuring optimistic Server Actions, React 19 Suspense streaming, role-based auth, and automated Stripe billing."
            }
        ],
        "interview_focus": [
            "Next.js App Router Architecture: Server Components vs Client Components Tree Serialization",
            "Rendering Strategies: SSR vs SSG vs ISR (Time-Based vs On-Demand) vs PPR (Partial Prerendering)",
            "Server Actions Security (CSRF Protection, Action Idempotency, Input Validation with Zod)",
            "Next.js Caching Layers (Request Memoization, Data Cache, Full Route Cache, Router Cache)",
            "Core Web Vitals Optimization in Next.js (next/image, next/font, Script priority, INP tuning)"
        ]
    },
    "nlp_engineer": {
        "capstones": [
            {
                "title": "Multilingual Legal Contract Extraction & Clause Classification Engine",
                "tech_stack": ["PyTorch", "HuggingFace Transformers", "RoBERTa", "FastAPI", "Docker"],
                "description": "Train and deploy a domain-adapted transformer extracting named entities, indemnification clauses, and payment liabilities from legal PDFs with 95%+ precision."
            },
            {
                "title": "Domain-Adapted Instruction Fine-Tuning with LoRA & QLoRA",
                "tech_stack": ["LLaMA 3", "PEFT", "Unsloth", "DeepSpeed", "HuggingFace TGI"],
                "description": "Perform parameter-efficient fine-tuning (QLoRA) on an open-weight LLM for enterprise support ticket triage, evaluating performance with synthetic test sets."
            }
        ],
        "interview_focus": [
            "Transformer Architecture (Multi-Head Self-Attention, Positional Embeddings, LayerNorm)",
            "Tokenization Algorithms (Byte-Pair Encoding / BPE, WordPiece, SentencePiece)",
            "Parameter-Efficient Fine-Tuning (LoRA, QLoRA, Prefix Tuning, Adapters)",
            "Semantic Search & Dense Retrieval (Sentence Transformers, Bi-Encoders vs Cross-Encoders)",
            "Evaluation Metrics in NLP (BLEU, ROUGE, Exact Match / F1, Perplexity, Embedding Cosine Similarity)"
        ]
    },
    "no_code_low_code_developer": {
        "capstones": [
            {
                "title": "Full-Featured Enterprise Two-Sided Marketplace on Bubble",
                "tech_stack": ["Bubble.io", "Stripe Connect", "SendGrid", "Custom JavaScript Plugins", "PostgreSQL"],
                "description": "Construct an end-to-end service marketplace with dual user onboarding, Stripe Connect escrow payments, calendar booking, and responsive mobile layouts."
            },
            {
                "title": "Automated Cross-Platform Operations Hub with Make, Airtable & Webhooks",
                "tech_stack": ["Make.com", "Airtable Scripting", "REST Webhooks", "Slack API", "Google Workspace"],
                "description": "Build an enterprise automation workflow orchestrating customer lead scoring, dynamic contract generation, Slack notifications, and error recovery routing."
            }
        ],
        "interview_focus": [
            "Relational Data Modeling in No-Code Platforms (1:1, 1:N, N:M Relationships & Privacy Rules)",
            "API Integrations (REST Endpoints, JSON Payloads, Webhook Verification, OAuth2 Tokens)",
            "Performance Optimization in Bubble (Workload Units / WU Consumption, Search Constraints, Lazy Loading)",
            "Error Handling & Failure Recovery in Workflow Automations (Make/Zapier)",
            "No-Code Security & Compliance (Data Privacy Rules, Role-Based Access Control, API Key Protection)"
        ]
    },
    "observability_engineer": {
        "capstones": [
            {
                "title": "Full-Stack Distributed Tracing & Telemetry Pipeline with OpenTelemetry",
                "tech_stack": ["OpenTelemetry Collector", "Grafana Tempo", "Prometheus", "Grafana 11", "Docker"],
                "description": "Deploy an OpenTelemetry Collector gateway gathering traces, metrics, and logs across distributed microservices with automated tail-based sampling."
            },
            {
                "title": "Centralized High-Throughput Log Aggregation & SLO Alerting Platform",
                "tech_stack": ["Fluent Bit", "Vector", "Grafana Loki", "PromQL", "PagerDuty API"],
                "description": "Engineer a resilient log aggregation cluster parsing structured JSON logs, computing service level indicators (SLIs), and triggering predictive budget alerts."
            }
        ],
        "interview_focus": [
            "The Three Pillars of Observability (Metrics, Logs, Traces) & OpenTelemetry Standard",
            "Trace Context Propagation (W3C TraceContext headers, Span IDs, Parent-Child Relationships)",
            "Sampling Strategies (Head-Based vs Tail-Based Sampling, Adaptive Sampling Budgets)",
            "Prometheus Time-Series Data Model (Gauges, Counters, Histograms, Summaries & Rate Calculation)",
            "SLI/SLO/SLA Calculations & Error Budget Depletion Rate Alerting (Google SRE Book Standards)"
        ]
    },
    "penetration_tester": {
        "capstones": [
            {
                "title": "Full-Scope Active Directory Domain Escalation & Pivot Assessment",
                "tech_stack": ["BloodHound", "Mimikatz", "CrackMapExec", "Impacket", "Responder"],
                "description": "Execute a full-scope internal network simulation compromising domain controllers through LLMNR poisoning, Kerberoasting, and ACL abuse in an isolated lab."
            },
            {
                "title": "Modern Web Application & API Penetration Testing Portfolio",
                "tech_stack": ["Burp Suite Pro", "OWASP Top 10", "JWT Tool", "Postman", "CVSS 3.1"],
                "description": "Perform comprehensive black-box and grey-box security assessments on a modern SPA and GraphQL API, identifying authorization bypasses and publishing CVSS reports."
            }
        ],
        "interview_focus": [
            "OWASP Top 10 Vulnerabilities & Exploitation Mechanics (SSRF, SQLi, Insecure Deserialization)",
            "Active Directory Attack Vectors (Kerberoasting, AS-REP Roasting, Pass-the-Hash, Golden Ticket)",
            "Bypassing Web Application Protections (WAF Evasion, CSRF Token Bypass, CORS Misconfigurations)",
            "Privilege Escalation Techniques (Linux SUID/Capabilities, Windows Token Impersonation/Unquoted Service Paths)",
            "Professional Pentest Reporting (CVSS 3.1 Scoring, Executive Summaries, Remediations)"
        ]
    },
    "php_laravel_developer": {
        "capstones": [
            {
                "title": "High-Volume Multi-Tenant SaaS Billing Platform with Laravel & Cashier",
                "tech_stack": ["Laravel 11", "PostgreSQL", "Redis Horizon", "Stripe Billing", "Inertia.js"],
                "description": "Build an enterprise multi-tenant subscription platform with scoped database tenancy, Stripe Cashier webhook reconciliation, and background queue workers."
            },
            {
                "title": "Real-Time Event-Driven Marketplace with Laravel Reverb & WebSockets",
                "tech_stack": ["Laravel 11", "Laravel Reverb", "Livewire 3", "Tailwind CSS", "Docker"],
                "description": "Construct a live auction marketplace with real-time bidding updates via Laravel Reverb WebSockets, optimistic UI updates with Livewire 3, and transaction locking."
            }
        ],
        "interview_focus": [
            "Laravel Lifecycle (Service Container, Service Providers, Middleware Pipeline, Facades Internals)",
            "Eloquent ORM Optimization (Eager Loading with with(), Chunking, Lazy Collections, Indexes)",
            "Queue Architecture with Redis Horizon (Job Retry Strategies, Idempotency, Dead Letter Queues)",
            "Database Transactions, Pessimistic vs Optimistic Locking in Laravel",
            "PHP 8.3 Features (Readonly Classes, Typed Class Constants, Enums, Match Expressions, JIT)"
        ]
    },
    "platform_engineer": {
        "capstones": [
            {
                "title": "Internal Developer Platform (IDP) with Spotify Backstage & Crossplane",
                "tech_stack": ["Backstage", "Crossplane", "Kubernetes", "GitHub Actions", "ArgoCD"],
                "description": "Construct a self-service developer portal allowing engineering teams to spin up standardized microservices and cloud databases with automated Golden Paths."
            },
            {
                "title": "Self-Service Cloud Infrastructure Catalog with Terraform & Ephemeral Envs",
                "tech_stack": ["Terraform Cloud", "AWS EKS", "vcluster", "GitHub App Webhooks", "Docker"],
                "description": "Build an automated ephemeral preview environment generator deploying lightweight virtual Kubernetes clusters (vcluster) for every open pull request."
            }
        ],
        "interview_focus": [
            "Internal Developer Platform (IDP) Core Objectives & Golden Path Design Principles",
            "Control Planes & Infrastructure Composition (Crossplane vs Terraform Operator)",
            "Multi-Tenancy in Kubernetes (Namespace Isolation, ResourceQuotas, NetworkPolicies, vcluster)",
            "Developer Experience (DevEx) Metrics (DORA Metrics, Time to First Commit, Deployment Frequency)",
            "GitOps at Scale (App-of-Apps Pattern, Helm OCI Registries, Automated Policy Checks)"
        ]
    },
    "product_designer": {
        "capstones": [
            {
                "title": "End-to-End Fintech Mobile Banking Design System & Usability Audit",
                "tech_stack": ["Figma", "Design Tokens", "Auto Layout 5", "User Testing", "WCAG 2.2 AA"],
                "description": "Design an accessible, high-conversion mobile banking application with complete interactive prototypes, design token variables, and documented usability findings."
            },
            {
                "title": "Complex B2B Enterprise Data Visualization Studio Redesign",
                "tech_stack": ["Figma", "Information Architecture", "Heuristic Evaluation", "Design Tokens", "Prototyping"],
                "description": "Execute an end-to-end redesign of a complex data analysis dashboard, reducing user cognitive load and streamlining workflow execution times by 40%."
            }
        ],
        "interview_focus": [
            "Design Thinking Process & Double Diamond Methodology",
            "Information Architecture (Card Sorting, Tree Testing, Mental Models vs Conceptual Models)",
            "Design System Scalability (Variables, Modes, Component Variants, Slot Patterns in Figma)",
            "Accessibility Standards (WCAG 2.2 Level AA/AAA, Contrast Ratios, Focus Order, Touch Targets)",
            "Cross-Functional Collaboration (Dev Hand-Off, Design QA, Measuring Design System Adoption)"
        ]
    },
    "product_manager": {
        "capstones": [
            {
                "title": "End-to-End AI Copilot Feature PRD, Business Case & User Journeys",
                "tech_stack": ["PRD", "User Story Mapping", "North Star Metric", "RICE Prioritization", "Wireframing"],
                "description": "Author an exhaustive Product Requirements Document (PRD) for an enterprise AI copilot, incorporating user flows, technical edge cases, and launch criteria."
            },
            {
                "title": "Comprehensive B2B SaaS Product Strategy & Go-To-Market Spec",
                "tech_stack": ["TAM/SAM/SOM", "Competitive Matrix", "Unit Economics", "GTM Playbook", "A/B Testing"],
                "description": "Develop a multi-year product roadmap, competitive differentiation matrix, pricing model, and Go-To-Market strategy for a developer tooling platform."
            }
        ],
        "interview_focus": [
            "Product Sense & Discovery (Problem Definition, User Personas, Jobs-To-Be-Done / JTBD)",
            "Feature Prioritization Frameworks (RICE, Kano Model, MoSCoW, Value vs Effort Matrix)",
            "Defining Product Metrics (North Star Metric, Input vs Output Metrics, Guardrail Metrics)",
            "A/B Testing & Experimentation Strategy (Hypothesis Formulation, MDE, Guardrail Indicators)",
            "Product Execution & Tradeoff Scenarios (Scope Creep, Engineering Delays, Technical Debt)"
        ]
    },
    "prompt_engineer": {
        "capstones": [
            {
                "title": "Automated Prompt Optimization & Programmatic Evaluation Engine with DSPy",
                "tech_stack": ["Python", "DSPy", "OpenAI API", "Anthropic Claude API", "MLflow"],
                "description": "Engineer a self-optimizing prompt compilation pipeline using DSPy teleprompters to maximize accuracy and minimize token overhead for complex reasoning."
            },
            {
                "title": "Production Multi-Model Red-Teaming & Jailbreak Defense Benchmark",
                "tech_stack": ["Promptfoo", "Python", "Llama Guard", "Garak", "Automated Security Reports"],
                "description": "Construct an automated CI/CD red-teaming harness assessing LLM endpoints against adversarial jailbreak attempts, indirect prompt injections, and data extraction."
            }
        ],
        "interview_focus": [
            "Prompt Engineering Frameworks (Chain-of-Thought / CoT, Few-Shot In-Context Learning, ReAct)",
            "Structured Output Generation (JSON Schema Constraints, Pydantic, Guidance, Outlines)",
            "Systematic Prompt Evaluation Methodologies (Ground Truth Benchmarks, LLM-as-a-Judge)",
            "Vulnerability Mitigation (Indirect Prompt Injections, Jailbreaking, System Prompt Extraction)",
            "Programmatic Prompt Optimization (DSPy Compilation, Bootstrapped Few-Shot, MIPRO)"
        ]
    },
    "python_developer": {
        "capstones": [
            {
                "title": "High-Concurrency Asynchronous Web Scraping & Ingestion Engine",
                "tech_stack": ["Python 3.12", "Asyncio", "Playwright", "Redis", "PostgreSQL", "Docker"],
                "description": "Engineer an asynchronous scraping engine capable of harvesting and parsing 5,000 dynamic web pages per minute with distributed rate limiting and proxies."
            },
            {
                "title": "Production REST API Microservice with FastAPI & Event-Driven Celery",
                "tech_stack": ["FastAPI", "Pydantic v2", "Celery", "SQLAlchemy 2.0", "Redis", "Pytest"],
                "description": "Construct an asynchronous enterprise API backend featuring clean architecture, background Celery task queues, Redis caching, and full integration test coverage."
            }
        ],
        "interview_focus": [
            "Python Memory Management, Reference Counting & Generational Garbage Collection",
            "The Global Interpreter Lock (GIL), Free-Threading (PEP 703) & Multiprocessing vs Asyncio",
            "Decorators, Context Managers (__enter__ / __exit__) & Metaclasses in Python",
            "Advanced Asyncio (Event Loop Mechanics, Tasks, Futures, Gathering vs As Completed)",
            "Python Performance Profiling (cProfile, memory_profiler, Cython & Vectorization with NumPy)"
        ]
    },
    "qa_automation": {
        "capstones": [
            {
                "title": "Enterprise Cross-Browser End-to-End Test Automation Suite",
                "tech_stack": ["Playwright", "TypeScript", "Page Object Model", "GitHub Actions", "Allure Reports"],
                "description": "Architect a scalable E2E automation framework utilizing Playwright, parallel worker execution, API mocking, and automated Slack test failure reports in CI."
            },
            {
                "title": "High-Load Performance & API Contract Testing Harness",
                "tech_stack": ["K6", "TypeScript", "Pact", "Docker", "Grafana / InfluxDB"],
                "description": "Construct a comprehensive performance and API contract testing suite simulating 10,000 concurrent virtual users, verifying p95 latency SLOs and contract schemas."
            }
        ],
        "interview_focus": [
            "Test Automation Framework Architecture (Page Object Model, Screenplay Pattern, Fixtures)",
            "API Testing & Consumer-Driven Contract Testing (Pact Framework, Schema Validation)",
            "Performance Testing Metrics (Throughput, Latency Percentiles p50/p95/p99, Error Rate)",
            "Handling Flaky Tests (Auto-Wait, Dynamic Selectors, Retry Mechanics, Root Cause Analysis)",
            "CI/CD Integration (Parallel Test Sharding, Headless Browsers, Artifacts & Test Reporting)"
        ]
    },
    "react_native_developer": {
        "capstones": [
            {
                "title": "High-Performance Cross-Platform Social Audio & Streaming App",
                "tech_stack": ["React Native", "Expo SDK 51", "Reanimated 3", "Zustand", "WebRTC"],
                "description": "Build a 60fps audio streaming client with fluid gesture-driven UI animations, background audio playback, and peer-to-peer audio rooms via WebRTC."
            },
            {
                "title": "Real-Time Offline-First Bluetooth Low Energy (BLE) Health Tracker",
                "tech_stack": ["React Native", "react-native-ble-plx", "WatermelonDB", "HealthKit", "TypeScript"],
                "description": "Develop an offline-first fitness application connecting to BLE heart-rate monitors, syncing telemetry with SQLite, and integrating Apple HealthKit & Health Connect."
            }
        ],
        "interview_focus": [
            "React Native Architecture (New Architecture: TurboModules, Fabric Renderer, JSI, Yoga)",
            "Performance Optimization (Reanimated 3 Worklets, FlashList vs FlatList, Bridge Bottlenecks)",
            "Offline Data Synchronization & SQLite Local Storage (WatermelonDB / MMKV)",
            "Native Module Integration (Creating Custom Swift/Kotlin Bridges with JSI)",
            "Memory Leaks & Profiling in React Native (Flipper, Xcode Instruments, Android Profiler)"
        ]
    },
    "recommendation_systems_engineer": {
        "capstones": [
            {
                "title": "Two-Stage Real-Time E-Commerce Recommendation Engine",
                "tech_stack": ["PyTorch", "Two-Tower DNN", "ScaNN / Milvus", "Redis", "Triton Server"],
                "description": "Architect a candidate generation and deep ranking pipeline using two-tower vector embeddings and approximate nearest neighbors (ANN) for sub-30ms serving."
            },
            {
                "title": "Contextual Multi-Armed Bandit & Collaborative Filtering Pipeline",
                "tech_stack": ["Implicit", "LightFM", "Polars", "FastAPI", "Docker"],
                "description": "Build an exploration-exploitation recommendation service using Upper Confidence Bound (UCB) bandits and matrix factorization to overcome cold-start dilemmas."
            }
        ],
        "interview_focus": [
            "Two-Stage Recommender Architecture (Candidate Retrieval vs Heavy Ranking vs Re-Ranking)",
            "Approximate Nearest Neighbor (ANN) Algorithms (HNSW, IVF-PQ, ScaNN Indexing)",
            "Cold Start Problem Strategies (Bandits, Hybrid Filtering, Metadata Enrichments)",
            "Loss Functions in Recommendation (BPR Loss, Triplet Loss, Cross-Entropy with Negative Sampling)",
            "Offline vs Online Evaluation (NDCG, MAP@K, Hit Rate vs Click-Through Rate, A/B Testing)"
        ]
    },
    "red_team_operator": {
        "capstones": [
            {
                "title": "Enterprise Active Directory Compromise & Lateral Movement Simulation",
                "tech_stack": ["Sliver C2", "Cobalt Strike", "BloodHound", "Impacket", "Kerberoasting"],
                "description": "Execute a full attack adversary simulation in an enterprise AD lab, exploiting misconfigured certificate services (AD CS), bypassing AMSI, and pivoting."
            },
            {
                "title": "Custom C2 Beacon & Process Injection Dropper in C++/Rust",
                "tech_stack": ["Rust", "C++", "Indirect Syscalls", "API Hashing", "Process Hollowing"],
                "description": "Author an evasive command-and-control implant utilizing indirect system calls, unhooking ntdll.dll, custom sleep obfuscation, and encrypted HTTPS beacons."
            }
        ],
        "interview_focus": [
            "EDR Evasion Techniques (Direct/Indirect Syscalls, API Unhooking, Sleep Obfuscation)",
            "Process Injection Primitives (Process Hollowing, Early Bird APC, Thread Pool Injection)",
            "Active Directory Attack Vectors (AD CS ESC1-ESC8, Constrained/Unconstrained Delegation)",
            "Command and Control (C2) Architecture (Malleable C2 Profiles, Domain Fronting, Egress Filtering)",
            "Living-off-the-Land Binaries (LOLBins) & Defensive Evasion during Execution"
        ]
    },
    "reinforcement_learning_engineer": {
        "capstones": [
            {
                "title": "Autonomous Robotics Navigation Agent with Proximal Policy Optimization (PPO)",
                "tech_stack": ["Gymnasium", "Stable-Baselines3", "PyTorch", "PyBullet", "TensorBoard"],
                "description": "Train a continuous control robotic agent navigating dynamic obstacle courses using Proximal Policy Optimization (PPO) and vectorized simulation environments."
            },
            {
                "title": "Deep Q-Network (DQN) High-Frequency Algorithmic Trading Agent",
                "tech_stack": ["PyTorch", "Custom Financial Gym", "Prioritized Experience Replay", "Dueling DQN"],
                "description": "Engineer a reinforcement learning agent for order book execution, utilizing dueling deep Q-networks, prioritized replay buffers, and risk-adjusted reward functions."
            }
        ],
        "interview_focus": [
            "Markov Decision Processes (MDP), Bellman Equations & Value vs Policy Iteration",
            "Policy Gradient Methods (REINFORCE, Actor-Critic, PPO Clipping Objective, TRPO)",
            "Q-Learning & Deep Q-Networks (DQN, Double DQN, Dueling DQN, Experience Replay Buffers)",
            "Exploration vs Exploitation Strategies (Epsilon-Greedy, Entropy Regularization, Curiosity-Driven)",
            "Reward Shaping Challenges (Sparse Rewards, Reward Hacking, Credit Assignment Problem)"
        ]
    },
    "release_engineer": {
        "capstones": [
            {
                "title": "Automated Multi-Environment Progressive Delivery Controller with Argo Rollouts",
                "tech_stack": ["Kubernetes", "Argo Rollouts", "Prometheus", "Helm", "GitHub Actions"],
                "description": "Architect an enterprise progressive delivery pipeline executing automated canary releases, verifying latency/error metrics, and triggering automatic rollbacks on anomalies."
            },
            {
                "title": "Hermetic Monorepo Build & Dependency Caching Engine with Bazel",
                "tech_stack": ["Bazel", "Docker", "Remote Build Execution (RBE)", "GitHub Actions", "Semantic Release"],
                "description": "Design a hermetic, reproducible build system for a multi-language polyglot monorepo, achieving 90% build cache hit rates and automated semantic versioning."
            }
        ],
        "interview_focus": [
            "Hermetic & Reproducible Builds (Bazel/Buck concepts, Content-Addressable Storage)",
            "Branching Strategies (Trunk-Based Development vs GitFlow) & Release Branch Management",
            "Semantic Versioning (SemVer 2.0.0) & Automated Changelog / Release Generation",
            "Progressive Delivery Patterns (Canary Deployments, Blue/Green, Feature Flags)",
            "Binary Artifact Management (OCI Registries, Maven, NPM, CycloneDX SBOM Generation)"
        ]
    },
    "robotics_engineer": {
        "capstones": [
            {
                "title": "Autonomous Mobile Robot (AMR) SLAM & Nav2 Stack in ROS 2",
                "tech_stack": ["ROS 2 Humble", "Nav2", "SLAM Toolbox", "Gazebo", "C++"],
                "description": "Build an autonomous warehouse robot simulation in Gazebo featuring real-time 2D LiDAR SLAM, dynamic costmaps, obstacle avoidance, and path planning via Nav2."
            },
            {
                "title": "6-DOF Robotic Arm Inverse Kinematics & Trajectory Controller",
                "tech_stack": ["ROS 2", "MoveIt 2", "Python / C++", "OpenCV", "Gazebo"],
                "description": "Develop an automated pick-and-place manipulation pipeline using MoveIt 2, computing forward and inverse kinematics, trajectory optimization, and computer vision."
            }
        ],
        "interview_focus": [
            "ROS 2 Computational Graph (Nodes, Topics, Services, Actions, Quality of Service / QoS Profiles)",
            "Kinematics & Dynamics (Denavit-Hartenberg Parameters, Forward vs Inverse Kinematics, Jacobians)",
            "Simultaneous Localization and Mapping (SLAM) & Extended Kalman Filter (EKF) Sensor Fusion",
            "Path Planning Algorithms (A*, Dijkstra, Rapidly-exploring Random Trees / RRT*, D* Lite)",
            "Coordinate Transformations in Robotics (Quaternions, Rotation Matrices, TF2 in ROS 2)"
        ]
    },
    "rpa_developer": {
        "capstones": [
            {
                "title": "Enterprise Invoice Processing Bot with UiPath REFramework & AI OCR",
                "tech_stack": ["UiPath Studio", "Robotic Enterprise Framework", "Document Understanding", "Excel", "Orchestrator"],
                "description": "Build an enterprise invoice automation bot using REFramework with state machine architecture, intelligent document OCR parsing, and queue transaction handling."
            },
            {
                "title": "Cross-System Employee Onboarding & ERP Automation Bot with Python & Playwright",
                "tech_stack": ["Python", "Robocorp / OpenRPA", "Playwright", "REST APIs", "Secure Vault"],
                "description": "Engineer a headless RPA bot orchestrating multi-system employee provisioning across legacy desktop software, web portals, and directory services with error recovery."
            }
        ],
        "interview_focus": [
            "UiPath Robotic Enterprise Framework (REFramework) State Machine Lifecycle",
            "Queue Transactions, Business Rule Exceptions vs System Exceptions & Auto-Retries",
            "Robust UI Selectors (Fuzzy Selectors, Anchor Base, Computer Vision Selectors in Citrix)",
            "Security Best Practices in RPA (Credential Assets, Encryption at Rest, Role-Based Access)",
            "Orchestrator Management (Trigger Schedules, SLA Monitoring, Unattended vs Attended Bots)"
        ]
    },
    "ruby_on_rails_developer": {
        "capstones": [
            {
                "title": "Real-Time Collaborative Workspace with Rails 7, Hotwire & Turbo",
                "tech_stack": ["Ruby on Rails 7.2", "Turbo Streams", "Stimulus", "PostgreSQL", "Tailwind CSS"],
                "description": "Build a linear-style task workspace featuring instant multi-user reactive updates via Turbo Streams, Stimulus controllers, and optimistic UI transitions without SPA bloat."
            },
            {
                "title": "Multi-Tenant Marketplace Platform with Stripe Connect & Solid Queue",
                "tech_stack": ["Rails 7", "Solid Queue", "Solid Cache", "Stripe Connect", "RSpec"],
                "description": "Architect a multi-vendor marketplace platform featuring sub-account payment payouts, background job orchestration with Solid Queue, and comprehensive RSpec testing."
            }
        ],
        "interview_focus": [
            "Ruby Object Model (Metaprogramming, Method Lookup Path, Singleton Classes, Blocks/Procs/Lambdas)",
            "ActiveRecord Query Optimization (Includes vs Joins vs Preload, N+1 Query Resolution)",
            "Hotwire Architecture (Turbo Drive, Turbo Frames, Turbo Streams, Stimulus Controller Lifecycle)",
            "Rails Background Processing (Solid Queue, Sidekiq, Redis Idempotency, Retry Strategies)",
            "Rails Security Defenses (Strong Parameters, CSRF Tokens, SQL Injection Prevention in Scopes)"
        ]
    },
    "rust_developer": {
        "capstones": [
            {
                "title": "High-Throughput Multithreaded In-Memory Key-Value Store",
                "tech_stack": ["Rust", "Tokio", "Crossbeam", "RESP Protocol", "Criterion"],
                "description": "Build a multithreaded Redis-compatible in-memory store supporting concurrent transactions, lock-free ring buffers, and microsecond latency validated with Criterion."
            },
            {
                "title": "Asynchronous HTTP/HTTPS Reverse Proxy with Zero-Copy Buffer Management",
                "tech_stack": ["Rust", "Hyper", "Tokio", "Rustls", "epoll/kqueue"],
                "description": "Write an ultra-fast async HTTP/HTTPS reverse proxy with zero-copy buffer pools, TLS termination via Rustls, dynamic route health-checking, and rate limiting."
            }
        ],
        "interview_focus": [
            "Rust Ownership, Borrow Checker, Lifetimes ('a, 'static) & Interior Mutability (RefCell, Mutex)",
            "Concurrency Primitives (Send and Sync Traits, Arc, Mutex, RwLock, Channels vs Atomics)",
            "Error Handling Idioms (Result, Option, Custom Error Types, thiserror, anyhow)",
            "Asynchronous Rust & Tokio Runtime (Future Polling, Wakers, Pinning, Async Tasks vs OS Threads)",
            "Unsafe Rust Invariants, Raw Pointers & Preventing Undefined Behavior"
        ]
    },
    "salesforce_developer": {
        "capstones": [
            {
                "title": "Lightning Web Components (LWC) Enterprise Order Console with Apex",
                "tech_stack": ["LWC", "Apex", "SOQL / SOSL", "Platform Events", "Jest"],
                "description": "Develop an asynchronous Lightning Web Component console handling bulkified order processing, Platform Event notifications, and Jest unit tests."
            },
            {
                "title": "Custom Healthcare Intake Portal with Salesforce Experience Cloud & REST API",
                "tech_stack": ["Experience Cloud", "Apex REST Callouts", "Shield Encryption", "Flows", "OAuth2"],
                "description": "Architect a HIPAA-compliant patient intake portal on Experience Cloud featuring external REST integrations, field-level Shield encryption, and automated approvals."
            }
        ],
        "interview_focus": [
            "Salesforce Governor Limits & Bulkification Patterns in Apex Triggers",
            "Lightning Web Components (LWC) Reactive Properties (@api, @track, @wire) & Event Communication",
            "Asynchronous Apex (Future Methods, Queueable Apex, Batch Apex, Schedulable Apex)",
            "SOQL vs SOSL Query Optimization (Selective Queries, Custom Indexing, Skinny Tables)",
            "Salesforce Security Architecture (OWD, Role Hierarchy, Sharing Rules, Permission Sets, FLS)"
        ]
    },
    "scala_developer": {
        "capstones": [
            {
                "title": "High-Volume Real-Time Financial Telemetry Pipeline with Pekko Streams",
                "tech_stack": ["Scala 3", "Apache Pekko", "Kafka", "ZIO / Cats Effect", "PostgreSQL"],
                "description": "Build a backpressured streaming pipeline processing financial audit events with exactly-once delivery guarantees, functional error handling, and Pekko actor clusters."
            },
            {
                "title": "Distributed Purely Functional Microservice with Cats Effect & http4s",
                "tech_stack": ["Scala 3", "Cats Effect 3", "http4s", "Doobie", "Circe"],
                "description": "Construct a purely functional microservice utilizing Cats Effect 3 fibers, type-safe database queries with Doobie, JSON decoding via Circe, and Prometheus metrics."
            }
        ],
        "interview_focus": [
            "Functional Programming Concepts in Scala (Monads, Functors, Applicatives, Monad Transformers)",
            "Scala 3 Features (Givens & Usings, Extension Methods, Enums, Opaque Type Aliases)",
            "Actor Model & Reactive Streams (Apache Pekko / Akka, Backpressure, Supervision Strategies)",
            "Concurrency with Cats Effect & ZIO (Fibers, Resource Management, Ref / Deferred Concurrency)",
            "Type Classes, Implicits Resolution & Higher-Kinded Types in Scala"
        ]
    },
    "scrum_master_agile_coach": {
        "capstones": [
            {
                "title": "Agile Team Turnaround Playbook & Sprint Health Metric Dashboard",
                "tech_stack": ["Jira", "Confluence", "Scrum Framework", "Velocity & Burndown Analytics", "Miro"],
                "description": "Document an organizational agile coaching turnaround resolving sprint anti-patterns, establishing team working agreements, and tracking flow metrics."
            },
            {
                "title": "Enterprise Multi-Team Agile Scaling Framework Implementation (SAFe / LeSS)",
                "tech_stack": ["SAFe / LeSS", "PI Planning Facilitation", "Dependency Matrix", "OKRs", "Value Stream Mapping"],
                "description": "Design an organizational agile maturity blueprint facilitating multi-team PI Planning, cross-team dependency mapping, and outcome-oriented OKR alignment."
            }
        ],
        "interview_focus": [
            "Scrum Theory, Values, Events & Artifacts (Sprint Planning, Daily Scrum, Review, Retrospective)",
            "Facilitating Productive Retrospectives & Overcoming Agile Anti-Patterns (Zombie Scrum)",
            "Agile Flow Metrics (Cycle Time, Lead Time, Throughput, Cumulative Flow Diagrams / CFD)",
            "Cross-Team Scaling Frameworks (SAFe vs LeSS vs Spotify Model Tradeoffs)",
            "Conflict Resolution, Psychological Safety & Coaching High-Performance Engineering Teams"
        ]
    },
    "seo_specialist": {
        "capstones": [
            {
                "title": "Full Technical SEO Audit, Core Web Vitals & Schema Markup Package",
                "tech_stack": ["Screaming Frog", "Google Search Console", "JSON-LD Schema", "Lighthouse", "SQL"],
                "description": "Perform an exhaustive technical SEO audit of a high-traffic web application, debugging crawl budgets, canonicalization chains, and implementing rich snippet Schema.org."
            },
            {
                "title": "Zero-Traffic-Loss Site Migration Strategy & International SEO Architecture",
                "tech_stack": ["Redirect Mapping (301)", "hreflang Architecture", "Google Search Console", "Ahrefs", "Python"],
                "description": "Plan and execute a domain migration redirect mapping strategy, auditing international hreflang tags, preventing indexation loss, and monitoring organic visibility."
            }
        ],
        "interview_focus": [
            "Search Engine Crawling, Rendering & Indexing (Client-Side Rendering vs SSR vs Prerendering)",
            "Core Web Vitals Impact on Search Rankings (Interaction to Next Paint / INP, LCP, CLS)",
            "Canonicalization, Faceted Navigation & Crawl Budget Optimization for Enterprise Sites",
            "International SEO Implementation (hreflang Tags, Country-Specific Domains vs Subdirectories)",
            "Algorithm Updates, Recovery Strategies & High-Quality Content Guidelines (Google E-E-A-T)"
        ]
    },
    "serverless_developer": {
        "capstones": [
            {
                "title": "Event-Driven Serverless E-Commerce Processing Engine with AWS CDK",
                "tech_stack": ["AWS CDK", "TypeScript", "AWS Lambda", "DynamoDB Single-Table Design", "EventBridge"],
                "description": "Architect an event-driven serverless checkout platform orchestrating asynchronous payments with EventBridge, DynamoDB single-table design, and automated CDK deployment."
            },
            {
                "title": "Serverless Video Transcoding & Real-Time Notification Workflow with Step Functions",
                "tech_stack": ["AWS Step Functions", "AWS Lambda", "S3", "AWS Elemental MediaConvert", "API Gateway WebSockets"],
                "description": "Construct an automated serverless video ingestion pipeline coordinating distributed media encoding tasks, thumbnail generation, and real-time WebSocket client alerts."
            }
        ],
        "interview_focus": [
            "Serverless Cold Starts & Optimization Techniques (Provisioned Concurrency, Bundle Minimization)",
            "DynamoDB Single-Table Design (Partition Keys, Sort Keys, Global Secondary Indexes / GSIs)",
            "Asynchronous Event Orchestration (EventBridge vs SQS vs SNS vs Step Functions)",
            "API Gateway Types (HTTP APIs vs REST APIs vs WebSocket APIs) & Authorization Strategies",
            "Serverless Observability, Distributed Tracing (AWS X-Ray) & Cost Governance"
        ]
    },
    "service_designer": {
        "capstones": [
            {
                "title": "Omnichannel Healthcare Patient Experience Service Blueprint",
                "tech_stack": ["Service Blueprinting", "Frontstage / Backstage Mapping", "Persona Journeys", "Miro", "Figma"],
                "description": "Design an exhaustive end-to-end service blueprint mapping patient touchpoints, clinical backstage systems, digital records handoffs, and critical moments of truth."
            },
            {
                "title": "Airport Passenger Digital Journey & Service Ecosystem Transformation",
                "tech_stack": ["Touchpoint Matrix", "Stakeholder Ecosystem Mapping", "Service Failure Recovery SOPs", "Qualitative Research"],
                "description": "Map the complete physical-to-digital passenger travel lifecycle, designing fail-safe service recovery interventions, line-of-visibility touchpoints, and staff training SOPs."
            }
        ],
        "interview_focus": [
            "Service Blueprint Components (Line of Interaction, Line of Visibility, Frontstage vs Backstage)",
            "Translating Customer Journey Insights into Actionable Backend Operational Changes",
            "Facilitating Multi-Stakeholder Co-Creation Workshops Across Business Silos",
            "Service Prototyping Techniques (Role Playing, Wizard of Oz, Tabletop Walkthroughs)",
            "Measuring Service Design Impact (Customer Effort Score / CES, CSAT, Operational Efficiency)"
        ]
    },
    "shopify_developer": {
        "capstones": [
            {
                "title": "Custom High-Performance Shopify 2.0 Theme with Liquid & Web Components",
                "tech_stack": ["Shopify 2.0", "Liquid", "Theme App Extensions", "JavaScript Web Components", "Tailwind CSS"],
                "description": "Develop a bespoke Shopify 2.0 theme featuring dynamic bundle builders, native cart drawer mutations via Section Rendering API, and a 95+ Lighthouse mobile score."
            },
            {
                "title": "Headless Shopify Storefront with Hydrogen, Remix & Storefront API",
                "tech_stack": ["Shopify Hydrogen", "Remix", "GraphQL Storefront API", "Tailwind CSS", "Oxygen Hosting"],
                "description": "Architect a lightning-fast headless e-commerce store with server-side rendering, sub-second route transitions, optimistic cart management, and Oxygen edge deployment."
            }
        ],
        "interview_focus": [
            "Shopify 2.0 Architecture (JSON Templates, App Blocks, Theme App Extensions, Liquid Drops)",
            "Shopify Storefront API vs Admin API (Rate Limits, GraphQL Schema, Customer Access Tokens)",
            "Section Rendering API for Dynamic Ajax Cart Updates Without Full Page Reloads",
            "Headless Shopify Considerations (Hydrogen, Remix, Webhook Syncing, Checkout Redirections)",
            "Theme Performance Optimization (Liquid Render Profiling, Image srcset, Lazy Loading)"
        ]
    },
    "site_reliability_engineer": {
        "capstones": [
            {
                "title": "Automated Chaos Engineering & SLO Error Budget Suite",
                "tech_stack": ["Chaos Mesh", "Kubernetes", "Prometheus", "Grafana", "Sloth SLO Generator"],
                "description": "Construct an automated chaos testing framework injecting network partitions and container restarts to validate SLO error budgets and self-healing cluster policies."
            },
            {
                "title": "High-Availability Multi-Region Disaster Recovery Automation",
                "tech_stack": ["Terraform", "AWS Route 53 DNS Failover", "PostgreSQL Replication", "Terratest", "Bash"],
                "description": "Architect an automated multi-region disaster recovery engine executing health-check routed traffic failover and database replica promotion with verified RTO/RPO limits."
            }
        ],
        "interview_focus": [
            "SLI, SLO and SLA Definitions, Error Budget Policies & Burn-Rate Alerting Algorithms",
            "Incident Management Lifecycle (Incident Commander, Postmortem Blameless Culture, Root Cause Analysis)",
            "Site Reliability Engineering Principles (Eliminating Toil, Capacity Planning, Chaos Engineering)",
            "Distributed Systems Resilience Patterns (Circuit Breakers, Bulkheads, Backpressure, Jitter/Backoff)",
            "Observability for High-Scale SRE (Golden Signals: Latency, Traffic, Errors, Saturation)"
        ]
    },
    "soc_analyst": {
        "capstones": [
            {
                "title": "Home Detection Engineering & Threat Hunting Lab with Wazuh & Suricata",
                "tech_stack": ["Wazuh SIEM", "Suricata IDS", "Atomic Red Team", "Sigma Rules", "Sysmon"],
                "description": "Deploy an enterprise SIEM home lab simulating adversary credential dumping and lateral movement, authoring custom Sigma rules to detect attack patterns."
            },
            {
                "title": "End-to-End Phishing & Credential Compromise Forensics Investigation",
                "tech_stack": ["TheHive", "Cortex", "CyberChef", "Wireshark", "Volatility"],
                "description": "Analyze malicious email attachments and PCAP network traces, extracting obfuscated C2 payloads, performing memory triage, and publishing a formal incident response report."
            }
        ],
        "interview_focus": [
            "The Cyber Kill Chain & MITRE ATT&CK Framework Mapping during Incident Triage",
            "Analyzing Windows Security Event Logs (Events 4624, 4625, 4672, 4720, Sysmon Event 1 & 3)",
            "Phishing Email Header Analysis (SPF, DKIM, DMARC Authentication Failures)",
            "Network Traffic Analysis with Wireshark (Detecting C2 Beacons, DNS Tunneling, ARP Spoofing)",
            "Incident Response Phases (Preparation, Identification, Containment, Eradication, Recovery, Lessons Learned)"
        ]
    },
    "speech_ai_engineer": {
        "capstones": [
            {
                "title": "Real-Time Low-Latency Streaming Speech-to-Text Pipeline",
                "tech_stack": ["Whisper / Conformer", "PyTorch", "WebSockets", "WebRTC", "ONNX Runtime"],
                "description": "Build a streaming ASR server processing microphone audio chunks via WebRTC, performing voice activity detection (VAD), and streaming transcriptions with sub-200ms latency."
            },
            {
                "title": "Neural Text-to-Speech (TTS) Voice Synthesis & Cloning Model",
                "tech_stack": ["FastSpeech 2 / VITS", "HiFi-GAN Vocoder", "PyTorch", "Torchaudio", "FastAPI"],
                "description": "Train and optimize a neural TTS pipeline synthesizing expressive speech from text, implementing speaker embeddings for zero-shot voice cloning and TensorRT acceleration."
            }
        ],
        "interview_focus": [
            "Acoustic Feature Extraction (Mel-Spectrograms, MFCCs, Short-Time Fourier Transform / STFT)",
            "ASR Model Architectures (Connectionist Temporal Classification / CTC, RNN-T, Whisper Attention)",
            "Neural Vocoders (HiFi-GAN, WaveGlow, Diffusion Vocoders) & Speech Synthesis Tradeoffs",
            "Streaming Latency Optimization (Chunk-Based Inference, KV-Cache Reuse, Model Quantization)",
            "Voice Activity Detection (VAD) Algorithms & Acoustic Noise Suppression Techniques"
        ]
    },
    "svelte_developer": {
        "capstones": [
            {
                "title": "Real-Time Collaborative Workspace with SvelteKit & Runes",
                "tech_stack": ["Svelte 5", "SvelteKit", "Runes Reactive State", "WebSockets", "Tailwind CSS"],
                "description": "Build an ultra-lightweight project collaboration board using Svelte 5 universal reactivity runes ($state, $derived, $effect), optimistic mutations, and WebSocket sync."
            },
            {
                "title": "High-Performance Data Visualization Studio with Svelte & LayerCake",
                "tech_stack": ["Svelte 5", "D3.js", "LayerCake", "HTML5 Canvas", "IndexedDB"],
                "description": "Construct an interactive financial charting studio plotting 100,000 live price ticks with canvas rendering, virtualized data tables, and client-side IndexedDB caching."
            }
        ],
        "interview_focus": [
            "Svelte 5 Runes Reactivity Model ($state, $derived, $effect, $props) vs Svelte 4 Store Semantics",
            "SvelteKit Architecture (Routing, +page.server.js Load Functions, Form Actions, Hooks)",
            "Compile-Time vs Runtime Frameworks (Why Svelte Generates Imperative DOM Updates Without Virtual DOM)",
            "Server-Side Rendering (SSR), Client Hydration & Prerendering in SvelteKit",
            "State Management Options in Large-Scale Svelte Applications (Context API vs Runes Modules)"
        ]
    },
    "technical_artist": {
        "capstones": [
            {
                "title": "Procedural Environment Generation Tool in Houdini & Unreal Engine 5",
                "tech_stack": ["Houdini Engine", "Unreal Engine 5", "Blueprints", "PCG Framework", "Python"],
                "description": "Develop a procedural environment tool in Houdini generating terrain cliffs and foliage scattering, integrating with Unreal Engine 5 PCG and Nanite geometry."
            },
            {
                "title": "Interactive Dynamic Water & Weather Shader Suite in HLSL",
                "tech_stack": ["HLSL / GLSL", "Unreal Engine Material Graph", "Vertex Deformation", "Niagara VFX", "C++"],
                "description": "Author an optimized physically based water shader featuring Gerstner waves, real-time foam generation, underwater caustics, and dynamic precipitation interactions."
            }
        ],
        "interview_focus": [
            "Rendering Pipeline Stages (Vertex, Hull/Domain, Geometry, Pixel/Fragment Shaders)",
            "GPU Performance Profiling & Optimization (Draw Calls, Overdraw, Vertex Density, Texture Bandwidth)",
            "Physically Based Rendering (PBR) Workflows (Albedo, Normal, Roughness, Metallic, Ambient Occlusion)",
            "Rigging, Skinning & Dual-Quaternion Blending for Character Deformation",
            "Asset Pipeline Automation (Python Scripting for Blender/Maya/Houdini to Game Engine)"
        ]
    },
    "technical_support_engineer": {
        "capstones": [
            {
                "title": "Automated Tier-2 Diagnostics CLI & Customer Log Parsing Tool",
                "tech_stack": ["Python", "Click", "Regular Expressions", "SQLite", "REST APIs"],
                "description": "Build an automated troubleshooting utility that parses customer error logs, extracts stack traces and HTTP error patterns, and maps them to known engineering runbooks."
            },
            {
                "title": "Automated Customer Knowledge Base & Escalation Webhook System",
                "tech_stack": ["Node.js", "Zendesk / Jira Service Desk API", "Slack Webhooks", "Docker", "Express"],
                "description": "Develop a middleware service capturing incoming support tickets, categorizing severity via sentiment analysis, and dispatching automated engineering incident alerts."
            }
        ],
        "interview_focus": [
            "Systematic Troubleshooting Methodology (OSI Model Layer Isolation, Divide-and-Conquer)",
            "Customer Communication & Managing Frustrated Enterprise Stakeholders during Outages",
            "Debugging Network Connectivity (ping, traceroute, nslookup, curl with verbose headers)",
            "Log Analysis & Incident Reproduction in Staging / Sandbox Environments",
            "Creating Effective Runbooks, Internal Knowledge Base Articles & Bug Escalations"
        ]
    },
    "technical_writing": {
        "capstones": [
            {
                "title": "Interactive Developer Portal & OpenAPI Reference with Docusaurus",
                "tech_stack": ["Docusaurus 3", "Markdown / MDX", "OpenAPI / Swagger", "Mermaid.js", "Algolia"],
                "description": "Build and deploy an enterprise developer documentation hub featuring interactive API explorers, clear architecture diagrams, and instant Algolia DocSearch."
            },
            {
                "title": "End-to-End Enterprise API Quickstart Guide & Multi-Language SDK Samples",
                "tech_stack": ["Postman Collections", "cURL", "Python / Node.js Snippets", "Diátaxis Framework", "GitHub"],
                "description": "Author a frictionless 5-minute developer onboarding quickstart using the Diátaxis framework, including functional code samples, error recovery guides, and sample apps."
            }
        ],
        "interview_focus": [
            "The Diátaxis Documentation Framework (Tutorials, How-To Guides, Reference, Explanation)",
            "Docs-as-Code Workflow (Markdown, Git Version Control, CI/CD Automated Linting with Vale)",
            "Creating High-Quality REST & GraphQL API Documentation (Endpoints, Parameters, Error Codes)",
            "Information Architecture & Structuring Navigable Technical Portals",
            "Translating Complex Engineering Specs into Actionable Developer Documentation"
        ]
    },
    "terraform_iac_engineer": {
        "capstones": [
            {
                "title": "Reusable Enterprise Multi-Cloud Terraform Module Library with Terratest",
                "tech_stack": ["Terraform 1.9", "Go", "Terratest", "TFLint", "Trivy", "GitHub Actions"],
                "description": "Develop an enterprise-grade library of hardened Terraform modules provisioning VPCs, EKS clusters, and RDS databases with automated Terratest validation in CI."
            },
            {
                "title": "Zero-Downtime Infrastructure Drift Detection & Auto-Remediation Engine",
                "tech_stack": ["Terraform Cloud", "AWS EventBridge", "Lambda", "Slack Notifications", "Infracost"],
                "description": "Engineer an automated drift monitoring workflow checking cloud state every 6 hours, calculating pull request cost impact with Infracost, and alerting engineers."
            }
        ],
        "interview_focus": [
            "Terraform State Management, Locking Mechanisms & Remote State Storage in S3/DynamoDB",
            "Terraform Module Architecture, Input Validation Rules & Output Design",
            "Managing State Migrations, Imports & Refactoring (terraform state mv, import blocks)",
            "Infrastructure Testing Strategies (Static Analysis with TFLint/Checkov vs Terratest Integration)",
            "Terraform Workspaces vs Directory-Based Multi-Environment Separation (Terragrunt)"
        ]
    },
    "threat_intelligence_analyst": {
        "capstones": [
            {
                "title": "Automated Threat Intelligence Feed Aggregator & Enricher with OpenCTI",
                "tech_stack": ["OpenCTI", "Python", "MISP", "STIX 2.1 / TAXII", "VirusTotal API", "Shodan API"],
                "description": "Build an automated cyber threat intelligence pipeline ingesting OSINT feeds, normalizing observables to STIX 2.1, and correlating indicators of compromise (IOCs)."
            },
            {
                "title": "Adversary Infrastructure Tracking & YARA Rule Hunting Engine",
                "tech_stack": ["YARA", "Python", "Censys API", "URLhaus", "MITRE ATT&CK Matrix"],
                "description": "Design an automated threat hunting harness discovering adversary C2 infrastructure across IPv4 space, tracking threat actor TTPs, and generating actionable intelligence reports."
            }
        ],
        "interview_focus": [
            "The Threat Intelligence Lifecycle (Planning, Collection, Processing, Analysis, Dissemination)",
            "Cyber Threat Frameworks (Diamond Model, MITRE ATT&CK, Cyber Kill Chain)",
            "STIX 2.1 & TAXII Standards for Threat Intelligence Sharing and Automation",
            "Strategic vs Operational vs Tactical vs Technical Threat Intelligence",
            "Assessing Source Reliability & Information Credibility (Admiralty Code / NATO System)"
        ]
    },
    "ui_ux_design": {
        "capstones": [
            {
                "title": "Comprehensive Multi-Platform Design System & Token Architecture",
                "tech_stack": ["Figma Variables", "Token Studio", "Auto Layout 5", "WCAG 2.2 AA", "Storybook"],
                "description": "Construct an enterprise-scale design system with multi-theme color tokens, accessible typography scales, modular components, and comprehensive design documentation."
            },
            {
                "title": "Accessible Complex B2B SaaS Workflow Redesign & Usability Case Study",
                "tech_stack": ["User Journey Mapping", "Interactive Prototyping", "Usability Testing", "Figma", "Miro"],
                "description": "Lead an end-to-end redesign of an enterprise analytics workflow, documenting user research, wireframing iterations, usability test benchmarks, and measurable task improvements."
            }
        ],
        "interview_focus": [
            "UX Research Methodologies (Generative vs Evaluative, Quantitative vs Qualitative)",
            "Design System Scalability (Variables, Modes, Component Variants, Slot Patterns in Figma)",
            "Information Architecture & User Mental Models in Complex Digital Products",
            "Accessibility Guidelines (WCAG 2.2 Level AA/AAA, Focus States, Color Contrast, Screen Readers)",
            "Articulating Design Rationale & Measuring Product Design Impact on Business Metrics"
        ]
    },
    "unity_developer": {
        "capstones": [
            {
                "title": "3D Isometric Action Roguelike with Procedural Dungeon Generation",
                "tech_stack": ["Unity 6", "C#", "NavMesh", "Shader Graph", "Cinemachine", "Object Pooling"],
                "description": "Develop a 3D isometric action game featuring procedurally generated dungeon layouts, AI pathfinding via NavMesh, dynamic camera tracking, and custom visual shaders."
            },
            {
                "title": "Networked Multiplayer Physics Game with Netcode for GameObjects",
                "tech_stack": ["Unity 6", "Netcode for GameObjects", "Client-Side Prediction", "Relay Service", "Lobby"],
                "description": "Build a real-time multiplayer arena game implementing client-side prediction, server reconciliation, lag compensation, and matchmaking via Unity Gaming Services."
            }
        ],
        "interview_focus": [
            "Unity Execution Order & Lifecycle Methods (Awake, OnEnable, Start, FixedUpdate, Update, LateUpdate)",
            "Memory Management in Unity (Garbage Collection, Structs vs Classes, Object Pooling Patterns)",
            "Physics Simulation (Rigidbodies, Colliders, Physics Raycasting, FixedUpdate Invariants)",
            "Optimization Techniques (Draw Call Batching, GPU Instancing, Occlusion Culling, LOD Groups)",
            "ScriptableObjects Architecture for Decoupled Game Systems and Modular Data"
        ]
    },
    "unreal_engine_developer": {
        "capstones": [
            {
                "title": "Multiplayer Co-Op Tactical Shooter with Gameplay Ability System (GAS)",
                "tech_stack": ["Unreal Engine 5.4", "C++", "Gameplay Ability System (GAS)", "Replication", "Lumen"],
                "description": "Engineer a networked tactical shooter featuring weapon attributes and cooldowns driven by GAS, predictive client replication, and dynamic lighting via Lumen."
            },
            {
                "title": "Realistic Vehicle Kinematics & Physics Simulation with Chaos Physics",
                "tech_stack": ["Unreal Engine 5", "Chaos Physics", "C++", "Custom Telemetry HUD", "Nanite"],
                "description": "Build a high-fidelity vehicle simulation featuring custom suspension geometry, tire friction curves, telemetry data logging, and destructible Nanite meshes."
            }
        ],
        "interview_focus": [
            "Unreal Engine Memory Management (UObject Garbage Collection, Smart Pointers TSharedPtr, TWeakObjectPtr)",
            "Network Replication in UE5 (Actor Replication, Property Replication, RPCs: Server, Client, NetMulticast)",
            "Gameplay Ability System (GAS) Architecture (Gameplay Abilities, Gameplay Attributes, Gameplay Effects, Tags)",
            "C++ vs Blueprints Best Practices (Performance Boundaries, UFUNCTION, UPROPERTY Macro Specifiers)",
            "Rendering Architecture (Nanite Virtualized Geometry, Lumen Global Illumination, RenderDoc Profiling)"
        ]
    },
    "ux_researcher": {
        "capstones": [
            {
                "title": "Comprehensive Mixed-Methods B2B SaaS Usability Study & Synthesis",
                "tech_stack": ["Semi-Structured Interviews", "Usability Testing", "SUS Scoring", "Miro Synthesis", "Dovetail"],
                "description": "Conduct generative interviews and remote unmoderated usability tests on an enterprise analytics tool, calculating System Usability Scale (SUS) scores and recommendations."
            },
            {
                "title": "Enterprise Information Architecture & Tree Testing Audit",
                "tech_stack": ["OptimalSort Card Sorting", "Treejack", "Quantitative Task Analysis", "Executive Reports"],
                "description": "Execute open and closed card sorts combined with tree testing to restructure a complex enterprise documentation hierarchy, reducing task navigation errors by 50%."
            }
        ],
        "interview_focus": [
            "Research Methodology Selection (When to use Qualitative vs Quantitative, Generative vs Evaluative)",
            "Writing Unbiased Research Questions & Moderating User Testing Sessions Without Leading",
            "Synthesizing Research Findings into Actionable Insights (Affinity Mapping, Thematic Analysis)",
            "Quantitative Usability Metrics (Task Completion Rate, Time on Task, SUS, SEQ, NPS)",
            "Managing Stakeholder Resistance & Demonstrating Business ROI from UX Research"
        ]
    },
    "vue_developer": {
        "capstones": [
            {
                "title": "Modern High-Traffic E-Commerce Storefront with Nuxt 3 & SSR",
                "tech_stack": ["Vue 3", "Nuxt 3", "Pinia", "Tailwind CSS", "Stripe", "Nitro Engine"],
                "description": "Develop a server-side rendered e-commerce catalog featuring faceted filtering, optimistic cart management via Pinia, SEO metadata optimization, and Stripe checkout."
            },
            {
                "title": "Enterprise Real-Time Project Management Board with Pinia & WebSockets",
                "tech_stack": ["Vue 3", "Composition API", "HTML5 Drag-and-Drop", "WebSockets", "Vitest"],
                "description": "Build a responsive kanban workspace featuring optimistic drag-and-drop card reordering, live multi-user cursor tracking, and comprehensive Vitest component coverage."
            }
        ],
        "interview_focus": [
            "Vue 3 Reactivity System Internals (Proxy vs Object.defineProperty, ref vs reactive, shallowRef)",
            "Composition API vs Options API & Custom Composables Architecture",
            "Nuxt 3 Architecture (Nitro Server Engine, Auto-Imports, useAsyncData vs useFetch, Hydration)",
            "State Management with Pinia (Stores, Getters, Actions, SSR Hydration & Plugins)",
            "Performance Optimization in Vue 3 (v-once, v-memo, Virtual Scrolling, Component Lazy Loading)"
        ]
    },
    "windows_app_developer": {
        "capstones": [
            {
                "title": "Modern Windows 11 Fluent System Utility with WinUI 3 & Windows App SDK",
                "tech_stack": ["C#", "WinUI 3", "Windows App SDK", "Mica Material", "CommunityToolkit.Mvvm"],
                "description": "Develop a native Windows 11 utility adhering to Fluent Design guidelines, featuring Mica material backdrops, responsive WinUI 3 controls, and MVVM architecture."
            },
            {
                "title": "Local-First Developer Workspace with SQLite & High-Performance Async I/O",
                "tech_stack": ["C#", ".NET 8", "WPF / WinUI", "SQLite", "FileSystemWatcher", "MSIX"],
                "description": "Engineer a native developer scratchpad and log analyzer with multi-threaded file indexing, low-memory SQLite caching, and MSIX desktop packaging."
            }
        ],
        "interview_focus": [
            "Windows App SDK & WinUI 3 Architecture vs WPF and UWP Differences",
            "The MVVM Pattern (INotifyPropertyChanged, ICommand, CommunityToolkit.Mvvm Source Generators)",
            "Windows 11 Fluent Design System (Mica, Acrylic Materials, NavigationView, Dark/Light Theming)",
            "Asynchronous Programming in .NET (async/await, Task Parallel Library, SynchronizationContext)",
            "Windows Application Packaging & Deployment (MSIX, App Installer, Desktop Bridge)"
        ]
    },
    "wordpress_developer": {
        "capstones": [
            {
                "title": "Enterprise Decoupled Headless WordPress CMS with Next.js & WPGraphQL",
                "tech_stack": ["WordPress", "WPGraphQL", "Next.js 15", "Incremental Static Regeneration", "Docker"],
                "description": "Architect a headless enterprise publishing system utilizing WPGraphQL, automated webhook cache revalidation in Next.js, and sub-100ms global page delivery."
            },
            {
                "title": "Custom High-Performance Gutenberg Block Plugin Suite & WooCommerce Engine",
                "tech_stack": ["PHP 8.3", "React", "WordPress Block API", "WooCommerce REST API", "Redis Object Cache"],
                "description": "Develop a bespoke suite of custom Gutenberg blocks using modern React and the WordPress Block Editor, integrated with WooCommerce and persistent Redis caching."
            }
        ],
        "interview_focus": [
            "WordPress Hook System (Actions vs Filters, Hook Priority, Custom Action Implementation)",
            "Database Schema & Optimization (wp_posts, wp_postmeta, Custom Post Types, Transients API)",
            "Modern Gutenberg Block Development (Block Registration, attributes, edit vs save, React JSX)",
            "Headless WordPress Architecture (WPGraphQL vs REST API, Authentication, Webhook Invalidation)",
            "WordPress Security Hardening (Nonces, Data Sanitization/Validation/Escaping, Capabilities)"
        ]
    }
}

print(f"Loaded {len(UPGRADES)} custom roadmap upgrade definitions.")
