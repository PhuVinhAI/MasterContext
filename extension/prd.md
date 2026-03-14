# Product Requirements Document (PRD): AI Studio Chat Archiver

**Phiên bản:** 1.1  
**Trạng thái:** Draft  
**Framework đề xuất:** Vite + React + Tailwind CSS (Sử dụng `CRXJS` cho Manifest V3)  
**Thư viện lõi:** `JSZip` (đóng gói), `Lucide React` (icon), `chrome-storage-local`

---

## 1. Mục tiêu sản phẩm (Product Goals)
Tạo ra một công cụ giúp người dùng Google AI Studio trích xuất dữ liệu hội thoại một cách toàn vẹn. Công cụ này phải vượt qua rào cản của việc render HTML (vốn hay bị cắt xén) bằng cách đánh chặn dữ liệu thô (Base64) ngay khi người dùng tải file lên.

---

## 2. Đối tượng người dùng (User Personas)
*   **Lập trình viên:** Cần lưu lại các đoạn code phức tạp kèm tài liệu kỹ thuật.
*   **Nghiên cứu viên:** Lưu trữ các phiên làm việc dài với nhiều file PDF/Ảnh tham chiếu.

---

## 3. Yêu cầu chức năng (Functional Requirements)

### 3.1. Đánh chặn dữ liệu (Data Interception)
*   **REQ-01:** Extension phải tự động phát hiện request `POST` gửi tới `drive/v3/files`.
*   **REQ-02:** Bóc tách nội dung thô (Raw Body) của request để lấy chuỗi **Base64** của file Ảnh/PDF.
*   **REQ-03:** Lưu trữ tạm thời các chuỗi Base64 này vào `chrome.storage.local` theo cấu trúc: `filename` -> `{data, mimeType}`.
*   **REQ-04:** Không thực hiện OCR. Chỉ lưu trữ file gốc dưới dạng bitstream mã hóa.

### 3.2. Quét cấu trúc Chat (Chat DOM Scraping)
*   **REQ-05:** Phân loại lượt chat dựa trên thẻ `ms-chat-turn`.
*   **REQ-06:** Trích xuất text thuần từ `ms-text-chunk`.
*   **REQ-07:** Nhận diện các liên kết file trong hội thoại thông qua thẻ `ms-file-chunk`.

### 3.3. Xử lý đóng gói (Bundling Logic)
*   **REQ-08 (Nếu chỉ có Text):** Gộp toàn bộ Text/Code thành 1 file `.md` duy nhất.
*   **REQ-09 (Nếu có Media):** 
    *   Tạo file `history.md`.
    *   Tạo thư mục `assets/images/` và `assets/pdfs/`.
    *   Dùng `JSZip` nén toàn bộ thành file `.zip`.
*   **REQ-10 (Cấu hình Export):** Người dùng có thể bật/tắt (Toggle) việc bao gồm Ảnh hoặc PDF vào bản tải xuống thông qua Popup UI.

---

## 4. Kiến trúc kỹ thuật (Technical Architecture)

### 4.1. Framework & Công nghệ
*   **Build Tool:** `Vite` (cho tốc độ dev cực nhanh).
*   **Language:** `TypeScript` (đảm bảo type-safe cho dữ liệu Base64).
*   **Manifest:** V3 (Tuân thủ chính sách mới nhất của Chrome).
*   **Debugger API:** Sử dụng `chrome.debugger` để đọc Body của các request Multipart (Thứ mà `webRequest` thông thường không làm được).

### 4.2. Luồng dữ liệu (Data Pipeline)
1.  **Stage 1 (Intercept):** `Background Service Worker` gắn Debugger vào tab AI Studio -> Lọc request upload -> Parse Multipart -> Lưu Base64.
2.  **Stage 2 (UI Injection):** `Content Script` chèn một nút "Export Chat" vào thanh header của AI Studio.
3.  **Stage 3 (Assembly):** Khi nhấn Export, Extension lấy dữ liệu từ DOM + Dữ liệu từ Storage -> Chuyển Base64 thành Blob -> Đẩy vào `JSZip`.

---

## 5. Thiết kế giao diện (UI/UX)

