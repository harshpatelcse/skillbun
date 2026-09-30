import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { getFirebaseAdminProjectId, getFirebaseAdminClientEmail, getFirebaseAdminPrivateKey } from '../utils/server/env.js';
import { reconcileCertificates } from '../utils/server/certificateReconciliation.mjs';

// Explicit project selection; no write/mint/delete mode exists.
const projectArg = process.argv.indexOf('--project');
const projectId = projectArg >= 0 ? process.argv[projectArg + 1] : '';
if (!process.argv.includes('--read-only') || !projectId || projectId !== getFirebaseAdminProjectId()) {
  console.error('Use --read-only --project <configured-project-id>. The target must match the configured Firebase project.');
  process.exitCode = 1;
} else {
  let app;
  let db;
  try {
    const clientEmail = getFirebaseAdminClientEmail();
    const privateKey = getFirebaseAdminPrivateKey();
    if (!clientEmail || !privateKey) throw new Error('MISSING_CREDENTIALS');
    app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, 'certificate-reconciliation');
    db = getFirestore(app);
    db.settings({ preferRest: true });
    const startedAt = new Date().toISOString();
    async function readMetadata(collection, fields) {
      const records = [];
      let cursor;
      while (true) {
        let query = db.collection(collection).orderBy(FieldPath.documentId()).select(...fields).limit(200);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        records.push(...snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        if (records.length > 50_000) throw new Error('READ_LIMIT_EXCEEDED');
        if (snapshot.size < 200) return records;
        cursor = snapshot.docs.at(-1).id;
      }
    }
    const [certificates, attempts, employees, deletions] = await Promise.all([
      readMetadata('certificates', ['uid', 'name', 'roadmapTitle', 'roadmapSlug', 'score', 'attemptId', 'cert_type', 'template_version', 'is_revoked', 'createdAt', 'employee_id', 'issued_by_admin']),
      readMetadata('examAttempts', ['uid', 'certName', 'roadmapTitle', 'roadmapSlug', 'score', 'status', 'passed', 'minted', 'certId']),
      readMetadata('employees', ['granted_credentials']),
      readMetadata('accountDeletions', ['status']),
    ]);
    const report = reconcileCertificates({ certificates, attempts, employees, deletions });
    // No personal values, student IDs or answer content are emitted.
    console.log(JSON.stringify({ projectId, startedAt, finishedAt: new Date().toISOString(), ...report }, null, 2));
    process.exitCode = report.findingCount ? 2 : 0;
  } catch (error) {
    console.error('Read-only reconciliation could not complete:', error?.code || 'READ_FAILED');
    process.exitCode = 1;
  } finally {
    await db?.terminate();
    if (app) await deleteApp(app);
  }
}
