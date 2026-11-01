/**
 * Runs the process-kill test: npm run kill-test -- --iterations 1000 --seed 42
 * Prints every failure with its iteration number. Exits 1 if any iteration failed.
 */
import { runKillIteration, seededRandom } from './kill-harness';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const iterations = Number(option('--iterations') ?? 1000);
const seed = Number(option('--seed') ?? Date.now() % 4294967296);
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('--iterations must be a positive integer');

const random = seededRandom(seed);
let failed = 0;
let tornTails = 0;
let acknowledged = 0;
const started = Date.now();

for (let i = 1; i <= iterations; i += 1) {
  const outcome = await runKillIteration(random);
  acknowledged += outcome.acknowledged;
  if (outcome.tornTail) tornTails += 1;
  if (outcome.failures.length > 0) {
    failed += 1;
    console.log(`iteration ${i}: ${outcome.failures.join('; ')}`);
  }
  if (i % 100 === 0) console.log(`${i} of ${iterations} kills checked`);
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `kill test: ${iterations} kills in ${seconds} s (seed ${seed}); ${acknowledged} acknowledged writes; ` +
    `${tornTails} interrupted final lines repaired; ${failed} failed`,
);
process.exitCode = failed === 0 ? 0 : 1;
