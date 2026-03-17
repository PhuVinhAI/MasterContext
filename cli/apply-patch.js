#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const normalizeLineEndings = (str) => str.replace(/\r\n|\r/g, '\n');

function parsePatchFile(patchFilePath) {
  if (!fs.existsSync(patchFilePath)) {
    console.error(`\x1b[31m[LỖI] Không tìm thấy file patch tại: ${patchFilePath}\x1b[0m`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(patchFilePath, 'utf8');
  const content = normalizeLineEndings(rawContent);
  const lines = content.split('\n');

  const operations = []; 
  
  let currentOp = null;
  let state = 'IDLE'; // IDLE, SEARCH, REPLACE, CONTENT
  let searchBlock = [];
  let replaceBlock = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fileMatch = line.match(/^#\s*File:\s*(.+)$/i);
    const createMatch = line.match(/^#\s*Create:\s*(.+)$/i);
    const deleteMatch = line.match(/^#\s*Delete:\s*(.+)$/i);
    const renameMatch = line.match(/^#\s*Rename:\s*(.+?)\s*->\s*(.+)$/i);
    const mkdirMatch = line.match(/^#\s*Mkdir:\s*(.+)$/i);

    if (fileMatch) {
      currentOp = { type: 'MODIFY', file: fileMatch[1].trim(), patches: [] };
      operations.push(currentOp);
      state = 'IDLE';
      continue;
    }
    if (createMatch) {
      currentOp = { type: 'CREATE', file: createMatch[1].trim(), content: [] };
      operations.push(currentOp);
      state = 'IDLE';
      continue;
    }
    if (deleteMatch) {
      operations.push({ type: 'DELETE', file: deleteMatch[1].trim() });
      currentOp = null;
      state = 'IDLE';
      continue;
    }
    if (renameMatch) {
      operations.push({ type: 'RENAME', oldFile: renameMatch[1].trim(), newFile: renameMatch[2].trim() });
      currentOp = null;
      state = 'IDLE';
      continue;
    }
    if (mkdirMatch) {
      operations.push({ type: 'MKDIR', file: mkdirMatch[1].trim() });
      currentOp = null;
      state = 'IDLE';
      continue;
    }

    if (line.match(/^<{7}\s*SEARCH/) && currentOp && currentOp.type === 'MODIFY') {
      state = 'SEARCH';
      searchBlock = [];
      continue;
    }

    if (line.match(/^={7}/) && state === 'SEARCH') {
      state = 'REPLACE';
      replaceBlock = [];
      continue;
    }

    if (line.match(/^>{7}\s*REPLACE/) && state === 'REPLACE') {
      state = 'IDLE';
      currentOp.patches.push({
        search: searchBlock.join('\n'),
        replace: replaceBlock.join('\n')
      });
      continue;
    }

    if (line.match(/^<{7}\s*CONTENT/) && currentOp && currentOp.type === 'CREATE') {
      state = 'CONTENT';
      continue;
    }

    if (line.match(/^>{7}\s*END/) && state === 'CONTENT') {
      state = 'IDLE';
      continue;
    }

    if (state === 'SEARCH') searchBlock.push(line);
    if (state === 'REPLACE') replaceBlock.push(line);
    if (state === 'CONTENT' && currentOp && currentOp.type === 'CREATE') currentOp.content.push(line);
  }

  return operations;
}

function applyOperations(operations) {
  let totalFilesUpdated = 0;
  let totalFilesCreated = 0;
  let totalFilesDeleted = 0;
  let totalFilesRenamed = 0;
  let totalDirsCreated = 0;
  let totalPatchesApplied = 0;
  let totalPatchesFailed = 0;
  let totalOpsFailed = 0;

  for (const op of operations) {
    try {
      if (op.type === 'MKDIR') {
        const absolutePath = path.resolve(process.cwd(), op.file);
        fs.mkdirSync(absolutePath, { recursive: true });
        console.log(`\x1b[32m[THÀNH CÔNG] Đã tạo thư mục: ${op.file}\x1b[0m`);
        totalDirsCreated++;
      } else if (op.type === 'DELETE') {
        const absolutePath = path.resolve(process.cwd(), op.file);
        if (fs.existsSync(absolutePath)) {
          fs.rmSync(absolutePath, { recursive: true, force: true });
          console.log(`\x1b[32m[THÀNH CÔNG] Đã xóa: ${op.file}\x1b[0m`);
          totalFilesDeleted++;
        } else {
          console.log(`\x1b[33m[BỎ QUA] Không tìm thấy để xóa: ${op.file}\x1b[0m`);
        }
      } else if (op.type === 'RENAME') {
        const oldPath = path.resolve(process.cwd(), op.oldFile);
        const newPath = path.resolve(process.cwd(), op.newFile);
        if (fs.existsSync(oldPath)) {
          fs.mkdirSync(path.dirname(newPath), { recursive: true });
          fs.renameSync(oldPath, newPath);
          console.log(`\x1b[32m[THÀNH CÔNG] Đã đổi tên: ${op.oldFile} -> ${op.newFile}\x1b[0m`);
          totalFilesRenamed++;
        } else {
          console.error(`\x1b[31m[LỖI] Không tìm thấy file gốc để đổi tên: ${op.oldFile}\x1b[0m`);
          totalOpsFailed++;
        }
      } else if (op.type === 'CREATE') {
        const absolutePath = path.resolve(process.cwd(), op.file);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, op.content.join('\n'), 'utf8');
        console.log(`\x1b[32m[THÀNH CÔNG] Đã tạo file: ${op.file}\x1b[0m`);
        totalFilesCreated++;
      } else if (op.type === 'MODIFY') {
        const absolutePath = path.resolve(process.cwd(), op.file);
        if (!fs.existsSync(absolutePath)) {
          console.error(`\x1b[31m[LỖI] File không tồn tại để sửa: ${op.file}\x1b[0m`);
          totalPatchesFailed += op.patches.length;
          totalOpsFailed++;
          continue;
        }

        let fileContent = normalizeLineEndings(fs.readFileSync(absolutePath, 'utf8'));
        let appliedInThisFile = 0;

        for (const patch of op.patches) {
          if (fileContent.includes(patch.search)) {
            fileContent = fileContent.replace(patch.search, patch.replace);
            appliedInThisFile++;
            totalPatchesApplied++;
          } else {
            console.error(`\x1b[31m[LỖI SO KHỚP] Không tìm thấy đoạn SEARCH trong file: ${op.file}\x1b[0m`);
            console.error(`\x1b[90m--- NỘI DUNG TÌM KIẾM ---\n${patch.search}\n-------------------------\x1b[0m`);
            totalPatchesFailed++;
          }
        }

        if (appliedInThisFile > 0) {
          fs.writeFileSync(absolutePath, fileContent, 'utf8');
          console.log(`\x1b[32m[THÀNH CÔNG] Đã cập nhật ${op.file} (${appliedInThisFile} thay đổi)\x1b[0m`);
          totalFilesUpdated++;
        }
      }
    } catch (err) {
      console.error(`\x1b[31m[LỖI] Lỗi khi thực thi ${op.type} trên ${op.file || op.oldFile}: ${err.message}\x1b[0m`);
      totalOpsFailed++;
    }
  }

  console.log(`\n\x1b[36m=== TỔNG KẾT ===\x1b[0m`);
  console.log(`Tạo mới  : \x1b[32m${totalFilesCreated} files\x1b[0m, \x1b[32m${totalDirsCreated} thư mục\x1b[0m`);
  console.log(`Cập nhật : \x1b[32m${totalFilesUpdated} files\x1b[0m (${totalPatchesApplied} patch thành công)`);
  console.log(`Đổi tên  : \x1b[32m${totalFilesRenamed} files\x1b[0m`);
  console.log(`Đã xóa   : \x1b[31m${totalFilesDeleted} mục\x1b[0m`);
  
  if (totalPatchesFailed > 0 || totalOpsFailed > 0) {
    console.log(`\n\x1b[31mCẢNH BÁO LỖI:\x1b[0m`);
    if (totalPatchesFailed > 0) console.log(`- Patch thất bại : ${totalPatchesFailed} (Kiểm tra lại format block SEARCH)`);
    if (totalOpsFailed > 0) console.log(`- Tác vụ thất bại: ${totalOpsFailed}`);
  }
}

const patchFileArg = process.argv[2] || 'patch.txt';
console.log(`\x1b[36mĐang đọc hướng dẫn cập nhật từ: ${patchFileArg}\x1b[0m\n`);

const operations = parsePatchFile(patchFileArg);

if (operations.length === 0) {
  console.log(`\x1b[33mKhông tìm thấy block thay đổi nào hợp lệ trong file.\x1b[0m`);
  process.exit(0);
}

applyOperations(operations);
