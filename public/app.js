/**
 * Hệ Thống Khảo Sát & Phỏng Vấn Hiện Trường — Dakman Cư M'gar (2021–2026)
 * Đơn vị tư vấn & thực hiện: Công ty TNHH Dịch vụ và Tư vấn Tân Cao Nguyên
 * Tác giả hệ thống: Lộc Vũ Trung
 * BẢO MẬT TỐI ĐA: CHỐNG XÂM NHẬP & CHỐNG TRÍCH XUẤT MÃ NGUỒN
 */

const API_BASE = (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:')
    ? 'https://dakmansurvey.slowforest.vn'
    : '';

function apiUrl(path) {
    if (!path) return API_BASE;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return API_BASE + (path.startsWith('/') ? path : '/' + path);
}

function getPdfExportUrl(surveyId) {
    const role = encodeURIComponent(currentUser?.role || '');
    const sid = encodeURIComponent(currentUser?.surveyor_id || '');
    return apiUrl(`/api/surveys/${surveyId}/pdf?role=${role}&surveyor_id=${sid}`);
}

let currentHouseholdPhotoData = '';
let currentHouseholdPhotoMeta = '';
let editingSurveyId = null;
let deferredInstallPrompt = null;

// Đăng ký Service Worker cho chế độ Cài App (PWA) & lưu phiên đăng nhập bền vững
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btnInstallPwa');
    if (btn) btn.style.display = 'inline-block';
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('btnInstallPwa');
    if (btn) btn.style.display = 'none';
});

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function installPwaApp() {
    if (isRunningStandalone()) {
        alert('Ứng dụng Dakman Survey đã được cài đặt trên thiết bị của bạn.');
        return;
    }
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
            deferredInstallPrompt = null;
        }
        return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
        alert(
            'HƯỚNG DẪN CÀI APP TRÊN IPHONE / IPAD (SAFARI):\n' +
            '1. Bấm biểu tượng Chia sẻ (ô vuông có mũi tên lên ⬆️) ở thanh dưới trình duyệt.\n' +
            '2. Cuộn xuống chọn "Thêm vào MH chính" (Add to Home Screen).\n' +
            '3. Bấm "Thêm" — lần sau mở App từ màn hình chính sẽ tự giữ đăng nhập, không cần nhập lại mật khẩu.'
        );
    } else {
        alert(
            'HƯỚNG DẪN CÀI APP TRÊN ĐIỆN THOẠI ANDROID (CHROME):\n' +
            '1. Bấm nút Menu (⋮) ở góc trên bên phải trình duyệt Chrome.\n' +
            '2. Chọn "Cài đặt ứng dụng" (Install app) hoặc "Thêm vào màn hình chính" (Add to Home screen).\n' +
            '3. Bấm "Cài đặt" — lần sau mở thẳng từ màn hình chính và không cần nhập lại mật khẩu.'
        );
    }
}

