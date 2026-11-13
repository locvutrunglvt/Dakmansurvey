# HƯỚNG DẪN TRIỂN KHAI VÀ SỬ DỤNG HỆ THỐNG PHỎNG VẤN DAKMAN

> **Dự án:** Cảnh quan Cà phê Bền vững Huyện Cư M'gar (2021 - 2026)  
> **Đơn vị thực hiện:** Dakman Việt Nam  
> **Tác giả:** Lộc Vũ Trung  
> **Tên miền Webapp:** `https://dakmansurvey.slowforest.vn`  
> **Chuẩn văn bản in giấy:** W2 / W2B (Corporate Navy Blue Theme `#002060`)

---

## 📁 1. TỔNG QUAN CÁC SẢN PHẨM ĐÃ XÂY DỰNG

Hệ thống bao gồm 2 phân hệ hoàn chỉnh phục vụ đợt Đánh giá cuối kỳ (Final Evaluation):

| Hạng mục | Tệp tin / Thư mục | Mô tả chi tiết |
|---|---|---|
| **1. Form in giấy chuẩn W2B** | `Draft_Ke hoach_V5/04_Form_In_Giay_PhongVan_DGCK_Dakman_W2B.docx` | Tài liệu Word chuẩn W2B (Khổ A4, lề 2cm, chữ xanh Navy `#002060`, bảng viền mảnh, đệm chuẩn 70/100 dxa, có ô checkbox `[ ]`, dòng kẻ ghi chép, khối chữ ký tác giả Lộc Vũ Trung) bao quát toàn bộ 384 câu hỏi của 8 công cụ khảo sát. |
| **2. Webapp khảo sát hiện trường** | Thư mục `webapp_dakman_survey/` | Ứng dụng web toàn diện chạy trên máy tính và điện thoại thông minh (Full-page responsive), hỗ trợ offline lưu nháp và đồng bộ trực tiếp về máy chủ VPS. |
| **3. Cấu hình máy chủ VPS** | `nginx_dakmansurvey.conf`, `dakmansurvey.service`, `deploy.sh` | Bộ kịch bản và cấu hình Nginx HTTPS SSL tự động trỏ tên miền `dakmansurvey.slowforest.vn`. |

---

## 🚀 2. TÍNH NĂNG NỔI BẬT CỦA WEBAPP

