import { createContext } from '@ppp/services';
import { createAppServer } from './server';

const host = process.env.PPP_HOST ?? '127.0.0.1';
const port = Number(process.env.PPP_PORT ?? 4010);

const ctx = await createContext();
const server = createAppServer({ ctx });
server.listen(port, host, () => {
  console.log(`Plant Planner Platform: http://${host}:${port}  (data: ${ctx.dataDir})`);
});
