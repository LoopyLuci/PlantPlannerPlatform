import { describe, expect, it } from 'vitest';
import { runKillIteration, seededRandom } from '../../../scripts/kill-harness';

/**
 * A short version of the process-kill test (scripts/kill-run.ts runs the full
 * 1,000 kills). It runs in npm test so a regression in crash safety is caught
 * on every change.
 */
describe('crash safety under a process kill', () => {
  it('keeps every acknowledged write and no partial state across kills at random points', async () => {
    const random = seededRandom(20261101);
    for (let i = 0; i < 4; i += 1) {
      const outcome = await runKillIteration(random);
      expect(outcome.failures, `kill ${i + 1}`).toEqual([]);
      expect(outcome.acknowledged).toBeGreaterThan(0);
    }
  }, 120_000);
});
