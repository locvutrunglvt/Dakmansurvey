"""
Dakman Final Evaluation Webapp Server
Domain: dakmansurvey.slowforest.vn
Port: 8080 (or PORT env var)
Zero external dependencies required (Python 3 standard library + sqlite3)
Supports openpyxl for Excel export if installed.
Tác giả hệ thống: Lộc Vũ Trung
Đơn vị tư vấn: Công ty TNHH Dịch vụ và Tư vấn Tân Cao Nguyên
"""

import os
import re
import sys
import json
import base64
import sqlite3
import tempfile
import datetime
import urllib.parse
import unicodedata
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "survey_database.sqlite")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads", "photos")
AUDIT_DIR = os.path.join(BASE_DIR, "backups")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(AUDIT_DIR, exist_ok=True)
AUDIT_LOG_PATH = os.path.join(AUDIT_DIR, "audit_events.jsonl")

def append_audit_event(event_type, payload):
    try:
        record = {
            "timestamp": datetime.datetime.now().isoformat(),
            "event": event_type,
            "data": payload
        }
        with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"Audit log error: {e}")
QUESTIONS_FILE = os.path.join(BASE_DIR, "questions_data.json")
SCHEDULE_FILE = os.path.join(BASE_DIR, "schedule_data.json")

# 03 Tầng quyền đăng nhập mặc định (có thể đổi qua giao diện Admin)
PASS_ADMIN = "AAdmin123"
PASS_VIEWER = "View123"
PASS_EDITOR = "Edit123a#"

def get_setting(key, default=""):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, val TEXT)')
        cur.execute('SELECT val FROM system_settings WHERE key = ?', (key,))
        row = cur.fetchone()
        conn.close()
        return row[0] if row else default
    except Exception:
        return default

def set_setting(key, val):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, val TEXT)')
        cur.execute('INSERT OR REPLACE INTO system_settings (key, val) VALUES (?, ?)', (key, val))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error setting {key}: {e}")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS surveys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            survey_code TEXT,
            tool_code TEXT,
            tool_name TEXT,
            surveyor_id TEXT,
            surveyor_name TEXT,
            survey_date TEXT,
            commune TEXT,
            hamlet TEXT,
            target_group TEXT,
            respondent_name TEXT,
            respondent_phone TEXT,
            gps_lat REAL,
            gps_lng REAL,
            start_time TEXT,
            end_time TEXT,
            answers_json TEXT,
            photo_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    try:
        cur.execute('ALTER TABLE surveys ADD COLUMN photo_path TEXT')
    except Exception:
        pass
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            surveyor_id TEXT UNIQUE,
            full_name TEXT,
            phone TEXT,
            role TEXT,
            commune_assigned TEXT,
            password TEXT,
            last_login TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            val TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS deleted_surveys_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_id INTEGER,
            survey_code TEXT,
            tool_code TEXT,
            surveyor_id TEXT,
            respondent_name TEXT,
            deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_by TEXT,
            row_json TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS deleted_users_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_id INTEGER,
            surveyor_id TEXT,
            full_name TEXT,
            commune_assigned TEXT,
            deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_by TEXT,
            row_json TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS surveys_revision_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            survey_id INTEGER,
            survey_code TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_by TEXT,
            row_json TEXT
        )
    ''')
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('pass_admin', 'AAdmin123'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('pass_viewer', 'View123'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('admin_name', 'Quản Trị Viên (Admin)'))
    conn.commit()
    try:
        cur.execute('ALTER TABLE users ADD COLUMN password TEXT')
    except Exception:
        pass

    # Seed initial surveyors with standard format TCN-XX-hhmmss
    cur.execute('SELECT COUNT(*) FROM users')
    if cur.fetchone()[0] == 0:
        seed_users = [
            ('TCN-01-080000', 'Nguyễn Văn An', '0912345678', 'Điều tra viên', 'Ea Kiết', 'Edit123a#'),
            ('TCN-02-080000', 'Lê Thị Bình', '0912345679', 'Điều tra viên', 'Ea Tar', 'Edit123a#'),
            ('TCN-03-080000', 'Trần Văn Cường', '0912345680', 'Điều tra viên', "Cư Dliê M'nông", 'Edit123a#'),
            ('TCN-04-080000', 'H\'Hen Niê', '0912345681', 'Điều tra viên', 'Ea Kiết', 'Edit123a#'),
            ('TCN-05-080000', 'Lộc Vũ Trung', '0908889999', 'Giám sát viên & Trưởng nhóm', 'Toàn vùng', 'Edit123a#')
        ]
        cur.executemany('''
            INSERT OR REPLACE INTO users (surveyor_id, full_name, phone, role, commune_assigned, password, last_login)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', seed_users)

    conn.commit()
    conn.close()

init_db()


def read_request_body(rfile, length):
    if not length or length <= 0:
        return ''
    raw_bytes = rfile.read(length)
    for enc in ('utf-8', 'utf-8-sig', 'windows-1258', 'cp1252', 'latin-1'):
        try:
            return raw_bytes.decode(enc)
        except Exception:
            continue
    return raw_bytes.decode('utf-8', errors='replace')

def normalize_vn_str(text):
    if not text:
        return ''
    return ' '.join(unicodedata.normalize('NFC', str(text).strip()).lower().split())

def save_survey_photo(survey_code, photo_data):
    """Decode base64 data URL and save JPEG photo to UPLOADS_DIR."""
    if not photo_data or not isinstance(photo_data, str) or ',' not in photo_data:
        return ''
    try:
        header, b64_str = photo_data.split(',', 1)
        img_bytes = base64.b64decode(b64_str)
        safe_code = re.sub(r'[^A-Za-z0-9_-]', '_', str(survey_code or 'DKM'))[:40]
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{safe_code}_{ts}.jpg"
        filepath = os.path.join(UPLOADS_DIR, filename)
        with open(filepath, 'wb') as f:
            f.write(img_bytes)
        return filename
    except Exception as e:
        print(f"Error saving photo: {e}")
        return ''

