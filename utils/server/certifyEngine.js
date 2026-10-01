import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';

/**
 * Normalizes roadmap tree to calculate the total countable nodes.
 */
function flattenTree(nodes) {
  const result = [];
  function walk(list) {
    list.forEach((n) => {
      if (n.countInProgress !== false) result.push(n);
      if (n.children?.length) walk(n.children);
    });
  }
  walk(nodes);
  return result;
}

function normalizeTopicNode(topic) {
  return {
    ...topic,
    tag: topic.tag || 'essential',
    resources: Array.isArray(topic.resources) ? topic.resources : [],
    children: Array.isArray(topic.children) ? topic.children.map(normalizeTopicNode) : [],
  };
}

function normalizeProjectNode(project, roadmapId, stage, index) {
  if (!project) return null;
  return {
    id: `${roadmapId}_stage_${stage.step || index + 1}_project`,
    name: `Project: ${project.title}`,
    icon: '🏆',
    tag: 'advanced',
    description: project.description || 'Build a portfolio-ready project for this stage.',
    resources: project.url ? [{ title: project.title, url: project.url, type: 'article' }] : [],
    children: [],
  };
}

function normalizeStageNode(stage, roadmapId, index) {
  const topics = Array.isArray(stage.topics) ? stage.topics.map(normalizeTopicNode) : [];
  const project = normalizeProjectNode(stage.project, roadmapId, stage, index);
  return {
    id: `${roadmapId}_stage_${stage.step || index + 1}`,
    name: stage.title,
    icon: stage.icon || '🎯',
    tag: 'essential',
    description: stage.description || `Complete the ${stage.title} branches before moving ahead.`,
    resources: [],
    children: project ? [...topics, project] : topics,
    countInProgress: false,
    unlockChildren: 'always',
  };
}

function normalizeRoadmapTree(roadmap) {
  if (roadmap.format === 'tree' && Array.isArray(roadmap.tree)) {
    return roadmap.tree.map(normalizeTopicNode);
  }
  if (Array.isArray(roadmap.stages)) {
    const roadmapId = roadmap.id || 'roadmap';
    return roadmap.stages.map((stage, index) => normalizeStageNode(stage, roadmapId, index));
  }
  return [];
}

/**
 * Fisher-Yates array shuffle.
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Load quiz question bank safely from disk.
 */
