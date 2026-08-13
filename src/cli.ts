import process from 'node:process';
import { run } from './main.js';

const code = await run(process.argv.slice(2), {
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  cwd: process.cwd(),
  env: process.env,
});

process.exit(code);
