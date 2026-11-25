import { execSync } from 'node:child_process';

function gitRev(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const now = new Date();

/** Real build metadata shown in the footer and the hero title block. */
export const buildInfo = {
  date: now.toISOString().slice(0, 10),
  year: now.getUTCFullYear(),
  rev: gitRev(),
};
