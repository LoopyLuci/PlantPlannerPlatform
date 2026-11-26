import { createContext } from '@ppp/services';
import { Watchdog } from '@ppp/services';
import { createAppServer } from './server';
import { join } from 'node:path';

const host = process.env.PPP_HOST ?? '127.0.0.1';
const port = Number(process.env.PPP_PORT ?? 4010);

const ctx = await createContext();
const server = createAppServer({ ctx });

// The durability watchdog is a background process separate from dispatch.
// It never repairs data or applies a human decision (invariant I3): each
// probe reports a tri-state status and a graduated list of advisory actions,
// and reports to the data-durability sidecar and any configured beacon.
if (process.env.PPP_WATCHDOG !== '0') {
  const watchdog = new Watchdog({
    store: ctx.store,
    version: {
      modelVersion: 'none',
      graphVersion: ctx.kg.graphVersion,
      ruleConfigVersion: ctx.rules.version,
    },
    beaconDir: join(ctx.dataDir, 'durability'),
    beaconUrl: process.env.PPP_DURABILITY_BEACON_URL,
    intervalMs: Number(process.env.PPP_WATCHDOG_INTERVAL_MS ?? 30_000),
  });
  const stopWatchdog = watchdog.start();
  server.once('close', () => {
    stopWatchdog();
  });
  console.log(`Plant Planner Platform watchdog: ${watchdog.intervalMs} ms interval, ${watchdog.beaconDir ? 'sidecar enabled' : 'no beacon'}`);
}

server.listen(port, host, () => {
  console.log(`Plant Planner Platform: http://${host}:${port}  (data: ${ctx.dataDir})`);
});