### 2.1. Đăng nhập người dùng (User Session)
* Ghi nhận **Mã người dùng (ID ĐTV)** (ví dụ: `DTV01`, `DTV02`, `DTV03`, `DTV04`, `GSV01`).
* Ghi nhận **Họ và tên người sử dụng** và **Ngày tháng sử dụng**.
* Phân công địa bàn phụ trách (Xã Ea Kiết, Ea Tar, Cư Dliê M'nông).
* Tự động lưu phiên vào trình duyệt; hiển thị badge điều tra viên trên thanh điều hướng đầu trang.

### 2.2. Dashboard báo cáo tiến độ phỏng vấn (Realtime Analytics)
* **Tổng mục tiêu: 312 người tham vấn**; tính toán tỷ lệ hoàn thành (%) thời gian thực.
* Thống kê chi tiết tiến độ theo **4 nhóm đối tượng tham vấn**:
  * **Nhóm 1 (Nông dân - 268 người):** 220 phiếu hộ P1, 12 cuộc thảo luận thôn KIP, 9 phỏng vấn sâu chủ mô hình MH.
  * **Nhóm 2 (Trưởng nhóm & HTX - 36 người):** 3 nhóm ToT (24 người), 1 nhóm tổ dịch vụ SDM (6 người), 3 Ban Giám Đốc HTX Fairtrade.
  * **Nhóm 3 (Chính quyền - 6 cuộc):** Lãnh đạo UBND xã Ea Kiết, Ea Tul, Hội Nông dân, TT Khuyến nông / Sở NN&MT.
  * **Nhóm 4 (Nhà tài trợ - 2 cuộc):** IDH và JDE Peet's.
* Thống kê phân bổ theo **3 địa bàn xã**:
  * Ea Kiết (Mục tiêu 84 phiếu P1)
  * Ea Tar (Mục tiêu 51 phiếu P1)
  * Cư Dliê M'nông (Mục tiêu 85 phiếu P1)
* Bảng tra cứu, tìm kiếm danh sách các phiếu đã nộp, xem chi tiết câu trả lời.
* Nút **Xuất file Excel (`.xlsx`)** trực tiếp từ VPS phục vụ phân tích dữ liệu chuyên sâu.

### 2.3. Kế hoạch bắt đầu - kết thúc (Timeline & Roadmap)
* Bảng biểu và thanh thời gian trực quan hóa **22 hoạt động theo ngày** từ **01/11/2026 đến 30/11/2026** lấy trực tiếp từ bản kế hoạch `02_KeHoach_DGCK_Dakman_F1_VN.xlsx`.
* Thể hiện rõ: Tên hoạt động, Người phụ trách, Ngày bắt đầu, Ngày kết thúc, Số ngày thực hiện, Trạng thái hoạt động (Kế hoạch / Đang thực hiện / Hoàn thành).

### 2.4. Bộ Form phỏng vấn online đa nền tảng (Mobile & PC)
* **Giao diện Full-page responsive:** Co giãn thông minh, phím bấm to dễ bấm bằng ngón tay khi ra vườn cà phê trên điện thoại.
* **Đầy đủ 8 công cụ khảo sát:** P1 (Hộ nông dân), KIP (Nhóm thôn), MH (Mô hình), NT (ToT), SDM (Tổ dịch vụ), HTX (Hợp tác xã), CQ (Chính quyền), TT (Nhà tài trợ).
* **Đa dạng loại câu hỏi:**
  * Chọn 1 (Single Choice / Radio).
  * Chọn nhiều (Multiple Choice / Checkbox).
  * Thang điểm Likert 1-5 (Sao / Điểm số).
  * Nhập số lượng / chi phí / diện tích.
  * Ghi chú văn bản / ý kiến mở.
  * **Nút bấm định vị GPS tự động:** Lấy trực tiếp tọa độ (Kinh độ, Vĩ độ) từ chip GPS của điện thoại di động với độ chính xác cao.
* **Cơ chế lưu nháp ngoại tuyến (Offline-First):**
  * Tự động lưu nháp vào `localStorage` sau từng thao tác chọn.
  * Mất sóng 3G/4G ngoài rẫy vẫn nhập dữ liệu bình thường, không sợ mất thông tin.
  * Khi có mạng, bấm **"Gửi về máy chủ VPS"** để đồng bộ vào cơ sở dữ liệu.

---

## 💻 3. HƯỚNG DẪN CHẠY THỬ NGHIỆM TẠI MÁY LOCAL

Người dùng có thể khởi chạy và thử nghiệm ngay trên máy tính Windows/Mac:

```bash
# Di chuyển vào thư mục webapp
cd "g:\My Drive\GIS\EUDR_GIS\TCN\Dakman_Danh gia cuoi ky\webapp_dakman_survey"

# Khởi chạy máy chủ (Không cần cài thêm thư viện phức tạp)
python server.py
```

* Mở trình duyệt web truy cập: `http://localhost:8080`
* Giao diện sẽ hiển thị đầy đủ Dashboard, Kế hoạch 22 mốc và Bộ form phỏng vấn online.

---

## 🌐 4. HƯỚNG DẪN TRIỂN KHAI LÊN MÁY CHỦ VPS (`dakmansurvey.slowforest.vn`)

### Bước 1: Cấu hình DNS Tên miền
1. Đăng nhập trang quản lý tên miền (nhà đăng ký tên miền của `slowforest.vn`).
2. Thêm **bản ghi A (A Record)**:
   * **Host / Name:** `dakmansurvey`
   * **Loại (Type):** `A`
   * **Giá trị (Value / Points to):** `<Địa chỉ IP của VPS>`
   * **TTL:** `300` (hoặc Mặc định)

### Bước 2: Tải mã nguồn lên VPS
Mở terminal trên máy tính và đẩy thư mục `webapp_dakman_survey` lên VPS:

```bash
# Ví dụ đẩy qua SCP hoặc Rsync lên VPS:
rsync -avz --exclude 'survey_database.sqlite' "g:/My Drive/GIS/EUDR_GIS/TCN/Dakman_Danh gia cuoi ky/webapp_dakman_survey/" root@<IP_VPS>:/var/www/dakmansurvey/
```

### Bước 3: Chạy script triển khai tự động (1-Click Deploy)
Đăng nhập SSH vào VPS:

```bash
ssh root@<IP_VPS>

# Di chuyển vào thư mục và cấp quyền chạy script
cd /var/www/dakmansurvey
chmod +x deploy.sh

# Chạy script triển khai tự động
./deploy.sh
```

Script sẽ tự động:
1. Cài đặt Python3, Nginx, Certbot.
2. Thiết lập dịch vụ systemd `dakmansurvey.service` tự khởi động cùng máy chủ.
3. Thiết lập Nginx Reverse Proxy bảo mật và chuyển hướng HTTPS.
4. Tự động lấy chứng chỉ bảo mật SSL miễn phí của Let's Encrypt cho `dakmansurvey.slowforest.vn`.

### Bước 4: Kiểm tra và Quản trị dịch vụ trên VPS
* **Kiểm tra trạng thái:** `systemctl status dakmansurvey`
* **Xem nhật ký log trực tiếp:** `journalctl -u dakmansurvey -f`
* **Khởi động lại dịch vụ:** `systemctl restart dakmansurvey`
* **Kiểm tra truy cập:** Mở trình duyệt và vào địa chỉ `https://dakmansurvey.slowforest.vn`.

