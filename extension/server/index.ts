import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/kilo', (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Vui lòng cung cấp nội dung prompt' });
  }

  console.log(`\n=================================================`);
  console.log(`🤖 KILO CLI ĐƯỢC GỌI TỪ EXTENSION`);
  console.log(`=================================================`);

  const isWindows = os.platform() === 'win32';
  const command = isWindows ? 'kilo.cmd' : 'kilo';

  // Lưu prompt (chứa code diff nhiều dòng) vào thư mục ẩn .kilo-tasks
  const tasksDir = path.join(process.cwd(), '.kilo-tasks');
  const tempFileName = `task_${Date.now()}.txt`;
  const tempFilePath = path.join(tasksDir, tempFileName);

  try {
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }
    fs.writeFileSync(tempFilePath, prompt, 'utf8');
    console.log(`[THÔNG BÁO] Đã lưu nội dung task vào file: .kilo-tasks/${tempFileName}`);
  } catch (err) {
    console.error('Lỗi tạo file tạm:', err);
    return res.status(500).json({ error: 'Không thể tạo file tạm cho Kilo' });
  }

  // Kilo là AI nên ta chỉ cần bảo nó đọc file là nó sẽ tự động lấy nhiệm vụ (SEARCH/REPLACE)
  const shortPrompt = `Vui lòng đọc và áp dụng chính xác các thay đổi mã nguồn từ file sau: ${tempFilePath}`;

  let kiloProcess;

  if (isWindows) {
    // Đã xóa --print-logs để Kilo chạy sạch sẽ, không in log hệ thống
    const commandString = `kilo run --auto "${shortPrompt}"`;
    kiloProcess = spawn('cmd.exe', ['/c', commandString], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false
    });
  } else {
    const args = ['run', '--auto', shortPrompt];
    kiloProcess = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false
    });
  }

  let responded = false;

  kiloProcess.on('error', (err) => {
    console.error(`\n[LỖI] Không thể khởi chạy Kilo CLI:`, err);
    if (!responded) {
      responded = true;
      res.status(500).json({ error: 'Không thể khởi chạy Kilo CLI' });
    }
  });

  kiloProcess.on('close', (code) => {
    console.log(`\n[THÔNG BÁO] Kilo CLI đã hoàn thành với mã thoát (exit code): ${code}\n`);
    // Dọn dẹp file tạm
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[THÔNG BÁO] Đã dọn dẹp file tạm: .kilo-tasks/${tempFileName}`);
      }
    } catch (e) {
      console.warn(`[CẢNH BÁO] Không thể xóa file tạm: .kilo-tasks/${tempFileName}`);
    }

    // Đợi Kilo xử lý xong mới trả HTTP Response về cho Extension
    if (!responded) {
      responded = true;
      if (code === 0) {
        res.json({ success: true, message: 'Kilo CLI đã thực thi xong nhiệm vụ' });
      } else {
        res.status(500).json({ error: `Kilo CLI kết thúc với lỗi (code: ${code})` });
      }
    }
  });
});

app.listen(9999, () => {
  console.log('🚀 Server kết nối Kilo CLI đang chạy tại: http://localhost:9999');
  
  // Tự động tìm và thêm .kilo-tasks vào .gitignore của dự án hiện tại
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      if (!content.includes('.kilo-tasks')) {
        fs.appendFileSync(gitignorePath, '\n# Bỏ qua thư mục tạm của Kilo Auto-Watch\n.kilo-tasks\n');
        console.log('🛡️  [SETUP] Đã tự động thêm ".kilo-tasks" vào file .gitignore');
      }
    } catch (err) {
      console.warn('⚠️  [CẢNH BÁO] Không thể đọc hoặc ghi file .gitignore', err);
    }
  } else {
    // Nếu chưa có file .gitignore thì tạo mới
    try {
      fs.writeFileSync(gitignorePath, '# Bỏ qua thư mục tạm của Kilo Auto-Watch\n.kilo-tasks\n', 'utf8');
      console.log('🛡️  [SETUP] Đã tự động tạo file .gitignore và bỏ qua ".kilo-tasks"');
    } catch (err) {
      console.warn('⚠️  [CẢNH BÁO] Không thể tạo file .gitignore', err);
    }
  }

  console.log('⏳ Đang chờ nhiệm vụ từ Extension...');
});
