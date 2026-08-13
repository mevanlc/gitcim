import { run } from './main.js';

const code = await run(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  process.cwd(),
);

process.exit(code);