// Lá Chắn An Ninh Cấp Độ Cao: Chặn F12, Chặn Inspect, Chặn View-Source, Chặn Chuột Phải
(function initSecurityShield() {
    window.addEventListener('keydown', function(e) {
        // Chặn F12
        if (e.keyCode === 123) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Chặn Ctrl+Shift+I / J / C (DevTools Console & Elements)
        if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Chặn Ctrl+U (Xem nguồn trang web)
        if (e.ctrlKey && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Chặn Ctrl+S (Lưu trang về máy)
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // Chặn chuột phải trên toàn bộ trang
    window.addEventListener('contextmenu', function(e) {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return true;
        e.preventDefault();
        return false;
    }, true);
})();

let allQuestionsData = {};
let allScheduleData = [];
let currentTool = 'P1';
let currentSection = null;
let currentDraftAnswers = {};
let currentUser = null;

// Khởi chạy hệ thống
document.addEventListener('DOMContentLoaded', async () => {
    if (isRunningStandalone()) {
        const pwaBtn = document.getElementById('btnInstallPwa');
        if (pwaBtn) pwaBtn.style.display = 'none';
    }
    document.querySelectorAll('a[href="/api/export/excel"]').forEach(a => {
        a.href = apiUrl('/api/export/excel');
    });
    initUserSession();
    await loadQuestions();
    await loadSchedule();
    await refreshDashboardData();
    await loadSurveysList();
    selectTool('P1');

    // Kiểm tra kết nối mạng
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
});

// ========================================================
// 1. QUẢN LÝ 03 TẦNG ĐĂNG NHẬP QUYỀN (ADMIN / VIEWER / EDITOR)
// ========================================================
function initUserSession() {
    const saved = localStorage.getItem('dakman_surveyor_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
        } catch (e) {
            currentUser = null;
        }
    }

    // Bắt buộc xác thực: Nếu chưa đăng nhập thành công thì hiện cửa sổ khóa hệ thống
    if (!currentUser || !currentUser.is_authenticated) {
        currentUser = null;
        showLoginModal(true); // true = Bắt buộc, không cho đóng
    } else {
        updateUserDisplay();
    }
}

function selectLoginTier(tier) {
    document.querySelectorAll('.tier-tab-btn, .qgis-tab-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.getElementById(`btnTier${capitalize(tier)}`);
    if (targetBtn) targetBtn.classList.add('active');
    document.getElementById('loginSelectedRole').value = tier;

    const staffFields = document.getElementById('editorStaffFields');
    const lblPass = document.getElementById('lblPasswordTier');
    const hint = document.getElementById('passwordHint');
    const passInput = document.getElementById('modalUserPassword');
    const errBox = document.getElementById('loginErrorMsg');
    if (errBox) errBox.style.display = 'none';

    if (tier === 'admin') {
        staffFields.style.display = 'none';
        lblPass.innerHTML = 'Mật Khẩu Quản Trị Viên <span class="req">*</span>';
        passInput.placeholder = 'Nhập mật khẩu quản trị viên...';
    } else if (tier === 'viewer') {
        staffFields.style.display = 'none';
        lblPass.innerHTML = 'Mật Khẩu Quyền Xem <span class="req">*</span>';
        passInput.placeholder = 'Nhập mật khẩu quyền xem...';
    } else {
        staffFields.style.display = 'block';
        lblPass.innerHTML = 'Mật Khẩu Điều Tra Viên <span class="req">*</span>';
        passInput.placeholder = 'Nhập mật khẩu điều tra viên...';
        if (!document.getElementById('modalUserId').value) {
            document.getElementById('modalUserId').value = 'TCN-01-080000';
        }
    }
}

function showLoginModal(isMandatory) {
    const modal = document.getElementById('userLoginModal');
    if (!modal) return;
    const curRole = currentUser?.role || 'editor';
    selectLoginTier(curRole);

    const closeBtn = document.getElementById('btnLoginCloseBtn');
    if (closeBtn) {
        closeBtn.style.display = isMandatory ? 'none' : 'block';
    }

    if (currentUser && curRole === 'editor') {
        document.getElementById('modalUserId').value = currentUser.surveyor_id || 'TCN-01-080000';
        document.getElementById('modalUserName').value = currentUser.full_name || '';
        document.getElementById('modalUserDate').value = currentUser.survey_date || new Date().toISOString().split('T')[0];
        document.getElementById('modalUserCommune').value = currentUser.commune || 'Ea Kiết';
    } else {
        document.getElementById('modalUserDate').value = new Date().toISOString().split('T')[0];
        if (!document.getElementById('modalUserId').value) {
            document.getElementById('modalUserId').value = 'TCN-01-080000';
        }
    }
    document.getElementById('modalUserPassword').value = '';
    document.getElementById('loginErrorMsg').style.display = 'none';
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function hideLoginModal() {
    const modal = document.getElementById('userLoginModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function logoutSystem() {
    if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
        localStorage.removeItem('dakman_surveyor_session');
        currentUser = null;
        updateUserDisplay();
        showLoginModal(true);
    }
}

async function saveUserLogin(e) {
    e.preventDefault();
    const role = document.getElementById('loginSelectedRole').value;
    const password = document.getElementById('modalUserPassword').value.trim();
    const userId = document.getElementById('modalUserId').value.trim();
    const userName = document.getElementById('modalUserName').value.trim();
    const userDate = document.getElementById('modalUserDate').value || new Date().toISOString().split('T')[0];
    const userCommune = document.getElementById('modalUserCommune').value;
    const errBox = document.getElementById('loginErrorMsg');

    const payload = {
        role: role,
        password: password,
        surveyor_id: userId,
        full_name: userName,
        survey_date: userDate,
        commune: userCommune
    };

    try {
        const res = await fetch(apiUrl('/api/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
            currentUser = data.user;
            currentUser.key = password;
            currentUser.is_authenticated = true;
            if (role === 'admin') {
                localStorage.setItem('dakman_admin_key', password);
            }
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
            loadSurveysList(); // Làm mới danh sách theo quyền mới
        } else {
            errBox.style.display = 'block';
            errBox.textContent = data.error || 'Đăng nhập không thành công. Vui lòng kiểm tra lại mật khẩu.';
        }
    } catch (err) {
        // Hỗ trợ kiểm tra offline theo mật khẩu chuẩn
        if (role === 'admin' && password === 'AAdmin123') {
            currentUser = { role: 'admin', surveyor_id: 'ADMIN', full_name: 'Quản Trị Viên (Admin)', survey_date: userDate, commune: 'Toàn vùng', key: password, is_authenticated: true };
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
        } else if (role === 'viewer' && password === 'View123') {
            currentUser = { role: 'viewer', surveyor_id: 'VIEWER', full_name: 'Khách Giám Sát (Chỉ xem)', survey_date: userDate, commune: 'Toàn vùng', key: password, is_authenticated: true };
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
        } else if (role === 'editor' && (password === 'Edit123a#' || password)) {
            currentUser = { role: 'editor', surveyor_id: userId || 'DTV01', full_name: userName || 'Điều tra viên', survey_date: userDate, commune: userCommune, key: password, is_authenticated: true };
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
        } else {
            errBox.style.display = 'block';
            errBox.textContent = 'Mật khẩu không chính xác cho cấp quyền này!';
        }
    }
}

// Cơ chế bảo vệ bản quyền & chống sao chép cho tài khoản Chỉ Xem
let viewerCopyHandler = null;
let viewerContextHandler = null;

function enableViewerDRMProtection() {
    if (!viewerCopyHandler) {
        viewerCopyHandler = function(e) {
            e.preventDefault();
            return false;
        };
        document.addEventListener('copy', viewerCopyHandler, true);
    }
    if (!viewerContextHandler) {
        viewerContextHandler = function(e) {
            e.preventDefault();
            return false;
        };
        document.addEventListener('contextmenu', viewerContextHandler, true);
    }
}

function disableViewerDRMProtection() {
    if (viewerCopyHandler) {
        document.removeEventListener('copy', viewerCopyHandler, true);
        viewerCopyHandler = null;
    }
    if (viewerContextHandler) {
        document.removeEventListener('contextmenu', viewerContextHandler, true);
        viewerContextHandler = null;
    }
}

function updateUserDisplay() {
    if (!currentUser) return;
    const badge = document.getElementById('userSessionBadge');
    const badgeName = document.getElementById('badgeUserName');
    const banner = document.getElementById('viewerAlertBanner');
    const btnSubmit = document.getElementById('btnSubmitForm');
    const btnSaveDraft = document.querySelector('button[onclick="manualSaveDraft()"]');

    const role = currentUser.role || 'editor';

    const btnAdminStaff = document.getElementById('btnAdminStaffManage');
    if (btnAdminStaff) {
        btnAdminStaff.style.display = (role === 'admin') ? 'inline-block' : 'none';
    }

    if (badge) {
        if (role === 'admin') {
            badge.style.background = '#dc2626';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-user-shield"></i> [ADMIN] ${currentUser.full_name}`;
        } else if (role === 'viewer') {
            badge.style.background = '#2563eb';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-eye"></i> [CHỈ XEM] ${currentUser.full_name}`;
        } else {
            badge.style.background = '#15803d';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-user-pen"></i> [ĐTV] ${currentUser.surveyor_id} - ${currentUser.full_name}`;
        }
    }

    // Áp dụng cơ chế khóa bảo mật nghiêm ngặt cho tài khoản Chỉ Xem
    if (role === 'viewer') {
        document.body.classList.add('viewer-locked-mode');
        enableViewerDRMProtection();
    } else {
        document.body.classList.remove('viewer-locked-mode');
        disableViewerDRMProtection();
    }

    const isViewer = (role === 'viewer');
    if (banner) banner.style.display = isViewer ? 'block' : 'none';

    if (btnSubmit) {
        btnSubmit.disabled = isViewer;
        btnSubmit.style.opacity = isViewer ? '0.5' : '1';
        btnSubmit.style.cursor = isViewer ? 'not-allowed' : 'pointer';
        btnSubmit.title = isViewer ? 'Tài khoản ở chế độ chỉ xem, không được nộp phiếu' : 'Gửi kết quả về máy chủ VPS';
    }
    if (btnSaveDraft) {
        btnSaveDraft.disabled = isViewer;
        btnSaveDraft.style.opacity = isViewer ? '0.5' : '1';
        btnSaveDraft.style.cursor = isViewer ? 'not-allowed' : 'pointer';
    }

    // Cập nhật thông tin điều tra viên trên form
    const idInput = document.getElementById('surveyorIdInput');
    const nameInput = document.getElementById('surveyorNameInput');
    const dateInput = document.getElementById('surveyDateInput');
    const communeSelect = document.getElementById('communeSelect');

    if (idInput) idInput.value = currentUser.surveyor_id || 'DTV01';
    if (nameInput) nameInput.value = currentUser.full_name || '';
    if (dateInput) dateInput.value = currentUser.survey_date || new Date().toISOString().split('T')[0];
    if (communeSelect && currentUser.commune && currentUser.commune !== 'Toàn vùng') {
        communeSelect.value = currentUser.commune;
    }
}

function updateNetworkStatus() {
    const badge = document.getElementById('serverBadge');
    if (!badge) return;
    if (navigator.onLine) {
        badge.style.color = '#4ade80';
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Trực tuyến • Đã kết nối máy chủ';
    } else {
        badge.style.color = '#fbbf24';
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Chế độ ngoại tuyến (Offline)';
    }
}

// ========================================================
// 2. CHUYỂN ĐỔI GIAO DIỆN CHÍNH (VIEW SWITCHER)
// ========================================================
function switchMainView(viewId) {
    const views = ['survey', 'dashboard', 'schedule', 'history'];
    views.forEach(v => {
        const pane = document.getElementById(`view-${v}`);
        const btn = document.getElementById(`btnView${capitalize(v)}`);
        if (pane) pane.style.display = 'none';
        if (btn) btn.classList.remove('active');
    });

    const activePane = document.getElementById(`view-${viewId}`);
    const activeBtn = document.getElementById(`btnView${capitalize(viewId)}`);
    if (activePane) activePane.style.display = 'block';
    if (activeBtn) activeBtn.classList.add('active');

    if (viewId === 'dashboard') refreshDashboardData();
    if (viewId === 'schedule') renderScheduleTable();
    if (viewId === 'history') loadSurveysList();
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ========================================================
// 3. TẢI DỮ LIỆU CÂU HỎI & LỊCH TRÌNH
// ========================================================
async function loadQuestions() {
    try {
        const res = await fetch(apiUrl('/api/questions'));
        if (res.ok) {
            allQuestionsData = await res.json();
        }
    } catch (e) {
        console.warn('Không tải được câu hỏi từ API:', e);
    }
}

async function loadSchedule() {
    try {
        const res = await fetch(apiUrl('/api/schedule'));
        if (res.ok) {
            allScheduleData = await res.json();
            renderScheduleTable();
        }
    } catch (e) {
        console.warn('Không tải được lịch trình từ API:', e);
    }
}

function renderScheduleTable() {
    const tbody = document.getElementById('scheduleListTbody');
    if (!tbody || !allScheduleData.length) return;

    tbody.innerHTML = allScheduleData.map(act => {
        const now = new Date();
        const start = new Date(act.start);
        const end = new Date(act.end);
        let badgeHtml = '<span class="stat-badge pending">Kế hoạch</span>';

        if (now > end) {
            badgeHtml = '<span class="stat-badge pass">Hoàn thành</span>';
        } else if (now >= start && now <= end) {
            badgeHtml = '<span class="stat-badge target">Đang thực hiện</span>';
        }

        return `
            <tr>
                <td style="text-align: center; font-weight: 700; color: var(--slate-500);">${act.stt}</td>
                <td>
                    <strong style="color: var(--primary);">${act.name}</strong>
                    <div style="font-size: 0.78rem; color: var(--slate-500); margin-top: 2px;">Chỉ số kế hoạch F1 VN</div>
                </td>
                <td style="font-size: 0.82rem; color: var(--slate-700); font-weight: 600;">${act.owner}</td>
                <td style="text-align: center; font-family: monospace; font-size: 0.82rem;">${formatDateVN(act.start)}</td>
                <td style="text-align: center; font-family: monospace; font-size: 0.82rem;">${formatDateVN(act.end)}</td>
                <td style="text-align: center; font-weight: 700; color: var(--primary);">${act.days} ngày</td>
                <td style="text-align: center;">${badgeHtml}</td>
            </tr>
        `;
    }).join('');
}

function formatDateVN(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// ========================================================
// 4. CHỌN BỘ CÔNG CỤ (TOOL SELECTOR: P1 - TT)
// ========================================================
function selectTool(toolCode) {
    currentTool = toolCode;
    editingSurveyId = null;
    const submitBtn = document.getElementById('btnSubmitForm');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> GỬI KẾT QUẢ LÊN HỆ THỐNG DAKMAN';

    document.querySelectorAll('.tool-tab').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`toolBtn-${toolCode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const toolObj = allQuestionsData[toolCode];
    if (!toolObj) return;

    const heading = document.getElementById('currentToolHeading');
    if (heading) {
        heading.textContent = `CÔNG CỤ: ${toolObj.tool_code} — ${toolObj.tool_name.toUpperCase()} (${toolObj.target_count || ''})`;
    }

    // Khôi phục bản nháp nếu có
    const draftKey = `dakman_draft_${toolCode}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
        try {
            const parsed = JSON.parse(savedDraft);
            currentDraftAnswers = parsed.answers || {};
            if (parsed.survey_code) document.getElementById('surveyCodeInput').value = parsed.survey_code;
            if (parsed.commune) document.getElementById('communeSelect').value = parsed.commune;
            if (parsed.hamlet) document.getElementById('hamletInput').value = parsed.hamlet;
            if (parsed.respondent_name) document.getElementById('respondentNameInput').value = parsed.respondent_name;
            if (parsed.gps) document.getElementById('gpsInput').value = parsed.gps;
            if (parsed.photo_data) {
                setHouseholdPhotoPreview(parsed.photo_data, parsed.photo_meta || 'Đã khôi phục ảnh nháp có watermark');
            } else {
                clearHouseholdPhoto(true);
            }
            updateDraftTimeDisplay(parsed.saved_at);
        } catch (e) {
            currentDraftAnswers = {};
            clearHouseholdPhoto(true);
        }
    } else {
        currentDraftAnswers = {};
        const todayNum = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        document.getElementById('surveyCodeInput').value = `${toolCode}_${currentUser?.surveyor_id || 'DTV'}_${todayNum}_01`;
        document.getElementById('respondentNameInput').value = '';
        document.getElementById('hamletInput').value = '';
        document.getElementById('gpsInput').value = '';
        clearHouseholdPhoto(true);
        updateDraftTimeDisplay(null);
    }

    const questions = toolObj.questions || [];
    const sections = [];
    questions.forEach(q => {
        const s = q.section || 'Thông tin chung';
        if (!sections.includes(s)) sections.push(s);
    });

    renderSectionJumpNav(sections);
    currentSection = sections[0] || null;
    renderQuestionsForSection(currentSection);
    updateSectionStepButtons(sections);
    updateAnsweredSummaryBadge();
}

function getToolSections(toolCode = currentTool) {
    const toolObj = allQuestionsData[toolCode];
    if (!toolObj) return [];
    const sections = [];
    (toolObj.questions || []).forEach(q => {
        const s = q.section || 'Thông tin chung';
        if (!sections.includes(s)) sections.push(s);
    });
    return sections;
}

function isQuestionAnswered(code) {
    const v = currentDraftAnswers[code];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim() !== '';
}

function getVisibleQuestions(toolCode = currentTool) {
    const toolObj = allQuestionsData[toolCode];
    if (!toolObj) return [];
    return (toolObj.questions || []).filter(q => !q.condition || checkConditionMet(q.condition, currentDraftAnswers));
}

function renderSectionJumpNav(sections) {
    const nav = document.getElementById('sectionJumpNav');
    if (!nav) return;

    if (sections.length <= 1) {
        nav.style.display = 'none';
        return;
    }
    nav.style.display = 'flex';

    nav.innerHTML = sections.map((sec, idx) => `
        <button type="button" 
                class="jump-btn ${idx === 0 ? 'active' : ''}" 
                id="jumpBtn-${idx}" 
                data-section="${escapeHtml(sec)}"
                onclick="selectSection('${escapeQuotes(sec)}', ${idx})">
            ${escapeHtml(sec)}
        </button>
    `).join('');
}

function selectSection(secName, idx) {
    currentSection = secName;
    document.querySelectorAll('.jump-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`jumpBtn-${idx}`);
    if (btn) {
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    renderQuestionsForSection(secName);
    updateSectionStepButtons();
    updateAnsweredSummaryBadge();

    const navEl = document.getElementById('sectionJumpNav');
    if (navEl && window.innerWidth <= 768) {
        navEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateSectionStepButtons(sections) {
    const list = sections || getToolSections();
    const stepBar = document.getElementById('sectionStepNav');
    const prevBtn = document.getElementById('btnPrevSection');
    const nextBtn = document.getElementById('btnNextSection');
    if (!stepBar || !prevBtn || !nextBtn) return;

    if (list.length <= 1) {
        stepBar.style.display = 'none';
        return;
    }
    stepBar.style.display = 'flex';
    const curIdx = Math.max(0, list.indexOf(currentSection));
    prevBtn.disabled = (curIdx <= 0);
    prevBtn.style.opacity = curIdx <= 0 ? '0.45' : '1';
    nextBtn.disabled = (curIdx >= list.length - 1);
    nextBtn.style.opacity = curIdx >= list.length - 1 ? '0.45' : '1';
}

function stepSection(delta) {
    const list = getToolSections();
    if (!list.length) return;
    const curIdx = Math.max(0, list.indexOf(currentSection));
    const nextIdx = Math.min(list.length - 1, Math.max(0, curIdx + delta));
    if (nextIdx !== curIdx) {
        selectSection(list[nextIdx], nextIdx);
    }
}

function jumpToFirstUnanswered() {
    const visible = getVisibleQuestions();
    const missing = visible.find(q => !isQuestionAnswered(q.code));
    if (!missing) {
        alert('Tuyệt vời! Bạn đã trả lời đầy đủ tất cả các câu hỏi hiện tại.');
        return;
    }
    const secName = missing.section || 'Thông tin chung';
    const sections = getToolSections();
    const secIdx = sections.indexOf(secName);
    if (secIdx >= 0 && currentSection !== secName) {
        selectSection(secName, secIdx);
    }
    setTimeout(() => {
        const card = document.getElementById(`qCard_${missing.code}`);
        if (card) {
            card.classList.add('unanswered-highlight');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

// ========================================================
// 5. RENDER CÂU HỎI & CƠ CHẾ RẼ NHÁNH ĐIỀU KIỆN (DYNAMIC SKIP LOGIC)
// ========================================================
function renderQuestionsForSection(secName) {
    const container = document.getElementById('surveyQuestionsBox');
    const toolObj = allQuestionsData[currentTool];
    if (!container || !toolObj) return;

    let questions = toolObj.questions || [];
    if (secName) {
        questions = questions.filter(q => (q.section || 'Thông tin chung') === secName);
    }

    if (questions.length === 0) {
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--slate-500);">Chưa có câu hỏi cho phần này.</div>';
        return;
    }

    const isViewer = (currentUser?.role === 'viewer');

    container.innerHTML = questions.map((q, idx) => {
        const code = q.code;
        if (code === 'A05' && !currentDraftAnswers['A05']) {
            const topGps = document.getElementById('gpsInput')?.value?.trim();
            if (topGps) currentDraftAnswers['A05'] = topGps;
        }
        if (code === 'A07' && !currentDraftAnswers['A07']) {
            const topSurveyor = document.getElementById('surveyorIdInput')?.value?.trim() || currentUser?.surveyor_id;
            if (topSurveyor) currentDraftAnswers['A07'] = topSurveyor;
        }
        const val = currentDraftAnswers[code] || '';
        const qType = (q.type || 'TX').toUpperCase();

        let inputHtml = '';

        if (qType.includes('MULTI_TX') || q.multi_rows) {
            const rows = Array.isArray(val)
                ? (val.length ? val : [''])
                : (typeof val === 'string' && val.trim() ? val.split('\n') : ['']);
            inputHtml = `
                <div id="multiTx_${code}" class="multi-tx-list" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                    ${rows.map((r, rIdx) => `
                        <div class="multi-tx-row" style="display: flex; gap: 6px; align-items: center;">
                            <input type="text"
                                   class="form-control"
                                   value="${escapeHtml(r)}"
                                   ${isViewer ? 'disabled' : ''}
                                   placeholder="Nhập dòng ${rIdx + 1}..."
                                   oninput="onMultiTxChange('${code}')">
                            ${!isViewer ? `<button type="button" class="btn-outline" style="padding: 6px 10px; color: #b91c1c; border-color: #fecaca; flex-shrink: 0;" title="Xóa dòng" onclick="removeMultiTxRow('${code}', this)"><i class="fa-solid fa-xmark"></i></button>` : ''}
                        </div>
                    `).join('')}
                </div>
                ${!isViewer ? `<button type="button" class="btn-outline" style="margin-top: 8px; font-size: 0.82rem; padding: 5px 12px;" onclick="addMultiTxRow('${code}')"><i class="fa-solid fa-plus"></i> Thêm dòng</button>` : ''}
            `;
        } else if (q.options && q.options.length > 0 && (qType.includes('DR') || qType.includes('SELECT'))) {
            inputHtml = `
                <div style="margin-top: 8px; max-width: 420px;">
                    <select class="form-control"
                            ${isViewer ? 'disabled' : ''}
                            onchange="onAnswerChange('${code}', this, false)">
                        <option value="">-- Chọn đáp án --</option>
                        ${q.options.map(opt => `
                            <option value="${escapeHtml(opt.value)}" ${val === opt.value ? 'selected' : ''}>
                                ${escapeHtml(opt.value)}. ${escapeHtml(opt.label)}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;
        } else if (q.options && q.options.length > 0) {
            const isMulti = qType.includes('MO') || qType.includes('CB');
            inputHtml = `
                <div class="radio-group">
                    ${q.options.map((opt, oIdx) => {
                        const isChecked = isMulti 
                            ? (Array.isArray(val) && val.includes(opt.value))
                            : (val === opt.value);
                        return `
                            <label class="radio-label ${isChecked ? 'selected' : ''}">
                                <input type="${isMulti ? 'checkbox' : 'radio'}" 
                                       name="q_${code}" 
                                       value="${opt.value}" 
                                       ${isChecked ? 'checked' : ''}
                                       ${isViewer ? 'disabled' : ''}
                                       onchange="onAnswerChange('${code}', this, ${isMulti})">
                                <span><strong>${opt.value}</strong>. ${opt.label}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
                ${q.follow_up_on ? (() => {
                    const showFollowUp = isMulti
                        ? (Array.isArray(val) && val.includes(q.follow_up_on))
                        : (String(val || '') === String(q.follow_up_on));
                    const noteVal = currentDraftAnswers[code + '_note'] || '';
                    return `
                        <div id="followUp_${code}" data-follow-on="${escapeHtml(q.follow_up_on)}" style="margin-top: 8px; display: ${showFollowUp ? 'block' : 'none'};">
                            <textarea class="form-control"
                                      rows="2"
                                      ${isViewer ? 'disabled' : ''}
                                      placeholder="${escapeHtml(q.follow_up_placeholder || 'Ghi rõ nội dung chi tiết...')}"
                                      oninput="onFollowUpChange('${code}', this.value)">${escapeHtml(noteVal)}</textarea>
                        </div>
                    `;
                })() : ''}
            `;
        } else if (qType.includes('LK')) {
            const lkOpts = (q.options && q.options.length === 5) ? q.options : [
                { value: '1', label: 'Rất kém' },
                { value: '2', label: 'Kém' },
                { value: '3', label: 'Trung bình' },
                { value: '4', label: 'Tốt' },
                { value: '5', label: 'Rất tốt' }
            ];
            inputHtml = `
                <div class="likert-grid">
                    ${lkOpts.map(opt => {
                        const isSelected = String(val) === String(opt.value);
                        return `
                            <button type="button" 
                                    class="likert-btn ${isSelected ? 'active' : ''}" 
                                    ${isViewer ? 'disabled' : ''}
                                    onclick="setLikertAnswer('${code}', '${escapeQuotes(opt.value)}')">
                                <div class="likert-num">${escapeHtml(opt.value)}</div>
                                <div class="likert-desc">${escapeHtml(opt.label)}</div>
                            </button>
                        `;
                    }).join('')}
                </div>
            `;
        } else if (qType.includes('SO') || qType.includes('NUM')) {
            const minAttr = (q.min !== undefined && q.min !== '') ? `min="${escapeHtml(q.min)}"` : '';
            const maxAttr = (q.max !== undefined && q.max !== '') ? `max="${escapeHtml(q.max)}"` : '';
            inputHtml = `
                <div style="margin-top: 8px; max-width: 320px; display: flex; align-items: center; gap: 8px;">
                    <input type="number" 
                           step="any" 
                           ${minAttr} ${maxAttr}
                           class="form-control" 
                           value="${val}" 
                           ${isViewer ? 'disabled' : ''}
                           oninput="onAnswerChange('${code}', this, false)" 
                           placeholder="Nhập số lượng / giá trị...">
                    ${q.unit ? `<span style="font-weight:700; color:#475569; white-space:nowrap;">${escapeHtml(q.unit)}</span>` : ''}
                </div>
            `;
        } else if (qType.includes('DATETIME')) {
            let dtVal = val;
            if (!dtVal && !isViewer) {
                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                dtVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
                currentDraftAnswers[code] = dtVal;
            }
            inputHtml = `
                <div style="margin-top: 8px; max-width: 280px;">
                    <input type="datetime-local"
                           class="form-control"
                           value="${escapeHtml(dtVal)}"
                           ${isViewer ? 'disabled' : ''}
                           onchange="onAnswerChange('${code}', this, false)">
                </div>
            `;
        } else if (qType.includes('DT') || qType.includes('DATE')) {
            inputHtml = `
                <div style="margin-top: 8px; max-width: 260px;">
                    <input type="date" 
                           class="form-control" 
                           value="${val}" 
                           ${isViewer ? 'disabled' : ''}
                           onchange="onAnswerChange('${code}', this, false)">
                </div>
            `;
        } else {
            inputHtml = `
                <div style="margin-top: 8px;">
                    <textarea class="form-control" 
                              rows="2" 
                              ${isViewer ? 'disabled' : ''}
                              oninput="onAnswerChange('${code}', this, false)" 
                              placeholder="Ghi chép câu trả lời của đối tượng...">${val}</textarea>
                </div>
            `;
        }

        return `
            <div class="question-card" id="qCard_${code}" data-code="${code}" data-condition="${escapeQuotes(q.condition || '')}">
                <div class="q-header">
                    <span class="q-code">${code}</span>
                    <span class="q-text">${q.text}</span>
                </div>
                ${q.condition ? `<div class="q-condition"><i class="fa-solid fa-code-branch"></i> Điều kiện xuất hiện: ${q.condition}</div>` : ''}
                ${q.options_raw && !q.options?.length ? `<div style="font-size: 0.8rem; color: var(--slate-500); font-style: italic; margin-top: 4px;">Gợi ý: ${q.options_raw}</div>` : ''}
                ${inputHtml}
            </div>
        `;
    }).join('');

    // Đánh giá hiển thị câu hỏi theo điều kiện
    evaluateQuestionConditions();
    updateAnsweredSummaryBadge();
}

/**
 * Thuật toán kiểm tra điều kiện xuất hiện của từng câu hỏi
 * Hỗ trợ các dạng:
 * - A02=3, A02=4, A08=1
 * - Chỉ hỏi hộ không thuộc panel (A02 = 2, 3, 4)
 * - CT01=1, PB01=1, SB07=0...
 * - selected(CP08, '2') or selected(CP08, '3')
 * - CS14!=5...
 */
function matchesConditionValue(qCode, actualVal, expVal) {
    if (actualVal === undefined || actualVal === null || actualVal === '') return false;
    const checkOne = (v) => {
        const s = String(v).trim();
        if (s === expVal) return true;
        if (/^\d+$/.test(expVal)) {
            const qList = allQuestionsData[currentTool]?.questions || [];
            const refQ = qList.find(item => item.code === qCode);
            const opts = refQ?.options || [];
            if (opts.length === 2) {
                const labels = opts.map(o => String(o.value).trim());
                if (labels.includes('Không') && labels.includes('Có')) {
                    if (expVal === '0' && s === 'Không') return true;
                    if (expVal === '1' && s === 'Có') return true;
                }
            }
            const idx = parseInt(expVal, 10) - 1;
            if (idx >= 0 && idx < opts.length && s === String(opts[idx].value).trim()) {
                return true;
            }
        }
        return false;
    };
    if (Array.isArray(actualVal)) return actualVal.some(checkOne);
    return checkOne(actualVal);
}

function checkConditionMet(condStr, answers) {
    if (!condStr || !condStr.trim()) return true;
    const cond = condStr.trim();

    // 1. Kiểm tra điều kiện loại trừ Hộ Panel PPI:
    if (cond.includes('không thuộc panel') || cond.includes('A02 = 2, 3, 4') || cond.includes('A02=2,3,4')) {
        const a02 = String(answers['A02'] || '').trim();
        return ['2', '3', '4'].includes(a02);
    }

    // 2. Logic OR
    if (cond.toLowerCase().includes(' or ')) {
        const parts = cond.split(/\s+or\s+/i);
        return parts.some(p => checkConditionMet(p.trim(), answers));
    }

    // 3. Logic AND
    if (cond.toLowerCase().includes(' and ')) {
        const parts = cond.split(/\s+and\s+/i);
        return parts.every(p => checkConditionMet(p.trim(), answers));
    }

    // 4. Không bằng (!= hoặc ≠)
    const ineqMatch = cond.match(/^([A-Za-z0-9_]+)\s*(!=|≠)\s*['"]?([^'"]+)['"]?$/);
    if (ineqMatch) {
        const qCode = ineqMatch[1];
        const expVal = ineqMatch[3].trim();
        const actualVal = answers[qCode];
        if (actualVal === undefined || actualVal === null || actualVal === '') return false;
        return !matchesConditionValue(qCode, actualVal, expVal);
    }

    // 5. Bằng (=)
    const eqMatch = cond.match(/^([A-Za-z0-9_]+)\s*=\s*['"]?([^'"]+)['"]?$/);
    if (eqMatch) {
        const qCode = eqMatch[1];
        const expVal = eqMatch[2].trim();
        return matchesConditionValue(qCode, answers[qCode], expVal);
    }

    // 6. selected(Q, 'val') hoặc Q có val
    const selMatch = cond.match(/(?:selected\()?([A-Za-z0-9_]+)(?:,\s*['"]?([^'")]+)['"]?\))?(?:\s+có\s+['"]?([^'"]+)['"]?)?/);
    if (selMatch && (selMatch[2] || selMatch[3])) {
        const qCode = selMatch[1];
        const expVal = (selMatch[2] || selMatch[3]).trim();
        return matchesConditionValue(qCode, answers[qCode], expVal);
    }

    return true;
}

/**
 * Quét toàn bộ câu hỏi và ẩn/hiện động theo câu trả lời hiện tại
 */
function evaluateQuestionConditions() {
    const cards = document.querySelectorAll('.question-card');
    let hasChanges = false;

    cards.forEach(card => {
        const code = card.dataset.code;
        const condition = card.dataset.condition;

        if (!condition) {
            card.style.display = 'block';
            return;
        }

        const isMet = checkConditionMet(condition, currentDraftAnswers);
        if (isMet) {
            if (card.style.display === 'none') {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.3s ease';
            }
        } else {
            if (card.style.display !== 'none') {
                card.style.display = 'none';
                // Nếu câu này bị ẩn, xóa câu trả lời cũ của nó để tránh sai lệch dữ liệu
                if (currentDraftAnswers[code] !== undefined) {
                    delete currentDraftAnswers[code];
                    hasChanges = true;
                }
            }
        }
    });

    let visibleCount = 0;
    const hiddenConds = new Set();
    cards.forEach(card => {
        if (card.style.display !== 'none') visibleCount++;
        else if (card.dataset.condition) hiddenConds.add(card.dataset.condition);
    });

    const box = document.getElementById('surveyQuestionsBox');
    if (box) {
        let notice = document.getElementById('emptySectionNotice');
        if (cards.length > 0 && visibleCount === 0) {
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'emptySectionNotice';
                notice.style.cssText = 'padding: 18px 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #92400e; font-size: 0.88rem; line-height: 1.5;';
                box.appendChild(notice);
            }
            const condList = Array.from(hiddenConds).map(c => `<code>${escapeHtml(c)}</code>`).join(', ');
            const firstSec = (getToolSections() || [])[0] || '';
            notice.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 4px;"><i class="fa-solid fa-circle-info"></i> Phần này hiện có ${cards.length} câu hỏi nhưng đang ẩn theo điều kiện rẽ nhánh</div>
                <div>Điều kiện mở phần này: ${condList || 'Chưa thỏa mãn điều kiện ở các câu trước.'}</div>
                ${firstSec && currentSection !== firstSec ? `<button type="button" class="btn-outline" style="margin-top: 10px; font-size: 0.82rem;" onclick="selectSection('${escapeQuotes(firstSec)}', 0)"><i class="fa-solid fa-arrow-left"></i> Quay lại ${escapeHtml(firstSec)}</button>` : ''}
            `;
        } else if (notice) {
            notice.remove();
        }
    }

    if (hasChanges) {
        saveDraftLocal(false);
    }
}

function setLikertAnswer(code, val) {
    if (currentUser?.role === 'viewer') return;
    currentDraftAnswers[code] = val;
    const card = document.getElementById(`qCard_${code}`);
    if (card) {
        card.querySelectorAll('.likert-btn').forEach((btn, idx) => {
            if (idx + 1 === val) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
    saveDraftLocal(false);
    evaluateQuestionConditions();
    updateAnsweredSummaryBadge();
}

function onAnswerChange(code, el, isMulti) {
    if (currentUser?.role === 'viewer') return;

    if (isMulti) {
        if (!Array.isArray(currentDraftAnswers[code])) {
            currentDraftAnswers[code] = [];
        }
        if (el.checked) {
            if (!currentDraftAnswers[code].includes(el.value)) {
                currentDraftAnswers[code].push(el.value);
            }
        } else {
            currentDraftAnswers[code] = currentDraftAnswers[code].filter(v => v !== el.value);
        }
        if (el.parentElement) {
            if (el.checked) el.parentElement.classList.add('selected');
            else el.parentElement.classList.remove('selected');
        }
    } else {
        currentDraftAnswers[code] = el.value;
        if (el.type === 'radio' && el.name) {
            document.querySelectorAll(`input[name="${el.name}"]`).forEach(r => {
                if (r.parentElement) r.parentElement.classList.remove('selected');
            });
            if (el.parentElement) el.parentElement.classList.add('selected');
        }
    }

    const fuBox = document.getElementById(`followUp_${code}`);
    if (fuBox) {
        const target = fuBox.dataset.followOn || '';
        const curVal = currentDraftAnswers[code];
        const active = Array.isArray(curVal) ? curVal.includes(target) : (String(curVal || '') === target);
        fuBox.style.display = active ? 'block' : 'none';
        if (!active && currentDraftAnswers[code + '_note'] !== undefined) {
            delete currentDraftAnswers[code + '_note'];
        }
    }

    saveDraftLocal(false);
    evaluateQuestionConditions();
    updateAnsweredSummaryBadge();
}

function onFollowUpChange(code, textVal) {
    if (currentUser?.role === 'viewer') return;
    if (textVal && textVal.trim()) {
        currentDraftAnswers[code + '_note'] = textVal;
    } else {
        delete currentDraftAnswers[code + '_note'];
    }
    saveDraftLocal(false);
}

function onMultiTxChange(code) {
    if (currentUser?.role === 'viewer') return;
    const container = document.getElementById(`multiTx_${code}`);
    if (!container) return;
    const vals = Array.from(container.querySelectorAll('input[type="text"]'))
        .map(inp => inp.value.trim())
        .filter(Boolean);
    if (vals.length > 0) {
        currentDraftAnswers[code] = vals;
    } else {
        delete currentDraftAnswers[code];
    }
    saveDraftLocal(false);
    evaluateQuestionConditions();
    updateAnsweredSummaryBadge();
}

function addMultiTxRow(code) {
    if (currentUser?.role === 'viewer') return;
    const container = document.getElementById(`multiTx_${code}`);
    if (!container) return;
    const idx = container.querySelectorAll('.multi-tx-row').length + 1;
    const row = document.createElement('div');
    row.className = 'multi-tx-row';
    row.style.cssText = 'display: flex; gap: 6px; align-items: center;';
    row.innerHTML = `
        <input type="text" class="form-control" value="" placeholder="Nhập dòng ${idx}..." oninput="onMultiTxChange('${code}')">
        <button type="button" class="btn-outline" style="padding: 6px 10px; color: #b91c1c; border-color: #fecaca; flex-shrink: 0;" title="Xóa dòng" onclick="removeMultiTxRow('${code}', this)"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(row);
    const inp = row.querySelector('input');
    if (inp) inp.focus();
}

function removeMultiTxRow(code, btn) {
    if (currentUser?.role === 'viewer') return;
    const container = document.getElementById(`multiTx_${code}`);
    if (!container) return;
    const rows = container.querySelectorAll('.multi-tx-row');
    if (rows.length <= 1) {
        const inp = rows[0]?.querySelector('input');
        if (inp) inp.value = '';
    } else {
        const row = btn.closest('.multi-tx-row');
        if (row) row.remove();
    }
    onMultiTxChange(code);
}

// ========================================================
// 6. LƯU BẢN NHÁP (LOCAL STORAGE & AUTO SAVE)
// ========================================================
function saveDraftLocal(isManual) {
    if (currentUser?.role === 'viewer') return;

    const payload = {
        tool_code: currentTool,
        survey_code: document.getElementById('surveyCodeInput').value,
        commune: document.getElementById('communeSelect').value,
        hamlet: document.getElementById('hamletInput').value,
        respondent_name: document.getElementById('respondentNameInput').value,
        gps: document.getElementById('gpsInput').value,
        photo_data: currentHouseholdPhotoData || '',
        photo_meta: currentHouseholdPhotoMeta || '',
        answers: currentDraftAnswers,
        saved_at: new Date().toLocaleTimeString('vi-VN')
    };

    try {
        localStorage.setItem(`dakman_draft_${currentTool}`, JSON.stringify(payload));
    } catch (e) {
        // Nếu ảnh vượt quota localStorage, lưu nháp không kèm ảnh
        const lightPayload = Object.assign({}, payload, { photo_data: '' });
        try { localStorage.setItem(`dakman_draft_${currentTool}`, JSON.stringify(lightPayload)); } catch (_) {}
    }
    updateDraftTimeDisplay(payload.saved_at);

    if (isManual) {
        alert('Đã lưu bản nháp thành công vào bộ nhớ trình duyệt!');
    }
}

function manualSaveDraft() {
    saveDraftLocal(true);
}

function updateDraftTimeDisplay(timeStr) {
    const indicator = document.getElementById('draftIndicator');
    if (!indicator) return;
    if (timeStr) {
        indicator.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Đã lưu nháp lúc ${timeStr}`;
    } else {
        indicator.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Tự động lưu nháp`;
    }
}

function updateAnsweredSummaryBadge() {
    const visible = getVisibleQuestions();
    const totalQ = visible.length;
    const answeredCount = visible.filter(q => isQuestionAnswered(q.code)).length;
    const pct = totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0;

    const pText = document.getElementById('surveyProgressText');
    const pPct = document.getElementById('surveyProgressPct');
    const pFill = document.getElementById('surveyProgressFill');
    if (pText) pText.textContent = `Tiến độ: ${answeredCount} / ${totalQ} câu hỏi`;
    if (pPct) pPct.textContent = `${pct}%`;
    if (pFill) pFill.style.width = `${pct}%`;

    const indicator = document.getElementById('draftIndicator');
    if (indicator && totalQ > 0) {
        indicator.title = `Đã trả lời ${answeredCount}/${totalQ} câu hỏi`;
    }

    // Cập nhật trạng thái từng card đang hiển thị
    document.querySelectorAll('.question-card').forEach(card => {
        const code = card.dataset.code;
        if (isQuestionAnswered(code)) {
            card.classList.add('answered');
            card.classList.remove('unanswered-highlight');
        } else {
            card.classList.remove('answered');
        }
    });

    // Cập nhật số đếm (đã trả lời / tổng) trên từng tab Phần
    const sections = getToolSections();
    sections.forEach((sec, idx) => {
        const btn = document.getElementById(`jumpBtn-${idx}`);
        if (!btn) return;
        const secVisible = visible.filter(q => (q.section || 'Thông tin chung') === sec);
        const secAns = secVisible.filter(q => isQuestionAnswered(q.code)).length;
        const done = secVisible.length > 0 && secAns === secVisible.length;
        btn.classList.toggle('sec-complete', done);
        btn.innerHTML = `${escapeHtml(sec)} <span style="opacity:0.85; font-size:0.75em;">(${secAns}/${secVisible.length}${done ? ' ✓' : ''})</span>`;
    });
}

// ========================================================
// 7. LẤY TỌA ĐỘ GPS
// ========================================================
function autoCaptureGPS() {
    if (currentUser?.role === 'viewer') {
        alert('Tài khoản ở chế độ chỉ xem.');
        return;
    }
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                document.getElementById('gpsInput').value = `${lat}, ${lng}`;
                saveDraftLocal(false);
                alert(`Đã lấy tọa độ GPS thành công:\nVĩ độ: ${lat}\nKinh độ: ${lng}\nĐộ chính xác: ±${Math.round(pos.coords.accuracy)} mét`);
            },
            (err) => {
                alert('Không thể lấy tọa độ tự động: ' + err.message + '. Vui lòng kiểm tra quyền truy cập vị trí trên thiết bị.');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        alert('Thiết bị của bạn không hỗ trợ định vị Geolocation API.');
    }
}

// ========================================================
// 7B. CHỤP ẢNH ĐẦU TIÊN CÙNG CHỦ HỘ & ĐÓNG WATERMARK THỜI GIAN + VỊ TRÍ
// ========================================================
function triggerHouseholdPhotoCapture() {
    if (currentUser?.role === 'viewer') {
        alert('Tài khoản ở chế độ chỉ xem, không được phép chụp ảnh.');
        return;
    }
    const input = document.getElementById('householdPhotoInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function setHouseholdPhotoPreview(dataUrl, metaText) {
    currentHouseholdPhotoData = dataUrl || '';
    currentHouseholdPhotoMeta = metaText || '';
    const box = document.getElementById('photoPreviewBox');
    const img = document.getElementById('photoPreviewImg');
    const meta = document.getElementById('photoWatermarkMeta');
    const status = document.getElementById('photoWatermarkStatus');
    const btnClear = document.getElementById('btnClearHouseholdPhoto');

    if (currentHouseholdPhotoData) {
        if (img) img.src = currentHouseholdPhotoData;
        if (meta) meta.textContent = currentHouseholdPhotoMeta;
        if (box) box.style.display = 'block';
        if (btnClear) btnClear.style.display = 'inline-block';
        if (status) {
            status.style.color = '#15803d';
            status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã đóng watermark ảnh';
        }
    } else {
        if (img) img.src = '';
        if (meta) meta.textContent = '';
        if (box) box.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
        if (status) {
            status.style.color = '#64748b';
            status.textContent = 'Chưa chụp ảnh';
        }
    }
}

function clearHouseholdPhoto(silent = false) {
    const input = document.getElementById('householdPhotoInput');
    if (input) input.value = '';
    setHouseholdPhotoPreview('', '');
    if (!silent) {
        saveDraftLocal(false);
    }
}

function getFreshGpsString(timeoutMs = 5000) {
    return new Promise((resolve) => {
        const gpsEl = document.getElementById('gpsInput');
        const existing = gpsEl ? gpsEl.value.trim() : '';
        if (existing) {
            resolve(existing);
            return;
        }
        if (!navigator.geolocation) {
            resolve('Chưa có GPS');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                const str = `${lat}, ${lng}`;
                if (gpsEl && !gpsEl.value.trim()) {
                    gpsEl.value = str;
                }
                resolve(str);
            },
            () => resolve('Chưa có GPS'),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
        );
    });
}

async function handlePhotoSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const status = document.getElementById('photoWatermarkStatus');
    if (status) {
        status.style.color = '#d97706';
        status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lấy GPS & đóng watermark...';
    }

    const gpsStr = await getFreshGpsString(5000);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const surveyCode = (document.getElementById('surveyCodeInput')?.value || '').trim() || currentTool;
    const commune = (document.getElementById('communeSelect')?.value || '').trim();
    const hamlet = (document.getElementById('hamletInput')?.value || '').trim();
    const respondent = (document.getElementById('respondentNameInput')?.value || '').trim() || 'Chưa nhập tên chủ hộ';
    const surveyorName = currentUser?.full_name || 'Điều tra viên';
    const surveyorId = currentUser?.surveyor_id || 'DTV';

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
        try {
            const maxDim = 1280;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > maxDim || h > maxDim) {
                if (w >= h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            const fontSize = Math.max(14, Math.round(w * 0.021));
            const lineHeight = Math.round(fontSize * 1.45);
            const padding = Math.round(fontSize * 0.8);
            const barHeight = lineHeight * 3 + padding * 1.6;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
            ctx.fillRect(0, h - barHeight, w, barHeight);

            ctx.fillStyle = '#4ade80';
            ctx.fillRect(0, h - barHeight, Math.max(4, Math.round(w * 0.006)), barHeight);

            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'top';

            const startY = h - barHeight + padding * 0.7;
            const leftX = padding + 6;
            const line1 = `DAKMAN CƯ M'GAR | Mã phiếu: ${surveyCode} | Chủ hộ: ${respondent}`;
            const line2 = `Thời gian: ${timestampStr} | Vị trí GPS: ${gpsStr}`;
            const line3 = `Địa bàn: ${commune}${hamlet ? ' - ' + hamlet : ''} | ĐTV: ${surveyorName} (${surveyorId})`;

            ctx.fillText(line1, leftX, startY);
            ctx.font = `${fontSize}px Arial, sans-serif`;
            ctx.fillStyle = '#fef08a';
            ctx.fillText(line2, leftX, startY + lineHeight);
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(line3, leftX, startY + lineHeight * 2);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const metaText = `${timestampStr} | GPS: ${gpsStr} | ${surveyCode} — ${respondent}`;
            setHouseholdPhotoPreview(dataUrl, metaText);
            saveDraftLocal(false);
        } catch (err) {
            alert('Không thể xử lý ảnh watermark: ' + err.message);
            clearHouseholdPhoto(true);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    };

    img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        alert('Tệp ảnh không hợp lệ hoặc bị lỗi.');
        clearHouseholdPhoto(true);
    };

    img.src = objectUrl;
}

// ========================================================
// 8. GỬI PHIẾU KHẢO SÁT LÊN HỆ THỐNG
// ========================================================
async function handleSurveySubmit(e) {
    e.preventDefault();
    if (currentUser?.role === 'viewer') {
        alert('Tài khoản hiện tại ở chế độ Chỉ Xem (Viewer), không được phép nộp phiếu.');
        return;
    }

    const visible = getVisibleQuestions();
    const missing = visible.filter(q => !isQuestionAnswered(q.code));
    if (missing.length > 0) {
        const bySec = {};
        missing.forEach(q => {
            const s = q.section || 'Thông tin chung';
            if (!bySec[s]) bySec[s] = [];
            bySec[s].push(q.code);
        });
        const summary = Object.entries(bySec).map(([s, codes]) => `- ${s}: ${codes.slice(0, 5).join(', ')}${codes.length > 5 ? '...' : ''}`).join('\n');
        const proceed = confirm(
            `CẢNH BÁO BỎ SÓT CÂU HỎI!\nCòn ${missing.length} câu hỏi chưa có câu trả lời:\n${summary}\n\n` +
            `• Bấm [Hủy / Cancel] để quay lại điền tiếp câu hỏi còn thiếu (khuyên dùng).\n` +
            `• Bấm [OK] nếu chủ hộ từ chối trả lời và bạn vẫn muốn nộp phiếu.`
        );
        if (!proceed) {
            jumpToFirstUnanswered();
            return;
        }
    }

    const btn = document.getElementById('btnSubmitForm');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ĐANG GỬI KẾT QUẢ...';

    const surveyCode = document.getElementById('surveyCodeInput').value.trim();
    const commune = document.getElementById('communeSelect').value;
    const hamlet = document.getElementById('hamletInput').value.trim();
    const respondentName = document.getElementById('respondentNameInput').value.trim();
    const gpsStr = document.getElementById('gpsInput').value.trim();
    let gpsLat = 0.0, gpsLng = 0.0;
    const coordMatch = gpsStr.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (coordMatch) {
        gpsLat = parseFloat(coordMatch[1]) || 0.0;
        gpsLng = parseFloat(coordMatch[2]) || 0.0;
    }
    if (gpsStr) {
        currentDraftAnswers['_gps_text'] = gpsStr;
    } else {
        delete currentDraftAnswers['_gps_text'];
    }

    const toolObj = allQuestionsData[currentTool] || {};

    const payload = {
        role: currentUser?.role || 'editor',
        survey_code: surveyCode,
        tool_code: currentTool,
        tool_name: toolObj.tool_name || currentTool,
        surveyor_id: currentUser?.surveyor_id || 'DTV01',
        surveyor_name: currentUser?.full_name || 'Điều tra viên',
        survey_date: document.getElementById('surveyDateInput').value || new Date().toISOString().split('T')[0],
        commune: commune,
        hamlet: hamlet,
        target_group: toolObj.group || 'Chung',
        respondent_name: respondentName,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        photo_data: currentHouseholdPhotoData || '',
        answers: currentDraftAnswers
    };

    try {
        const isEditing = !!editingSurveyId;
        const targetUrl = isEditing ? apiUrl(`/api/surveys/${editingSurveyId}`) : apiUrl('/api/surveys');
        const res = await fetch(targetUrl, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            const savedId = isEditing ? editingSurveyId : data.survey_id;
            const msg = isEditing
                ? `THÀNH CÔNG!\nĐã cập nhật lại toàn bộ nội dung phiếu ${surveyCode} trên hệ thống.`
                : `THÀNH CÔNG!\nPhiếu phỏng vấn ${surveyCode} đã được lưu an toàn lên hệ thống.`;
            if (savedId && (currentUser?.role === 'admin' || currentUser?.role === 'editor') && confirm(`${msg}\n\nBạn có muốn XUẤT BÁO CÁO PDF của hộ vừa phỏng vấn ngay bây giờ không?`)) {
                window.open(getPdfExportUrl(savedId), '_blank');
            } else {
                alert(msg);
            }

            localStorage.removeItem(`dakman_draft_${currentTool}`);
            currentDraftAnswers = {};
            editingSurveyId = null;
            clearHouseholdPhoto(true);

            await refreshDashboardData();
            await loadSurveysList();
            switchMainView('history');
        } else {
            const err = await res.json();
            alert('Lỗi từ máy chủ: ' + (err.error || 'Không thể lưu phiếu'));
        }
    } catch (err) {
        saveToOfflineQueue(payload);
        alert('Máy chủ không phản hồi hoặc mất kết nối mạng. Phiếu đã được lưu an toàn vào HÀNG ĐỢI OFFLINE của thiết bị.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> GỬI KẾT QUẢ LÊN HỆ THỐNG DAKMAN';
    }
}

function saveToOfflineQueue(surveyData) {
    const queue = JSON.parse(localStorage.getItem('dakman_offline_queue') || '[]');
    queue.push(surveyData);
    localStorage.setItem('dakman_offline_queue', JSON.stringify(queue));
}

// ========================================================
// 9. BÁO CÁO TIẾN ĐỘ THỰC ĐỊA (DASHBOARD)
// ========================================================
async function refreshDashboardData() {
    try {
        const res = await fetch(apiUrl('/api/stats'));
        if (!res.ok) return;
        const data = await res.json();

        const totalComp = data.total_completed || 0;
        const p1Comp = (data.tool_counts && data.tool_counts['P1']) || 0;
        const totalPct = ((totalComp / 312) * 100).toFixed(1);

        const elTotal = document.getElementById('statDashCompleted');
        const elP1 = document.getElementById('statDashP1');
        const elPct = document.getElementById('statDashPercent');

        if (elTotal) elTotal.textContent = totalComp;
        if (elP1) elP1.textContent = `${p1Comp} / 220`;
        if (elPct) elPct.textContent = `${totalPct}%`;

        renderGroupProgressTable(data);
        renderCommuneProgressTable(data);
    } catch (e) {
        console.warn('Không tải được số liệu thống kê:', e);
    }
}

function renderGroupProgressTable(data) {
    const tbody = document.getElementById('groupProgressTbody');
    if (!tbody) return;

    const counts = data.tool_counts || {};
    const groups = [
        {
            name: 'Nhóm 1: Hộ Nông Dân & Thôn Buôn',
            code: 'P1, KIP, MH',
            type: 'Phỏng vấn trực tiếp & Thảo luận nhóm',
            target: 268,
            actual: (counts['P1'] || 0) + (counts['KIP'] || 0) + (counts['MH'] || 0)
        },
        {
            name: 'Nhóm 2: Nhóm Trưởng ToT, Tổ Dịch Vụ, HTX',
            code: 'NT, SDM, HTX',
            type: 'Phỏng vấn sâu bán cấu trúc',
            target: 36,
            actual: (counts['NT'] || 0) + (counts['SDM'] || 0) + (counts['HTX'] || 0)
        },
        {
            name: 'Nhóm 3: Chính Quyền & Cơ Quan Nhà Nước',
            code: 'CQ',
            type: 'Tham vấn chính sách & Báo cáo cấp xã/huyện',
            target: 6,
            actual: (counts['CQ'] || 0)
        },
        {
            name: 'Nhóm 4: Nhà Tài Trợ & Chuyên Gia Dự Án',
            code: 'TT',
            type: 'Phỏng vấn chuyên sâu chiến lược',
            target: 2,
            actual: (counts['TT'] || 0)
        }
    ];

    tbody.innerHTML = groups.map(g => {
        const pct = Math.min(100, ((g.actual / g.target) * 100)).toFixed(1);
        let badge = '<span class="stat-badge pending">Đang thực hiện</span>';
        if (g.actual >= g.target) {
            badge = '<span class="stat-badge pass">Đạt chỉ tiêu</span>';
        }

        return `
            <tr>
                <td><strong>${g.name}</strong></td>
                <td><span style="font-family: monospace; font-weight: 700; color: var(--primary);">${g.code}</span></td>
                <td>${g.type}</td>
                <td style="text-align: center; font-weight: 700;">${g.target}</td>
                <td style="text-align: center; font-weight: 700; color: #15803d;">${g.actual}</td>
                <td style="text-align: center; font-weight: 700;">${pct}%</td>
                <td style="text-align: center;">${badge}</td>
            </tr>
        `;
    }).join('');
}

function renderCommuneProgressTable(data) {
    const tbody = document.getElementById('communeProgressTbody');
    if (!tbody) return;

    const commCounts = data.commune_counts || {};
    const eakiet = commCounts['Ea Kiết'] || 0;
    const eatar = commCounts['Ea Tar'] || 0;
    const cdmn = commCounts["Cư Dliê M'nông"] || 0;

    const list = [
        {
            name: 'Xã Ea Kiết',
            schedule: '05/11 – 11/11/2026',
            team: 'Tổ 1 (4 ĐTV) + Giám sát viên',
            target: 84,
            actual: eakiet
        },
        {
            name: 'Xã Ea Tar',
            schedule: '12/11 – 15/11/2026',
            team: 'Tổ 2 (3 ĐTV) + Giám sát viên',
            target: 51,
            actual: eatar
        },
        {
            name: "Xã Cư Dliê M'nông",
            schedule: '16/11 – 21/11/2026',
            team: 'Tổ 1 & Tổ 2 (7 ĐTV) tập trung',
            target: 85,
            actual: cdmn
        }
    ];

    tbody.innerHTML = list.map(c => {
        const pct = Math.min(100, ((c.actual / c.target) * 100)).toFixed(1);
        let badge = '<span class="stat-badge pending">Tiến độ bình thường</span>';
        if (c.actual >= c.target) {
            badge = '<span class="stat-badge pass">Hoàn thành xã</span>';
        }

        return `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.schedule}</td>
                <td style="font-size: 0.82rem;">${c.team}</td>
                <td style="text-align: center; font-weight: 700;">${c.target}</td>
                <td style="text-align: center; font-weight: 700; color: #15803d;">${c.actual}</td>
                <td style="text-align: center; font-weight: 700;">${pct}%</td>
                <td style="text-align: center;">${badge}</td>
            </tr>
        `;
    }).join('');
}

// ========================================================
// 10. DANH SÁCH DỮ LIỆU ĐÃ NỘP & CHỈNH SỬA / XÓA PHIẾU
// ========================================================
async function loadSurveysList() {
    try {
        const res = await fetch(apiUrl('/api/surveys'));
        if (!res.ok) return;
        const list = await res.json();

        const tbody = document.getElementById('surveyHistoryTbody');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--slate-500);">Chưa có phiếu khảo sát nào được nộp lên hệ thống.</td></tr>';
            return;
        }

        const role = currentUser?.role || 'editor';
        const curUserId = currentUser?.surveyor_id || '';

        tbody.innerHTML = list.map(item => {
            const canEdit = (role === 'admin') || (role === 'editor' && (item.surveyor_id === curUserId || !item.surveyor_id));
            const canDelete = (role === 'admin') || (role === 'editor' && (item.surveyor_id === curUserId || !item.surveyor_id));
            const photoBadge = item.photo_path ? ' <i class="fa-solid fa-camera" style="color: #15803d;" title="Có ảnh hiện trường (Watermark)"></i>' : '';

            return `
                <tr>
                    <td style="font-family: monospace; font-weight: 700; color: var(--primary);">${item.survey_code}${photoBadge}</td>
                    <td><span style="background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 3px; font-weight: 700; font-size: 0.78rem;">${item.tool_code}</span></td>
                    <td>${item.commune} ${item.hamlet ? `(${item.hamlet})` : ''}</td>
                    <td style="font-weight: 600;">${item.respondent_name || '—'}</td>
                    <td style="font-size: 0.82rem;">${item.surveyor_name} (${item.surveyor_id})</td>
                    <td style="text-align: center; font-family: monospace; font-size: 0.82rem;">${formatDateVN(item.survey_date)}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        <button type="button" 
                                onclick="viewSurveyDetail(${item.id})" 
                                style="background: var(--slate-100); border: 1px solid var(--border); padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 600; color: var(--primary); margin-right: 4px;" title="Xem nội dung chi tiết">
                            <i class="fa-solid fa-eye"></i> Xem
                        </button>
                        ${canEdit ? `
                            <a href="${getPdfExportUrl(item.id)}" target="_blank"
                               style="display: inline-block; background: #fef2f2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 3px; font-size: 0.78rem; font-weight: 600; color: #b91c1c; text-decoration: none; margin-right: 4px;" title="Xuất báo cáo phỏng vấn PDF">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </a>
                        ` : ''}
                        ${canEdit ? `
                            <button type="button" 
                                    onclick="openEditSurveyModal(${item.id})" 
                                    style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 600; color: #166534; margin-right: 4px;" title="Cập nhật sửa đổi phiếu">
                                <i class="fa-solid fa-pen-to-square"></i> Sửa
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button type="button" 
                                    onclick="deleteSurveyConfirm(${item.id}, '${item.survey_code}')" 
                                    style="background: #fef2f2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 600; color: #b91c1c;" title="Xóa phiếu (Chỉ quyền Admin)">
                                <i class="fa-solid fa-trash-can"></i> Xóa
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.warn('Không tải được danh sách phiếu đã nộp:', e);
    }
}

// ========================================================
// 11. XEM CHI TIẾT PHIẾU
// ========================================================
async function viewSurveyDetail(id) {
    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`));
        if (!res.ok) return;
        const item = await res.json();

        document.getElementById('detailModalTitle').textContent = `CHI TIẾT PHIẾU: ${item.survey_code} (${item.tool_code})`;

        const body = document.getElementById('detailModalBody');
        const answers = item.answers || {};
        const keys = Object.keys(answers);

        let photoHtml = '';
        if (item.photo_url) {
            const fullPhotoUrl = apiUrl(item.photo_url);
            photoHtml = `
                <div style="margin-bottom: 12px; padding: 10px; background: #ffffff; border: 1px solid #d0d0d0; border-radius: var(--radius-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.82rem; font-weight: 700; color: #15803d;">
                        <span><i class="fa-solid fa-camera"></i> ẢNH HIỆN TRƯỜNG CÙNG CHỦ HỘ (WATERMARK)</span>
                        <a href="${fullPhotoUrl}" target="_blank" style="color: var(--primary); text-decoration: none;">Mở ảnh gốc <i class="fa-solid fa-up-right-from-square"></i></a>
                    </div>
                    <img src="${fullPhotoUrl}" alt="Ảnh hiện trường ${item.survey_code}" style="max-width: 100%; max-height: 360px; display: block; border: 1px solid #e2e8f0; border-radius: 2px;">
                </div>
            `;
        }

        let ansHtml = '';
        if (keys.length === 0) {
            ansHtml = '<p style="color: var(--slate-500); font-style: italic;">Không có nội dung câu trả lời nào được ghi.</p>';
        } else {
            ansHtml = `
                <table class="report-table" style="margin-top: 8px;">
                    <thead>
                        <tr>
                            <th style="width: 100px;">Mã Câu</th>
                            <th>Nội Dung Câu Trả Lời Thu Thập Được</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${keys.map(k => `
                            <tr>
                                <td style="font-family: monospace; font-weight: 700; color: var(--primary);">${k}</td>
                                <td style="white-space: pre-wrap;">${formatAnswerDisplay(answers[k])}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        const canExportItem = (currentUser?.role === 'admin') || (currentUser?.role === 'editor' && (item.surveyor_id === currentUser?.surveyor_id || !item.surveyor_id));

        body.innerHTML = `
            <div style="background: var(--slate-50); padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 12px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 0.84rem;">
                    <div><strong>Đối tượng phỏng vấn:</strong> ${item.respondent_name || '—'}</div>
                    <div><strong>Địa bàn:</strong> ${item.commune} ${item.hamlet ? `(${item.hamlet})` : ''}</div>
                    <div><strong>Điều tra viên:</strong> ${item.surveyor_name} (${item.surveyor_id})</div>
                    <div><strong>Ngày phỏng vấn:</strong> ${formatDateVN(item.survey_date)}</div>
                    <div><strong>Tọa độ GPS:</strong> ${item.gps_lat && item.gps_lng ? `${item.gps_lat}, ${item.gps_lng}` : 'Chưa ghi nhận'}</div>
                    <div><strong>Công cụ:</strong> ${item.tool_code} — ${item.tool_name}</div>
                </div>
            </div>
            <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--primary); text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <span>Dữ liệu chi tiết từng câu hỏi (${keys.length} câu đã trả lời):</span>
                ${canExportItem ? `
                <span style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <a href="${getPdfExportUrl(item.id)}" target="_blank" style="background:#b91c1c;color:#fff;border:none;padding:5px 10px;border-radius:3px;font-size:0.78rem;text-decoration:none;font-weight:600;"><i class="fa-solid fa-file-pdf"></i> Xuất Báo Cáo PDF</a>
                    <button type="button" onclick="reloadSurveyIntoForm(${item.id})" style="background:#002060;color:#fff;border:none;padding:5px 10px;border-radius:3px;font-size:0.78rem;cursor:pointer;font-weight:600;"><i class="fa-solid fa-pen-to-square"></i> Mở lên Form để nhập liệu lại</button>
                </span>` : ''}
            </h4>
            ${photoHtml}
            ${ansHtml}
        `;

        document.getElementById('surveyDetailModal').classList.add('active');
    } catch (e) {
        alert('Không tải được chi tiết phiếu');
    }
}

function hideDetailModal() {
    const modal = document.getElementById('surveyDetailModal');
    if (modal) modal.classList.remove('active');
}

async function reloadSurveyIntoForm(id) {
    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`));
        if (!res.ok) return;
        const item = await res.json();
        hideDetailModal();
        switchMainView('survey');
        selectTool(item.tool_code || 'P1');

        editingSurveyId = item.id;
        document.getElementById('surveyCodeInput').value = item.survey_code || '';
        if (item.commune) document.getElementById('communeSelect').value = item.commune;
        document.getElementById('hamletInput').value = item.hamlet || '';
        document.getElementById('respondentNameInput').value = item.respondent_name || '';
        if (item.survey_date) document.getElementById('surveyDateInput').value = item.survey_date;
        document.getElementById('gpsInput').value = (item.answers && item.answers._gps_text)
            ? item.answers._gps_text
            : ((item.gps_lat && item.gps_lng) ? `${item.gps_lat}, ${item.gps_lng}` : '');

        currentDraftAnswers = Object.assign({}, item.answers || {});
        if (item.photo_url) {
            setHouseholdPhotoPreview(apiUrl(item.photo_url), `Ảnh đã lưu trên máy chủ (${item.survey_code})`);
            // Không gửi lại URL thành base64 nếu không chụp ảnh mới
            currentHouseholdPhotoData = '';
        } else {
            clearHouseholdPhoto(true);
        }

        renderQuestionsForSection(currentSection);
        updateAnsweredSummaryBadge();

        const btn = document.getElementById('btnSubmitForm');
        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> CẬP NHẬT LẠI PHIẾU [${escapeHtml(item.survey_code)}]`;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        alert('Không thể nạp dữ liệu phiếu lên Form.');
    }
}

// ========================================================
// ========================================================
// 12. CHỈNH SỬA & XÓA PHIẾU KHẢO SÁT (ADMIN & NGƯỜI LẬP)
// ========================================================
function getAdminKey() {
    return (currentUser && currentUser.key) || localStorage.getItem('dakman_admin_key') || 'AAdmin123';
}

async function openEditSurveyModal(id) {
    if (currentUser?.role === 'viewer') {
        alert('Tài khoản quyền Chỉ xem không được phép chỉnh sửa phiếu!');
        return;
    }
    try {
        const res = await fetch(`/api/surveys/${id}`);
        if (!res.ok) {
            alert('Không tìm thấy dữ liệu phiếu trên máy chủ VPS.');
            return;
        }
        const item = await res.json();

        const fId = document.getElementById('editSurveyId');
        const fCode = document.getElementById('editSurveyCode');
        const fCommune = document.getElementById('editSurveyCommune');
        const fHamlet = document.getElementById('editSurveyHamlet');
        const fResp = document.getElementById('editSurveyRespondent');
        const fPhone = document.getElementById('editSurveyPhone');
        const fDate = document.getElementById('editSurveyDate');
        const fSurvId = document.getElementById('editSurveySurveyorId');
        const fSurvName = document.getElementById('editSurveySurveyorName');
        const fGps = document.getElementById('editSurveyGPS');

        if (fId) fId.value = item.id;
        if (fCode) fCode.value = item.survey_code || '';
        if (fCommune) fCommune.value = item.commune || 'Ea Kiết';
        if (fHamlet) fHamlet.value = item.hamlet || '';
        if (fResp) fResp.value = item.respondent_name || '';
        if (fPhone) fPhone.value = item.respondent_phone || '';
        if (fDate) fDate.value = item.survey_date || '';
        if (fSurvId) fSurvId.value = item.surveyor_id || '';
        if (fSurvName) fSurvName.value = item.surveyor_name || '';
        if (fGps) fGps.value = (item.gps_lat && item.gps_lng) ? `${item.gps_lat}, ${item.gps_lng}` : '';

        const modal = document.getElementById('surveyEditModal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    } catch (err) {
        alert('Lỗi khi mở cửa sổ chỉnh sửa phiếu: ' + err.message);
    }
}

function hideEditSurveyModal() {
    const modal = document.getElementById('surveyEditModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function handleEditSurveySubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editSurveyId').value;
    const code = document.getElementById('editSurveyCode').value.trim();
    const commune = document.getElementById('editSurveyCommune').value;
    const hamlet = document.getElementById('editSurveyHamlet').value.trim();
    const respondent = document.getElementById('editSurveyRespondent').value.trim();
    const phone = document.getElementById('editSurveyPhone').value.trim();
    const surveyDate = document.getElementById('editSurveyDate').value;
    const surveyorId = document.getElementById('editSurveySurveyorId').value.trim();
    const surveyorName = document.getElementById('editSurveySurveyorName').value.trim();
    const gpsVal = document.getElementById('editSurveyGPS').value.trim();

    let lat = null;
    let lng = null;
    if (gpsVal && gpsVal.includes(',')) {
        const parts = gpsVal.split(',');
        lat = parseFloat(parts[0].trim()) || null;
        lng = parseFloat(parts[1].trim()) || null;
    }

    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                role: currentUser?.role || 'editor',
                survey_code: code,
                commune: commune,
                hamlet: hamlet,
                respondent_name: respondent,
                respondent_phone: phone,
                survey_date: surveyDate,
                surveyor_id: surveyorId,
                surveyor_name: surveyorName,
                gps_lat: lat,
                gps_lng: lng
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            alert(`Đã cập nhật chỉnh sửa phiếu [${code}] thành công!`);
            hideEditSurveyModal();
            await loadSurveysList();
            if (typeof refreshDashboardData === 'function') {
                refreshDashboardData();
            }
        } else {
            alert('Lỗi cập nhật: ' + (data.error || 'Không thành công'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ VPS khi cập nhật phiếu.');
    }
}

async function deleteSurveyConfirm(id, surveyCode) {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không có quyền xóa phiếu.');
        return;
    }

    const pwd = prompt(
        `XÁC NHẬN MẬT KHẨU ĐỂ XÓA PHIẾU [${surveyCode}]:\n` +
        `Vui lòng nhập mật khẩu ${role === 'admin' ? 'Quản trị viên (Admin)' : 'tài khoản của bạn (hoặc mật khẩu Admin)'} để xác nhận:`
    );
    if (pwd === null) return;
    if (!pwd.trim()) {
        alert('Bạn phải nhập mật khẩu để xác nhận xóa phiếu!');
        return;
    }

    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`), {
            method: 'DELETE',
            headers: {
                'X-Delete-Password': pwd.trim(),
                'X-User-Role': role,
                'X-User-Id': currentUser?.surveyor_id || '',
                'X-Admin-Key': pwd.trim()
            }
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            alert(data.message || `Đã chuyển phiếu ${surveyCode} vào Thùng rác lưu trữ!`);
            await loadSurveysList();
            if (typeof refreshDashboardData === 'function') {
                refreshDashboardData();
            }
        } else {
            alert('Lỗi xóa phiếu: ' + (data.error || 'Mật khẩu không đúng hoặc thao tác không được phép'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ khi gửi yêu cầu xóa.');
    }
}

function formatAnswerDisplay(val) {
    if (Array.isArray(val)) {
        return val.join(', ');
    }
    if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val, null, 2);
    }
    return val;
}

function escapeQuotes(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ========================================================
// 13. QUẢN LÝ NHÂN SỰ & BẢO MẬT ADMIN (DUAL TABS)
// ========================================================
function generateStaffId() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}${mm}${ss}`;
    const randNum = String(Math.floor(Math.random() * 90) + 10);
    const code = `TCN-${randNum}-${timeStr}`;
    const target = document.getElementById('newStaffId');
    if (target) target.value = code;
    return code;
}

function generateRandomStaffPass() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const target = document.getElementById('editStaffPassword');
    if (target) target.value = pwd;
    const targetNew = document.getElementById('newStaffPassword');
    if (targetNew) targetNew.value = pwd;
    return pwd;
}

async function openStaffModal() {
    if (currentUser?.role !== 'admin') {
        alert('Chỉ tài khoản Quản trị viên (Admin) mới có quyền truy cập chức năng này.');
        return;
    }
    generateStaffId();
    generateRandomStaffPass();
    const sName = document.getElementById('newStaffName');
    const sPhone = document.getElementById('newStaffPhone');
    if (sName) sName.value = '';
    if (sPhone) sPhone.value = '';

    switchAdminSubTab('staff');
    await loadStaffList();

    const modal = document.getElementById('staffManagerModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

function hideStaffModal() {
    const modal = document.getElementById('staffManagerModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function switchAdminSubTab(subTab) {
    const btnStaff = document.getElementById('btnAdminTabStaff');
    const btnSec = document.getElementById('btnAdminTabSecurity');
    const btnTrash = document.getElementById('btnAdminTabTrash');
    const btnQuestions = document.getElementById('btnAdminTabQuestions');
    const paneStaff = document.getElementById('adminTabPaneStaff');
    const paneSec = document.getElementById('adminTabPaneSecurity');
    const paneTrash = document.getElementById('adminTabPaneTrash');
    const paneQuestions = document.getElementById('adminTabPaneQuestions');

    [btnStaff, btnSec, btnTrash, btnQuestions].forEach(b => b && b.classList.remove('active'));
    [paneStaff, paneSec, paneTrash, paneQuestions].forEach(p => { if (p) p.style.display = 'none'; });

    if (subTab === 'staff') {
        if (btnStaff) btnStaff.classList.add('active');
        if (paneStaff) paneStaff.style.display = 'block';
    } else if (subTab === 'security') {
        if (btnSec) btnSec.classList.add('active');
        if (paneSec) paneSec.style.display = 'block';
        loadAdminSettings();
    } else if (subTab === 'trash') {
        if (btnTrash) btnTrash.classList.add('active');
        if (paneTrash) paneTrash.style.display = 'block';
        loadTrashList();
    } else if (subTab === 'questions') {
        if (btnQuestions) btnQuestions.classList.add('active');
        if (paneQuestions) paneQuestions.style.display = 'block';
        const sel = document.getElementById('adminQuestionToolSelect');
        if (sel && allQuestionsData[currentTool]) sel.value = currentTool;
        loadAdminQuestionsTable();
    }
}

function getQuestionTypeLabel(qType) {
    const t = String(qType || 'TX').toUpperCase();
    if (t.includes('DR') || t.includes('SELECT')) return 'Dropdown';
    if (t.includes('MO') || t.includes('CB')) return 'Chọn nhiều';
    if (t.includes('SC') || t.includes('MC')) return 'Chọn 1';
    if (t.includes('SO') || t.includes('NUM')) return 'Số liệu';
    if (t.includes('LK')) return 'Likert 1-5';
    if (t.includes('DT') || t.includes('DATE')) return 'Ngày tháng';
    return 'Văn bản';
}

function loadAdminQuestionsTable() {
    const toolCode = document.getElementById('adminQuestionToolSelect')?.value || currentTool || 'P1';
    const kw = (document.getElementById('adminQuestionSearch')?.value || '').trim().toLowerCase();
    const tbody = document.getElementById('adminQuestionsTbody');
    const dl = document.getElementById('qSectionDatalist');
    if (!tbody) return;

    const toolObj = allQuestionsData[toolCode];
    const questions = (toolObj && toolObj.questions) ? toolObj.questions : [];

    if (dl) {
        const secs = [...new Set(questions.map(q => q.section || 'Thông tin chung'))];
        dl.innerHTML = secs.map(s => `<option value="${escapeHtml(s)}">`).join('');
    }

    const filtered = kw
        ? questions.filter(q =>
            String(q.code || '').toLowerCase().includes(kw) ||
            String(q.text || '').toLowerCase().includes(kw) ||
            String(q.section || '').toLowerCase().includes(kw)
        )
        : questions;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:14px;">Không có câu hỏi nào phù hợp.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(q => `
        <tr>
            <td style="font-family:monospace;font-weight:700;color:#002060;">${escapeHtml(q.code)}</td>
            <td style="font-size:0.74rem;color:#475569;">${escapeHtml(q.section || '')}</td>
            <td>${escapeHtml(q.text || '')}</td>
            <td><span style="background:#e2e8f0;padding:2px 6px;border-radius:3px;font-size:0.72rem;font-weight:700;">${getQuestionTypeLabel(q.type)}</span></td>
            <td style="text-align:center;white-space:nowrap;">
                <button type="button" onclick="openEditQuestionForm('${escapeQuotes(q.code)}')" style="background:#eab308;color:#713f12;border:none;padding:3px 7px;border-radius:3px;cursor:pointer;font-size:0.74rem;font-weight:600;margin-right:3px;">
                    <i class="fa-solid fa-pen"></i> Sửa
                </button>
                <button type="button" onclick="deleteAdminQuestion('${escapeQuotes(q.code)}')" style="background:#ef4444;color:#fff;border:none;padding:3px 7px;border-radius:3px;cursor:pointer;font-size:0.74rem;font-weight:600;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function applyOptionPreset(preset) {
    const el = document.getElementById('qEditOptions');
    if (!el) return;
    if (preset === 'yesno') el.value = '1=Có\n2=Không';
    else if (preset === 'yesno_dk') el.value = '1=Có\n2=Không\n99=Không biết';
    else if (preset === 'passfail') el.value = '1=Đạt\n2=Chưa đạt';
    else if (preset === 'communes') el.value = '1=Ea Kiết\n2=Ea Tar\n3=Cư Dliê M\'nông';
}

function onQuestionTypeChange() {
    const t = (document.getElementById('qEditType')?.value || 'TX').toUpperCase();
    const wrap = document.getElementById('qEditOptionsWrap');
    const numWrap = document.getElementById('qEditNumberWrap');
    const presets = document.getElementById('qOptionPresets');
    const lbl = document.getElementById('qEditOptionsLabel');
    const optsEl = document.getElementById('qEditOptions');
    const hintEl = document.getElementById('qEditHint');

    if (wrap) wrap.style.display = (['SC', 'DR', 'MO', 'LK'].includes(t)) ? 'block' : 'none';
    if (numWrap) numWrap.style.display = (t === 'SO') ? 'grid' : 'none';
    if (presets) presets.style.display = (['SC', 'DR', 'MO'].includes(t)) ? 'flex' : 'none';

    if (t === 'LK') {
        if (lbl) lbl.innerHTML = 'Nhãn Thang Điểm Likert 1–5 (<code>mã=nhãn</code>)';
        if (optsEl && !optsEl.value.trim()) {
            optsEl.value = '1=Rất kém\n2=Kém\n3=Trung bình\n4=Tốt\n5=Rất tốt';
        }
    } else {
        if (lbl) lbl.innerHTML = 'Danh Sách Đáp Án Mã Hóa (<code>mã=nhãn</code>, mỗi dòng 1 phương án)';
    }

    if (hintEl) {
        if (t === 'TX') hintEl.placeholder = 'VD: Ghi chú chi tiết câu trả lời tự do...';
        else if (t === 'DT') hintEl.placeholder = 'VD: Định dạng ngày DD/MM/YYYY';
        else if (t === 'SO') hintEl.placeholder = 'VD: Nhập số dương, làm tròn 2 chữ số';
        else hintEl.placeholder = 'Ghi chú thêm cho điều tra viên (nếu có)';
    }
}

function openAddQuestionForm() {
    const toolCode = document.getElementById('adminQuestionToolSelect')?.value || currentTool || 'P1';
    const existing = allQuestionsData[toolCode]?.questions || [];
    let nextIdx = existing.length + 1;
    let suggestedCode = `Q${String(nextIdx).padStart(2, '0')}`;
    const used = new Set(existing.map(q => q.code));
    while (used.has(suggestedCode)) {
        nextIdx += 1;
        suggestedCode = `Q${String(nextIdx).padStart(2, '0')}`;
    }

    document.getElementById('questionEditorTitle').textContent = `THÊM CÂU HỎI MỚI (${toolCode})`;
    document.getElementById('qEditOrigCode').value = '';
    document.getElementById('qEditCode').value = suggestedCode;
    document.getElementById('qEditSection').value = existing[existing.length - 1]?.section || 'Thông tin chung';
    document.getElementById('qEditType').value = 'DR';
    document.getElementById('qEditText').value = '';
    document.getElementById('qEditOptions').value = '';
    document.getElementById('qEditNumUnit').value = '';
    document.getElementById('qEditNumMin').value = '';
    document.getElementById('qEditNumMax').value = '';
    document.getElementById('qEditHint').value = '';
    document.getElementById('qEditCondition').value = '';
    onQuestionTypeChange();
    document.getElementById('questionEditorBox').style.display = 'block';
    document.getElementById('qEditText').focus();
}

function openEditQuestionForm(code) {
    const toolCode = document.getElementById('adminQuestionToolSelect')?.value || currentTool || 'P1';
    const q = (allQuestionsData[toolCode]?.questions || []).find(item => item.code === code);
    if (!q) return;

    document.getElementById('questionEditorTitle').textContent = `CHỈNH SỬA CÂU HỎI [${code}]`;
    document.getElementById('qEditOrigCode').value = q.code;
    document.getElementById('qEditCode').value = q.code || '';
    document.getElementById('qEditSection').value = q.section || '';

    const rawT = String(q.type || 'TX').toUpperCase();
    let mappedT = 'TX';
    if (rawT.includes('DR') || rawT.includes('SELECT')) mappedT = 'DR';
    else if (rawT.includes('MO') || rawT.includes('CB')) mappedT = 'MO';
    else if (rawT.includes('SC') || rawT.includes('MC')) mappedT = 'SC';
    else if (rawT.includes('SO') || rawT.includes('NUM')) mappedT = 'SO';
    else if (rawT.includes('LK')) mappedT = 'LK';
    else if (rawT.includes('DT') || rawT.includes('DATE')) mappedT = 'DT';
    document.getElementById('qEditType').value = mappedT;

    document.getElementById('qEditText').value = q.text || '';
    const optsLines = (q.options || []).map(o => `${o.value}=${o.label}`).join('\n');
    document.getElementById('qEditOptions').value = optsLines;
    document.getElementById('qEditNumUnit').value = q.unit || '';
    document.getElementById('qEditNumMin').value = q.min !== undefined ? q.min : '';
    document.getElementById('qEditNumMax').value = q.max !== undefined ? q.max : '';
    document.getElementById('qEditHint').value = (!q.options?.length ? (q.options_raw || '') : '');
    document.getElementById('qEditCondition').value = q.condition || '';
    onQuestionTypeChange();
    document.getElementById('questionEditorBox').style.display = 'block';
}

function closeQuestionEditorForm() {
    const box = document.getElementById('questionEditorBox');
    if (box) box.style.display = 'none';
}

function parseOptionsTextarea(rawText) {
    const lines = String(rawText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const opts = [];
    lines.forEach((line, idx) => {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
            opts.push({
                value: line.slice(0, eqIdx).trim(),
                label: line.slice(eqIdx + 1).trim()
            });
        } else {
            opts.push({
                value: String(idx + 1),
                label: line
            });
        }
    });
    return opts;
}

async function saveAdminQuestion(e) {
    e.preventDefault();
    const toolCode = document.getElementById('adminQuestionToolSelect')?.value || currentTool || 'P1';
    const origCode = document.getElementById('qEditOrigCode').value.trim();
    const code = document.getElementById('qEditCode').value.trim();
    const section = document.getElementById('qEditSection').value.trim() || 'Thông tin chung';
    const qType = document.getElementById('qEditType').value;
    const text = document.getElementById('qEditText').value.trim();
    const hint = document.getElementById('qEditHint').value.trim();
    const condition = document.getElementById('qEditCondition').value.trim();

    const needsOpts = ['SC', 'DR', 'MO', 'LK'].includes(qType);
    const options = needsOpts ? parseOptionsTextarea(document.getElementById('qEditOptions').value) : [];
    const numUnit = (document.getElementById('qEditNumUnit')?.value || '').trim();
    const numMin = (document.getElementById('qEditNumMin')?.value || '').trim();
    const numMax = (document.getElementById('qEditNumMax')?.value || '').trim();
    const options_raw = needsOpts
        ? options.map(o => `${o.value}=${o.label}`).join('; ')
        : (qType === 'SO' && numUnit ? `Đơn vị: ${numUnit}${hint ? ' — ' + hint : ''}` : hint);

    if (['SC', 'DR', 'MO'].includes(qType) && options.length === 0) {
        alert('Vui lòng nhập ít nhất 1 phương án đáp án cho câu hỏi lựa chọn!');
        return;
    }

    try {
        const res = await fetch(apiUrl('/api/admin/questions'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                action: 'upsert',
                tool_code: toolCode,
                orig_code: origCode,
                question: {
                    code,
                    section,
                    type: qType,
                    text,
                    options,
                    options_raw,
                    unit: qType === 'SO' ? numUnit : '',
                    min: qType === 'SO' ? numMin : '',
                    max: qType === 'SO' ? numMax : '',
                    condition
                }
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (data.all_questions) allQuestionsData = data.all_questions;
            alert(data.message);
            closeQuestionEditorForm();
            loadAdminQuestionsTable();
            if (currentTool === toolCode) selectTool(currentTool);
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể lưu câu hỏi'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ khi lưu câu hỏi.');
    }
}

async function deleteAdminQuestion(code) {
    const toolCode = document.getElementById('adminQuestionToolSelect')?.value || currentTool || 'P1';
    if (!confirm(`Bạn có chắc chắn muốn XÓA câu hỏi [${code}] khỏi công cụ ${toolCode}?`)) return;
    try {
        const res = await fetch(apiUrl('/api/admin/questions'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                action: 'delete',
                tool_code: toolCode,
                code
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (data.all_questions) allQuestionsData = data.all_questions;
            alert(data.message);
            loadAdminQuestionsTable();
            if (currentTool === toolCode) selectTool(currentTool);
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể xóa câu hỏi'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ khi xóa câu hỏi.');
    }
}

async function loadTrashList() {
    const sBody = document.getElementById('trashSurveysTbody');
    const uBody = document.getElementById('trashUsersTbody');
    if (!sBody || !uBody) return;
    try {
        const res = await fetch(apiUrl('/api/admin/trash'), {
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = escapeHtml(err.error || 'Không tải được dữ liệu thùng rác.');
            sBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:10px;">${msg}</td></tr>`;
            uBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:10px;">${msg}</td></tr>`;
            return;
        }
        const data = await res.json();
        const surveys = data.deleted_surveys || [];
        const users = data.deleted_users || [];

        sBody.innerHTML = surveys.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có phiếu nào bị xóa.</td></tr>'
            : surveys.map(s => `
                <tr>
                    <td style="font-family:monospace;font-weight:700;">${escapeHtml(s.survey_code)}</td>
                    <td>${escapeHtml(s.tool_code)}</td>
                    <td>${escapeHtml(s.respondent_name || '—')}</td>
                    <td style="font-size:0.74rem;">${escapeHtml(s.deleted_at || '')}</td>
                    <td style="text-align:center;">
                        <button type="button" onclick="restoreSurveyFromTrash(${s.archive_id}, '${escapeQuotes(s.survey_code)}')" style="background:#15803d;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                            <i class="fa-solid fa-rotate-left"></i> Khôi phục
                        </button>
                    </td>
                </tr>
            `).join('');

        uBody.innerHTML = users.length === 0
            ? '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có nhân sự nào bị xóa.</td></tr>'
            : users.map(u => `
                <tr>
                    <td style="font-family:monospace;font-weight:700;">${escapeHtml(u.surveyor_id)}</td>
                    <td>${escapeHtml(u.full_name)}</td>
                    <td>${escapeHtml(u.commune_assigned || '—')}</td>
                    <td style="font-size:0.74rem;">${escapeHtml(u.deleted_at || '')}</td>
                    <td style="text-align:center;">
                        <button type="button" onclick="restoreUserFromTrash(${u.archive_id}, '${escapeQuotes(u.surveyor_id)}')" style="background:#15803d;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                            <i class="fa-solid fa-rotate-left"></i> Khôi phục
                        </button>
                    </td>
                </tr>
            `).join('');
    } catch (e) {
        sBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:10px;">Lỗi kết nối máy chủ.</td></tr>';
    }
}

async function restoreSurveyFromTrash(archiveId, code) {
    if (!confirm(`Khôi phục lại phiếu [${code}] vào danh sách chính?`)) return;
    try {
        const res = await fetch(apiUrl(`/api/admin/restore/survey/${archiveId}`), {
            method: 'POST',
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(data.message);
            await loadTrashList();
            await loadSurveysList();
            await refreshDashboardData();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể khôi phục'));
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
    }
}

async function restoreUserFromTrash(archiveId, sid) {
    if (!confirm(`Khôi phục lại tài khoản nhân sự [${sid}]?`)) return;
    try {
        const res = await fetch(apiUrl(`/api/admin/restore/user/${archiveId}`), {
            method: 'POST',
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(data.message);
            await loadTrashList();
            await loadStaffList();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể khôi phục'));
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
    }
}

function downloadDatabaseBackup() {
    const key = encodeURIComponent(getAdminKey());
    window.open(apiUrl(`/api/admin/backup-download?key=${key}`), '_blank');
}

async function loadAdminSettings() {
    try {
        const res = await fetch(apiUrl('/api/admin/settings'), {
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        if (!res.ok) return;
        const data = await res.json();
        const pAdmin = document.getElementById('cfgAdminPass');
        const pView = document.getElementById('cfgViewerPass');
        const aName = document.getElementById('cfgAdminName');
        if (pAdmin) pAdmin.value = data.pass_admin || '';
        if (pView) pView.value = data.pass_viewer || '';
        if (aName) aName.value = data.admin_name || 'Quản Trị Viên (Admin)';
    } catch (err) {
        console.error('Lỗi tải cấu hình bảo mật:', err);
    }
}

async function handleSaveAdminSettings(e) {
    e.preventDefault();
    const pAdmin = document.getElementById('cfgAdminPass').value.trim();
    const pView = document.getElementById('cfgViewerPass').value.trim();
    const aName = document.getElementById('cfgAdminName').value.trim();

    if (!pAdmin || !pView) {
        alert('Vui lòng không để trống mật khẩu Admin hoặc mật khẩu Chỉ xem!');
        return;
    }

    try {
        const res = await fetch(apiUrl('/api/admin/settings'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                pass_admin: pAdmin,
                pass_viewer: pView,
                admin_name: aName
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            localStorage.setItem('dakman_admin_key', pAdmin);
            if (currentUser && currentUser.role === 'admin') {
                currentUser.key = pAdmin;
                currentUser.full_name = aName || 'Quản Trị Viên (Admin)';
                localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
                updateUserDisplay();
            }
            alert('ĐÃ CẬP NHẬT THÀNH CÔNG!\n- Mật khẩu Quản trị viên mới đã được lưu.\n- Mật khẩu Khách xem mới đã được lưu.\n- Tên Quản trị viên hiển thị đã được cập nhật.');
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể lưu cài đặt'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ VPS khi lưu cài đặt.');
    }
}

async function loadStaffList() {
    const tbody = document.getElementById('staffListTbody');
    if (!tbody) return;
    try {
        const res = await fetch(apiUrl('/api/admin/users'), {
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #dc2626; padding: 14px;">${escapeHtml(errData.error || 'Không có quyền hoặc lỗi tải danh sách nhân viên.')}</td></tr>`;
            return;
        }
        const users = await res.json();

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--slate-500); padding: 16px;">Chưa có điều tra viên nào trong danh sách.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map((u, idx) => `
            <tr>
                <td style="text-align: center; color: var(--slate-500);">${idx + 1}</td>
                <td style="font-family: monospace; font-weight: 700; color: var(--primary);">${escapeHtml(u.surveyor_id)}</td>
                <td style="font-weight: 600;">${escapeHtml(u.full_name)}</td>
                <td>${escapeHtml(u.commune_assigned || 'Ea Kiết')}</td>
                <td style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: #dc2626;">••••••••</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button type="button" class="action-btn" title="Gửi tài khoản qua Zalo" 
                            onclick="copyZaloText('${escapeQuotes(u.surveyor_id)}', '${escapeQuotes(u.full_name)}', '${escapeQuotes(u.commune_assigned || 'Ea Kiết')}', '${escapeQuotes(u.password || '')}')"
                            style="background: #0284c7; color: #ffffff; padding: 3px 7px; border-radius: 3px; font-size: 0.75rem;">
                        <i class="fa-solid fa-share-nodes"></i> Zalo
                    </button>
                    <button type="button" class="action-btn" title="Chỉnh sửa hoặc đổi mật khẩu" 
                            onclick="openEditStaffModal('${escapeQuotes(u.surveyor_id)}', '${escapeQuotes(u.full_name)}', '${escapeQuotes(u.phone || '')}', '${escapeQuotes(u.commune_assigned || 'Ea Kiết')}', '${escapeQuotes(u.password || '')}')"
                            style="background: #eab308; color: #713f12; padding: 3px 7px; border-radius: 3px; font-size: 0.75rem; margin: 0 2px;">
                        <i class="fa-solid fa-key"></i> Đổi MK
                    </button>
                    <button type="button" class="action-btn" title="Xóa điều tra viên" 
                            onclick="deleteStaffConfirm('${escapeQuotes(u.surveyor_id)}', '${escapeQuotes(u.full_name)}')"
                            style="background: #ef4444; color: #ffffff; padding: 3px 7px; border-radius: 3px; font-size: 0.75rem;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Lỗi tải danh sách nhân viên:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #dc2626; padding: 14px;">Lỗi tải danh sách nhân viên.</td></tr>';
    }
}

function copyZaloText(id, name, commune, pass, isNew = false) {
    const appLink = `${window.location.origin}${window.location.pathname}`;
    const text = `Kính gửi: ${name}\nBan Quản lý Dự án Dakman Cư M'gar (Đơn vị tư vấn Tân Cao Nguyên) gửi bạn thông tin tài khoản khảo sát:\n- Link hệ thống: ${appLink}\n- Họ và Tên: ${name}\n- Mã Nhân Viên (bắt buộc đúng từng ký tự): ${id}\n- Địa bàn phụ trách: ${commune}\n- Mật khẩu truy cập cá nhân: ${pass}\n\nLưu ý: Mật khẩu là bảo mật cá nhân, bạn không chia sẻ tài khoản cho người khác. Chúc bạn hoàn thành tốt đợt điều tra!`;
    navigator.clipboard.writeText(text).then(() => {
        alert(`ĐÃ SAO CHÉP THÔNG TIN TÀI KHOẢN [${name} - ${id}] VÀO CLIPBOARD!\n\nBạn chỉ cần mở Zalo và dán (Ctrl+V) gửi cho bạn ấy.`);
    }).catch(err => {
        prompt('Sao chép nội dung bên dưới để gửi Zalo:', text);
    });
}

async function handleCreateStaffSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('newStaffId').value.trim();
    const name = document.getElementById('newStaffName').value.trim();
    const phone = document.getElementById('newStaffPhone').value.trim();
    const commune = document.getElementById('newStaffCommune').value;
    const pwd = document.getElementById('newStaffPassword').value.trim();

    if (!id || !name || !pwd) {
        alert('Vui lòng điền đầy đủ Mã nhân viên, Họ tên và Mật khẩu!');
        return;
    }

    try {
        const res = await fetch(apiUrl('/api/admin/users'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                surveyor_id: id,
                full_name: name,
                phone: phone,
                commune_assigned: commune,
                password: pwd
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            copyZaloText(id, name, commune, pwd, true);
            document.getElementById('newStaffName').value = '';
            document.getElementById('newStaffPhone').value = '';
            generateStaffId();
            generateRandomStaffPass();
            await loadStaffList();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể tạo nhân viên'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ VPS.');
    }
}

function openEditStaffModal(sid, name, phone, commune, pwd) {
    document.getElementById('editStaffOrigId').value = sid;
    document.getElementById('editStaffId').value = sid;
    document.getElementById('editStaffName').value = name;
    document.getElementById('editStaffPhone').value = phone || '';
    document.getElementById('editStaffCommune').value = commune || 'Ea Kiết';
    document.getElementById('editStaffPassword').value = pwd || '';

    const modal = document.getElementById('staffEditModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

function hideEditStaffModal() {
    const modal = document.getElementById('staffEditModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function handleEditStaffSubmit(e) {
    e.preventDefault();
    const origId = document.getElementById('editStaffOrigId').value;
    const name = document.getElementById('editStaffName').value.trim();
    const phone = document.getElementById('editStaffPhone').value.trim();
    const commune = document.getElementById('editStaffCommune').value;
    const pwd = document.getElementById('editStaffPassword').value.trim();

    try {
        const res = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(origId)}`), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                full_name: name,
                phone: phone,
                commune_assigned: commune,
                password: pwd
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            copyZaloText(origId, name, commune, pwd, false);
            hideEditStaffModal();
            await loadStaffList();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể cập nhật'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ VPS.');
    }
}

async function deleteStaffConfirm(sid, name) {
    if (!confirm(`Bạn có chắc chắn muốn xóa nhân viên [${name} - ${sid}] khỏi hệ thống?`)) {
        return;
    }
    try {
        const res = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(sid)}`), {
            method: 'DELETE',
            headers: {
                'X-Admin-Key': getAdminKey()
            }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(`Đã xóa nhân viên ${name} (${sid}) thành công.`);
            await loadStaffList();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể xóa'));
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ VPS.');
    }
}
