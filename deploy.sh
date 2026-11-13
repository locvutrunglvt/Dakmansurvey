#!/bin/bash
# ==============================================================================
# Script cài đặt & triển khai Webapp Khảo Sát Dakman lên máy chủ VPS Linux (Ubuntu/Debian)
# Tên miền: dakmansurvey.slowforest.vn
# Tác giả: Lộc Vũ Trung
# ==============================================================================

set -e

DOMAIN="dakmansurvey.slowforest.vn"
APP_DIR="/var/www/dakmansurvey"
SERVICE_NAME="dakmansurvey"

echo "================================================================="
echo "  Bắt đầu triển khai Webapp Khảo sát Dakman lên máy chủ VPS"
echo "  Tên miền: https://$DOMAIN"
echo "================================================================="

# 1. Cập nhật hệ điều hành & cài đặt gói cần thiết
echo ">>> [1/6] Cập nhật hệ thống & cài đặt Python3, Nginx, Certbot..."
apt update -y
apt install -y python3 python3-pip python3-venv nginx certbot python3-certbot-nginx rsync ufw

# Cài đặt thư viện openpyxl cho tính năng xuất file Excel
pip3 install openpyxl || pip install openpyxl || true

# 2. Tạo thư mục chứa mã nguồn ứng dụng
echo ">>> [2/6] Tạo thư mục ứng dụng tại $APP_DIR..."
mkdir -p $APP_DIR

# Sao chép các tệp mã nguồn vào thư mục triển khai
rsync -av --exclude 'survey_database.sqlite' ./ $APP_DIR/

# 3. Cài đặt dịch vụ systemd chạy nền tự động 24/7
echo ">>> [3/6] Cấu hình systemd service..."
cp $APP_DIR/dakmansurvey.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

# 4. Kiểm tra dịch vụ backend
sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "✔ Dịch vụ backend đang chạy tốt ở cổng 8080."
else
    echo "❌ Cảnh báo: Dịch vụ backend chưa khởi động. Kiểm tra nhật ký: journalctl -u $SERVICE_NAME -n 50"
fi

# 5. Cấu hình Nginx Web Server
echo ">>> [4/6] Cấu hình Nginx reverse proxy..."
cp $APP_DIR/nginx_dakmansurvey.conf /etc/nginx/sites-available/$DOMAIN

# Kích hoạt site nếu chưa có symlink
if [ ! -f /etc/nginx/sites-enabled/$DOMAIN ]; then
    ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
fi

# Xóa default site nếu có xung đột
rm -f /etc/nginx/sites-enabled/default || true

# Kiểm tra cú pháp Nginx
nginx -t
systemctl reload nginx

# 6. Mở tường lửa UFW (nếu kích hoạt)
ufw allow 'Nginx Full' || true

# 7. Cấp chứng chỉ bảo mật SSL HTTPS miễn phí tự động gia hạn (Let's Encrypt)
echo ">>> [5/6] Cấp chứng chỉ SSL HTTPS cho $DOMAIN..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m trunglocvu@gmail.com --redirect || {
    echo "Lưu ý: Nếu DNS chưa trỏ về IP VPS này, hãy trỏ DNS bản ghi A của $DOMAIN về IP máy chủ rồi chạy lại:"
    echo "certbot --nginx -d $DOMAIN"
}

echo "================================================================="
echo "  TRIỂN KHAI HOÀN TẤT!"
echo "  Webapp sẵn sàng tại: https://$DOMAIN"
echo "  Quản trị dịch vụ:"
echo "    - Xem trạng thái: systemctl status $SERVICE_NAME"
echo "    - Khởi động lại:  systemctl restart $SERVICE_NAME"
echo "    - Xem nhật ký:    journalctl -u $SERVICE_NAME -f"
echo "================================================================="

