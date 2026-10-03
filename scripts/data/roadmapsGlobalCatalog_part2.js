/**
 * SkillBun 100 Roadmaps Global Standard Catalog - Part 2
 * AI, Machine Learning, Data Science, MLOps, and Analytics
 */

const PART2_CATALOG = {
  ai_ml_engineer: {
    title: 'AI/ML Engineer',
    description: 'Develop intelligent models, scalable machine learning pipelines, deep neural networks, transformer architectures, and production MLOps deployment systems.',
    goal: {
      objective: 'Design, train, optimize, and deploy robust machine learning models and deep neural architectures into scalable, low-latency production systems.',
      salary: '$95,000 - $170,000 / yr (₹8 - ₹30 LPA)',
      salary_range: { usd: { min: 95000, max: 170000, period: 'yr' }, inr_lpa: { min: 8, max: 30, period: 'lpa' } },
      experience_level: 'Junior to Staff (1 - 6+ Years)',
      target_roles: ['Machine Learning Engineer', 'AI Systems Engineer', 'Deep Learning Specialist', 'Applied ML Scientist'],
      career_pillars: ['Statistical Learning & Neural Networks', 'PyTorch & Distributed Model Training', 'MLOps & Low-Latency Model Inference']
    },
    learn: {
      summary: 'Master applied mathematics (linear algebra, calculus, probability), Python for scientific computing, Scikit-Learn, PyTorch, model optimization, feature stores, and MLOps deployment.',
      key_competencies: ['Linear Algebra, Probability & Optimization Math', 'PyTorch & Deep Neural Network Training', 'Transformers, Attention & HuggingFace Models', 'Model Quantization, ONNX & TensorRT Inference', 'MLflow, DVC & End-to-End MLOps Pipelines'],
      prerequisites: ['Proficiency in Python programming', 'College-level calculus and linear algebra', 'Data manipulation with Pandas/NumPy']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time Multimodal Semantic Search & RAG System', tech_stack: ['Python', 'PyTorch', 'Qdrant/Pinecone', 'FastAPI', 'Docker'], description: 'Build an enterprise semantic retrieval engine utilizing CLIP embeddings and cross-encoder rerankers with sub-50ms latency.' },
        { title: 'Distributed Image Classification & Model Serving Pipeline', tech_stack: ['PyTorch', 'Triton Inference Server', 'Kubernetes', 'MLflow'], description: 'Train and deploy a ResNet/Vision Transformer pipeline with automated drift monitoring and canary model deployments.' }
      ],
      certifications: ['AWS Certified Machine Learning Engineer - Associate', 'Google Cloud Professional Machine Learning Engineer', 'AWS Certified AI Practitioner'],
      interview_focus: ['Backpropagation Mathematics & Gradient Descent Variants', 'Bias-Variance Tradeoff & Regularization Techniques', 'Transformer Architecture (Self-Attention, KV Caching)', 'Model Serving Latency vs Throughput Tradeoffs']
    }
  },

  ai_research_engineer: {
    title: 'AI Research Engineer',
    description: 'Bridge bleeding-edge theoretical AI advancements and practical systems implementations, scaling frontier model architectures and research benchmarks.',
    goal: {
      objective: 'Implement novel deep learning architectures from scientific papers, push algorithmic boundaries, and scale large neural networks across distributed GPU clusters.',
      salary: '$110,000 - $195,000 / yr (₹12 - ₹40 LPA)',
      salary_range: { usd: { min: 110000, max: 195000, period: 'yr' }, inr_lpa: { min: 12, max: 40, period: 'lpa' } },
      experience_level: 'Mid to Principal (2 - 7+ Years)',
      target_roles: ['AI Research Engineer', 'Research Scientist', 'Deep Learning Architect', 'Frontier Model Engineer'],
      career_pillars: ['Advanced Deep Learning Theory', 'Distributed Multi-GPU Training (Megatron-LM, FSDP)', 'Custom CUDA Kernels & Research Reproducibility']
    },
    learn: {
      summary: 'Deep dive into theoretical neural network foundations, custom loss functions, transformer scaling laws, JAX/PyTorch internals, distributed training (ZeRO/FSDP), and research paper replication.',
      key_competencies: ['Advanced Probability, Information Theory & Vector Calculus', 'PyTorch & JAX Computational Graphs', 'Distributed Multi-Node Training (Deepspeed/FSDP)', 'CUDA Kernel Programming with Triton/C++', 'Research Paper Implementation & Benchmarking'],
      prerequisites: ['Advanced mathematical rigor (multivariable calculus, statistics)', 'Deep Python & C++ fluency', 'Strong theoretical computer science foundation']
    },
    boost: {
      capstone_projects: [
        { title: 'Open-Source Transformer Replication & Scaling Experiment', tech_stack: ['PyTorch', 'FSDP', 'WandB', 'HuggingFace'], description: 'Implement an attention architecture from a NeurIPS paper from scratch and train it on a multi-GPU cluster with loss curves.' }
      ],
      certifications: ['DeepLearning.AI Deep Learning Specialization'],
      interview_focus: ['Mathematical Proofs of Attention Complexity', 'Distributed Training Parallelism (Tensor, Pipeline, Data)', 'Gradient Vanishing / Exploding Dynamics', 'Research Paper Analysis & Critique']
    }
  },

  generative_ai_app_developer: {
    title: 'Generative AI Developer',
    description: 'Build production AI applications utilizing Large Language Models (LLMs), Retrieval-Augmented Generation (RAG), vector databases, and multi-agent workflows.',
    goal: {
      objective: 'Architect enterprise applications that harness LLMs, multi-agent frameworks, semantic vector databases, and real-time knowledge retrieval.',
      salary: '$95,000 - $165,000 / yr (₹8 - ₹28 LPA)',
      salary_range: { usd: { min: 95000, max: 165000, period: 'yr' }, inr_lpa: { min: 8, max: 28, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Generative AI Engineer', 'LLM Application Developer', 'AI Solutions Architect'],
      career_pillars: ['Advanced RAG & Vector Embeddings', 'Autonomous Agentic Workflows (LangGraph/CrewAI)', 'Model Guardrails, Evaluation & Cost Control']
    },
    learn: {
      summary: 'Master LLM API orchestration, prompt chaining, LangChain/LangGraph, LlamaIndex, vector indexing (Chroma, Pinecone, Qdrant), evaluation with Ragas, and semantic caching.',
      key_competencies: ['LLM APIs (OpenAI, Anthropic, Gemini, Ollama)', 'LangChain, LangGraph & LlamaIndex Frameworks', 'Vector Databases & Hybrid Search (Sparse/Dense)', 'Retrieval-Augmented Generation (RAG) Architecture', 'LLM Observability, Evaluation & Guardrails (LangSmith)'],
      prerequisites: ['Python or TypeScript proficiency', 'REST API consumption and backend design', 'Basic understanding of machine learning concepts']
    },
    boost: {
      capstone_projects: [
        { title: 'Autonomous Multi-Agent Market Intelligence System', tech_stack: ['Python', 'LangGraph', 'Pinecone', 'FastAPI', 'Next.js'], description: 'Build a team of AI agents that research, summarize, critique, and synthesize corporate earnings reports into PDF briefs.' }
      ],
      certifications: ['DeepLearning.AI Generative AI for Everyone & LLM Specialization', 'AWS Certified AI Practitioner'],
      interview_focus: ['RAG Hallucination Mitigation & Context Windows', 'Vector Similarity Metrics (Cosine, Dot Product, Euclidean)', 'Agent Tool Calling & Loop Termination Guarantees', 'Latency, Token Cost & Semantic Caching Strategies']
    }
  },

  llmops_engineer: {
    title: 'LLMOps Engineer',
    description: 'Operationalize, fine-tune, serve, and monitor Large Language Models at production scale with optimal throughput, KV-cache management, and hardware utilization.',
    goal: {
      objective: 'Engineer high-throughput inference infrastructure, distributed serving engines, LoRA fine-tuning pipelines, and safety guardrails for generative AI models.',
      salary: '$100,000 - $180,000 / yr (₹10 - ₹32 LPA)',
      salary_range: { usd: { min: 100000, max: 180000, period: 'yr' }, inr_lpa: { min: 10, max: 32, period: 'lpa' } },
      experience_level: 'Mid to Staff (2 - 6+ Years)',
      target_roles: ['LLMOps Engineer', 'AI Infrastructure Engineer', 'Model Serving Specialist'],
      career_pillars: ['High-Throughput Model Serving (vLLM/TGI)', 'LoRA / QLoRA Parameter-Efficient Fine-Tuning', 'GPU Cluster Utilization & Inference Cost Optimization']
    },
    learn: {
      summary: 'Master high-throughput LLM serving engines (vLLM, HuggingFace TGI), PagedAttention, KV-cache optimization, quantizations (AWQ, GPTQ), LoRA/QLoRA tuning, and GPU orchestration with Ray.',
      key_competencies: ['vLLM, TGI & TensorRT-LLM Serving Engines', 'PagedAttention & Continuous Batching Mechanics', 'Parameter-Efficient Fine-Tuning (LoRA/QLoRA)', 'Model Quantization (INT4, FP8, AWQ, GGUF)', 'GPU Telemetry, Triton Inference Server & Ray Clusters'],
      prerequisites: ['Linux & Docker container proficiency', 'Python systems programming', 'Foundations of transformer architectures']
    },
    boost: {
      capstone_projects: [
        { title: 'Production LLM Gateway with Dynamic Fallback & Caching', tech_stack: ['Python', 'vLLM', 'Ray', 'Prometheus', 'Kubernetes'], description: 'Deploy an enterprise LLM proxy with PagedAttention, token-level streaming, rate limiting, and semantic response caching.' }
      ],
      certifications: ['Linux Foundation Certified Kubernetes Administrator (CKA)'],
      interview_focus: ['PagedAttention & Memory Fragmentation in KV-Cache', 'Continuous Batching vs Static Batching in LLM Inference', 'LoRA Weight Merging vs Adapter Serving', 'Cost Analysis: Self-Hosted GPU vs Proprietary API Tokens']
    }
  },

  mlops_engineer: {
    title: 'MLOps Engineer',
    description: 'Automate machine learning lifecycles, continuous training pipelines, feature stores, model registries, and data-drift observability.',
    goal: {
      objective: 'Bridge data science and DevOps to automate the continuous integration, continuous delivery, and real-time monitoring of production machine learning models.',
      salary: '$95,000 - $165,000 / yr (₹8 - ₹28 LPA)',
      salary_range: { usd: { min: 95000, max: 165000, period: 'yr' }, inr_lpa: { min: 8, max: 28, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 6+ Years)',
      target_roles: ['MLOps Engineer', 'Machine Learning Platform Engineer', 'DataOps Architect'],
      career_pillars: ['Automated Training Pipelines (Kubeflow/Airflow)', 'Feature Stores & Data Versioning (Feast/DVC)', 'Model Observability & Drift Detection (Evidently/Whylabs)']
    },
    learn: {
      summary: 'Master reproducible data pipelines with DVC, model experiment tracking with MLflow, workflow orchestration with Kubeflow/Airflow, feature stores (Feast), and model monitoring.',
      key_competencies: ['MLflow Experiment Tracking & Model Registry', 'Data & Pipeline Versioning with DVC', 'Kubeflow Pipelines & Apache Airflow DAGs', 'Feature Stores (Feast, Hopsworks)', 'Data Drift, Concept Drift & Model Monitoring'],
      prerequisites: ['Solid Python programming', 'Docker & Kubernetes basics', 'Applied machine learning fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'End-to-End Automated Continuous Retraining Pipeline', tech_stack: ['Python', 'MLflow', 'Airflow', 'DVC', 'Docker', 'Kubernetes'], description: 'Build an automated pipeline that detects model performance degradation, triggers retraining, logs metrics, and registers candidate models.' }
      ],
      certifications: ['AWS Certified Machine Learning Engineer - Associate', 'Databricks Certified Machine Learning Professional'],
      interview_focus: ['Data Drift vs Concept Drift Detection Algorithms', 'Feature Store Architecture (Online vs Offline Stores)', 'Zero-Downtime Model Deployment (Shadow, Canary, Blue/Green)', 'Data Lineage and Reproducibility Guarantees']
    }
  },

  prompt_engineer: {
    title: 'Prompt Engineer',
    description: 'Master systematic context engineering, few-shot conditioning, chain-of-thought methodologies, evaluation frameworks, and guardrails for frontier AI models.',
    goal: {
      objective: 'Optimize natural language interfaces with frontier LLMs, engineering robust prompting strategies, programmatic evaluations, and safety alignments.',
      salary: '$75,000 - $135,000 / yr (₹6 - ₹20 LPA)',
      salary_range: { usd: { min: 75000, max: 135000, period: 'yr' }, inr_lpa: { min: 6, max: 20, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 4+ Years)',
      target_roles: ['Prompt Engineer', 'AI Evaluation Specialist', 'Context Architect', 'AI Interaction Designer'],
      career_pillars: ['Context Window Engineering & System Prompts', 'Algorithmic Evaluation & Red-Teaming', 'Structured Output Extraction & Function Calling']
    },
    learn: {
      summary: 'Master Chain-of-Thought, ReAct frameworks, few-shot prompting, DSPy programmatic prompt compilation, evaluation with DeepEval, and prompt injection defenses.',
      key_competencies: ['Chain-of-Thought, Tree-of-Thoughts & ReAct Patterns', 'JSON Schema & Structured Function Calling', 'DSPy (Programmatic Prompt Optimization)', 'Prompt Evaluation, Benchmarking & A/B Testing', 'Adversarial Jailbreak & Prompt Injection Defenses'],
      prerequisites: ['Clear analytical writing and logic', 'Introductory Python or scripting skills', 'Understanding of LLM capabilities & limitations']
    },
    boost: {
      capstone_projects: [
        { title: 'Automated Prompt Evaluation & Red-Teaming Suite', tech_stack: ['Python', 'DSPy', 'DeepEval', 'OpenAI/Gemini API'], description: 'Build an automated regression test bench for LLM applications that evaluates accuracy, hallucination rates, and security vulnerability.' }
      ],
      interview_focus: ['Prompt Injection Attack Vectors (Direct vs Indirect)', 'Techniques for Enforcing Strict Deterministic JSON Output', 'DSPy Teleprompter Optimization Mechanics', 'Context Window Compression & Information Loss']
    }
  },

  nlp_engineer: {
    title: 'NLP Engineer',
    description: 'Build natural language processing systems, transformer-based text analytics, semantic search engines, and linguistic intelligence pipelines.',
    goal: {
      objective: 'Engineer robust computational linguistic systems, sentiment analyzers, named-entity recognizers, and multilingual text understanding models.',
      salary: '$90,000 - $160,000 / yr (₹8 - ₹26 LPA)',
      salary_range: { usd: { min: 90000, max: 160000, period: 'yr' }, inr_lpa: { min: 8, max: 26, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['NLP Engineer', 'Computational Linguist', 'Applied AI Scientist'],
      career_pillars: ['Tokenization & Semantic Embeddings', 'Transformer Architectures (BERT, RoBERTa, T5)', 'Domain-Specific NLP Fine-Tuning']
    },
    learn: {
      summary: 'Master linguistic fundamentals, BPE tokenization, Word2Vec, BERT, sentence transformers, HuggingFace ecosystem, SpaCy, and fine-tuning for classification and NER.',
      key_competencies: ['Text Preprocessing, Tokenization (BPE/WordPiece)', 'SpaCy & NLTK Linguistic Parsing', 'HuggingFace Transformers, Datasets & Tokenizers', 'Named Entity Recognition (NER) & Text Classification', 'Sentence Embeddings & Semantic Search'],
      prerequisites: ['Solid Python programming', 'Basic machine learning concepts', 'Familiarity with probability and linear algebra']
    },
    boost: {
      capstone_projects: [
        { title: 'Multilingual Contract Entity & Clause Extraction Engine', tech_stack: ['Python', 'HuggingFace Transformers', 'PyTorch', 'FastAPI'], description: 'Fine-tune a RoBERTa model to automatically identify legal obligations, liabilities, and entities in enterprise legal contracts.' }
      ],
      certifications: ['DeepLearning.AI Natural Language Processing Specialization'],
      interview_focus: ['Subword Tokenization Algorithms & Out-of-Vocabulary Handling', 'BERT (Encoder) vs GPT (Decoder) vs T5 (Seq2Seq)', 'Cross-Entropy Loss in Language Modeling', 'Handling Imbalanced Text Classification Datasets']
    }
  },

  computer_vision_engineer: {
    title: 'Computer Vision Engineer',
    description: 'Design visual intelligence models, object detection systems, real-time video analytics, and 3D perception pipelines using OpenCV and PyTorch.',
    goal: {
      objective: 'Enable machines to interpret and act on visual inputs, developing real-time object detection, segmentation, and visual reasoning algorithms.',
      salary: '$95,000 - $165,000 / yr (₹8 - ₹28 LPA)',
      salary_range: { usd: { min: 95000, max: 165000, period: 'yr' }, inr_lpa: { min: 8, max: 28, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 6+ Years)',
      target_roles: ['Computer Vision Engineer', 'Perception Engineer', 'Vision AI Specialist'],
      career_pillars: ['Image Processing & OpenCV Foundations', 'Convolutional Networks & Vision Transformers', 'Real-Time Edge Detection & Segmentation']
    },
    learn: {
      summary: 'Master classical computer vision (OpenCV), convolutional neural networks (CNNs), YOLO object detectors, semantic segmentation, Vision Transformers (ViT), and TensorRT deployment.',
      key_competencies: ['Image Filtering, Color Spaces & Morphological Operations', 'CNN Architectures (ResNet, EfficientNet)', 'Real-Time Object Detection (YOLOv8+, RT-DETR)', 'Instance & Semantic Segmentation (Mask R-CNN, SAM)', 'Model Acceleration with ONNX & TensorRT'],
      prerequisites: ['Python and C++ fundamentals', 'Linear algebra, matrix transforms and calculus', 'PyTorch foundation']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time Autonomous Traffic & Pedestrian Monitoring System', tech_stack: ['Python', 'OpenCV', 'YOLOv8', 'DeepSORT', 'TensorRT'], description: 'Build a multi-camera tracking system tracking vehicle velocities, pedestrian safety crossings, and anomaly events at 30+ FPS.' }
      ],
      certifications: ['DeepLearning.AI Deep Learning Specialization'],
      interview_focus: ['Convolution Operation Mathematics, Strides & Padding', 'Non-Maximum Suppression (NMS) & IoU Calculation', 'Anchor-Based vs Anchor-Free Object Detectors', 'Vision Transformer Patch Embeddings vs Convolutions']
    }
  },

  speech_ai_engineer: {
    title: 'Speech AI Engineer',
    description: 'Develop automated speech recognition (ASR), text-to-speech synthesis (TTS), voice biometrics, and audio intelligence systems.',
    goal: {
      objective: 'Build end-to-end voice and audio systems, translating human speech to text, synthesizing expressive voice, and analyzing audio signals.',
      salary: '$95,000 - $165,000 / yr (₹8 - ₹27 LPA)',
      salary_range: { usd: { min: 95000, max: 165000, period: 'yr' }, inr_lpa: { min: 8, max: 27, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Speech AI Engineer', 'Audio Machine Learning Scientist', 'Voice Systems Developer'],
      career_pillars: ['Acoustic Signal Processing & Spectrograms', 'Automatic Speech Recognition (Whisper/Conformer)', 'Neural Text-to-Speech (VITS/FastSpeech)']
    },
    learn: {
      summary: 'Master audio signal processing (Fourier Transforms, Mel-spectrograms), ASR architectures (Wav2Vec2, Whisper, Conformer), Neural TTS synthesis, speaker diarization, and latency tuning.',
      key_competencies: ['Digital Audio Signals, Sampling & Mel-Spectrograms', 'Librosa & Torchaudio Processing', 'ASR Models (OpenAI Whisper, NeMo Conformer)', 'Neural Speech Synthesis & Voice Cloning', 'Connectionist Temporal Classification (CTC) Loss'],
      prerequisites: ['Python programming', 'Signal processing or linear algebra basics', 'PyTorch fundamentals']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time Low-Latency Streaming Transcription Engine', tech_stack: ['Python', 'Whisper', 'WebRTC', 'FastAPI', 'Docker'], description: 'Build a streaming speech-to-text service that streams audio via WebRTC and delivers real-time partial transcripts with under 250ms latency.' }
      ],
      interview_focus: ['Fourier Transform (FFT) & Mel-Frequency Cepstral Coefficients (MFCC)', 'CTC Loss Alignment Mechanics', 'Teacher-Forced vs Non-Autoregressive Speech Synthesis', 'Noise Reduction & Audio Normalization Pipelines']
    }
  },

  recommendation_systems_engineer: {
    title: 'Recommendation Systems Engineer',
    description: 'Architect large-scale personalization engines, collaborative filtering algorithms, two-tower embedding models, and real-time reranking systems.',
    goal: {
      objective: 'Engineer high-impact personalization algorithms that drive user engagement, conversions, and retention across millions of global users.',
      salary: '$100,000 - $175,000 / yr (₹9 - ₹30 LPA)',
      salary_range: { usd: { min: 100000, max: 175000, period: 'yr' }, inr_lpa: { min: 9, max: 30, period: 'lpa' } },
      experience_level: 'Mid to Staff (2 - 6+ Years)',
      target_roles: ['Recommendation Systems Engineer', 'Search & Discovery Machine Learning Engineer', 'Personalization Scientist'],
      career_pillars: ['Candidate Generation (Two-Tower Models)', 'Vector Search (FAISS, ScaNN, HNSW)', 'Multi-Task Ranking & Exploration/Exploitation']
    },
    learn: {
      summary: 'Master collaborative filtering, matrix factorization, Two-Tower neural architectures (User/Item embeddings), vector search at scale (FAISS/Milvus), and real-time multi-objective ranking.',
      key_competencies: ['Matrix Factorization & Collaborative Filtering', 'Two-Tower Deep Retrieval Networks', 'Approximate Nearest Neighbor (ANN) Indexing', 'Multi-Task Ranking (DLRM, DeepFM)', 'Cold-Start Strategies & Exploration (Bandits)'],
      prerequisites: ['Python & PyTorch/TensorFlow', 'Applied linear algebra and statistics', 'Distributed database understanding']
    },
    boost: {
      capstone_projects: [
        { title: 'Real-Time E-Commerce Recommendation & Personalization Engine', tech_stack: ['Python', 'Two-Tower Model', 'FAISS', 'Redis', 'Kafka'], description: 'Build a personalized feed service generating candidate products using deep neural embeddings and ranking by predicted CTR.' }
      ],
      interview_focus: ['Two-Tower Model Training & In-Batch Negatives', 'Approximate Nearest Neighbor Algorithms (HNSW vs IVF)', 'Multi-Objective Ranking Tradeoffs (Clicks vs Revenue)', 'Cold-Start Problem Solutions for New Users and Items']
    }
  },

  reinforcement_learning_engineer: {
    title: 'Reinforcement Learning Engineer',
    description: 'Master Markov Decision Processes, policy optimization, deep Q-networks, actor-critic architectures, and RLHF for language models.',
    goal: {
      objective: 'Design and train autonomous agents that learn optimal decision-making strategies through environment interactions and reward optimization.',
      salary: '$105,000 - $185,000 / yr (₹10 - ₹35 LPA)',
      salary_range: { usd: { min: 105000, max: 185000, period: 'yr' }, inr_lpa: { min: 10, max: 35, period: 'lpa' } },
      experience_level: 'Mid to Staff (2 - 6+ Years)',
      target_roles: ['Reinforcement Learning Engineer', 'Autonomous Systems Scientist', 'RLHF Research Engineer'],
      career_pillars: ['Markov Decision Processes (MDPs)', 'Policy Gradient & Deep Q-Learning', 'RLHF & Human Feedback Optimization']
    },
    learn: {
      summary: 'Master Bellman equations, dynamic programming, Q-learning, Proximal Policy Optimization (PPO), Soft Actor-Critic (SAC), Gymnasium environments, Ray RLlib, and RLHF.',
      key_competencies: ['Markov Decision Processes & Bellman Optimality', 'Value-Based Methods (DQN, Double DQN)', 'Policy Gradients & PPO Algorithms', 'Gymnasium & MuJoCo Simulation Environments', 'Reinforcement Learning from Human Feedback (RLHF/DPO)'],
      prerequisites: ['Rigorous probability & multivariable calculus', 'PyTorch deep learning proficiency', 'Python systems programming']
    },
    boost: {
      capstone_projects: [
        { title: 'Autonomous Navigation Agent in Simulated Physics Environment', tech_stack: ['Python', 'Gymnasium', 'MuJoCo', 'PPO', 'PyTorch'], description: 'Train a continuous-control robotic agent to navigate complex obstacle courses using deep actor-critic reinforcement learning.' }
      ],
      interview_focus: ['Bellman Equation Derivation & Value Iteration', 'On-Policy (PPO) vs Off-Policy (SAC/DQN) Tradeoffs', 'Reward Hacking & Exploration-Exploitation Dilemma', 'RLHF vs Direct Preference Optimization (DPO) Mechanics']
    }
  },

  data_science: {
    title: 'Data Scientist',
    description: 'Transform complex enterprise data into strategic predictive models, statistical insights, experimental designs, and automated business decisions.',
    goal: {
      objective: 'Extract predictive value and actionable intelligence from complex corporate datasets using statistical inference and applied machine learning.',
      salary: '$85,000 - $145,000 / yr (₹6.5 - ₹24 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 6.5, max: 24, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Data Scientist', 'Decision Scientist', 'Applied Statistician', 'Quantitative Analyst'],
      career_pillars: ['Statistical Inference & Experimentation (A/B Testing)', 'Supervised & Unsupervised Machine Learning', 'Data Storytelling & Executive Decision Science']
    },
    learn: {
      summary: 'Master exploratory data analysis, hypothesis testing, regression/classification, ensemble methods (XGBoost/LightGBM), A/B testing methodology, and storytelling.',
      key_competencies: ['Statistical Inference, p-Values & Hypothesis Testing', 'Feature Engineering & Data Cleaning (Pandas/Polars)', 'Scikit-Learn Machine Learning Pipelines', 'Ensemble Trees (XGBoost, LightGBM, CatBoost)', 'A/B Test Design, Sample Sizing & Power Analysis'],
      prerequisites: ['Proficiency in Python or R', 'College-level statistics & algebra', 'Basic SQL query capabilities']
    },
    boost: {
      capstone_projects: [
        { title: 'Customer Churn Prediction & Lifetime Value Forecaster', tech_stack: ['Python', 'Polars', 'XGBoost', 'SHAP', 'Streamlit'], description: 'Build an end-to-end customer churn prediction engine featuring feature attribution (SHAP values) and an executive scenario planner.' }
      ],
      certifications: ['Google Data Analytics Professional Certificate', 'IBM Data Science Professional Certificate', 'Microsoft Certified: Azure Data Scientist Associate'],
      interview_focus: ['Hypothesis Testing (Type I / Type II Errors, Statistical Power)', 'Linear & Logistic Regression Assumptions', 'Cross-Validation & Data Leakage Prevention', 'Interpreting SHAP Values for Business Stakeholders']
    }
  },

  data_engineering: {
    title: 'Data Engineer',
    description: 'Architect distributed data warehouses, resilient ETL/ELT pipelines, real-time streaming architectures, and enterprise lakehouses.',
    goal: {
      objective: 'Build dependable, high-throughput, and clean data pipelines that ingest, transform, and deliver analytical data across the entire organization.',
      salary: '$90,000 - $160,000 / yr (₹7.5 - ₹26 LPA)',
      salary_range: { usd: { min: 90000, max: 160000, period: 'yr' }, inr_lpa: { min: 7.5, max: 26, period: 'lpa' } },
      experience_level: 'Entry to Staff (0 - 6+ Years)',
      target_roles: ['Data Engineer', 'Big Data Developer', 'Data Platform Engineer', 'Analytics Platform Specialist'],
      career_pillars: ['Distributed Batch & Stream Processing (Spark/Flink)', 'Data Warehousing & Lakehouse Modeling (Snowflake/Delta)', 'Workflow Orchestration & Data Quality (Airflow/dbt)']
    },
    learn: {
      summary: 'Master distributed data processing with Apache Spark, event streaming with Kafka, cloud data warehouses (Snowflake, BigQuery), orchestration with Airflow, and transformations with dbt.',
      key_competencies: ['Advanced SQL & Dimensional Data Modeling (Kimball)', 'Apache Spark (PySpark) Distributed Processing', 'Apache Kafka & Real-Time Event Streaming', 'Modern Cloud Data Warehouses (Snowflake/BigQuery)', 'Data Transformation & Testing with dbt'],
      prerequisites: ['Strong SQL and relational database concepts', 'Python programming skills', 'Familiarity with cloud storage and Linux']
    },
    boost: {
      capstone_projects: [
        { title: 'End-to-End Clickstream Data Lakehouse Pipeline', tech_stack: ['Python', 'Apache Kafka', 'Spark Streaming', 'Snowflake', 'dbt'], description: 'Design an event streaming pipeline ingesting millions of clickstream events, deduplicating them, and building star-schema marts in Snowflake.' }
      ],
      certifications: ['Databricks Certified Data Engineer Associate', 'AWS Certified Data Engineer - Associate', 'Google Cloud Professional Data Engineer'],
      interview_focus: ['Star Schema vs Snowflake Schema Modeling', 'Spark Partitioning, Shuffling & Data Skew Optimization', 'Kafka Exactly-Once Semantics (EOS)', 'dbt Incremental Models & Snapshots']
    }
  },

  analytics_engineer: {
    title: 'Analytics Engineer',
    description: 'Bridge data engineering and business intelligence by modeling clean, tested, documented, and production-ready data marts using dbt, SQL, and Git.',
    goal: {
      objective: 'Transform raw data lakehouse tables into clean, tested, and reliable business-ready data models that power company-wide decision making.',
      salary: '$85,000 - $145,000 / yr (₹6 - ₹22 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 6, max: 22, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Analytics Engineer', 'dbt Specialist', 'Data Modeling Engineer'],
      career_pillars: ['dbt Transformation Architecture', 'Dimensional Data Modeling & Semantic Layers', 'Data Quality Testing & CI/CD for Data']
    },
    learn: {
      summary: 'Master advanced analytical SQL (Window functions, CTEs), dbt Core/Cloud modeling, version-controlled data pipelines, semantic layers, and automated schema testing.',
      key_competencies: ['Advanced Analytical SQL Mastery', 'dbt (Data Build Tool) Modeling, Macros & Packages', 'Dimensional Modeling (Facts, Dimensions, One-Big-Table)', 'Data Testing (Singular & Generic Tests)', 'Semantic Layer Metric Definitions'],
      prerequisites: ['Strong SQL skills', 'Basic Git version control', 'Experience with business metrics']
    },
    boost: {
      capstone_projects: [
        { title: 'Production dbt Analytics Warehouse with CI/CD', tech_stack: ['dbt Core', 'Snowflake/BigQuery', 'GitHub Actions', 'SQLFluff'], description: 'Build an enterprise dbt project with automated pull-request validation, documentation generation, and production data testing.' }
      ],
      certifications: ['dbt Developer Certified Practitioner'],
      interview_focus: ['dbt Incremental Strategy (merge vs delete+insert)', 'Slowly Changing Dimensions (SCD Type 1 vs Type 2)', 'Data Warehouse Performance & Clustering Keys', 'Semantic Layer Consistency']
    }
  },

  data_analyst: {
    title: 'Data Analyst',
    description: 'Transform raw corporate data into actionable business intelligence, interactive executive dashboards, and statistical decision frameworks.',
    goal: {
      objective: 'Empower leadership and product teams with actionable insights, interactive visual reports, and data-backed business recommendations.',
      salary: '$60,000 - $105,000 / yr (₹4.5 - ₹15 LPA)',
      salary_range: { usd: { min: 60000, max: 105000, period: 'yr' }, inr_lpa: { min: 4.5, max: 15, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['Data Analyst', 'Business Intelligence Analyst', 'Product Analyst', 'Operations Data Analyst'],
      career_pillars: ['SQL Querying & Aggregation', 'Interactive BI Dashboards (Tableau/Power BI)', 'Business Metric KPI Formulation & Storytelling']
    },
    learn: {
      summary: 'Master intermediate to advanced SQL, Power BI / Tableau dashboard engineering, Excel financial modeling, basic Python data wrangling, and metric storytelling.',
      key_competencies: ['Complex SQL (Joins, Window Functions, Subqueries)', 'Power BI (DAX, Data Modeling) & Tableau', 'Advanced Excel (VLOOKUP, Pivot Tables, Power Query)', 'Exploratory Data Analysis with Python (Pandas/Seaborn)', 'Business Metric Definition (CAC, LTV, Retention, Funnels)'],
      prerequisites: ['Basic math and spreadsheet familiarity', 'Logical reasoning', 'Curiosity about business operations']
    },
    boost: {
      capstone_projects: [
        { title: 'Executive SaaS Growth & Cohort Retention Dashboard', tech_stack: ['SQL', 'Power BI/Tableau', 'Excel', 'Python'], description: 'Build an interactive executive cockpit analyzing user acquisition funnels, cohort retention curves, and monthly recurring revenue (MRR).' }
      ],
      certifications: ['Google Data Analytics Professional Certificate', 'Microsoft Certified: Power BI Data Analyst Associate (PL-300)'],
      interview_focus: ['SQL Window Functions (RANK, DENSE_RANK, LEAD/LAG)', 'Cohort Retention Matrix Analysis', 'Resolving Discrepant Business Metrics', 'Effective Stakeholder Presentation of Data Insights']
    }
  },

  bi_developer: {
    title: 'BI Developer',
    description: 'Engineer enterprise business intelligence architectures, semantic tabular models, scalable data warehouses, and automated self-service analytics.',
    goal: {
      objective: 'Design, optimize, and maintain scalable enterprise business intelligence models and self-service analytics infrastructure across the company.',
      salary: '$75,000 - $130,000 / yr (₹5.5 - ₹18 LPA)',
      salary_range: { usd: { min: 75000, max: 130000, period: 'yr' }, inr_lpa: { min: 5.5, max: 18, period: 'lpa' } },
      experience_level: 'Entry to Senior (0 - 5+ Years)',
      target_roles: ['BI Developer', 'Power BI Specialist', 'Enterprise Reporting Engineer'],
      career_pillars: ['Tabular Data Modeling & DAX', 'Data Warehousing & ETL Integration', 'Enterprise Security & Row-Level Security (RLS)']
    },
    learn: {
      summary: 'Master Power BI, complex DAX calculations, Tabular Editor, Star Schemas, SSIS/ADF data pipelines, Row-Level Security, and enterprise BI deployment pipelines.',
      key_competencies: ['Advanced DAX (Calculate, Time Intelligence, Iterators)', 'Star Schema Modeling & Relational Cardinality', 'ETL Data Transformation (Power Query M / Azure Data Factory)', 'Row-Level Security (RLS) & Workspace Management', 'Tabular Model Optimization & VertiPaq Engine Tuning'],
      prerequisites: ['Solid SQL foundations', 'Experience with business data and spreadsheets', 'Basic data modeling concepts']
    },
    boost: {
      capstone_projects: [
        { title: 'Enterprise Supply Chain & Inventory Optimization Suite', tech_stack: ['Power BI', 'DAX', 'SQL Server', 'Power Query'], description: 'Build an enterprise inventory management model supporting dynamic currency conversion, safety stock warnings, and automated refresh schedules.' }
      ],
      certifications: ['Microsoft Certified: Power BI Data Analyst Associate (PL-300)'],
      interview_focus: ['DAX Evaluation Context (Row vs Filter Context)', 'Star Schema vs Flat Table Performance in VertiPaq', 'Row-Level Security (RLS) Configuration Strategies', 'Incremental Refresh in Power BI Service']
    }
  },

  data_visualization_specialist: {
    title: 'Data Visualization Specialist',
    description: 'Craft custom, interactive data stories, high-performance graphic visualizers, and data art using D3.js, Observable, and modern web graphic standards.',
    goal: {
      objective: 'Translate complex datasets into intuitive, beautiful, and interactive visual narratives and bespoke analytical interfaces.',
      salary: '$80,000 - $140,000 / yr (₹6 - ₹20 LPA)',
      salary_range: { usd: { min: 80000, max: 140000, period: 'yr' }, inr_lpa: { min: 6, max: 20, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Data Visualization Engineer', 'Information Designer', 'Interactive Graphics Developer'],
      career_pillars: ['D3.js DOM & Canvas Manipulation', 'Information Architecture & Visual Encoding', 'Web Performance with Canvas / WebGL']
    },
    learn: {
      summary: 'Master D3.js (scales, axes, layouts, transitions), SVG/Canvas rendering, Vega-Lite, Mapbox GL geographic mapping, and React data visualization components.',
      key_competencies: ['D3.js Core (Selections, Data Binding, Enter/Update/Exit)', 'SVG, HTML5 Canvas & WebGL Rendering', 'Perceptual Design Principles & Color Palettes', 'Geospatial Mapping with Mapbox & GeoJSON', 'Integration with React/Vue Frontends'],
      prerequisites: ['Solid JavaScript and SVG/CSS knowledge', 'Familiarity with tabular datasets (JSON/CSV)', 'Aesthetic eye for typography and color']
    },
    boost: {
      capstone_projects: [
        { title: 'Interactive Climate Change & Global Emissions Globe', tech_stack: ['D3.js', 'Three.js', 'React', 'GeoJSON'], description: 'Build a 3D interactive web globe visualizing century-long climate anomalies and regional emission trajectories.' }
      ],
      interview_focus: ['D3.js Join Pattern & Life Cycle Mechanics', 'SVG vs HTML5 Canvas vs WebGL Performance Thresholds', 'Color Accessibility (Colorblind-Safe Palettes)', 'Data Densification & Responsive Layout Resizing']
    }
  },

  data_governance_specialist: {
    title: 'Data Governance Specialist',
    description: 'Ensure enterprise data integrity, regulatory compliance (GDPR, HIPAA), data lineage, cataloging, and corporate metadata management.',
    goal: {
      objective: 'Establish enterprise policies, lineage tracking, access guardrails, and quality frameworks that secure and elevate corporate data assets.',
      salary: '$85,000 - $145,000 / yr (₹6.5 - ₹22 LPA)',
      salary_range: { usd: { min: 85000, max: 145000, period: 'yr' }, inr_lpa: { min: 6.5, max: 22, period: 'lpa' } },
      experience_level: 'Mid to Senior (2 - 6+ Years)',
      target_roles: ['Data Governance Manager', 'Data Steward', 'Data Privacy & Compliance Specialist'],
      career_pillars: ['Data Catalogs & Metadata Governance', 'Data Privacy Laws (GDPR, CCPA, HIPAA)', 'Data Lineage & Master Data Management']
    },
    learn: {
      summary: 'Master data catalog platforms (Collibra, Atlan, Alation), automated data lineage, data quality dimensions, GDPR/CCPA privacy standards, and master data management.',
      key_competencies: ['Enterprise Data Catalogs & Business Glossaries', 'Automated Data Lineage & Impact Analysis', 'Data Quality Frameworks (Great Expectations)', 'Regulatory Compliance (GDPR, CCPA, HIPAA)', 'Access Control Policies & Data Masking'],
      prerequisites: ['Understanding of relational databases and SQL', 'Familiarity with enterprise privacy laws', 'Strong documentation and communication skills']
    },
    boost: {
      capstone_projects: [
        { title: 'Enterprise Automated Data Quality & PII Audit Framework', tech_stack: ['Python', 'Great Expectations', 'SQL', 'Atlan/OpenMetadata'], description: 'Deploy an automated data governance scanner that flags unencrypted PII columns and monitors data quality SLAs across warehouses.' }
      ],
      certifications: ['DAMA Certified Data Management Professional (CDMP)'],
      interview_focus: ['Six Dimensions of Data Quality', 'Data Lineage Architecture (Column-Level vs Table-Level)', 'Implementing PII Masking without Breaking Analytics', 'Role of Data Stewards vs Data Custodians']
    }
  },

  geospatial_data_scientist: {
    title: 'Geospatial Data Scientist',
    description: 'Analyze satellite imagery, geographic information systems (GIS), spatial point patterns, and remote sensing telemetry with Python and spatial databases.',
    goal: {
      objective: 'Extract predictive geospatial intelligence from satellite imagery, urban mobility patterns, and environmental sensor networks.',
      salary: '$90,000 - $155,000 / yr (₹7 - ₹24 LPA)',
      salary_range: { usd: { min: 90000, max: 155000, period: 'yr' }, inr_lpa: { min: 7, max: 24, period: 'lpa' } },
      experience_level: 'Junior to Senior (1 - 5+ Years)',
      target_roles: ['Geospatial Data Scientist', 'GIS Machine Learning Specialist', 'Remote Sensing Analyst'],
      career_pillars: ['Spatial Vector & Raster Processing', 'PostGIS & Spatial SQL', 'Satellite Imagery & Deep Learning (U-Net)']
    },
    learn: {
      summary: 'Master spatial libraries (GeoPandas, Shapely, Rasterio, GDAL), PostGIS spatial indexing (R-Tree), satellite remote sensing (Sentinel, Landsat), and spatial ML.',
      key_competencies: ['GeoPandas, Shapely & PyProj Coordinate Systems', 'PostGIS Spatial Queries & Spatial Indexing', 'Raster Data Processing with Rasterio & GDAL', 'Satellite Image Segmentation (Deep Learning U-Net)', 'Web Mapping with Mapbox GL & Leaflet'],
      prerequisites: ['Python proficiency and NumPy/Pandas', 'Basic understanding of cartography and coordinates (CRS)', 'Introductory machine learning']
    },
    boost: {
      capstone_projects: [
        { title: 'Satellite-Based Urban Deforestation & Growth Detector', tech_stack: ['Python', 'Rasterio', 'GeoPandas', 'PyTorch', 'Sentinel-2 API'], description: 'Build an AI pipeline calculating NDVI indices and classifying urban sprawl patterns from multi-spectral satellite imagery.' }
      ],
      certifications: ['GISP (Certified GIS Professional)'],
      interview_focus: ['Coordinate Reference Systems (CRS) & Projections (EPSG:4320 vs EPSG:3857)', 'Spatial Indexing Mechanics (R-Tree / GiST in PostGIS)', 'Raster vs Vector Processing Tradeoffs', 'Handling Cloud Occlusion in Satellite Imagery']
    }
  }
};

module.exports = { PART2_CATALOG };
