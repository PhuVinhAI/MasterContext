import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const extDir = path.join(rootDir, 'extension');
const resDir = path.join(rootDir, 'resources');

console.log('=== PREPARING RESOURCES FOR MASTER CONTEXT ===');

// 1. Build extension
console.log('Building Chrome Extension...');
execSync('npm install', { cwd: extDir, stdio: 'inherit' });
execSync('npm run build', { cwd: extDir, stdio: 'inherit' });

// 2. Prepare resources folder
if (fs.existsSync(resDir)) {
  fs.rmSync(resDir, { recursive: true, force: true });
}
fs.mkdirSync(resDir);

// 3. Copy base config files
console.log('Copying base config files...');
fs.copyFileSync(path.join(extDir, 'apply.md'), path.join(resDir, 'apply.md'));
fs.copyFileSync(path.join(extDir, 'opencode.json'), path.join(resDir, 'opencode.json'));

// 4. Create README for user
const readmeContent = `
# Hướng dẫn cài đặt AI Studio Archiver Extension

1. Giải nén file "ai-studio-archiver.zip" ra một thư mục bất kỳ trên máy của bạn.
2. Mở trình duyệt Chrome, truy cập vào đường dẫn: chrome://extensions/
3. Bật "Developer mode" (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
4. Nhấn nút "Load unpacked" (Tải tiện ích đã giải nén).
5. Chọn thư mục vừa giải nén ở Bước 1.
6. Cài đặt hoàn tất! Quay lại ứng dụng Master Context để sử dụng tính năng Auto-Watch.
`;
fs.writeFileSync(path.join(resDir, 'HUONG_DAN_CAI_DAT.md'), readmeContent.trim());

// 5. Zip dist folder
console.log('Zipping extension dist folder...');
const output = fs.createWriteStream(path.join(resDir, 'ai-studio-archiver.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Extension zipped successfully: ${archive.pointer()} total bytes`);
  console.log('=== DONE PREPARING RESOURCES ===');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(path.join(extDir, 'dist'), false);
archive.finalize();
