"""
Dakman Final Evaluation Webapp Server
Domain: dakmansurvey.coffeedata.it.com
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
    cur.execute('''
        CREATE TABLE IF NOT EXISTS survey_drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_key TEXT UNIQUE,
            tool_code TEXT,
            survey_code TEXT,
            surveyor_id TEXT,
            surveyor_name TEXT,
            survey_date TEXT,
            commune TEXT,
            hamlet TEXT,
            respondent_name TEXT,
            respondent_phone TEXT,
            guide_name TEXT,
            gps_lat REAL,
            gps_lng REAL,
            current_section TEXT,
            photo_path TEXT,
            photo_meta TEXT,
            answers_json TEXT,
            answered_count INTEGER DEFAULT 0,
            total_count INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('pass_admin', 'AAdmin123'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('pass_viewer', 'View123'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('admin_name', 'Quản Trị Viên (Admin)'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('smtp_sender', 'coffeedatavn@gmail.com'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('smtp_password', 'maytinh123@TCN'))
    cur.execute('INSERT OR IGNORE INTO system_settings (key, val) VALUES (?, ?)', ('report_recipients', 'dothanhduy21vn@gmail.com, locvutrung@gmail.com'))
    conn.commit()
    try:
        cur.execute('ALTER TABLE users ADD COLUMN password TEXT')
    except Exception:
        pass

    # Seed 06 official surveyors + 1 supervisor from sample assignment plan
    cur.execute('SELECT COUNT(*) FROM users')
    if cur.fetchone()[0] == 0:
        seed_users = [
            ('TCN01', 'Lê Đình Duy', '0988 669 112', 'Điều tra viên', 'Ea Kiết', 'Edit123a#'),
            ('TCN02', 'Phan Doãn Vọng', '0946 371 871', 'Điều tra viên', 'Ea Tar', 'Edit123a#1'),
            ('TCN03', 'Phạm Văn Thao', '0914787479', 'Điều tra viên', 'Ea Kiết', 'Thao12345#x'),
            ('TCN04', 'Nguyễn Viết Trụ', '0988049504', 'Điều tra viên', 'Ea Kiết', 'GsTru1237#c'),
            ('TCN05', 'Cao Thị Phúc', '0815287782', 'Điều tra viên', 'Ea Kiết', 'Phuc165m#'),
            ('TCN06', 'Hoàng Trường Sinh', '0935284943', 'Điều tra viên', 'Ea Kiết', 'hPsestXh')
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

DAILY_REPORT_RECIPIENTS = ["dothanhduy21vn@gmail.com", "locvutrung@gmail.com"]
DAILY_REPORT_SENDER = "coffeedatavn@gmail.com"

def _excel_safe_val(val, q_type="TX"):
    if isinstance(val, list):
        return "; ".join(str(v) for v in val)
    if val is None or val == "":
        return ""
    if str(q_type).upper() in ("SO", "NUM", "LK"):
        try:
            fval = float(val)
            return int(fval) if fval.is_integer() else fval
        except Exception:
            return str(val)
    return str(val)

def build_multisheet_excel(export_file=None):
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT * FROM surveys ORDER BY id ASC')
    cols = [c[0] for c in cur.description]
    db_rows = cur.fetchall()
    cur.execute('SELECT surveyor_id, full_name, commune_assigned FROM users ORDER BY id ASC')
    users_rows = cur.fetchall()
    conn.close()

    surveys_list = []
    for r in db_rows:
        item = dict(zip(cols, r))
        try:
            item['answers'] = json.loads(item.get('answers_json') or '{}')
        except Exception:
            item['answers'] = {}
        surveys_list.append(item)

    q_data = {}
    if os.path.exists(QUESTIONS_FILE):
        with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
            q_data = json.load(f)

    if not export_file:
        export_file = os.path.join(BASE_DIR, "export_surveys_latest.xlsx")

    wb = openpyxl.Workbook()
    wb.properties.creator = "Lộc Vũ Trung"
    wb.properties.lastModifiedBy = "Lộc Vũ Trung"

    font_title = Font(name="Arial", size=12, bold=True, color="002060")
    font_header = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    font_bold = Font(name="Arial", size=9, bold=True)
    font_normal = Font(name="Arial", size=9)
    fill_header = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
    fill_sub = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin', color='D0D7DE'),
        right=Side(style='thin', color='D0D7DE'),
        top=Side(style='thin', color='D0D7DE'),
        bottom=Side(style='thin', color='D0D7DE')
    )

    def style_header_row(ws, row_num, ncols):
        ws.row_dimensions[row_num].height = 24
        for c_i in range(1, ncols + 1):
            c = ws.cell(row_num, c_i)
            c.font = font_header
            c.fill = fill_header
            c.border = thin_border
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Sheet 1: Danh_Sach_Phieu
    ws1 = wb.active
    ws1.title = "Danh_Sach_Phieu"
    ws1.views.sheetView[0].showGridLines = True
    headers_s1 = [
        "STT", "Mã Phiếu", "Mã Công Cụ", "Tên Công Cụ", "Địa Bàn Xã", "Thôn/Buôn",
        "Người Được Phỏng Vấn", "Số Điện Thoại", "Người Dẫn Đường",
        "Mã ĐTV", "Tên Điều Tra Viên", "Ngày Khảo Sát",
        "Bắt Đầu", "Kết Thúc", "Vĩ Độ", "Kinh Độ", "Ảnh Watermark", "Thời Gian Gửi"
    ]
    ws1.append(headers_s1)
    style_header_row(ws1, 1, len(headers_s1))

    for idx, s in enumerate(surveys_list, 1):
        ans = s.get('answers') or {}
        p_name = s.get('photo_path') or ''
        row_vals = [
            idx, s.get('survey_code', ''), s.get('tool_code', ''), s.get('tool_name', ''),
            s.get('commune', ''), s.get('hamlet', ''), s.get('respondent_name', ''),
            s.get('respondent_phone') or ans.get('_phone', ''),
            ans.get('_guide', ''),
            s.get('surveyor_id', ''), s.get('surveyor_name', ''), s.get('survey_date', ''),
            ans.get('_started_at', '') or s.get('start_time', ''),
            ans.get('_completed_at', '') or s.get('end_time', ''),
            s.get('gps_lat', 0.0), s.get('gps_lng', 0.0),
            p_name if p_name else 'Chưa có', s.get('created_at', '')
        ]
        ws1.append(row_vals)
        for c_idx in range(1, len(row_vals) + 1):
            cell = ws1.cell(idx + 1, c_idx)
            cell.font = font_normal
            cell.border = thin_border
            cell.alignment = Alignment(
                horizontal="center" if c_idx in (1, 2, 3, 10, 12) else ("right" if c_idx in (15, 16) else "left"),
                vertical="center"
            )

    # Sheet 2: Tong_Hop_Tien_Do (dùng công thức COUNTIF / SUM liên kết Danh_Sach_Phieu)
    ws_sum = wb.create_sheet(title="Tong_Hop_Tien_Do", index=0)
    ws_sum.views.sheetView[0].showGridLines = True
    ws_sum["A1"] = "BÁO CÁO TỔNG HỢP PHỎNG VẤN ĐÁNH GIÁ CUỐI KỲ DAKMAN CƯ M'GAR"
    ws_sum["A1"].font = font_title
    ws_sum["A2"] = f"Thời điểm xuất: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
    ws_sum["A2"].font = font_normal

    ws_sum.cell(4, 1, "Mã Công Cụ")
    ws_sum.cell(4, 2, "Đối Tượng / Công Cụ")
    ws_sum.cell(4, 3, "Chỉ Tiêu")
    ws_sum.cell(4, 4, "Đã Thu Thập")
    ws_sum.cell(4, 5, "% Hoàn Thành")
    style_header_row(ws_sum, 4, 5)
    tool_targets = [
        ("P1", "Hộ nông dân", 220),
        ("NT", "Nhóm trưởng, đại diện nhóm hộ & trưởng thôn", 10),
        ("CQ", "Chính quyền địa phương - 3 xã", 3),
        ("HTX", "Ban quản lý 3 HTX", 3),
        ("TT", "Nhà tài trợ (IDH & JDE Peet's)", 2),
        ("MH", "Chủ mô hình trình diễn", 2),
    ]
    r_idx = 5
    for t_code, t_name, t_target in tool_targets:
        ws_sum.cell(r_idx, 1, t_code)
        ws_sum.cell(r_idx, 2, t_name)
        ws_sum.cell(r_idx, 3, t_target)
        ws_sum.cell(r_idx, 4, f'=COUNTIF(Danh_Sach_Phieu!C:C, A{r_idx})')
        ws_sum.cell(r_idx, 5, f'=IF(C{r_idx}>0, D{r_idx}/C{r_idx}, 0)')
        for c_i in range(1, 6):
            cell = ws_sum.cell(r_idx, c_i)
            cell.font = font_normal
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center" if c_i == 1 else ("right" if c_i >= 3 else "left"), vertical="center")
        ws_sum.cell(r_idx, 5).number_format = "0.0%"
        r_idx += 1
    ws_sum.cell(r_idx, 1, "TỔNG")
    ws_sum.cell(r_idx, 2, "Tổng cộng toàn bộ công cụ")
    ws_sum.cell(r_idx, 3, f"=SUM(C5:C{r_idx-1})")
    ws_sum.cell(r_idx, 4, f"=SUM(D5:D{r_idx-1})")
    ws_sum.cell(r_idx, 5, f"=IF(C{r_idx}>0, D{r_idx}/C{r_idx}, 0)")
    for c_i in range(1, 6):
        cell = ws_sum.cell(r_idx, c_i)
        cell.font = font_bold
        cell.fill = fill_sub
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="center" if c_i == 1 else ("right" if c_i >= 3 else "left"), vertical="center")
    ws_sum.cell(r_idx, 5).number_format = "0.0%"

    r_idx += 2
    ws_sum.cell(r_idx, 1, "Mã ĐTV")
    ws_sum.cell(r_idx, 2, "Họ Tên Điều Tra Viên")
    ws_sum.cell(r_idx, 3, "Địa Bàn Phân Công")
    ws_sum.cell(r_idx, 4, "Số Phiếu Đã Gửi")
    ws_sum.cell(r_idx, 5, "Tỷ Trọng")
    style_header_row(ws_sum, r_idx, 5)
    u_start = r_idx + 1
    r_idx = u_start
    for u_sid, u_name, u_comm in users_rows:
        ws_sum.cell(r_idx, 1, u_sid)
        ws_sum.cell(r_idx, 2, u_name)
        ws_sum.cell(r_idx, 3, u_comm)
        ws_sum.cell(r_idx, 4, f'=COUNTIF(Danh_Sach_Phieu!J:J, A{r_idx})')
        ws_sum.cell(r_idx, 5, f'=IF($D${u_start + len(users_rows)}>0, D{r_idx}/$D${u_start + len(users_rows)}, 0)')
        for c_i in range(1, 6):
            cell = ws_sum.cell(r_idx, c_i)
            cell.font = font_normal
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center" if c_i == 1 else ("right" if c_i >= 4 else "left"), vertical="center")
        ws_sum.cell(r_idx, 5).number_format = "0.0%"
        r_idx += 1
    if users_rows:
        ws_sum.cell(r_idx, 1, "TỔNG")
        ws_sum.cell(r_idx, 2, "Tổng theo ĐTV")
        ws_sum.cell(r_idx, 3, "")
        ws_sum.cell(r_idx, 4, f"=SUM(D{u_start}:D{r_idx-1})")
        ws_sum.cell(r_idx, 5, f"=SUM(E{u_start}:E{r_idx-1})")
        for c_i in range(1, 6):
            cell = ws_sum.cell(r_idx, c_i)
            cell.font = font_bold
            cell.fill = fill_sub
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center" if c_i == 1 else ("right" if c_i >= 4 else "left"), vertical="center")
        ws_sum.cell(r_idx, 5).number_format = "0.0%"

    # Sheets tách theo từng Phần câu hỏi P1 + từng Công cụ khác
    def build_tool_sheet(sheet_title, target_tool_code, qs_subset):
        ws_t = wb.create_sheet(title=sheet_title[:31])
        ws_t.views.sheetView[0].showGridLines = True
        fixed = ["Mã Phiếu", "Xã", "Thôn/Buôn", "Chủ Hộ / Đối Tượng", "Người Dẫn Đường", "Mã ĐTV", "Ngày Khảo Sát"]
        q_cols = []
        for q in qs_subset:
            c_code = q.get('code', '')
            q_txt = q.get('text', '')
            short_t = q_txt[:38] + ("..." if len(q_txt) > 38 else "")
            q_cols.append({'code': c_code, 'type': q.get('type', 'TX'), 'header': f"[{c_code}] {short_t}", 'is_note': False})
            if q.get('options') or q.get('follow_up_on'):
                q_cols.append({'code': f"{c_code}_note", 'type': 'TX', 'header': f"[{c_code}_note] Ghi chú/Khác", 'is_note': True})
        hdrs = fixed + [qc['header'] for qc in q_cols]
        ws_t.append(hdrs)
        style_header_row(ws_t, 1, len(hdrs))
        filtered = [s for s in surveys_list if s.get('tool_code') == target_tool_code]
        for r_i, s in enumerate(filtered, 2):
            ans = s.get('answers') or {}
            vals = [
                s.get('survey_code', ''), s.get('commune', ''), s.get('hamlet', ''),
                s.get('respondent_name', ''), ans.get('_guide', ''), s.get('surveyor_id', ''), s.get('survey_date', '')
            ]
            for qc in q_cols:
                vals.append(_excel_safe_val(ans.get(qc['code'], ''), qc['type']))
            ws_t.append(vals)
            for c_i in range(1, len(vals) + 1):
                cell = ws_t.cell(r_i, c_i)
                cell.font = font_normal
                cell.border = thin_border
                cell.alignment = Alignment(vertical="center", wrap_text=True)

    p1_qs = (q_data.get('P1') or {}).get('questions') or []
    p1_sections = []
    for q in p1_qs:
        sec = q.get('section') or 'Chung'
        if sec not in p1_sections:
            p1_sections.append(sec)
    sec_sheet_names = {
        'PHẦN A': 'P1_A_HanhChinh',
        'PHẦN B': 'P1_B_TapHuan_HoTro',
        'PHẦN C': 'P1_C_KyThuatVuon',
        'PHẦN D': 'P1_D_TaiChinh_BanHang',
        'PHẦN E': 'P1_E_AnToan_Gioi',
        'PHẦN F': 'P1_F_KhoKhan_DeXuat',
        'PHẦN G': 'P1_G_ThongTinThem',
    }
    for idx_sec, sec_name in enumerate(p1_sections, 1):
        prefix = sec_name.split('.')[0].strip().upper()
        stitle = sec_sheet_names.get(prefix, f"P1_Phan_{idx_sec}")
        sub_qs = [q for q in p1_qs if (q.get('section') or 'Chung') == sec_name]
        build_tool_sheet(stitle, 'P1', sub_qs)

    other_tools = [
        ('NT', 'NT_NhomTruong'),
        ('CQ', 'CQ_ChinhQuyen'),
        ('HTX', 'HTX_HopTacXa'),
        ('TT', 'TT_NhaTaiTro'),
        ('MH', 'MH_MoHinh'),
    ]
    for tc, stitle in other_tools:
        t_qs = (q_data.get(tc) or {}).get('questions') or []
        build_tool_sheet(stitle, tc, t_qs)

    # Sheet Tu_Dien_Cau_Hoi
    ws_dict = wb.create_sheet(title="Tu_Dien_Cau_Hoi")
    ws_dict.views.sheetView[0].showGridLines = True
    dict_headers = ["Công Cụ", "Mã Câu Hỏi", "Phần / Mục", "Nội Dung Câu Hỏi Đầy Đủ", "Kiểu Dữ Liệu", "Đáp Án Lựa Chọn", "Điều Kiện Hiển Thị"]
    ws_dict.append(dict_headers)
    style_header_row(ws_dict, 1, len(dict_headers))
    dict_r = 2
    for t_code, t_obj in q_data.items():
        for q in (t_obj.get('questions') or []):
            opts = q.get('options') or []
            opts_str = "; ".join(f"{o.get('value')}" for o in opts) if opts else (q.get('options_raw') or '')
            ws_dict.append([
                t_code, q.get('code', ''), q.get('section', ''),
                q.get('text', ''), q.get('type', 'TX'), opts_str, q.get('condition', '')
            ])
            for c_i in range(1, 8):
                cell = ws_dict.cell(dict_r, c_i)
                cell.font = font_normal
                cell.border = thin_border
                cell.alignment = Alignment(horizontal="center" if c_i in (1, 2, 5) else "left", vertical="center", wrap_text=True)
            dict_r += 1

    for ws in wb.worksheets:
        for col in ws.columns:
            max_len = max((len(str(cell.value or '')) for cell in col), default=10)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 42)

    wb.save(export_file)
    with open(export_file, 'rb') as f:
        return export_file, f.read(), len(surveys_list)

def send_daily_excel_report(recipients=None):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.base import MIMEBase
    from email.mime.text import MIMEText
    from email import encoders

    cfg_recipients = get_setting("report_recipients", "")
    if recipients:
        target_list = recipients
    elif cfg_recipients.strip():
        target_list = [e.strip() for e in re.split(r'[,;\s]+', cfg_recipients) if '@' in e]
        if not target_list:
            target_list = DAILY_REPORT_RECIPIENTS
    else:
        target_list = DAILY_REPORT_RECIPIENTS

    smtp_sender = (get_setting("smtp_sender", DAILY_REPORT_SENDER) or DAILY_REPORT_SENDER).strip()
    smtp_password = (get_setting("smtp_password", "mvsszzzqwuhhpmxq") or "").strip()

    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    export_path = os.path.join(BASE_DIR, "export_surveys_latest.xlsx")
    _, file_bytes, total_count = build_multisheet_excel(export_path)

    def _build_msg(from_addr, reply_to=None):
        m = MIMEMultipart()
        m["From"] = f"Dakman Survey System <{from_addr}>"
        m["To"] = ", ".join(target_list)
        if reply_to and reply_to != from_addr:
            m["Reply-To"] = reply_to
        m["Subject"] = f"[Dakman Cu M'gar] Bao cao tong hop phong van ngay {today_str} ({total_count} phieu)"

        body = (
            f"Kính gửi Ban Quản Lý Dự Án (Đỗ Thành Duy & Lộc Vũ Trung),\n\n"
            f"Hệ thống Khảo Sát Dakman Cư M'gar gửi đính kèm file Excel tổng hợp kết quả phỏng vấn cuối ngày {today_str}.\n"
            f"- Tổng số phiếu hiện có trên VPS: {total_count} phiếu\n"
            f"- Cấu trúc file: Gồm sheet Tổng Hợp Tiến Độ, Danh Sách Phiếu, các sheet tách theo từng phần câu hỏi (P1 Phần A–G) và các công cụ (NT, CQ, HTX, TT, MH), cùng Từ Điển Câu Hỏi.\n\n"
            f"Trân trọng,\nHệ thống Dakman Survey (https://dakmansurvey.coffeedata.it.com)"
        )
        m.attach(MIMEText(body, "plain", "utf-8"))

        part = MIMEBase("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        part.set_payload(file_bytes)
        encoders.encode_base64(part)
        attach_name = f"Dakman_Survey_KetQua_{today_str}.xlsx"
        part.add_header("Content-Disposition", f'attachment; filename="{attach_name}"')
        m.attach(part)
        return m

    if not smtp_sender or not smtp_password:
        raise RuntimeError(f"Chưa cấu hình đầy đủ Email gửi ({smtp_sender or 'trống'}) hoặc mật khẩu SMTP.")

    msg = _build_msg(smtp_sender)
    errors = []

    def _smtp_login_strict(s):
        s.user = smtp_sender
        s.password = smtp_password
        auth_feat = s.esmtp_features.get("auth", "").split()
        if "PLAIN" in auth_feat:
            code, resp = s.auth("PLAIN", s.auth_plain)
            if code != 235:
                raise smtplib.SMTPAuthenticationError(code, resp)
        else:
            s.login(smtp_sender, smtp_password)

    try:
        s = smtplib.SMTP("smtp.gmail.com", 587, timeout=30)
        s.ehlo()
        s.starttls()
        s.ehlo()
        _smtp_login_strict(s)
        s.send_message(msg)
        s.quit()
        return True, total_count, target_list, f"smtp:587:{smtp_sender}"
    except Exception as e587:
        errors.append(f"Port 587 STARTTLS: {e587}")

    try:
        s = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30)
        s.ehlo()
        _smtp_login_strict(s)
        s.send_message(msg)
        s.quit()
        return True, total_count, target_list, f"smtp:465:{smtp_sender}"
    except Exception as e465:
        errors.append(f"Port 465 SSL: {e465}")

    combined_err = " | ".join(errors)
    if "534" in combined_err or "Application-specific password required" in combined_err:
        raise RuntimeError(
            f"Gmail từ chối đăng nhập tài khoản {smtp_sender} vì Google yêu cầu Mật khẩu ứng dụng 16 ký tự (App Password) thay cho mật khẩu thường. "
            f"Hệ thống đã khóa cứng chỉ gửi qua {smtp_sender} (không dùng email trung gian khác). "
            f"Vui lòng tạo App Password trong Google Account của {smtp_sender} rồi dán vào Tab 2 Quản trị hệ thống. Chi tiết: {combined_err}"
        )
    raise RuntimeError(
        f"Không thể gửi email từ {smtp_sender} qua Gmail SMTP (không dùng email dự phòng khác). Chi tiết: {combined_err}"
    )

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
                'domain': 'dakmansurvey.coffeedata.it.com',
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

        elif path == '/api/sample-households':
            sample_file = os.path.join(PUBLIC_DIR, 'sample_households.json')
            if os.path.exists(sample_file):
                with open(sample_file, 'r', encoding='utf-8') as f:
                    self._send_json(json.load(f))
            else:
                self._send_json({'error': 'Sample households data file not found'}, 404)
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
                'admin_name': get_setting('admin_name', 'Quản Trị Viên (Admin)'),
                'smtp_sender': get_setting('smtp_sender', DAILY_REPORT_SENDER),
                'smtp_password': get_setting('smtp_password', 'mvsszzzqwuhhpmxq'),
                'report_recipients': get_setting('report_recipients', ', '.join(DAILY_REPORT_RECIPIENTS))
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

            cur.execute("SELECT commune, COUNT(*) FROM surveys WHERE tool_code = 'P1' GROUP BY commune")
            commune_counts = dict(cur.fetchall())

            cur.execute('SELECT COUNT(*) FROM surveys')
            total_surveys = cur.fetchone()[0]

            total_unique_completed = (
                tool_counts.get('P1', 0) + tool_counts.get('NT', 0) +
                tool_counts.get('CQ', 0) + tool_counts.get('HTX', 0) +
                tool_counts.get('TT', 0)
            )

            targets = {
                'total_respondents': 238,
                'total_forms': 240,
                'groups': {
                    'group1_farmers': {
                        'target': 220,
                        'completed': tool_counts.get('P1', 0),
                        'details': {
                            'P1': {'name': 'Hộ nông dân', 'target': 220, 'completed': tool_counts.get('P1', 0)},
                            'MH': {'name': 'Chủ mô hình trình diễn (trong 220 hộ, không tính trùng)', 'target': 2, 'completed': tool_counts.get('MH', 0)}
                        }
                    },
                    'group2_leaders_coops': {
                        'target': 13,
                        'completed': (tool_counts.get('NT', 0) + tool_counts.get('HTX', 0)),
                        'details': {
                            'NT': {'name': 'Nhóm trưởng, đại diện nhóm hộ & trưởng thôn', 'target': 10, 'completed': tool_counts.get('NT', 0)},
                            'HTX': {'name': 'Ban quản lý 3 HTX', 'target': 3, 'completed': tool_counts.get('HTX', 0)}
                        }
                    },
                    'group3_local_gov': {
                        'target': 3,
                        'completed': tool_counts.get('CQ', 0),
                        'details': {
                            'CQ': {'name': 'Chính quyền địa phương - đại diện 3 xã', 'target': 3, 'completed': tool_counts.get('CQ', 0)}
                        }
                    },
                    'group4_donors': {
                        'target': 2,
                        'completed': tool_counts.get('TT', 0),
                        'details': {
                            'TT': {'name': "Nhà tài trợ (IDH và JDE Peet's)", 'target': 2, 'completed': tool_counts.get('TT', 0)}
                        }
                    }
                },
                'communes_p1': {
                    'Ea Kiết': {'target': 72, 'completed': commune_counts.get('Ea Kiết', 0)},
                    'Ea Tul': {'target': 139, 'completed': commune_counts.get('Ea Tul', 0)},
                    "Cư Dliê M'nông": {'target': 9, 'completed': commune_counts.get("Cư Dliê M'nông", 0)}
                }
            }

            conn.close()
            self._send_json({
                'total_completed': total_surveys,
                'total_unique_completed': total_unique_completed,
                'tool_counts': tool_counts,
                'commune_counts': commune_counts,
                'targets': targets
            })
            return

        elif path == '/api/drafts':
            role_param = (query.get('role', [''])[0] or '').strip().lower()
            surveyor_filter = (query.get('surveyor_id', [''])[0] or '').strip()
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            sql = '''
                SELECT id, draft_key, tool_code, survey_code, surveyor_id, surveyor_name,
                       survey_date, commune, hamlet, respondent_name, respondent_phone,
                       guide_name, gps_lat, gps_lng, current_section, photo_path, photo_meta,
                       answers_json, answered_count, total_count, updated_at
                FROM survey_drafts
            '''
            params = []
            if role_param != 'admin' and surveyor_filter:
                sql += ' WHERE UPPER(surveyor_id) = UPPER(?)'
                params.append(surveyor_filter)
            sql += ' ORDER BY updated_at DESC, id DESC'
            cur.execute(sql, params)
            cols = [c[0] for c in cur.description]
            drafts = []
            for r in cur.fetchall():
                d = dict(zip(cols, r))
                try:
                    d['answers'] = json.loads(d.get('answers_json') or '{}')
                except Exception:
                    d['answers'] = {}
                if d.get('photo_path'):
                    d['photo_url'] = f"/api/photos/{d['photo_path']}"
                drafts.append(d)
            conn.close()
            self._send_json(drafts)
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
                _, file_bytes, _ = build_multisheet_excel()
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
                    cur.execute('SELECT password, full_name, commune_assigned, surveyor_id FROM users WHERE UPPER(surveyor_id) = UPPER(?) OR UPPER(full_name) = UPPER(?)', (surveyor_id, surveyor_id))
                    u = cur.fetchone()

                    if not u:
                        conn.close()
                        self._send_json({'error': f'Mã nhân viên [{surveyor_id}] chưa được Admin cấp quyền trên hệ thống! Vui lòng liên hệ Quản trị viên để nhận mã qua Zalo.'}, 401)
                        return

                    stored_pass, registered_name, commune_db, real_sid = u[0], u[1], u[2], u[3]
                    surveyor_id = real_sid

                    # 1. Kiểm tra Họ và Tên nhập vào có khớp với mã được cấp không
                    norm_input = normalize_vn_str(full_name)
                    norm_reg = normalize_vn_str(registered_name)
                    is_name_match = (norm_input == norm_reg or norm_input.endswith(' ' + norm_reg) or norm_reg.endswith(' ' + norm_input))
                    if not is_name_match:
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

        elif path == '/api/admin/send-daily-report':
            cur_admin_pass = get_setting('pass_admin', PASS_ADMIN)
            auth_key = self.headers.get('X-Admin-Key', '') or self.headers.get('Authorization', '')
            if auth_key != cur_admin_pass and auth_key != PASS_ADMIN:
                self._send_json({'error': 'Chỉ Quản trị viên mới có quyền gửi báo cáo email!'}, 403)
                return
            try:
                _, total_count, rcpts, via_note = send_daily_excel_report()
                msg_text = f'Đã tạo file Excel nhiều sheet ({total_count} phiếu) và gửi thành công tới: {", ".join(rcpts)}\n(Kênh gửi: {via_note})'
                self._send_json({
                    'success': True,
                    'via': via_note,
                    'message': msg_text
                })
            except Exception as e:
                self._send_json({'error': f'Lỗi gửi email báo cáo: {str(e)}'}, 500)
            return

        elif path == '/api/drafts':
            length = int(self.headers.get('Content-Length', 0))
            raw_body = read_request_body(self.rfile, length)
            try:
                data = json.loads(raw_body)
            except Exception as e:
                self._send_json({'error': f'Invalid JSON: {str(e)}'}, 400)
                return

            role = data.get('role', 'editor')
            if role == 'viewer':
                self._send_json({'error': 'Chế độ chỉ xem không được phép lưu tạm!'}, 403)
                return

            tool_code = (data.get('tool_code') or 'P1').strip()
            survey_code = (data.get('survey_code') or f"{tool_code}_{datetime.datetime.now().strftime('%H%M%S')}").strip()
            surveyor_id = (data.get('surveyor_id') or '').strip()
            draft_key = (data.get('draft_key') or f"{tool_code}::{survey_code}").strip()

            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT photo_path, photo_meta FROM survey_drafts WHERE draft_key = ?', (draft_key,))
            existing_draft = cur.fetchone()

            photo_path = (data.get('photo_path') or '').strip()
            if data.get('photo_data'):
                saved_p = save_survey_photo(f"DRAFT_{survey_code}", data.get('photo_data'))
                if saved_p:
                    photo_path = saved_p
            if not photo_path and existing_draft:
                photo_path = existing_draft[0] or ''

            photo_meta = (data.get('photo_meta') or (existing_draft[1] if existing_draft else '') or '').strip()
            answers = data.get('answers') or {}
            answers_json = json.dumps(answers, ensure_ascii=False)

            cur.execute('''
                INSERT INTO survey_drafts (
                    draft_key, tool_code, survey_code, surveyor_id, surveyor_name,
                    survey_date, commune, hamlet, respondent_name, respondent_phone,
                    guide_name, gps_lat, gps_lng, current_section, photo_path, photo_meta,
                    answers_json, answered_count, total_count, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(draft_key) DO UPDATE SET
                    tool_code = excluded.tool_code,
                    survey_code = excluded.survey_code,
                    surveyor_id = excluded.surveyor_id,
                    surveyor_name = excluded.surveyor_name,
                    survey_date = excluded.survey_date,
                    commune = excluded.commune,
                    hamlet = excluded.hamlet,
                    respondent_name = excluded.respondent_name,
                    respondent_phone = excluded.respondent_phone,
                    guide_name = excluded.guide_name,
                    gps_lat = excluded.gps_lat,
                    gps_lng = excluded.gps_lng,
                    current_section = excluded.current_section,
                    photo_path = COALESCE(NULLIF(excluded.photo_path, ''), survey_drafts.photo_path),
                    photo_meta = COALESCE(NULLIF(excluded.photo_meta, ''), survey_drafts.photo_meta),
                    answers_json = excluded.answers_json,
                    answered_count = excluded.answered_count,
                    total_count = excluded.total_count,
                    updated_at = CURRENT_TIMESTAMP
            ''', (
                draft_key, tool_code, survey_code, surveyor_id,
                data.get('surveyor_name', ''), data.get('survey_date', ''),
                data.get('commune', ''), data.get('hamlet', ''),
                data.get('respondent_name', ''), data.get('respondent_phone', ''),
                data.get('guide_name', ''), data.get('gps_lat', 0.0) or 0.0,
                data.get('gps_lng', 0.0) or 0.0, data.get('current_section', ''),
                photo_path, photo_meta, answers_json,
                int(data.get('answered_count', 0) or 0), int(data.get('total_count', 0) or 0)
            ))
            conn.commit()
            cur.execute('SELECT id, updated_at FROM survey_drafts WHERE draft_key = ?', (draft_key,))
            d_row = cur.fetchone()
            conn.close()
            append_audit_event('SAVE_DRAFT', {'draft_key': draft_key, 'survey_code': survey_code, 'surveyor_id': surveyor_id})
            self._send_json({
                'success': True,
                'draft_id': d_row[0] if d_row else None,
                'draft_key': draft_key,
                'photo_path': photo_path,
                'photo_url': f"/api/photos/{photo_path}" if photo_path else '',
                'updated_at': d_row[1] if d_row else datetime.datetime.now().isoformat()
            })
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
                new_smtp_sender = data.get('smtp_sender', '').strip()
                new_smtp_password = data.get('smtp_password', '').strip()
                new_report_recipients = data.get('report_recipients', '').strip()

                if new_admin_pass:
                    set_setting('pass_admin', new_admin_pass)
                if new_viewer_pass:
                    set_setting('pass_viewer', new_viewer_pass)
                if new_admin_name:
                    set_setting('admin_name', new_admin_name)
                if new_smtp_sender:
                    set_setting('smtp_sender', new_smtp_sender)
                if new_smtp_password:
                    set_setting('smtp_password', new_smtp_password)
                if new_report_recipients:
                    set_setting('report_recipients', new_report_recipients)

                self._send_json({
                    'success': True,
                    'message': 'Đã cập nhật thông tin, mật khẩu và cấu hình email thành công!',
                    'settings': {
                        'pass_admin': get_setting('pass_admin', PASS_ADMIN),
                        'pass_viewer': get_setting('pass_viewer', PASS_VIEWER),
                        'admin_name': get_setting('admin_name', 'Quản Trị Viên (Admin)'),
                        'smtp_sender': get_setting('smtp_sender', DAILY_REPORT_SENDER),
                        'smtp_password': get_setting('smtp_password', 'mvsszzzqwuhhpmxq'),
                        'report_recipients': get_setting('report_recipients', ', '.join(DAILY_REPORT_RECIPIENTS))
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

        elif path == '/api/drafts':
            role_param = (query.get('role', [''])[0] or '').strip().lower()
            surveyor_filter = (query.get('surveyor_id', [''])[0] or '').strip()
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            sql = '''
                SELECT id, draft_key, tool_code, survey_code, surveyor_id, surveyor_name,
                       survey_date, commune, hamlet, respondent_name, respondent_phone,
                       guide_name, gps_lat, gps_lng, current_section, photo_path, photo_meta,
                       answers_json, answered_count, total_count, updated_at
                FROM survey_drafts
            '''
            params = []
            if role_param != 'admin' and surveyor_filter:
                sql += ' WHERE UPPER(surveyor_id) = UPPER(?)'
                params.append(surveyor_filter)
            sql += ' ORDER BY updated_at DESC, id DESC'
            cur.execute(sql, params)
            cols = [c[0] for c in cur.description]
            drafts = []
            for r in cur.fetchall():
                d = dict(zip(cols, r))
                try:
                    d['answers'] = json.loads(d.get('answers_json') or '{}')
                except Exception:
                    d['answers'] = {}
                if d.get('photo_path'):
                    d['photo_url'] = f"/api/photos/{d['photo_path']}"
                drafts.append(d)
            conn.close()
            self._send_json(drafts)
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
            surveyor_id = data.get('surveyor_id', 'TCN01')
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
            if not photo_path:
                photo_path = (data.get('photo_path') or '').strip()

            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            draft_key = (data.get('draft_key') or f"{tool_code}::{survey_code}").strip()
            if not photo_path:
                cur.execute('SELECT photo_path FROM survey_drafts WHERE draft_key = ?', (draft_key,))
                d_photo = cur.fetchone()
                if d_photo and d_photo[0]:
                    photo_path = d_photo[0]

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
            cur.execute('DELETE FROM survey_drafts WHERE draft_key = ?', (draft_key,))
            cur.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE surveyor_id = ?', (surveyor_id,))
            conn.commit()
            conn.close()
            append_audit_event('SUBMIT_SURVEY', {
                'id': survey_id, 'survey_code': survey_code, 'tool_code': tool_code,
                'surveyor_id': surveyor_id, 'respondent_name': respondent_name
            })

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
                cur.execute('SELECT surveyor_id FROM users WHERE surveyor_id = ? OR id = ?', (user_id, user_id))
                old_u = cur.fetchone()
                old_sid = old_u[0] if old_u else user_id
                new_sid = (data.get('new_surveyor_id') or '').strip()

                cur.execute("""
                    UPDATE users SET 
                        surveyor_id = COALESCE(NULLIF(?, ''), surveyor_id),
                        full_name = COALESCE(?, full_name),
                        phone = COALESCE(?, phone),
                        commune_assigned = COALESCE(?, commune_assigned),
                        password = COALESCE(?, password)
                    WHERE surveyor_id = ? OR id = ?
                """, (
                    new_sid,
                    data.get('full_name'),
                    data.get('phone'),
                    data.get('commune_assigned'),
                    data.get('password'),
                    user_id, user_id
                ))
                if new_sid and old_sid and new_sid != old_sid:
                    cur.execute('UPDATE surveys SET surveyor_id = ? WHERE surveyor_id = ?', (new_sid, old_sid))
                    cur.execute('UPDATE survey_drafts SET surveyor_id = ? WHERE surveyor_id = ?', (new_sid, old_sid))
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

        elif path.startswith('/api/drafts/'):
            draft_ref = urllib.parse.unquote(path.split('/api/drafts/', 1)[1]).strip()
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('DELETE FROM survey_drafts WHERE draft_key = ? OR CAST(id AS TEXT) = ?', (draft_ref, draft_ref))
            conn.commit()
            conn.close()
            self._send_json({'success': True, 'message': 'Đã xóa bản nháp lưu tạm.'})
            return

        self._send_json({'error': 'Not found'}, 404)

def run():
    print(f"============================================================")
    print(f" Dakman Survey VPS Web Service Starting...")
    print(f" Target Domain: https://dakmansurvey.coffeedata.it.com")
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
    if '--send-daily-report' in sys.argv:
        ok, total, rcpts, via_note = send_daily_excel_report()
        print(f"Daily Excel report ({total} surveys) sent to {', '.join(rcpts)} via {via_note}")
    else:
        run()