export async function loadQuizBank(slug) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const quizPath = path.join(process.cwd(), 'public', 'data', 'quizzes', `${cleanSlug}.json`);

  try {
    const fileContent = await fs.readFile(quizPath, 'utf8');
    const parsed = JSON.parse(fileContent);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Quiz question bank is empty or invalid.');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Load roadmap definition safely from disk.
 */
export async function loadRoadmapData(slug) {
  const cleanSlug = String(slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const roadmapPath = path.join(process.cwd(), 'public', 'data', 'roadmaps', `${cleanSlug}.json`);

  try {
    const fileContent = await fs.readFile(roadmapPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Verifies user eligibility before starting an exam:
 * 1. Has user already earned a certificate for this roadmap?
 * 2. Are attempt rate limits or cooldowns active?
 * 3. In production, has the user completed at least 60% of roadmap nodes?
 */
export async function verifyExamEligibility({ uid, slug, roadmapData, transaction }) {
  const db = getFirebaseAdminFirestore();
  const read = (ref) => transaction ? transaction.get(ref) : ref.get();
  if (!db) {
    throw new Error('Database service unavailable.');
  }

  // 1. Check if user already holds an active certificate for this roadmap
  const certsSnap = await read(db
    .collection('certificates')
    .where('uid', '==', uid)
    .where('roadmapSlug', '==', slug)
    .where('is_revoked', '==', false)
    .limit(1));

  if (!certsSnap.empty) {
    return {
      eligible: false,
      reason: 'ALREADY_CERTIFIED',
      error: 'You have already earned a verified certificate for this roadmap.',
      certId: certsSnap.docs[0].id,
    };
  }

  // 2. Check attempts and cooldown rules in Firestore
  const attemptsDoc = await read(db.collection('users').doc(uid).collection('quizAttempts').doc(slug));
  if (attemptsDoc.exists) {
    const data = attemptsDoc.data();
    const attempts = Array.isArray(data.attempts) ? data.attempts : [];
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const last24hAttempts = attempts.filter((t) => typeof t === 'number' && t > oneDayAgo);

    if (process.env.NODE_ENV !== 'development') {
      // Rule: Max 3 attempts in 24h
      if (last24hAttempts.length >= 3) {
        const oldest = Math.min(...last24hAttempts);
        const cooldownRemaining = Math.max(1, Math.ceil((oldest + 24 * 60 * 60 * 1000 - now) / 1000));
        return {
          eligible: false,
          reason: 'DAILY_LIMIT_EXCEEDED',
          error: 'Daily limit reached. You can only attempt the certification quiz 3 times per 24 hours.',
          cooldownRemaining,
        };
      }

      // Rule: 2 consecutive failures enforce 1-hour cooldown
      if (data.consecutiveFailures >= 2) {
        const cooldownUntil = data.cooldownUntil;
        if (Number.isFinite(cooldownUntil) && cooldownUntil > now) {
          const cooldownRemaining = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
          return {
            eligible: false,
            reason: 'COOLDOWN_ACTIVE',
            error: 'Study cooldown active. Please wait an hour to review materials before your final attempt.',
            cooldownRemaining,
          };
        }
      }
    }
  }

  // 3. Roadmap completion verification (>= 60% in production)
  if (process.env.NODE_ENV === 'production' && roadmapData) {
    const tree = normalizeRoadmapTree(roadmapData);
    const allNodes = flattenTree(tree);
    const totalNodes = allNodes.length;

    if (totalNodes > 0) {
      const progSnap = await read(db.collection('users').doc(uid).collection('roadmapProgress').doc(slug));
      if (!progSnap.exists) {
        return {
          eligible: false,
          reason: 'PROGRESS_INSUFFICIENT',
          error: 'You must complete at least 60% of the roadmap topics before taking the certification exam.',
          completionPercent: 0,
        };
      }

      const progData = progSnap.data();
      const completedNodeIds = Array.isArray(progData.completedNodeIds) ? progData.completedNodeIds : [];
      const validCompleted = allNodes.filter((n) => completedNodeIds.includes(n.id)).length;
      const completionPercent = Math.round((validCompleted / totalNodes) * 100);

      if (validCompleted / totalNodes < 0.6) {
        return {
          eligible: false,
          reason: 'PROGRESS_INSUFFICIENT',
          error: `Roadmap progress insufficient (${completionPercent}%). You must complete at least 60% of topics before qualifying for exam.`,
          completionPercent,
        };
      }
    }
  }

  return { eligible: true };
}

/**
 * Selects exactly 3 Easy, 5 Moderate, and 2 Hard questions from the bank.
 * Shuffles options dynamically and generates sanitized client questions (NO answers)
 * plus full server question records for authoritative grading.
 */
export function selectAndPrepareExamQuestions(questionBank) {
  const easy = questionBank.filter((q) => q.difficulty === 'easy');
  const moderate = questionBank.filter((q) => q.difficulty === 'moderate');
  const hard = questionBank.filter((q) => q.difficulty === 'hard');

  if (easy.length < 3 || moderate.length < 5 || hard.length < 2) {
    throw new Error('Question bank does not contain the required question distribution (3 easy, 5 moderate, 2 hard).');
  }

  const selectedEasy = shuffleArray(easy).slice(0, 3);
  const selectedMod = shuffleArray(moderate).slice(0, 5);
  const selectedHard = shuffleArray(hard).slice(0, 2);

  const selected = shuffleArray([...selectedEasy, ...selectedMod, ...selectedHard]);

  const serverQuestions = [];
  const clientQuestions = [];

  selected.forEach((q, index) => {
    const correctOptionText = q.options[q.correctIndex];
    const shuffledOptions = shuffleArray(q.options);
    const newCorrectIndex = shuffledOptions.indexOf(correctOptionText);

    // Full server record (stored in Firestore attempt doc)
    serverQuestions.push({
      index,
      question: q.question,
      options: shuffledOptions,
      correctIndex: newCorrectIndex,
      explanation: q.explanation || '',
      difficulty: q.difficulty,
    });

    // Sanitized client record (NO correctIndex, NO explanation)
    clientQuestions.push({
      index,
      question: q.question,
      options: shuffledOptions,
      difficulty: q.difficulty,
    });
  });

  return { serverQuestions, clientQuestions };
}

/**
 * Grades user-submitted answers authoritatively on the server.
 */
export function gradeExamAttempt(serverQuestions, clientAnswers) {
  let correctCount = 0;
  const review = [];

  serverQuestions.forEach((sq, idx) => {
    const userChoice = typeof clientAnswers[idx] === 'number' ? clientAnswers[idx] : -1;
    const isCorrect = userChoice === sq.correctIndex;

    if (isCorrect) {
      correctCount++;
    }

    review.push({
      index: idx,
      question: sq.question,
      options: sq.options,
      userChoice,
      correctIndex: sq.correctIndex,
      isCorrect,
      explanation: sq.explanation,
    });
  });

  const total = serverQuestions.length || 10;
  const score = Math.round((correctCount / total) * 100);
  const passed = score >= 70;

  return {
    score,
    passed,
    correctCount,
    total,
    review,
  };
}

/**
 * Generates a crypto-secure unique attempt ID.
 */
export function generateAttemptId() {
  const timestamp = Date.now().toString(36);
  const entropy = crypto.randomBytes(8).toString('hex');
  return `att_${timestamp}_${entropy}`;
}
