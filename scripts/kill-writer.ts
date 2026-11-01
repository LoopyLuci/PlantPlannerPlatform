/**
 * Child process for the kill test. It appends placements to one design as fast
 * as it can, and prints each sequence number only after the append has been
 * fsynced. The parent kills it at a random moment (kill-harness.ts).
 */
import { DesignStore } from '@ppp/store';

const [dataDir, designId] = process.argv.slice(2);
const store = new DesignStore(dataDir);
const actor = { id: 'kill-writer', interface: 'script' };

for (let k = 0; ; k += 1) {
  await store.append(designId, {
    type: 'PlacementAdded',
    actor,
    idempotency_key: `kill-${k}`,
    payload: {
      placement: {
        id: `p_${k}`,
        speciesUrn: 'urn:ppp:species:alpha-one',
        x: ((k * 7) % 180) * 0.05,
        y: ((k * 11) % 180) * 0.05,
        footprintM: 0.3,
        pinned: false,
      },
    },
  });
  // Wait for the line to leave this process, so an acknowledgement is never lost on a pipe.
  await new Promise<void>((resolve) => process.stdout.write(`${k}\n`, () => resolve()));
}
