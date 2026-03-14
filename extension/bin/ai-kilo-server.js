#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Kích hoạt tsx để chạy trực tiếp mã TypeScript của Server
const serverPath = path.join(__dirname, '../server/index.ts');

console.log('Khởi chạy AI Studio Kilo Server...');

const child = spawn('npx', ['tsx', serverPath], {
  stdio: 'inherit',
  shell: true
});

child.on('error', (err) => {
  console.error('[LỖI] Không thể khởi chạy server:', err);
});
