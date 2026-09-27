/**
 * Prints a bcrypt hash for PASSWORD_HASH.
 *   npm run hash-password            (prompts, input hidden)
 *   echo -n 'secret' | npm run hash-password --silent
 */
import bcrypt from 'bcrypt';
import { createInterface } from 'node:readline';

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  out._writeToOutput = (s) => {
    if (!muted) out.output.write(s);
  };
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const password = await readHidden('Password: ');
if (password.length < 8) {
  console.error('Use at least 8 characters.');
  process.exit(1);
}
if (process.stdin.isTTY) {
  const again = await readHidden('Again: ');
  if (again !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}
const hash = await bcrypt.hash(password, 12);
console.log(`PASSWORD_HASH='${hash}'`);