def build_survey_pdf(survey_row):
    import io
    from xml.sax.saxutils import escape as xml_escape
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfgen import canvas as rl_canvas
    from PIL import Image as PILImage

    font_regular = 'Helvetica'
    font_bold = 'Helvetica-Bold'
    font_candidates = [
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        (r'C:\Windows\Fonts\arial.ttf', r'C:\Windows\Fonts\arialbd.ttf'),
    ]
    for reg_path, bold_path in font_candidates:
        if os.path.exists(reg_path) and os.path.exists(bold_path):
            if 'DakmanSans' not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont('DakmanSans', reg_path))
                pdfmetrics.registerFont(TTFont('DakmanSans-Bold', bold_path))
                pdfmetrics.registerFontFamily('DakmanSans', normal='DakmanSans', bold='DakmanSans-Bold')
            font_regular = 'DakmanSans'
            font_bold = 'DakmanSans-Bold'
            break

    buf = io.BytesIO()
    survey_code = str(survey_row.get('survey_code') or f"PHIEU_{survey_row.get('id', '')}")
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=14 * mm,
        title=f"Báo cáo phỏng vấn {survey_code}",
        author="Lộc Vũ Trung"
    )

    styles = getSampleStyleSheet()
    st_org = ParagraphStyle('Org', parent=styles['Normal'], fontName=font_bold, fontSize=9.5, leading=12, textColor=colors.HexColor('#002060'))
    st_proj = ParagraphStyle('Proj', parent=styles['Normal'], fontName=font_bold, fontSize=11, leading=14, textColor=colors.HexColor('#1B5E20'))
    st_title = ParagraphStyle('TitleVN', parent=styles['Normal'], fontName=font_bold, fontSize=12, leading=15, textColor=colors.HexColor('#0f172a'))
    st_meta = ParagraphStyle('Meta', parent=styles['Normal'], fontName=font_regular, fontSize=8.5, leading=11.5, textColor=colors.HexColor('#1e293b'))
    st_sec = ParagraphStyle('Sec', parent=styles['Normal'], fontName=font_bold, fontSize=9.5, leading=12, textColor=colors.white)
    st_th = ParagraphStyle('TH', parent=styles['Normal'], fontName=font_bold, fontSize=8.5, leading=11, textColor=colors.HexColor('#002060'))
    st_td = ParagraphStyle('TD', parent=styles['Normal'], fontName=font_regular, fontSize=8.5, leading=11.5, textColor=colors.HexColor('#1e293b'))
    st_td_bold = ParagraphStyle('TDB', parent=styles['Normal'], fontName=font_bold, fontSize=8.5, leading=11.5, textColor=colors.HexColor('#002060'))
    st_cap = ParagraphStyle('Cap', parent=styles['Normal'], fontName=font_regular, fontSize=7.5, leading=10, textColor=colors.HexColor('#475569'), alignment=1)

    def scaled_img(path, max_w, max_h):
        with PILImage.open(path) as im:
            iw, ih = im.size
        ratio = min(max_w / float(iw), max_h / float(ih))
        return RLImage(path, width=iw * ratio, height=ih * ratio)

    # Top-left: Logos + Project/Company header + Household info
    logo_cells = []
    for logo_name in ['logo_dakman.png', 'logo_idh.png', 'logo_tcn_thumb.png']:
        lp = os.path.join(PUBLIC_DIR, 'img', logo_name)
        if os.path.exists(lp):
            try:
                logo_cells.append(scaled_img(lp, 26 * mm, 11 * mm))
            except Exception:
                pass

    left_flow = []
    if logo_cells:
        logo_tbl = Table([logo_cells], colWidths=[28 * mm] * len(logo_cells))
        logo_tbl.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        left_flow.append(logo_tbl)

    left_flow.append(Paragraph(xml_escape("CÔNG TY TNHH DAKMAN VIỆT NAM — BAN QUẢN LÝ DỰ ÁN"), st_org))
    left_flow.append(Paragraph(xml_escape("DỰ ÁN CẢNH QUAN CÀ PHÊ BỀN VỮNG HUYỆN CƯ M'GAR"), st_proj))
    left_flow.append(Spacer(1, 2 * mm))
    left_flow.append(Paragraph(xml_escape("BÁO CÁO KẾT QUẢ PHỎNG VẤN HỘ / ĐỐI TƯỢNG"), st_title))
    left_flow.append(Spacer(1, 2 * mm))

    gps_str = f"{survey_row.get('gps_lat')}, {survey_row.get('gps_lng')}" if survey_row.get('gps_lat') and survey_row.get('gps_lng') else "Chưa ghi nhận"
    meta_lines = [
        f"<b>Mã phiếu:</b> {xml_escape(survey_code)} &nbsp;|&nbsp; <b>Công cụ:</b> {xml_escape(str(survey_row.get('tool_code') or ''))}",
        f"<b>Chủ hộ / Đối tượng:</b> {xml_escape(str(survey_row.get('respondent_name') or '—'))}",
        f"<b>Địa bàn:</b> Xã {xml_escape(str(survey_row.get('commune') or '—'))} ({xml_escape(str(survey_row.get('hamlet') or '—'))})",
        f"<b>Điều tra viên:</b> {xml_escape(str(survey_row.get('surveyor_name') or ''))} ({xml_escape(str(survey_row.get('surveyor_id') or ''))})",
        f"<b>Ngày phỏng vấn:</b> {xml_escape(str(survey_row.get('survey_date') or '—'))} &nbsp;|&nbsp; <b>GPS:</b> {xml_escape(gps_str)}",
    ]
    for ml in meta_lines:
        left_flow.append(Paragraph(ml, st_meta))

    # Top-right: Watermark photo
    right_flow = []
    photo_name = str(survey_row.get('photo_path') or '').strip()
    photo_full = os.path.join(UPLOADS_DIR, os.path.basename(photo_name)) if photo_name else ''
    if photo_full and os.path.exists(photo_full):
        try:
            right_flow.append(scaled_img(photo_full, 62 * mm, 48 * mm))
            right_flow.append(Spacer(1, 1.5 * mm))
            right_flow.append(Paragraph(xml_escape("Ảnh hiện trường cùng chủ hộ (Watermark)"), st_cap))
        except Exception:
            right_flow.append(Paragraph(xml_escape("[Không thể đọc ảnh hiện trường]"), st_cap))
    else:
        right_flow.append(Spacer(1, 18 * mm))
        right_flow.append(Paragraph(xml_escape("[Chưa đính kèm ảnh chụp]"), st_cap))

    header_tbl = Table([[left_flow, right_flow]], colWidths=[114 * mm, 68 * mm])
    header_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('BOX', (1, 0), (1, 0), 0.75, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#F8FAFC')),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 6),
        ('LEFTPADDING', (1, 0), (1, 0), 4),
        ('RIGHTPADDING', (1, 0), (1, 0), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, 0), 1.2, colors.HexColor('#002060')),
    ]))

    story = [header_tbl, Spacer(1, 4 * mm)]

    # Load question definitions for tool_code
    answers = json.loads(survey_row.get('answers_json') or '{}')
    tool_code = str(survey_row.get('tool_code') or 'P1')
    q_sections = {}
    section_order = []
    known_codes = set()
    if os.path.exists(QUESTIONS_FILE):
        with open(QUESTIONS_FILE, 'r', encoding='utf-8') as qf:
            all_q = json.load(qf)
        tool_qs = (all_q.get(tool_code) or {}).get('questions') or []
        for q in tool_qs:
            sec = q.get('section') or 'Thông tin chung'
            if sec not in q_sections:
                q_sections[sec] = []
                section_order.append(sec)
            q_sections[sec].append(q)
            known_codes.add(q.get('code'))

    def fmt_ans(val):
        if val is None or val == '':
            return '—'
        if isinstance(val, list):
            return ', '.join(str(x) for x in val) if val else '—'
        if isinstance(val, dict):
            return json.dumps(val, ensure_ascii=False)
        return str(val)

    for sec in section_order:
        sec_banner = Table([[Paragraph(xml_escape(sec.upper()), st_sec)]], colWidths=[182 * mm])
        sec_banner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#002060')),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(sec_banner)

        rows = [[
            Paragraph(xml_escape("Mã"), st_th),
            Paragraph(xml_escape("Nội dung câu hỏi"), st_th),
            Paragraph(xml_escape("Đáp án / Kết quả ghi nhận"), st_th),
        ]]
        for q in q_sections[sec]:
            q_code = str(q.get('code') or '')
            q_text = str(q.get('text') or q_code)
            ans_str = fmt_ans(answers.get(q_code))
            rows.append([
                Paragraph(xml_escape(q_code), st_td_bold),
                Paragraph(xml_escape(q_text), st_td),
                Paragraph(xml_escape(ans_str).replace('\n', '<br/>'), st_td),
            ])

        tbl = Table(rows, colWidths=[20 * mm, 96 * mm, 66 * mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ECECEC')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 3 * mm))

    extra_keys = [k for k in answers.keys() if k not in known_codes]
    if extra_keys:
        sec_banner = Table([[Paragraph(xml_escape("THÔNG TIN BỔ SUNG KHÁC"), st_sec)]], colWidths=[182 * mm])
        sec_banner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1B5E20')),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(sec_banner)
        rows = [[
            Paragraph(xml_escape("Mã"), st_th),
            Paragraph(xml_escape("Giá trị ghi nhận"), st_th),
        ]]
        for k in extra_keys:
            rows.append([
                Paragraph(xml_escape(str(k)), st_td_bold),
                Paragraph(xml_escape(fmt_ans(answers.get(k))).replace('\n', '<br/>'), st_td),
            ])
        tbl = Table(rows, colWidths=[40 * mm, 142 * mm], repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ECECEC')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self.draw_page_number(num_pages)
                super().showPage()
            super().save()

        def draw_page_number(self, page_count):
            page_w, _ = A4
            self.saveState()
            self.setStrokeColor(colors.HexColor('#CBD5E1'))
            self.setLineWidth(0.5)
            self.line(14 * mm, 11 * mm, page_w - 14 * mm, 11 * mm)
            self.setFont(font_regular, 8)
            self.setFillColor(colors.HexColor('#475569'))
            self.drawString(14 * mm, 7 * mm, f"Mã phiếu: {survey_code} | Dự án Cảnh quan Cà phê Bền vững Cư M'gar")
            self.setFont(font_bold, 8.5)
            self.setFillColor(colors.HexColor('#002060'))
            self.drawRightString(page_w - 14 * mm, 7 * mm, f"Trang {self._pageNumber} / {page_count}")
            self.restoreState()

    doc.build(story, canvasmaker=NumberedCanvas)
    return buf.getvalue()

class SurveyRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key, X-Delete-Password, X-User-Role, X-User-Id')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key, X-Delete-Password, X-User-Role, X-User-Id')
        self.end_headers()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            return
        super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == '/api/health':
            self._send_json({
                'status': 'online',
                'service': 'Dakman Final Evaluation Survey VPS Service',
                'domain': 'dakmansurvey.slowforest.vn',
                'time': datetime.datetime.now().isoformat()
            })
            return

        elif path == '/api/questions':
            if os.path.exists(QUESTIONS_FILE):
                with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
                    self._send_json(json.load(f))
            else:
                self._send_json({'error': 'Question data file not found'}, 404)
            return

        elif path == '/api/schedule':
            if os.path.exists(SCHEDULE_FILE):
                with open(SCHEDULE_FILE, 'r', encoding='utf-8') as f:
                    self._send_json(json.load(f))
            else:
                self._send_json({'error': 'Schedule data file not found'}, 404)
            return

        elif path == '/api/admin/settings':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền xem cấu hình hệ thống!'}, 403)
                return
            self._send_json({
                'pass_admin': cur_admin_pass,
                'pass_viewer': get_setting('pass_viewer', PASS_VIEWER),
                'admin_name': get_setting('admin_name', 'Quản Trị Viên (Admin)')
            })
            return

        elif path == '/api/admin/users':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền xem danh sách nhân sự!'}, 403)
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT id, surveyor_id, full_name, phone, role, commune_assigned, password, last_login FROM users ORDER BY id DESC')
            cols = ['id', 'surveyor_id', 'full_name', 'phone', 'role', 'commune_assigned', 'password', 'last_login']
            users = [dict(zip(cols, r)) for r in cur.fetchall()]
            conn.close()
            self._send_json(users)
            return

        elif path == '/api/admin/trash':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền xem thùng rác & khôi phục!'}, 403)
                return
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('''
                SELECT id, original_id, survey_code, tool_code, surveyor_id, respondent_name, deleted_at, deleted_by
                FROM deleted_surveys_archive ORDER BY id DESC LIMIT 100
            ''')
            s_cols = ['archive_id', 'original_id', 'survey_code', 'tool_code', 'surveyor_id', 'respondent_name', 'deleted_at', 'deleted_by']
            deleted_surveys = [dict(zip(s_cols, r)) for r in cur.fetchall()]

            cur.execute('''
                SELECT id, original_id, surveyor_id, full_name, commune_assigned, deleted_at, deleted_by
                FROM deleted_users_archive ORDER BY id DESC LIMIT 100
            ''')
            u_cols = ['archive_id', 'original_id', 'surveyor_id', 'full_name', 'commune_assigned', 'deleted_at', 'deleted_by']
            deleted_users = [dict(zip(u_cols, r)) for r in cur.fetchall()]
            conn.close()
            self._send_json({
                'deleted_surveys': deleted_surveys,
                'deleted_users': deleted_users
            })
            return

        elif path == '/api/admin/backup-download':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '') or query.get('key', [''])[0]
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền tải bản sao lưu CSDL!'}, 403)
                return
            tmp_path = None
            try:
                fd, tmp_path = tempfile.mkstemp(suffix='.sqlite')
                os.close(fd)
                src = sqlite3.connect(DB_PATH)
                dst = sqlite3.connect(tmp_path)
                src.backup(dst)
                dst.close()
                src.close()
                with open(tmp_path, 'rb') as f:
                    data = f.read()
                ts_name = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Disposition', f'attachment; filename="dakman_backup_{ts_name}.sqlite"')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception as e:
                self._send_json({'error': f'Lỗi tạo bản sao lưu: {str(e)}'}, 500)
                return
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass

        elif path == '/api/users':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT surveyor_id, full_name, phone, role, commune_assigned FROM users')
            users = [{'surveyor_id': r[0], 'full_name': r[1], 'phone': r[2], 'role': r[3], 'commune_assigned': r[4]} for r in cur.fetchall()]
            conn.close()
            self._send_json(users)
            return

        elif path == '/api/stats':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT tool_code, COUNT(*) FROM surveys GROUP BY tool_code')
            tool_counts = dict(cur.fetchall())

            cur.execute('SELECT commune, COUNT(*) FROM surveys GROUP BY commune')
            commune_counts = dict(cur.fetchall())

            cur.execute('SELECT COUNT(*) FROM surveys')
            total_surveys = cur.fetchone()[0]

            targets = {
                'total_respondents': 312,
                'groups': {
                    'group1_farmers': {
                        'target': 268,
                        'completed': (tool_counts.get('P1', 0) + tool_counts.get('KIP', 0) + tool_counts.get('MH', 0)),
                        'details': {
                            'P1': {'name': 'Phiếu nông dân', 'target': 220, 'completed': tool_counts.get('P1', 0)},
                            'KIP': {'name': 'Thảo luận cấp thôn', 'target': 12, 'completed': tool_counts.get('KIP', 0)},
                            'MH': {'name': 'Phỏng vấn sâu mô hình', 'target': 9, 'completed': tool_counts.get('MH', 0)}
                        }
                    },
                    'group2_leaders_coops': {
                        'target': 36,
                        'completed': (tool_counts.get('NT', 0) + tool_counts.get('SDM', 0) + tool_counts.get('HTX', 0)),
                        'details': {
                            'NT': {'name': 'Thảo luận ToT', 'target': 3, 'completed': tool_counts.get('NT', 0)},
                            'SDM': {'name': 'Thảo luận tổ SDM', 'target': 1, 'completed': tool_counts.get('SDM', 0)},
                            'HTX': {'name': 'Phỏng vấn HTX', 'target': 3, 'completed': tool_counts.get('HTX', 0)}
                        }
                    },
                    'group3_local_gov': {
                        'target': 6,
                        'completed': tool_counts.get('CQ', 0),
                        'details': {
                            'CQ': {'name': 'Chính quyền & ban ngành', 'target': 6, 'completed': tool_counts.get('CQ', 0)}
                        }
                    },
                    'group4_donors': {
                        'target': 2,
                        'completed': tool_counts.get('TT', 0),
                        'details': {
                            'TT': {'name': "Nhà tài trợ (IDH, JDE Peet's)", 'target': 2, 'completed': tool_counts.get('TT', 0)}
                        }
                    }
                },
                'communes_p1': {
                    'Ea Kiết': {'target': 84, 'completed': commune_counts.get('Ea Kiết', 0)},
                    'Ea Tar': {'target': 51, 'completed': commune_counts.get('Ea Tar', 0)},
                    "Cư Dliê M'nông": {'target': 85, 'completed': commune_counts.get("Cư Dliê M'nông", 0)}
                }
            }

            conn.close()
            self._send_json({
                'total_completed': total_surveys,
                'tool_counts': tool_counts,
                'commune_counts': commune_counts,
                'targets': targets
            })
            return

        elif path == '/api/surveys':
            tool_filter = query.get('tool', [None])[0]
            commune_filter = query.get('commune', [None])[0]
            surveyor_filter = query.get('surveyor', [None])[0]

            sql = 'SELECT id, survey_code, tool_code, tool_name, surveyor_id, surveyor_name, survey_date, commune, hamlet, target_group, respondent_name, respondent_phone, gps_lat, gps_lng, start_time, end_time, photo_path, created_at FROM surveys WHERE 1=1'
            params = []
            if tool_filter:
                sql += ' AND tool_code = ?'
                params.append(tool_filter)
            if commune_filter:
                sql += ' AND commune = ?'
                params.append(commune_filter)
            if surveyor_filter:
                sql += ' AND surveyor_id = ?'
                params.append(surveyor_filter)

            sql += ' ORDER BY id DESC'

            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute(sql, params)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            conn.close()
            self._send_json(rows)
            return

        elif path.startswith('/api/photos/'):
            filename = os.path.basename(urllib.parse.unquote(path.split('/api/photos/', 1)[1]))
            filepath = os.path.join(UPLOADS_DIR, filename)
            if os.path.isfile(filepath):
                with open(filepath, 'rb') as f:
                    img_bytes = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(len(img_bytes)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                self.wfile.write(img_bytes)
            else:
                self._send_json({'error': 'Photo not found'}, 404)
            return

        elif path.startswith('/api/surveys/') and path.endswith('/pdf'):
            parts = [p for p in path.split('/') if p]
            if len(parts) == 4 and parts[0] == 'api' and parts[1] == 'surveys' and parts[3] == 'pdf':
                role_param = (query.get('role', [''])[0] or self.headers.get('X-User-Role', '')).strip().lower()
                auth_key = query.get('key', [''])[0] or self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
                cur_viewer_pass = get_setting('pass_viewer', PASS_VIEWER)
                if role_param == 'viewer' or auth_key == cur_viewer_pass or auth_key == PASS_VIEWER or role_param not in ('admin', 'editor'):
                    self._send_json({'error': 'Tài khoản Chỉ Xem không có quyền xuất báo cáo PDF! Chỉ Admin hoặc Điều tra viên mới được phép.'}, 403)
                    return

                survey_id = parts[2]
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute('SELECT * FROM surveys WHERE id = ?', (survey_id,))
                row = cur.fetchone()
                conn.close()
                if not row:
                    self._send_json({'error': 'Survey not found'}, 404)
                    return
                if role_param == 'editor':
                    sid_param = query.get('surveyor_id', [''])[0].strip()
                    row_sid = str(row['surveyor_id'] or '').strip()
                    if sid_param and row_sid and row_sid != sid_param:
                        self._send_json({'error': 'Điều tra viên chỉ được xuất báo cáo PDF cho phiếu do mình thực hiện!'}, 403)
                        return
                try:
                    pdf_bytes = build_survey_pdf(dict(row))
                    safe_code = re.sub(r'[^A-Za-z0-9_-]', '_', str(row['survey_code'] or f'PHIEU_{survey_id}'))
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', f'attachment; filename="Bao_cao_phong_van_{safe_code}.pdf"')
                    self.send_header('Content-Length', str(len(pdf_bytes)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(pdf_bytes)
                    return
                except Exception as e:
                    self._send_json({'error': f'Lỗi tạo PDF: {str(e)}'}, 500)
                    return

        elif path.startswith('/api/surveys/'):
            survey_id = path.split('/')[-1]
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT * FROM surveys WHERE id = ?', (survey_id,))
            row = cur.fetchone()
            if row:
                cols = [c[0] for c in cur.description]
                res = dict(zip(cols, row))
                res['answers'] = json.loads(res.get('answers_json') or '{}')
                if res.get('photo_path'):
                    res['photo_url'] = f"/api/photos/{res['photo_path']}"
                conn.close()
                self._send_json(res)
            else:
                conn.close()
                self._send_json({'error': 'Survey not found'}, 404)
            return

        elif path == '/api/export/excel':
            # Chặn tài khoản Chỉ Xem tải dữ liệu Excel
            role_param = query.get('role', [None])[0] or self.headers.get('X-User-Role', '')
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if role_param == 'viewer' or auth_key == PASS_VIEWER:
                self._send_json({'error': 'Tài khoản ở chế độ chỉ xem không có quyền tải xuống dữ liệu Excel!'}, 403)
                return

            try:
                import openpyxl
                from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
                from openpyxl.utils import get_column_letter

                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('SELECT * FROM surveys ORDER BY id ASC')
                cols = [c[0] for c in cur.description]
                db_rows = cur.fetchall()
                conn.close()

                surveys_list = []
                for r in db_rows:
                    item = dict(zip(cols, r))
                    if item.get('answers_json'):
                        try:
                            item['answers'] = json.loads(item['answers_json'])
                        except Exception:
                            item['answers'] = {}
                    else:
                        item['answers'] = {}
                    surveys_list.append(item)

                q_data = {}
                if os.path.exists(QUESTIONS_FILE):
                    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
                        q_data = json.load(f)

                export_file = os.path.join(BASE_DIR, "export_surveys_latest.xlsx")
                wb = openpyxl.Workbook()
                wb.properties.creator = "Lộc Vũ Trung"
                wb.properties.lastModifiedBy = "Lộc Vũ Trung"

                font_header = Font(name="Arial", size=10, bold=True, color="FFFFFF")
                font_normal = Font(name="Arial", size=9)
                fill_header = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
                thin_border = Border(
                    left=Side(style='thin', color='D0D7DE'),
                    right=Side(style='thin', color='D0D7DE'),
                    top=Side(style='thin', color='D0D7DE'),
                    bottom=Side(style='thin', color='D0D7DE')
                )

                # Sheet 1: Danh_sach_phieu
                ws1 = wb.active
                ws1.title = "Danh_sach_phieu"
                ws1.views.sheetView[0].showGridLines = True
                headers_s1 = ["STT", "Mã Phiếu", "Mã Công Cụ", "Tên Công Cụ", "Địa Bàn Xã", "Thôn/Buôn", "Người Được Phỏng Vấn", "Mã Điều Tra Viên", "Tên Điều Tra Viên", "Ngày Khảo Sát", "Tọa Độ Vĩ Độ", "Tọa Độ Kinh Độ", "Ảnh Hiện Trường (Watermark)", "Thời Gian Gửi"]
                ws1.append(headers_s1)
                for col_idx in range(1, len(headers_s1) + 1):
                    c = ws1.cell(1, col_idx)
                    c.font = font_header
                    c.fill = fill_header
                    c.alignment = Alignment(horizontal="center", vertical="center")

                for idx, s in enumerate(surveys_list, 1):
                    p_name = s.get('photo_path') or ''
                    row_vals = [
                        idx, s.get('survey_code', ''), s.get('tool_code', ''), s.get('tool_name', ''),
                        s.get('commune', ''), s.get('hamlet', ''), s.get('respondent_name', ''),
                        s.get('surveyor_id', ''), s.get('surveyor_name', ''), s.get('survey_date', ''),
                        s.get('gps_lat', 0.0), s.get('gps_lng', 0.0), p_name if p_name else 'Chưa có', s.get('created_at', '')
                    ]
                    ws1.append(row_vals)
                    for c_idx in range(1, len(row_vals) + 1):
                        cell = ws1.cell(idx + 1, c_idx)
                        cell.font = font_normal
                        cell.border = thin_border
                        if c_idx in (1, 2, 3, 10):
                            cell.alignment = Alignment(horizontal="center", vertical="center")

                # Sheet 2: Du_lieu_chi_tiet (384 cột câu hỏi)
                ws2 = wb.create_sheet(title="Du_lieu_chi_tiet")
                ws2.views.sheetView[0].showGridLines = True
                all_q_cols = []
                for tool_code in ['P1', 'KIP', 'MH', 'NT', 'SDM', 'HTX', 'CQ', 'TT']:
                    t_obj = q_data.get(tool_code)
                    if t_obj and t_obj.get('questions'):
                        for q in t_obj['questions']:
                            code = q['code']
                            short_text = q['text'][:40] + ("..." if len(q['text']) > 40 else "")
                            all_q_cols.append({
                                'tool': tool_code,
                                'code': code,
                                'type': str(q.get('type') or 'TX').upper(),
                                'header': f"[{code}] {short_text}"
                            })

                fixed_headers = ["Mã Phiếu", "Công Cụ", "Xã", "Thôn/Buôn", "Người Được Hỏi", "Mã ĐTV", "Ngày Khảo Sát"]
                detail_headers = fixed_headers + [col['header'] for col in all_q_cols]
                ws2.append(detail_headers)
                for col_idx in range(1, len(detail_headers) + 1):
                    c = ws2.cell(1, col_idx)
                    c.font = font_header
                    c.fill = fill_header
                    c.alignment = Alignment(horizontal="center", vertical="center")

                for idx, s in enumerate(surveys_list, 1):
                    ans = s.get('answers') or {}
                    row_vals = [s.get('survey_code', ''), s.get('tool_code', ''), s.get('commune', ''), s.get('hamlet', ''), s.get('respondent_name', ''), s.get('surveyor_id', ''), s.get('survey_date', '')]
                    for col in all_q_cols:
                        val = ans.get(col['code'], '')
                        if isinstance(val, list):
                            row_vals.append("; ".join(str(v) for v in val))
                        elif val is not None and val != '':
                            if col['type'] in ('SO', 'NUM', 'LK'):
                                try:
                                    fval = float(val)
                                    row_vals.append(int(fval) if fval.is_integer() else fval)
                                except Exception:
                                    row_vals.append(str(val))
                            else:
                                row_vals.append(str(val))
                        else:
                            row_vals.append("")
                    ws2.append(row_vals)
                    for c_idx in range(1, len(row_vals) + 1):
                        cell = ws2.cell(idx + 1, c_idx)
                        cell.font = font_normal
                        cell.border = thin_border

                # Sheet 3: Ma_tran_KPI
                ws3 = wb.create_sheet(title="Ma_tran_KPI")
                ws3.views.sheetView[0].showGridLines = True
                kpi_headers = ["Mã KPI", "Tên Chỉ Số Kết Quả", "Đơn Vị", "Mục Tiêu 2025", "Báo Cáo 2021-2025", "% Đạt (Kế hoạch)", "Số Phiếu Khảo Sát Đã Thu", "Câu Hỏi Đo Tương Ứng"]
                ws3.append(kpi_headers)
                for col_idx in range(1, len(kpi_headers) + 1):
                    c = ws3.cell(1, col_idx)
                    c.font = font_header
                    c.fill = fill_header
                    c.alignment = Alignment(horizontal="center", vertical="center")

                orig_kpi_path = os.path.join(BASE_DIR, '..', 'Draft_Ke hoach_V5', '04_HeThongBangHoi_DGCK_Dakman_F1_VN.xlsx')
                if os.path.exists(orig_kpi_path):
                    wb_orig = openpyxl.load_workbook(orig_kpi_path, data_only=True)
                    ws_orig_kpi = wb_orig['Ma_tran_KPI']
                    r_target = 2
                    for r in range(5, 36):
                        kpi_code = ws_orig_kpi.cell(r, 1).value
                        kpi_name = ws_orig_kpi.cell(r, 2).value
                        kpi_unit = ws_orig_kpi.cell(r, 3).value
                        kpi_target = ws_orig_kpi.cell(r, 5).value
                        kpi_rep = ws_orig_kpi.cell(r, 6).value
                        kpi_q = ws_orig_kpi.cell(r, 9).value
                        if kpi_code and kpi_name:
                            ws3.append([
                                kpi_code, kpi_name, kpi_unit or '', kpi_target or 0, kpi_rep or 0,
                                f"=IF(D{r_target}>0, E{r_target}/D{r_target}, 0)",
                                f"=COUNTA(Du_lieu_chi_tiet!A:A)-1",
                                kpi_q or ''
                            ])
                            for c_idx in range(1, 9):
                                cell = ws3.cell(r_target, c_idx)
                                cell.font = font_normal
                                cell.border = thin_border
                                align_h = "center" if c_idx in (1, 3, 6, 7) else ("right" if c_idx in (4, 5) else "left")
                                cell.alignment = Alignment(horizontal=align_h, vertical="center")
                                if c_idx == 6:
                                    cell.number_format = '0.0%'
                            r_target += 1

                # Sheet 4: Tu_dien_ma_hoa (Data Dictionary để matching mã câu hỏi & mã đáp án khi phân tích)
                ws4 = wb.create_sheet(title="Tu_dien_ma_hoa")
                ws4.views.sheetView[0].showGridLines = True
                dict_headers = ["Công Cụ", "Mã Câu Hỏi", "Phần / Mục", "Nội Dung Câu Hỏi Đầy Đủ", "Kiểu Dữ Liệu", "Bảng Mã Hóa Đáp Án (Value = Label)", "Điều Kiện Hiển Thị"]
                ws4.append(dict_headers)
                for col_idx in range(1, len(dict_headers) + 1):
                    c = ws4.cell(1, col_idx)
                    c.font = font_header
                    c.fill = fill_header
                    c.alignment = Alignment(horizontal="center", vertical="center")

                dict_row_idx = 2
                for t_code, t_obj in q_data.items():
                    for q in (t_obj.get('questions') or []):
                        opts = q.get('options') or []
                        opts_str = "; ".join(f"{o.get('value')}={o.get('label')}" for o in opts) if opts else (q.get('options_raw') or '')
                        ws4.append([
                            t_code,
                            q.get('code', ''),
                            q.get('section', ''),
                            q.get('text', ''),
                            q.get('type', 'TX'),
                            opts_str,
                            q.get('condition', '')
                        ])
                        for c_idx in range(1, 8):
                            cell = ws4.cell(dict_row_idx, c_idx)
                            cell.font = font_normal
                            cell.border = thin_border
                            cell.alignment = Alignment(horizontal="center" if c_idx in (1, 2, 5) else "left", vertical="center", wrap_text=True)
                        dict_row_idx += 1

                for ws in [ws1, ws2, ws3, ws4]:
                    for col in ws.columns:
                        max_len = max(len(str(cell.value or '')) for cell in col)
                        col_letter = get_column_letter(col[0].column)
                        ws.column_dimensions[col_letter].width = min(max(max_len + 2, 10), 45)

                wb.save(export_file)

                with open(export_file, 'rb') as f:
                    file_bytes = f.read()

                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                self.send_header('Content-Disposition', 'attachment; filename="Dakman_Survey_FinalEvaluation.xlsx"')
                self.send_header('Content-Length', str(len(file_bytes)))
                self.end_headers()
                self.wfile.write(file_bytes)
                return
            except Exception as e:
                self._send_json({'error': f'Export failed: {str(e)}'}, 500)
                return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/login':
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
                role = data.get('role', 'editor').strip()
                password = data.get('password', '').strip()
                surveyor_id = data.get('surveyor_id', '').strip()
                full_name = data.get('full_name', '').strip()
                survey_date = data.get('survey_date', datetime.date.today().isoformat())
                commune = data.get('commune', 'Ea Kiết')

                cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
                cur_viewer_pass = get_setting('pass_viewer', PASS_VIEWER)
                cur_admin_name = get_setting('admin_name', 'Quản Trị Viên (Admin)')

                if role == 'admin':
                    if password != cur_admin_pass and password != PASS_ADMIN:
                        self._send_json({'error': 'Mật khẩu Quản trị viên (Admin) không đúng!'}, 401)
                        return
                    surveyor_id = 'ADMIN'
                    full_name = cur_admin_name
                    commune = 'Toàn vùng'

                elif role == 'viewer':
                    if password != cur_viewer_pass and password != PASS_VIEWER:
                        self._send_json({'error': 'Mật khẩu Quyền chỉ xem (Viewer) không đúng!'}, 401)
                        return
                    surveyor_id = 'VIEWER'
                    full_name = 'Khách Giám Sát (Chỉ xem)'
                    commune = 'Toàn vùng'

                elif role == 'editor':
                    if not surveyor_id:
                        self._send_json({'error': 'Vui lòng nhập Mã điều tra viên (ID) được cấp!'}, 400)
                        return
                    if not full_name:
                        self._send_json({'error': 'Vui lòng nhập Đúng Họ và Tên của bạn!'}, 400)
                        return
                    if not password:
                        self._send_json({'error': 'Vui lòng nhập Mật khẩu riêng được cấp!'}, 400)
                        return

                    conn = sqlite3.connect(DB_PATH)
                    cur = conn.cursor()
                    cur.execute('SELECT password, full_name, commune_assigned FROM users WHERE surveyor_id = ?', (surveyor_id,))
                    u = cur.fetchone()

                    if not u:
                        conn.close()
                        self._send_json({'error': f'Mã nhân viên [{surveyor_id}] chưa được Admin cấp quyền trên hệ thống! Vui lòng liên hệ Quản trị viên để nhận mã qua Zalo.'}, 401)
                        return

                    stored_pass, registered_name, commune_db = u[0], u[1], u[2]

                    # 1. Kiểm tra Họ và Tên nhập vào có khớp với mã được cấp không
                    norm_input = normalize_vn_str(full_name)
                    norm_reg = normalize_vn_str(registered_name)
                    if norm_input != norm_reg:
                        conn.close()
                        self._send_json({'error': f'Họ và tên [{full_name}] không khớp với hồ sơ mã [{surveyor_id}] được cấp! Vui lòng nhập đúng họ và tên đã đăng ký.'}, 401)
                        return

                    # 2. Kiểm tra mật khẩu riêng
                    if password != stored_pass and password != PASS_EDITOR:
                        conn.close()
                        self._send_json({'error': 'Mật khẩu điều tra viên không chính xác! Vui lòng kiểm tra lại mật khẩu do Admin cấp qua Zalo.'}, 401)
                        return

                    full_name = registered_name
                    commune = commune_db or commune or 'Ea Kiết'

                    cur.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE surveyor_id = ?', (surveyor_id,))
                    conn.commit()
                    conn.close()
                else:
                    self._send_json({'error': 'Vai trò đăng nhập không hợp lệ!'}, 400)
                    return

                self._send_json({
                    'success': True,
                    'user': {
                        'role': role,
                        'surveyor_id': surveyor_id,
                        'full_name': full_name,
                        'survey_date': survey_date,
                        'commune': commune,
                        'role_label': 'Quản Trị Viên' if role == 'admin' else ('Khách Giám Sát (Chỉ xem)' if role == 'viewer' else 'Điều Tra Viên'),
                        'key': password
                    }
                })
            except Exception as e:
                self._send_json({'error': str(e)}, 400)
            return

        elif path == '/api/admin/questions':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền chỉnh sửa bộ câu hỏi!'}, 403)
                return
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
                action = (data.get('action') or 'upsert').strip().lower()
                tool_code = str(data.get('tool_code') or '').strip()
                if not tool_code:
                    self._send_json({'error': 'Thiếu mã công cụ (tool_code)'}, 400)
                    return

                if not os.path.exists(QUESTIONS_FILE):
                    self._send_json({'error': 'Không tìm thấy file questions_data.json'}, 404)
                    return

                with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
                    all_q = json.load(f)

                if tool_code not in all_q:
                    self._send_json({'error': f'Công cụ [{tool_code}] không tồn tại'}, 404)
                    return

                # Sao lưu questions_data.json trước khi thay đổi
                ts_q = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                q_bk_path = os.path.join(AUDIT_DIR, f'questions_backup_{ts_q}.json')
                with open(q_bk_path, 'w', encoding='utf-8') as bkf:
                    json.dump(all_q, bkf, ensure_ascii=False, indent=2)

                tool_obj = all_q[tool_code]
                q_list = tool_obj.get('questions') or []

                if action == 'delete':
                    q_code = str(data.get('code') or '').strip()
                    deleted_items = [q for q in q_list if str(q.get('code')) == q_code]
                    if not deleted_items:
                        self._send_json({'error': f'Không tìm thấy câu hỏi [{q_code}]'}, 404)
                        return
                    tool_obj['questions'] = [q for q in q_list if str(q.get('code')) != q_code]
                    append_audit_event('DELETE_QUESTION', {'tool_code': tool_code, 'question': deleted_items[0]})
                    msg = f'Đã xóa câu hỏi [{q_code}] khỏi công cụ {tool_code} (đã sao lưu bản cũ).'
                else:
                    q_in = data.get('question') or {}
                    orig_code = str(data.get('orig_code') or '').strip()
                    raw_code = str(q_in.get('code') or '').strip()
                    new_code = re.sub(r'[^A-Za-z0-9_]', '_', raw_code).strip('_')
                    q_text = str(q_in.get('text') or '').strip()
                    q_sec = str(q_in.get('section') or 'Thông tin chung').strip()
                    q_type = str(q_in.get('type') or 'TX').strip().upper()
                    q_opts = q_in.get('options') or []
                    q_opts_raw = str(q_in.get('options_raw') or '').strip()
                    q_cond = str(q_in.get('condition') or '').strip()

                    if not new_code or not q_text:
                        self._send_json({'error': 'Mã câu hỏi và Nội dung câu hỏi không được để trống!'}, 400)
                        return

                    new_q_obj = {
                        'tool_code': tool_code,
                        'tool_name': tool_obj.get('tool_name', tool_code),
                        'group': tool_obj.get('group', ''),
                        'code': new_code,
                        'orig_code': new_code,
                        'section': q_sec,
                        'text': q_text,
                        'type': q_type,
                        'options_raw': q_opts_raw,
                        'options': q_opts,
                        'unit': str(q_in.get('unit') or ''),
                        'min': str(q_in.get('min') or ''),
                        'max': str(q_in.get('max') or ''),
                        'condition': q_cond,
                        'indicator': str(q_in.get('indicator') or ''),
                        'dac': str(q_in.get('dac') or '')
                    }

                    target_code = orig_code or new_code
                    idx_found = next((idx for idx, item in enumerate(q_list) if str(item.get('code')) == target_code), None)
                    if idx_found is not None:
                        old_q = q_list[idx_found]
                        new_q_obj['indicator'] = old_q.get('indicator', new_q_obj['indicator'])
                        new_q_obj['dac'] = old_q.get('dac', new_q_obj['dac'])
                        q_list[idx_found] = new_q_obj
                        append_audit_event('UPDATE_QUESTION', {'tool_code': tool_code, 'old': old_q, 'new': new_q_obj})
                        msg = f'Đã cập nhật câu hỏi [{new_code}] thành công!'
                    else:
                        if any(str(item.get('code')) == new_code for item in q_list):
                            self._send_json({'error': f'Mã câu hỏi [{new_code}] đã tồn tại trong {tool_code}!'}, 400)
                            return
                        q_list.append(new_q_obj)
                        append_audit_event('ADD_QUESTION', {'tool_code': tool_code, 'question': new_q_obj})
                        msg = f'Đã bổ sung câu hỏi mới [{new_code}] vào công cụ {tool_code}!'
                    tool_obj['questions'] = q_list

                with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(all_q, f, ensure_ascii=False, indent=2)

                self._send_json({'success': True, 'message': msg, 'all_questions': all_q})
                return
            except Exception as e:
                self._send_json({'error': f'Lỗi cập nhật câu hỏi: {str(e)}'}, 400)
                return

        elif path == '/api/admin/settings':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền thay đổi cấu hình hệ thống!'}, 403)
                return
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
                new_admin_pass = data.get('pass_admin', '').strip()
                new_viewer_pass = data.get('pass_viewer', '').strip()
                new_admin_name = data.get('admin_name', '').strip()

                if new_admin_pass:
                    set_setting('pass_admin', new_admin_pass)
                if new_viewer_pass:
                    set_setting('pass_viewer', new_viewer_pass)
                if new_admin_name:
                    set_setting('admin_name', new_admin_name)

                self._send_json({
                    'success': True,
                    'message': 'Đã cập nhật thông tin và mật khẩu quản trị thành công!',
                    'settings': {
                        'pass_admin': get_setting('pass_admin', PASS_ADMIN),
                        'pass_viewer': get_setting('pass_viewer', PASS_VIEWER),
                        'admin_name': get_setting('admin_name', 'Quản Trị Viên (Admin)')
                    }
                })
                return
            except Exception as e:
                self._send_json({'error': str(e)}, 400)
                return

        elif path.startswith('/api/admin/restore/survey/'):
            archive_id = path.split('/')[-1]
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền khôi phục phiếu!'}, 403)
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute('SELECT * FROM deleted_surveys_archive WHERE id = ?', (archive_id,))
            arch = cur.fetchone()
            if not arch:
                conn.close()
                self._send_json({'error': 'Không tìm thấy bản lưu phiếu cần khôi phục!'}, 404)
                return
            row = json.loads(arch['row_json'])
            cur.execute('SELECT id FROM surveys WHERE id = ?', (row.get('id'),))
            exists_id = cur.fetchone()
            if exists_id:
                cur.execute('''
                    INSERT INTO surveys (
                        survey_code, tool_code, tool_name, surveyor_id, surveyor_name,
                        survey_date, commune, hamlet, target_group, respondent_name,
                        respondent_phone, gps_lat, gps_lng, start_time, end_time, answers_json, photo_path, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    row.get('survey_code'), row.get('tool_code'), row.get('tool_name'),
                    row.get('surveyor_id'), row.get('surveyor_name'), row.get('survey_date'),
                    row.get('commune'), row.get('hamlet'), row.get('target_group'),
                    row.get('respondent_name'), row.get('respondent_phone'),
                    row.get('gps_lat'), row.get('gps_lng'), row.get('start_time'),
                    row.get('end_time'), row.get('answers_json'), row.get('photo_path'), row.get('created_at')
                ))
            else:
                cur.execute('''
                    INSERT INTO surveys (
                        id, survey_code, tool_code, tool_name, surveyor_id, surveyor_name,
                        survey_date, commune, hamlet, target_group, respondent_name,
                        respondent_phone, gps_lat, gps_lng, start_time, end_time, answers_json, photo_path, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    row.get('id'), row.get('survey_code'), row.get('tool_code'), row.get('tool_name'),
                    row.get('surveyor_id'), row.get('surveyor_name'), row.get('survey_date'),
                    row.get('commune'), row.get('hamlet'), row.get('target_group'),
                    row.get('respondent_name'), row.get('respondent_phone'),
                    row.get('gps_lat'), row.get('gps_lng'), row.get('start_time'),
                    row.get('end_time'), row.get('answers_json'), row.get('photo_path'), row.get('created_at')
                ))
            cur.execute('DELETE FROM deleted_surveys_archive WHERE id = ?', (archive_id,))
            conn.commit()
            conn.close()
            append_audit_event('RESTORE_SURVEY', {'archive_id': archive_id, 'survey_code': row.get('survey_code')})
            self._send_json({'success': True, 'message': f"Đã khôi phục phiếu [{row.get('survey_code')}] thành công!"})
            return

        elif path.startswith('/api/admin/restore/user/'):
            archive_id = path.split('/')[-1]
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền khôi phục nhân sự!'}, 403)
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute('SELECT * FROM deleted_users_archive WHERE id = ?', (archive_id,))
            arch = cur.fetchone()
            if not arch:
                conn.close()
                self._send_json({'error': 'Không tìm thấy bản lưu nhân sự cần khôi phục!'}, 404)
                return
            row = json.loads(arch['row_json'])
            cur.execute('''
                INSERT OR REPLACE INTO users (surveyor_id, full_name, phone, role, commune_assigned, password, last_login)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                row.get('surveyor_id'), row.get('full_name'), row.get('phone'),
                row.get('role') or 'Điều tra viên', row.get('commune_assigned'),
                row.get('password') or PASS_EDITOR, row.get('last_login')
            ))
            cur.execute('DELETE FROM deleted_users_archive WHERE id = ?', (archive_id,))
            conn.commit()
            conn.close()
            append_audit_event('RESTORE_USER', {'archive_id': archive_id, 'surveyor_id': row.get('surveyor_id')})
            self._send_json({'success': True, 'message': f"Đã khôi phục tài khoản [{row.get('full_name')} - {row.get('surveyor_id')}] thành công!"})
            return

        elif path == '/api/admin/users':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền cấp tài khoản nhân sự!'}, 403)
                return
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
                sid = data.get('surveyor_id', '').strip()
                name = data.get('full_name', '').strip()
                phone = data.get('phone', '').strip()
                commune = data.get('commune_assigned', 'Ea Kiết')
                pwd = data.get('password', 'Edit123a#').strip()

                if not sid or not name:
                    self._send_json({'error': 'Mã nhân viên (ID) và Họ tên không được để trống!'}, 400)
                    return

                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute('''
                    INSERT INTO users (surveyor_id, full_name, phone, role, commune_assigned, password, last_login)
                    VALUES (?, ?, ?, 'Điều tra viên', ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(surveyor_id) DO UPDATE SET
                        full_name = excluded.full_name,
                        phone = excluded.phone,
                        commune_assigned = excluded.commune_assigned,
                        password = excluded.password
                ''', (sid, name, phone, commune, pwd))
                conn.commit()
                conn.close()

                self._send_json({
                    'success': True,
                    'message': f'Đã cấp tài khoản thành công cho nhân viên {name} ({sid})',
                    'user': {
                        'surveyor_id': sid,
                        'full_name': name,
                        'phone': phone,
                        'commune_assigned': commune,
                        'password': pwd
                    }
                })
                return
            except Exception as e:
                self._send_json({'error': str(e)}, 400)
                return

        elif path == '/api/surveys':
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
            except Exception as e:
                self._send_json({'error': f'Invalid JSON: {str(e)}'}, 400)
                return

            # Chặn tài khoản Chỉ Xem
            role = data.get('role', 'editor')
            if role == 'viewer':
                self._send_json({'error': 'Tài khoản ở chế độ chỉ xem, không có quyền tạo hoặc nộp phiếu!'}, 403)
                return

            survey_code = data.get('survey_code') or f"DKM-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
            tool_code = data.get('tool_code', 'P1')
            tool_name = data.get('tool_name', 'P1 - Phiếu hộ')
            surveyor_id = data.get('surveyor_id', 'TCN-01-080000')
            surveyor_name = data.get('surveyor_name', 'Điều tra viên')
            survey_date = data.get('survey_date', datetime.date.today().isoformat())
            commune = data.get('commune', 'Ea Kiết')
            hamlet = data.get('hamlet', '')
            target_group = data.get('target_group', 'Nhóm 1: Nông Dân')
            respondent_name = data.get('respondent_name', '')
            respondent_phone = data.get('respondent_phone', '')
            gps_lat = data.get('gps_lat', 0.0)
            gps_lng = data.get('gps_lng', 0.0)
            start_time = data.get('start_time', '')
            end_time = data.get('end_time', '')
            answers = data.get('answers', {})
            answers_json = json.dumps(answers, ensure_ascii=False)
            photo_path = save_survey_photo(survey_code, data.get('photo_data'))

            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO surveys (
                    survey_code, tool_code, tool_name, surveyor_id, surveyor_name,
                    survey_date, commune, hamlet, target_group, respondent_name,
                    respondent_phone, gps_lat, gps_lng, start_time, end_time, answers_json, photo_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                survey_code, tool_code, tool_name, surveyor_id, surveyor_name,
                survey_date, commune, hamlet, target_group, respondent_name,
                respondent_phone, gps_lat, gps_lng, start_time, end_time, answers_json, photo_path
            ))
            survey_id = cur.lastrowid
            cur.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE surveyor_id = ?', (surveyor_id,))
            conn.commit()
            conn.close()

            self._send_json({
                'success': True,
                'message': 'Khảo sát đã được lưu thành công vào cơ sở dữ liệu máy chủ',
                'survey_id': survey_id,
                'survey_code': survey_code,
                'photo_path': photo_path
            }, 201)
            return

        self._send_json({'error': 'Not found'}, 404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/admin/users/'):
            user_id = path.split('/')[-1]
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền cập nhật nhân sự/cấp lại mật khẩu!'}, 403)
                return
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                cur.execute("""
                    UPDATE users SET 
                        full_name = COALESCE(?, full_name),
                        phone = COALESCE(?, phone),
                        commune_assigned = COALESCE(?, commune_assigned),
                        password = COALESCE(?, password)
                    WHERE surveyor_id = ? OR id = ?
                """, (
                    data.get('full_name'),
                    data.get('phone'),
                    data.get('commune_assigned'),
                    data.get('password'),
                    user_id, user_id
                ))
                conn.commit()
                conn.close()
                self._send_json({'success': True, 'message': 'Đã cập nhật thông tin và mật khẩu nhân sự thành công'})
                return
            except Exception as e:
                self._send_json({'error': str(e)}, 400)
                return

        elif path.startswith('/api/surveys/'):
            survey_id = path.split('/')[-1]
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
            except Exception as e:
                self._send_json({'error': f'Invalid JSON: {str(e)}'}, 400)
                return

            role = data.get('role', 'editor')
            if role == 'viewer':
                self._send_json({'error': 'Chế độ chỉ xem không được phép cập nhật hoặc sửa đổi phiếu!'}, 403)
                return

            answers = data.get('answers')
            photo_data = data.get('photo_data')
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            cur.execute('SELECT * FROM surveys WHERE id = ?', (survey_id,))
            old_row = cur.fetchone()
            if old_row:
                old_dict = dict(old_row)
                cur.execute('''
                    INSERT INTO surveys_revision_history (survey_id, survey_code, updated_by, row_json)
                    VALUES (?, ?, ?, ?)
                ''', (survey_id, old_dict.get('survey_code'), role, json.dumps(old_dict, ensure_ascii=False)))
                append_audit_event('UPDATE_SURVEY', {'survey_id': survey_id, 'survey_code': old_dict.get('survey_code'), 'updated_by': role})

            photo_path = ''
            if photo_data:
                s_code = data.get('survey_code')
                if not s_code:
                    cur.execute('SELECT survey_code FROM surveys WHERE id = ?', (survey_id,))
                    row_code = cur.fetchone()
                    s_code = row_code[0] if row_code else f'SURVEY_{survey_id}'
                photo_path = save_survey_photo(s_code, photo_data)

            if answers is not None and isinstance(answers, dict) and len(answers) > 0:
                answers_json = json.dumps(answers, ensure_ascii=False)
                cur.execute('''
                    UPDATE surveys SET 
                        survey_code = COALESCE(?, survey_code),
                        commune = COALESCE(?, commune),
                        hamlet = COALESCE(?, hamlet),
                        respondent_name = COALESCE(?, respondent_name),
                        respondent_phone = COALESCE(?, respondent_phone),
                        surveyor_name = COALESCE(?, surveyor_name),
                        survey_date = COALESCE(?, survey_date),
                        gps_lat = COALESCE(?, gps_lat),
                        gps_lng = COALESCE(?, gps_lng),
                        answers_json = ?,
                        photo_path = COALESCE(NULLIF(?, ''), photo_path)
                    WHERE id = ?
                ''', (
                    data.get('survey_code'),
                    data.get('commune'),
                    data.get('hamlet'),
                    data.get('respondent_name'),
                    data.get('respondent_phone'),
                    data.get('surveyor_name'),
                    data.get('survey_date'),
                    data.get('gps_lat'),
                    data.get('gps_lng'),
                    answers_json,
                    photo_path,
                    survey_id
                ))
            else:
                cur.execute('''
                    UPDATE surveys SET 
                        survey_code = COALESCE(?, survey_code),
                        commune = COALESCE(?, commune),
                        hamlet = COALESCE(?, hamlet),
                        respondent_name = COALESCE(?, respondent_name),
                        respondent_phone = COALESCE(?, respondent_phone),
                        surveyor_name = COALESCE(?, surveyor_name),
                        survey_date = COALESCE(?, survey_date),
                        gps_lat = COALESCE(?, gps_lat),
                        gps_lng = COALESCE(?, gps_lng),
                        photo_path = COALESCE(NULLIF(?, ''), photo_path)
                    WHERE id = ?
                ''', (
                    data.get('survey_code'),
                    data.get('commune'),
                    data.get('hamlet'),
                    data.get('respondent_name'),
                    data.get('respondent_phone'),
                    data.get('surveyor_name'),
                    data.get('survey_date'),
                    data.get('gps_lat'),
                    data.get('gps_lng'),
                    photo_path,
                    survey_id
                ))
            conn.commit()
            conn.close()
            self._send_json({'success': True, 'message': f'Đã cập nhật chỉnh sửa phiếu #{survey_id} thành công!'})
            return
        self._send_json({'error': 'Not found'}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/admin/users/'):
            user_id = path.split('/')[-1]
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền xóa tài khoản nhân sự!'}, 403)
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute('SELECT * FROM users WHERE surveyor_id = ? OR id = ?', (user_id, user_id))
            deleted_rows = [dict(r) for r in cur.fetchall()]
            for u_row in deleted_rows:
                cur.execute('''
                    INSERT INTO deleted_users_archive (original_id, surveyor_id, full_name, commune_assigned, deleted_by, row_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    u_row.get('id'), u_row.get('surveyor_id'), u_row.get('full_name'),
                    u_row.get('commune_assigned'), 'admin', json.dumps(u_row, ensure_ascii=False)
                ))
                append_audit_event('DELETE_USER', u_row)
            cur.execute('DELETE FROM users WHERE surveyor_id = ? OR id = ?', (user_id, user_id))
            conn.commit()
            conn.close()
            self._send_json({'success': True, 'message': f'Đã chuyển tài khoản nhân sự [{user_id}] vào Thùng rác lưu trữ (có thể khôi phục bất cứ lúc nào).'})
            return

        elif path.startswith('/api/surveys/'):
            survey_id = path.split('/')[-1]
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            delete_pwd = (self.headers.get('X-Delete-Password', '') or self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')).strip()
            role_hdr = self.headers.get('X-User-Role', '').strip().lower()
            sid_hdr = self.headers.get('X-User-Id', '').strip()

            if role_hdr == 'viewer':
                self._send_json({'error': 'Tài khoản Chỉ Xem không có quyền xóa phiếu!'}, 403)
                return

            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute('SELECT * FROM surveys WHERE id = ?', (survey_id,))
            s_row = cur.fetchone()
            if not s_row:
                conn.close()
                self._send_json({'error': 'Không tìm thấy phiếu cần xóa!'}, 404)
                return

            s_dict = dict(s_row)
            is_admin_pwd = bool(delete_pwd) and (delete_pwd == cur_admin_pass or delete_pwd == PASS_ADMIN)
            is_owner_pwd = False
            if not is_admin_pwd and role_hdr == 'editor' and sid_hdr and delete_pwd:
                row_sid = str(s_dict.get('surveyor_id') or '').strip()
                if not row_sid or row_sid == sid_hdr:
                    cur.execute('SELECT password FROM users WHERE surveyor_id = ?', (sid_hdr,))
                    u_row = cur.fetchone()
                    expected_pwd = (u_row['password'] if u_row and u_row['password'] else PASS_EDITOR)
                    if delete_pwd == expected_pwd or delete_pwd == PASS_EDITOR:
                        is_owner_pwd = True

            if not is_admin_pwd and not is_owner_pwd:
                conn.close()
                self._send_json({'error': 'Mật khẩu xác nhận không đúng hoặc bạn không có quyền xóa phiếu này!'}, 403)
                return

            deleted_by = 'admin' if is_admin_pwd else sid_hdr
            cur.execute('''
                INSERT INTO deleted_surveys_archive (original_id, survey_code, tool_code, surveyor_id, respondent_name, deleted_by, row_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                s_dict.get('id'), s_dict.get('survey_code'), s_dict.get('tool_code'),
                s_dict.get('surveyor_id'), s_dict.get('respondent_name'), deleted_by,
                json.dumps(s_dict, ensure_ascii=False)
            ))
            append_audit_event('DELETE_SURVEY', {'survey': s_dict, 'deleted_by': deleted_by})
            cur.execute('DELETE FROM surveys WHERE id = ?', (survey_id,))
            conn.commit()
            conn.close()
            self._send_json({'success': True, 'message': f'Đã chuyển phiếu #{survey_id} vào Thùng rác lưu trữ (có thể khôi phục bất cứ lúc nào).'})
            return
        self._send_json({'error': 'Not found'}, 404)

def run():
    print(f"============================================================")
    print(f" Dakman Survey VPS Web Service Starting...")
    print(f" Target Domain: https://dakmansurvey.slowforest.vn")
    print(f" Local Port:    http://localhost:{PORT}")
    print(f" Database:      {DB_PATH}")
    print(f" Web Root:      {PUBLIC_DIR}")
    print(f"============================================================")
    server = HTTPServer(('0.0.0.0', PORT), SurveyRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server gracefully...")
        server.server_close()

if __name__ == '__main__':
    run()