### 5.1. Popup Extension
*   Hiển thị trạng thái: "Ready to Capture".
*   Danh sách file đã "bắt" được trong phiên hiện tại.
*   Checkbox: 
    *   [x] Include Images
    *   [x] Include PDFs
*   Nút: [Download Now]

### 5.2. Injected UI (Trong trang web)
*   Một icon nhỏ (hình Download) nằm cạnh nút "Share" mặc định của Google AI Studio.

---

## 6. Cấu trúc dữ liệu Export (Output Schema)

### Trường hợp 1: Export Zip (Có media)
```text
Archive_Name_YYYYMMDD.zip
├── chat_log.md
├── assets/
│   ├── images/
│   │   └── screenshot_1.png
│   └── documents/
│       └── report_final.pdf
```

### Trường hợp 2: Export MD (Chỉ text)
```markdown
# Lịch sử chat: [Tên sổ tay]

## User:
[Nội dung câu hỏi]
[Đã đính kèm: report_final.pdf - Không bao gồm trong bản tải này]

## Model:
[Nội dung trả lời]
```

---

## 7. Ràng buộc & Bảo mật (Constraints & Security)
*   **Privacy:** Tuyệt đối không gửi dữ liệu ra server ngoài. Mọi quá trình xử lý Base64 và Zip phải diễn ra 100% tại máy cục bộ (Client-side).
*   **Performance:** Tự động xóa dữ liệu trong `storage.local` sau 24h hoặc khi người dùng đóng tab để tránh chiếm dụng bộ nhớ.
*   **Debugger Notice:** Chấp nhận việc Chrome hiển thị thanh thông báo "Extension is debugging this browser" để đổi lấy khả năng đọc dữ liệu thô.

Chào bạn, đây là bản **PRD chi tiết nhất**, đóng vai trò như một "bản thiết kế kỹ thuật" (Technical Blueprint) để bạn hoặc AI có thể code ngay lập tức. Bản này bao gồm các cấu trúc DOM và logic xử lý API "ngầm" của Google AI Studio.

---

# PRD: AI Studio Chat Archiver (Framework Standard)

**Framework:** Vite + React + TypeScript + CRXJS  
**Core Library:** `JSZip` (Export Zip), `chrome-storage-local` (Vault), `Lucide React` (UI Icons)

---

## 1. Bản đồ cấu trúc DOM (DOM Mapping)
Để trích xuất chính xác, Extension sẽ quét các thành phần sau trong giao diện `aistudio.google.com`:

### 1.1. Cấu trúc tổng quát
*   **Container chính:** `ms-chat-session`
*   **Danh sách lượt chat:** Thẻ `<ms-chat-turn>` (mỗi thẻ đại diện cho một câu hỏi của User hoặc trả lời của Model).

### 1.2. Chi tiết từng lượt chat (Chat Turns)
| Thành phần | Selector / Logic | Ghi chú |
| :--- | :--- | :--- |
| **Vai trò (Role)** | `.chat-turn-container.user` hoặc `.chat-turn-container.model` | Dùng để phân loại Markdown (`## User` vs `## Model`) |
| **Nội dung chữ** | `ms-text-chunk` | Chứa văn bản thuần hoặc Code block |
| **Phần suy nghĩ** | `ms-thought-chunk` | Chỉ có ở Model (Gemini 2.0 Thinking). Lưu vào thẻ `<details>` |
| **File đính kèm** | `ms-file-chunk` | Chứa thẻ con `.name` (Tên file) để map với Base64 trong Storage |

---

## 2. Đặc tả đánh chặn API (Network Interception)
Extension không dùng API Drive (tránh lỗi 403). Thay vào đó, nó "nghe trộm" dữ liệu khi User tải file lên.

### 2.1. Request cần bắt
*   **URL:** `https://content.googleapis.com/upload/drive/v3/files?uploadType=multipart...`
*   **Method:** `POST`
*   **Kỹ thuật:** Sử dụng `chrome.debugger` (giao thức `Network.requestWillBeSent`) để đọc `postData`.

