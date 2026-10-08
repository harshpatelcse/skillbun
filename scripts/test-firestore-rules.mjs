import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const workingDirectory = path.join(root, '.codex-tmp', 'firestore-rules');
mkdirSync(workingDirectory, { recursive: true });
const config = path.join(root, 'firebase.emulator.json');
// Only constant paths/arguments enter this shell command. A demo project cannot
// fall through to the production project configured in .firebaserc.
const command = `firebase emulators:exec --only firestore --project demo-skillbun-rules --config "${config}" "node --test ../../tests/firestore/securityRules.test.mjs"`;
const child = spawn(command, {
  cwd: workingDirectory,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    GCLOUD_PROJECT: 'demo-skillbun-rules',
    GOOGLE_CLOUD_PROJECT: 'demo-skillbun-rules',
  },
});
child.on('error', error => {
  console.error(`Unable to run Firebase CLI: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
