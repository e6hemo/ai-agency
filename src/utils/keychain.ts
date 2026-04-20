import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(currentDir, 'keychain-worker.mjs');

export function setSecretSync(account: string, secret: string): void {
  try {
    execFileSync(process.execPath, [WORKER_PATH, 'set', account, secret]);
  } catch (err) {
    console.error('Failed to save to keychain', err);
  }
}

export function getSecretSync(account: string): string | null {
  try {
    const output = execFileSync(process.execPath, [WORKER_PATH, 'get', account]);
    const val = output.toString();
    return val ? val : null;
  } catch (err) {
    return null; // maybe not found
  }
}

export function deleteSecretSync(account: string): void {
  try {
    execFileSync(process.execPath, [WORKER_PATH, 'delete', account]);
  } catch (err) {
    // ignore
  }
}
