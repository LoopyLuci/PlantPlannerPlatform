import { createContext } from '@ppp/services';
import { runCli } from './run';

const ctx = await createContext();
const code = await runCli(process.argv.slice(2), ctx, {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
process.exitCode = code;
