import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Starting bot via index.js wrapper...");

const bot = spawn('npx', ['tsx', 'src/bot.ts'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

bot.on('close', (code) => {
  console.log(`Bot process exited with code ${code}`);
});
