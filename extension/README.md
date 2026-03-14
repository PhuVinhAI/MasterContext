# AI Studio Archiver - Chrome Extension

Chrome extension để export lịch sử chat từ Google AI Studio và tự động hóa việc cập nhật mã nguồn (Auto-Kilo).

## Features

- 🔄 Tự động capture Drive API token
- 📝 Export chat sang Markdown hoặc ZIP
- 🧠 Hỗ trợ export thinking process
- 🖼️ Download ảnh và PDF từ Drive
- ✏️ Chỉnh sửa và xóa turns trước khi export
- 🤖 **Auto-Watch Kilo:** Tự động phát hiện AI trả lời xong, bóc tách `SEARCH/REPLACE` block và gửi cho Kilo CLI chạy ngầm.
- 🔔 **In-App Toast Notifications:** Thông báo trạng thái xử lý trực tiếp trên giao diện AI Studio để không bị chặn bởi chế độ Do Not Disturb của HĐH.

## Development

```bash
# Install dependencies
npm install

# Dev mode với hot reload
npm run dev

# Khởi chạy Local Server kết nối với Kilo CLI (Port 9999)
npm run server

# Build extension
npm run build

# Lint
npm run lint
```

## Hướng dẫn cài đặt Extension (Dành cho người dùng)
Bạn không cần build code nếu chỉ muốn sử dụng.
1. Tải bản release mới nhất (`.zip`) tại: [GitHub Releases - PhuVinhAI/aiggstudioHistory](https://github.com/PhuVinhAI/aiggstudioHistory/releases)
2. Giải nén file `.zip` vừa tải.
3. Mở trình duyệt Chrome, truy cập vào `chrome://extensions/`
4. Bật **"Developer mode"** (Chế độ dành cho nhà phát triển) ở góc phải trên cùng.
5. Click **"Load unpacked"** (Tải tiện ích đã giải nén) và chọn thư mục vừa giải nén.

## Hướng dẫn sử dụng tính năng Auto-Kilo (Dành cho Coder)
Để Extension có thể điều khiển Kilo CLI trên máy của bạn và sửa code tự động, bạn cần khởi chạy Server cầu nối ở chính thư mục dự án bạn đang làm việc.

**Cài đặt gói server toàn cục (Global):**
```bash
npm install -g ai-studio-archiver
```

**Khởi chạy server ở bất kỳ dự án nào:**
Mở Terminal tại thư mục code bạn muốn làm việc và gõ:
```bash
ai-kilo-server
```
*(Server sẽ tự động tìm file `.gitignore` của dự án và loại trừ thư mục tạm để đảm bảo an toàn).*

**Các bước còn lại:**
1. Mở Popup của Extension trên trình duyệt và bật tính năng **"Auto-Watch Kilo"**.
2. Yêu cầu AI (trong Google AI Studio) sinh code theo chuẩn block `<<<START OF DIFF>>>`.
3. Ngay khi AI trả lời xong, Extension sẽ tự báo cho Server cập nhật mã nguồn trực tiếp vào máy bạn.

## Dành cho nhà phát triển (Development)
Nếu bạn muốn chỉnh sửa Extension này:
1. Build extension: `npm run build`
2. Load thư mục `dist/` vào Chrome như hướng dẫn ở trên.

## Tech Stack

- TypeScript
- React 19
- Vite
- Tailwind CSS 4
- shadcn/ui
- Zustand (state management)
- JSZip (export ZIP)