### 2.2. Cấu trúc Payload (Multipart)
Dữ liệu gửi đi của Google có dạng Multipart. Extension cần parse để lấy:
1.  **Phần JSON:** Lấy `name` (Ví dụ: `TEST_context.txt`).
2.  **Phần Content:** Lấy chuỗi **Base64** nằm sau `Content-Transfer-Encoding: base64`.

---

## 3. Quy trình lưu trữ (Data Lifecycle)

1.  **Lắng nghe (Listen):** Khi phát hiện request upload, bóc tách Base64.
2.  **Lưu kho (Vault):** Lưu vào `chrome.storage.local`:
    ```json
    {
      "vault": {
        "TEST_context.txt": {
          "mimeType": "text/plain",
          "base64": "PG1zLWNoYXQt...",
          "timestamp": 1710100000
        }
      }
    }
    ```
3.  **Dọn dẹp:** Tự động xóa file trong vault sau 24 giờ để tránh tràn bộ nhớ.

---

## 4. Logic Xuất dữ liệu (Export Logic)

Người dùng nhấn nút **[Export]**, Extension thực hiện các bước sau:

### Bước 1: Thu thập dữ liệu
*   Lặp qua tất cả `ms-chat-turn`.
*   Lấy Text từ `ms-text-chunk`.
*   Nếu thấy `ms-file-chunk`, lấy tên file và tìm trong **Vault** (Storage).

### Bước 2: Phân loại đóng gói (Decision Matrix)
| Kịch bản | Định dạng đầu ra | Cấu trúc |
| :--- | :--- | :--- |
| **Chỉ có Text/Code** | 01 file `.md` | Nội dung chat thuần túy |
| **Có file Text/Code đính kèm** | 01 file `.md` | Gộp nội dung file vào cuối file Markdown |
| **Có Ảnh/PDF đính kèm** | 01 file `.zip` | `history.md` + Thư mục `assets/` |

### Bước 3: Xử lý Media (Nếu chọn Include)
*   **Ảnh:** Giải mã Base64 thành Blob -> Lưu vào `assets/images/`.
*   **PDF:** Giải mã Base64 thành Blob -> Lưu vào `assets/documents/`.
*   **Markdown Link:** Trong file `.md` chèn link tương ứng: `![Image](assets/images/file.png)`.

---

## 5. Thiết kế Giao diện (UI/UX)

### 5.1. Nút bấm (Injected Button)
*   **Vị trí:** Chèn vào cạnh nút "Share" ở góc trên bên phải trang web.
*   **Style:** Sử dụng Tailwind CSS để tiệp màu với giao diện AI Studio (Xanh dương/Xám).

### 5.2. Popup Cấu hình
*   **File List:** Hiện danh sách các file đang nằm trong bộ nhớ tạm (Vault).
*   **Toggles:**
    *   `Include Images in Export`: Bật/Tắt.
    *   `Include PDFs in Export`: Bật/Tắt.
*   **Nút chính:** `Export as Markdown/Zip`.

---

## 6. Yêu cầu kỹ thuật (Technical Requirements)
1.  **Debugger Management:** Tự động `attach` debugger khi user mở tab AI Studio và `detach` khi đóng tab.
2.  **JSZip Integration:** Xử lý nén file ngay tại trình duyệt để đảm bảo quyền riêng tư (Zero-server policy).
3.  **Base64 Converter:** Hàm tiện ích để chuyển đổi linh hoạt giữa Base64, Blob và ArrayBuffer.

---

## 7. Luồng dữ liệu (Sequence Diagram)
1.  **User** mở AI Studio -> **Extension** gắn Debugger.
2.  **User** upload `A.png` -> **Extension** bắt Base64 của `A.png` -> Lưu Storage.
3.  **User** bấm **Export** -> **Extension** quét hội thoại.
4.  **Extension** thấy `A.png` trong DOM -> Lấy Base64 từ Storage.
5.  **Extension** tạo Zip: `history.md` + `assets/images/A.png`.
6.  **Browser** tải Zip về máy User.

---

### Gợi ý cho bạn:
Với PRD này, bạn có thể sử dụng các lệnh sau để khởi tạo dự án với **Vite**:
```bash
npm create vite@latest ai-studio-archiver -- --template react-ts
npm install jszip lucide-react
```