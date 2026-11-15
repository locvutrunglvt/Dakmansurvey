/**
 * Hệ Thống Khảo Sát & Phỏng Vấn Hiện Trường — Dakman Cư M'gar (2021–2026)
 * Đơn vị tư vấn & thực hiện: Công ty TNHH Dịch vụ và Tư vấn Tân Cao Nguyên
 * Tác giả hệ thống: Công ty TNHH Dịch vụ và Tư vấn Tân Cao Nguyên
 * BẢO MẬT TỐI ĐA: CHỐNG XÂM NHẬP & CHỐNG TRÍCH XUẤT MÃ NGUỒN
 */

const API_BASE = (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:')
    ? 'https://dakmansurvey.coffeedata.it.com'
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
let currentDraftPhotoPath = '';
let editingSurveyId = null;
let deferredInstallPrompt = null;
let mobilePwaDismissedInView = false;

// Đăng ký Service Worker cho chế độ Cài App (PWA) & tự động cập nhật khi có bản SW mới thay thế bản cũ
if ('serviceWorker' in navigator) {
    const hadSwController = Boolean(navigator.serviceWorker.controller);
    let _swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadSwController || _swRefreshing) return;
        const surveyViewActive = document.getElementById('view-survey')?.classList.contains('active');
        if (!surveyViewActive) {
            _swRefreshing = true;
            window.location.reload();
        }
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
            try { reg.update(); } catch (_) {}
        }).catch(() => {});
    });
}

function showInstantActionToast(message, isError = false) {
    const id = 'instantActionToastBox';
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:10060;max-width:92vw;padding:10px 16px;border-radius:8px;font-size:0.86rem;font-weight:700;box-shadow:0 10px 25px rgba(0,0,0,0.28);display:flex;align-items:center;gap:8px;transition:opacity 0.25s ease;';
        document.body.appendChild(el);
    }
    el.style.background = isError ? '#991b1b' : '#14532d';
    el.style.color = '#ffffff';
    el.style.opacity = '1';
    el.style.display = 'flex';
    el.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> <span>${escapeHtml(message)}</span>`;
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, 260);
    }, 3200);
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btnInstallPwa');
    if (btn) btn.style.display = 'inline-block';
    const actionBtn = document.getElementById('btnMobilePwaAction');
    if (actionBtn) actionBtn.innerHTML = '<i class="fa-solid fa-download"></i> Cài App Ngay (1 Chạm)';
    initMobilePwaInstallPrompt();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('btnInstallPwa');
    if (btn) btn.style.display = 'none';
    const banner = document.getElementById('mobilePwaPromptBanner');
    if (banner) banner.style.display = 'none';
});

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getMobileBrowserInstallContext() {
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const isInAppBrowser = /zalo|fbav|fban|messenger|line|micromessenger/i.test(ua);
    const isChromeIos = isIos && /crios/i.test(ua);
    const isSafariIos = isIos && !isChromeIos && /safari/i.test(ua);
    const isMobileDevice = isIos || isAndroid || /mobile|tablet/i.test(ua) || (window.innerWidth <= 900 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
    return { isIos, isAndroid, isInAppBrowser, isChromeIos, isSafariIos, isMobileDevice };
}

function initMobilePwaInstallPrompt() {
    const banner = document.getElementById('mobilePwaPromptBanner');
    const textEl = document.getElementById('mobilePwaPromptText');
    const btnEl = document.getElementById('btnMobilePwaAction');
    const navBtn = document.getElementById('btnInstallPwa');

    if (isRunningStandalone()) {
        if (banner) banner.style.display = 'none';
        if (navBtn) navBtn.style.display = 'none';
        return;
    }

    const ctx = getMobileBrowserInstallContext();
    if (!ctx.isMobileDevice || mobilePwaDismissedInView) {
        if (banner) banner.style.display = 'none';
        return;
    }

    if (textEl) {
        if (ctx.isInAppBrowser) {
            textEl.innerHTML = 'Bạn đang mở trong trình duyệt <strong>Zalo/Messenger</strong>. Bấm dấu <strong>⋮</strong> (góc trên phải) &rarr; chọn <strong>Mở bằng Safari / Chrome</strong> rồi cài App để giữ đăng nhập &amp; lưu nháp tốt nhất.';
            if (btnEl) btnEl.innerHTML = '<i class="fa-solid fa-compass"></i> Xem Hướng Dẫn';
        } else if (ctx.isSafariIos) {
            textEl.innerHTML = '<strong>iPhone (Safari):</strong> Bấm <strong>Chia sẻ (⬆️)</strong> ở thanh dưới &rarr; chọn <strong>"Thêm vào MH chính"</strong> &rarr; bấm <strong>"Thêm"</strong>.';
            if (btnEl) btnEl.innerHTML = '<i class="fa-solid fa-share-from-square"></i> Hướng Dẫn iPhone';
        } else if (ctx.isChromeIos) {
            textEl.innerHTML = '<strong>iPhone (Chrome):</strong> Bấm <strong>Chia sẻ (⬆️)</strong> ở góc trên phải thanh địa chỉ &rarr; chọn <strong>"Thêm vào Màn hình chính"</strong> (hoặc mở bằng Safari).';
            if (btnEl) btnEl.innerHTML = '<i class="fa-solid fa-share-from-square"></i> Hướng Dẫn iOS Chrome';
        } else if (deferredInstallPrompt) {
            textEl.innerHTML = '<strong>Android (Chrome):</strong> Bấm nút bên phải để cài trực tiếp App vào màn hình chính, chạy mượt và lưu ảnh/GPS ngoài rẫy.';
            if (btnEl) btnEl.innerHTML = '<i class="fa-solid fa-download"></i> Cài App Ngay (1 Chạm)';
        } else {
            textEl.innerHTML = '<strong>Android (Chrome):</strong> Bấm Menu <strong>⋮</strong> (góc trên phải) &rarr; chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào màn hình chính"</strong>.';
            if (btnEl) btnEl.innerHTML = '<i class="fa-solid fa-download"></i> Hướng Dẫn Cài App';
        }
    }
    if (banner) banner.style.display = 'block';
    if (navBtn) navBtn.style.display = 'inline-block';
}

function dismissMobilePwaBannerForNow() {
    mobilePwaDismissedInView = true;
    const banner = document.getElementById('mobilePwaPromptBanner');
    if (banner) banner.style.display = 'none';
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
            const banner = document.getElementById('mobilePwaPromptBanner');
            if (banner) banner.style.display = 'none';
        }
        return;
    }
    const ctx = getMobileBrowserInstallContext();
    if (ctx.isInAppBrowser) {
        alert(
            'BẠN ĐANG MỞ TỪ ZALO / MESSENGER:\n' +
            '1. Bấm nút Menu (⋮ hoặc ⋯) ở góc trên/dưới trình duyệt.\n' +
            '2. Chọn "Mở bằng trình duyệt mặc định" (Chrome trên Android hoặc Safari trên iPhone).\n' +
            '3. Sau đó bấm Cài App / Thêm vào Màn hình chính để sử dụng đầy đủ GPS, Camera và Lưu nháp.'
        );
    } else if (ctx.isChromeIos) {
        alert(
            'HƯỚNG DẪN CÀI APP TRÊN IPHONE (CHROME):\n' +
            '1. Bấm biểu tượng Chia sẻ (ô vuông có mũi tên lên ⬆️) ở góc trên phải thanh địa chỉ Chrome.\n' +
            '2. Cuộn xuống chọn "Thêm vào Màn hình chính" (Add to Home Screen).\n' +
            '3. Bấm "Thêm". Hoặc mở link bằng trình duyệt Safari nếu không thấy mục này.'
        );
    } else if (ctx.isIos) {
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

const QUESTIONS_CACHE_KEY = 'dakman_questions_cache_v1';

function getInitialQuestionsFallback() {
    if (window.__DEFAULT_QUESTIONS_DATA__ && typeof window.__DEFAULT_QUESTIONS_DATA__ === 'object' && Object.keys(window.__DEFAULT_QUESTIONS_DATA__).length > 0) {
        return window.__DEFAULT_QUESTIONS_DATA__;
    }
    try {
        const cached = localStorage.getItem(QUESTIONS_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                return parsed;
            }
        }
    } catch (_) {}
    return {};
}

let allQuestionsData = getInitialQuestionsFallback();
let questionsSyncedFromServer = false;
let allScheduleData = [];
let currentTool = 'P1';
let currentSection = null;
let currentDraftAnswers = {};
let currentUser = null;

const ACTIVE_SCREEN_KEY = 'dakman_active_screen_v1';

function saveActiveScreenState(viewId) {
    try {
        if (viewId === 'survey') {
            localStorage.setItem(ACTIVE_SCREEN_KEY, JSON.stringify({
                view: 'survey',
                tool: currentTool || 'P1',
                uid: String(currentUser?.surveyor_id || '').trim().toUpperCase(),
                ts: Date.now()
            }));
        } else {
            localStorage.removeItem(ACTIVE_SCREEN_KEY);
        }
    } catch (_) {}
}

function clearActiveScreenState() {
    try { localStorage.removeItem(ACTIVE_SCREEN_KEY); } catch (_) {}
}

function getResumableSurveyScreen() {
    try {
        const raw = localStorage.getItem(ACTIVE_SCREEN_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.view !== 'survey') return null;
        const ageMs = Date.now() - Number(parsed.ts || 0);
        if (ageMs < 0 || ageMs > 12 * 3600 * 1000) return null;
        const myUid = String(currentUser?.surveyor_id || '').trim().toUpperCase();
        if (parsed.uid && myUid && parsed.uid !== myUid) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function hasActiveInterviewWork() {
    if (currentMainView !== 'survey') return false;
    const headName = (document.getElementById('headNameInput')?.value || '').trim();
    const respName = (document.getElementById('respondentNameInput')?.value || '').trim();
    const hasPhoto = Boolean((currentHouseholdPhotoData && currentHouseholdPhotoData.trim()) || currentDraftPhotoPath);
    const hasAnswers = Object.keys(currentDraftAnswers || {}).some(k => !k.startsWith('_') && String(currentDraftAnswers[k] || '').trim() !== '');
    return Boolean(hasPhoto || hasAnswers || headName || respName || editingSurveyId);
}

function closeTopActiveModal() {
    const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
    for (let i = activeModals.length - 1; i >= 0; i--) {
        const m = activeModals[i];
        if (m.id === 'userLoginModal' && (!currentUser || !currentUser.is_authenticated)) {
            continue;
        }
        m.classList.remove('active');
        m.style.display = 'none';
        return true;
    }
    return false;
}

// Khởi chạy hệ thống
document.addEventListener('DOMContentLoaded', async () => {
    initMobilePwaInstallPrompt();
    document.querySelectorAll('a[href="/api/export/excel"]').forEach(a => {
        a.href = apiUrl('/api/export/excel');
    });
    initUserSession();
    try {
        window.history.replaceState({ dakmanView: 'menu' }, '');
    } catch (_) {}

    await loadQuestions();
    const resumable = (currentUser && currentUser.is_authenticated) ? getResumableSurveyScreen() : null;
    if (resumable && resumable.tool) {
        await selectTool(resumable.tool);
        switchMainView('survey', '', false);
        const stEl = document.getElementById('floatingDraftStatusText');
        if (stEl) {
            stEl.textContent = 'Đã tự động khôi phục phiên phỏng vấn đang dở của bạn.';
        }
    } else {
        await selectTool('P1');
        switchMainView('menu', '', true);
    }

    Promise.allSettled([
        loadSampleHouseholds(),
        loadSchedule(),
        syncOfflineQueue(true),
        syncPendingDrafts(true),
        loadHouseholdLocks(),
        refreshDraftBadgeCount(true),
        refreshDashboardData(),
        loadSurveysList()
    ]).then(() => {
        refreshDraftBadgeCount(false);
        updateMenuSummaryBadges();
        if (currentUser && currentUser.is_authenticated && currentUser.role !== 'viewer') {
            startTeamHeartbeat();
            sendTeamLocationPing(null, null, null, 'Mở ứng dụng');
        }
    });

    // Lưu nhanh khi chuyển app sang Camera/Zalo hoặc tắt màn hình
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && currentMainView === 'survey') {
            saveDraftLocal(false);
            saveActiveScreenState('survey');
        }
    });
    window.addEventListener('pagehide', () => {
        if (currentMainView === 'survey') {
            saveDraftLocal(false);
            saveActiveScreenState('survey');
        }
    });
    window.addEventListener('beforeunload', (e) => {
        if (currentMainView === 'survey') {
            saveDraftLocal(false);
            saveActiveScreenState('survey');
            if (hasActiveInterviewWork()) {
                e.preventDefault();
                e.returnValue = '';
            }
        }
    });
    // Chặn nút Back trên điện thoại Android/iOS làm thoát mất app khi đang phỏng vấn
    window.addEventListener('popstate', () => {
        if (closeTopActiveModal()) {
            try { window.history.pushState({ dakmanView: currentMainView }, ''); } catch (_) {}
            return;
        }
        if (currentMainView === 'survey') {
            saveDraftLocal(false);
            if (hasActiveInterviewWork()) {
                const leave = confirm(
                    'Bạn đang phỏng vấn dở!\nDữ liệu hiện tại đã được tự động lưu tạm.\n\n• Bấm [OK] để quay ra Menu.\n• Bấm [Hủy] để ở lại tiếp tục phỏng vấn.'
                );
                if (!leave) {
                    try { window.history.pushState({ dakmanView: 'survey' }, ''); } catch (_) {}
                    return;
                }
            }
            switchMainView('menu', '', true);
            return;
        }
        if (currentMainView !== 'menu') {
            switchMainView('menu', '', true);
        }
    });

    // Kiểm tra kết nối mạng & tự động đẩy hàng đợi offline khi có mạng lại
    window.addEventListener('online', () => {
        updateNetworkStatus();
        syncOfflineQueue(true);
        syncPendingDrafts(true);
        loadHouseholdLocks();
    });
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
    document.querySelectorAll('#userLoginModal .tier-tab-btn, #userLoginModal .qgis-tab-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.getElementById(`btnTier${capitalize(tier)}`);
    if (targetBtn) targetBtn.classList.add('active');
    document.getElementById('loginSelectedRole').value = tier;

    const staffFields = document.getElementById('editorStaffFields');
    const lblPass = document.getElementById('lblPasswordTier');
    const passInput = document.getElementById('modalUserPassword');
    const viewerNotice = document.getElementById('viewerQuickNotice');
    const submitBtn = document.getElementById('btnLoginSubmit');
    const errBox = document.getElementById('loginErrorMsg');
    if (errBox) errBox.style.display = 'none';

    if (tier === 'admin') {
        staffFields.style.display = 'none';
        lblPass.innerHTML = 'Mật Khẩu Quản Trị Viên <span class="req">*</span>';
        passInput.placeholder = 'Nhập mật khẩu quản trị viên...';
        passInput.required = true;
        if (viewerNotice) viewerNotice.style.display = 'none';
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';
    } else if (tier === 'viewer') {
        staffFields.style.display = 'none';
        lblPass.innerHTML = 'Mật Khẩu Đối Tác (Không bắt buộc — để trống để vào ngay)';
        passInput.placeholder = 'Có thể để trống và bấm Vào Xem Ngay...';
        passInput.required = false;
        if (viewerNotice) viewerNotice.style.display = 'block';
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Vào Xem Ngay (Đối tác)';
    } else {
        staffFields.style.display = 'block';
        lblPass.innerHTML = 'Mật Khẩu Điều Tra Viên <span class="req">*</span>';
        passInput.placeholder = 'Nhập mật khẩu điều tra viên...';
        passInput.required = true;
        if (viewerNotice) viewerNotice.style.display = 'none';
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';
        if (!document.getElementById('modalUserId').value) {
            document.getElementById('modalUserId').value = 'TCN02';
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
        document.getElementById('modalUserId').value = currentUser.surveyor_id || 'TCN01';
        document.getElementById('modalUserName').value = currentUser.full_name || '';
        document.getElementById('modalUserDate').value = currentUser.survey_date || getVnTodayIso();
        document.getElementById('modalUserCommune').value = currentUser.commune || 'Ea Kiết';
    } else {
        document.getElementById('modalUserDate').value = getVnTodayIso();
        if (!document.getElementById('modalUserId').value) {
            document.getElementById('modalUserId').value = 'TCN01';
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
    const userDate = document.getElementById('modalUserDate').value || getVnTodayIso();
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
            if (currentUser.role === 'admin') {
                localStorage.setItem('dakman_admin_key', password);
            } else {
                localStorage.removeItem('dakman_admin_key');
            }
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
            if (currentUser.role !== 'admin1') {
                loadSurveysList(); // Làm mới danh sách theo quyền mới
            }
            if (typeof refreshDashboardData === 'function') {
                refreshDashboardData();
            }
            if (typeof refreshFieldPhotosBadgeCount === 'function') {
                refreshFieldPhotosBadgeCount();
            }
            if (typeof sendTeamLocationPing === 'function' && currentUser.role === 'editor') {
                sendTeamLocationPing(null, null, null, 'Đăng nhập hệ thống');
                startTeamHeartbeat();
            }
        } else {
            errBox.style.display = 'block';
            errBox.textContent = data.error || 'Đăng nhập không thành công. Vui lòng kiểm tra lại mật khẩu.';
        }
    } catch (err) {
        // Hỗ trợ kiểm tra offline theo mật khẩu chuẩn
        if (role === 'admin' && (password === 'AAdmin123' || password === '123456a')) {
            const isAdmin1 = (password === '123456a');
            currentUser = {
                role: isAdmin1 ? 'admin1' : 'admin',
                surveyor_id: isAdmin1 ? 'TCN21' : 'ADMIN',
                full_name: isAdmin1 ? 'Admin1' : 'Quản Trị Viên (Admin)',
                survey_date: userDate,
                commune: 'Toàn vùng',
                key: password,
                is_authenticated: true
            };
            if (isAdmin1) {
                localStorage.removeItem('dakman_admin_key');
            } else {
                localStorage.setItem('dakman_admin_key', password);
            }
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
        } else if (role === 'viewer' && (!password || password === 'View123' || password === '123456a')) {
            localStorage.removeItem('dakman_admin_key');
            currentUser = { role: 'viewer', surveyor_id: 'VIEWER', full_name: 'Đối Tác / Giám Sát (Chỉ xem)', survey_date: userDate, commune: 'Toàn vùng', key: password, is_authenticated: true };
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
        } else if (role === 'editor' && userId.toUpperCase() === 'TCN21' && password === '123456a') {
            localStorage.removeItem('dakman_admin_key');
            currentUser = { role: 'admin1', surveyor_id: 'TCN21', full_name: 'Admin1', survey_date: userDate, commune: 'Toàn vùng', key: password, is_authenticated: true };
            localStorage.setItem('dakman_surveyor_session', JSON.stringify(currentUser));
            hideLoginModal();
            updateUserDisplay();
        } else if (role === 'editor' && (password === 'Edit123a#' || password)) {
            localStorage.removeItem('dakman_admin_key');
            currentUser = { role: 'editor', surveyor_id: userId || 'TCN02', full_name: userName || 'Điều tra viên', survey_date: userDate, commune: userCommune, key: password, is_authenticated: true };
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
    const isAdmin = (role === 'admin');
    const isAdmin1 = (role === 'admin1');
    const isViewer = (role === 'viewer');
    const isReadOnly = (isViewer || isAdmin1);

    const btnAdminStaff = document.getElementById('btnAdminStaffManage');
    if (btnAdminStaff) {
        btnAdminStaff.style.display = isAdmin ? 'inline-block' : 'none';
    }
    const adminLiveBoard = document.getElementById('adminMenuLiveBoard');
    const staffCard = document.getElementById('adminMenuStaffCard');
    const photoGalleryCard = document.getElementById('adminMenuPhotoGalleryCard');
    if (adminLiveBoard) {
        adminLiveBoard.style.display = (isAdmin || isAdmin1) ? 'grid' : 'none';
        if (staffCard) staffCard.style.display = isAdmin ? 'flex' : 'none';
        if (photoGalleryCard) photoGalleryCard.style.display = isAdmin1 ? 'flex' : 'none';
        if (isAdmin1 && typeof loadAdminMenuPhotoGallery === 'function') {
            loadAdminMenuPhotoGallery(false);
        }
        if ((isAdmin || isAdmin1) && typeof refreshAdminMenuLiveBoard === 'function') {
            refreshAdminMenuLiveBoard(false);
        }
    }

    // Phân quyền Menu chính cho Admin / Admin1 / ĐTV
    const tileCreate = document.getElementById('menuTileCreate');
    const tileCreateLabel = document.getElementById('menuTileCreateLabel');
    const tileHistory = document.getElementById('menuTileHistory');
    const tileDrafts = document.getElementById('menuTileDrafts');
    const tilePhotosLabel = document.getElementById('menuTilePhotosLabel');
    const tileBlankQ = document.getElementById('menuTileBlankQuestions');
    const fpCaptureBox = document.getElementById('fpCaptureFormBox');
    const btnDraftsBar = document.getElementById('btnOpenDraftsBar');

    if (tileCreate) {
        tileCreate.style.display = isAdmin1 ? 'none' : 'flex';
        tileCreate.style.opacity = isAdmin ? '0.6' : '1';
        if (tileCreateLabel) {
            tileCreateLabel.textContent = isAdmin ? '1. Tạo phiếu (Admin không điều tra)' : '1. Tạo phiếu';
        }
    }
    if (tileHistory) tileHistory.style.display = 'flex';
    if (tileDrafts) tileDrafts.style.display = isAdmin1 ? 'none' : 'flex';
    if (btnDraftsBar) btnDraftsBar.style.display = isAdmin1 ? 'none' : '';
    if (tileBlankQ) tileBlankQ.style.display = (isAdmin1 || isAdmin) ? 'flex' : 'none';
    if (tilePhotosLabel) {
        tilePhotosLabel.textContent = isReadOnly ? '5. Thư viện ảnh hiện trường (Chỉ xem)' : '5. Chụp ảnh hiện trường';
    }
    if (fpCaptureBox) {
        fpCaptureBox.style.display = isReadOnly ? 'none' : 'block';
    }

    // Ẩn nút xuất Excel đối với tài khoản Chỉ xem & Admin1 (trừ Admin / ĐTV)
    document.querySelectorAll('a[href*="/api/export/excel"]').forEach((el) => {
        el.style.display = isReadOnly ? 'none' : '';
    });

    if (badge) {
        if (isAdmin) {
            badge.style.background = '#dc2626';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-user-shield"></i> [ADMIN] ${currentUser.full_name}`;
        } else if (isAdmin1) {
            badge.style.background = '#7c3aed';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-eye"></i> [ADMIN1 • CHỈ XEM] ${currentUser.full_name}`;
        } else if (isViewer) {
            badge.style.background = '#2563eb';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-eye"></i> [CHỈ XEM] ${currentUser.full_name}`;
        } else {
            badge.style.background = '#15803d';
            badge.style.color = '#ffffff';
            badgeName.innerHTML = `<i class="fa-solid fa-user-pen"></i> [ĐTV] ${currentUser.surveyor_id} - ${currentUser.full_name}`;
        }
    }

    // Áp dụng cơ chế khóa bảo mật nghiêm ngặt cho tài khoản Chỉ Xem (Viewer)
    if (isViewer) {
        document.body.classList.add('viewer-locked-mode');
        enableViewerDRMProtection();
    } else {
        document.body.classList.remove('viewer-locked-mode');
        disableViewerDRMProtection();
    }

    if (banner) banner.style.display = isViewer ? 'block' : 'none';

    if (btnSubmit) {
        btnSubmit.disabled = isReadOnly;
        btnSubmit.style.opacity = isReadOnly ? '0.5' : '1';
        btnSubmit.style.cursor = isReadOnly ? 'not-allowed' : 'pointer';
        btnSubmit.title = isReadOnly ? 'Tài khoản ở chế độ chỉ xem, không được nộp phiếu' : 'Gửi kết quả về máy chủ VPS';
    }
    if (btnSaveDraft) {
        btnSaveDraft.disabled = isReadOnly;
        btnSaveDraft.style.opacity = isReadOnly ? '0.5' : '1';
        btnSaveDraft.style.cursor = isReadOnly ? 'not-allowed' : 'pointer';
    }

    // Cập nhật thông tin điều tra viên trên form
    const idInput = document.getElementById('surveyorIdInput');
    const nameInput = document.getElementById('surveyorNameInput');
    const dateInput = document.getElementById('surveyDateInput');
    const communeSelect = document.getElementById('communeSelect');

    if (idInput) idInput.value = currentUser.surveyor_id || 'TCN01';
    if (nameInput) nameInput.value = currentUser.full_name || '';
    if (dateInput) dateInput.value = currentUser.survey_date || getVnTodayIso();
    if (communeSelect && currentUser.commune && currentUser.commune !== 'Toàn vùng') {
        communeSelect.value = currentUser.commune;
    }
    const menuWelcome = document.getElementById('menuWelcomeUser');
    if (menuWelcome) {
        menuWelcome.textContent = `${currentUser.full_name || currentUser.surveyor_id} (${currentUser.surveyor_id || ''})`;
    }
    autoSelectSampleFilterForUser();
    if (typeof refreshMyStaffReminderBanner === 'function') {
        refreshMyStaffReminderBanner();
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
// 2. CHUYỂN ĐỔI GIAO DIỆN CHÍNH (MENU & SUBVIEWS)
// ========================================================
let currentMainView = 'menu';

function switchMainView(viewId, subTab = '', skipHistory = false) {
    const curRole = currentUser?.role || '';
    if (curRole === 'admin1' && ['pick-tool', 'survey'].includes(viewId)) {
        alert('Tài khoản Admin1 chỉ được xem: Tổng hợp ĐTV, Tiến độ, Bản đồ nhân sự, Hệ thống bảng hỏi Blank và Thư viện ảnh hiện trường!');
        viewId = 'menu';
    } else if (curRole === 'admin' && viewId === 'pick-tool') {
        alert('Tài khoản Admin dùng để quản lý & rà soát, không tạo mới phiếu điều tra!');
        viewId = 'menu';
    }
    const prevView = currentMainView;
    const views = ['menu', 'pick-tool', 'survey', 'dashboard', 'schedule', 'history', 'field-photos', 'map', 'blank-questions'];
    views.forEach(v => {
        const pane = document.getElementById(`view-${v}`);
        const btn = document.getElementById(`btnView${capitalize(v)}`);
        if (pane) pane.style.display = 'none';
        if (btn) btn.classList.remove('active');
    });

    currentMainView = viewId;
    saveActiveScreenState(viewId);
    if (!skipHistory && viewId !== prevView) {
        try {
            if (!window.history.state || window.history.state.dakmanView !== viewId) {
                window.history.pushState({ dakmanView: viewId }, '');
            }
        } catch (_) {}
    }

    const activePane = document.getElementById(`view-${viewId}`);
    const activeBtn = document.getElementById(`btnView${capitalize(viewId)}`);
    if (activePane) activePane.style.display = 'block';
    if (activeBtn) activeBtn.classList.add('active');

    const officialFooter = document.getElementById('officialFooterBlock');
    if (officialFooter) {
        officialFooter.style.display = (viewId === 'menu' || viewId === 'pick-tool') ? 'none' : 'block';
    }
    const subTop = document.getElementById('subviewTopBar');
    const subTitle = document.getElementById('subviewTitleText');
    const btnChangeObj = document.getElementById('btnChangeObjectSub');
    const btnDeleteHdr = document.getElementById('btnDeleteActiveSurveyInHeader');
    if (subTop) {
        subTop.classList.toggle('active', viewId !== 'menu');
    }
    if (btnChangeObj) {
        btnChangeObj.style.display = (viewId === 'survey') ? 'inline-flex' : 'none';
    }
    if (btnDeleteHdr) {
        const canDeleteInHeader = (viewId === 'survey' && currentUser?.role !== 'viewer' && currentUser?.role !== 'admin1');
        btnDeleteHdr.style.display = canDeleteInHeader ? 'inline-flex' : 'none';
    }
    if (subTitle) {
        if (viewId === 'pick-tool') {
            subTitle.textContent = '1. Tạo phiếu — Chọn đối tượng';
        } else if (viewId === 'survey') {
            const toolObj = allQuestionsData[currentTool];
            subTitle.textContent = toolObj
                ? `Tạo phiếu: ${toolObj.tool_code} — ${toolObj.tool_name}`
                : `Tạo phiếu: ${currentTool}`;
        } else if (viewId === 'history') {
            subTitle.textContent = '2. Xem phiếu đã phỏng vấn';
        } else if (viewId === 'dashboard' || viewId === 'schedule') {
            subTitle.textContent = '3. Tiến độ - Kế hoạch';
        } else if (viewId === 'field-photos') {
            subTitle.textContent = (currentUser?.role === 'admin1' || currentUser?.role === 'viewer')
                ? '5. Thư viện ảnh hiện trường'
                : '5. Chụp ảnh hiện trường';
        } else if (viewId === 'map') {
            subTitle.textContent = '6. Bản đồ';
        } else if (viewId === 'blank-questions') {
            subTitle.textContent = 'Hệ thống bảng hỏi Blank Full Form (P1, MH, NT, CQ, HTX, TT)';
        } else {
            subTitle.textContent = '';
        }
    }

    if (viewId === 'menu') {
        refreshDraftBadgeCount(false);
        updateMenuSummaryBadges();
        if (typeof refreshFieldPhotosBadgeCount === 'function') {
            refreshFieldPhotosBadgeCount();
        }
        if ((currentUser?.role === 'admin' || currentUser?.role === 'admin1') && typeof refreshAdminMenuLiveBoard === 'function') {
            refreshAdminMenuLiveBoard(false);
        }
        if (currentUser?.role === 'admin1' && typeof loadAdminMenuPhotoGallery === 'function') {
            loadAdminMenuPhotoGallery(false);
        }
    }
    if (viewId === 'blank-questions' && typeof openBlankQuestionsView === 'function') {
        openBlankQuestionsView();
    }
    if (viewId === 'survey') {
        if (!sampleHouseholds || sampleHouseholds.length === 0) {
            sampleHouseholds = getInitialSampleHouseholdsFallback();
        }
        populateSampleGuideFilter();
        filterSampleHouseholds(sampleListPinnedOpen || Boolean(document.getElementById('sampleFilterGuide')?.value || document.getElementById('sampleSearchInput')?.value));
        loadSampleHouseholds(false);
        loadHouseholdLocks().then(() => {
            populateSampleGuideFilter();
            filterSampleHouseholds(sampleListPinnedOpen || Boolean(document.getElementById('sampleFilterGuide')?.value || document.getElementById('sampleSearchInput')?.value));
        });
    }
    if (viewId === 'dashboard') refreshDashboardData();
    if (viewId === 'schedule') {
        renderScheduleTable();
        renderTeamWeekSchedule();
        switchScheduleTab(subTab || 'team6');
    }
    if (viewId === 'history') loadSurveysList();
    if (viewId === 'field-photos' && typeof initFieldPhotosView === 'function') {
        initFieldPhotosView();
    }
    if (viewId === 'map' && typeof refreshStandaloneTeamMap === 'function') {
        refreshStandaloneTeamMap(true);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openNewSurveyTool(toolCode) {
    if (currentUser?.role === 'admin') {
        alert('Tài khoản Admin dùng để quản lý & rà soát dữ liệu, không tạo mới phiếu điều tra!');
        return;
    }
    if (currentUser?.role === 'admin1' || currentUser?.role === 'viewer') {
        alert('Tài khoản này ở chế độ chỉ xem, không thể tạo phiếu điều tra.');
        return;
    }
    currentTool = toolCode || 'P1';
    switchMainView('survey');
    await selectTool(toolCode);
    saveActiveScreenState('survey');
    const subTitle = document.getElementById('subviewTitleText');
    const toolObj = allQuestionsData[toolCode];
    if (subTitle && toolObj) {
        subTitle.textContent = `Tạo phiếu: ${toolObj.tool_code} — ${toolObj.tool_name}`;
    }
}

function switchScheduleTab(tabId) {
    const pTeam = document.getElementById('schedulePaneTeam6');
    const pRoad = document.getElementById('schedulePaneRoadmap');
    const bTeam = document.getElementById('btnSchTabTeam6');
    const bRoad = document.getElementById('btnSchTabRoadmap');
    const isTeam = (tabId !== 'roadmap');
    if (pTeam) pTeam.style.display = isTeam ? 'block' : 'none';
    if (pRoad) pRoad.style.display = isTeam ? 'none' : 'block';
    if (bTeam) bTeam.classList.toggle('active', isTeam);
    if (bRoad) bRoad.classList.toggle('active', !isTeam);
}

function updateMenuSummaryBadges() {
    const hBadge = document.getElementById('menuHistoryBadge');
    const dBadge = document.getElementById('menuDashBadge');
    const cached = window._cachedDashStats;
    const totalForms = (cached && cached.total_combined_forms !== undefined)
        ? cached.total_combined_forms
        : interviewedSurveyCodes.size;
    const completedCount = (cached && cached.total_completed !== undefined)
        ? cached.total_completed
        : ((cached && cached.total !== undefined) ? cached.total : interviewedSurveyCodes.size);
    const draftCount = (cached && cached.total_drafts !== undefined) ? cached.total_drafts : 0;
    const role = currentUser?.role || '';
    if (hBadge) {
        if (role === 'admin' || role === 'admin1') {
            hBadge.textContent = `${completedCount} nộp • ${draftCount} tạm (${totalForms} tổng)`;
        } else {
            hBadge.textContent = `${interviewedSurveyCodes.size} phiếu`;
        }
    }
    if (dBadge) dBadge.textContent = `${totalForms} / 240`;
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ========================================================
// 3. TẢI DỮ LIỆU CÂU HỎI & LỊCH TRÌNH
// ========================================================
const SAMPLE_CACHE_KEY = 'dakman_sample_households_v1';

function getInitialSampleHouseholdsFallback() {
    if (Array.isArray(window.__DEFAULT_SAMPLE_HOUSEHOLDS__) && window.__DEFAULT_SAMPLE_HOUSEHOLDS__.length > 0) {
        return window.__DEFAULT_SAMPLE_HOUSEHOLDS__;
    }
    try {
        const cached = localStorage.getItem(SAMPLE_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (_) {}
    return [];
}

async function fetchJsonWithTimeout(url, timeoutMs = 5000, options = {}) {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
        const res = await fetch(url, Object.assign({
            cache: 'no-store',
            signal: ctrl ? ctrl.signal : undefined
        }, options));
        if (!res.ok) return null;
        return await res.json();
    } finally {
        if (timer) clearTimeout(timer);
    }
}

let sampleHouseholds = getInitialSampleHouseholdsFallback();
let sampleHouseholdsLoadingPromise = null;
let sampleHouseholdsSynced = false;
let householdLocksPromise = null;
let interviewedSurveyCodes = new Set();
let checkinDraftCodes = new Set();
let householdLocksMap = new Map();
let lastAutoSelectedHouseholdLabel = '';

const INTERVIEWER_ROSTER = {
    'Duy':  { code: 'TCN07', fullName: 'Lê Đình Duy',       communes: 'Ea Kiết' },
    'Vọng': { code: 'TCN02', fullName: 'Phan Doãn Vọng',    communes: 'Ea Kiết' },
    'Thao': { code: 'TCN03', fullName: 'Phạm Văn Thao',     communes: "Ea Tul, Cư Dliê M'nông" },
    'Trụ':  { code: 'TCN04', fullName: 'Nguyễn Viết Trụ',   communes: 'Ea Tul' },
    'Phuc': { code: 'TCN05', fullName: 'Cao Thị Phúc',      communes: 'Ea Tul' },
    'Sinh': { code: 'TCN06', fullName: 'Hoàng Trường Sinh', communes: 'Ea Tul' }
};

function findInterviewerMeta(nvKey) {
    const key = normVn(nvKey);
    if (!key) return null;
    for (const [k, meta] of Object.entries(INTERVIEWER_ROSTER)) {
        if (normVn(k) === key || normVn(meta.code) === key || normVn(meta.fullName) === key) {
            return { key: k, ...meta };
        }
    }
    return null;
}

function formatInterviewerDisplay(nvKey) {
    const meta = findInterviewerMeta(nvKey);
    if (meta) return `${meta.fullName} (${meta.code})`;
    return String(nvKey || '').trim() || '—';
}

function matchesInterviewer(h, nvKey) {
    if (!nvKey) return true;
    const hNorm = normVn(h?.interviewer || '');
    const nNorm = normVn(nvKey);
    if (hNorm === nNorm) return true;
    const meta = findInterviewerMeta(nvKey);
    return meta ? hNorm === normVn(meta.key) : false;
}

async function loadHouseholdLocks() {
    if (!navigator.onLine) return householdLocksMap;
    if (householdLocksPromise) return householdLocksPromise;
    householdLocksPromise = (async () => {
        try {
            const rows = await fetchJsonWithTimeout(apiUrl('/api/household-locks'), 5000);
            if (!Array.isArray(rows)) return householdLocksMap;
            const nextMap = new Map();
            rows.forEach(r => {
                const code = String(r.survey_code || '').trim().toUpperCase();
                if (!code) return;
                const existing = nextMap.get(code);
                if (!existing || (!existing.has_photo && r.has_photo)) {
                    nextMap.set(code, r);
                }
            });
            householdLocksMap = nextMap;
        } catch (e) {
            console.warn('Không tải được trạng thái khóa hộ:', e);
        } finally {
            householdLocksPromise = null;
        }
        return householdLocksMap;
    })();
    return householdLocksPromise;
}

function getHouseholdLockInfo(code) {
    const key = String(code || '').trim().toUpperCase();
    return key ? (householdLocksMap.get(key) || null) : null;
}

function isHouseholdLockedByOther(lock) {
    if (!lock || !lock.has_photo) return false;
    const lockUid = String(lock.surveyor_id || '').trim().toUpperCase();
    const myUid = String(currentUser?.surveyor_id || '').trim().toUpperCase();
    if (!lockUid) return false;
    return lockUid !== myUid;
}

let questionsLoadingPromise = null;

async function fetchQuestionsWithTimeout(timeoutMs = 6000) {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
        const res = await fetch(apiUrl('/api/questions'), {
            cache: 'no-store',
            signal: ctrl ? ctrl.signal : undefined
        });
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                const prevSnapshot = JSON.stringify(allQuestionsData[currentTool] || null);
                allQuestionsData = data;
                questionsSyncedFromServer = true;
                try {
                    localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(data));
                } catch (_) {}
                const nextSnapshot = JSON.stringify(allQuestionsData[currentTool] || null);
                const qBox = document.getElementById('surveyQuestionsBox');
                const needsRender = qBox && (qBox.innerHTML.includes('fa-spinner') || qBox.innerHTML.includes('Không thể tải bộ câu hỏi') || prevSnapshot !== nextSnapshot);
                if (needsRender && currentMainView === 'survey' && allQuestionsData[currentTool]) {
                    const toolObj = allQuestionsData[currentTool];
                    const sections = [];
                    (toolObj.questions || []).forEach(q => {
                        const s = q.section || 'Thông tin chung';
                        if (!sections.includes(s)) sections.push(s);
                    });
                    renderSectionJumpNav(sections);
                    if (!currentSection) currentSection = sections.length > 1 ? '__ALL__' : (sections[0] || null);
                    renderQuestionsForSection(currentSection);
                    updateSectionStepButtons(sections);
                    updateAnsweredSummaryBadge();
                }
                return allQuestionsData;
            }
        }
    } catch (e) {
        console.warn('Không tải được câu hỏi từ API (dùng bộ câu hỏi dự phòng cục bộ):', e);
    } finally {
        if (timer) clearTimeout(timer);
    }
    if (!allQuestionsData || Object.keys(allQuestionsData).length === 0) {
        allQuestionsData = getInitialQuestionsFallback();
    }
    return allQuestionsData;
}

async function loadQuestions(force = false) {
    // Tải song song danh sách hộ mẫu, không chặn luồng tải bộ câu hỏi
    loadSampleHouseholds().catch(() => {});
    if (!allQuestionsData || Object.keys(allQuestionsData).length === 0) {
        allQuestionsData = getInitialQuestionsFallback();
    }
    if (!force && allQuestionsData && Object.keys(allQuestionsData).length > 0) {
        if (!questionsSyncedFromServer && !questionsLoadingPromise) {
            questionsLoadingPromise = fetchQuestionsWithTimeout(6000).finally(() => {
                questionsLoadingPromise = null;
            });
        }
        return allQuestionsData;
    }
    if (!force && questionsLoadingPromise) {
        return questionsLoadingPromise;
    }
    questionsLoadingPromise = fetchQuestionsWithTimeout(6000).finally(() => {
        questionsLoadingPromise = null;
    });
    return questionsLoadingPromise;
}

function updateInterviewerFilterOptions() {
    // Bộ lọc theo ĐTV đã được gỡ bỏ theo góp ý nhóm — không khóa hộ vào 1 ĐTV
}

async function loadSampleHouseholds(force = false) {
    if (!sampleHouseholds || sampleHouseholds.length === 0) {
        sampleHouseholds = getInitialSampleHouseholdsFallback();
    }
    const refreshSampleUiNow = () => {
        if (!sampleHouseholds || sampleHouseholds.length === 0) return;
        populateSampleGuideFilter();
        const guideVal = document.getElementById('sampleFilterGuide')?.value || '';
        const kwVal = (document.getElementById('sampleSearchInput')?.value || '').trim();
        const scopeNote = document.getElementById('sampleScopeNote');
        if (scopeNote && !guideVal && !kwVal) {
            autoSelectSampleFilterForUser();
        } else {
            filterSampleHouseholds(Boolean(guideVal || kwVal));
        }
    };

    // Hiển thị danh sách hộ ngay lập tức từ dữ liệu đóng gói/cache, không chờ mạng hoặc API khóa hộ
    if (sampleHouseholds.length > 0) {
        refreshSampleUiNow();
        if (!force && sampleHouseholdsSynced) return sampleHouseholds;
    }
    if (sampleHouseholdsLoadingPromise) return sampleHouseholdsLoadingPromise;

    sampleHouseholdsLoadingPromise = (async () => {
        const endpoints = [apiUrl('/api/sample-households'), './sample_households.json?v=3'];
        let loaded = null;
        for (const url of endpoints) {
            try {
                const data = await fetchJsonWithTimeout(url, 5000);
                if (Array.isArray(data) && data.length > 0) {
                    loaded = data;
                    break;
                }
            } catch (e) {
                console.warn('Thử tải danh sách hộ mẫu từ ' + url + ' thất bại:', e);
            }
        }
        if (loaded) {
            sampleHouseholds = loaded;
            sampleHouseholdsSynced = true;
            try {
                localStorage.setItem(SAMPLE_CACHE_KEY, JSON.stringify(loaded));
            } catch (_) {}
            refreshSampleUiNow();
        } else if (sampleHouseholds.length === 0) {
            const cnt = document.getElementById('sampleFilterCount');
            if (cnt) cnt.textContent = 'Đang dùng chế độ ngoại tuyến (chưa tải được hộ mẫu)';
        }
        loadHouseholdLocks().then(() => refreshSampleUiNow()).catch(() => {});
        sampleHouseholdsLoadingPromise = null;
        return sampleHouseholds;
    })();
    return sampleHouseholdsLoadingPromise;
}

function normVn(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim();
}

function getUserAssignedScope() {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'viewer') return '';
    const sid = String(currentUser.surveyor_id || '').trim().toUpperCase();
    const commNorm = normVn(currentUser.commune || '');
    if (sid === 'TCN11' || sid === 'TCN21' || sid === 'VIEWER' || sid === 'ADMIN' || commNorm === 'toan vung') return '';
    const idMap = {
        TCN01: 'Duy',
        TCN07: 'Duy',
        TCN02: 'Vọng',
        TCN03: 'Thao',
        TCN04: 'Trụ',
        TCN05: 'Phuc',
        TCN06: 'Sinh'
    };
    if (idMap[sid]) return idMap[sid];
    const fullName = normVn(currentUser.full_name || '');
    if (!fullName) return '';
    const words = fullName.split(/\s+/);
    const nvKeys = ['Duy', 'Vọng', 'Trụ', 'Thao', 'Phuc', 'Sinh'];
    return nvKeys.find(k => words.includes(normVn(k)) || fullName.endsWith(' ' + normVn(k))) || '';
}

function autoSelectSampleFilterForUser() {
    const scopeNote = document.getElementById('sampleScopeNote');
    if (sampleHouseholds.length === 0) {
        loadSampleHouseholds();
    }

    const assignedScope = getUserAssignedScope();
    const allPending = sampleHouseholds.filter(h => !interviewedSurveyCodes.has(String(h.id || '').toUpperCase())).length;
    if (scopeNote) {
        const fullName = String(currentUser?.full_name || '').trim();
        if (assignedScope) {
            const assignedRows = sampleHouseholds.filter(h => matchesInterviewer(h, assignedScope));
            const pendingAssigned = assignedRows.filter(h => !interviewedSurveyCodes.has(String(h.id || '').toUpperCase())).length;
            scopeNote.style.display = 'block';
            scopeNote.innerHTML = `<i class="fa-solid fa-unlock-keyhole" style="color:#002060;"></i> <strong>${escapeHtml(fullName || currentUser.surveyor_id)} (${escapeHtml(currentUser.surveyor_id)})</strong>: Mở toàn bộ <strong>${allPending} hộ</strong> đang chờ (nhóm của bạn còn <strong>${pendingAssigned}/${assignedRows.length}</strong> hộ được <strong style="color:#002060;">tô đậm</strong>). Chỉ khóa hộ khi đã có người chụp ảnh/phỏng vấn.`;
        } else if (allPending > 0) {
            scopeNote.style.display = 'block';
            scopeNote.innerHTML = `<i class="fa-solid fa-unlock-keyhole" style="color:#002060;"></i> Đang mở tự do toàn bộ <strong>${allPending} hộ</strong> chưa phỏng vấn. Hộ chỉ bị khóa khi đã có ĐTV chụp ảnh / check-in.`;
        } else {
            scopeNote.style.display = 'none';
        }
    }

    populateSampleGuideFilter();
    filterSampleHouseholds();
}

function styleSampleGuideSelect(sel, assignedScope, pendingPool) {
    if (!sel) return;
    const guide = sel.value || '';
    const isMine = Boolean(guide && assignedScope && pendingPool.some(h => h.guide === guide && matchesInterviewer(h, assignedScope)));
    sel.style.fontWeight = isMine ? '700' : '500';
    sel.style.color = isMine ? '#002060' : '#334155';
    sel.style.background = isMine ? '#eff6ff' : '#ffffff';
    sel.style.borderColor = isMine ? '#1e40af' : '';
}

function populateSampleGuideFilter() {
    const sel = document.getElementById('sampleFilterGuide');
    if (!sel) return;
    const prev = sel.value;
    const assignedScope = getUserAssignedScope();
    // Chỉ hiển thị người dẫn đường còn tối thiểu 1 hộ chưa phỏng vấn
    const pendingPool = sampleHouseholds.filter(h =>
        !interviewedSurveyCodes.has(String(h.id || '').toUpperCase())
    );

    const guideMap = new Map();
    pendingPool.forEach(h => {
        if (!h.guide) return;
        if (!guideMap.has(h.guide)) {
            guideMap.set(h.guide, { guide: h.guide, rows: [], owners: new Set(), isMine: false });
        }
        const entry = guideMap.get(h.guide);
        entry.rows.push(h);
        if (h.interviewer) entry.owners.add(h.interviewer);
        if (assignedScope && matchesInterviewer(h, assignedScope)) entry.isMine = true;
    });

    const entries = Array.from(guideMap.values()).sort((a, b) => {
        if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
        return a.guide.localeCompare(b.guide, 'vi');
    });

    sel.innerHTML = `<option value="">-- 2. Chọn Người Dẫn Đường (${entries.length} người, ${pendingPool.length} hộ chờ) --</option>` +
        entries.map(e => {
            const pendCnt = e.rows.length;
            if (e.isMine) {
                return `<option value="${escapeHtml(e.guide)}" style="font-weight:700; color:#002060; background:#dbeafe;">★ ${escapeHtml(e.guide)} (Của bạn • còn ${pendCnt} hộ chờ)</option>`;
            }
            return `<option value="${escapeHtml(e.guide)}" style="font-weight:400; color:#334155;">${escapeHtml(e.guide)} (còn ${pendCnt} hộ chờ)</option>`;
        }).join('');

    if (prev && guideMap.has(prev)) {
        sel.value = prev;
    } else {
        sel.value = '';
    }
    styleSampleGuideSelect(sel, assignedScope, pendingPool);
}

function onSampleNVFilterChange() {
    populateSampleGuideFilter();
    filterSampleHouseholds(Boolean(document.getElementById('sampleFilterGuide')?.value));
}

let sampleListPinnedOpen = false;

function onSampleGuideFilterChange() {
    sampleListPinnedOpen = true;
    const searchEl = document.getElementById('sampleSearchInput');
    if (searchEl && lastAutoSelectedHouseholdLabel && searchEl.value.trim() === lastAutoSelectedHouseholdLabel) {
        searchEl.value = '';
        lastAutoSelectedHouseholdLabel = '';
    }
    const assignedScope = getUserAssignedScope();
    const pendingPool = sampleHouseholds.filter(h =>
        !interviewedSurveyCodes.has(String(h.id || '').toUpperCase())
    );
    styleSampleGuideSelect(document.getElementById('sampleFilterGuide'), assignedScope, pendingPool);
    filterSampleHouseholds(true);
}

function clearSampleFilter() {
    sampleListPinnedOpen = false;
    const guideEl = document.getElementById('sampleFilterGuide');
    const searchEl = document.getElementById('sampleSearchInput');
    if (guideEl) guideEl.value = '';
    if (searchEl) searchEl.value = '';
    lastAutoSelectedHouseholdLabel = '';
    populateSampleGuideFilter();
    filterSampleHouseholds(false);
}

function showPendingHouseholdsList() {
    sampleListPinnedOpen = true;
    filterSampleHouseholds(true);
}

function isOrderedSubsequence(needle, haystack) {
    if (!needle) return true;
    let i = 0;
    for (let j = 0; j < haystack.length && i < needle.length; j++) {
        if (haystack[j] === needle[i]) i++;
    }
    return i === needle.length;
}

function hasAllCharsBag(needle, haystack) {
    if (!needle || needle.length > haystack.length) return false;
    const counts = Object.create(null);
    for (let i = 0; i < haystack.length; i++) {
        const ch = haystack[i];
        counts[ch] = (counts[ch] || 0) + 1;
    }
    for (let i = 0; i < needle.length; i++) {
        const ch = needle[i];
        if (!counts[ch]) return false;
        counts[ch]--;
    }
    return true;
}

function matchHouseholdScore(h, kwRaw) {
    const kwNorm = normVn(kwRaw);
    if (!kwNorm) return { matched: true, score: 0 };
    const nameNorm = normVn(h.name || '');
    const idNorm = normVn(h.id || '');
    const nameCompact = nameNorm.replace(/\s+/g, '');
    const kwCompact = kwNorm.replace(/\s+/g, '');
    const hay = normVn(`${h.id} ${h.name} ${h.phone} ${h.hamlet} ${h.commune} ${h.guide} ${h.clb} ${h.ra || ''} ${h.note || ''}`);

    if (idNorm === kwNorm || nameNorm === kwNorm) return { matched: true, score: 500 };
    if (nameNorm.startsWith(kwNorm) || idNorm.includes(kwNorm)) return { matched: true, score: 400 };
    if (nameNorm.includes(kwNorm)) return { matched: true, score: 300 };

    const kwTokens = kwNorm.split(/\s+/).filter(Boolean);
    if (kwTokens.length > 0 && kwTokens.every(tok => hay.includes(tok))) {
        return { matched: true, score: 200 };
    }
    if (kwCompact.length >= 2 && isOrderedSubsequence(kwCompact, nameCompact)) {
        return { matched: true, score: 120 };
    }
    if (kwCompact.length >= 3 && hasAllCharsBag(kwCompact, nameCompact)) {
        return { matched: true, score: 60 };
    }
    return { matched: false, score: 0 };
}

function onRespondentTyping(val) {
    currentDraftAnswers['_resp_name'] = val;
    if (document.activeElement?.id === 'respondentNameInput' && !document.getElementById('headNameInput')?.value?.trim()) {
        const clean = normVn(val);
        if (clean && clean.length >= 2) {
            const pendingPool = sampleHouseholds.filter(h =>
                !interviewedSurveyCodes.has(String(h.id || '').toUpperCase())
            );
            const exactMatch = pendingPool.find(h => normVn(h.name) === clean && !isHouseholdLockedByOther(getHouseholdLockInfo(h.id)));
            if (exactMatch) {
                selectSampleHousehold(exactMatch.id);
                return;
            }
        }
    }
    saveDraftLocal(false);
}

function getSelectedRespondentRelation() {
    const relSel = document.getElementById('respondentRelationSelect')?.value || 'Chủ hộ';
    const relOther = (document.getElementById('respondentRelationOther')?.value || '').trim();
    if (currentTool !== 'P1') return relSel || 'Đại diện đơn vị / Khác';
    return (relSel === 'Khác') ? (relOther || 'Khác') : relSel;
}

function updateRespondentSubRowVisibility() {
    const isP1 = (currentTool === 'P1');
    const relGrid = document.getElementById('respondentRelationGrid');
    const relSel = document.getElementById('respondentRelationSelect');
    const relOtherGroup = document.getElementById('respondentRelationOtherGroup');
    const altRow = document.getElementById('altRespondentSubRow');
    if (relGrid) relGrid.style.display = isP1 ? 'grid' : 'none';

    const relVal = relSel ? (relSel.value || 'Chủ hộ') : 'Chủ hộ';
    const isHeadAnswering = isP1 && (relVal === 'Chủ hộ');
    if (relOtherGroup) {
        relOtherGroup.style.display = (isP1 && relVal === 'Khác') ? 'block' : 'none';
    }
    if (altRow) {
        altRow.style.display = (!isP1 || !isHeadAnswering) ? 'grid' : 'none';
    }
}

function syncRespondentFromHead() {
    const headName = (document.getElementById('headNameInput')?.value || '').trim();
    const headGender = document.getElementById('headGenderSelect')?.value || '';
    const headBirth = (document.getElementById('headBirthYearInput')?.value || '').trim();

    const respNameEl = document.getElementById('respondentNameInput');
    const respGenderEl = document.getElementById('respondentGenderSelect');
    const respBirthEl = document.getElementById('respondentBirthYearInput');
    const respRelEl = document.getElementById('respondentRelationSelect');

    const isP1 = (currentTool === 'P1');
    const relVal = respRelEl ? (respRelEl.value || 'Chủ hộ') : 'Chủ hộ';
    const isSame = isP1 && (relVal === 'Chủ hộ');
    currentDraftAnswers['_same_as_head'] = isSame;

    updateRespondentSubRowVisibility();

    if (isSame) {
        if (respNameEl) respNameEl.value = headName;
        if (respGenderEl) respGenderEl.value = headGender;
        if (respBirthEl) respBirthEl.value = headBirth;
        currentDraftAnswers['_resp_name'] = headName;
        currentDraftAnswers['_resp_gender'] = headGender;
        currentDraftAnswers['_resp_birth_year'] = headBirth;
        currentDraftAnswers['_resp_relation'] = 'Chủ hộ';
        currentDraftAnswers['_resp_relation_other'] = '';
    }
}

function applySharedDemographicsToForm(ans = {}, respName = '', toolCode = currentTool) {
    const isP1Tool = ((toolCode || 'P1') === 'P1');
    const headNameEl = document.getElementById('headNameInput');
    const headGenderEl = document.getElementById('headGenderSelect');
    const headBirthEl = document.getElementById('headBirthYearInput');
    const respNameEl = document.getElementById('respondentNameInput');
    const respGenderEl = document.getElementById('respondentGenderSelect');
    const respBirthEl = document.getElementById('respondentBirthYearInput');
    const respRelEl = document.getElementById('respondentRelationSelect');
    const respRelOtherEl = document.getElementById('respondentRelationOther');

    if (isP1Tool) {
        const headName = ans._head_name !== undefined ? ans._head_name : (respName || '');
        if (headNameEl) headNameEl.value = headName;
        if (headGenderEl) headGenderEl.value = ans._head_gender || '';
        if (headBirthEl) headBirthEl.value = ans._head_birth_year || '';

        const relSaved = (ans._resp_relation || '').trim();
        const inferredSame = (ans._same_as_head !== undefined)
            ? Boolean(ans._same_as_head) && (!relSaved || relSaved === 'Chủ hộ')
            : (!relSaved || relSaved === 'Chủ hộ');

        if (inferredSame) {
            if (respRelEl) respRelEl.value = 'Chủ hộ';
            if (respRelOtherEl) respRelOtherEl.value = '';
            syncRespondentFromHead();
        } else {
            const targetRel = relSaved || 'Vợ / Chồng';
            if (respRelEl) {
                const hasOpt = Array.from(respRelEl.options).some(o => o.value === targetRel);
                respRelEl.value = hasOpt ? targetRel : 'Khác';
                if (!hasOpt && respRelOtherEl) respRelOtherEl.value = targetRel;
                else if (respRelOtherEl) respRelOtherEl.value = ans._resp_relation_other || '';
            }
            if (respNameEl) respNameEl.value = ans._resp_name || respName || '';
            if (respGenderEl) respGenderEl.value = ans._resp_gender || '';
            if (respBirthEl) respBirthEl.value = ans._resp_birth_year || '';
            syncRespondentFromHead();
        }
    } else {
        if (headNameEl) headNameEl.value = '';
        if (headGenderEl) headGenderEl.value = '';
        if (headBirthEl) headBirthEl.value = '';
        if (respRelEl) respRelEl.value = 'Chủ hộ';
        if (respRelOtherEl) respRelOtherEl.value = ans._resp_relation_other || '';
        if (respNameEl) respNameEl.value = respName || ans._resp_name || '';
        if (respGenderEl) respGenderEl.value = ans._resp_gender || '';
        if (respBirthEl) respBirthEl.value = ans._resp_birth_year || '';
        updateRespondentSubRowVisibility();
    }
}

function onHeadFieldChange() {
    const headName = (document.getElementById('headNameInput')?.value || '').trim();
    const headGender = document.getElementById('headGenderSelect')?.value || '';
    const headBirth = (document.getElementById('headBirthYearInput')?.value || '').trim();
    currentDraftAnswers['_head_name'] = headName;
    currentDraftAnswers['_head_gender'] = headGender;
    currentDraftAnswers['_head_birth_year'] = headBirth;
    syncRespondentFromHead();
    saveDraftLocal(false);
}

function onRespondentRelationChange() {
    const relSel = document.getElementById('respondentRelationSelect');
    const relOther = document.getElementById('respondentRelationOther');
    const respNameEl = document.getElementById('respondentNameInput');
    const respGenderEl = document.getElementById('respondentGenderSelect');
    const respBirthEl = document.getElementById('respondentBirthYearInput');
    const relVal = relSel ? relSel.value : 'Chủ hộ';

    if (relVal === 'Chủ hộ') {
        if (relOther) relOther.value = '';
        syncRespondentFromHead();
    } else {
        const headName = (document.getElementById('headNameInput')?.value || '').trim();
        const headGender = document.getElementById('headGenderSelect')?.value || '';
        const headBirth = (document.getElementById('headBirthYearInput')?.value || '').trim();
        if (respNameEl && respNameEl.value.trim() === headName) respNameEl.value = '';
        if (respGenderEl && respGenderEl.value === headGender) respGenderEl.value = '';
        if (respBirthEl && respBirthEl.value === headBirth) respBirthEl.value = '';
        if (relVal !== 'Khác' && relOther) relOther.value = '';
        updateRespondentSubRowVisibility();
        if (relVal === 'Khác' && relOther) relOther.focus();
        else if (respNameEl) respNameEl.focus();
    }
    onRespondentMetaChange();
}

function onRespondentMetaChange() {
    const relSel = document.getElementById('respondentRelationSelect')?.value || 'Chủ hộ';
    const relOther = (document.getElementById('respondentRelationOther')?.value || '').trim();
    const isSame = (currentTool === 'P1' && relSel === 'Chủ hộ');
    const respName = isSame
        ? (document.getElementById('headNameInput')?.value || '').trim()
        : (document.getElementById('respondentNameInput')?.value || '').trim();
    const respGender = isSame
        ? (document.getElementById('headGenderSelect')?.value || '')
        : (document.getElementById('respondentGenderSelect')?.value || '');
    const respBirth = isSame
        ? (document.getElementById('headBirthYearInput')?.value || '').trim()
        : (document.getElementById('respondentBirthYearInput')?.value || '').trim();
    currentDraftAnswers['_same_as_head'] = isSame;
    currentDraftAnswers['_resp_name'] = respName;
    currentDraftAnswers['_resp_gender'] = respGender;
    currentDraftAnswers['_resp_birth_year'] = respBirth;
    currentDraftAnswers['_resp_relation_other'] = relOther;
    currentDraftAnswers['_resp_relation'] = (currentTool !== 'P1')
        ? (currentDraftAnswers['_resp_relation'] || 'Đại diện đơn vị / Khác')
        : ((relSel === 'Khác' && relOther) ? relOther : relSel);
    saveDraftLocal(false);
}

function renderSampleResultItems(matched) {
    const box = document.getElementById('sampleResultList');
    if (!box) return;
    box.style.display = 'block';
    if (matched.length === 0) {
        box.innerHTML = '<div style="padding: 8px 10px; font-size: 0.80rem; color: #64748b;">Không tìm thấy chủ hộ nào đang chờ khớp bộ lọc.</div>';
        return;
    }
    const assignedScope = getUserAssignedScope();
    box.innerHTML = matched.slice(0, 80).map(h => {
        const isExtra = Boolean(h.status && h.status.includes('Hộ mới'));
        const isMine = Boolean(assignedScope && matchesInterviewer(h, assignedScope));
        const lockInfo = getHouseholdLockInfo(h.id);
        const lockedByOther = isHouseholdLockedByOther(lockInfo);
        const lockedByMe = Boolean(lockInfo && lockInfo.has_photo && !lockedByOther);
        const isCheckin = lockedByMe || checkinDraftCodes.has(String(h.id || '').toUpperCase());

        const bgNormal = lockedByOther ? '#f1f5f9' : (isExtra ? '#fef2f2' : (isCheckin ? '#f0fdfa' : (isMine ? '#eff6ff' : '#ffffff')));
        const bgHover = lockedByOther ? '#f1f5f9' : (isExtra ? '#fee2e2' : (isCheckin ? '#ccfbf1' : '#f0fdf4'));
        const borderLeft = lockedByOther
            ? 'border-left: 4px solid #dc2626;'
            : (isExtra ? 'border-left: 4px solid #dc2626;' : (isCheckin ? 'border-left: 4px solid #0f766e;' : (isMine ? 'border-left: 4px solid #002060;' : 'border-left: 4px solid #e2e8f0;')));
        const titleColor = lockedByOther ? '#64748b' : (isExtra ? '#b91c1c' : (isMine ? '#002060' : '#334155'));
        const extraBadge = isExtra ? '<span style="background:#dc2626; color:#ffffff; padding:1px 6px; border-radius:3px; font-size:0.70rem; font-weight:700; margin-left:5px;">BỔ SUNG (+1)</span>' : '';
        const lockBadge = lockedByOther
            ? `<span style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:1px 6px; border-radius:3px; font-size:0.70rem; font-weight:700; margin-left:5px;">🔒 Đã khóa (${escapeHtml(lockInfo.surveyor_name || lockInfo.surveyor_id)})</span>`
            : (isCheckin ? '<span style="background:#0f766e; color:#ffffff; padding:1px 6px; border-radius:3px; font-size:0.70rem; font-weight:700; margin-left:4px;">📸 Bạn đã Check-in • Bấm mở tiếp</span>' : '');
        const guideBadge = `<span style="background:${isMine ? '#dbeafe' : '#f1f5f9'}; color:${isMine ? '#002060' : '#475569'}; border:1px solid ${isMine ? '#93c5fd' : '#cbd5e1'}; padding:2px 7px; border-radius:3px; font-weight:${isMine ? '700' : '600'}; font-size:0.72rem; white-space:nowrap;">${isMine ? '★ ' : ''}${escapeHtml(h.guide || 'Chưa rõ dẫn đường')}</span>`;
        const rowOpacity = lockedByOther ? 'opacity: 0.72; cursor: not-allowed;' : 'cursor: pointer;';
        return `
        <div onclick="selectSampleHousehold('${escapeQuotes(h.id)}')"
             style="padding: 8px 10px; border-bottom: 1px solid #f1f5f9; ${borderLeft} background: ${bgNormal}; ${rowOpacity} font-size: 0.80rem; display: flex; justify-content: space-between; align-items: center; gap: 8px;"
             onmouseover="this.style.background='${bgHover}'" onmouseout="this.style.background='${bgNormal}'">
            <div>
                <strong style="color:${titleColor};">[${escapeHtml(h.id)}] ${escapeHtml(h.name)}</strong>
                <span style="font-size:0.70rem; color:#475569; margin-left:3px;">(Chủ hộ)</span>
                ${extraBadge}
                ${h.ra ? '<span style="background:#dcfce7; color:#166534; border:1px solid #86efac; padding:1px 5px; border-radius:3px; font-size:0.70rem; font-weight:700; margin-left:4px;">RA</span>' : ''}
                ${lockBadge}
                <span style="color:#475569;"> — ${escapeHtml(h.address)}</span>
                <div style="font-size:0.74rem; color:#64748b;">SĐT: ${escapeHtml(h.phone || '—')} • CLB: ${escapeHtml(h.clb || '—')} • Dẫn đường: <b style="color:${isMine ? '#002060' : '#0f172a'};">${escapeHtml(h.guide)}</b>${h.note ? ` • <span style="color:#0369a1;">${escapeHtml(h.note)}</span>` : ''}</div>
            </div>
            ${guideBadge}
        </div>
    `;
    }).join('');
}

function filterSampleHouseholds(forceShow = false) {
    const assignedScope = getUserAssignedScope();
    const guide = document.getElementById('sampleFilterGuide')?.value || '';
    const kwRaw = (document.getElementById('sampleSearchInput')?.value || '').trim();

    const pendingPool = sampleHouseholds.filter(h => !interviewedSurveyCodes.has(String(h.id || '').toUpperCase()));

    const scoreAgainstPool = (pool, useGuide) => {
        const out = [];
        for (const h of pool) {
            if (useGuide && guide && h.guide !== guide) continue;
            const res = matchHouseholdScore(h, kwRaw);
            if (!res.matched) continue;
            const isMine = assignedScope && matchesInterviewer(h, assignedScope) ? 1 : 0;
            const lockedOther = isHouseholdLockedByOther(getHouseholdLockInfo(h.id)) ? 1 : 0;
            out.push({ h, score: res.score, isMine, lockedOther });
        }
        out.sort((a, b) => {
            if (a.lockedOther !== b.lockedOther) return a.lockedOther - b.lockedOther;
            if (kwRaw && b.score !== a.score) return b.score - a.score;
            if (b.isMine !== a.isMine) return b.isMine - a.isMine;
            return String(a.h.id || '').localeCompare(String(b.h.id || ''));
        });
        return out.map(x => x.h);
    };

    let matched = scoreAgainstPool(pendingPool, true);
    let expandedAllGuides = false;
    if (matched.length === 0 && guide && kwRaw) {
        const crossGuide = scoreAgainstPool(pendingPool, false);
        if (crossGuide.length > 0) {
            matched = crossGuide;
            expandedAllGuides = true;
        }
    }

    const cnt = document.getElementById('sampleFilterCount');
    const doneCnt = sampleHouseholds.length - pendingPool.length;
    if (cnt) {
        cnt.textContent = (!guide && !kwRaw)
            ? `Còn ${pendingPool.length} / ${sampleHouseholds.length} hộ chưa phỏng vấn` + (doneCnt ? ` (đã xong ${doneCnt})` : '')
            : `Tìm thấy ${matched.length} hộ chờ` + (expandedAllGuides ? ' (mở rộng tất cả dẫn đường)' : '') + (doneCnt ? ` (đã xong ${doneCnt})` : '');
    }

    const box = document.getElementById('sampleResultList');
    if (!box) return;
    if (forceShow) sampleListPinnedOpen = true;
    const isSearchFocused = (document.activeElement && document.activeElement.id === 'sampleSearchInput');
    if (!forceShow && !sampleListPinnedOpen && !isSearchFocused && !guide && !kwRaw) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }
    renderSampleResultItems(matched);
}

function prefetchHouseholdGpsSilent() {
    const gpsEl = document.getElementById('gpsInput');
    if (!gpsEl || gpsEl.value.trim() || !navigator.geolocation) return;
    try {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (gpsEl && !gpsEl.value.trim()) {
                    const lat = pos.coords.latitude.toFixed(6);
                    const lng = pos.coords.longitude.toFixed(6);
                    gpsEl.value = `${lat}, ${lng}`;
                    currentDraftAnswers['_gps_text'] = gpsEl.value;
                    saveDraftLocal(false);
                }
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 }
        );
    } catch (_) {}
}

async function selectSampleHousehold(id) {
    const h = sampleHouseholds.find(item => item.id.toUpperCase() === String(id || '').trim().toUpperCase());
    if (!h) return;

    const lockInfo = getHouseholdLockInfo(h.id);
    if (isHouseholdLockedByOther(lockInfo)) {
        alert(
            `HỘ ĐÃ ĐƯỢC KHÓA BỞI ĐIỀU TRA VIÊN KHÁC!\n` +
            `- Hộ: [${h.id}] ${h.name}\n` +
            `- Đang giữ / đã chụp ảnh bởi: ${lockInfo.surveyor_name || lockInfo.surveyor_id} (${lockInfo.surveyor_id})\n\n` +
            `Vui lòng chọn chủ hộ khác còn đang chờ.`
        );
        return;
    }

    // Nếu chính ĐTV hiện tại đã chụp ảnh / check-in hộ này trước đó, nạp lại bản nháp đã lưu
    if (lockInfo && lockInfo.has_photo && !isHouseholdLockedByOther(lockInfo)) {
        const drafts = await fetchMergedDraftsList();
        const existingDraft = drafts.find(d => String(d.survey_code || '').trim().toUpperCase() === String(h.id).toUpperCase());
        if (existingDraft) {
            await loadDraftIntoForm(existingDraft.draft_key);
            return;
        }
    }

    const codeEl = document.getElementById('surveyCodeInput');
    const commEl = document.getElementById('communeSelect');
    const hamEl = document.getElementById('hamletInput');
    const headNameEl = document.getElementById('headNameInput');
    const headGenderEl = document.getElementById('headGenderSelect');
    const headBirthEl = document.getElementById('headBirthYearInput');
    const phoneEl = document.getElementById('phoneInput');
    const guideEl = document.getElementById('guideNameInput');
    const guideFilterEl = document.getElementById('sampleFilterGuide');
    const searchEl = document.getElementById('sampleSearchInput');
    const relSelEl = document.getElementById('respondentRelationSelect');
    const isNew = Boolean(h.status && h.status.includes('Hộ mới'));

    if (codeEl) codeEl.value = h.id;
    if (commEl && h.commune) commEl.value = h.commune;
    if (hamEl) hamEl.value = h.hamlet || '';
    if (headNameEl) headNameEl.value = isNew ? '' : (h.name || '');
    if (headGenderEl) headGenderEl.value = h.gender || '';
    if (headBirthEl) headBirthEl.value = h.birth_year || '';
    if (phoneEl) phoneEl.value = isNew ? '' : (h.phone || '');
    if (guideEl) guideEl.value = h.guide || '';
    if (relSelEl) relSelEl.value = 'Chủ hộ';

    if (guideFilterEl && h.guide) {
        const hasOpt = Array.from(guideFilterEl.options).some(o => o.value === h.guide);
        if (hasOpt) guideFilterEl.value = h.guide;
        const pendingPool = sampleHouseholds.filter(x => !interviewedSurveyCodes.has(String(x.id || '').toUpperCase()));
        styleSampleGuideSelect(guideFilterEl, getUserAssignedScope(), pendingPool);
    }

    if (searchEl) {
        const label = isNew ? h.id : (h.name || h.id);
        searchEl.value = label;
        lastAutoSelectedHouseholdLabel = label;
    }

    // Tự động điền các câu hỏi thông tin phiếu A01, A03, A04 + thông tin Chủ hộ mặc định
    currentDraftAnswers['A01'] = h.id;
    currentDraftAnswers['A04'] = h.hamlet || '';
    const a03Q = (allQuestionsData[currentTool]?.questions || []).find(q => q.code === 'A03');
    if (a03Q && Array.isArray(a03Q.options)) {
        const matchOpt = a03Q.options.find(o => o.label.toLowerCase().includes(h.commune.toLowerCase()));
        if (matchOpt) currentDraftAnswers['A03'] = matchOpt.value;
        else currentDraftAnswers['A03'] = h.commune;
    }
    currentDraftAnswers['_guide'] = h.guide || '';
    currentDraftAnswers['_assigned_nv'] = h.interviewer || '';
    currentDraftAnswers['_phone'] = isNew ? '' : (h.phone || '');
    currentDraftAnswers['_clb'] = h.clb || '';
    currentDraftAnswers['_ra'] = h.ra || '';
    currentDraftAnswers['_head_name'] = isNew ? '' : (h.name || '');
    currentDraftAnswers['_head_gender'] = h.gender || '';
    currentDraftAnswers['_head_birth_year'] = h.birth_year || '';
    syncRespondentFromHead();

    sampleListPinnedOpen = false;
    const box = document.getElementById('sampleResultList');
    if (box) box.style.display = 'none';
    const banner = document.getElementById('sampleSelectedBanner');
    if (banner) {
        banner.style.display = 'block';
        const raTag = h.ra ? ' • <span style="background:#166534;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;">Chứng nhận RA</span>' : '';
        banner.innerHTML = isNew
            ? `<i class="fa-solid fa-user-plus"></i> Đã cấp mã hộ mới: <strong>[${escapeHtml(h.id)}]</strong> (${escapeHtml(h.address)}) • Dẫn đường: <strong>${escapeHtml(h.guide)}</strong> — <em>Vui lòng nhập Tên Chủ hộ, Giới tính, Năm sinh &amp; SĐT bên dưới.</em>`
            : `<i class="fa-solid fa-circle-check"></i> Đã chọn Chủ hộ mặc định: <strong>[${escapeHtml(h.id)}] ${escapeHtml(h.name)}</strong> (${escapeHtml(h.address)})${raTag} • SĐT: ${escapeHtml(h.phone || '—')} • Dẫn đường: <strong>${escapeHtml(h.guide)}</strong>`;
    }

    prefetchHouseholdGpsSilent();
    if (currentSection) renderQuestionsForSection(currentSection);
    saveDraftLocal(false);
    if (isNew && headNameEl) headNameEl.focus();
}

function generateNextNewHouseholdId() {
    const commVal = document.getElementById('communeSelect')?.value || 'Ea Kiết';
    const hamVal = (document.getElementById('hamletInput')?.value || '').trim();
    if (!hamVal) {
        alert('Vui lòng chọn Xã và nhập tên Thôn / Buôn trước khi cấp mã hộ mới (+1)!');
        document.getElementById('hamletInput')?.focus();
        return;
    }

    const cMap = { 'Ea Kiết': 'EK', 'Ea Tul': 'ET', 'Ea Tar': 'ET', "Cư Dliê M'nông": 'CD' };
    const cCode = cMap[commVal] || 'XX';
    const normHam = hamVal.toLowerCase();
    const matchH = sampleHouseholds.find(h => h.commune_code === cCode && h.hamlet.toLowerCase() === normHam);
    let hCode = matchH ? matchH.hamlet_code : '';
    if (!hCode) {
        const cleanWords = hamVal.replace(/^(thôn|buôn)\s+/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toUpperCase().split(/\s+/).filter(Boolean);
        hCode = cleanWords.map(w => w[0]).join('').slice(0, 3) || 'XX';
    }

    const prefix = `${cCode}-${hCode}-`;
    let maxSeq = 0;
    sampleHouseholds.forEach(h => {
        if (String(h.id || '').startsWith(prefix)) {
            const n = parseInt(h.id.slice(prefix.length), 10) || 0;
            if (n > maxSeq) maxSeq = n;
        }
    });
    interviewedSurveyCodes.forEach(code => {
        if (code.startsWith(prefix)) {
            const n = parseInt(code.slice(prefix.length), 10) || 0;
            if (n > maxSeq) maxSeq = n;
        }
    });

    const newId = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
    const codeEl = document.getElementById('surveyCodeInput');
    const headNameEl = document.getElementById('headNameInput');
    const headGenderEl = document.getElementById('headGenderSelect');
    const headBirthEl = document.getElementById('headBirthYearInput');
    const phoneEl = document.getElementById('phoneInput');
    const relSelEl = document.getElementById('respondentRelationSelect');
    if (codeEl) codeEl.value = newId;
    if (headNameEl) headNameEl.value = '';
    if (headGenderEl) headGenderEl.value = '';
    if (headBirthEl) headBirthEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (relSelEl) relSelEl.value = 'Chủ hộ';
    syncRespondentFromHead();

    currentDraftAnswers['A01'] = newId;
    currentDraftAnswers['A04'] = hamVal;
    const a03Q = (allQuestionsData[currentTool]?.questions || []).find(q => q.code === 'A03');
    if (a03Q && Array.isArray(a03Q.options)) {
        const matchOpt = a03Q.options.find(o => o.label.toLowerCase().includes(commVal.toLowerCase()));
        currentDraftAnswers['A03'] = matchOpt ? matchOpt.value : commVal;
    }

    const banner = document.getElementById('sampleSelectedBanner');
    if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `<i class="fa-solid fa-user-plus"></i> Đã cấp mã hộ mới (+1): <strong>[${escapeHtml(newId)}]</strong> (${escapeHtml(hamVal)}, ${escapeHtml(commVal)}) — <em>Mời nhập Tên Chủ hộ, Giới tính, Năm sinh &amp; SĐT.</em>`;
    }
    if (currentSection) renderQuestionsForSection(currentSection);
    saveDraftLocal(false);
    if (headNameEl) headNameEl.focus();
}

function tryAutofillBySurveyCode(val) {
    const clean = String(val || '').trim().toUpperCase();
    if (/^[A-Z]{2}-[A-Z0-9]{2,3}-\d{3}$/.test(clean)) {
        selectSampleHousehold(clean);
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

function renderTeamWeekSchedule() {
    const tbody = document.getElementById('teamWeekScheduleTbody');
    if (!tbody) return;

    const teamPlan = [
        {
            nvKey: 'Duy',
            code: 'TCN07',
            fullName: 'Lê Đình Duy',
            communes: 'Xã Ea Kiết',
            days: [
                'Buôn Ja Vầm (5–6 hộ)',
                'Buôn Ja Vầm (6 hộ)',
                'Buôn Ayun (6 hộ)',
                'Buôn Chơr (6 hộ)',
                'Buôn Chơr / Hộ mới (6 hộ)',
                'Thôn/Buôn + NT/CQ (4–6 hộ)',
                'Bù sót & Nhập phiếu (2–4 hộ)'
            ]
        },
        {
            nvKey: 'Vọng',
            code: 'TCN02',
            fullName: 'Phan Doãn Vọng',
            communes: 'Xã Ea Kiết',
            days: [
                'Cụm Ea Kiết A (5–6 hộ)',
                'Cụm Ea Kiết A (6 hộ)',
                'Cụm Ea Kiết B (6 hộ)',
                'Cụm Ea Kiết B (6 hộ)',
                'Hộ bổ sung (+1) (6 hộ)',
                'Hỗ trợ chéo + HTX/NT (4–6 hộ)',
                'Rà soát ảnh & Đồng bộ VPS'
            ]
        },
        {
            nvKey: 'Thao',
            code: 'TCN03',
            fullName: 'Phạm Văn Thao',
            communes: "Ea Tul & Cư Dliê M'nông",
            days: [
                "Cư Dliê M'nông (5 hộ)",
                "Cư Dliê M'nông + NT (4–6 hộ)",
                'Ea Tul — Cụm 1 (6 hộ)',
                'Ea Tul — Cụm 1 (6 hộ)',
                'Ea Tul — Cụm 2 (6 hộ)',
                'Hỗ trợ chéo + HTX/CQ (5 hộ)',
                'Rà soát ảnh & Đồng bộ VPS'
            ]
        },
        {
            nvKey: 'Trụ',
            code: 'TCN04',
            fullName: 'Nguyễn Viết Trụ',
            communes: 'Xã Ea Tul',
            days: [
                'Ea Tul — Dẫn đường 1 (6 hộ)',
                'Ea Tul — Dẫn đường 1 (6 hộ)',
                'Ea Tul — Dẫn đường 2 (6 hộ)',
                'Ea Tul — Dẫn đường 3 (6 hộ)',
                'Ea Tul — Dẫn đường 4 (6 hộ)',
                'Hộ bổ sung / CQ-NT (5 hộ)',
                'Kiểm tra chéo & Hoàn thiện'
            ]
        },
        {
            nvKey: 'Phuc',
            code: 'TCN05',
            fullName: 'Cao Thị Phúc',
            communes: 'Xã Ea Tul',
            days: [
                'Ea Tul — Cụm Phúc 1 (6 hộ)',
                'Ea Tul — Cụm Phúc 2 (6 hộ)',
                'Ea Tul — Cụm Phúc 3 (6 hộ)',
                'Ea Tul — Cụm Phúc 4 (6 hộ)',
                'Ea Tul — Cụm Phúc 5 (6 hộ)',
                'Hỗ trợ chéo + MH/NT (5 hộ)',
                'Kiểm tra chéo & Hoàn thiện'
            ]
        },
        {
            nvKey: 'Sinh',
            code: 'TCN06',
            fullName: 'Hoàng Trường Sinh',
            communes: 'Xã Ea Tul',
            days: [
                'Ea Tul — Cụm Sinh 1 (6 hộ)',
                'Ea Tul — Cụm Sinh 2 (6 hộ)',
                'Ea Tul — Cụm Sinh 3 (6 hộ)',
                'Ea Tul — Cụm Sinh 4 (6 hộ)',
                'Ea Tul — Cụm Sinh 5 (6 hộ)',
                'Hộ bổ sung (+1) & HTX (5 hộ)',
                'Kiểm tra chéo & Hoàn thiện'
            ]
        }
    ];

    tbody.innerHTML = teamPlan.map(m => {
        const assignedRows = sampleHouseholds.filter(h => matchesInterviewer(h, m.nvKey));
        const guides = Array.from(new Set(assignedRows.map(h => h.guide).filter(Boolean)));
        const doneCnt = assignedRows.filter(h => interviewedSurveyCodes.has(String(h.id || '').toUpperCase())).length;
        const lockCnt = assignedRows.filter(h => {
            const code = String(h.id || '').toUpperCase();
            if (interviewedSurveyCodes.has(code)) return false;
            const lk = getHouseholdLockInfo(code);
            return Boolean(lk && lk.has_photo);
        }).length;
        const total = assignedRows.length || 36;
        const remain = Math.max(0, total - doneCnt);
        const guideHtml = guides.length
            ? guides.slice(0, 4).map(g => escapeHtml(g)).join(', ') + (guides.length > 4 ? ` (+${guides.length - 4})` : '')
            : 'Theo phân công thực địa';

        return `
            <tr>
                <td style="white-space: nowrap;">
                    <strong style="color: var(--navy);">${escapeHtml(m.fullName)}</strong><br>
                    <span style="font-family: monospace; font-size: 0.76rem; background: #e0e7ff; color: #3730a3; padding: 1px 6px; border-radius: 3px; font-weight: 700;">${m.code}</span>
                </td>
                <td style="font-size: 0.78rem; min-width: 170px;">
                    <strong style="color: #15803d;">${escapeHtml(m.communes)}</strong> (${guides.length} dẫn đường)<br>
                    <span style="color: #64748b;">${guideHtml}</span>
                </td>
                ${m.days.map(d => `<td style="font-size: 0.74rem; text-align: center; color: #334155;">${escapeHtml(d)}</td>`).join('')}
                <td style="text-align: center; white-space: nowrap; font-size: 0.78rem;">
                    <div><strong style="color: #15803d;">${doneCnt}/${total}</strong> đã nộp</div>
                    ${lockCnt ? `<div style="color: #0f766e; font-weight: 600;">📸 ${lockCnt} giữ ảnh</div>` : ''}
                    <div style="color: #64748b;">Còn ${remain} hộ</div>
                </td>
            </tr>
        `;
    }).join('');
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
async function selectTool(toolCode, options = {}) {
    currentTool = toolCode;
    editingSurveyId = null;
    currentDraftPhotoPath = '';
    const submitBtn = document.getElementById('btnSubmitForm');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> LƯU VÀ HOÀN THÀNH PHIẾU';

    document.querySelectorAll('.tool-tab').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`toolBtn-${toolCode}`);
    if (activeBtn) activeBtn.classList.add('active');

    let toolObj = allQuestionsData[toolCode];
    if (!toolObj) {
        const qBox = document.getElementById('surveyQuestionsBox');
        if (qBox) {
            qBox.innerHTML = '<div style="text-align: center; padding: 28px; color: var(--slate-500);"><i class="fa-solid fa-spinner fa-spin fa-lg"></i><p style="margin-top: 8px; font-size: 0.86rem;">Đang tải danh mục câu hỏi...</p></div>';
        }
        await loadQuestions(true);
        toolObj = allQuestionsData[toolCode];
    }
    if (!toolObj) {
        const qBox = document.getElementById('surveyQuestionsBox');
        if (qBox) {
            qBox.innerHTML = `<div style="margin: 12px 16px; padding: 18px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; text-align: center; font-size: 0.86rem;">
                <div style="font-weight: 700; margin-bottom: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Không thể tải bộ câu hỏi ${escapeHtml(toolCode)}</div>
                <div style="margin-bottom: 10px; color: #7f1d1d;">Vui lòng kiểm tra kết nối mạng và thử tải lại.</div>
                <button type="button" class="qgis-btn-primary" onclick="selectTool('${escapeQuotes(toolCode)}')" style="background:#0f2a4a;">
                    <i class="fa-solid fa-rotate"></i> Tải lại câu hỏi
                </button>
            </div>`;
        }
        return;
    }

    const heading = document.getElementById('currentToolHeading');
    if (heading) {
        heading.textContent = `CÔNG CỤ: ${toolObj.tool_code} — ${toolObj.tool_name.toUpperCase()} (${toolObj.target_count || ''})`;
    }
    const subTitle = document.getElementById('subviewTitleText');
    if (subTitle && currentMainView === 'survey') {
        subTitle.textContent = `Tạo phiếu: ${toolObj.tool_code} — ${toolObj.tool_name}`;
    }

    const isP1 = (toolCode === 'P1');
    const pickerBox = document.getElementById('samplePickerContainer');
    const headRow = document.getElementById('headDemographicsRow');
    if (pickerBox) pickerBox.style.display = isP1 ? 'block' : 'none';
    if (headRow) headRow.style.display = isP1 ? 'grid' : 'none';

    const applyDemographicFields = (ans = {}, respName = '') => {
        applySharedDemographicsToForm(ans, respName, toolCode);
    };

    // Khôi phục bản nháp gần nhất của công cụ nếu đúng chủ tài khoản (bỏ qua khi đang mở phiếu đã hoàn thành để sửa/bổ sung)
    const draftKey = `dakman_draft_${toolCode}`;
    const savedDraft = options?.skipDraftRestore ? null : localStorage.getItem(draftKey);
    if (savedDraft) {
        try {
            const parsed = JSON.parse(savedDraft);
            if (!isDraftStrictlyOwnedByCurrentUser(parsed)) {
                throw new Error('Draft belongs to another user');
            }
            currentDraftAnswers = parsed.answers || {};
            currentDraftPhotoPath = parsed.photo_path || '';
            if (parsed.survey_code) document.getElementById('surveyCodeInput').value = parsed.survey_code;
            if (parsed.commune) document.getElementById('communeSelect').value = parsed.commune;
            if (parsed.hamlet) document.getElementById('hamletInput').value = parsed.hamlet;
            if (parsed.phone && document.getElementById('phoneInput')) document.getElementById('phoneInput').value = parsed.phone;
            if (parsed.guide && document.getElementById('guideNameInput')) document.getElementById('guideNameInput').value = parsed.guide;
            if (parsed.gps) document.getElementById('gpsInput').value = parsed.gps;
            applyDemographicFields(currentDraftAnswers, parsed.respondent_name || '');
            if (parsed.photo_data) {
                setHouseholdPhotoPreview(parsed.photo_data, parsed.photo_meta || 'Đã khôi phục ảnh nháp có watermark');
            } else if (parsed.photo_path) {
                setHouseholdPhotoPreview(apiUrl(`/api/photos/${parsed.photo_path}`), parsed.photo_meta || 'Ảnh nháp đã lưu trên VPS');
                currentHouseholdPhotoData = '';
            } else {
                clearHouseholdPhoto(true);
                if (parsed.survey_code) {
                    const expectedKey = `${toolCode}::${parsed.survey_code}`;
                    getIdbDrafts().then(idbList => {
                        const match = (idbList || []).find(d => d.draft_key === expectedKey);
                        if (match && !currentHouseholdPhotoData && !currentDraftPhotoPath && currentTool === toolCode) {
                            if (match.photo_data) {
                                setHouseholdPhotoPreview(match.photo_data, match.photo_meta || 'Đã khôi phục ảnh nháp trên thiết bị');
                            } else if (match.photo_path) {
                                currentDraftPhotoPath = match.photo_path;
                                setHouseholdPhotoPreview(apiUrl(`/api/photos/${match.photo_path}`), match.photo_meta || 'Ảnh nháp đã lưu trên VPS');
                            }
                        }
                    }).catch(() => {});
                }
            }
            updateDraftTimeDisplay(parsed.saved_at);
        } catch (e) {
            currentDraftAnswers = {};
            currentDraftPhotoPath = '';
            clearHouseholdPhoto(true);
            applyDemographicFields({}, '');
        }
    } else {
        currentDraftAnswers = {};
        currentDraftPhotoPath = '';
        const todayNum = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        document.getElementById('surveyCodeInput').value = `${toolCode}_${currentUser?.surveyor_id || 'DTV'}_${todayNum}_01`;
        document.getElementById('hamletInput').value = '';
        if (document.getElementById('phoneInput')) document.getElementById('phoneInput').value = '';
        if (document.getElementById('guideNameInput')) document.getElementById('guideNameInput').value = '';
        document.getElementById('gpsInput').value = '';
        clearHouseholdPhoto(true);
        applyDemographicFields({}, '');
        updateDraftTimeDisplay(null);
    }

    const questions = toolObj.questions || [];
    const sections = [];
    questions.forEach(q => {
        const s = q.section || 'Thông tin chung';
        if (!sections.includes(s)) sections.push(s);
    });

    renderSectionJumpNav(sections);
    currentSection = sections.length > 1 ? '__ALL__' : (sections[0] || null);
    renderQuestionsForSection(currentSection);
    updateSectionStepButtons(sections);
    updateAnsweredSummaryBadge();
    updatePhotoLockState();
    updateGpsLockState(hasValidGpsText(document.getElementById('gpsInput')?.value));
    startBackgroundGpsTracker();
    if (currentHouseholdPhotoData) {
        startRealtimeInterviewClock();
    } else {
        stopRealtimeInterviewClock();
    }
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

    const allBtn = `
        <button type="button"
                class="jump-btn active"
                id="jumpBtn-ALL"
                data-section="__ALL__"
                onclick="selectSection('__ALL__', 'ALL')">
            Tất cả câu hỏi
        </button>
    `;

    nav.innerHTML = allBtn + sections.map((sec, idx) => `
        <button type="button" 
                class="jump-btn" 
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

    if (list.length <= 1 || !currentSection || currentSection === '__ALL__') {
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
    if (!currentSection || currentSection === '__ALL__') {
        selectSection(list[0], 0);
        return;
    }
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
    if (currentSection !== '__ALL__' && secIdx >= 0 && currentSection !== secName) {
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

    const showAll = (!secName || secName === '__ALL__');
    let questions = toolObj.questions || [];
    if (!showAll) {
        questions = questions.filter(q => (q.section || 'Thông tin chung') === secName);
    }

    if (questions.length === 0) {
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--slate-500);">Chưa có câu hỏi cho phần này.</div>';
        return;
    }

    const isViewer = (currentUser?.role === 'viewer');
    let lastSectionRendered = '';

    container.innerHTML = questions.map((q, idx) => {
        const qSec = q.section || 'Thông tin chung';
        let sectionBannerHtml = '';
        if (showAll && qSec !== lastSectionRendered) {
            lastSectionRendered = qSec;
            sectionBannerHtml = `<div class="section-divider-banner"><span>${escapeHtml(qSec)}</span></div>`;
        }
        const code = q.code;
        if (code === 'A05' && !currentDraftAnswers['A05']) {
            const topGps = document.getElementById('gpsInput')?.value?.trim();
            if (topGps) currentDraftAnswers['A05'] = topGps;
        }
        if (code === 'A07' && !currentDraftAnswers['A07']) {
            const topSurveyor = document.getElementById('surveyorIdInput')?.value?.trim() || currentUser?.surveyor_id;
            if (topSurveyor) currentDraftAnswers['A07'] = topSurveyor;
        }
        const dynMeta = getDynamicQuestionTextAndUnit(q);
        const qDisplayText = dynMeta.text;
        const qDisplayUnit = dynMeta.unit;
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
                        ${q.options.map(opt => {
                            const sameVal = String(opt.value).trim() === String(opt.label).trim();
                            return `
                            <option value="${escapeHtml(opt.value)}" ${val === opt.value ? 'selected' : ''}>
                                ${sameVal ? escapeHtml(opt.label) : `${escapeHtml(opt.value)}. ${escapeHtml(opt.label)}`}
                            </option>
                        `;
                        }).join('')}
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
                        const sameVal = String(opt.value).trim() === String(opt.label).trim();
                        return `
                            <label class="radio-label ${isChecked ? 'selected' : ''}">
                                <input type="${isMulti ? 'checkbox' : 'radio'}" 
                                       name="q_${code}" 
                                       value="${opt.value}" 
                                       ${isChecked ? 'checked' : ''}
                                       ${isViewer ? 'disabled' : ''}
                                       onchange="onAnswerChange('${code}', this, ${isMulti})">
                                <span>${sameVal ? escapeHtml(opt.label) : `<strong>${escapeHtml(opt.value)}</strong>. ${escapeHtml(opt.label)}`}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
                ${(() => {
                    const showFollowUp = q.follow_up_on && (isMulti
                        ? (Array.isArray(val) && val.includes(q.follow_up_on))
                        : (String(val || '') === String(q.follow_up_on)));
                    const noteVal = currentDraftAnswers[code + '_note'] || '';
                    const noteLabel = showFollowUp
                        ? 'Ghi rõ phương án khác / chi tiết:'
                        : 'Ghi chú / Bổ sung phương án khác (nếu có):';
                    const boxStyle = showFollowUp
                        ? 'margin-top: 8px; padding: 8px 10px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px;'
                        : 'margin-top: 8px;';
                    const structuredNoteHtml = renderStructuredFieldsHtml(q, 'note', isViewer);
                    return `
                        <div id="followUp_${code}" data-follow-on="${escapeHtml(q.follow_up_on || '')}" style="${boxStyle}">
                            <div id="followUpLabel_${code}" style="font-size: 0.78rem; font-weight: 600; color: ${showFollowUp ? '#92400e' : '#64748b'}; margin-bottom: 4px;">
                                <i class="fa-solid fa-pen-nib"></i> ${noteLabel}
                            </div>
                            ${structuredNoteHtml}
                            <textarea id="followUpNote_${code}" class="form-control"
                                      rows="2"
                                      ${isViewer ? 'disabled' : ''}
                                      placeholder="${escapeHtml(q.follow_up_placeholder || 'Nhập bổ sung thêm hoặc ghi rõ phương án khác (nếu có)...')}"
                                      oninput="onFollowUpChange('${code}', this.value)">${escapeHtml(noteVal)}</textarea>
                        </div>
                    `;
                })()}
                ${q.per_option_details ? `<div id="optionDetails_${code}" style="margin-top: 10px;">${renderOptionDetailsHtml(q, val, isViewer)}</div>` : ''}
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
                    ${qDisplayUnit ? `<span class="q-unit" style="font-weight:700; color:#475569; white-space:nowrap;">${escapeHtml(qDisplayUnit)}</span>` : ''}
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
            const rawHint = String(q.options_raw || '');
            const spec = getStructuredSpec(code, 'answer');
            const parsedChips = [];
            if (rawHint.includes('☐')) {
                rawHint.split('☐').slice(1).forEach(s => {
                    const cut = s.split(/[\n\r.]/)[0].trim().replace(/:\s*_+$/, '').trim();
                    if (cut) parsedChips.push(cut);
                });
            }
            const specChips = Array.isArray(spec?.chips) ? spec.chips : [];
            const allChips = Array.from(new Set([...specChips, ...parsedChips]));
            let chipHtml = '';
            if (allChips.length > 0) {
                chipHtml = `
                    <div id="txChips_${code}" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                        ${allChips.map(ch => {
                            const active = isTxChipSelected(val, ch);
                            return `
                            <button type="button"
                                    data-chip-for="${escapeHtml(code)}"
                                    data-chip-label="${escapeHtml(ch)}"
                                    ${isViewer ? 'disabled' : ''}
                                    onclick="onTxChipClick('${escapeQuotes(code)}', '${escapeQuotes(ch)}')"
                                    style="${getTxChipStyle(active)}">
                                <i class="${active ? 'fa-solid' : 'fa-regular'} fa-square-check" style="color: ${active ? '#ffffff' : '#15803d'};"></i> ${escapeHtml(ch)}
                            </button>
                        `;
                        }).join('')}
                    </div>
                `;
            }
            const structuredHtml = renderStructuredFieldsHtml(q, 'answer', isViewer);
            inputHtml = `
                <div style="margin-top: 8px;">
                    ${chipHtml}
                    ${structuredHtml}
                    <textarea id="txInput_${code}" class="form-control" 
                              rows="2" 
                              ${isViewer ? 'disabled' : ''}
                              oninput="onAnswerChange('${code}', this, false)" 
                              placeholder="${structuredHtml ? 'Tổng hợp tự động từ các ô trên (hoặc ghi chú bổ sung thêm)...' : 'Ghi chép câu trả lời của đối tượng...'}">${escapeHtml(val)}</textarea>
                </div>
            `;
        }

        const isAdminUser = (currentUser?.role === 'admin');
        const adminActionsHtml = isAdminUser ? `
            <span style="display:inline-flex; gap:4px; flex-shrink:0; margin-left:auto;">
                <button type="button" onclick="inlineEditQuestion('${escapeQuotes(code)}')"
                        title="Sửa câu hỏi này"
                        style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:0.74rem; font-weight:600;">
                    <i class="fa-solid fa-pen"></i> Sửa
                </button>
                <button type="button" onclick="inlineDeleteQuestion('${escapeQuotes(code)}')"
                        title="Xóa câu hỏi này"
                        style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:2px 7px; border-radius:3px; cursor:pointer; font-size:0.74rem; font-weight:600;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </span>
        ` : '';

        const displayHint = formatQuestionHintText(q);

        return `
            ${sectionBannerHtml}
            <div class="question-card" id="qCard_${code}" data-code="${code}" data-condition="${escapeQuotes(q.condition || '')}">
                <div class="q-header">
                    <span class="q-code">${code}</span>
                    <span class="q-text">${qDisplayText}</span>
                    ${adminActionsHtml}
                </div>
                ${q.condition ? `<div class="q-condition"><i class="fa-solid fa-code-branch"></i> Điều kiện xuất hiện: ${q.condition}</div>` : ''}
                ${displayHint ? `<div style="font-size: 0.8rem; color: var(--slate-500); font-style: italic; margin-top: 4px;">${escapeHtml(displayHint)}</div>` : ''}
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
function matchesConditionValue(qCode, actualVal, expVal, toolCode = currentTool) {
    if (actualVal === undefined || actualVal === null || actualVal === '') return false;
    const checkOne = (v) => {
        const s = String(v).trim();
        if (s === expVal) return true;
        if (/^\d+$/.test(expVal)) {
            const qList = allQuestionsData[toolCode]?.questions || allQuestionsData[currentTool]?.questions || [];
            const refQ = qList.find(item => item.code === qCode);
            const opts = refQ?.options || [];
            if (opts.length === 2) {
                const labels = opts.map(o => String((o && typeof o === 'object') ? (o.value ?? o.label ?? '') : o).trim());
                if (labels.includes('Không') && labels.includes('Có')) {
                    if (expVal === '0') return s === 'Không';
                    if (expVal === '1') return s === 'Có';
                    return false;
                }
            }
            const idx = parseInt(expVal, 10) - 1;
            const optObj = (idx >= 0 && idx < opts.length) ? opts[idx] : null;
            const optVal = (optObj && typeof optObj === 'object') ? String(optObj.value ?? optObj.label ?? '').trim() : String(optObj ?? '').trim();
            if (optObj !== null && s === optVal) {
                return true;
            }
        }
        return false;
    };
    if (Array.isArray(actualVal)) return actualVal.some(checkOne);
    return checkOne(actualVal);
}

function splitTopLevelLogical(expr, keyword) {
    const parts = [];
    const lower = expr.toLowerCase();
    const target = ` ${keyword} `;
    let depth = 0;
    let last = 0;
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (ch === '(') depth++;
        else if (ch === ')' && depth > 0) depth--;
        else if (depth === 0 && lower.startsWith(target, i)) {
            parts.push(expr.slice(last, i).trim());
            last = i + target.length;
            i = last - 1;
        }
    }
    if (last > 0) {
        parts.push(expr.slice(last).trim());
        return parts.filter(Boolean);
    }
    return null;
}

function stripOuterParens(expr) {
    let s = expr.trim();
    while (s.startsWith('(') && s.endsWith(')')) {
        let depth = 0;
        let wrapsAll = true;
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '(') depth++;
            else if (s[i] === ')') depth--;
            if (depth === 0 && i < s.length - 1) {
                wrapsAll = false;
                break;
            }
        }
        if (!wrapsAll) break;
        s = s.slice(1, -1).trim();
    }
    return s;
}

function checkConditionMet(condStr, answers, toolCode = currentTool) {
    if (!condStr || !condStr.trim()) return true;
    const cond = stripOuterParens(condStr.trim());
    if (!cond) return true;

    // 1. Kiểm tra điều kiện loại trừ Hộ Panel PPI:
    if (cond.includes('không thuộc panel') || cond.includes('A02 = 2, 3, 4') || cond.includes('A02=2,3,4')) {
        const a02 = String(answers['A02'] || '').trim();
        return ['2', '3', '4'].includes(a02);
    }

    // 2. Logic OR ở cấp ngoài ngoặc (precedence thấp hơn AND)
    const orParts = splitTopLevelLogical(cond, 'or');
    if (orParts && orParts.length > 1) {
        return orParts.some(p => checkConditionMet(p, answers, toolCode));
    }

    // 3. Logic AND ở cấp ngoài ngoặc
    const andParts = splitTopLevelLogical(cond, 'and');
    if (andParts && andParts.length > 1) {
        return andParts.every(p => checkConditionMet(p, answers, toolCode));
    }

    // 4. Không bằng (!= hoặc ≠)
    const ineqMatch = cond.match(/^([A-Za-z0-9_]+)\s*(!=|≠)\s*['"]?([^'"]+)['"]?$/);
    if (ineqMatch) {
        const qCode = ineqMatch[1];
        const expVal = ineqMatch[3].trim();
        const actualVal = answers[qCode];
        if (actualVal === undefined || actualVal === null || actualVal === '' || (Array.isArray(actualVal) && actualVal.length === 0)) return false;
        return !matchesConditionValue(qCode, actualVal, expVal, toolCode);
    }

    // 5. Bằng (=)
    const eqMatch = cond.match(/^([A-Za-z0-9_]+)\s*=\s*['"]?([^'"]+)['"]?$/);
    if (eqMatch) {
        const qCode = eqMatch[1];
        const expVal = eqMatch[2].trim();
        return matchesConditionValue(qCode, answers[qCode], expVal, toolCode);
    }

    // 6. selected(Q, 'val') hoặc Q có val
    const selMatch = cond.match(/(?:selected\()?([A-Za-z0-9_]+)(?:,\s*['"]?([^'")]+)['"]?\))?(?:\s+có\s+['"]?([^'"]+)['"]?)?/);
    if (selMatch && (selMatch[2] || selMatch[3])) {
        const qCode = selMatch[1];
        const expVal = (selMatch[2] || selMatch[3]).trim();
        return matchesConditionValue(qCode, answers[qCode], expVal, toolCode);
    }

    return true;
}

/**
 * Quét toàn bộ câu hỏi và ẩn/hiện động theo câu trả lời hiện tại
 */
function getDynamicQuestionTextAndUnit(q) {
    if (q.code === 'CT07') {
        const raw = currentDraftAnswers['CT03'];
        const arr = Array.isArray(raw) ? raw : (raw ? [String(raw)] : []);
        const hasGraft = arr.some(v => v.includes('Ghép chồi'));
        const hasPlant = arr.some(v => v && !v.includes('Ghép chồi'));
        if (hasGraft && !hasPlant) {
            return { text: 'Tổng số chồi thực hiện?', unit: 'chồi' };
        }
        if (hasPlant && !hasGraft) {
            return { text: 'Tổng số cây thực hiện?', unit: 'cây' };
        }
        return { text: 'Tổng số cây/chồi thực hiện?', unit: 'cây/chồi' };
    }
    return { text: q.text, unit: q.unit || '' };
}

function pruneHiddenAnswers() {
    const qList = allQuestionsData[currentTool]?.questions || [];
    let changed = false;
    for (let pass = 0; pass < 5; pass++) {
        let passChanged = false;
        qList.forEach(q => {
            if (!q.condition) return;
            if (!checkConditionMet(q.condition, currentDraftAnswers)) {
                const c = q.code;
                if (currentDraftAnswers[c] !== undefined) {
                    delete currentDraftAnswers[c];
                    passChanged = true;
                }
                if (currentDraftAnswers[c + '_note'] !== undefined) {
                    delete currentDraftAnswers[c + '_note'];
                    passChanged = true;
                }
                if (currentDraftAnswers[c + '_details'] !== undefined) {
                    delete currentDraftAnswers[c + '_details'];
                    passChanged = true;
                }
            }
        });
        if (passChanged) changed = true;
        else break;
    }
    return changed;
}

function evaluateQuestionConditions() {
    const cards = document.querySelectorAll('.question-card');
    let hasChanges = pruneHiddenAnswers();

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
                if (currentDraftAnswers[code + '_note'] !== undefined) {
                    delete currentDraftAnswers[code + '_note'];
                    hasChanges = true;
                }
                if (currentDraftAnswers[code + '_details'] !== undefined) {
                    delete currentDraftAnswers[code + '_details'];
                    hasChanges = true;
                }
                card.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
                    inp.checked = false;
                    if (inp.parentElement) inp.parentElement.classList.remove('selected');
                });
                card.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"], textarea, select').forEach(inp => {
                    inp.value = '';
                });
                card.querySelectorAll('.likert-btn.active').forEach(btn => btn.classList.remove('active'));
                const fuBox = document.getElementById(`followUp_${code}`);
                if (fuBox) fuBox.style.display = 'none';
                const detBox = document.getElementById(`optionDetails_${code}`);
                if (detBox) detBox.innerHTML = '';
            }
        }
    });

    const ct07Card = document.getElementById('qCard_CT07');
    if (ct07Card) {
        const dyn = getDynamicQuestionTextAndUnit({ code: 'CT07', text: 'Tổng số cây/chồi thực hiện?', unit: 'cây/chồi' });
        const tEl = ct07Card.querySelector('.q-text');
        const uEl = ct07Card.querySelector('.q-unit');
        if (tEl) tEl.textContent = dyn.text;
        if (uEl) uEl.textContent = dyn.unit;
    }

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
    evaluateQuestionConditions();
    saveDraftLocal(false);
    updateAnsweredSummaryBadge();
}

const EXCLUSIVE_NEG_OPTIONS = new Set([
    'Không trồng xen', 'Không nhận hỗ trợ', 'Không tham gia', 'Không sử dụng',
    'Không còn áp dụng', 'Không bón', 'Không', 'Không nhớ', 'Không rõ',
    'Không biết/chưa từng được vẽ', 'Không rõ tên tiêu chuẩn/chứng nhận'
]);

const STRUCTURED_FIELD_SPECS = {
    A03: {
        target: 'answer',
        fields: [
            { key: 'total_ha', label: 'Tổng diện tích cà phê', unit: 'ha', type: 'number', placeholder: 'VD: 1.5' },
            { key: 'harvest_ha', label: 'Diện tích đang cho thu hoạch', unit: 'ha', type: 'number', placeholder: 'VD: 1.2' }
        ],
        chips: ['Không nhớ/không rõ']
    },
    B02: {
        target: 'answer',
        fields: [
            { key: 'sessions', label: 'Số buổi đã tham gia', unit: 'buổi', type: 'number', placeholder: 'VD: 3' },
            { key: 'recent_year', label: 'Năm tham gia gần nhất', unit: '', type: 'number', placeholder: 'VD: 2024' }
        ],
        chips: ['Không nhớ', 'Ước tính']
    },
    B07: {
        target: 'answer',
        fields: [
            { key: 'variety', label: 'Giống/loại cà phê', unit: '', type: 'text', placeholder: 'VD: TR4, Xanh lùn...' },
            { key: 'qty', label: 'Số lượng', unit: 'cây', type: 'number', placeholder: 'VD: 200' },
            { key: 'time', label: 'Thời điểm nhận', unit: '', type: 'text', placeholder: 'VD: Tháng 6/2023' }
        ],
        chips: ['Không nhớ']
    },
    B08: {
        target: 'answer',
        rows: [
            { key: 'sp1', label: 'Loài 1', cols: [{ sub: 'name', label: 'Tên loài cây', placeholder: 'VD: Muồng đen' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 'sp2', label: 'Loài 2', cols: [{ sub: 'name', label: 'Tên loài cây', placeholder: 'VD: Sầu riêng' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 'sp3', label: 'Loài 3', cols: [{ sub: 'name', label: 'Tên loài cây', placeholder: 'Tên loài cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 'sp4', label: 'Loài 4', cols: [{ sub: 'name', label: 'Tên loài cây', placeholder: 'Tên loài cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 'sp5', label: 'Loài 5', cols: [{ sub: 'name', label: 'Tên loài cây', placeholder: 'Tên loài cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 'sp6', label: 'Loài 6', cols: [{ sub: 'name', label: 'Tên loài cây', placeholder: 'Tên loài cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] }
        ],
        fields: [
            { key: 'time', label: 'Thời điểm nhận', unit: '', type: 'text', placeholder: 'VD: Năm 2023' }
        ],
        chips: ['Không nhớ']
    },
    B09: {
        target: 'note',
        fields: [
            { key: 'alive_trees', label: 'Số cây còn sống ước tính', unit: 'cây', type: 'number', placeholder: 'Nhập số cây...' }
        ]
    },
    C05: {
        target: 'answer',
        fields: [
            { key: 'manure', label: 'Phân chuồng / tự ủ', unit: 'kg hoặc tấn', type: 'text', placeholder: 'VD: 5 tấn' },
            { key: 'org_bought', label: 'Phân hữu cơ mua ngoài', unit: 'kg hoặc bao', type: 'text', placeholder: 'VD: 20 bao' },
            { key: 'org_bag_kg', label: 'Quy cách bao (nếu tính bao)', unit: 'kg/bao', type: 'number', placeholder: 'VD: 50' },
            { key: 'bio', label: 'Phân vi sinh', unit: 'kg hoặc lít', type: 'text', placeholder: 'VD: 10 kg' }
        ],
        chips: ['Không nhớ', 'Ước tính']
    },
    C06: {
        target: 'answer',
        fields: [
            { key: 'npk_bags', label: 'NPK', unit: 'bao', type: 'number', placeholder: 'Số bao' },
            { key: 'npk_kg', label: 'Quy cách bao NPK', unit: 'kg/bao', type: 'number', placeholder: 'VD: 50' },
            { key: 'ure_bags', label: 'Urê', unit: 'bao', type: 'number', placeholder: 'Số bao' },
            { key: 'dap_bags', label: 'DAP', unit: 'bao', type: 'number', placeholder: 'Số bao' },
            { key: 'kali_bags', label: 'Kali', unit: 'bao', type: 'number', placeholder: 'Số bao' },
            { key: 'other_name', label: 'Loại phân khác', unit: '', type: 'text', placeholder: 'Tên loại phân...' },
            { key: 'other_qty', label: 'Lượng loại khác', unit: 'kg/bao/tấn', type: 'text', placeholder: 'VD: 100 kg' },
            { key: 'times', label: 'Số lần bón/năm', unit: 'lần', type: 'number', placeholder: 'VD: 3' }
        ],
        chips: ['Ước tính', 'Không bón phân hóa học', 'Không nhớ']
    },
    C11: {
        target: 'answer',
        fields: [
            { key: 'insecticide', label: 'Thuốc sâu', unit: 'lần', type: 'number', placeholder: 'Số lần' },
            { key: 'fungicide', label: 'Thuốc bệnh', unit: 'lần', type: 'number', placeholder: 'Số lần' },
            { key: 'herbicide', label: 'Thuốc diệt cỏ', unit: 'lần', type: 'number', placeholder: 'Số lần' }
        ],
        chips: ['Không phun thuốc', 'Không nhớ']
    },
    C12: {
        target: 'note',
        fields: [
            { key: 'work_days', label: 'Số ngày công thuê', unit: 'ngày', type: 'number', placeholder: 'VD: 15' },
            { key: 'total_wage', label: 'Tổng tiền công đã trả khoảng', unit: 'đồng', type: 'number', placeholder: 'VD: 4500000' }
        ]
    },
    C14: {
        target: 'answer',
        rows: [
            { key: 't1', label: 'Cây 1', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'VD: Sầu riêng' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 't2', label: 'Cây 2', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'VD: Bơ' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 't3', label: 'Cây 3', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'Tên cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 't4', label: 'Cây 4', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'Tên cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 't5', label: 'Cây 5', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'Tên cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] },
            { key: 't6', label: 'Cây 6', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'Tên cây' }, { sub: 'qty', label: 'Số cây', type: 'number', unit: 'cây' }] }
        ],
        chips: ['Thường xuyên', 'Thỉnh thoảng', 'Không']
    },
    C19: {
        target: 'answer',
        fields: [
            { key: 'hours_per_time', label: 'Số giờ mỗi lần tưới', unit: 'giờ', type: 'number', placeholder: 'VD: 8' },
            { key: 'times_dry', label: 'Số lần tưới mùa khô vừa qua', unit: 'lần', type: 'number', placeholder: 'VD: 3' },
            { key: 'm3_per_time', label: 'Lượng nước (nếu có đồng hồ/ước lượng)', unit: 'm³/lần', type: 'number', placeholder: 'VD: 30' }
        ],
        chips: ['Không đo/không nhớ']
    },
    D02: {
        target: 'answer',
        fields: [
            { key: 'y24_25', label: 'Vụ 2024–2025', unit: 'tấn nhân', type: 'number', placeholder: 'VD: 3.5' },
            { key: 'y25_26', label: 'Vụ 2025–2026 (dự kiến)', unit: 'tấn nhân', type: 'number', placeholder: 'VD: 3.8' },
            { key: 'fresh_dry_note', label: 'Nếu chỉ nhớ tươi/quả khô (ghi rõ dạng & số lượng)', unit: '', type: 'text', placeholder: 'VD: 15 tấn tươi' }
        ],
        chips: ['Không nhớ/không rõ']
    },
    D04: {
        target: 'answer',
        fields: [
            { key: 'price_kg', label: 'Giá bán bình quân', unit: 'đồng/kg cà phê nhân', type: 'number', placeholder: 'VD: 115000' }
        ],
        chips: ['Không bán cà phê nhân/không rõ giá']
    },
    D06: {
        target: 'answer',
        rows: [
            { key: 'c1', label: 'Cây 1', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'VD: Sầu riêng' }, { sub: 'qty', label: 'Sản lượng', type: 'number', placeholder: 'Số lượng' }, { sub: 'unit', label: 'Đơn vị', placeholder: 'kg / tấn' }, { sub: 'money', label: 'Số tiền (đồng)', type: 'number', placeholder: 'VD: 50000000' }] },
            { key: 'c2', label: 'Cây 2', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'VD: Tiêu' }, { sub: 'qty', label: 'Sản lượng', type: 'number', placeholder: 'Số lượng' }, { sub: 'unit', label: 'Đơn vị', placeholder: 'kg / tấn' }, { sub: 'money', label: 'Số tiền (đồng)', type: 'number', placeholder: 'VD: 15000000' }] },
            { key: 'c3', label: 'Cây 3', cols: [{ sub: 'name', label: 'Tên cây', placeholder: 'Tên cây khác' }, { sub: 'qty', label: 'Sản lượng', type: 'number', placeholder: 'Số lượng' }, { sub: 'unit', label: 'Đơn vị', placeholder: 'kg / tấn' }, { sub: 'money', label: 'Số tiền (đồng)', type: 'number', placeholder: 'Số tiền' }] }
        ],
        chips: ['Không có thu nhập từ cây trồng xen', 'Không nhớ']
    },
    D07: {
        target: 'answer',
        fields: [
            { key: 'fertilizer', label: '1. Phân bón', unit: 'đồng', type: 'number', placeholder: 'VD: 25000000' },
            { key: 'pesticide', label: '2. Thuốc BVTV / thuốc cỏ', unit: 'đồng', type: 'number', placeholder: 'VD: 3000000' },
            { key: 'irrigation', label: '3. Tưới nước / điện / dầu', unit: 'đồng', type: 'number', placeholder: 'VD: 4000000' },
            { key: 'care_labor', label: '4. Thuê nhân công chăm sóc', unit: 'đồng', type: 'number', placeholder: 'VD: 8000000' },
            { key: 'harvest_transport', label: '5. Thu hoạch & vận chuyển', unit: 'đồng', type: 'number', placeholder: 'VD: 12000000' },
            { key: 'other_cost', label: '6. Khoản chi khác', unit: 'đồng', type: 'number', placeholder: 'VD: 1000000' }
        ],
        chips: ['Không nhớ từng khoản']
    },
    D08: {
        target: 'note',
        fields: [
            { key: 'workers', label: 'Số người thuê', unit: 'người', type: 'number', placeholder: 'VD: 5' },
            { key: 'work_days', label: 'Số ngày công', unit: 'ngày', type: 'number', placeholder: 'VD: 20' },
            { key: 'total_wage', label: 'Tổng tiền công thu hoạch', unit: 'đồng', type: 'number', placeholder: 'VD: 10000000' }
        ]
    },
    F06: {
        target: 'note',
        useOptionDatalist: true,
        fields: [
            { key: 'p1', label: 'Ưu tiên số 1', unit: '', type: 'text', placeholder: 'Chọn hoặc nhập ưu tiên 1...' },
            { key: 'p2', label: 'Ưu tiên số 2', unit: '', type: 'text', placeholder: 'Chọn hoặc nhập ưu tiên 2...' },
            { key: 'p3', label: 'Ưu tiên số 3', unit: '', type: 'text', placeholder: 'Chọn hoặc nhập ưu tiên 3...' }
        ]
    }
};

function getStructuredSpec(code, targetType) {
    const spec = STRUCTURED_FIELD_SPECS[code];
    if (!spec) return null;
    if (targetType && spec.target !== targetType) return null;
    return spec;
}

function isTxChipSelected(curVal, chipLabel) {
    const cur = String(curVal || '').trim();
    if (!cur || !chipLabel) return false;
    return cur.split(/[;\n]+/).map(s => s.trim().toLowerCase()).includes(chipLabel.trim().toLowerCase()) ||
           cur.toLowerCase() === chipLabel.trim().toLowerCase();
}

function getTxChipStyle(active) {
    return active
        ? 'background: #15803d; color: #ffffff; border: 1.5px solid #166534; border-radius: 999px; padding: 4px 11px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;'
        : 'background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 999px; padding: 4px 11px; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;';
}

function formatQuestionHintText(q) {
    const raw = String(q.options_raw || '').trim();
    if (!raw || (q.options && q.options.length > 0)) return '';
    const spec = getStructuredSpec(q.code, 'answer');
    if (!spec) {
        return raw ? `Gợi ý: ${raw}` : '';
    }
    const cleanLines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => {
            if (!line) return false;
            if (/_{3,}/.test(line)) return false;
            if (/^☐/.test(line)) return false;
            return true;
        });
    const noteSentences = [];
    raw.split(/\r?\n/).forEach(line => {
        if (/_{3,}/.test(line)) {
            line.split(/(?<=\.)\s+/).forEach(sent => {
                const s = sent.trim();
                if (s && !/_{3,}/.test(s) && !s.includes('☐')) noteSentences.push(s);
            });
        }
    });
    const merged = Array.from(new Set([...noteSentences, ...cleanLines]));
    return merged.length ? merged.join(' ') : '';
}

function renderStructuredFieldsHtml(q, targetType, isViewer) {
    const code = q.code;
    const spec = getStructuredSpec(code, targetType);
    if (!spec) return '';
    const stateKey = targetType === 'note' ? `${code}_note_fields` : `${code}_fields`;
    const savedObj = (currentDraftAnswers[stateKey] && typeof currentDraftAnswers[stateKey] === 'object')
        ? currentDraftAnswers[stateKey]
        : {};
    const dlId = spec.useOptionDatalist ? `dl_${code}_opts` : '';
    const datalistHtml = (spec.useOptionDatalist && Array.isArray(q.options))
        ? `<datalist id="${dlId}">${q.options.map(o => `<option value="${escapeHtml(o.label)}">`).join('')}</datalist>`
        : '';

    let rowsHtml = '';
    if (Array.isArray(spec.rows) && spec.rows.length > 0) {
        rowsHtml = `
            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: ${spec.fields?.length ? '8px' : '0'};">
                ${spec.rows.map(r => `
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px;">
                        <span style="min-width: 52px; font-weight: 700; font-size: 0.78rem; color: #002060;">${escapeHtml(r.label)}</span>
                        ${r.cols.map(col => {
                            const fKey = `${r.key}_${col.sub}`;
                            const v = savedObj[fKey] ?? '';
                            return `
                                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; color: #334155;">
                                    <span>${escapeHtml(col.label)}:</span>
                                    <input type="${escapeHtml(col.type || 'text')}"
                                           step="any"
                                           data-sf-code="${escapeHtml(code)}"
                                           data-sf-target="${escapeHtml(targetType)}"
                                           data-sf-key="${escapeHtml(fKey)}"
                                           value="${escapeHtml(v)}"
                                           ${isViewer ? 'disabled' : ''}
                                           placeholder="${escapeHtml(col.placeholder || '')}"
                                           oninput="onStructuredFieldChange('${escapeQuotes(code)}', '${escapeQuotes(targetType)}', '${escapeQuotes(fKey)}', this.value)"
                                           class="form-control"
                                           style="width: ${col.type === 'number' ? '105px' : '135px'}; padding: 4px 7px; font-size: 0.80rem;">
                                    ${col.unit ? `<span style="color:#64748b;">${escapeHtml(col.unit)}</span>` : ''}
                                </label>
                            `;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
        `;
    }

    let fieldsHtml = '';
    if (Array.isArray(spec.fields) && spec.fields.length > 0) {
        fieldsHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px;">
                ${spec.fields.map(f => {
                    const v = savedObj[f.key] ?? '';
                    return `
                        <label style="display: flex; flex-direction: column; gap: 3px; font-size: 0.78rem; color: #1e293b; font-weight: 600;">
                            <span>${escapeHtml(f.label)}${f.unit ? ` <span style="color:#64748b; font-weight:500;">(${escapeHtml(f.unit)})</span>` : ''}:</span>
                            <input type="${escapeHtml(f.type || 'text')}"
                                   step="any"
                                   ${dlId ? `list="${dlId}"` : ''}
                                   data-sf-code="${escapeHtml(code)}"
                                   data-sf-target="${escapeHtml(targetType)}"
                                   data-sf-key="${escapeHtml(f.key)}"
                                   value="${escapeHtml(v)}"
                                   ${isViewer ? 'disabled' : ''}
                                   placeholder="${escapeHtml(f.placeholder || '')}"
                                   oninput="onStructuredFieldChange('${escapeQuotes(code)}', '${escapeQuotes(targetType)}', '${escapeQuotes(f.key)}', this.value)"
                                   class="form-control"
                                   style="padding: 5px 8px; font-size: 0.82rem; background: #ffffff;">
                        </label>
                    `;
                }).join('')}
            </div>
        `;
    }

    return `
        ${datalistHtml}
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 9px 10px; margin-bottom: 8px;">
            ${rowsHtml}
            ${fieldsHtml}
        </div>
    `;
}

function buildStructuredSummary(code, targetType, fieldsObj, existingChips = []) {
    const spec = getStructuredSpec(code, targetType);
    if (!spec) return '';
    const parts = [];

    if (Array.isArray(spec.rows)) {
        spec.rows.forEach(r => {
            const subParts = [];
            r.cols.forEach(col => {
                const val = String(fieldsObj[`${r.key}_${col.sub}`] ?? '').trim();
                if (val) {
                    subParts.push(`${col.label}: ${val}${col.unit ? ' ' + col.unit : ''}`);
                }
            });
            if (subParts.length > 0) {
                parts.push(`${r.label} (${subParts.join(', ')})`);
            }
        });
    }

    if (Array.isArray(spec.fields)) {
        spec.fields.forEach(f => {
            const val = String(fieldsObj[f.key] ?? '').trim();
            if (val) {
                parts.push(`${f.label}: ${val}${f.unit ? ' ' + f.unit : ''}`);
            }
        });
    }

    existingChips.forEach(ch => {
        if (!parts.includes(ch)) parts.push(ch);
    });
    return parts.join('; ');
}

function onStructuredFieldChange(code, targetType, fieldKey, fieldVal) {
    if (currentUser?.role === 'viewer') return;
    const stateKey = targetType === 'note' ? `${code}_note_fields` : `${code}_fields`;
    const answerKey = targetType === 'note' ? `${code}_note` : code;
    if (!currentDraftAnswers[stateKey] || typeof currentDraftAnswers[stateKey] !== 'object') {
        currentDraftAnswers[stateKey] = {};
    }
    if (fieldVal !== undefined && String(fieldVal).trim() !== '') {
        currentDraftAnswers[stateKey][fieldKey] = String(fieldVal).trim();
    } else {
        delete currentDraftAnswers[stateKey][fieldKey];
    }

    const spec = getStructuredSpec(code, targetType);
    const activeChips = [];
    if (spec && Array.isArray(spec.chips)) {
        const curText = String(currentDraftAnswers[answerKey] || '');
        spec.chips.forEach(ch => {
            const lower = ch.toLowerCase();
            const isNeg = lower.includes('không nhớ') || lower.includes('không có') || lower.includes('không bón') || lower.includes('không phun') || lower.includes('không đo') || lower.includes('không bán');
            if (!isNeg && isTxChipSelected(curText, ch)) {
                activeChips.push(ch);
            }
        });
    }

    const summary = buildStructuredSummary(code, targetType, currentDraftAnswers[stateKey], activeChips);
    currentDraftAnswers[answerKey] = summary;

    const ta = document.getElementById(targetType === 'note' ? `followUpNote_${code}` : `txInput_${code}`);
    if (ta) ta.value = summary;
    refreshTxChipButtons(code, summary);
    evaluateQuestionConditions();
    saveDraftLocal(false);
    updateAnsweredSummaryBadge();
}

function refreshTxChipButtons(code, curText) {
    document.querySelectorAll(`button[data-chip-for="${code}"]`).forEach(btn => {
        const lbl = btn.getAttribute('data-chip-label') || '';
        const active = isTxChipSelected(curText, lbl);
        btn.setAttribute('style', getTxChipStyle(active));
        const ic = btn.querySelector('i');
        if (ic) {
            ic.className = `${active ? 'fa-solid' : 'fa-regular'} fa-square-check`;
            ic.style.color = active ? '#ffffff' : '#15803d';
        }
    });
}

function onTxChipClick(code, label) {
    if (currentUser?.role === 'viewer') return;
    const ta = document.getElementById(`txInput_${code}`);
    const cur = String(currentDraftAnswers[code] || '').trim();
    const lowerLbl = label.toLowerCase();
    const isExclusiveNeg = lowerLbl.includes('không nhớ') || lowerLbl.includes('không có') ||
                           lowerLbl.includes('không bón') || lowerLbl.includes('không phun') ||
                           lowerLbl.includes('không đo') || lowerLbl.includes('không bán') ||
                           lowerLbl === 'không';

    const alreadyActive = isTxChipSelected(cur, label);
    let nextVal = '';
    if (alreadyActive) {
        nextVal = cur.split(/[;\n]+/).map(s => s.trim()).filter(s => s && s.toLowerCase() !== lowerLbl).join('; ');
    } else if (isExclusiveNeg) {
        nextVal = label;
        delete currentDraftAnswers[`${code}_fields`];
        document.querySelectorAll(`input[data-sf-code="${code}"][data-sf-target="answer"]`).forEach(inp => {
            inp.value = '';
        });
    } else {
        const cleanedParts = cur.split(/[;\n]+/).map(s => s.trim()).filter(s => {
            if (!s) return false;
            const sl = s.toLowerCase();
            return !(sl.includes('không nhớ') || sl.includes('không có') || sl.includes('không bón') || sl.includes('không phun') || sl.includes('không đo') || sl.includes('không bán') || sl === 'không');
        });
        cleanedParts.push(label);
        nextVal = cleanedParts.join('; ');
    }

    currentDraftAnswers[code] = nextVal;
    if (ta) ta.value = nextVal;
    refreshTxChipButtons(code, nextVal);
    evaluateQuestionConditions();
    saveDraftLocal(false);
    updateAnsweredSummaryBadge();
}

function onAnswerChange(code, el, isMulti) {
    if (currentUser?.role === 'viewer') return;

    if (isMulti) {
        if (!Array.isArray(currentDraftAnswers[code])) {
            currentDraftAnswers[code] = [];
        }
        if (el.checked) {
            if (EXCLUSIVE_NEG_OPTIONS.has(el.value)) {
                currentDraftAnswers[code] = [el.value];
                document.querySelectorAll(`input[name="q_${code}"]`).forEach(cb => {
                    if (cb.value !== el.value) {
                        cb.checked = false;
                        if (cb.parentElement) cb.parentElement.classList.remove('selected');
                    }
                });
            } else {
                currentDraftAnswers[code] = currentDraftAnswers[code].filter(v => !EXCLUSIVE_NEG_OPTIONS.has(v));
                document.querySelectorAll(`input[name="q_${code}"]`).forEach(cb => {
                    if (EXCLUSIVE_NEG_OPTIONS.has(cb.value)) {
                        cb.checked = false;
                        if (cb.parentElement) cb.parentElement.classList.remove('selected');
                    }
                });
                if (!currentDraftAnswers[code].includes(el.value)) {
                    currentDraftAnswers[code].push(el.value);
                }
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
        refreshTxChipButtons(code, el.value);
    }

    const fuBox = document.getElementById(`followUp_${code}`);
    if (fuBox) {
        const target = fuBox.dataset.followOn || '';
        const curVal = currentDraftAnswers[code];
        const active = Boolean(target) && (Array.isArray(curVal) ? curVal.includes(target) : (String(curVal || '') === target));
        const fuLbl = document.getElementById(`followUpLabel_${code}`);
        if (active) {
            fuBox.style.padding = '8px 10px';
            fuBox.style.background = '#fffbeb';
            fuBox.style.border = '1px solid #fcd34d';
            fuBox.style.borderRadius = '4px';
            if (fuLbl) {
                fuLbl.style.color = '#92400e';
                fuLbl.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Ghi rõ phương án khác / chi tiết:';
            }
        } else {
            fuBox.style.padding = '0';
            fuBox.style.background = 'transparent';
            fuBox.style.border = 'none';
            if (fuLbl) {
                fuLbl.style.color = '#64748b';
                fuLbl.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Ghi chú / Bổ sung phương án khác (nếu có):';
            }
        }
    }

    const detailsBox = document.getElementById(`optionDetails_${code}`);
    if (detailsBox) {
        const qObj = (allQuestionsData[currentTool]?.questions || []).find(q => q.code === code);
        if (qObj && qObj.per_option_details) {
            const selectedArr = Array.isArray(currentDraftAnswers[code]) ? currentDraftAnswers[code] : [];
            const detailsObj = currentDraftAnswers[code + '_details'];
            if (detailsObj && typeof detailsObj === 'object') {
                Object.keys(detailsObj).forEach(k => {
                    if (!selectedArr.includes(k)) delete detailsObj[k];
                });
                if (Object.keys(detailsObj).length === 0) delete currentDraftAnswers[code + '_details'];
            }
            detailsBox.innerHTML = renderOptionDetailsHtml(qObj, currentDraftAnswers[code], currentUser?.role === 'viewer');
        }
    }

    evaluateQuestionConditions();
    saveDraftLocal(false);
    updateAnsweredSummaryBadge();
}

function renderOptionDetailsHtml(q, val, isViewer) {
    const cfg = q.per_option_details;
    if (!cfg || !Array.isArray(cfg.fields)) return '';
    const selected = Array.isArray(val) ? val : [];
    const excluded = cfg.exclude || [];
    const items = selected.filter(v => !excluded.includes(v));
    if (items.length === 0) return '';

    const details = currentDraftAnswers[q.code + '_details'] || {};
    return `
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #f8fafc;">
            <div style="font-size: 0.82rem; font-weight: 700; color: #1e3a8a; margin-bottom: 8px;">
                <i class="fa-solid fa-seedling"></i> Chi tiết theo từng loài cây đã chọn:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${items.map(optVal => {
                    const rowData = details[optVal] || {};
                    const displayLabel = (optVal === 'Khác' && currentDraftAnswers[q.code + '_note'])
                        ? `Khác (${currentDraftAnswers[q.code + '_note']})`
                        : optVal;
                    return `
                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px;">
                            <div style="min-width: 140px; font-weight: 600; color: #0f172a; font-size: 0.88rem;">${escapeHtml(displayLabel)}</div>
                            ${cfg.fields.map(f => {
                                const fVal = rowData[f.key] ?? '';
                                const minA = f.min !== undefined ? `min="${f.min}"` : '';
                                const maxA = f.max !== undefined ? `max="${f.max}"` : '';
                                return `
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: #334155;">
                                        <span>${escapeHtml(f.label)}:</span>
                                        <input type="${escapeHtml(f.type || 'text')}"
                                               ${minA} ${maxA}
                                               class="form-control"
                                               style="width: 115px; padding: 4px 8px; font-size: 0.85rem;"
                                               value="${escapeHtml(fVal)}"
                                               placeholder="${escapeHtml(f.placeholder || '')}"
                                               ${isViewer ? 'disabled' : ''}
                                               oninput="onOptionDetailChange('${escapeQuotes(q.code)}', '${escapeQuotes(optVal)}', '${escapeQuotes(f.key)}', this.value)">
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function onOptionDetailChange(code, optVal, fieldKey, fieldVal) {
    if (currentUser?.role === 'viewer') return;
    if (!currentDraftAnswers[code + '_details'] || typeof currentDraftAnswers[code + '_details'] !== 'object') {
        currentDraftAnswers[code + '_details'] = {};
    }
    if (!currentDraftAnswers[code + '_details'][optVal]) {
        currentDraftAnswers[code + '_details'][optVal] = {};
    }
    if (fieldVal !== undefined && String(fieldVal).trim() !== '') {
        currentDraftAnswers[code + '_details'][optVal][fieldKey] = fieldVal;
    } else {
        delete currentDraftAnswers[code + '_details'][optVal][fieldKey];
        if (Object.keys(currentDraftAnswers[code + '_details'][optVal]).length === 0) {
            delete currentDraftAnswers[code + '_details'][optVal];
        }
    }
    saveDraftLocal(false);
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
    evaluateQuestionConditions();
    saveDraftLocal(false);
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
// 6. LƯU BẢN NHÁP ĐA PHIẾU (INDEXEDDB OFFLINE + VPS /api/drafts)
// ========================================================
const DRAFTS_IDB_NAME = 'dakman_drafts_db';
const DRAFTS_IDB_STORE = 'drafts';

function openDraftsIdb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB unavailable'));
            return;
        }
        const req = indexedDB.open(DRAFTS_IDB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(DRAFTS_IDB_STORE)) {
                db.createObjectStore(DRAFTS_IDB_STORE, { keyPath: 'draft_key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getIdbDrafts() {
    try {
        const db = await openDraftsIdb();
        return await new Promise((resolve) => {
            const tx = db.transaction(DRAFTS_IDB_STORE, 'readonly');
            const req = tx.objectStore(DRAFTS_IDB_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (_) {
        return [];
    }
}

async function putIdbDraft(record) {
    try {
        const db = await openDraftsIdb();
        await new Promise((resolve) => {
            const tx = db.transaction(DRAFTS_IDB_STORE, 'readwrite');
            tx.objectStore(DRAFTS_IDB_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch (_) {}
}

async function deleteIdbDraft(draftKey) {
    try {
        const db = await openDraftsIdb();
        await new Promise((resolve) => {
            const tx = db.transaction(DRAFTS_IDB_STORE, 'readwrite');
            tx.objectStore(DRAFTS_IDB_STORE).delete(draftKey);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch (_) {}
}

function buildCurrentDraftRecord() {
    const surveyCode = (document.getElementById('surveyCodeInput')?.value || '').trim() || `${currentTool}_${Date.now()}`;
    const gpsStr = (document.getElementById('gpsInput')?.value || '').trim();
    let gpsLat = 0.0, gpsLng = 0.0;
    const coordMatch = gpsStr.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (coordMatch) {
        gpsLat = parseFloat(coordMatch[1]) || 0.0;
        gpsLng = parseFloat(coordMatch[2]) || 0.0;
    }
    const visible = getVisibleQuestions(currentTool);
    const ansCount = visible.filter(q => isQuestionAnswered(q.code)).length;
    const isDataUrl = Boolean(currentHouseholdPhotoData && currentHouseholdPhotoData.startsWith('data:'));

    const headName = (document.getElementById('headNameInput')?.value || '').trim();
    const headGender = document.getElementById('headGenderSelect')?.value || '';
    const headBirth = (document.getElementById('headBirthYearInput')?.value || '').trim();
    const relSel = document.getElementById('respondentRelationSelect')?.value || 'Chủ hộ';
    const relOther = (document.getElementById('respondentRelationOther')?.value || '').trim();
    const sameAsHead = (currentTool === 'P1' && relSel === 'Chủ hộ');
    const respName = sameAsHead ? headName : (document.getElementById('respondentNameInput')?.value || '').trim();
    const respGender = sameAsHead ? headGender : (document.getElementById('respondentGenderSelect')?.value || '');
    const respBirth = sameAsHead ? headBirth : (document.getElementById('respondentBirthYearInput')?.value || '').trim();
    const resolvedRel = (currentTool !== 'P1')
        ? (currentDraftAnswers['_resp_relation'] || 'Đại diện đơn vị / Khác')
        : ((relSel === 'Khác' && relOther) ? relOther : relSel);

    const answersCopy = Object.assign({}, currentDraftAnswers, {
        _head_name: headName,
        _head_gender: headGender,
        _head_birth_year: headBirth,
        _same_as_head: sameAsHead,
        _resp_name: respName,
        _resp_gender: respGender,
        _resp_birth_year: respBirth,
        _resp_relation: resolvedRel,
        _resp_relation_other: relOther
    });

    return {
        draft_key: `${currentTool}::${surveyCode}`,
        tool_code: currentTool,
        survey_code: surveyCode,
        surveyor_id: currentUser?.surveyor_id || 'DTV',
        surveyor_name: currentUser?.full_name || 'Điều tra viên',
        survey_date: document.getElementById('surveyDateInput')?.value || getVnTodayIso(),
        commune: document.getElementById('communeSelect')?.value || 'Ea Kiết',
        hamlet: (document.getElementById('hamletInput')?.value || '').trim(),
        respondent_name: respName || headName,
        respondent_phone: (document.getElementById('phoneInput')?.value || '').trim(),
        guide_name: (document.getElementById('guideNameInput')?.value || currentDraftAnswers['_guide'] || '').trim(),
        gps: gpsStr,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        current_section: currentSection || '',
        photo_data: isDataUrl ? currentHouseholdPhotoData : '',
        photo_path: currentDraftPhotoPath || '',
        photo_meta: currentHouseholdPhotoMeta || '',
        answers: answersCopy,
        answered_count: ansCount,
        total_count: visible.length,
        saved_at: new Date().toLocaleTimeString('vi-VN'),
        updated_iso: new Date().toISOString(),
        sync_pending: true
    };
}

let idbDraftSaveTimer = null;
let draftsRemoteFetchPromise = null;

function scheduleIdbDraftSave(rec) {
    if (idbDraftSaveTimer) clearTimeout(idbDraftSaveTimer);
    idbDraftSaveTimer = setTimeout(() => {
        idbDraftSaveTimer = null;
        putIdbDraft(rec).then(() => refreshDraftBadgeCount(false)).catch(() => {});
    }, 350);
}

function saveDraftLocal(isManual) {
    if (currentUser?.role === 'viewer') return;

    const rec = buildCurrentDraftRecord();
    const keepSmallPhoto = Boolean(rec.photo_data && rec.photo_data.length < 45000);
    const payload = {
        tool_code: rec.tool_code,
        survey_code: rec.survey_code,
        surveyor_id: rec.surveyor_id,
        surveyor_name: rec.surveyor_name,
        commune: rec.commune,
        hamlet: rec.hamlet,
        respondent_name: rec.respondent_name,
        phone: rec.respondent_phone,
        guide: rec.guide_name,
        gps: rec.gps,
        photo_data: keepSmallPhoto ? rec.photo_data : '',
        photo_path: rec.photo_path,
        photo_meta: rec.photo_meta,
        answers: rec.answers,
        saved_at: rec.saved_at
    };

    try {
        localStorage.setItem(`dakman_draft_${currentTool}`, JSON.stringify(payload));
    } catch (e) {
        const lightPayload = Object.assign({}, payload, { photo_data: '' });
        try { localStorage.setItem(`dakman_draft_${currentTool}`, JSON.stringify(lightPayload)); } catch (_) {}
    }

    // Lưu đa phiếu + ảnh vào IndexedDB nếu đã có tên hộ, ảnh, GPS hoặc câu trả lời
    const hasMeaningfulData = Boolean(
        rec.respondent_name || rec.photo_data || rec.photo_path || rec.gps || rec.answered_count > 0
    );
    if (hasMeaningfulData) {
        if (isManual) {
            if (idbDraftSaveTimer) {
                clearTimeout(idbDraftSaveTimer);
                idbDraftSaveTimer = null;
            }
            putIdbDraft(rec);
        } else {
            scheduleIdbDraftSave(rec);
        }
    }

    updateDraftTimeDisplay(rec.saved_at);

    if (isManual) {
        syncCurrentDraftToVps(rec).then((synced) => {
            refreshDraftBadgeCount(true);
            const statusText = document.getElementById('floatingDraftStatusText');
            if (statusText) {
                statusText.textContent = synced
                    ? `Đã lưu tạm [${rec.respondent_name || rec.survey_code}] lên Thiết bị + VPS lúc ${rec.saved_at}.`
                    : `Đã lưu tạm [${rec.respondent_name || rec.survey_code}] an toàn trên Thiết bị (sẽ tự đồng bộ VPS khi có mạng).`;
            }
            alert(
                synced
                    ? `ĐÃ LƯU TẠM THÀNH CÔNG LÊN THIẾT BỊ & MÁY CHỦ VPS!\n- Mã phiếu: ${rec.survey_code}\n- Chủ hộ: ${rec.respondent_name || '(Chưa nhập tên)'}\n- Ảnh hiện trường: ${(rec.photo_data || rec.photo_path) ? 'Đã lưu' : 'Chưa chụp'}\n- GPS: ${rec.gps || 'Chưa có'}\n\nKhi cần hoàn thiện, mở mục "Phiếu Tạm" để điền tiếp và lưu chính thức.`
                    : `ĐÃ LƯU TẠM AN TOÀN TRÊN THIẾT BỊ (OFFLINE)!\n- Mã phiếu: ${rec.survey_code}\n- Chủ hộ: ${rec.respondent_name || '(Chưa nhập tên)'}\nHệ thống sẽ tự động đẩy lên VPS khi có sóng mạng.`
            );
        });
    }
}

async function syncCurrentDraftToVps(rec, isAutoSync = false) {
    if (!rec || currentUser?.role === 'viewer') return false;
    try {
        const res = await fetch(apiUrl('/api/drafts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ role: currentUser?.role || 'editor', is_auto_sync: Boolean(isAutoSync) }, rec))
        });
        if (res.ok) {
            const data = await res.json();
            if (data.tombstoned) {
                await deleteIdbDraft(rec.draft_key);
                await loadHouseholdLocks();
                await refreshDraftBadgeCount(false);
                return false;
            }
            if (data.photo_path) {
                currentDraftPhotoPath = data.photo_path;
                rec.photo_path = data.photo_path;
                // Giải phóng chuỗi base64 trong IndexedDB ngay khi ảnh đã lưu an toàn trên VPS
                // để tránh tràn bộ nhớ / chậm khi chụp từ phiếu thứ 3-4 trở đi trên điện thoại
                rec.photo_data = '';
            }
            rec.sync_pending = false;
            await putIdbDraft(rec);
            await loadHouseholdLocks();
            return true;
        }
        if (res.status === 409) {
            const err = await res.json().catch(() => ({}));
            if (err.error) alert(err.error);
            await loadHouseholdLocks();
            return false;
        }
    } catch (_) {}
    return false;
}

async function syncPendingDrafts(silent = true) {
    if (!navigator.onLine || currentUser?.role === 'viewer') return;
    const list = await getIdbDrafts();
    for (const rec of list) {
        if (rec.sync_pending) {
            await syncCurrentDraftToVps(rec, true);
        }
    }
    if (!silent) refreshDraftBadgeCount();
}

async function fetchMergedDraftsList(syncRemote = true) {
    if (!currentUser || currentUser.role === 'viewer') return [];
    const localList = (await getIdbDrafts()).filter(d => isDraftStrictlyOwnedByCurrentUser(d));
    const mergedMap = new Map();
    localList.forEach(d => mergedMap.set(d.draft_key, Object.assign({ source: 'Thiết bị (Offline)' }, d)));

    if (syncRemote && navigator.onLine && currentUser) {
        try {
            if (!draftsRemoteFetchPromise) {
                const role = encodeURIComponent(currentUser.role || 'editor');
                const sid = encodeURIComponent(currentUser.surveyor_id || '');
                draftsRemoteFetchPromise = fetchJsonWithTimeout(apiUrl(`/api/drafts?role=${role}&surveyor_id=${sid}`), 6000)
                    .finally(() => { draftsRemoteFetchPromise = null; });
            }
            const remote = await draftsRemoteFetchPromise;
            if (Array.isArray(remote)) {
                remote.filter(r => isDraftStrictlyOwnedByCurrentUser(r)).forEach(r => {
                    const existing = mergedMap.get(r.draft_key);
                    if (existing) {
                        mergedMap.set(r.draft_key, Object.assign({}, r, existing, {
                            photo_path: existing.photo_path || r.photo_path,
                            photo_url: r.photo_url || existing.photo_url,
                            source: existing.sync_pending ? 'Thiết bị (Chờ đồng bộ VPS)' : 'Thiết bị + VPS'
                        }));
                    } else {
                        mergedMap.set(r.draft_key, Object.assign({ source: 'VPS (Từ thiết bị khác)' }, r));
                    }
                });
            }
        } catch (_) {}
    }
    return Array.from(mergedMap.values()).sort((a, b) => String(b.updated_iso || b.updated_at || '').localeCompare(String(a.updated_iso || a.updated_at || '')));
}

async function refreshDraftBadgeCount(syncRemote = false, preloadedDrafts = null) {
    const drafts = preloadedDrafts || await fetchMergedDraftsList(syncRemote);
    checkinDraftCodes = new Set(
        drafts.map(d => String(d.survey_code || '').trim().toUpperCase()).filter(Boolean)
    );
    const b1 = document.getElementById('draftListCountBadge');
    const b2 = document.getElementById('draftStripCountBadge');
    const b3 = document.getElementById('checkinQuickCountBadge');
    const b4 = document.getElementById('subviewDraftBadge');
    const b5 = document.getElementById('menuDraftBadge');
    const b6 = document.getElementById('menuDraftCardBadge');
    const b7 = document.getElementById('menuDraftParen');
    if (b1) b1.textContent = drafts.length;
    if (b2) b2.textContent = drafts.length;
    if (b3) b3.textContent = drafts.length;
    if (b4) b4.textContent = drafts.length;
    if (b5) b5.textContent = drafts.length;
    if (b6) b6.textContent = `${drafts.length} phiếu tạm`;
    if (b7) b7.textContent = drafts.length;
}

function manualSaveDraft() {
    saveDraftLocal(true);
}

async function quickSaveFieldCheckin() {
    if (currentUser?.role === 'viewer') return;
    const codeVal = (document.getElementById('surveyCodeInput')?.value || '').trim();
    const headVal = (document.getElementById('headNameInput')?.value || '').trim();
    const nameVal = (document.getElementById('respondentNameInput')?.value || '').trim();
    if (!codeVal && !headVal && !nameVal) {
        alert('Vui lòng chọn Chủ hộ (hoặc nhập Mã phiếu / Tên chủ hộ) trước khi lưu check-in hiện trường!');
        document.getElementById('sampleSearchInput')?.focus();
        return;
    }

    currentDraftAnswers['_field_checkin_mode'] = 'paper_pending';
    currentDraftAnswers['_field_checkin_at'] = new Date().toISOString();
    await saveDraftAndNextHousehold(true);
}

async function saveDraftAndNextHousehold(isCheckinMode = false) {
    if (currentUser?.role === 'viewer') return;
    const rec = buildCurrentDraftRecord();
    await putIdbDraft(rec);
    const synced = await syncCurrentDraftToVps(rec);
    await refreshDraftBadgeCount();

    currentDraftAnswers = {};
    editingSurveyId = null;
    currentDraftPhotoPath = '';
    lastAutoSelectedHouseholdLabel = '';
    stopBackgroundGpsTracker();
    stopRealtimeInterviewClock();
    clearHouseholdPhoto(true);
    localStorage.removeItem(`dakman_draft_${currentTool}`);

    ['surveyCodeInput', 'hamletInput', 'headNameInput', 'headGenderSelect', 'headBirthYearInput', 'respondentNameInput', 'respondentGenderSelect', 'respondentBirthYearInput', 'respondentRelationOther', 'phoneInput', 'guideNameInput', 'gpsInput', 'sampleSearchInput'].forEach(fid => {
        const el = document.getElementById(fid);
        if (el) el.value = '';
    });
    const relSel = document.getElementById('respondentRelationSelect');
    if (relSel) relSel.value = 'Chủ hộ';
    updateRespondentSubRowVisibility();
    const banner = document.getElementById('sampleSelectedBanner');
    if (banner) banner.style.display = 'none';

    await selectTool(currentTool);
    const activeGuide = document.getElementById('sampleFilterGuide')?.value || '';
    filterSampleHouseholds(Boolean(activeGuide));
    const statusText = document.getElementById('floatingDraftStatusText');
    if (statusText) {
        statusText.textContent = synced
            ? `Đã lưu tạm [${rec.respondent_name || rec.survey_code}] lên VPS & thiết bị.`
            : `Đã lưu tạm [${rec.respondent_name || rec.survey_code}] offline trên thiết bị.`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const hasPhoto = Boolean(rec.photo_data || rec.photo_path);
    const hasGps = Boolean(rec.gps);
    alert(
        isCheckinMode
            ? `ĐÃ LƯU TẠM HIỆN TRƯỜNG ${synced ? '(THIẾT BỊ + VPS)' : '(OFFLINE TRÊN THIẾT BỊ)'}!\n` +
              `- Hộ: [${rec.survey_code}] ${rec.respondent_name || '(Chưa nhập tên)'}\n` +
              `- Ảnh hiện trường: ${hasPhoto ? 'Đã lưu' : 'Chưa chụp'} | GPS: ${hasGps ? rec.gps : 'Chưa có'}\n\n` +
              `Sẵn sàng chọn hộ tiếp theo! Khi cần hoàn thiện phiếu, mở lại trong mục "Phiếu Tạm".`
            : (synced
                ? `Đã lưu tạm hộ [${rec.respondent_name || rec.survey_code}] lên VPS & thiết bị!\nBây giờ có thể chọn hộ tiếp theo hoặc chụp ảnh/GPS tại vườn kế tiếp.`
                : `Đã lưu tạm hộ [${rec.respondent_name || rec.survey_code}] trên thiết bị!\nBây giờ có thể chọn hộ tiếp theo.`)
    );
}

async function openDraftsModal() {
    if (currentUser?.role === 'admin1') {
        alert('Tài khoản Admin1 chỉ được xem: Tiến độ, Bản đồ, Hệ thống bảng hỏi Blank và Thư viện ảnh!');
        return;
    }
    const modal = document.getElementById('draftsListModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
    await refreshAllDraftsList();
}

function hideDraftsModal() {
    const modal = document.getElementById('draftsListModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function refreshAllDraftsList() {
    const box = document.getElementById('draftsListContainer');
    if (!box) return;
    box.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách phiếu lưu tạm...</div>';
    const drafts = await fetchMergedDraftsList(true);
    await refreshDraftBadgeCount(false, drafts);

    const role = currentUser?.role || 'viewer';
    const btnBulkModal = document.getElementById('btnDeleteAllMyModalDrafts');
    if (btnBulkModal) {
        const hasOwned = role !== 'viewer' && drafts.some(d => isDraftStrictlyOwnedByCurrentUser(d));
        btnBulkModal.style.display = hasOwned ? 'inline-flex' : 'none';
    }

    if (!drafts.length) {
        box.innerHTML = '<div style="text-align: center; padding: 24px; color: #64748b;">Chưa có phiếu nào đang lưu tạm thuộc tài khoản của bạn. Khi đi hiện trường, chỉ cần chọn Chủ hộ, chụp ảnh &amp; lấy GPS rồi bấm <strong>Lưu Tạm</strong> để mở lại hoàn thiện sau.</div>';
        return;
    }

    box.innerHTML = drafts.map(d => {
        const hasPhoto = Boolean(d.photo_data || d.photo_url || d.photo_path);
        const gpsText = d.gps || ((d.gps_lat && d.gps_lng) ? `${d.gps_lat}, ${d.gps_lng}` : 'Chưa có GPS');
        const thumbSrc = d.photo_data || (d.photo_url ? apiUrl(d.photo_url) : (d.photo_path ? apiUrl(`/api/photos/${d.photo_path}`) : ''));
        const isPaperPending = Boolean(d.answers && d.answers._field_checkin_mode === 'paper_pending') || (Number(d.answered_count || 0) === 0 && (hasPhoto || Boolean(d.gps)));
        const badgeMode = isPaperPending
            ? '<span style="background:#0f766e;color:#fff;padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.70rem;margin-left:4px;">📸 ĐÃ CHECK-IN</span>'
            : '<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-weight:700;font-size:0.70rem;margin-left:4px;">Đang nhập dở</span>';
        const btnLabel = '<i class="fa-solid fa-pen-to-square"></i> Mở Phiếu Tạm';
        const borderLeftColor = isPaperPending ? '#0f766e' : '#d97706';
        const canDeleteDraft = (role === 'admin') || isDraftStrictlyOwnedByCurrentUser(d);
        return `
            <div style="border: 1px solid #cbd5e1; border-left: 4px solid ${borderLeftColor}; border-radius: 4px; padding: 10px 12px; margin-bottom: 10px; background: #fff; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                ${thumbSrc ? `<img src="${thumbSrc}" alt="Ảnh" style="width: 72px; height: 72px; object-fit: cover; border-radius: 3px; border: 1px solid #e2e8f0; flex-shrink: 0;">` : `<div style="width:72px; height:72px; background:#f1f5f9; border:1px dashed #cbd5e1; border-radius:3px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:0.72rem; text-align:center; flex-shrink:0;">Chưa ảnh</div>`}
                <div style="flex: 1; min-width: 210px; font-size: 0.82rem; line-height: 1.5;">
                    <div><strong style="color: #002060; font-family: monospace;">${escapeHtml(d.survey_code || '—')}</strong> <span style="background:#e0e7ff;color:#3730a3;padding:1px 5px;border-radius:2px;font-weight:700;font-size:0.72rem;">${escapeHtml(d.tool_code || 'P1')}</span>${badgeMode} — <strong>${escapeHtml(d.respondent_name || '(Chưa nhập tên chủ hộ)')}</strong></div>
                    <div style="color: #475569;">Địa bàn: ${escapeHtml(d.commune || '')}${d.hamlet ? ` (${escapeHtml(d.hamlet)})` : ''} | Dẫn đường: ${escapeHtml(d.guide_name || d.guide || '—')}</div>
                    <div style="color: #475569;">GPS: <span style="font-family:monospace;">${escapeHtml(gpsText)}</span> | Ảnh: ${hasPhoto ? '<span style="color:#15803d;font-weight:700;">✓ Đã có</span>' : '<span style="color:#b45309;">Chưa chụp</span>'} | Đã nhập: <strong>${d.answered_count || 0}/${d.total_count || '?'}</strong> câu</div>
                    <div style="font-size: 0.74rem; color: #64748b;">Lưu lúc: ${escapeHtml(d.saved_at || d.updated_at || '')} • ${escapeHtml(d.surveyor_name || d.surveyor_id || '')} • ${escapeHtml(d.source || '')}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;">
                    <button type="button" onclick="loadDraftIntoForm('${escapeQuotes(d.draft_key)}')" class="qgis-btn-primary" style="background: #15803d; border-color: #166534; padding: 6px 12px; font-size: 0.80rem;">
                        ${btnLabel}
                    </button>
                    ${canDeleteDraft ? `
                    <button type="button" onclick="deleteDraftItem('${escapeQuotes(d.draft_key)}', '${escapeQuotes(d.survey_code || d.draft_key)}', '${escapeQuotes(d.respondent_name || '')}')" style="background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 0.76rem; font-weight: 600;">
                        <i class="fa-solid fa-trash-can"></i> Xóa Nháp
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function loadDraftIntoForm(draftKey) {
    const drafts = await fetchMergedDraftsList();
    const d = drafts.find(item => item.draft_key === draftKey);
    if (!d) {
        alert('Không tìm thấy bản nháp cần mở!');
        return;
    }

    hideDraftsModal();
    switchMainView('survey');
    localStorage.removeItem(`dakman_draft_${d.tool_code || 'P1'}`);
    await selectTool(d.tool_code || 'P1');

    currentDraftAnswers = Object.assign({}, d.answers || {});
    currentDraftPhotoPath = d.photo_path || '';
    document.getElementById('surveyCodeInput').value = d.survey_code || '';
    if (d.commune) document.getElementById('communeSelect').value = d.commune;
    document.getElementById('hamletInput').value = d.hamlet || '';
    if (document.getElementById('phoneInput')) document.getElementById('phoneInput').value = d.respondent_phone || d.phone || '';
    if (document.getElementById('guideNameInput')) document.getElementById('guideNameInput').value = d.guide_name || d.guide || '';
    document.getElementById('gpsInput').value = d.gps || ((d.gps_lat && d.gps_lng) ? `${d.gps_lat}, ${d.gps_lng}` : '');
    updateGpsLockState(hasValidGpsText(document.getElementById('gpsInput')?.value));

    applySharedDemographicsToForm(currentDraftAnswers, d.respondent_name || '', d.tool_code || 'P1');

    if (d.photo_data) {
        setHouseholdPhotoPreview(d.photo_data, d.photo_meta || 'Ảnh nháp đã lưu trên thiết bị');
    } else if (d.photo_url || d.photo_path) {
        const u = d.photo_url ? apiUrl(d.photo_url) : apiUrl(`/api/photos/${d.photo_path}`);
        setHouseholdPhotoPreview(u, d.photo_meta || `Ảnh nháp đã lưu trên VPS (${d.survey_code})`);
        currentHouseholdPhotoData = '';
    } else {
        clearHouseholdPhoto(true);
    }

    const banner = document.getElementById('sampleSelectedBanner');
    if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `<i class="fa-solid fa-file-pen"></i> Đang mở phiếu tạm <strong>[${escapeHtml(d.survey_code)}] ${escapeHtml(d.respondent_name || '')}</strong> (${escapeHtml(d.commune || '')}) — <em>Ảnh hiện trường &amp; GPS đã được nạp sẵn, mời điền &amp; hoàn thành phiếu!</em>`;
    }

    const sections = getToolSections();
    if (sections.length > 1) {
        selectSection('__ALL__', 'ALL');
    } else {
        renderQuestionsForSection(currentSection);
    }
    updateAnsweredSummaryBadge();
    saveDraftLocal(false);
    if (Number(d.answered_count || 0) === 0 && sections.length > 0) {
        document.getElementById('surveyQuestionsBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

let _confirmDeleteXResolver = null;

function onConfirmDeleteXInputChange() {
    const inp = document.getElementById('confirmDeleteXInput');
    const btn = document.getElementById('btnConfirmDeleteXSubmit');
    const hint = document.getElementById('confirmDeleteXHint');
    if (!inp || !btn) return;
    const ok = String(inp.value || '').trim().toUpperCase() === 'X';
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.5';
    btn.style.cursor = ok ? 'pointer' : 'not-allowed';
    inp.style.borderColor = ok ? '#16a34a' : (inp.value ? '#dc2626' : '#cbd5e1');
    if (hint) {
        hint.innerHTML = ok
            ? '<span style="color:#15803d;font-weight:700;"><i class="fa-solid fa-circle-check"></i> Đã xác nhận đúng ký tự X — bấm nút đỏ để xóa.</span>'
            : 'Nhập đúng 1 ký tự <strong>X</strong> (hoa hoặc thường)';
    }
}

function submitConfirmDeleteXModal() {
    const inp = document.getElementById('confirmDeleteXInput');
    const ok = String(inp?.value || '').trim().toUpperCase() === 'X';
    if (!ok) {
        if (inp) {
            inp.style.borderColor = '#dc2626';
            inp.focus();
        }
        return;
    }
    closeConfirmDeleteXModal(true);
}

function closeConfirmDeleteXModal(confirmed = false) {
    const modal = document.getElementById('confirmDeleteXModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    const resolver = _confirmDeleteXResolver;
    _confirmDeleteXResolver = null;
    if (resolver) resolver(Boolean(confirmed));
}

function requestConfirmDeleteWithX(titleText, detailHtml) {
    const modal = document.getElementById('confirmDeleteXModal');
    const titleEl = document.getElementById('confirmDeleteXTitle');
    const detailEl = document.getElementById('confirmDeleteXDetail');
    const inp = document.getElementById('confirmDeleteXInput');
    if (!modal || !inp) {
        const typed = prompt(`${titleText}\n\nNhập đúng chữ X để xác nhận xóa:`);
        return Promise.resolve(String(typed || '').trim().toUpperCase() === 'X');
    }
    if (_confirmDeleteXResolver) {
        const prev = _confirmDeleteXResolver;
        _confirmDeleteXResolver = null;
        prev(false);
    }
    if (titleEl) titleEl.textContent = titleText || 'Xác nhận xóa phiếu';
    if (detailEl) detailEl.innerHTML = detailHtml || '';
    inp.value = '';
    onConfirmDeleteXInputChange();
    modal.style.display = 'flex';
    modal.classList.add('active');
    setTimeout(() => inp.focus(), 60);
    return new Promise((resolve) => {
        _confirmDeleteXResolver = resolve;
    });
}

async function cleanupDeletedDraftLocally(draftKey, surveyCode = '') {
    if (idbDraftSaveTimer) {
        clearTimeout(idbDraftSaveTimer);
        idbDraftSaveTimer = null;
    }
    await deleteIdbDraft(draftKey);

    const dkParts = String(draftKey || '').split('::');
    const dkTool = dkParts.length > 1 ? dkParts[0] : '';
    const dkCode = (dkParts.length > 1 ? dkParts.slice(1).join('::') : (surveyCode || '')).trim().toUpperCase();
    const targetCode = String(surveyCode || dkCode || '').trim().toUpperCase();

    ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', dkTool].filter(Boolean).forEach(t => {
        try {
            const raw = localStorage.getItem(`dakman_draft_${t}`);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const pCode = String(parsed?.survey_code || '').trim().toUpperCase();
            if (!targetCode || pCode === targetCode || `${t}::${pCode}` === draftKey) {
                localStorage.removeItem(`dakman_draft_${t}`);
            }
        } catch (_) {}
    });

    const activeFormCode = String(document.getElementById('surveyCodeInput')?.value || '').trim().toUpperCase();
    if (activeFormCode && targetCode && activeFormCode === targetCode) {
        currentDraftPhotoPath = '';
    }
}

async function deleteDraftItem(draftKey, labelCode = '', respondentName = '') {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không có quyền xóa phiếu nháp.');
        return;
    }
    const displayCode = labelCode || draftKey;
    const detailHtml = `
        <div><strong>Phiếu nháp cần xóa:</strong> <span style="font-family:monospace;color:#991b1b;">${escapeHtml(displayCode)}</span></div>
        ${respondentName ? `<div><strong>Chủ hộ:</strong> ${escapeHtml(respondentName)}</div>` : ''}
        <div style="margin-top:4px;font-size:0.78rem;color:#64748b;">Sau khi xóa, phiếu này sẽ rời khỏi danh sách chờ nhưng vẫn được lưu bản sao trong Thùng rác VPS.</div>
    `;
    const confirmed = await requestConfirmDeleteWithX('Xác nhận xóa phiếu nháp', detailHtml);
    if (!confirmed) return;

    try {
        const res = await fetch(apiUrl(`/api/drafts/${encodeURIComponent(draftKey)}`), {
            method: 'DELETE',
            headers: {
                'X-Confirm-Delete': 'X',
                'X-User-Role': role,
                'X-User-Id': currentUser?.surveyor_id || '',
                'X-Delete-Password': currentUser?.key || '',
                'X-Admin-Key': role === 'admin' ? (getAdminKey() || currentUser?.key || '') : ''
            }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert('Không thể xóa phiếu nháp: ' + (data.error || `HTTP ${res.status}`));
            return;
        }
    } catch (err) {
        if (navigator.onLine) {
            alert('Lỗi kết nối VPS khi xóa phiếu nháp. Vui lòng thử lại.');
            return;
        }
    }

    await cleanupDeletedDraftLocally(draftKey, labelCode);
    showInstantActionToast(`Đã xóa tức thì phiếu nháp [${labelCode}] (bản gốc vẫn bảo lưu trong Thùng rác VPS).`);
    await loadHouseholdLocks();
    await refreshAllDraftsList();
    if (typeof loadSurveysList === 'function') {
        loadSurveysList();
    }
}

async function deleteAllMyDraftsConfirm() {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không có quyền xóa phiếu nháp.');
        return;
    }
    const drafts = await fetchMergedDraftsList(true);
    const owned = (Array.isArray(drafts) ? drafts : []).filter(d => (role === 'admin') || isDraftStrictlyOwnedByCurrentUser(d));
    if (!owned.length) {
        alert('Không có phiếu nháp nào thuộc tài khoản của bạn để xóa.');
        return;
    }

    const previewCodes = owned.slice(0, 6).map(d => escapeHtml(d.survey_code || d.draft_key)).join(', ');
    const moreText = owned.length > 6 ? ` và ${owned.length - 6} phiếu khác` : '';
    const detailHtml = `
        <div><strong>Số lượng xóa:</strong> <span style="color:#991b1b;font-weight:700;">${owned.length} phiếu nháp</span></div>
        <div style="margin-top:4px;font-size:0.8rem;"><strong>Danh sách:</strong> ${previewCodes}${moreText}</div>
    `;
    const confirmed = await requestConfirmDeleteWithX(`Xóa tất cả ${owned.length} phiếu nháp`, detailHtml);
    if (!confirmed) return;

    let deletedCount = 0;
    const errors = [];
    for (const d of owned) {
        try {
            const res = await fetch(apiUrl(`/api/drafts/${encodeURIComponent(d.draft_key)}`), {
                method: 'DELETE',
                headers: {
                    'X-Confirm-Delete': 'X',
                    'X-User-Role': role,
                    'X-User-Id': currentUser?.surveyor_id || '',
                    'X-Delete-Password': currentUser?.key || '',
                    'X-Admin-Key': role === 'admin' ? (getAdminKey() || currentUser?.key || '') : ''
                }
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await cleanupDeletedDraftLocally(d.draft_key, d.survey_code || '');
                deletedCount++;
            } else {
                errors.push(`${d.survey_code || d.draft_key}: ${data.error || `HTTP ${res.status}`}`);
            }
        } catch (_) {
            if (!navigator.onLine) {
                await cleanupDeletedDraftLocally(d.draft_key, d.survey_code || '');
                deletedCount++;
            } else {
                errors.push(`${d.survey_code || d.draft_key}: Lỗi mạng`);
            }
        }
    }

    await loadHouseholdLocks();
    await refreshAllDraftsList();
    if (typeof loadSurveysList === 'function') {
        await loadSurveysList();
    }
    if (errors.length) {
        alert(`Đã xóa ${deletedCount}/${owned.length} phiếu nháp.\nMột số phiếu gặp lỗi:\n- ${errors.slice(0, 5).join('\n- ')}`);
    } else {
        showInstantActionToast(`Đã xóa sạch tức thì ${deletedCount} phiếu nháp (vẫn bảo lưu trong Thùng rác VPS).`);
    }
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

    // Cập nhật số đếm (đã trả lời / tổng) trên nút Tất cả & từng tab Phần
    const btnAll = document.getElementById('jumpBtn-ALL');
    if (btnAll) {
        const doneAll = totalQ > 0 && answeredCount === totalQ;
        btnAll.classList.toggle('sec-complete', doneAll);
        btnAll.innerHTML = `Tất cả câu hỏi <span style="opacity:0.85; font-size:0.75em;">(${answeredCount}/${totalQ}${doneAll ? ' ✓' : ''})</span>`;
    }
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
function hasValidGpsText(gpsStr) {
    if (!gpsStr || typeof gpsStr !== 'string') return false;
    const m = gpsStr.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return false;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.01 && Math.abs(lng) > 0.01;
}

function updateGpsLockState(locked) {
    const gpsEl = document.getElementById('gpsInput');
    const btnGps = document.getElementById('btnAutoCaptureGPS');
    const badge = document.getElementById('gpsLockBadge');
    const isLocked = Boolean(locked);
    if (gpsEl) {
        gpsEl.readOnly = isLocked;
        gpsEl.style.backgroundColor = isLocked ? '#fffbeb' : '';
        gpsEl.title = isLocked ? 'GPS lần đầu đã được khóa bảo toàn nguyên vị' : 'Tự động lấy GPS hoặc dán lat, lng';
    }
    if (btnGps) {
        btnGps.disabled = isLocked;
        btnGps.style.opacity = isLocked ? '0.5' : '1';
        btnGps.style.cursor = isLocked ? 'not-allowed' : 'pointer';
        btnGps.title = isLocked ? 'Đã khóa tọa độ GPS ghi nhận lần đầu' : 'Lấy tọa độ GPS';
    }
    if (badge) {
        badge.style.display = isLocked ? 'inline-block' : 'none';
    }
}

function autoCaptureGPS() {
    if (currentUser?.role === 'viewer' || currentUser?.role === 'admin1') {
        alert('Tài khoản ở chế độ chỉ xem.');
        return;
    }
    const existingEl = document.getElementById('gpsInput');
    if (existingEl && hasValidGpsText(existingEl.value)) {
        updateGpsLockState(true);
        alert(`Phiếu đã ghi nhận tọa độ GPS lần đầu (${existingEl.value.trim()}). Theo quy định, tọa độ gốc được khóa để bảo toàn nguyên vị!`);
        return;
    }
    if (!navigator.geolocation) {
        alert('Thiết bị của bạn không hỗ trợ định vị Geolocation API. Vui lòng mở Google Maps và dán tọa độ vào ô Tọa Độ GPS.');
        return;
    }

    const onSuccess = (pos) => {
        const gpsEl = document.getElementById('gpsInput');
        if (gpsEl && hasValidGpsText(gpsEl.value)) {
            updateGpsLockState(true);
            return;
        }
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const str = `${lat}, ${lng}`;
        if (gpsEl) gpsEl.value = str;
        currentDraftAnswers['A05'] = str;
        currentDraftAnswers['_gps_text'] = str;
        updateGpsLockState(true);
        stopBackgroundGpsTracker();
        saveDraftLocal(false);
        if (typeof sendTeamLocationPing === 'function') {
            sendTeamLocationPing(lat, lng, Math.round(pos.coords.accuracy || 0), 'Lấy GPS thực địa');
        }
        alert(`Đã lấy & khóa tọa độ GPS lần đầu:\nVĩ độ: ${lat}\nKinh độ: ${lng}\nĐộ chính xác: ±${Math.round(pos.coords.accuracy)} mét`);
    };

    const showDeniedHelp = (err) => {
        if (err && err.code === 1) {
            alert(
                'Thiết bị/trình duyệt đang CHẶN quyền Vị trí (User denied Geolocation).\n\n' +
                'Cách khắc phục nhanh:\n' +
                '1. Nếu bạn mở link từ Zalo / Messenger: bấm dấu ⋮ góc trên phải → chọn "Mở bằng Chrome / Safari".\n' +
                '2. Kiểm tra đã bật Vị trí (GPS) trên điện thoại.\n' +
                '3. Bấm biểu tượng ổ khóa (hoặc Cài đặt) bên trái thanh địa chỉ → Quyền → Vị trí → Cho phép, rồi tải lại trang.\n' +
                '4. Hoặc mở Google Maps → nhấn giữ vị trí → copy tọa độ dán vào ô Tọa Độ GPS.'
            );
        } else {
            alert('Không thể lấy tọa độ tự động (' + (err?.message || 'Lỗi GPS') + '). Hãy ra chỗ thoáng hoặc dán tọa độ từ Google Maps.');
        }
    };

    navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
            if (err && (err.code === 2 || err.code === 3)) {
                navigator.geolocation.getCurrentPosition(
                    onSuccess,
                    showDeniedHelp,
                    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
                );
            } else {
                showDeniedHelp(err);
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
}

// ========================================================
// 7B. CHỤP ẢNH ĐẦU TIÊN CÙNG CHỦ HỘ & ĐÓNG WATERMARK THỜI GIAN + VỊ TRÍ
// ========================================================
function getVnTodayIso() {
    return new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
}

function triggerHouseholdPhotoCapture(sourceType = 'camera') {
    if (currentUser?.role === 'viewer' || currentUser?.role === 'admin1') {
        alert('Tài khoản ở chế độ chỉ xem, không được phép chụp ảnh.');
        return;
    }
    try {
        saveActiveScreenState('survey');
        saveDraftLocal(false);
    } catch (_) {}
    const inpId = (sourceType === 'gallery') ? 'householdPhotoGalleryInput' : 'householdPhotoInput';
    const input = document.getElementById(inpId) || document.getElementById('householdPhotoInput');
    if (input) {
        input.value = '';
        input.click();
    }
}

function setHouseholdPhotoPreview(dataUrl, metaText) {
    currentHouseholdPhotoData = dataUrl || '';
    if (currentHouseholdPhotoData.startsWith('data:')) {
        currentDraftPhotoPath = '';
    }
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
    updatePhotoLockState();
}

let liveClockTimer = null;
let bgGpsWatchId = null;
let bgGpsStopTimeout = null;
let bgBestGps = null;

function updatePhotoLockState() {
    const imgSrc = document.getElementById('photoPreviewImg')?.getAttribute('src') || '';
    const hasPhoto = Boolean((currentHouseholdPhotoData && currentHouseholdPhotoData.trim()) || currentDraftPhotoPath || imgSrc);
    const isReadOnlyOrAdmin = (currentUser?.role === 'viewer' || Boolean(editingSurveyId));

    const lockEl = document.getElementById('photoRequiredLock');
    const progEl = document.getElementById('surveyProgressBar');
    const navEl = document.getElementById('sectionJumpNav');
    const stepEl = document.getElementById('sectionStepNav');
    const qBoxEl = document.getElementById('surveyQuestionsBox');

    // Luôn hiển thị bảng câu hỏi & thanh phần A-G (không ẩn nhập nhằng); chỉ hiện nhắc chụp ảnh khi chưa có ảnh
    if (lockEl) lockEl.style.display = (hasPhoto || isReadOnlyOrAdmin) ? 'none' : 'block';
    if (progEl) progEl.style.display = 'flex';
    if (navEl && getToolSections().length > 1) navEl.style.display = 'flex';
    if (stepEl && getToolSections().length > 1) stepEl.style.display = 'flex';
    if (qBoxEl) qBoxEl.style.display = 'block';
}

function startRealtimeInterviewClock() {
    if (!currentDraftAnswers._started_at) {
        currentDraftAnswers._started_at = new Date().toISOString();
    }
    if (liveClockTimer) clearInterval(liveClockTimer);

    const tick = () => {
        const el = document.getElementById('liveInterviewClock');
        if (!el || !currentDraftAnswers._started_at) return;
        const start = new Date(currentDraftAnswers._started_at);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`;
        const diffSec = Math.max(0, Math.floor((now - start) / 1000));
        const mm = pad(Math.floor(diffSec / 60));
        const ss = pad(diffSec % 60);
        el.textContent = `Bắt đầu: ${startStr} • Đang phỏng vấn: ${mm}:${ss}`;
    };
    tick();
    liveClockTimer = setInterval(tick, 1000);
}

function stopRealtimeInterviewClock() {
    if (liveClockTimer) {
        clearInterval(liveClockTimer);
        liveClockTimer = null;
    }
    const el = document.getElementById('liveInterviewClock');
    if (el) el.textContent = '';
}

function startBackgroundGpsTracker() {
    stopBackgroundGpsTracker();
    const gpsInputEl = document.getElementById('gpsInput');
    if (gpsInputEl && hasValidGpsText(gpsInputEl.value)) {
        updateGpsLockState(true);
        return;
    }
    if (hasValidGpsText(currentDraftAnswers?._gps_text || '')) {
        if (gpsInputEl) gpsInputEl.value = currentDraftAnswers._gps_text;
        updateGpsLockState(true);
        return;
    }
    bgBestGps = currentDraftAnswers._gps_bg || null;
    if (!navigator.geolocation) return;

    try {
        bgGpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const gpsEl = document.getElementById('gpsInput');
                if (gpsEl && hasValidGpsText(gpsEl.value)) {
                    updateGpsLockState(true);
                    stopBackgroundGpsTracker();
                    return;
                }
                const acc = pos.coords.accuracy || 9999;
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                const str = `${lat}, ${lng}`;
                if (!hasValidGpsText(str)) return;
                bgBestGps = {
                    lat,
                    lng,
                    accuracy: Math.round(acc),
                    timestamp: new Date().toISOString()
                };
                if (gpsEl) gpsEl.value = str;
                currentDraftAnswers._gps_bg = bgBestGps;
                currentDraftAnswers._gps_text = str;
                updateGpsLockState(true);
                stopBackgroundGpsTracker();
                saveDraftLocal(false);
                if (typeof sendTeamLocationPing === 'function') {
                    sendTeamLocationPing(lat, lng, Math.round(acc), 'GPS nền hiện trường');
                }
            },
            () => { /* Chạy ngầm yên lặng, không làm phiền điều tra viên */ },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
        // Tự động chốt tọa độ chuẩn nhất sau tối đa 5 phút (300.000 ms)
        bgGpsStopTimeout = setTimeout(() => {
            stopBackgroundGpsTracker();
        }, 5 * 60 * 1000);
    } catch (_) {
        // Silent fallback
    }
}

function stopBackgroundGpsTracker() {
    if (bgGpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(bgGpsWatchId);
        bgGpsWatchId = null;
    }
    if (bgGpsStopTimeout) {
        clearTimeout(bgGpsStopTimeout);
        bgGpsStopTimeout = null;
    }
}

function clearHouseholdPhoto(silent = false) {
    const input = document.getElementById('householdPhotoInput');
    if (input) input.value = '';
    if (!silent) currentDraftPhotoPath = '';
    setHouseholdPhotoPreview('', '');
    if (!silent) {
        saveDraftLocal(false);
    }
}

function getFreshGpsString(timeoutMs = 6000) {
    return new Promise((resolve) => {
        const gpsEl = document.getElementById('gpsInput');
        const existing = gpsEl ? gpsEl.value.trim() : '';
        if (hasValidGpsText(existing)) {
            updateGpsLockState(true);
            resolve(existing);
            return;
        }
        if (bgBestGps && bgBestGps.lat && bgBestGps.lng && hasValidGpsText(`${bgBestGps.lat}, ${bgBestGps.lng}`)) {
            const bgStr = `${bgBestGps.lat}, ${bgBestGps.lng}`;
            if (gpsEl && !hasValidGpsText(gpsEl.value)) gpsEl.value = bgStr;
            if (currentDraftAnswers && !hasValidGpsText(currentDraftAnswers._gps_text || '')) currentDraftAnswers._gps_text = bgStr;
            updateGpsLockState(true);
            resolve(bgStr);
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
                if (gpsEl && !hasValidGpsText(gpsEl.value)) {
                    gpsEl.value = str;
                    updateGpsLockState(true);
                }
                if (currentDraftAnswers) {
                    if (!hasValidGpsText(currentDraftAnswers['A05'] || '')) currentDraftAnswers['A05'] = str;
                    if (!hasValidGpsText(currentDraftAnswers._gps_text || '')) currentDraftAnswers._gps_text = str;
                }
                if (typeof sendTeamLocationPing === 'function') {
                    sendTeamLocationPing(lat, lng, Math.round(pos.coords.accuracy || 0), 'Chụp ảnh người PV');
                }
                resolve(gpsEl && hasValidGpsText(gpsEl.value) ? gpsEl.value.trim() : str);
            },
            () => resolve('Chưa có GPS'),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
        );
    });
}

function formatWgs84Display(gpsStr) {
    const parts = String(gpsStr || '').split(',').map(x => parseFloat(String(x).trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Math.abs(parts[0]) > 0.01 && Math.abs(parts[1]) > 0.01) {
        return `Lat ${parts[0].toFixed(6)}, Long ${parts[1].toFixed(6)} (WGS84)`;
    }
    return gpsStr || 'Chưa có tọa độ WGS84';
}

function drawFittedWatermarkLine(ctx, text, x, y, baseSize, isBold, maxWidth) {
    let sz = baseSize;
    while (sz > 10) {
        ctx.font = `${isBold ? 'bold ' : ''}${sz}px Arial, sans-serif`;
        if (ctx.measureText(text).width <= maxWidth) break;
        sz -= 1;
    }
    ctx.fillText(text, x, y);
}

async function handlePhotoSelected(event) {
    const inputEl = event.target;
    const file = inputEl?.files && inputEl.files[0];
    if (!file) return;

    saveActiveScreenState('survey');
    saveDraftLocal(false);

    const status = document.getElementById('photoWatermarkStatus');
    if (status) {
        status.style.color = '#d97706';
        status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý ảnh &amp; đóng watermark...';
    }

    const gpsTimeoutMs = (bgBestGps && bgBestGps.lat && bgBestGps.lng) ? 800 : 2500;
    const gpsStr = await getFreshGpsString(gpsTimeoutMs);
    const wgs84Text = formatWgs84Display(gpsStr);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const surveyCode = (document.getElementById('surveyCodeInput')?.value || '').trim() || currentTool;
    const commune = (document.getElementById('communeSelect')?.value || '').trim();
    const hamlet = (document.getElementById('hamletInput')?.value || '').trim();
    const respondentName = (document.getElementById('respondentNameInput')?.value || '').trim()
        || (document.getElementById('headNameInput')?.value || '').trim()
        || 'Người được phỏng vấn';
    const relationVal = (document.getElementById('respondentRelationSelect')?.value || '').trim();
    const respondentLabel = (relationVal && relationVal !== 'Chủ hộ')
        ? `${respondentName} (${relationVal})`
        : respondentName;
    const surveyorName = currentUser?.full_name || 'Điều tra viên';
    const surveyorId = currentUser?.surveyor_id || 'DTV';

    const drawAndSaveSource = async (source, rawW, rawH, cleanupFn) => {
        const canvas = document.createElement('canvas');
        try {
            const maxDim = 1024;
            let w = rawW || 1024;
            let h = rawH || 768;
            if (w > maxDim || h > maxDim) {
                if (w >= h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Không khởi tạo được bộ xử lý ảnh của trình duyệt');
            ctx.drawImage(source, 0, 0, w, h);
            // Giải phóng bitmap camera ngay sau khi vẽ lên canvas để tránh tràn RAM trên iPhone/Android
            if (typeof cleanupFn === 'function') {
                cleanupFn();
                cleanupFn = null;
            }

            const fontSize = Math.max(13, Math.round(w * 0.020));
            const lineHeight = Math.round(fontSize * 1.45);
            const padding = Math.round(fontSize * 0.8);
            const barHeight = lineHeight * 3 + padding * 1.6;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            ctx.fillRect(0, h - barHeight, w, barHeight);

            ctx.fillStyle = '#4ade80';
            ctx.fillRect(0, h - barHeight, Math.max(4, Math.round(w * 0.006)), barHeight);

            ctx.textBaseline = 'top';
            const startY = h - barHeight + padding * 0.7;
            const leftX = padding + 6;
            const maxTextW = Math.max(120, w - leftX - padding);

            const line1 = `DAKMAN CƯ M'GAR | Mã: ${surveyCode} | Người được PV: ${respondentLabel}`;
            const line2 = `Vị trí ${wgs84Text} | ${timestampStr}`;
            const line3 = `Địa bàn: ${commune}${hamlet ? ' - ' + hamlet : ''} | ĐTV: ${surveyorName} (${surveyorId})`;

            ctx.fillStyle = '#ffffff';
            drawFittedWatermarkLine(ctx, line1, leftX, startY, fontSize, true, maxTextW);
            ctx.fillStyle = '#fde047';
            drawFittedWatermarkLine(ctx, line2, leftX, startY + lineHeight, fontSize, false, maxTextW);
            ctx.fillStyle = '#e2e8f0';
            drawFittedWatermarkLine(ctx, line3, leftX, startY + lineHeight * 2, fontSize, false, maxTextW);

            let dataUrl = canvas.toDataURL('image/jpeg', 0.76);
            if (!dataUrl || dataUrl.length < 1000 || dataUrl === 'data:,') {
                dataUrl = canvas.toDataURL('image/jpeg', 0.68);
            }
            if (!dataUrl || dataUrl.length < 1000 || dataUrl === 'data:,') {
                throw new Error('Thiết bị thiếu bộ nhớ tạm khi nén ảnh. Hãy thử Chọn từ Thư viện ảnh.');
            }
            const metaText = `${timestampStr} | ${wgs84Text} | Người PV: ${respondentLabel} | ${surveyCode}`;
            setHouseholdPhotoPreview(dataUrl, metaText);
            startRealtimeInterviewClock();
            startBackgroundGpsTracker();
            saveDraftLocal(false);
            const fullRec = buildCurrentDraftRecord();
            fullRec.sync_pending = true;
            await putIdbDraft(fullRec).catch(() => {});
            if (navigator.onLine && currentUser?.role !== 'viewer' && currentUser?.role !== 'admin1') {
                if (status) {
                    status.style.color = '#0369a1';
                    status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đã đóng watermark — Đang đẩy ảnh lên VPS...';
                }
                let ok = await syncCurrentDraftToVps(fullRec);
                if (!ok) {
                    await new Promise(r => setTimeout(r, 900));
                    ok = await syncCurrentDraftToVps(fullRec);
                }
                await refreshDraftBadgeCount(false);
                if (ok && status) {
                    status.style.color = '#15803d';
                    status.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã đóng watermark &amp; lưu ảnh lên VPS!';
                }
            }
        } catch (err) {
            alert('Không thể xử lý ảnh watermark: ' + err.message);
            clearHouseholdPhoto(true);
        } finally {
            canvas.width = 0;
            canvas.height = 0;
            if (typeof cleanupFn === 'function') cleanupFn();
            if (inputEl) inputEl.value = '';
        }
    };

    // Giải mã bitmap (không truyền resizeWidth để tránh tự phóng to ảnh nhỏ) và đóng ngay sau khi vẽ canvas
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file);
            await drawAndSaveSource(bitmap, bitmap.width, bitmap.height, () => {
                try { bitmap.close(); } catch (_) {}
            });
            return;
        } catch (_) {
            // Fall through to Image() fallback for older browsers
        }
    }

    await new Promise((resolve) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = async () => {
            await drawAndSaveSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height, () => {
                URL.revokeObjectURL(objectUrl);
            });
            resolve();
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            if (inputEl) inputEl.value = '';
            alert('Tệp ảnh không hợp lệ hoặc bị lỗi.');
            clearHouseholdPhoto(true);
            resolve();
        };
        img.src = objectUrl;
    });
}

// ========================================================
// 8. GỬI PHIẾU KHẢO SÁT LÊN HỆ THỐNG
// ========================================================
async function handleSurveySubmit(e) {
    e.preventDefault();
    if (currentUser?.role === 'viewer' || currentUser?.role === 'admin1') {
        alert('Tài khoản hiện tại ở chế độ Chỉ Xem, không được phép nộp phiếu.');
        return;
    }
    if (currentUser?.role === 'admin' && !editingSurveyId) {
        alert('Tài khoản Admin dùng để quản lý & rà soát dữ liệu, không tạo mới phiếu điều tra!');
        return;
    }

    const surveyCode = document.getElementById('surveyCodeInput').value.trim();
    const commune = document.getElementById('communeSelect').value;
    const hamlet = document.getElementById('hamletInput').value.trim();
    const headName = (document.getElementById('headNameInput')?.value || '').trim();
    const headGender = document.getElementById('headGenderSelect')?.value || '';
    const headBirthYear = (document.getElementById('headBirthYearInput')?.value || '').trim();
    const relSel = document.getElementById('respondentRelationSelect')?.value || 'Chủ hộ';
    const relOther = (document.getElementById('respondentRelationOther')?.value || '').trim();
    const sameAsHead = (currentTool === 'P1' && relSel === 'Chủ hộ');
    const respondentName = sameAsHead ? headName : document.getElementById('respondentNameInput').value.trim();
    const respGender = sameAsHead ? headGender : (document.getElementById('respondentGenderSelect')?.value || '');
    const respBirthYear = sameAsHead ? headBirthYear : (document.getElementById('respondentBirthYearInput')?.value || '').trim();
    const respRelation = (currentTool !== 'P1')
        ? (currentDraftAnswers['_resp_relation'] || 'Đại diện đơn vị / Khác')
        : ((relSel === 'Khác') ? relOther : relSel);

    if (currentTool === 'P1') {
        if (!headName) {
            alert('Vui lòng nhập Họ tên Chủ hộ!');
            document.getElementById('headNameInput')?.focus();
            return;
        }
        if (!headGender) {
            alert('Vui lòng chọn Giới tính Chủ hộ (Nam / Nữ)!');
            document.getElementById('headGenderSelect')?.focus();
            return;
        }
        const hByNum = parseInt(headBirthYear, 10);
        if (!headBirthYear || isNaN(hByNum) || hByNum < 1920 || hByNum > 2012) {
            alert('Vui lòng nhập Năm sinh Chủ hộ hợp lệ (1920 – 2012)!');
            document.getElementById('headBirthYearInput')?.focus();
            return;
        }
        if (!respRelation) {
            alert('Vui lòng chọn hoặc ghi rõ Quan hệ của người được phỏng vấn với Chủ hộ!');
            if (relSel === 'Khác') document.getElementById('respondentRelationOther')?.focus();
            else document.getElementById('respondentRelationSelect')?.focus();
            return;
        }
        if (!sameAsHead) {
            if (!respondentName) {
                alert('Vui lòng nhập Họ tên Người trả lời thay Chủ hộ!');
                document.getElementById('respondentNameInput')?.focus();
                return;
            }
            if (!respGender) {
                alert('Vui lòng chọn Giới tính Người trả lời (Nam / Nữ)!');
                document.getElementById('respondentGenderSelect')?.focus();
                return;
            }
            const rByNum = parseInt(respBirthYear, 10);
            if (!respBirthYear || isNaN(rByNum) || rByNum < 1920 || rByNum > 2012) {
                alert('Vui lòng nhập Năm sinh Người trả lời hợp lệ (1920 – 2012)!');
                document.getElementById('respondentBirthYearInput')?.focus();
                return;
            }
        }
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ĐANG LƯU VÀ HOÀN THÀNH PHIẾU...';

    const phoneInputVal = (document.getElementById('phoneInput')?.value || '').trim();
    const guideInputVal = (document.getElementById('guideNameInput')?.value || '').trim();
    if (phoneInputVal) currentDraftAnswers['_phone'] = phoneInputVal;
    if (guideInputVal) currentDraftAnswers['_guide'] = guideInputVal;
    currentDraftAnswers['_head_name'] = headName || respondentName;
    currentDraftAnswers['_head_gender'] = headGender;
    currentDraftAnswers['_head_birth_year'] = headBirthYear;
    currentDraftAnswers['_same_as_head'] = sameAsHead;
    currentDraftAnswers['_resp_name'] = respondentName;
    currentDraftAnswers['_resp_gender'] = respGender;
    currentDraftAnswers['_resp_birth_year'] = respBirthYear;
    currentDraftAnswers['_resp_relation'] = respRelation || (currentTool === 'P1' ? 'Chủ hộ' : '');
    currentDraftAnswers['_resp_relation_other'] = relOther;
    const nowIso = new Date().toISOString();
    if (!currentDraftAnswers['_started_at']) currentDraftAnswers['_started_at'] = nowIso;
    currentDraftAnswers['_completed_at'] = nowIso;
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
        surveyor_id: currentUser?.surveyor_id || 'TCN01',
        surveyor_name: currentUser?.full_name || 'Điều tra viên',
        survey_date: document.getElementById('surveyDateInput').value || getVnTodayIso(),
        commune: commune,
        hamlet: hamlet,
        target_group: toolObj.group || 'Chung',
        respondent_name: respondentName,
        respondent_phone: phoneInputVal,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        photo_data: currentHouseholdPhotoData || '',
        photo_path: currentDraftPhotoPath || '',
        draft_key: `${currentTool}::${surveyCode}`,
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

            localStorage.removeItem(`dakman_draft_${currentTool}`);
            clearActiveScreenState();
            await deleteIdbDraft(`${currentTool}::${surveyCode}`);
            await loadHouseholdLocks();
            await refreshDraftBadgeCount(true);
            await refreshDashboardData();
            await loadSurveysList();
            updateMenuSummaryBadges();

            showCompletionModal({
                id: savedId,
                survey_code: surveyCode,
                respondent_name: respondentName,
                commune,
                hamlet,
                guide: guideInputVal || currentDraftAnswers['_guide'] || '',
                gps: gpsStr,
                isEditing
            });
        } else {
            const err = await res.json();
            alert('Lỗi từ máy chủ: ' + (err.error || 'Không thể lưu phiếu'));
        }
    } catch (err) {
        saveToOfflineQueue(payload);
        alert('Máy chủ tạm thời chưa phản hồi hoặc mất kết nối mạng.\n\nPhiếu của bạn ĐÃ ĐƯỢC LƯU AN TOÀN vào HÀNG ĐỢI OFFLINE trên thiết bị và sẽ tự động đồng bộ lên VPS ngay khi có mạng!');
    } finally {
        btn.disabled = false;
        btn.innerHTML = editingSurveyId
            ? `<i class="fa-solid fa-floppy-disk"></i> CẬP NHẬT LẠI PHIẾU [${escapeHtml(surveyCode)}]`
            : '<i class="fa-solid fa-circle-check"></i> LƯU VÀ HOÀN THÀNH PHIẾU';
    }
}

function showCompletionModal(info) {
    const modal = document.getElementById('surveyCompletionModal');
    if (!modal) return;
    const nameEl = document.getElementById('completionRespondentName');
    const codeEl = document.getElementById('completionSurveyCode');
    const metaEl = document.getElementById('completionMetaSummary');
    const btnRev = document.getElementById('btnCompletionReview');
    const btnEdit = document.getElementById('btnCompletionEdit');
    const btnPdf = document.getElementById('btnCompletionPdf');

    if (nameEl) nameEl.textContent = info.respondent_name || 'Quý hộ gia đình';
    if (codeEl) codeEl.textContent = info.survey_code || '—';
    if (metaEl) {
        metaEl.innerHTML = `
            <div><strong>Địa bàn:</strong> ${escapeHtml(info.commune || '')}${info.hamlet ? ` (${escapeHtml(info.hamlet)})` : ''}</div>
            <div><strong>Người dẫn đường:</strong> ${escapeHtml(info.guide || '—')}</div>
            <div><strong>Tọa độ GPS lưu ngầm:</strong> ${escapeHtml(info.gps || 'Đã ghi nhận theo phiên')}</div>
            <div><strong>Trạng thái:</strong> <span style="color:#15803d; font-weight:700;">${info.isEditing ? 'Đã cập nhật bổ sung thành công' : 'Đã lưu chính thức & sao lưu trên VPS'}</span></div>
        `;
    }
    if (btnRev) {
        btnRev.onclick = () => {
            modal.classList.remove('active');
            viewSurveyDetail(info.id, { fromCompletion: true });
        };
    }
    if (btnEdit) {
        btnEdit.onclick = () => {
            modal.classList.remove('active');
            reloadSurveyIntoForm(info.id);
        };
    }
    if (btnPdf) {
        btnPdf.href = getPdfExportUrl(info.id);
    }
    modal.classList.add('active');
}

async function finishAfterCompletion() {
    const modal = document.getElementById('surveyCompletionModal');
    if (modal) modal.classList.remove('active');

    currentDraftAnswers = {};
    editingSurveyId = null;
    currentDraftPhotoPath = '';
    stopBackgroundGpsTracker();
    stopRealtimeInterviewClock();
    clearHouseholdPhoto(true);

    ['surveyCodeInput', 'hamletInput', 'headNameInput', 'headGenderSelect', 'headBirthYearInput', 'respondentNameInput', 'respondentGenderSelect', 'respondentBirthYearInput', 'respondentRelationOther', 'phoneInput', 'guideNameInput', 'gpsInput'].forEach(fid => {
        const el = document.getElementById(fid);
        if (el) el.value = '';
    });
    const relSel = document.getElementById('respondentRelationSelect');
    if (relSel) relSel.value = 'Chủ hộ';
    updateRespondentSubRowVisibility();
    const banner = document.getElementById('sampleSelectedBanner');
    if (banner) banner.style.display = 'none';
    const btn = document.getElementById('btnSubmitForm');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> LƯU VÀ HOÀN THÀNH PHIẾU';

    await selectTool(currentTool);
    filterSampleHouseholds();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function saveToOfflineQueue(surveyData) {
    const queue = JSON.parse(localStorage.getItem('dakman_offline_queue') || '[]');
    queue.push(surveyData);
    localStorage.setItem('dakman_offline_queue', JSON.stringify(queue));
}

async function syncOfflineQueue(silent = false) {
    const raw = localStorage.getItem('dakman_offline_queue');
    if (!raw) return;
    let queue = [];
    try { queue = JSON.parse(raw) || []; } catch (_) { return; }
    if (!queue.length || !navigator.onLine) return;

    const remaining = [];
    let syncedCount = 0;
    for (const item of queue) {
        try {
            const res = await fetch(apiUrl('/api/surveys'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (res.ok) syncedCount++;
            else remaining.push(item);
        } catch (_) {
            remaining.push(item);
        }
    }
    localStorage.setItem('dakman_offline_queue', JSON.stringify(remaining));
    if (syncedCount > 0) {
        await refreshDashboardData();
        await loadSurveysList();
        if (!silent) {
            alert(`Đã tự động đồng bộ thành công ${syncedCount} phiếu từ hàng đợi Offline lên máy chủ VPS!`);
        }
    }
}

async function triggerDailyEmailReport() {
    if (currentUser?.role !== 'admin') {
        alert('Chỉ Quản trị viên (Admin) mới được phép gửi báo cáo email tổng hợp!');
        return;
    }
    const btn = document.getElementById('btnSendDailyEmail');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo Excel & gửi email...';
    }
    try {
        const res = await fetch(apiUrl('/api/admin/send-daily-report'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(`THÀNH CÔNG!\n${data.message}`);
        } else {
            alert('Không gửi được email: ' + (data.error || 'Lỗi máy chủ'));
        }
    } catch (e) {
        alert('Lỗi kết nối khi gửi email: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-envelope"></i> Gửi Email Tổng Hợp Cuối Ngày';
        }
    }
}

// ========================================================
// 9. BÁO CÁO TIẾN ĐỘ THỰC ĐỊA (DASHBOARD)
// ========================================================
async function refreshDashboardData() {
    try {
        const res = await fetch(apiUrl('/api/stats'));
        if (!res.ok) return;
        const data = await res.json();
        window._cachedDashStats = data;

        const counts = data.tool_counts || {};
        const totalCombined = (data.total_combined_forms !== undefined)
            ? data.total_combined_forms
            : ((data.total_unique_completed !== undefined)
                ? data.total_unique_completed
                : ((counts['P1'] || 0) + (counts['MH'] || 0) + (counts['NT'] || 0) + (counts['CQ'] || 0) + (counts['HTX'] || 0) + (counts['TT'] || 0)));
        const p1Comp = counts['P1'] || 0;
        const targetTotal = (data.targets && data.targets.total_forms) ? data.targets.total_forms : 240;
        const totalPct = Math.min(100, (totalCombined / targetTotal) * 100).toFixed(1);

        const elTotal = document.getElementById('statDashCompleted');
        const elTotalSub = document.getElementById('statDashCompletedSub');
        const elP1 = document.getElementById('statDashP1');
        const elPct = document.getElementById('statDashPercent');

        if (elTotal) elTotal.textContent = `${totalCombined} / ${targetTotal}`;
        if (elTotalSub && (data.total_completed !== undefined || data.total_drafts !== undefined)) {
            elTotalSub.textContent = `${data.total_drafts || 0} phiếu tạm + ${data.total_completed || 0} đã nộp (lọc trùng mã)`;
        }
        if (elP1) elP1.textContent = `${p1Comp} / 220`;
        if (elPct) elPct.textContent = `${totalPct}%`;
        updateMenuSummaryBadges();

        renderGroupProgressTable(data);
        renderCommuneProgressTable(data);
        if (typeof loadTeamLocationsMap === 'function') {
            loadTeamLocationsMap(false);
        }
    } catch (e) {
        console.warn('Không tải được số liệu thống kê:', e);
    }
}

function renderGroupProgressTable(data) {
    const tbody = document.getElementById('groupProgressTbody');
    if (!tbody) return;

    const counts = data.tool_counts || {};
    const rows = [
        {
            name: '1. Hộ nông dân',
            code: 'P1',
            type: 'Phỏng vấn trực tiếp hộ nông dân (đếm phiếu tạm + đã nộp)',
            target: 220,
            actual: counts['P1'] || 0
        },
        {
            name: '2. Chủ mô hình trình diễn',
            code: 'MH',
            type: 'Phỏng vấn sâu chủ mô hình trình diễn',
            target: 2,
            actual: counts['MH'] || 0
        },
        {
            name: '3. Nhóm trưởng, đại diện nhóm hộ và trưởng thôn (gộp chung)',
            code: 'NT',
            type: 'Phỏng vấn sâu / thảo luận gộp nhóm đối tượng',
            target: 10,
            actual: counts['NT'] || 0
        },
        {
            name: '4. Chính quyền địa phương – đại diện 3 xã',
            code: 'CQ',
            type: 'Tham vấn chính quyền cấp xã',
            target: 3,
            actual: counts['CQ'] || 0
        },
        {
            name: '5. Ban quản lý 3 HTX',
            code: 'HTX',
            type: 'Phỏng vấn sâu ban quản lý HTX',
            target: 3,
            actual: counts['HTX'] || 0
        },
        {
            name: "6. Nhà tài trợ (IDH và JDE Peet's)",
            code: 'TT',
            type: 'Phỏng vấn chuyên sâu đối tác tài trợ',
            target: 2,
            actual: counts['TT'] || 0
        }
    ];

    const totalTarget = rows.reduce((s, r) => s + r.target, 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    const totalPct = Math.min(100, (totalActual / totalTarget) * 100).toFixed(1);

    tbody.innerHTML = rows.map(g => {
        const pct = Math.min(100, ((g.actual / g.target) * 100)).toFixed(1);
        const badge = g.actual >= g.target
            ? '<span class="stat-badge pass">Đạt chỉ tiêu</span>'
            : '<span class="stat-badge pending">Đang thực hiện</span>';

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
    }).join('') + `
        <tr style="background: #eff6ff; font-weight: 800; border-top: 2px solid #93c5fd;">
            <td>TỔNG CỘNG (6 ĐỐI TƯỢNG — ĐẾM PHIẾU TẠM + ĐÃ NỘP)</td>
            <td style="font-family: monospace; color: #002060;">P1, MH, NT, CQ, HTX, TT</td>
            <td>Tổng cộng 240 phiếu toàn dự án (phiếu tạm + đã hoàn thành)</td>
            <td style="text-align: center; color: #002060;">${totalTarget}</td>
            <td style="text-align: center; color: #15803d;">${totalActual}</td>
            <td style="text-align: center; color: #002060;">${totalPct}%</td>
            <td style="text-align: center;">${totalActual >= totalTarget ? '<span class="stat-badge pass">Hoàn thành</span>' : '<span class="stat-badge pending">Đang thực hiện</span>'}</td>
        </tr>
    `;
}

function renderCommuneProgressTable(data) {
    const tbody = document.getElementById('communeProgressTbody');
    if (!tbody) return;

    const commCounts = data.commune_counts || {};
    const eakiet = commCounts['Ea Kiết'] || 0;
    const eatul = commCounts['Ea Tul'] || 0;
    const cdmn = commCounts["Cư Dliê M'nông"] || 0;

    const list = [
        {
            name: 'Xã Ea Kiết',
            schedule: 'Theo phân công thực địa',
            team: 'Lê Đình Duy (TCN07) & Phan Doãn Vọng (TCN02)',
            target: 72,
            actual: eakiet
        },
        {
            name: 'Xã Ea Tul',
            schedule: 'Theo phân công thực địa',
            team: 'Nguyễn Viết Trụ (TCN04), Cao Thị Phúc (TCN05), Hoàng Trường Sinh (TCN06), Phạm Văn Thao (TCN03)',
            target: 139,
            actual: eatul
        },
        {
            name: "Xã Cư Dliê M'nông",
            schedule: 'Theo phân công thực địa',
            team: 'Phạm Văn Thao (TCN03)',
            target: 9,
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
let surveysListFetchPromise = null;

const OWNER_ALIAS_GROUPS = [
    { ids: ['TCN07', 'TCN01', 'TCN-47-195006'], name: 'le dinh duy' },
    { ids: ['TCN02', 'TCN-55-195011'], name: 'phan doan vong' },
    { ids: ['TCN03'], name: 'pham van thao' },
    { ids: ['TCN04'], name: 'nguyen viet tru' },
    { ids: ['TCN05'], name: 'cao thi phuc' },
    { ids: ['TCN06', 'TCN-65-074755'], name: 'hoang truong sinh' },
    { ids: ['TCN08'], name: 'dinh van nam' }
];

function normViNameOwner(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[đĐ]/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function isDraftStrictlyOwnedByCurrentUser(rec) {
    if (!rec) return false;
    const role = currentUser?.role || 'viewer';
    if (role === 'admin') return true;
    if (role !== 'editor') return false;
    const mySid = String(currentUser?.surveyor_id || '').trim().toUpperCase();
    const myName = normViNameOwner(currentUser?.full_name || currentUser?.surveyor_name || currentUser?.name || '');
    const recSid = String(rec.surveyor_id || '').trim().toUpperCase();
    const recName = normViNameOwner(rec.surveyor_name || '');

    if (recSid && !['', 'DTV', 'GUEST', 'USER'].includes(recSid)) {
        if (mySid && recSid === mySid) return true;
        for (const grp of OWNER_ALIAS_GROUPS) {
            const myMatch = (mySid && grp.ids.includes(mySid)) || (myName && myName === grp.name);
            if (myMatch && (grp.ids.includes(recSid) || (recName && recName === grp.name))) {
                return true;
            }
        }
        return false;
    }

    if (recName && !['dieu tra vien', 'guest', 'user'].includes(recName) && myName && recName === myName) {
        return true;
    }
    return false;
}

function isCurrentUserOwnerOf(recordSurveyorId, recordSurveyorName = '', isLocalDeviceOnly = false) {
    const role = currentUser?.role || 'viewer';
    if (role === 'admin') return true;
    if (role !== 'editor') return false;
    if (isLocalDeviceOnly) return true;
    const recSid = String(recordSurveyorId || '').trim().toUpperCase();
    const recName = normViNameOwner(recordSurveyorName);
    const mySid = String(currentUser?.surveyor_id || '').trim().toUpperCase();
    const myName = normViNameOwner(currentUser?.full_name || currentUser?.surveyor_name || currentUser?.name || '');
    if (['', 'DTV', 'GUEST', 'USER'].includes(recSid)) return true;
    if (!mySid && !myName) return false;
    if (recSid && mySid && recSid === mySid) return true;
    for (const grp of OWNER_ALIAS_GROUPS) {
        const myMatch = (mySid && grp.ids.includes(mySid)) || (myName && myName === grp.name);
        if (myMatch) {
            if (recSid && grp.ids.includes(recSid)) return true;
            if (recName && recName === grp.name) return true;
        }
    }
    if (recName && myName && recName === myName) return true;
    return false;
}

function recordMatchesStaffId(rec, targetSid) {
    const target = String(targetSid || '').trim().toUpperCase();
    if (!target) return true;
    const recSid = String(rec?.surveyor_id || '').trim().toUpperCase();
    if (recSid === target) return true;
    const recName = normViNameOwner(rec?.surveyor_name || '');
    const grp = OWNER_ALIAS_GROUPS.find(g => g.ids.includes(target));
    if (grp) {
        if (recSid && grp.ids.includes(recSid)) return true;
        if (recName && recName === grp.name) return true;
    }
    const staffObj = Array.isArray(_cachedHistoryOverview?.staff_summary)
        ? _cachedHistoryOverview.staff_summary.find(s => String(s.surveyor_id || '').trim().toUpperCase() === target)
        : null;
    if (staffObj && recName && normViNameOwner(staffObj.full_name) === recName) {
        return true;
    }
    return false;
}

let _cachedCompletedSurveysList = [];
let _cachedHistoryDraftsList = [];
let _cachedHistoryOverview = null;
let _historyFilterSurveyorId = '';

function notifyAdmin1NoSurveyDetail() {
    alert('Tài khoản Admin1 chỉ được xem tổng hợp tiến độ hoàn thành, phiếu đang lưu tạm, tồn lại của 06 Điều tra viên và điều hướng sang Bản đồ / Thư viện ảnh. Không thể xem nội dung câu trả lời chi tiết của từng phiếu phỏng vấn!');
}

function getAdminStatusBadgeHtml(statusVal, noteText) {
    const st = String(statusVal || '').trim();
    const note = String(noteText || '').trim();
    if (!st && !note) return '';
    let bg = '#e0f2fe', fg = '#075985', border = '#bae6fd';
    if (st === 'Đã duyệt') {
        bg = '#dcfce7'; fg = '#166534'; border = '#86efac';
    } else if (st === 'Cần bổ sung') {
        bg = '#fef3c7'; fg = '#92400e'; border = '#fcd34d';
    } else if (st === 'Lưu ý') {
        bg = '#fce7f3'; fg = '#9d174d'; border = '#fbcfe8';
    }
    const label = st || 'Góp ý Admin';
    const snippet = note ? `: ${note.length > 55 ? note.slice(0, 55) + '…' : note}` : '';
    return `<div style="margin-top:3px;"><span style="display:inline-block; background:${bg}; color:${fg}; border:1px solid ${border}; padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700;" title="${escapeHtml(note || label)}"><i class="fa-solid fa-comment-dots"></i> ${escapeHtml(label)}${escapeHtml(snippet)}</span></div>`;
}

function extractItemDateKeyVN(item) {
    const raw = String(item?.survey_date || item?.created_at || item?.updated_at || '').trim();
    const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
    const vnMatch = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (vnMatch) {
        return `${vnMatch[1]}/${vnMatch[2]}/${vnMatch[3]}`;
    }
    return 'Khác';
}

function extractItemSortTimestamp(item) {
    const candidates = [item?.updated_at, item?.created_at, item?.survey_date];
    for (const c of candidates) {
        if (!c) continue;
        const s = String(c).trim();
        const iso = s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s;
        const ms = Date.parse(iso);
        if (!Number.isNaN(ms)) return ms;
    }
    return Number(item?.id || 0);
}

function renderFocusedInterviewerCard() {
    const card = document.getElementById('historyFocusedInterviewerCard');
    if (!card) return;
    const sid = String(_historyFilterSurveyorId || '').trim().toUpperCase();
    if (!sid) {
        card.style.display = 'none';
        card.innerHTML = '';
        return;
    }

    const summary = Array.isArray(_cachedHistoryOverview?.staff_summary) ? _cachedHistoryOverview.staff_summary : [];
    const m = summary.find(x => String(x.surveyor_id || '').toUpperCase() === sid) || {
        surveyor_id: sid,
        full_name: sid,
        commune: '',
        assigned_target: 0,
        completed_count: 0,
        draft_count: 0,
        remaining_count: 0,
        reminder_text: '',
        reminder_level: 'Nhắc nhở',
        reminder_updated_at: ''
    };
    const role = currentUser?.role || 'editor';
    const isAdmin = (role === 'admin');
    const comp = m.completed_count || 0;
    const dft = m.draft_count || 0;
    const tgt = m.assigned_target || 0;
    const notSubmitted = tgt > 0 ? Math.max(0, tgt - comp) : 0;
    const remLevel = m.reminder_level || 'Nhắc nhở';

    card.style.display = 'block';
    card.innerHTML = `
        <div style="background:#f8fafc; border:1.5px solid #93c5fd; border-left:5px solid #002060; border-radius:8px; padding:12px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:0.94rem; font-weight:800; color:#002060;">
                        <i class="fa-solid fa-user-check"></i> DANH SÁCH HỘ PHỎNG VẤN CỦA [${escapeHtml(sid)}] ${escapeHtml(m.full_name || sid)}
                    </div>
                    <div style="font-size:0.80rem; color:#475569; margin-top:3px;">
                        Địa bàn: <strong>${escapeHtml(m.commune || '—')}</strong> •
                        Đã nộp: <strong style="color:#15803d;">${comp}</strong> •
                        Phiếu tạm: <strong style="color:#b45309;">${dft}</strong> •
                        ${tgt > 0 ? `Còn thiếu theo chỉ tiêu (${tgt}): <strong style="color:${notSubmitted > 0 ? '#dc2626' : '#15803d'};">${notSubmitted} phiếu</strong>` : 'Nhóm phối hợp'}
                    </div>
                    <div style="font-size:0.74rem; color:#64748b; margin-top:2px;">
                        <i class="fa-solid fa-arrow-down-wide-short"></i> Sắp xếp mới nhất lên trên cùng, cũ ở dưới cùng và nhóm theo ngày khảo sát.
                    </div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button type="button" onclick="navigateToPhotoLibraryForMember('${escapeQuotes(sid)}')" class="qgis-btn-secondary" style="font-size:0.76rem; padding:4px 9px; color:#be185d; border-color:#fbcfe8; background:#fdf2f8;">
                        <i class="fa-solid fa-images"></i> Ảnh ĐTV
                    </button>
                    <button type="button" onclick="navigateToMapForMember('${escapeQuotes(sid)}')" class="qgis-btn-secondary" style="font-size:0.76rem; padding:4px 9px; color:#0e7490; border-color:#a5f3fc; background:#ecfeff;">
                        <i class="fa-solid fa-map-location-dot"></i> Bản đồ
                    </button>
                    <button type="button" onclick="setHistorySurveyorFilter('')" class="qgis-btn-secondary" style="font-size:0.76rem; padding:4px 9px;">
                        <i class="fa-solid fa-users"></i> Xem tất cả 06 ĐTV
                    </button>
                </div>
            </div>
            ${isAdmin ? `
                <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #cbd5e1;">
                    <div style="font-size:0.80rem; font-weight:800; color:#92400e; margin-bottom:6px;">
                        <i class="fa-solid fa-bell"></i> Gửi / Cập nhật Nhắc Nhở của Admin cho [${escapeHtml(sid)}] ${escapeHtml(m.full_name || '')}
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start;">
                        <select id="staffReminderLevelSelect" style="padding:7px 9px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; font-weight:700; color:#0f2a4a;">
                            <option value="Nhắc nhở" ${remLevel === 'Nhắc nhở' ? 'selected' : ''}>Nhắc nhở</option>
                            <option value="Cần bổ sung gấp" ${remLevel === 'Cần bổ sung gấp' ? 'selected' : ''}>Cần bổ sung gấp</option>
                            <option value="Đạt tiến độ tốt" ${remLevel === 'Đạt tiến độ tốt' ? 'selected' : ''}>Đạt tiến độ tốt</option>
                        </select>
                        <textarea id="staffReminderTextInput" rows="2" placeholder="Nhập nội dung kiểm tra / nhắc nhở tiến độ hoặc bổ sung phiếu còn thiếu..."
                            style="flex:1; min-width:240px; padding:7px 9px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; font-family:inherit; resize:vertical;">${escapeHtml(m.reminder_text || '')}</textarea>
                        <button type="button" onclick="saveFocusedStaffReminder('${escapeQuotes(sid)}')" class="qgis-btn-primary" style="background:#b45309; border-color:#d97706; padding:7px 14px; font-size:0.82rem;">
                            <i class="fa-solid fa-paper-plane"></i> Lưu &amp; Gửi nhắc nhở
                        </button>
                    </div>
                    <div id="staffReminderSaveStatus" style="font-size:0.75rem; color:#64748b; margin-top:4px;">
                        ${m.reminder_text ? `Đã ghi nhận lúc ${escapeHtml(m.reminder_updated_at || 'gần đây')}` : 'Chưa có nhắc nhở nào cho điều tra viên này.'}
                    </div>
                </div>
            ` : (m.reminder_text ? `
                <div style="margin-top:8px; padding:7px 10px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; font-size:0.79rem; color:#92400e;">
                    <strong><i class="fa-solid fa-bell"></i> ${escapeHtml(remLevel)}:</strong> ${escapeHtml(m.reminder_text)}
                </div>
            ` : '')}
        </div>
    `;
}

async function saveFocusedStaffReminder(sid) {
    if (currentUser?.role !== 'admin') return;
    const textEl = document.getElementById('staffReminderTextInput');
    const levelEl = document.getElementById('staffReminderLevelSelect');
    const statusEl = document.getElementById('staffReminderSaveStatus');
    const reminderText = (textEl?.value || '').trim();
    const reminderLevel = (levelEl?.value || 'Nhắc nhở').trim();
    if (statusEl) {
        statusEl.style.color = '#0369a1';
        statusEl.textContent = 'Đang lưu nhắc nhở lên VPS...';
    }
    try {
        const res = await fetch(apiUrl('/api/staff-reminders'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': currentUser?.key || currentUser?.password || localStorage.getItem('dakman_admin_key') || '',
                'X-User-Role': currentUser?.role || ''
            },
            body: JSON.stringify({
                surveyor_id: sid,
                reminder_text: reminderText,
                reminder_level: reminderLevel,
                updated_by: currentUser?.full_name || 'Admin'
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (Array.isArray(_cachedHistoryOverview?.staff_summary)) {
            const target = _cachedHistoryOverview.staff_summary.find(x => String(x.surveyor_id || '').toUpperCase() === sid.toUpperCase());
            if (target) {
                target.reminder_text = data.reminder?.reminder_text || '';
                target.reminder_level = data.reminder?.reminder_level || reminderLevel;
                target.reminder_updated_at = data.reminder?.updated_at || '';
            }
        }
        renderHistoryInterviewerSummary(_cachedHistoryOverview);
        renderFocusedInterviewerCard();
        showInstantActionToast(reminderText ? `Đã gửi nhắc nhở cho ${sid}!` : `Đã xóa nhắc nhở của ${sid}.`);
    } catch (err) {
        if (statusEl) {
            statusEl.style.color = '#dc2626';
            statusEl.textContent = 'Lỗi lưu nhắc nhở: ' + err.message;
        }
    }
}

async function refreshMyStaffReminderBanner() {
    const el = document.getElementById('editorAdminReminderBanner');
    if (!el) return;
    const role = currentUser?.role || 'viewer';
    const sid = String(currentUser?.surveyor_id || '').trim().toUpperCase();
    if (role !== 'editor' || !sid) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    try {
        const data = await fetchJsonWithTimeout(apiUrl(`/api/staff-reminders?surveyor_id=${encodeURIComponent(sid)}`), 6000);
        if (data && data.reminder_text) {
            el.style.display = 'block';
            el.innerHTML = `
                <div style="font-weight:800; color:#b45309; margin-bottom:2px;">
                    <i class="fa-solid fa-bell"></i> THÔNG BÁO / NHẮC NHỞ TỪ ADMIN (${escapeHtml(data.reminder_level || 'Nhắc nhở')})
                </div>
                <div>${escapeHtml(data.reminder_text)}</div>
                ${data.updated_at ? `<div style="font-size:0.74rem; color:#92400e; margin-top:3px;">Cập nhật: ${escapeHtml(data.updated_at)}</div>` : ''}
            `;
        } else {
            el.style.display = 'none';
            el.innerHTML = '';
        }
    } catch (_) {
        el.style.display = 'none';
    }
}

async function openInterviewerHouseholdsView(surveyorId) {
    const sid = String(surveyorId || '').trim().toUpperCase();
    _historyFilterSurveyorId = sid;
    switchMainView('history');
    if (typeof loadSurveysList === 'function') {
        await loadSurveysList();
    }
    setHistorySurveyorFilter(sid);
    const card = document.getElementById('historyFocusedInterviewerCard');
    if (card && card.style.display !== 'none') {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function setHistorySurveyorFilter(sid = '') {
    _historyFilterSurveyorId = String(sid || '').trim().toUpperCase();
    renderHistorySurveyorFilterPills();
    renderFocusedInterviewerCard();
    filterCompletedSurveysTable();
    const tableEl = document.getElementById('historyFocusedInterviewerCard') || document.getElementById('surveyHistoryTbody');
    if (sid && tableEl) {
        tableEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function navigateToMapForMember(surveyorId) {
    switchMainView('map');
    if (typeof refreshStandaloneTeamMap === 'function') {
        await refreshStandaloneTeamMap(false);
    }
    if (typeof focusMemberOnSharedMap === 'function') {
        focusMemberOnSharedMap('map', surveyorId);
    }
}

async function navigateToPhotoLibraryForMember(surveyorId) {
    const sid = String(surveyorId || '').trim().toUpperCase();
    switchMainView('field-photos');
    if (typeof loadFieldPhotosGallery === 'function') {
        await loadFieldPhotosGallery(false);
    }
    const sel = document.getElementById('fpGalleryFilterSurveyor');
    if (sel) {
        if (sid && !Array.from(sel.options).some(o => o.value.toUpperCase() === sid)) {
            const opt = document.createElement('option');
            opt.value = sid;
            opt.textContent = sid;
            sel.appendChild(opt);
        }
        sel.value = sid;
        if (typeof renderFieldPhotosGallery === 'function') {
            renderFieldPhotosGallery();
        }
    }
}

function navigateToTeamSchedule() {
    switchMainView('schedule', 'team6');
}

function renderHistorySurveyorFilterPills() {
    const pillsEl = document.getElementById('historySurveyorFilterPills');
    if (!pillsEl) return;
    const summary = Array.isArray(_cachedHistoryOverview?.staff_summary) ? _cachedHistoryOverview.staff_summary : [];
    const active = _historyFilterSurveyorId;
    const makeBtn = (sid, label, countText) => {
        const isOn = active === sid;
        const bg = isOn ? '#002060' : '#ffffff';
        const fg = isOn ? '#ffffff' : '#1e293b';
        const bd = isOn ? '#002060' : '#cbd5e1';
        return `<button type="button" onclick="setHistorySurveyorFilter('${escapeQuotes(sid)}')" style="background:${bg}; color:${fg}; border:1px solid ${bd}; padding:4px 9px; border-radius:999px; font-size:0.75rem; font-weight:700; cursor:pointer;">${escapeHtml(label)}${countText ? ` (${escapeHtml(countText)})` : ''}</button>`;
    };
    let html = makeBtn('', 'Tất cả 06 ĐTV', '');
    summary.forEach(m => {
        const sid = String(m.surveyor_id || '').toUpperCase();
        const shortName = String(m.full_name || sid).split(' ').slice(-2).join(' ');
        html += makeBtn(sid, `${sid} • ${shortName}`, `${m.completed_count || 0}+${m.draft_count || 0}`);
    });
    pillsEl.innerHTML = html;
}

function renderHistoryInterviewerSummary(overview) {
    const sec = document.getElementById('historyInterviewerSummarySection');
    const kpiEl = document.getElementById('historyWorkloadKpis');
    const tbody = document.getElementById('historyTeamWorkloadTbody');
    const role = currentUser?.role || 'editor';
    const show = (role === 'admin' || role === 'admin1') && overview && Array.isArray(overview.staff_summary);
    if (sec) sec.style.display = show ? 'block' : 'none';
    if (!show) return;

    const totals = overview.totals || {};
    if (kpiEl) {
        const kpis = [
            { label: 'Tổng Chỉ Tiêu Dự Án', value: `${totals.target_total || 240} phiếu`, sub: `P1 nông hộ: ${totals.target_p1 || 220}`, bg: '#f1f5f9', fg: '#0f172a', bd: '#cbd5e1' },
            { label: 'Đã Hoàn Thành (Nộp Xong)', value: `${totals.completed_count || 0} phiếu`, sub: 'Đã bấm Hoàn thành nộp VPS', bg: '#dcfce7', fg: '#166534', bd: '#86efac' },
            { label: 'Đang Lưu Tạm (VPS)', value: `${totals.draft_count || 0} phiếu`, sub: 'ĐTV đang phỏng vấn thực địa', bg: '#fef3c7', fg: '#92400e', bd: '#fcd34d' },
            { label: 'Tổng Đã Mở Thực Hiện', value: `${totals.combined_count || 0} / ${totals.target_total || 240}`, sub: 'Hoàn thành + Đang lưu tạm', bg: '#dbeafe', fg: '#1e40af', bd: '#93c5fd' },
            { label: 'Còn Tồn Lại Chưa Xong', value: `${Math.max(0, (totals.target_total || 240) - (totals.completed_count || 0))} phiếu`, sub: `Chưa mở: ${totals.remaining_total ?? Math.max(0, (totals.target_total || 240) - (totals.combined_count || 0))}`, bg: '#fee2e2', fg: '#991b1b', bd: '#fecaca' }
        ];
        kpiEl.innerHTML = kpis.map(k => `
            <div style="background:${k.bg}; border:1px solid ${k.bd}; border-radius:6px; padding:8px 10px;">
                <div style="font-size:0.72rem; font-weight:700; color:${k.fg}; opacity:0.85;">${escapeHtml(k.label)}</div>
                <div style="font-size:1.12rem; font-weight:800; color:${k.fg}; margin:2px 0;">${escapeHtml(k.value)}</div>
                <div style="font-size:0.71rem; color:${k.fg}; opacity:0.9;">${escapeHtml(k.sub)}</div>
            </div>
        `).join('');
    }

    if (tbody) {
        tbody.innerHTML = overview.staff_summary.map(m => {
            const sid = String(m.surveyor_id || '').toUpperCase();
            const dotColor = m.status === 'online' ? '#16a34a' : (m.status === 'recent' ? '#f59e0b' : (m.lat !== null && m.lng !== null ? '#2563eb' : '#94a3b8'));
            const remP1 = m.remaining_count || 0;
            const notFinished = m.assigned_target > 0 ? Math.max(0, m.assigned_target - (m.completed_count || 0)) : 0;
            return `
                <tr>
                    <td data-label="Điều Tra Viên">
                        <div onclick="setHistorySurveyorFilter('${escapeQuotes(sid)}')" style="font-weight:800; color:#002060; cursor:pointer; text-decoration:underline;" title="Bấm để mở danh sách hộ phỏng vấn của ĐTV này">
                            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:5px;"></span>
                            [${escapeHtml(sid)}] ${escapeHtml(m.full_name || sid)}
                        </div>
                        <div style="font-size:0.73rem; color:#64748b;">${escapeHtml(m.status_label || '')}${m.last_seen_vn ? ` • ${escapeHtml(m.last_seen_vn)}` : ''}</div>
                        ${m.reminder_text ? `<div style="font-size:0.71rem; color:#b45309; font-weight:700; margin-top:2px;"><i class="fa-solid fa-bell"></i> ${escapeHtml(m.reminder_text.slice(0, 42))}${m.reminder_text.length > 42 ? '…' : ''}</div>` : ''}
                    </td>
                    <td data-label="Địa Bàn">${escapeHtml(m.commune || '—')}</td>
                    <td data-label="Chỉ Tiêu P1" style="text-align:center; font-weight:700;">${m.assigned_target > 0 ? m.assigned_target : 'Phối hợp'}</td>
                    <td data-label="Hoàn Thành (Nộp)" style="text-align:center;">
                        <span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:999px; font-weight:800; font-size:0.82rem;">${m.completed_count || 0}</span>
                    </td>
                    <td data-label="Đang Lưu Tạm" style="text-align:center;">
                        <span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:999px; font-weight:800; font-size:0.82rem;">${m.draft_count || 0}</span>
                    </td>
                    <td data-label="Còn Tồn Lại" style="text-align:center;">
                        <strong style="color:${remP1 > 0 ? '#b91c1c' : '#15803d'};">${m.assigned_target > 0 ? `${notFinished} chưa nộp` : '—'}</strong>
                        ${m.assigned_target > 0 ? `<div style="font-size:0.71rem; color:#64748b;">Chưa mở: ${remP1}</div>` : ''}
                    </td>
                    <td data-label="Điều Hướng Nhanh" style="text-align:center; white-space:nowrap;">
                        <button type="button" onclick="setHistorySurveyorFilter('${escapeQuotes(sid)}')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 7px; border-radius:4px; font-size:0.74rem; font-weight:700; cursor:pointer; margin-right:3px;" title="Lọc danh sách phiếu của ĐTV này">
                            <i class="fa-solid fa-filter"></i> Phiếu (${(m.completed_count || 0) + (m.draft_count || 0)})
                        </button>
                        <button type="button" onclick="navigateToMapForMember('${escapeQuotes(sid)}')" style="background:#ecfeff; color:#0e7490; border:1px solid #a5f3fc; padding:3px 7px; border-radius:4px; font-size:0.74rem; font-weight:700; cursor:pointer; margin-right:3px;" title="Định vị ĐTV trên Bản đồ">
                            <i class="fa-solid fa-map-location-dot"></i> Bản đồ
                        </button>
                        <button type="button" onclick="navigateToPhotoLibraryForMember('${escapeQuotes(sid)}')" style="background:#fdf2f8; color:#be185d; border:1px solid #fbcfe8; padding:3px 7px; border-radius:4px; font-size:0.74rem; font-weight:700; cursor:pointer; margin-right:3px;" title="Mở Thư viện ảnh hiện trường của ĐTV">
                            <i class="fa-solid fa-images"></i> Ảnh (${m.photo_count || 0})
                        </button>
                        <button type="button" onclick="navigateToTeamSchedule()" style="background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe; padding:3px 7px; border-radius:4px; font-size:0.74rem; font-weight:700; cursor:pointer;" title="Xem lịch trình công tác">
                            <i class="fa-solid fa-calendar-days"></i> Lịch
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    renderHistorySurveyorFilterPills();
    renderFocusedInterviewerCard();
}

function renderCompletedSurveysRows(list) {
    const tbody = document.getElementById('surveyHistoryTbody');
    if (!tbody) return;
    const role = currentUser?.role || 'editor';
    const isAdmin1 = (role === 'admin1');
    if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--slate-500);">Chưa có phiếu khảo sát nào phù hợp trên hệ thống.</td></tr>';
        return;
    }
    const sorted = list.slice().sort((a, b) => {
        const dt = extractItemSortTimestamp(b) - extractItemSortTimestamp(a);
        return dt !== 0 ? dt : (Number(b.id || 0) - Number(a.id || 0));
    });
    const dateCounts = {};
    sorted.forEach(item => {
        const dk = extractItemDateKeyVN(item);
        dateCounts[dk] = (dateCounts[dk] || 0) + 1;
    });
    let lastDateKey = '';
    tbody.innerHTML = sorted.map(item => {
        const dateKey = extractItemDateKeyVN(item);
        let groupHeaderHtml = '';
        if (dateKey !== lastDateKey) {
            lastDateKey = dateKey;
            groupHeaderHtml = `
                <tr class="history-date-group-row" style="background: #e2e8f0; cursor: default;">
                    <td colspan="7" style="padding: 6px 10px; font-weight: 800; font-size: 0.78rem; color: #002060;">
                        <i class="fa-solid fa-calendar-day"></i> Ngày ${escapeHtml(dateKey)} — ${dateCounts[dateKey]} phiếu đã hoàn thành
                    </td>
                </tr>
            `;
        }
        const isOwner = isCurrentUserOwnerOf(item.surveyor_id, item.surveyor_name);
        const canEdit = !isAdmin1 && ((role === 'admin') || isOwner);
        const canDelete = !isAdmin1 && ((role === 'admin') || isOwner);
        const photoBadge = item.photo_path ? ' <i class="fa-solid fa-camera" style="color: #15803d;" title="Có ảnh người PV (Watermark WGS84)"></i>' : '';
        const feedbackHtml = isAdmin1 ? '' : getAdminStatusBadgeHtml(item.admin_status, item.admin_feedback);
        const rowClick = isAdmin1 ? 'notifyAdmin1NoSurveyDetail()' : `viewSurveyDetail(${item.id})`;
        const sid = String(item.surveyor_id || '').toUpperCase();

        return groupHeaderHtml + `
            <tr onclick="${rowClick}" style="cursor: pointer;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''">
                <td data-label="Mã phiếu" style="font-family: monospace; font-weight: 700; color: var(--primary);">${escapeHtml(item.survey_code)}${photoBadge}${feedbackHtml}</td>
                <td data-label="Công cụ"><span style="background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 3px; font-weight: 700; font-size: 0.78rem;">${escapeHtml(item.tool_code)}</span></td>
                <td data-label="Địa bàn">${escapeHtml(item.commune)} ${item.hamlet ? `(${escapeHtml(item.hamlet)})` : ''}</td>
                <td data-label="Người được PV" style="font-weight: 600;">${escapeHtml(item.respondent_name || '—')}</td>
                <td data-label="Điều tra viên" style="font-size: 0.82rem;">${escapeHtml(item.surveyor_name)} (${escapeHtml(item.surveyor_id)})</td>
                <td data-label="Ngày khảo sát" style="text-align: center; font-family: monospace; font-size: 0.82rem;">${formatDateVN(item.survey_date)}</td>
                <td data-label="Thao tác" style="text-align: center; white-space: nowrap;" onclick="event.stopPropagation()">
                    ${isAdmin1 ? `
                        <button type="button" onclick="event.stopPropagation(); navigateToPhotoLibraryForMember('${escapeQuotes(sid)}')"
                                style="background:#fdf2f8; border:1px solid #fbcfe8; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.76rem; font-weight:700; color:#be185d; margin-right:4px;" title="Xem thư viện ảnh của ĐTV">
                            <i class="fa-solid fa-images"></i> Ảnh ĐTV
                        </button>
                        <button type="button" onclick="event.stopPropagation(); navigateToMapForMember('${escapeQuotes(sid)}')"
                                style="background:#ecfeff; border:1px solid #a5f3fc; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.76rem; font-weight:700; color:#0e7490;" title="Xem vị trí trên Bản đồ">
                            <i class="fa-solid fa-location-dot"></i> Bản đồ
                        </button>
                    ` : `
                        <button type="button"
                                onclick="event.stopPropagation(); viewSurveyDetail(${item.id})"
                                style="background: #eff6ff; border: 1px solid #93c5fd; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: #1d4ed8; margin-right: 4px;" title="${role === 'admin' ? 'Mở xem chi tiết &amp; góp ý phiếu' : 'Mở xem chi tiết &amp; chọn sửa/bổ sung/xóa'}">
                            <i class="fa-solid fa-eye"></i> ${role === 'admin' ? 'Mở xem / Góp ý' : 'Mở xem'}
                        </button>
                        ${canEdit ? `
                            <button type="button"
                                    onclick="event.stopPropagation(); reloadSurveyIntoForm(${item.id})"
                                    style="background: #fffbeb; border: 1px solid #fcd34d; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: #92400e; margin-right: 4px;" title="Mở ra Form để phỏng vấn lại / bổ sung câu hỏi">
                                <i class="fa-solid fa-pen-to-square"></i> Sửa / Bổ sung
                            </button>
                        ` : ''}
                        ${canEdit ? `
                            <a href="${getPdfExportUrl(item.id)}" target="_blank" onclick="event.stopPropagation()"
                               style="display: inline-block; background: #fef2f2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 3px; font-size: 0.78rem; font-weight: 600; color: #b91c1c; text-decoration: none; margin-right: 4px;" title="Xuất báo cáo phỏng vấn PDF">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </a>
                        ` : ''}
                        ${canEdit ? `
                            <button type="button"
                                    onclick="event.stopPropagation(); openEditSurveyModal(${item.id})"
                                    style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 600; color: #166534; margin-right: 4px;" title="Sửa nhanh mã phiếu, địa bàn, tên, SĐT, GPS">
                                <i class="fa-solid fa-sliders"></i> Sửa nhanh
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button type="button"
                                    onclick="event.stopPropagation(); deleteSurveyConfirm(${item.id}, '${escapeQuotes(item.survey_code)}')"
                                    style="background: #fef2f2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 0.78rem; font-weight: 600; color: #b91c1c;" title="Xóa phiếu (vẫn bảo lưu trên VPS để khôi phục)">
                                <i class="fa-solid fa-trash-can"></i> Xóa
                            </button>
                        ` : ''}
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function filterCompletedSurveysTable() {
    const kw = normViNameOwner(document.getElementById('historySurveySearchInput')?.value || '');
    const sidFilter = _historyFilterSurveyorId;
    const filtered = _cachedCompletedSurveysList.filter(item => {
        if (sidFilter && !recordMatchesStaffId(item, sidFilter)) {
            return false;
        }
        if (!kw) return true;
        const hay = normViNameOwner([
            item.survey_code,
            item.tool_code,
            item.commune,
            item.hamlet,
            item.respondent_name,
            item.surveyor_name,
            item.surveyor_id,
            item.survey_date,
            item.admin_status,
            item.admin_feedback
        ].join(' '));
        return hay.includes(kw);
    });
    renderCompletedSurveysRows(filtered);
    renderHistoryDraftsTableFromCache();
}

async function loadSurveysList() {
    const role = currentUser?.role || 'editor';
    const isAdmin = (role === 'admin');
    const isAdmin1 = (role === 'admin1');
    const isReadOnly = (role === 'viewer' || isAdmin1);
    const admin1Banner = document.getElementById('historyAdmin1NoticeBanner');
    const btnTrash = document.getElementById('btnToggleHistoryTrash');
    const headingEl = document.getElementById('historyMainHeading');
    if (admin1Banner) admin1Banner.style.display = isAdmin1 ? 'block' : 'none';
    if (btnTrash) btnTrash.style.display = isReadOnly ? 'none' : 'inline-flex';
    document.querySelectorAll('#view-history a[href*="/api/export/excel"]').forEach(el => {
        el.style.display = isReadOnly ? 'none' : 'inline-flex';
    });
    if (headingEl) {
        headingEl.textContent = isAdmin1
            ? 'TỔNG HỢP KHỐI LƯỢNG 06 ĐTV & TIẾN ĐỘ PHIẾU (CHẾ ĐỘ ADMIN1 — KHÓA CHI TIẾT)'
            : 'DANH SÁCH PHIẾU KHẢO SÁT ĐÃ LƯU TRÊN MÁY CHỦ VPS';
    }

    if (isAdmin || isAdmin1) {
        const sumSec = document.getElementById('historyInterviewerSummarySection');
        if (sumSec) sumSec.style.display = 'block';
        try {
            const ov = await fetchJsonWithTimeout(
                apiUrl(`/api/history-overview?role=${encodeURIComponent(role)}&surveyor_id=${encodeURIComponent(currentUser?.surveyor_id || '')}`),
                15000
            );
            _cachedHistoryOverview = ov;
            if (ov && ov.totals) {
                window._cachedDashStats = Object.assign({}, window._cachedDashStats || {}, {
                    total: ov.totals.completed_count,
                    total_drafts: ov.totals.draft_count,
                    total_combined_forms: ov.totals.combined_count
                });
            }
            renderHistoryInterviewerSummary(ov);
            if (isAdmin1) {
                _cachedCompletedSurveysList = Array.isArray(ov.completed_items) ? ov.completed_items : [];
                _cachedHistoryDraftsList = Array.isArray(ov.draft_items) ? ov.draft_items : [];
                interviewedSurveyCodes = new Set(
                    _cachedCompletedSurveysList.map(s => String(s.survey_code || '').trim().toUpperCase()).filter(Boolean)
                );
                updateMenuSummaryBadges();
                filterCompletedSurveysTable();
                return;
            }
        } catch (eOv) {
            console.warn('Không tải được tổng hợp 06 ĐTV:', eOv);
            if (isAdmin1) {
                _cachedCompletedSurveysList = [];
                _cachedHistoryDraftsList = [];
                filterCompletedSurveysTable();
                return;
            }
        }
    } else {
        _cachedHistoryOverview = null;
        renderHistoryInterviewerSummary(null);
    }

    try {
        if (!surveysListFetchPromise) {
            surveysListFetchPromise = fetchJsonWithTimeout(apiUrl('/api/surveys'), 8000)
                .finally(() => { surveysListFetchPromise = null; });
        }
        const list = await surveysListFetchPromise;
        if (!Array.isArray(list)) return;
        _cachedCompletedSurveysList = list;
        interviewedSurveyCodes = new Set(
            list.map(s => String(s.survey_code || '').trim().toUpperCase()).filter(Boolean)
        );
        updateMenuSummaryBadges();
        if (sampleHouseholds.length > 0) {
            const guideVal = document.getElementById('sampleFilterGuide')?.value || '';
            const kwVal = (document.getElementById('sampleSearchInput')?.value || '').trim();
            populateSampleGuideFilter();
            filterSampleHouseholds(sampleListPinnedOpen || Boolean(guideVal || kwVal));
        }

        await renderHistoryDraftsTable();
        filterCompletedSurveysTable();
        if (role !== 'viewer') {
            loadMyHistoryTrash(true);
        }
    } catch (e) {
        console.warn('Không tải được danh sách phiếu đã nộp:', e);
    }
}

function renderHistoryDraftsTableFromCache() {
    const dBody = document.getElementById('historyDraftsTbody');
    const sec = document.getElementById('historyDraftsSection');
    if (!dBody) return;

    const role = currentUser?.role || 'viewer';
    const isAdmin = (role === 'admin');
    const isAdmin1 = (role === 'admin1');
    if (sec) sec.style.display = (role === 'viewer') ? 'none' : 'block';
    if (role === 'viewer') return;

    const kw = normViNameOwner(document.getElementById('historySurveySearchInput')?.value || '');
    const sidFilter = _historyFilterSurveyorId;
    const filtered = _cachedHistoryDraftsList.filter(d => {
        if (sidFilter && !recordMatchesStaffId(d, sidFilter)) {
            return false;
        }
        if (!kw) return true;
        const hay = normViNameOwner([
            d.survey_code,
            d.draft_key,
            d.tool_code,
            d.commune,
            d.hamlet,
            d.respondent_name,
            d.surveyor_name,
            d.surveyor_id,
            d.admin_status,
            d.admin_feedback
        ].join(' '));
        return hay.includes(kw);
    });

    const btnBulkHist = document.getElementById('btnDeleteAllMyHistoryDrafts');
    if (btnBulkHist) {
        btnBulkHist.style.display = (!isAdmin1 && !isAdmin && filtered.length > 0) ? 'inline-flex' : 'none';
    }
    if (filtered.length === 0) {
        dBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--slate-500);">Chưa có phiếu nháp nào phù hợp đang lưu trên máy chủ.</td></tr>';
        return;
    }

    const sortedDrafts = filtered.slice().sort((a, b) => {
        const dt = extractItemSortTimestamp(b) - extractItemSortTimestamp(a);
        return dt !== 0 ? dt : (Number(b.id || 0) - Number(a.id || 0));
    });
    const draftDateCounts = {};
    sortedDrafts.forEach(d => {
        const dk = extractItemDateKeyVN(d);
        draftDateCounts[dk] = (draftDateCounts[dk] || 0) + 1;
    });
    let lastDraftDateKey = '';

    dBody.innerHTML = sortedDrafts.map(d => {
        const dateKey = extractItemDateKeyVN(d);
        let groupHeaderHtml = '';
        if (dateKey !== lastDraftDateKey) {
            lastDraftDateKey = dateKey;
            groupHeaderHtml = `
                <tr class="history-date-group-row" style="background: #fef3c7;">
                    <td colspan="7" style="padding: 5px 10px; font-weight: 800; font-size: 0.77rem; color: #92400e;">
                        <i class="fa-solid fa-calendar-day"></i> Ngày ${escapeHtml(dateKey)} — ${draftDateCounts[dateKey]} phiếu tạm
                    </td>
                </tr>
            `;
        }
        const hasPhoto = Boolean(d.photo_path || d.photo_url);
        const photoBadge = hasPhoto ? ' <i class="fa-solid fa-camera" style="color:#0f766e;" title="Đã có ảnh"></i>' : '';
        const feedbackHtml = isAdmin1 ? '' : getAdminStatusBadgeHtml(d.admin_status, d.admin_feedback);
        const sid = String(d.surveyor_id || '').toUpperCase();
        return groupHeaderHtml + `
            <tr>
                <td data-label="Mã phiếu" style="font-family:monospace;font-weight:700;color:#b45309;">${escapeHtml(d.survey_code || d.draft_key)}${photoBadge}${feedbackHtml}</td>
                <td data-label="Công cụ"><span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:3px;font-weight:700;font-size:0.78rem;">${escapeHtml(d.tool_code || 'P1')}</span></td>
                <td data-label="Địa bàn">${escapeHtml(d.commune || '')} ${d.hamlet ? `(${escapeHtml(d.hamlet)})` : ''}</td>
                <td data-label="Người được PV" style="font-weight:600;">${escapeHtml(d.respondent_name || '—')}</td>
                <td data-label="Điều tra viên" style="font-size:0.82rem;">${escapeHtml(d.surveyor_name || '')} (${escapeHtml(d.surveyor_id || '')})</td>
                <td data-label="Tiến độ" style="font-size:0.78rem;text-align:center;">${d.answered_count || 0}/${d.total_count || '?'} câu</td>
                <td data-label="Thao tác" style="text-align:center;white-space:nowrap;">
                    ${isAdmin1 ? `
                        <button type="button" onclick="navigateToPhotoLibraryForMember('${escapeQuotes(sid)}')" style="background:#fdf2f8;border:1px solid #fbcfe8;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.76rem;font-weight:700;color:#be185d;">
                            <i class="fa-solid fa-images"></i> Ảnh ĐTV
                        </button>
                    ` : `
                        ${isAdmin ? `
                            <button type="button" onclick="openDraftAdminFeedbackPrompt('${escapeQuotes(d.draft_key)}', '${escapeQuotes(d.survey_code || d.draft_key)}')" style="background:#eff6ff;border:1px solid #93c5fd;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.78rem;font-weight:700;color:#1d4ed8;margin-right:4px;">
                                <i class="fa-solid fa-comment-dots"></i> Góp ý
                            </button>
                        ` : ''}
                        <button type="button" onclick="loadDraftIntoForm('${escapeQuotes(d.draft_key)}')" style="background:#f0fdf4;border:1px solid #bbf7d0;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.78rem;font-weight:600;color:#166534;margin-right:4px;">
                            <i class="fa-solid fa-pen-to-square"></i> Mở Sửa
                        </button>
                        <button type="button" onclick="deleteHistoryDraftConfirm('${escapeQuotes(d.draft_key)}', '${escapeQuotes(d.survey_code || d.draft_key)}', '${escapeQuotes(d.respondent_name || '')}')" style="background:#fef2f2;border:1px solid #fecaca;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.78rem;font-weight:600;color:#b91c1c;">
                            <i class="fa-solid fa-trash-can"></i> Xóa Nháp
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

async function renderHistoryDraftsTable() {
    const dBody = document.getElementById('historyDraftsTbody');
    const sec = document.getElementById('historyDraftsSection');
    if (!dBody) return;

    const role = currentUser?.role || 'viewer';
    if (sec) sec.style.display = (role === 'viewer') ? 'none' : 'block';
    if (role === 'viewer') return;
    if (role === 'admin1') {
        renderHistoryDraftsTableFromCache();
        return;
    }

    try {
        const res = await fetch(apiUrl(`/api/drafts?role=${encodeURIComponent(role)}&surveyor_id=${encodeURIComponent(currentUser?.surveyor_id || '')}`), { cache: 'no-store' });
        const allDrafts = res.ok ? await res.json() : [];
        _cachedHistoryDraftsList = (Array.isArray(allDrafts) ? allDrafts : []).filter(d => isDraftStrictlyOwnedByCurrentUser(d));
        renderHistoryDraftsTableFromCache();
    } catch (_) {
        dBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;color:#dc2626;">Không tải được danh sách phiếu nháp.</td></tr>';
    }
}

async function openDraftAdminFeedbackPrompt(draftKey, labelCode) {
    if (currentUser?.role !== 'admin') return;
    const target = _cachedHistoryDraftsList.find(d => d.draft_key === draftKey);
    const curStatus = target?.admin_status || 'Cần bổ sung';
    const curNote = target?.admin_feedback || '';
    const note = prompt(`Nhập nội dung góp ý của Admin cho phiếu tạm [${labelCode}] (ĐTV sẽ nhìn thấy để hoàn thiện):`, curNote);
    if (note === null) return;
    try {
        const res = await fetch(apiUrl('/api/drafts/feedback'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey() || currentUser?.key || ''
            },
            body: JSON.stringify({
                draft_key: draftKey,
                admin_status: note.trim() ? curStatus : '',
                admin_feedback: note.trim(),
                author: currentUser?.name || 'Admin'
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || 'Không lưu được góp ý phiếu tạm.');
            return;
        }
        showInstantActionToast(`Đã lưu góp ý Admin cho phiếu tạm ${labelCode}`);
        await renderHistoryDraftsTable();
    } catch (e) {
        alert('Lỗi kết nối khi lưu góp ý: ' + e.message);
    }
}

async function deleteHistoryDraftConfirm(draftKey, labelCode, respondentName = '') {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không có quyền xóa phiếu nháp.');
        return;
    }
    const detailHtml = `
        <div><strong>Phiếu nháp cần xóa:</strong> <span style="font-family:monospace;color:#991b1b;">${escapeHtml(labelCode || draftKey)}</span></div>
        ${respondentName ? `<div><strong>Chủ hộ:</strong> ${escapeHtml(respondentName)}</div>` : ''}
        <div style="margin-top:4px;font-size:0.78rem;color:#64748b;">Dữ liệu gốc và ảnh vẫn được bảo lưu trong Thùng rác VPS để khôi phục khi cần.</div>
    `;
    const confirmed = await requestConfirmDeleteWithX('Xác nhận xóa phiếu nháp', detailHtml);
    if (!confirmed) return;

    const res = await fetch(apiUrl(`/api/drafts/${encodeURIComponent(draftKey)}`), {
        method: 'DELETE',
        headers: {
            'X-Confirm-Delete': 'X',
            'X-User-Role': role,
            'X-User-Id': currentUser?.surveyor_id || '',
            'X-Delete-Password': currentUser?.key || '',
            'X-Admin-Key': role === 'admin' ? (getAdminKey() || currentUser?.key || '') : ''
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        alert('Lỗi xóa nháp: ' + (data.error || 'Thao tác không được phép'));
        return;
    }
    await cleanupDeletedDraftLocally(draftKey, labelCode);
    showInstantActionToast(data.message || `Đã xóa tức thì phiếu nháp [${labelCode}] (bản gốc bảo lưu trong Thùng rác VPS).`);
    await loadHouseholdLocks();
    await loadSurveysList();
    if (typeof refreshDraftBadgeCount === 'function') {
        refreshDraftBadgeCount(false);
    }
}

function toggleHistoryTrashPanel() {
    const panel = document.getElementById('historyTrashPanel');
    if (!panel) return;
    const isHidden = (panel.style.display === 'none' || !panel.style.display);
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) loadMyHistoryTrash(false);
}

async function loadMyHistoryTrash(countOnly = false) {
    const role = currentUser?.role || 'viewer';
    const sid = currentUser?.surveyor_id || '';
    const countEl = document.getElementById('historyTrashCount');
    const contentEl = document.getElementById('historyTrashContent');
    if (role === 'viewer') return;

    try {
        const res = await fetch(apiUrl(`/api/trash/my?role=${encodeURIComponent(role)}&surveyor_id=${encodeURIComponent(sid)}`), {
            headers: {
                'X-User-Role': role,
                'X-User-Id': sid,
                'X-Admin-Key': role === 'admin' ? getAdminKey() : ''
            }
        });
        if (!res.ok) return;
        const data = await res.json();
        const delSurveys = data.deleted_surveys || [];
        const delDrafts = data.deleted_drafts || [];
        if (countEl) countEl.textContent = String(delSurveys.length + delDrafts.length);
        if (countOnly && (!document.getElementById('historyTrashPanel') || document.getElementById('historyTrashPanel').style.display === 'none')) return;
        if (!contentEl) return;

        if (delSurveys.length === 0 && delDrafts.length === 0) {
            contentEl.innerHTML = '<div style="color:#64748b;padding:6px 0;">Chưa có phiếu hoặc phiếu nháp nào bị xóa.</div>';
            return;
        }
        let html = '';
        if (delSurveys.length > 0) {
            html += '<div style="font-weight:700;color:#0f2a4a;margin:6px 0 4px 0;">Phiếu đã hoàn thành đã xóa:</div>';
            html += delSurveys.map(s => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;background:#fff;border:1px solid #fde68a;border-radius:4px;margin-bottom:5px;flex-wrap:wrap;">
                    <div><strong>${escapeHtml(s.survey_code)}</strong> (${escapeHtml(s.tool_code)}) — ${escapeHtml(s.respondent_name || '—')} <span style="color:#64748b;font-size:0.76rem;">• Xóa lúc: ${escapeHtml(s.deleted_at || '')}</span></div>
                    <button type="button" onclick="restoreMyDeletedSurvey(${s.archive_id}, '${escapeQuotes(s.survey_code)}')" style="background:#15803d;color:#fff;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:0.78rem;font-weight:700;">
                        <i class="fa-solid fa-rotate-left"></i> Phục hồi phiếu
                    </button>
                </div>
            `).join('');
        }
        if (delDrafts.length > 0) {
            html += '<div style="font-weight:700;color:#9a3412;margin:8px 0 4px 0;">Phiếu nháp đã xóa:</div>';
            html += delDrafts.map(d => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;background:#fff;border:1px solid #fed7aa;border-radius:4px;margin-bottom:5px;flex-wrap:wrap;">
                    <div><strong>${escapeHtml(d.survey_code || d.draft_key)}</strong> (${escapeHtml(d.tool_code || 'P1')}) — ${escapeHtml(d.respondent_name || '—')} <span style="color:#64748b;font-size:0.76rem;">• Xóa lúc: ${escapeHtml(d.deleted_at || '')}</span></div>
                    <button type="button" onclick="restoreMyDeletedDraft(${d.archive_id}, '${escapeQuotes(d.survey_code || d.draft_key)}')" style="background:#0369a1;color:#fff;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:0.78rem;font-weight:700;">
                        <i class="fa-solid fa-rotate-left"></i> Phục hồi nháp
                    </button>
                </div>
            `).join('');
        }
        contentEl.innerHTML = html;
    } catch (_) {}
}

async function restoreMyDeletedSurvey(archiveId, code) {
    if (!confirm(`Phục hồi lại phiếu [${code}] về danh sách chính?`)) return;
    const role = currentUser?.role || 'editor';
    const res = await fetch(apiUrl(`/api/trash/restore/survey/${archiveId}`), {
        method: 'POST',
        headers: {
            'X-User-Role': role,
            'X-User-Id': currentUser?.surveyor_id || '',
            'X-Delete-Password': currentUser?.key || '',
            'X-Admin-Key': role === 'admin' ? getAdminKey() : ''
        }
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
        alert(data.message);
        await loadSurveysList();
        await loadMyHistoryTrash(false);
        await refreshDashboardData();
    } else {
        alert('Lỗi phục hồi: ' + (data.error || 'Không thể khôi phục'));
    }
}

async function restoreMyDeletedDraft(archiveId, code) {
    if (!confirm(`Phục hồi lại phiếu nháp [${code}]?`)) return;
    const role = currentUser?.role || 'editor';
    const res = await fetch(apiUrl(`/api/trash/restore/draft/${archiveId}`), {
        method: 'POST',
        headers: {
            'X-User-Role': role,
            'X-User-Id': currentUser?.surveyor_id || '',
            'X-Delete-Password': currentUser?.key || '',
            'X-Admin-Key': role === 'admin' ? getAdminKey() : ''
        }
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
        alert(data.message);
        await loadHouseholdLocks();
        await loadSurveysList();
        await loadMyHistoryTrash(false);
    } else {
        alert('Lỗi phục hồi nháp: ' + (data.error || 'Không thể khôi phục'));
    }
}

// ========================================================
// 11. XEM CHI TIẾT PHIẾU
// ========================================================
function hasMeaningfulSurveyAnswer(val) {
    if (val === null || val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return String(val).trim() !== '';
}

function toggleDetailUnansweredFilter(showAll) {
    const modalBody = document.getElementById('detailModalBody');
    if (!modalBody) return;
    modalBody.querySelectorAll('tr.detail-unanswered-row').forEach(tr => {
        tr.style.display = showAll ? 'table-row' : 'none';
    });
    const btnAll = document.getElementById('btnDetailShowAllQ');
    const btnAns = document.getElementById('btnDetailShowAnsQ');
    if (btnAll && btnAns) {
        btnAll.style.background = showAll ? '#002060' : '#f1f5f9';
        btnAll.style.color = showAll ? '#fff' : '#334155';
        btnAns.style.background = !showAll ? '#002060' : '#f1f5f9';
        btnAns.style.color = !showAll ? '#fff' : '#334155';
    }
}

async function finishAfterCompletionFromDetail() {
    hideDetailModal();
    await finishAfterCompletion();
}

async function viewSurveyDetail(id, options = {}) {
    if (currentUser?.role === 'admin1') {
        notifyAdmin1NoSurveyDetail();
        return;
    }
    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`));
        if (!res.ok) {
            alert('Không tìm thấy dữ liệu phiếu trên máy chủ VPS.');
            return;
        }
        const item = await res.json();
        if (item.tool_code && !allQuestionsData?.[item.tool_code]) {
            await loadQuestions(true);
        }

        document.getElementById('detailModalTitle').textContent = `CHI TIẾT PHIẾU: ${item.survey_code} (${item.tool_code})`;

        const body = document.getElementById('detailModalBody');
        const footer = document.getElementById('detailModalFooter');
        const answers = (item.answers && typeof item.answers === 'object') ? item.answers : {};
        const qList = (allQuestionsData[item.tool_code]?.questions) || [];
        const qMap = {};
        qList.forEach(q => { qMap[q.code] = q.text; });
        const keys = Object.keys(answers).filter(k => !k.startsWith('_'));
        const applicableQs = qList.filter(q => checkConditionMet(q.condition, answers, item.tool_code || 'P1') || hasMeaningfulSurveyAnswer(answers[q.code]));
        const answeredBaseCount = applicableQs.length
            ? applicableQs.filter(q => hasMeaningfulSurveyAnswer(answers[q.code])).length
            : keys.length;
        const missingQs = applicableQs.filter(q => !hasMeaningfulSurveyAnswer(answers[q.code]));

        let photoHtml = '';
        if (item.photo_url) {
            const fullPhotoUrl = apiUrl(item.photo_url);
            photoHtml = `
                <div style="margin-bottom: 12px; padding: 10px; background: #ffffff; border: 1px solid #d0d0d0; border-radius: var(--radius-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.82rem; font-weight: 700; color: #15803d;">
                        <span><i class="fa-solid fa-camera"></i> ẢNH NGƯỜI ĐƯỢC PHỎNG VẤN (WATERMARK &amp; WGS84)</span>
                        <a href="${fullPhotoUrl}" target="_blank" style="color: var(--primary); text-decoration: none;">Mở ảnh gốc <i class="fa-solid fa-up-right-from-square"></i></a>
                    </div>
                    <img src="${fullPhotoUrl}" alt="Ảnh hiện trường ${escapeHtml(item.survey_code)}" style="max-width: 100%; max-height: 360px; display: block; border: 1px solid #e2e8f0; border-radius: 2px;">
                </div>
            `;
        }

        const role = currentUser?.role || 'viewer';
        const canModify = (role === 'admin') || isCurrentUserOwnerOf(item.surveyor_id, item.surveyor_name);

        const extraKeys = keys.filter(k => !qMap[k]);
        let tableRowsHtml = '';
        if (qList.length > 0) {
            tableRowsHtml += qList.map(q => {
                const answered = hasMeaningfulSurveyAnswer(answers[q.code]);
                const condOk = checkConditionMet(q.condition, answers, item.tool_code || 'P1');
                if (!condOk && !answered) {
                    return `
                        <tr class="detail-answered-row" style="background: #f8fafc; opacity: 0.72;">
                            <td style="font-family: monospace; font-weight: 700; color: #64748b; vertical-align: top;">${escapeHtml(q.code)}</td>
                            <td>
                                <div style="font-size: 0.78rem; color: #64748b; margin-bottom: 2px;">${escapeHtml(q.text || '')}</div>
                                <div style="font-size: 0.76rem; font-style: italic; color: #64748b;">(Bỏ qua theo điều kiện: ${escapeHtml(q.condition || '')})</div>
                            </td>
                        </tr>
                    `;
                }
                const noteVal = answers[`${q.code}_note`];
                const detailVal = answers[`${q.code}_details`];
                return `
                    <tr class="${answered ? 'detail-answered-row' : 'detail-unanswered-row'}" style="${answered ? '' : 'background: #fffbeb;'}">
                        <td style="font-family: monospace; font-weight: 700; color: ${answered ? 'var(--primary)' : '#b45309'}; vertical-align: top;">${escapeHtml(q.code)}</td>
                        <td>
                            <div style="font-size: 0.78rem; color: #475569; margin-bottom: 3px;">${escapeHtml(q.text || '')}</div>
                            ${answered
                                ? `<div style="white-space: pre-wrap; font-weight: 600; color: #0f172a;">${escapeHtml(formatAnswerDisplay(answers[q.code]))}</div>`
                                : `<div style="font-size: 0.80rem; font-weight: 700; color: #b45309;"><i class="fa-regular fa-circle-dot"></i> Chưa trả lời (có thể bấm Sửa / Phỏng vấn bổ sung)</div>`}
                            ${hasMeaningfulSurveyAnswer(noteVal) ? `<div style="font-size: 0.78rem; color: #0369a1; margin-top: 3px;">Ghi chú: ${escapeHtml(formatAnswerDisplay(noteVal))}</div>` : ''}
                            ${hasMeaningfulSurveyAnswer(detailVal) ? `<div style="font-size: 0.78rem; color: #0369a1; margin-top: 3px;">Chi tiết: ${escapeHtml(formatAnswerDisplay(detailVal))}</div>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        }
        tableRowsHtml += extraKeys.filter(k => !(k.endsWith('_note') || k.endsWith('_details')) || !qMap[k.replace(/(_note|_details)$/, '')]).map(k => {
            const baseCode = k.replace(/(_note|_details)$/, '');
            const qLabel = k.endsWith('_note')
                ? `<em>Ghi chú/Phương án khác (${escapeHtml(baseCode)})</em>`
                : '';
            return `
                <tr class="detail-answered-row">
                    <td style="font-family: monospace; font-weight: 700; color: var(--primary);">${escapeHtml(k)}</td>
                    <td>
                        ${qLabel ? `<div style="font-size: 0.78rem; color: #475569; margin-bottom: 3px;">${qLabel}</div>` : ''}
                        <div style="white-space: pre-wrap; font-weight: 600; color: #0f172a;">${escapeHtml(formatAnswerDisplay(answers[k]))}</div>
                    </td>
                </tr>
            `;
        }).join('');

        let ansHtml = '';
        if (!tableRowsHtml) {
            ansHtml = '<p style="color: var(--slate-500); font-style: italic;">Không có nội dung câu trả lời nào được ghi.</p>';
        } else {
            ansHtml = `
                <table class="report-table" style="margin-top: 8px;">
                    <thead>
                        <tr>
                            <th style="width: 90px;">Mã Câu</th>
                            <th>Câu Hỏi &amp; Câu Trả Lời Thu Thập Được</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            `;
        }

        const headSummary = answers._head_name
            ? `${escapeHtml(answers._head_name)}${answers._head_gender ? ` (${escapeHtml(answers._head_gender)}${answers._head_birth_year ? ', ' + escapeHtml(answers._head_birth_year) : ''})` : (answers._head_birth_year ? ` (${escapeHtml(answers._head_birth_year)})` : '')}`
            : '—';
        const respSummary = `${escapeHtml(item.respondent_name || '—')}${answers._resp_gender ? ` (${escapeHtml(answers._resp_gender)}${answers._resp_birth_year ? ', ' + escapeHtml(answers._resp_birth_year) : ''})` : (answers._resp_birth_year ? ` (${escapeHtml(answers._resp_birth_year)})` : '')}`;

        const completenessBanner = qList.length > 0
            ? (missingQs.length > 0
                ? `<div style="margin-bottom: 10px; padding: 9px 12px; background: #fffbeb; border: 1px solid #fcd34d; border-left: 4px solid #d97706; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div style="font-size: 0.83rem; color: #92400e;">
                            <strong><i class="fa-solid fa-triangle-exclamation"></i> Đã trả lời ${answeredBaseCount}/${qList.length} câu</strong> — Còn <strong>${missingQs.length}</strong> câu chưa điền. Bạn có thể mở lại Form để phỏng vấn bổ sung ngay.
                        </div>
                        ${canModify ? `<button type="button" onclick="reloadSurveyIntoForm(${item.id})" style="background:#d97706;color:#fff;border:none;padding:5px 10px;border-radius:4px;font-size:0.78rem;font-weight:700;cursor:pointer;"><i class="fa-solid fa-plus-circle"></i> Phỏng vấn bổ sung</button>` : ''}
                   </div>`
                : `<div style="margin-bottom: 10px; padding: 9px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #15803d; border-radius: 4px; font-size: 0.83rem; color: #166534;">
                        <strong><i class="fa-solid fa-circle-check"></i> Đã trả lời đủ ${answeredBaseCount}/${qList.length} câu hỏi.</strong> Nếu phát hiện điểm chưa ổn, vẫn có thể bấm nút <strong>Phỏng vấn lại / Sửa &amp; Bổ sung</strong> bên dưới để cập nhật.
                   </div>`)
            : '';

        const curAdminStatus = item.admin_status || '';
        const curAdminNote = item.admin_feedback || '';
        const adminFeedbackBoxHtml = (role === 'admin')
            ? `
                <div id="adminFeedbackBox" style="margin-bottom: 12px; padding: 11px 14px; background: #eff6ff; border: 1px solid #93c5fd; border-left: 4px solid #1d4ed8; border-radius: 6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                        <strong style="font-size:0.86rem; color:#1e3a8a;"><i class="fa-solid fa-comment-dots"></i> NHẬN XÉT &amp; GÓP Ý CỦA ADMIN ĐỐI VỚI PHIẾU NÀY</strong>
                        ${item.admin_feedback_at ? `<span style="font-size:0.74rem; color:#475569;">Cập nhật bởi ${escapeHtml(item.admin_feedback_by || 'Admin')} lúc ${escapeHtml(typeof formatDateTimeVN === 'function' ? formatDateTimeVN(item.admin_feedback_at) : item.admin_feedback_at)}</span>` : ''}
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start;">
                        <select id="adminFeedbackStatusSelect" class="form-control" style="max-width:210px; font-size:0.82rem; font-weight:700; padding:6px 8px;">
                            <option value="" ${curAdminStatus === '' ? 'selected' : ''}>-- Trạng thái rà soát --</option>
                            <option value="Đã duyệt" ${curAdminStatus === 'Đã duyệt' ? 'selected' : ''}>Đã duyệt (Đạt yêu cầu)</option>
                            <option value="Cần bổ sung" ${curAdminStatus === 'Cần bổ sung' ? 'selected' : ''}>Cần bổ sung / Sửa lại</option>
                            <option value="Lưu ý" ${curAdminStatus === 'Lưu ý' ? 'selected' : ''}>Lưu ý hiện trường</option>
                        </select>
                        <textarea id="adminFeedbackTextarea" class="form-control" rows="2" placeholder="Nhập góp ý chi tiết cho Điều tra viên (ví dụ: bổ sung câu B3, kiểm tra lại sản lượng, xác nhận tọa độ...)" style="flex:1; min-width:220px; font-size:0.82rem; padding:6px 8px;">${escapeHtml(curAdminNote)}</textarea>
                        <button type="button" id="btnSaveAdminFeedback" onclick="submitSurveyAdminFeedback(${item.id})" class="qgis-btn-primary" style="background:#1d4ed8; border-color:#1e40af; padding:7px 14px; font-size:0.82rem; font-weight:700;">
                            <i class="fa-solid fa-paper-plane"></i> Lưu góp ý
                        </button>
                    </div>
                </div>
            `
            : ((curAdminStatus || curAdminNote)
                ? `
                    <div id="adminFeedbackReadonlyBanner" style="margin-bottom: 12px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fcd34d; border-left: 4px solid #d97706; border-radius: 6px; font-size: 0.83rem; color: #78350f;">
                        <div style="font-weight:800; margin-bottom:3px;"><i class="fa-solid fa-comment-dots"></i> GÓP Ý TỪ ADMIN${curAdminStatus ? `: [${escapeHtml(curAdminStatus)}]` : ''}</div>
                        ${curAdminNote ? `<div style="white-space:pre-wrap;">${escapeHtml(curAdminNote)}</div>` : ''}
                        ${item.admin_feedback_at ? `<div style="font-size:0.74rem; color:#92400e; margin-top:4px;">Bởi ${escapeHtml(item.admin_feedback_by || 'Admin')} • ${escapeHtml(item.admin_feedback_at)}</div>` : ''}
                    </div>
                `
                : '');

        body.innerHTML = `
            <div style="background: var(--slate-50); padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 12px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; font-size: 0.84rem;">
                    <div><strong>Chủ hộ (mặc định):</strong> ${headSummary}</div>
                    <div><strong>Người được phỏng vấn:</strong> ${respSummary}</div>
                    <div><strong>Quan hệ với Chủ hộ:</strong> ${escapeHtml(answers._resp_relation || 'Chủ hộ')}</div>
                    <div><strong>Người dẫn đường:</strong> ${escapeHtml(answers._guide || '—')}</div>
                    <div><strong>Địa bàn:</strong> ${escapeHtml(item.commune || '')} ${item.hamlet ? `(${escapeHtml(item.hamlet)})` : ''}</div>
                    <div><strong>Điều tra viên:</strong> ${escapeHtml(item.surveyor_name || '')} (${escapeHtml(item.surveyor_id || '')})</div>
                    <div><strong>Ngày phỏng vấn:</strong> ${formatDateVN(item.survey_date)}</div>
                    <div><strong>Tọa độ GPS:</strong> ${item.gps_lat && item.gps_lng ? `${item.gps_lat}, ${item.gps_lng}` : 'Chưa ghi nhận'}</div>
                    <div><strong>Công cụ:</strong> ${escapeHtml(item.tool_code || '')} — ${escapeHtml(item.tool_name || '')}</div>
                </div>
            </div>
            ${adminFeedbackBoxHtml}
            ${completenessBanner}
            ${photoHtml}
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin: 0;">
                    Kết quả phỏng vấn (${answeredBaseCount}${qList.length ? `/${qList.length}` : ''} câu đã ghi):
                </h4>
                ${qList.length > 0 ? `
                    <div style="display: flex; gap: 6px;">
                        <button type="button" id="btnDetailShowAllQ" onclick="toggleDetailUnansweredFilter(true)" style="background:#002060;color:#fff;border:1px solid #cbd5e1;padding:4px 9px;border-radius:4px;font-size:0.76rem;font-weight:600;cursor:pointer;">Tất cả (${qList.length})</button>
                        <button type="button" id="btnDetailShowAnsQ" onclick="toggleDetailUnansweredFilter(false)" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:4px 9px;border-radius:4px;font-size:0.76rem;font-weight:600;cursor:pointer;">Chỉ câu đã nhập (${answeredBaseCount})</button>
                    </div>
                ` : ''}
            </div>
            ${ansHtml}
        `;

        if (footer) {
            footer.innerHTML = `
                ${canModify ? `
                    <button type="button" onclick="reloadSurveyIntoForm(${item.id})" class="qgis-btn-primary" style="background:#d97706;border-color:#b45309;font-weight:700;">
                        <i class="fa-solid fa-pen-to-square"></i> Phỏng vấn lại / Sửa &amp; Bổ sung
                    </button>
                    <button type="button" onclick="hideDetailModal(); openEditSurveyModal(${item.id});" class="qgis-btn-secondary" style="background:#f0fdf4;color:#166534;border-color:#bbf7d0;font-weight:600;">
                        <i class="fa-solid fa-sliders"></i> Sửa nhanh thông tin
                    </button>
                    <button type="button" onclick="deleteSurveyConfirm(${item.id}, '${escapeQuotes(item.survey_code)}', true)" class="qgis-btn-secondary" style="background:#fef2f2;color:#b91c1c;border-color:#fecaca;font-weight:700;">
                        <i class="fa-solid fa-trash-can"></i> Xóa phiếu (X)
                    </button>
                    <a href="${getPdfExportUrl(item.id)}" target="_blank" class="qgis-btn-secondary" style="text-decoration:none;background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;font-weight:600;">
                        <i class="fa-solid fa-file-pdf"></i> Xuất PDF
                    </a>
                ` : ''}
                ${options?.fromCompletion ? `
                    <button type="button" onclick="finishAfterCompletionFromDetail()" class="qgis-btn-primary" style="background:#15803d;border-color:#166534;">
                        <i class="fa-solid fa-forward"></i> Hoàn tất &amp; Hộ tiếp theo
                    </button>
                ` : ''}
                <button type="button" class="qgis-btn-secondary" onclick="hideDetailModal()">Đóng cửa sổ</button>
            `;
        }

        document.getElementById('surveyDetailModal').classList.add('active');
    } catch (e) {
        alert('Không tải được chi tiết phiếu');
    }
}

async function submitSurveyAdminFeedback(surveyId) {
    if (currentUser?.role !== 'admin') return;
    const statusSel = document.getElementById('adminFeedbackStatusSelect');
    const noteArea = document.getElementById('adminFeedbackTextarea');
    const btn = document.getElementById('btnSaveAdminFeedback');
    const adminStatus = (statusSel?.value || '').trim();
    const adminFeedback = (noteArea?.value || '').trim();
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(apiUrl(`/api/surveys/${surveyId}/feedback`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey() || currentUser?.key || ''
            },
            body: JSON.stringify({
                admin_status: adminStatus,
                admin_feedback: adminFeedback,
                author: currentUser?.name || 'Admin'
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || 'Không thể lưu góp ý của Admin.');
            return;
        }
        showInstantActionToast('Đã lưu góp ý của Admin lên máy chủ VPS.');
        const cachedIdx = _cachedCompletedSurveysList.findIndex(x => Number(x.id) === Number(surveyId));
        if (cachedIdx >= 0) {
            _cachedCompletedSurveysList[cachedIdx].admin_status = data.admin_status || '';
            _cachedCompletedSurveysList[cachedIdx].admin_feedback = data.admin_feedback || '';
            _cachedCompletedSurveysList[cachedIdx].admin_feedback_by = data.admin_feedback_by || '';
            _cachedCompletedSurveysList[cachedIdx].admin_feedback_at = data.admin_feedback_at || '';
        }
        filterCompletedSurveysTable();
    } catch (e) {
        alert('Lỗi kết nối khi lưu góp ý: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function hideDetailModal() {
    const modal = document.getElementById('surveyDetailModal');
    if (modal) modal.classList.remove('active');
}

async function cancelEditCompletedSurvey() {
    editingSurveyId = null;
    await finishAfterCompletion();
    switchMainView('history');
}

async function reloadSurveyIntoForm(id) {
    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`));
        if (!res.ok) {
            alert('Không tìm thấy phiếu trên máy chủ VPS để mở sửa.');
            return;
        }
        const item = await res.json();
        hideDetailModal();
        switchMainView('survey');
        await selectTool(item.tool_code || 'P1', { skipDraftRestore: true });

        editingSurveyId = item.id;
        currentDraftPhotoPath = item.photo_path || '';
        document.getElementById('surveyCodeInput').value = item.survey_code || '';
        if (item.commune) document.getElementById('communeSelect').value = item.commune;
        document.getElementById('hamletInput').value = item.hamlet || '';
        const pEl = document.getElementById('phoneInput');
        if (pEl) pEl.value = item.respondent_phone || (item.answers && item.answers._phone) || '';
        const gEl = document.getElementById('guideNameInput');
        if (gEl) gEl.value = (item.answers && item.answers._guide) ? item.answers._guide : '';
        if (item.survey_date) document.getElementById('surveyDateInput').value = item.survey_date;
        document.getElementById('gpsInput').value = (item.answers && item.answers._gps_text)
            ? item.answers._gps_text
            : ((item.gps_lat && item.gps_lng) ? `${item.gps_lat}, ${item.gps_lng}` : '');
        updateGpsLockState(hasValidGpsText(document.getElementById('gpsInput')?.value));

        currentDraftAnswers = Object.assign({}, item.answers || {});
        applySharedDemographicsToForm(currentDraftAnswers, item.respondent_name || '', item.tool_code || 'P1');
        if (item.photo_url) {
            setHouseholdPhotoPreview(apiUrl(item.photo_url), `Ảnh đã lưu trên máy chủ (${item.survey_code})`);
            // Không gửi lại URL thành base64 nếu không chụp ảnh mới
            currentHouseholdPhotoData = '';
        } else {
            clearHouseholdPhoto(true);
        }

        const sections = getToolSections();
        if (sections.length > 1) {
            selectSection('__ALL__', 'ALL');
        } else {
            renderQuestionsForSection(currentSection);
        }
        updatePhotoLockState();
        updateAnsweredSummaryBadge();

        const banner = document.getElementById('sampleSelectedBanner');
        if (banner) {
            banner.style.display = 'block';
            banner.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <i class="fa-solid fa-pen-to-square" style="color:#b45309;"></i>
                        <strong>Đang mở PHIẾU ĐÃ HOÀN THÀNH [${escapeHtml(item.survey_code)}] (${escapeHtml(item.respondent_name || '')})</strong> —
                        Hãy kiểm tra, sửa lại hoặc phỏng vấn bổ sung các câu còn thiếu rồi bấm <strong>CẬP NHẬT LẠI PHIẾU</strong> ở cuối trang.
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" onclick="jumpToFirstUnanswered()" style="background:#d97706;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:0.78rem;font-weight:700;cursor:pointer;">
                            <i class="fa-solid fa-forward-step"></i> Đi tới câu chưa trả lời
                        </button>
                        <button type="button" onclick="cancelEditCompletedSurvey()" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:4px 10px;border-radius:4px;font-size:0.78rem;font-weight:600;cursor:pointer;">
                            <i class="fa-solid fa-xmark"></i> Thoát chế độ sửa
                        </button>
                    </div>
                </div>
            `;
        }

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
    if (currentUser?.role === 'viewer' || currentUser?.role === 'admin1') {
        alert('Tài khoản quyền Chỉ xem không được phép chỉnh sửa phiếu!');
        return;
    }
    try {
        const res = await fetch(apiUrl(`/api/surveys/${id}`));
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
        if (fGps) {
            fGps.value = (item.gps_lat && item.gps_lng) ? `${item.gps_lat}, ${item.gps_lng}` : '';
            fGps.readOnly = hasValidGpsText(fGps.value);
            fGps.style.backgroundColor = fGps.readOnly ? '#fffbeb' : '';
            fGps.title = fGps.readOnly ? 'GPS lần đầu đã được khóa bảo toàn nguyên vị' : '';
        }

        const modal = document.getElementById('surveyEditModal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    } catch (err) {
        alert('Lỗi khi mở cửa sổ chỉnh sửa phiếu: ' + err.message);
    }
}

function reopenFullFormFromQuickEdit() {
    const id = document.getElementById('editSurveyId')?.value;
    if (!id) return;
    hideEditSurveyModal();
    reloadSurveyIntoForm(id);
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
            showInstantActionToast(`Đã cập nhật chỉnh sửa phiếu [${code}] thành công!`);
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

async function deleteSurveyConfirm(id, surveyCode, closeDetailOnSuccess = false, options = {}) {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không có quyền xóa phiếu.');
        return false;
    }

    const detailHtml = `
        <div><strong>Phiếu đã phỏng vấn cần xóa:</strong> <span style="font-family:monospace;color:#991b1b;">${escapeHtml(surveyCode || `#${id}`)}</span></div>
        <div style="margin-top:4px;font-size:0.78rem;color:#64748b;">Phiếu sẽ được chuyển vào Thùng rác lưu trữ trên VPS và có thể phục hồi bất cứ lúc nào.</div>
    `;
    const confirmed = await requestConfirmDeleteWithX('Xác nhận xóa phiếu đã phỏng vấn', detailHtml);
    if (!confirmed) return false;

    let pwd = (currentUser?.key || (role === 'admin' ? getAdminKey() : '') || '').trim();
    const doDeleteReq = async (passVal) => fetch(apiUrl(`/api/surveys/${id}`), {
        method: 'DELETE',
        headers: {
            'X-Confirm-Delete': 'X',
            'X-Delete-Password': passVal,
            'X-User-Role': role,
            'X-User-Id': currentUser?.surveyor_id || '',
            'X-Admin-Key': role === 'admin' ? passVal : ''
        }
    });

    try {
        let res = await doDeleteReq(pwd);
        if (res.status === 403 && !pwd && role === 'admin') {
            const prompted = prompt(`XÁC NHẬN MẬT KHẨU QUẢN TRỊ VIÊN ĐỂ XÓA PHIẾU [${surveyCode}]:`);
            if (prompted === null || !prompted.trim()) return false;
            pwd = prompted.trim();
            res = await doDeleteReq(pwd);
        }

        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            if (closeDetailOnSuccess) hideDetailModal();
            showInstantActionToast(data.message || `Đã xóa tức thì phiếu [${surveyCode}] (chuyển vào Thùng rác VPS để khôi phục khi cần).`);
            await loadHouseholdLocks();
            await loadSurveysList();
            if (typeof refreshDashboardData === 'function') {
                refreshDashboardData();
            }
            if (typeof options?.afterDelete === 'function') {
                await options.afterDelete();
            }
            return true;
        } else {
            alert('Lỗi xóa phiếu: ' + (data.error || 'Mật khẩu không đúng hoặc thao tác không được phép'));
            return false;
        }
    } catch (err) {
        alert('Lỗi kết nối máy chủ khi gửi yêu cầu xóa.');
        return false;
    }
}

async function deleteActiveSurveyInHeader() {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không có quyền xóa phiếu.');
        return;
    }

    const surveyCode = (document.getElementById('surveyCodeInput')?.value || '').trim();
    const personName = (document.getElementById('headNameInput')?.value || document.getElementById('respondentNameInput')?.value || '').trim();

    if (editingSurveyId) {
        await deleteSurveyConfirm(editingSurveyId, surveyCode || `#${editingSurveyId}`, false, {
            afterDelete: async () => {
                editingSurveyId = null;
                await finishAfterCompletion();
                switchMainView('history');
            }
        });
        return;
    }

    const displayLabel = surveyCode || `${currentTool || 'P1'} (Phiếu hiện tại)`;
    const detailHtml = `
        <div><strong>Phiếu đang mở cần xóa:</strong> <span style="font-family:monospace;color:#991b1b;">${escapeHtml(displayLabel)}</span></div>
        ${personName ? `<div><strong>Chủ hộ / Người trả lời:</strong> ${escapeHtml(personName)}</div>` : ''}
        <div style="margin-top:4px;font-size:0.78rem;color:#64748b;">Sau khi xóa, phiếu tạm này sẽ bị gỡ khỏi danh sách chờ và trả lại hộ chưa phỏng vấn (bản sao vẫn lưu trong Thùng rác VPS nếu đã đồng bộ).</div>
    `;
    const confirmed = await requestConfirmDeleteWithX('Xác nhận xóa phiếu đang mở', detailHtml);
    if (!confirmed) return;

    const draftKey = surveyCode ? `${currentTool || 'P1'}::${surveyCode}` : '';
    if (draftKey && navigator.onLine) {
        try {
            const res = await fetch(apiUrl(`/api/drafts/${encodeURIComponent(draftKey)}`), {
                method: 'DELETE',
                headers: {
                    'X-Confirm-Delete': 'X',
                    'X-User-Role': role,
                    'X-User-Id': currentUser?.surveyor_id || '',
                    'X-Delete-Password': currentUser?.key || '',
                    'X-Admin-Key': role === 'admin' ? (getAdminKey() || currentUser?.key || '') : ''
                }
            });
            if (!res.ok && res.status !== 404) {
                const errData = await res.json().catch(() => ({}));
                alert('Không thể xóa phiếu tạm trên VPS: ' + (errData.error || `HTTP ${res.status}`));
                return;
            }
        } catch (_) {
            // Tiếp tục dọn bộ nhớ cục bộ nếu mất mạng tạm thời
        }
    }

    if (draftKey) {
        await cleanupDeletedDraftLocally(draftKey, surveyCode);
    } else {
        try { localStorage.removeItem(`dakman_draft_${currentTool || 'P1'}`); } catch (_) {}
    }

    await finishAfterCompletion();
    await loadHouseholdLocks();
    await refreshDraftBadgeCount(true);
    if (typeof loadSurveysList === 'function') {
        loadSurveysList();
    }
    showInstantActionToast(`Đã xóa phiếu [${displayLabel}] và làm mới biểu mẫu.`);
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
    const tbody = document.getElementById('staffListTbody');
    const existingIds = new Set();
    if (tbody) {
        tbody.querySelectorAll('tr td:nth-child(2)').forEach(td => {
            existingIds.add(td.textContent.trim().toUpperCase());
        });
    }
    let idx = 1;
    let code = 'TCN01';
    while (existingIds.has(code)) {
        idx += 1;
        code = `TCN${String(idx).padStart(2, '0')}`;
    }
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

function inlineEditQuestion(code) {
    if (currentUser?.role !== 'admin') return;
    const modal = document.getElementById('staffManagerModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
    switchAdminSubTab('questions');
    const sel = document.getElementById('adminQuestionToolSelect');
    if (sel && currentTool) sel.value = currentTool;
    loadAdminQuestionsTable();
    openEditQuestionForm(code);
    setTimeout(() => {
        document.getElementById('questionEditorBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
}

function inlineDeleteQuestion(code) {
    if (currentUser?.role !== 'admin') return;
    const sel = document.getElementById('adminQuestionToolSelect');
    if (sel && currentTool) sel.value = currentTool;
    deleteAdminQuestion(code);
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
    if (rawT.includes('MULTI_TX') || q.multi_rows) mappedT = 'MULTI_TX';
    else if (rawT.includes('DATETIME')) mappedT = 'DATETIME';
    else if (rawT.includes('DR') || rawT.includes('SELECT')) mappedT = 'DR';
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
            if (currentTool === toolCode) {
                const prevSec = currentSection;
                selectTool(currentTool);
                if (prevSec) {
                    const secs = getToolSections();
                    const idx = secs.indexOf(prevSec);
                    if (idx >= 0) selectSection(prevSec, idx);
                }
            }
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
    const dBody = document.getElementById('trashDraftsTbody');
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
            if (dBody) dBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:10px;">${msg}</td></tr>`;
            uBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:10px;">${msg}</td></tr>`;
            return;
        }
        const data = await res.json();
        const surveys = data.deleted_surveys || [];
        const drafts = data.deleted_drafts || [];
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

        if (dBody) {
            dBody.innerHTML = drafts.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có phiếu nháp nào bị xóa.</td></tr>'
                : drafts.map(d => `
                    <tr>
                        <td style="font-family:monospace;font-weight:700;">${escapeHtml(d.survey_code || d.draft_key)}</td>
                        <td>${escapeHtml(d.tool_code || 'P1')}</td>
                        <td>${escapeHtml(d.respondent_name || '—')}</td>
                        <td style="font-size:0.74rem;">${escapeHtml(d.deleted_at || '')}</td>
                        <td style="text-align:center;">
                            <button type="button" onclick="restoreDraftFromTrash(${d.archive_id}, '${escapeQuotes(d.survey_code || d.draft_key)}')" style="background:#0369a1;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                                <i class="fa-solid fa-rotate-left"></i> Khôi phục
                            </button>
                        </td>
                    </tr>
                `).join('');
        }

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

async function restoreDraftFromTrash(archiveId, code) {
    if (!confirm(`Khôi phục lại phiếu nháp [${code}]?`)) return;
    try {
        const res = await fetch(apiUrl(`/api/admin/restore/draft/${archiveId}`), {
            method: 'POST',
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(data.message);
            await loadTrashList();
            await loadSurveysList();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể khôi phục nháp'));
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
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
        const sSender = document.getElementById('cfgSmtpSender');
        const sPass = document.getElementById('cfgSmtpPassword');
        const rRcpts = document.getElementById('cfgReportRecipients');
        if (pAdmin) pAdmin.value = data.pass_admin || '';
        if (pView) pView.value = data.pass_viewer || '';
        if (aName) aName.value = data.admin_name || 'Quản Trị Viên (Admin)';
        if (sSender) sSender.value = data.smtp_sender || '';
        if (sPass) sPass.value = data.smtp_password || '';
        if (rRcpts) rRcpts.value = data.report_recipients || '';
    } catch (err) {
        console.error('Lỗi tải cấu hình bảo mật:', err);
    }
}

async function handleSaveAdminSettings(e) {
    e.preventDefault();
    const pAdmin = document.getElementById('cfgAdminPass').value.trim();
    const pView = document.getElementById('cfgViewerPass').value.trim();
    const aName = document.getElementById('cfgAdminName').value.trim();
    const sSender = (document.getElementById('cfgSmtpSender')?.value || '').trim();
    const sPass = (document.getElementById('cfgSmtpPassword')?.value || '').trim();
    const rRcpts = (document.getElementById('cfgReportRecipients')?.value || '').trim();

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
                admin_name: aName,
                smtp_sender: sSender,
                smtp_password: sPass,
                report_recipients: rRcpts
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
            alert('ĐÃ CẬP NHẬT THÀNH CÔNG!\n- Mật khẩu Quản trị viên & Khách xem đã được lưu.\n- Cấu hình Email báo cáo cuối ngày đã được cập nhật.');
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
                <td style="font-weight: 600;">
                    ${escapeHtml(u.full_name)}
                    ${u.phone ? `<div style="font-size: 0.72rem; color: #64748b; font-weight: 400;">SĐT: ${escapeHtml(u.phone)}</div>` : ''}
                </td>
                <td>${escapeHtml(u.commune_assigned || 'Ea Kiết')}</td>
                <td style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: #dc2626; white-space: nowrap;">
                    <span id="staffPwdMask_${idx}" data-shown="0" data-pwd="${escapeHtml(u.password || '')}">••••••••</span>
                    <button type="button" onclick="toggleStaffRowPassword(${idx})" title="Hiện/ẩn mật khẩu"
                        style="background: none; border: none; color: #475569; cursor: pointer; padding: 2px 4px; margin-left: 4px;">
                        <i class="fa-solid fa-eye" id="staffPwdEye_${idx}"></i>
                    </button>
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <button type="button" class="action-btn" title="Gửi tài khoản qua Zalo" 
                            onclick="copyZaloText('${escapeQuotes(u.surveyor_id)}', '${escapeQuotes(u.full_name)}', '${escapeQuotes(u.commune_assigned || 'Ea Kiết')}', '${escapeQuotes(u.password || '')}')"
                            style="background: #0284c7; color: #ffffff; padding: 3px 7px; border-radius: 3px; font-size: 0.75rem;">
                        <i class="fa-solid fa-share-nodes"></i> Zalo
                    </button>
                    <button type="button" class="action-btn" title="Sửa mã NV / họ tên / đổi mật khẩu" 
                            onclick="openEditStaffModal('${escapeQuotes(u.surveyor_id)}', '${escapeQuotes(u.full_name)}', '${escapeQuotes(u.phone || '')}', '${escapeQuotes(u.commune_assigned || 'Ea Kiết')}', '${escapeQuotes(u.password || '')}')"
                            style="background: #eab308; color: #713f12; padding: 3px 7px; border-radius: 3px; font-size: 0.75rem; margin: 0 2px;">
                        <i class="fa-solid fa-key"></i> Sửa / Đổi MK
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

function toggleStaffRowPassword(idx) {
    const span = document.getElementById(`staffPwdMask_${idx}`);
    const eye = document.getElementById(`staffPwdEye_${idx}`);
    if (!span) return;
    if (span.dataset.shown === '1') {
        span.textContent = '••••••••';
        span.dataset.shown = '0';
        if (eye) eye.className = 'fa-solid fa-eye';
    } else {
        span.textContent = span.dataset.pwd || '';
        span.dataset.shown = '1';
        if (eye) eye.className = 'fa-solid fa-eye-slash';
    }
}

function copyZaloText(id, name, commune, pass, isNew = false) {
    const primaryLink = 'https://dakmansurvey.coffeedata.it.com';
    const text = `Kính gửi: ${name}\nBan Quản lý Dự án Dakman Cư M'gar (Đơn vị tư vấn Tân Cao Nguyên) gửi bạn thông tin tài khoản khảo sát:\n- Link truy cập: ${primaryLink}\n- Họ và Tên: ${name}\n- Mã Điều Tra Viên (bắt buộc đúng từng ký tự): ${id}\n- Địa bàn phụ trách: ${commune}\n- Mật khẩu truy cập cá nhân: ${pass}\n\nLưu ý: Vui lòng mở bằng trình duyệt Chrome hoặc Safari để lưu nháp và đồng bộ dữ liệu ổn định. Mật khẩu là bảo mật cá nhân, không chia sẻ cho người khác. Chúc bạn hoàn thành tốt đợt điều tra!`;
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
    const origId = document.getElementById('editStaffOrigId').value.trim();
    const newId = document.getElementById('editStaffId').value.trim();
    const name = document.getElementById('editStaffName').value.trim();
    const phone = document.getElementById('editStaffPhone').value.trim();
    const commune = document.getElementById('editStaffCommune').value;
    const pwd = document.getElementById('editStaffPassword').value.trim();

    if (!newId || !name || !pwd) {
        alert('Vui lòng điền đầy đủ Mã NV, Họ tên và Mật khẩu!');
        return;
    }

    try {
        const res = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(origId)}`), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({
                new_surveyor_id: newId,
                full_name: name,
                phone: phone,
                commune_assigned: commune,
                password: pwd
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            copyZaloText(newId, name, commune, pwd, false);
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

// ========================================================
// BẢN ĐỒ GOOGLE HYBRID & THEO DÕI VỊ TRÍ 06 ĐIỀU TRA VIÊN
// ========================================================
let teamGeoMap = null;
let teamGeoLayerGroup = null;
let teamMarkersById = {};
let teamHeartbeatTimer = null;
let teamMapRefreshTimer = null;
let lastTeamPingSentAt = 0;

function getCurrentFormGpsTuple() {
    const gpsRaw = (document.getElementById('gpsInput')?.value || currentDraftAnswers?.A05 || '').trim();
    const parts = gpsRaw.split(',').map(x => parseFloat(String(x).trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Math.abs(parts[0]) > 0.01 && Math.abs(parts[1]) > 0.01) {
        return { lat: parts[0], lng: parts[1] };
    }
    if (bgBestGps && Number.isFinite(parseFloat(bgBestGps.lat)) && Number.isFinite(parseFloat(bgBestGps.lng))) {
        return { lat: parseFloat(bgBestGps.lat), lng: parseFloat(bgBestGps.lng) };
    }
    return { lat: 0, lng: 0 };
}

async function sendTeamLocationPing(latIn, lngIn, accIn, sourceLabel) {
    if (!currentUser || !currentUser.is_authenticated || ['viewer', 'admin1', 'admin'].includes(currentUser.role)) return;
    if (!navigator.onLine) return;

    const nowMs = Date.now();
    const hasExplicitGps = (latIn !== null && lngIn !== null && Math.abs(Number(latIn) || 0) > 0.01 && Math.abs(Number(lngIn) || 0) > 0.01);
    if (!hasExplicitGps && (nowMs - lastTeamPingSentAt) < 15000) return;

    let lat = hasExplicitGps ? Number(latIn) : 0;
    let lng = hasExplicitGps ? Number(lngIn) : 0;
    let acc = Number(accIn) || 0;
    if (!hasExplicitGps) {
        const curGps = getCurrentFormGpsTuple();
        lat = curGps.lat;
        lng = curGps.lng;
    }

    lastTeamPingSentAt = nowMs;
    const payload = {
        surveyor_id: currentUser.surveyor_id || '',
        full_name: currentUser.full_name || '',
        role: currentUser.role || 'editor',
        lat: lat,
        lng: lng,
        accuracy: acc,
        source: sourceLabel || (lat !== 0 ? 'GPS thực địa' : 'Đang online'),
        current_view: typeof currentMainView !== 'undefined' ? currentMainView : '',
        survey_code: (document.getElementById('surveyCodeInput')?.value || '').trim(),
        commune: (document.getElementById('communeSelect')?.value || currentUser.commune || '').trim()
    };

    try {
        await fetch(apiUrl('/api/location/ping'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (_) {
        // Bỏ qua lỗi mạng tạm thời khi đang chạy nền
    }
}

function startTeamHeartbeat() {
    if (teamHeartbeatTimer) clearInterval(teamHeartbeatTimer);
    teamHeartbeatTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (!currentUser || !currentUser.is_authenticated || currentUser.role === 'viewer') return;
        const curGps = getCurrentFormGpsTuple();
        if (curGps.lat !== 0 && curGps.lng !== 0) {
            sendTeamLocationPing(curGps.lat, curGps.lng, 0, 'GPS hiện trường');
        } else if (navigator.geolocation && currentMainView === 'survey') {
            try {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        sendTeamLocationPing(
                            pos.coords.latitude.toFixed(6),
                            pos.coords.longitude.toFixed(6),
                            Math.round(pos.coords.accuracy || 0),
                            'Định vị tự động'
                        );
                    },
                    () => sendTeamLocationPing(0, 0, 0, 'Đang online'),
                    { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 }
                );
            } catch (_) {
                sendTeamLocationPing(0, 0, 0, 'Đang online');
            }
        } else {
            sendTeamLocationPing(0, 0, 0, 'Đang online');
        }
    }, 45000);
}

let adminMenuMap = null;
let adminMenuLayerGroup = null;
let adminMenuMarkersById = {};

const mapInteractiveState = {
    team: {
        map: null,
        layerGroup: null,
        members: [],
        markersById: {},
        photoMarkersById: {},
        clusterByMemberId: {},
        spiderKey: null,
        spiderAll: false,
        activeHighlightId: null,
        wrapperId: 'teamGeoMapWrapper',
        canvasId: 'teamGoogleEarthMap',
        fsBtnId: 'btnTeamMapFullscreen',
        spiderBtnId: 'btnTeamMapSpiderfy',
        boundsFlag: '_teamBoundsFitted'
    },
    admin: {
        map: null,
        layerGroup: null,
        members: [],
        markersById: {},
        photoMarkersById: {},
        clusterByMemberId: {},
        spiderKey: null,
        spiderAll: false,
        activeHighlightId: null,
        wrapperId: 'adminMenuMapWrapper',
        canvasId: 'adminMenuActivityMap',
        fsBtnId: 'btnAdminMapFullscreen',
        spiderBtnId: 'btnAdminMapSpiderfy',
        boundsFlag: '_adminBoundsFitted'
    },
    map: {
        map: null,
        layerGroup: null,
        members: [],
        markersById: {},
        photoMarkersById: {},
        clusterByMemberId: {},
        spiderKey: null,
        spiderAll: false,
        activeHighlightId: null,
        wrapperId: 'standaloneMapWrapper',
        canvasId: 'standaloneActivityMap',
        fsBtnId: 'btnStandaloneMapFullscreen',
        spiderBtnId: 'btnStandaloneMapSpiderfy',
        boundsFlag: '_standaloneMapBoundsFitted'
    }
};

function initGoogleHybridMapInstance(mode) {
    const st = mapInteractiveState[mode];
    if (!st || typeof L === 'undefined') return null;
    const mapEl = document.getElementById(st.canvasId);
    if (!mapEl) return null;

    if (!st.map) {
        const m = L.map(st.canvasId, {
            center: [12.885, 108.115],
            zoom: 12,
            zoomControl: true
        });
        const googleHybridLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            attribution: 'Google Satellite Hybrid'
        });
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: 'OpenStreetMap'
        });
        googleHybridLayer.addTo(m);
        L.control.layers(
            {
                'Google Map Hybrid (Vệ tinh + Tên đường)': googleHybridLayer,
                'OpenStreetMap (Đường sá)': osmLayer
            },
            null,
            { position: 'topright' }
        ).addTo(m);
        st.layerGroup = L.layerGroup().addTo(m);
        st.map = m;

        m.on('click', () => {
            if (st.spiderKey || st.spiderAll || st.activeHighlightId) {
                st.spiderKey = null;
                st.spiderAll = false;
                st.activeHighlightId = null;
                updateMapSpiderButtonState(mode);
                renderTeamMapMarkersShared(mode, false);
            }
        });
        m.on('zoomend', () => {
            if (st.members && st.members.length > 0) {
                renderTeamMapMarkersShared(mode, false);
            }
        });

        if (mode === 'team') {
            teamGeoMap = m;
            teamGeoLayerGroup = st.layerGroup;
        } else if (mode === 'admin') {
            adminMenuMap = m;
            adminMenuLayerGroup = st.layerGroup;
        }
    }

    setTimeout(() => {
        if (st.map) st.map.invalidateSize();
    }, 150);
    return st.map;
}

function ensureTeamGoogleHybridMap() {
    return initGoogleHybridMapInstance('team');
}

function ensureAdminMenuMap() {
    return initGoogleHybridMapInstance('admin');
}

function ensureStandaloneTeamMap() {
    return initGoogleHybridMapInstance('map');
}

function getTeamStatusBadgeHtml(member) {
    const st = member.status || 'none';
    if (st === 'online') {
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:0.78rem;"><span style="width:8px;height:8px;border-radius:50%;background:#16a34a;"></span>${member.age_text || 'Đang online'}</span>`;
    }
    if (st === 'recent') {
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:700;font-size:0.78rem;"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></span>${member.age_text || 'Vừa hoạt động'}</span>`;
    }
    if (st === 'offline') {
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:#dbeafe;color:#1e40af;font-weight:700;font-size:0.78rem;"><span style="width:8px;height:8px;border-radius:50%;background:#2563eb;"></span>${member.age_text || 'Vị trí cuối'}</span>`;
    }
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:#f1f5f9;color:#475569;font-weight:600;font-size:0.78rem;">Chưa có tín hiệu</span>`;
}

function buildTeamMemberPopupHtml(m) {
    return `
        <div style="min-width:225px;font-size:12.5px;line-height:1.45;">
            <div style="font-weight:800;color:#0f2a4a;font-size:13.5px;margin-bottom:4px;">[${escapeHtml(m.surveyor_id)}] ${escapeHtml(m.full_name)}</div>
            <div><strong>Trạng thái:</strong> ${escapeHtml(m.status_label)} (${escapeHtml(m.age_text || '')})</div>
            <div><strong>Địa bàn:</strong> ${escapeHtml(m.commune || '')}</div>
            <div><strong>WGS84:</strong> <code>${m.lat}, ${m.lng}</code></div>
            <div><strong>Thời gian GPS:</strong> ${escapeHtml(m.gps_time_vn || m.last_seen_vn || 'Chưa có')}</div>
            <div><strong>Hoạt động / Hộ:</strong> ${escapeHtml(m.last_survey_code || '—')} ${escapeHtml(m.last_household || '')}</div>
            <div><strong>Phiếu đã nộp:</strong> ${m.completed_count || 0} phiếu (${m.draft_count || 0} nháp)</div>
            <div style="margin-top:7px;display:flex;gap:10px;flex-wrap:wrap;">
                <a href="${m.google_earth_url}" target="_blank" style="color:#0369a1;font-weight:700;text-decoration:none;"><i class="fa-solid fa-earth-asia"></i> Google Earth Web</a>
                <a href="${m.google_maps_url}" target="_blank" style="color:#15803d;font-weight:700;text-decoration:none;"><i class="fa-solid fa-map-pin"></i> Google Maps</a>
            </div>
        </div>
    `;
}

function createTeamPinIcon(m) {
    const color = m.status === 'online' ? '#16a34a' : (m.status === 'recent' ? '#f59e0b' : '#2563eb');
    return L.divIcon({
        className: 'team-pin-wrapper',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:auto;">
            <div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);">
                ${escapeHtml(m.surveyor_id)} • ${escapeHtml(m.full_name)}
            </div>
            <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);margin-top:2px;"></div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
    });
}

function projectSpiderfyLatLng(map, centerLatLng, angleRad, radiusPx) {
    try {
        const size = map.getSize();
        if (size && size.x > 0 && size.y > 0) {
            const centerPt = map.latLngToContainerPoint(centerLatLng);
            const targetPt = L.point(
                centerPt.x + Math.cos(angleRad) * radiusPx,
                centerPt.y + Math.sin(angleRad) * radiusPx
            );
            return map.containerPointToLatLng(targetPt);
        }
    } catch (_) {}
    const dLat = Math.sin(angleRad) * 0.00075;
    const dLng = Math.cos(angleRad) * 0.00075;
    return L.latLng(centerLatLng[0] + dLat, centerLatLng[1] + dLng);
}

function drawSnowflakeBurst(layerGroup, map, centerLatLng, color = '#38bdf8', radiusPx = 46) {
    const arms = 6;
    for (let i = 0; i < arms; i++) {
        const angle = (Math.PI * 2 * i) / arms - Math.PI / 2;
        const tip = projectSpiderfyLatLng(map, centerLatLng, angle, radiusPx);
        L.polyline([centerLatLng, tip], { color: '#ffffff', weight: 4, opacity: 0.8 }).addTo(layerGroup);
        L.polyline([centerLatLng, tip], { color, weight: 2, dashArray: '4,4', opacity: 0.95 }).addTo(layerGroup);
        L.circleMarker(tip, { radius: 3.5, color: '#ffffff', weight: 1.5, fillColor: color, fillOpacity: 1 }).addTo(layerGroup);
    }
}

function clusterTeamMembersForMap(map, members) {
    const valid = (members || []).filter(m => m.lat !== null && m.lng !== null);
    const size = map ? map.getSize() : { x: 0, y: 0 };
    const usePixels = Boolean(map && size && size.x > 40 && size.y > 40);
    const clusters = [];

    valid.forEach((m) => {
        const pt = usePixels ? map.latLngToContainerPoint([m.lat, m.lng]) : null;
        let target = null;
        for (const c of clusters) {
            if (usePixels) {
                const distPx = Math.hypot(pt.x - c.pt.x, pt.y - c.pt.y);
                if (distPx <= 48) { target = c; break; }
            } else {
                const dDeg = Math.hypot(m.lat - c.lat, m.lng - c.lng);
                if (dDeg <= 0.0005) { target = c; break; }
            }
        }
        if (!target) {
            clusters.push({
                key: `C_${String(m.surveyor_id).toUpperCase()}`,
                lat: m.lat,
                lng: m.lng,
                pt,
                members: [m]
            });
        } else {
            target.members.push(m);
            target.lat = target.members.reduce((s, x) => s + x.lat, 0) / target.members.length;
            target.lng = target.members.reduce((s, x) => s + x.lng, 0) / target.members.length;
            if (usePixels) target.pt = map.latLngToContainerPoint([target.lat, target.lng]);
        }
    });
    return clusters;
}

function updateMapSpiderButtonState(mode) {
    const st = mapInteractiveState[mode];
    const btn = st ? document.getElementById(st.spiderBtnId) : null;
    if (!btn) return;
    if (st.spiderAll) {
        btn.innerHTML = '<i class="fa-solid fa-snowflake"></i> Gom bông tuyết';
        btn.style.background = '#0284c7';
        btn.style.color = '#ffffff';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-snowflake"></i> Tỏa bông tuyết';
        btn.style.background = '#f0f9ff';
        btn.style.color = '#0369a1';
    }
}

function toggleSpiderfyAllForMap(mode) {
    const st = mapInteractiveState[mode];
    if (!st || !st.map) return;
    st.spiderAll = !st.spiderAll;
    if (!st.spiderAll) {
        st.spiderKey = null;
        st.activeHighlightId = null;
    }
    updateMapSpiderButtonState(mode);
    renderTeamMapMarkersShared(mode, false);
}

function toggleMapFullscreen(mode, forceState = null) {
    const st = mapInteractiveState[mode];
    if (!st) return;
    const wrapper = document.getElementById(st.wrapperId);
    const btn = document.getElementById(st.fsBtnId);
    if (!wrapper) return;
    const nextState = (forceState === null) ? !wrapper.classList.contains('is-fullscreen') : Boolean(forceState);
    wrapper.classList.toggle('is-fullscreen', nextState);
    document.body.style.overflow = document.querySelector('.map-fullscreen-wrapper.is-fullscreen') ? 'hidden' : '';
    if (btn) {
        btn.innerHTML = nextState
            ? '<i class="fa-solid fa-compress"></i> Thu nhỏ'
            : `<i class="fa-solid fa-expand"></i> ${mode === 'team' ? 'Mở rộng toàn màn hình' : 'Mở rộng'}`;
    }
    setTimeout(() => {
        if (st.map) {
            st.map.invalidateSize(true);
            renderTeamMapMarkersShared(mode, false);
        }
    }, 140);
}

if (!window.__dakmanMapEscBound) {
    window.__dakmanMapEscBound = true;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('adminMenuMapWrapper')?.classList.contains('is-fullscreen')) {
                toggleMapFullscreen('admin', false);
            }
            if (document.getElementById('teamGeoMapWrapper')?.classList.contains('is-fullscreen')) {
                toggleMapFullscreen('team', false);
            }
            if (document.getElementById('standaloneMapWrapper')?.classList.contains('is-fullscreen')) {
                toggleMapFullscreen('map', false);
            }
        }
    });
}

function renderTeamMapMarkersShared(mode, fitAll = false) {
    const st = mapInteractiveState[mode];
    if (!st || !st.map || !st.layerGroup) return;
    const map = st.map;
    const lg = st.layerGroup;
    lg.clearLayers();
    st.markersById = {};
    st.photoMarkersById = {};
    st.clusterByMemberId = {};

    const clusters = clusterTeamMembersForMap(map, st.members);
    const bounds = [];

    clusters.forEach((c) => {
        bounds.push([c.lat, c.lng]);
        if (c.members.length === 1) {
            const m = c.members[0];
            const sid = String(m.surveyor_id).toUpperCase();
            if (st.spiderAll || st.activeHighlightId === sid) {
                const col = m.status === 'online' ? '#16a34a' : (m.status === 'recent' ? '#f59e0b' : '#0284c7');
                drawSnowflakeBurst(lg, map, [m.lat, m.lng], col, 42);
            }
            const marker = L.marker([m.lat, m.lng], { icon: createTeamPinIcon(m) }).addTo(lg);
            marker.bindPopup(buildTeamMemberPopupHtml(m));
            marker.on('click', (ev) => {
                L.DomEvent.stopPropagation(ev);
                st.activeHighlightId = sid;
                renderTeamMapMarkersShared(mode, false);
                st.markersById[sid]?.openPopup();
            });
            st.markersById[sid] = marker;
            return;
        }

        const isExpanded = st.spiderAll || (st.spiderKey === c.key);
        c.members.forEach((m) => {
            st.clusterByMemberId[String(m.surveyor_id).toUpperCase()] = c.key;
        });

        if (!isExpanded) {
            const previewIds = c.members.map(m => m.surveyor_id).join(', ');
            const hubIcon = L.divIcon({
                className: 'team-pin-wrapper',
                html: `<div class="snowflake-hub-badge" title="Bấm để tỏa bông tuyết tách từng điều tra viên">
                    <i class="fa-solid fa-snowflake" style="color:#38bdf8;"></i>
                    <span>${c.members.length} ĐTV (${escapeHtml(previewIds)}) • Bấm tỏa</span>
                </div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            });
            const hubMarker = L.marker([c.lat, c.lng], { icon: hubIcon, zIndexOffset: 500 }).addTo(lg);
            hubMarker.on('click', (ev) => {
                L.DomEvent.stopPropagation(ev);
                st.spiderKey = c.key;
                renderTeamMapMarkersShared(mode, false);
            });
            c.members.forEach((m) => {
                st.markersById[String(m.surveyor_id).toUpperCase()] = hubMarker;
            });
        } else {
            const radiusPx = Math.max(82, 58 + c.members.length * 11);
            const hubIcon = L.divIcon({
                className: 'team-pin-wrapper',
                html: `<div class="snowflake-hub-badge" style="background:#0369a1;border-color:#fff;" title="Bấm để gom lại">
                    <i class="fa-solid fa-snowflake"></i>
                    <span>Thu gọn (${c.members.length})</span>
                </div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            });
            const centerPt = [c.lat, c.lng];
            const centerHub = L.marker(centerPt, { icon: hubIcon, zIndexOffset: 400 }).addTo(lg);
            centerHub.on('click', (ev) => {
                L.DomEvent.stopPropagation(ev);
                if (st.spiderKey === c.key) st.spiderKey = null;
                if (st.spiderAll) st.spiderAll = false;
                updateMapSpiderButtonState(mode);
                renderTeamMapMarkersShared(mode, false);
            });

            c.members.forEach((m, idx) => {
                const sid = String(m.surveyor_id).toUpperCase();
                const angle = (Math.PI * 2 * idx) / c.members.length - Math.PI / 2;
                const legTarget = projectSpiderfyLatLng(map, centerPt, angle, radiusPx);
                const col = m.status === 'online' ? '#16a34a' : (m.status === 'recent' ? '#f59e0b' : '#0284c7');
                L.polyline([centerPt, legTarget], { color: '#ffffff', weight: 4.5, opacity: 0.85 }).addTo(lg);
                L.polyline([centerPt, legTarget], { color: col, weight: 2.2, dashArray: '5,4', opacity: 0.95 }).addTo(lg);

                const petalMarker = L.marker(legTarget, { icon: createTeamPinIcon(m), zIndexOffset: 700 + idx }).addTo(lg);
                petalMarker.bindPopup(buildTeamMemberPopupHtml(m));
                petalMarker.on('click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    st.activeHighlightId = sid;
                    petalMarker.openPopup();
                });
                st.markersById[sid] = petalMarker;
            });
        }
    });

    if (mode === 'team') teamMarkersById = st.markersById;
    else if (mode === 'admin') adminMenuMarkersById = st.markersById;

    const fieldPhotosList = Array.isArray(window._cachedFieldPhotos) ? window._cachedFieldPhotos : [];
    fieldPhotosList.forEach((fp) => {
        const lat = Number(fp.gps_lat);
        const lng = Number(fp.gps_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) return;
        bounds.push([lat, lng]);
        const fpIcon = L.divIcon({
            className: 'team-pin-wrapper',
            html: `<div style="background:#be123c;color:#fff;border:2px solid #fff;border-radius:999px;padding:3px 7px;font-size:11px;font-weight:800;box-shadow:0 2px 6px rgba(0,0,0,0.45);white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">
                <i class="fa-solid fa-camera"></i> ${escapeHtml(fp.survey_code || fp.photo_code || ('#' + fp.id))}
            </div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
        const imgUrl = fp.photo_url ? apiUrl(fp.photo_url) : '';
        const thumbUrl = photoThumbUrl(imgUrl);
        const earthUrl = `https://earth.google.com/web/search/${lat.toFixed(6)},${lng.toFixed(6)}`;
        const popupHtml = `
            <div style="min-width:225px;max-width:270px;font-size:12.5px;line-height:1.45;">
                <div style="font-weight:800;color:#9f1239;margin-bottom:4px;"><i class="fa-solid fa-camera"></i> ${escapeHtml(fp.photo_code || ('Ảnh #' + fp.id))}</div>
                ${imgUrl ? `<a href="${imgUrl}" target="_blank" style="display:block;margin-bottom:6px;"><img src="${thumbUrl}" alt="Ảnh hiện trường" style="width:100%;max-height:145px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;"></a>` : ''}
                <div><strong>Ghi chú:</strong> ${escapeHtml(fp.note || 'Chưa có ghi chú')}</div>
                ${fp.survey_code ? `<div><strong>Mã hộ / Phiếu:</strong> ${escapeHtml(fp.survey_code)}</div>` : ''}
                <div><strong>Địa bàn:</strong> ${escapeHtml(fp.commune || '—')} • <strong>ĐTV:</strong> ${escapeHtml(fp.surveyor_name || fp.surveyor_id || '—')}</div>
                <div><strong>WGS84:</strong> <code>${lat.toFixed(6)}, ${lng.toFixed(6)}</code></div>
                <div style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;">
                    ${imgUrl ? `<a href="${imgUrl}" target="_blank" download style="color:#be123c;font-weight:700;text-decoration:none;"><i class="fa-solid fa-download"></i> Ảnh HD gốc</a>` : ''}
                    <a href="${earthUrl}" target="_blank" style="color:#0369a1;font-weight:700;text-decoration:none;"><i class="fa-solid fa-earth-asia"></i> Google Earth</a>
                </div>
            </div>
        `;
        const fpMarker = L.marker([lat, lng], { icon: fpIcon, zIndexOffset: 300 }).addTo(lg);
        fpMarker.bindPopup(popupHtml);
        st.photoMarkersById[String(fp.id)] = fpMarker;
    });

    if (bounds.length > 0 && (fitAll || !map[st.boundsFlag])) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
        map[st.boundsFlag] = true;
    }
}

function focusMemberOnSharedMap(mode, surveyorId) {
    const st = mapInteractiveState[mode];
    const sid = String(surveyorId || '').toUpperCase();
    const targetMember = (st?.members || []).find(x => String(x.surveyor_id).toUpperCase() === sid && x.lat !== null && x.lng !== null);
    if (!targetMember || !st?.map) {
        alert(`Điều tra viên ${surveyorId} hiện chưa ghi nhận tọa độ GPS nào trên máy chủ.`);
        return;
    }
    const cKey = st.clusterByMemberId[sid];
    if (cKey) st.spiderKey = cKey;
    st.activeHighlightId = sid;
    st.map.setView([targetMember.lat, targetMember.lng], 17, { animate: false });
    renderTeamMapMarkersShared(mode, false);
    const marker = st.markersById[sid];
    if (marker) marker.openPopup();
    if (mode === 'team') {
        document.getElementById('teamGoogleEarthMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function focusTeamMemberOnMap(surveyorId) {
    focusMemberOnSharedMap('team', surveyorId);
}

function focusAdminMenuMember(surveyorId) {
    focusMemberOnSharedMap('admin', surveyorId);
}

function startSharedTeamMapRefreshTimer() {
    if (teamMapRefreshTimer) return;
    teamMapRefreshTimer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (document.getElementById('userLoginModal')?.classList.contains('active')) return;
        if (typeof currentMainView !== 'undefined' && currentMainView === 'dashboard') {
            loadTeamLocationsMap(false);
        } else if (typeof currentMainView !== 'undefined' && currentMainView === 'map') {
            refreshStandaloneTeamMap(false);
        } else if (typeof currentMainView !== 'undefined' && currentMainView === 'menu' && (currentUser?.role === 'admin' || currentUser?.role === 'admin1')) {
            refreshAdminMenuLiveBoard(false);
        }
    }, 30000);
}

async function loadTeamLocationsMap(fitAll = false) {
    const summaryEl = document.getElementById('teamLocationSummaryText');
    const tbody = document.getElementById('teamLocationsTbody');
    const kmlBtn = document.getElementById('btnDownloadTeamKml');
    if (kmlBtn) kmlBtn.href = apiUrl('/api/team-locations.kml');

    try {
        const data = await fetchJsonWithTimeout(apiUrl('/api/team-locations'), 8000);
        const members = Array.isArray(data.members) ? data.members : [];
        if (summaryEl) {
            const totalMembers = members.length || 7;
            summaryEl.innerHTML = `Cập nhật lúc <strong>${data.updated_at_vn || ''}</strong> • Đang online: <strong style="color:#15803d;">${data.online_count || 0}/${totalMembers}</strong> ĐTV • Đã có tọa độ GPS: <strong style="color:#0369a1;">${data.gps_count || 0}/${totalMembers}</strong> ĐTV • <em>Bấm vào cụm/chốt để tỏa bông tuyết</em>`;
        }

        const map = ensureTeamGoogleHybridMap();
        mapInteractiveState.team.members = members;
        if (map) {
            renderTeamMapMarkersShared('team', fitAll);
        }

        if (tbody) {
            tbody.innerHTML = members.map((m) => {
                const coordHtml = (m.lat !== null && m.lng !== null)
                    ? `<div><code style="font-size:0.78rem;">${m.lat}, ${m.lng}</code></div><div style="font-size:0.74rem;color:var(--slate-500);">${escapeHtml(m.gps_time_vn || '')} • ${escapeHtml(m.gps_source || '')}</div>`
                    : `<span style="color:var(--slate-400);font-size:0.8rem;">Chưa ghi nhận GPS</span>`;
                const surveyHtml = m.last_survey_code
                    ? `<strong>${escapeHtml(m.last_survey_code)}</strong><div style="font-size:0.75rem;color:var(--slate-600);">${escapeHtml(m.last_household || m.last_activity || '')}</div>`
                    : `<span style="color:var(--slate-500);font-size:0.78rem;">${escapeHtml(m.last_activity || '—')}</span>`;
                const reminderPill = m.reminder_text
                    ? `<div style="margin-top:3px;"><span style="display:inline-block;background:#fffbeb;color:#92400e;border:1px solid #fcd34d;border-radius:4px;padding:1px 6px;font-size:0.71rem;font-weight:700;" title="${escapeHtml(m.reminder_text)}"><i class="fa-solid fa-bell"></i> ${escapeHtml(m.reminder_level || 'Nhắc nhở')}: ${escapeHtml(m.reminder_text.slice(0, 40))}${m.reminder_text.length > 40 ? '…' : ''}</span></div>`
                    : '';
                const actionHtml = `<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" onclick="openInterviewerHouseholdsView('${escapeHtml(m.surveyor_id)}')" class="qgis-btn-primary" style="padding:4px 8px;font-size:0.76rem;background:#002060;border-color:#002060;">
                            <i class="fa-solid fa-list-check"></i> Hộ PV
                        </button>
                        ${(m.lat !== null && m.lng !== null) ? `<button type="button" onclick="focusTeamMemberOnMap('${escapeHtml(m.surveyor_id)}')" class="qgis-btn-secondary" style="padding:4px 8px;font-size:0.76rem;">
                            <i class="fa-solid fa-crosshairs"></i> Định vị
                        </button>
                        <a href="${m.google_earth_url}" target="_blank" class="qgis-btn-secondary" style="padding:4px 8px;font-size:0.76rem;text-decoration:none;color:#0369a1;">
                            <i class="fa-solid fa-earth-asia"></i> Earth
                        </a>` : ''}
                       </div>`;

                return `
                    <tr>
                        <td><strong>${escapeHtml(m.surveyor_id)}</strong></td>
                        <td>
                            <a href="javascript:void(0)" onclick="openInterviewerHouseholdsView('${escapeHtml(m.surveyor_id)}')" style="font-weight:800;color:#002060;text-decoration:underline;cursor:pointer;">${escapeHtml(m.full_name)}</a>
                            <div style="font-size:0.74rem;color:var(--slate-500);">${escapeHtml(m.last_seen_vn || '')}</div>
                            ${reminderPill}
                        </td>
                        <td>${escapeHtml(m.commune || '')}</td>
                        <td>${getTeamStatusBadgeHtml(m)}</td>
                        <td>${coordHtml}</td>
                        <td>${surveyHtml}</td>
                        <td style="text-align:center;">
                            <strong>${(m.completed_count || 0) + (m.draft_count || 0)}</strong>
                            <div style="font-size:0.71rem;color:#64748b;">${m.draft_count || 0} nháp • ${m.completed_count || 0} nộp</div>
                        </td>
                        <td style="text-align:center;">${actionHtml}</td>
                    </tr>
                `;
            }).join('');
        }
        startSharedTeamMapRefreshTimer();
    } catch (e) {
        if (summaryEl) {
            summaryEl.textContent = 'Không thể tải dữ liệu vị trí trực tuyến từ máy chủ lúc này.';
        }
    }
}

async function refreshAdminMenuLiveBoard(fitAll = false) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'admin1')) return;
    const isAdmin1 = (currentUser.role === 'admin1');
    const board = document.getElementById('adminMenuLiveBoard');
    const staffCard = document.getElementById('adminMenuStaffCard');
    const photoGalleryCard = document.getElementById('adminMenuPhotoGalleryCard');
    const staffListEl = document.getElementById('adminMenuStaffList');
    const chipEl = document.getElementById('adminMenuOnlineChip');
    const metaEl = document.getElementById('adminMenuMapMeta');
    const kmlEl = document.getElementById('btnAdminMenuKml');
    if (board) board.style.display = 'grid';
    if (staffCard) staffCard.style.display = isAdmin1 ? 'none' : 'flex';
    if (photoGalleryCard) photoGalleryCard.style.display = isAdmin1 ? 'flex' : 'none';
    if (kmlEl) kmlEl.href = apiUrl('/api/team-locations.kml');

    try {
        const data = await fetchJsonWithTimeout(apiUrl('/api/team-locations'), 8000);
        const members = Array.isArray(data.members) ? data.members : [];
        if (chipEl) {
            const totalMembers = members.length || 7;
            chipEl.textContent = `${data.online_count || 0}/${totalMembers} online • ${data.gps_count || 0}/${totalMembers} có GPS`;
        }
        if (metaEl) {
            metaEl.innerHTML = `<span>Cập nhật lúc: <strong>${escapeHtml(data.updated_at_vn || '')}</strong></span><span>Bấm cụm/chốt để tỏa bông tuyết hoặc bấm Mở rộng</span>`;
        }

        if (staffListEl && !isAdmin1) {
            staffListEl.innerHTML = members.map((m) => {
                const hasGps = (m.lat !== null && m.lng !== null);
                const dotColor = m.status === 'online' ? '#16a34a' : (m.status === 'recent' ? '#f59e0b' : (hasGps ? '#2563eb' : '#94a3b8'));
                const coordStr = hasGps ? `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}` : 'Chưa có GPS';
                const reminderBadge = m.reminder_text
                    ? `<div style="font-size:0.72rem;color:#b45309;margin-top:2px;font-weight:700;"><i class="fa-solid fa-bell"></i> ${escapeHtml(m.reminder_level || 'Nhắc nhở')}: ${escapeHtml(m.reminder_text.slice(0, 50))}${m.reminder_text.length > 50 ? '…' : ''}</div>`
                    : '';
                return `
                    <div onclick="openInterviewerHouseholdsView('${escapeHtml(m.surveyor_id)}')" title="Bấm để xem danh sách các hộ đã phỏng vấn & gửi nhắc nhở" style="border: 1px solid #e2e8f0; border-left: 4px solid ${dotColor}; border-radius: 8px; padding: 8px 10px; background: #f8fafc; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="min-width: 170px; flex: 1;">
                            <div style="font-size: 0.85rem; font-weight: 800; color: #0f2a4a;">
                                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:5px;"></span>[${escapeHtml(m.surveyor_id)}] ${escapeHtml(m.full_name)}
                                <span style="font-size:0.72rem;font-weight:700;color:#0369a1;margin-left:6px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Xem hộ PV</span>
                            </div>
                            <div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">
                                Xã: <strong>${escapeHtml(m.commune || '')}</strong> • ${escapeHtml(m.last_survey_code || m.last_activity || 'Chưa có phiếu')}
                            </div>
                            <div style="font-size: 0.73rem; color: #64748b; font-family: monospace; margin-top: 2px;">
                                WGS84: ${escapeHtml(coordStr)}${m.last_seen_vn ? ` • ${escapeHtml(m.last_seen_vn)}` : ''}
                            </div>
                            ${reminderBadge}
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <div>${getTeamStatusBadgeHtml(m)}</div>
                            <div style="font-size: 0.74rem; color: #334155; font-weight: 700; margin-top: 4px;">
                                ${(m.completed_count || 0) + (m.draft_count || 0)} phiếu (${m.draft_count || 0} nháp • ${m.completed_count || 0} nộp)
                            </div>
                            ${hasGps ? `<button type="button" onclick="event.stopPropagation(); focusAdminMenuMember('${escapeHtml(m.surveyor_id)}')" class="qgis-btn-secondary" style="font-size:0.71rem;padding:2px 7px;margin-top:4px;"><i class="fa-solid fa-crosshairs"></i> Định vị</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        const map = ensureAdminMenuMap();
        mapInteractiveState.admin.members = members;
        if (map) {
            renderTeamMapMarkersShared('admin', fitAll);
        }
        startSharedTeamMapRefreshTimer();
    } catch (_) {
        if (staffListEl) {
            staffListEl.innerHTML = '<div style="color:#dc2626;font-size:0.82rem;text-align:center;padding:16px;">Không tải được trạng thái nhân sự từ VPS.</div>';
        }
    }
}

// ========================================================
// 12. CHỤP ẢNH HIỆN TRƯỜNG CHẤT LƯỢNG CAO & BẢN ĐỒ ĐỘC LẬP
// ========================================================
window._cachedFieldPhotos = [];
const FIELD_PHOTO_IDB_NAME = 'dakman_field_photos_idb_v1';
const FIELD_PHOTO_IDB_STORE = 'pending_photos';

function openFieldPhotoIdb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB không khả dụng'));
            return;
        }
        const req = indexedDB.open(FIELD_PHOTO_IDB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(FIELD_PHOTO_IDB_STORE)) {
                db.createObjectStore(FIELD_PHOTO_IDB_STORE, { keyPath: 'local_id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Lỗi mở IDB ảnh hiện trường'));
    });
}

async function putPendingFieldPhotoIdb(record) {
    try {
        const db = await openFieldPhotoIdb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(FIELD_PHOTO_IDB_STORE, 'readwrite');
            tx.objectStore(FIELD_PHOTO_IDB_STORE).put(record);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (_) {
        return false;
    }
}

async function getAllPendingFieldPhotosIdb() {
    try {
        const db = await openFieldPhotoIdb();
        return await new Promise((resolve) => {
            const tx = db.transaction(FIELD_PHOTO_IDB_STORE, 'readonly');
            const req = tx.objectStore(FIELD_PHOTO_IDB_STORE).getAll();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => resolve([]);
        });
    } catch (_) {
        return [];
    }
}

async function deletePendingFieldPhotoIdb(localId) {
    try {
        const db = await openFieldPhotoIdb();
        return await new Promise((resolve) => {
            const tx = db.transaction(FIELD_PHOTO_IDB_STORE, 'readwrite');
            tx.objectStore(FIELD_PHOTO_IDB_STORE).delete(localId);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (_) {
        return false;
    }
}

function parseGpsPair(str) {
    const parts = String(str || '').split(',').map(x => parseFloat(String(x).trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && Math.abs(parts[0]) > 0.01 && Math.abs(parts[1]) > 0.01) {
        return { lat: Number(parts[0].toFixed(6)), lng: Number(parts[1].toFixed(6)) };
    }
    return { lat: null, lng: null };
}

async function getFieldPhotoGpsCoords(timeoutMs = 5500) {
    const fpGpsEl = document.getElementById('fpGpsInput');
    const existing = parseGpsPair(fpGpsEl?.value || '');
    if (existing.lat !== null) return existing;

    if (bgBestGps && bgBestGps.lat && bgBestGps.lng) {
        const lat = Number(parseFloat(bgBestGps.lat).toFixed(6));
        const lng = Number(parseFloat(bgBestGps.lng).toFixed(6));
        if (fpGpsEl && !fpGpsEl.value.trim()) fpGpsEl.value = `${lat}, ${lng}`;
        return { lat, lng };
    }

    if (!navigator.geolocation) return { lat: null, lng: null };
    return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(6));
                const lng = Number(pos.coords.longitude.toFixed(6));
                if (fpGpsEl) fpGpsEl.value = `${lat}, ${lng}`;
                if (typeof sendTeamLocationPing === 'function') {
                    sendTeamLocationPing(lat, lng, Math.round(pos.coords.accuracy || 0), 'Chụp ảnh hiện trường');
                }
                resolve({ lat, lng });
            },
            () => resolve({ lat: null, lng: null }),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
        );
    });
}

async function captureFieldPhotoGpsNow() {
    const fpGpsEl = document.getElementById('fpGpsInput');
    const statusEl = document.getElementById('fieldQuickPhotoStatus');
    if (statusEl) {
        statusEl.style.color = '#d97706';
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang bắt tọa độ WGS84 chính xác...';
    }
    if (!navigator.geolocation) {
        if (statusEl) {
            statusEl.style.color = '#dc2626';
            statusEl.textContent = 'Thiết bị chưa bật hoặc không hỗ trợ định vị GPS.';
        }
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            const acc = Math.round(pos.coords.accuracy || 0);
            if (fpGpsEl) fpGpsEl.value = `${lat}, ${lng}`;
            if (statusEl) {
                statusEl.style.color = '#15803d';
                statusEl.textContent = `Đã khóa GPS WGS84: ${lat}, ${lng} (sai số ~${acc}m)`;
            }
            if (typeof sendTeamLocationPing === 'function') {
                sendTeamLocationPing(lat, lng, acc, 'Lấy GPS chụp ảnh');
            }
        },
        (err) => {
            if (statusEl) {
                statusEl.style.color = '#dc2626';
                statusEl.textContent = `Không lấy được GPS (${err.message}). Có thể chụp ảnh trước hoặc nhập tọa độ.`;
            }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
}

function triggerFieldQuickPhotoCapture(sourceType = 'camera') {
    if (currentUser?.role === 'viewer' || currentUser?.role === 'admin1') {
        alert('Tài khoản Chỉ Xem / Admin1 không được phép chụp hoặc tải ảnh lên.');
        return;
    }
    const id = (sourceType === 'gallery') ? 'fieldLibraryPhotoInput' : 'fieldQuickPhotoInput';
    const inp = document.getElementById(id);
    if (inp) {
        inp.value = '';
        inp.click();
    }
}

async function createHighResWatermarkedFieldPhoto(file, meta) {
    const maxDim = 1920;
    const decodeSource = async () => {
        if (typeof createImageBitmap === 'function') {
            try {
                const bmp = await createImageBitmap(file);
                return { source: bmp, w: bmp.width, h: bmp.height, cleanup: () => { try { bmp.close(); } catch (_) {} } };
            } catch (_) {}
        }
        return await new Promise((resolve, reject) => {
            const img = new Image();
            const objUrl = URL.createObjectURL(file);
            img.onload = () => resolve({
                source: img,
                w: img.naturalWidth || img.width,
                h: img.naturalHeight || img.height,
                cleanup: () => URL.revokeObjectURL(objUrl)
            });
            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                reject(new Error('Tệp ảnh không hợp lệ'));
            };
            img.src = objUrl;
        });
    };

    const decoded = await decodeSource();
    const canvas = document.createElement('canvas');
    try {
        let w = decoded.w || 1920;
        let h = decoded.h || 1440;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(decoded.source, 0, 0, w, h);
        if (typeof decoded.cleanup === 'function') {
            decoded.cleanup();
            decoded.cleanup = null;
        }

        const fontSize = Math.max(16, Math.round(w * 0.020));
        const lineHeight = Math.round(fontSize * 1.45);
        const padding = Math.round(fontSize * 0.8);
        const barHeight = lineHeight * 3 + padding * 1.6;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.80)';
        ctx.fillRect(0, h - barHeight, w, barHeight);
        ctx.fillStyle = '#fb7185';
        ctx.fillRect(0, h - barHeight, Math.max(5, Math.round(w * 0.006)), barHeight);

        ctx.textBaseline = 'top';
        const startY = h - barHeight + padding * 0.7;
        const leftX = padding + 8;
        const maxTextW = Math.max(180, w - leftX - padding);

        const wgs84Text = meta.lat !== null && meta.lng !== null
            ? `Lat ${meta.lat.toFixed(6)}, Long ${meta.lng.toFixed(6)} (WGS84)`
            : 'Chưa có tọa độ WGS84';
        const line1 = `DAKMAN CƯ M'GAR | Ảnh hiện trường${meta.surveyCode ? ' | Mã: ' + meta.surveyCode : ''}${meta.note ? ' | ' + meta.note.slice(0, 60) : ''}`;
        const line2 = `Vị trí ${wgs84Text} | ${meta.timestampStr}`;
        const line3 = `Địa bàn: ${meta.commune || 'Cư M\'gar'} | ĐTV: ${meta.surveyorName} (${meta.surveyorId}) | HD ${w}x${h}`;

        ctx.fillStyle = '#ffffff';
        drawFittedWatermarkLine(ctx, line1, leftX, startY, fontSize, true, maxTextW);
        ctx.fillStyle = '#fde047';
        drawFittedWatermarkLine(ctx, line2, leftX, startY + lineHeight, fontSize, false, maxTextW);
        ctx.fillStyle = '#e2e8f0';
        drawFittedWatermarkLine(ctx, line3, leftX, startY + lineHeight * 2, fontSize, false, maxTextW);

        let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        if (dataUrl.length > 3.5 * 1024 * 1024) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.76);
        }
        return { dataUrl, width: w, height: h, wgs84Text };
    } finally {
        canvas.width = 0;
        canvas.height = 0;
        if (typeof decoded.cleanup === 'function') decoded.cleanup();
    }
}

let _fieldPhotoAutoSyncTimer = null;
function scheduleAutoFieldPhotoSync() {
    if (_fieldPhotoAutoSyncTimer) return;
    _fieldPhotoAutoSyncTimer = setInterval(async () => {
        if (!navigator.onLine || currentUser?.role === 'viewer' || currentUser?.role === 'admin1') return;
        const left = await getAllPendingFieldPhotosIdb();
        if (!left.length) {
            clearInterval(_fieldPhotoAutoSyncTimer);
            _fieldPhotoAutoSyncTimer = null;
            return;
        }
        await syncPendingFieldPhotosQueue(true);
    }, 8000);
}

async function postFieldPhotoWithRetry(payload, maxRetries = 3) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000);
        try {
            const res = await fetch(apiUrl('/api/field-photos'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: ctrl.signal
            });
            clearTimeout(timer);
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                return data;
            }
            lastErr = new Error(data.error || `HTTP ${res.status}`);
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
        }
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 1200));
        }
    }
    throw lastErr || new Error('Upload failed');
}

async function handleFieldQuickPhotoSelected(event) {
    const inputEl = event.target;
    const files = Array.from(inputEl?.files || []);
    if (!files.length) return;
    if (currentUser?.role === 'viewer' || currentUser?.role === 'admin1') {
        alert('Tài khoản Chỉ Xem / Admin1 không được phép tải ảnh lên.');
        if (inputEl) inputEl.value = '';
        return;
    }

    const totalFiles = files.length;
    const statusEl = document.getElementById('fieldQuickPhotoStatus');
    if (statusEl) {
        statusEl.style.color = '#0369a1';
        statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${totalFiles > 1 ? `Đang đẩy lên VPS (1/${totalFiles})...` : 'Đang đẩy lên VPS...'}`;
    }

    let uploadedCount = 0;
    let queuedCount = 0;
    let lastUploadedCode = '';

    try {
        const coords = await getFieldPhotoGpsCoords(3500);
        const pad = (n) => String(n).padStart(2, '0');
        const surveyCode = (document.getElementById('fpSurveyCodeInput')?.value || '').trim();
        const commune = (document.getElementById('fpCommuneSelect')?.value || currentUser?.commune || 'Ea Kiết').trim();
        const noteEl = document.getElementById('fpNoteInput');
        const note = (noteEl?.value || '').trim();
        const surveyorId = currentUser?.surveyor_id || 'DTV';
        const surveyorName = currentUser?.full_name || 'Điều tra viên';

        for (let idx = 0; idx < totalFiles; idx++) {
            const file = files[idx];
            if (statusEl) {
                statusEl.style.color = '#0369a1';
                statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${totalFiles > 1 ? `Đang đẩy lên VPS (${idx + 1}/${totalFiles})...` : 'Đang đẩy lên VPS...'}`;
            }

            const now = new Date();
            const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            const rendered = await createHighResWatermarkedFieldPhoto(file, {
                lat: coords.lat,
                lng: coords.lng,
                timestampStr,
                surveyCode,
                commune,
                note,
                surveyorId,
                surveyorName
            });

            const seqSuffix = totalFiles > 1 ? `_${idx + 1}` : '';
            const photoCode = `FP_${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${seqSuffix}_${surveyorId}`;
            const payload = {
                photo_code: photoCode,
                survey_code: surveyCode,
                surveyor_id: surveyorId,
                surveyor_name: surveyorName,
                role: currentUser?.role || 'editor',
                commune: commune,
                note: note,
                gps_lat: coords.lat,
                gps_lng: coords.lng,
                photo_data: rendered.dataUrl,
                photo_meta: `${timestampStr} | ${rendered.wgs84Text} | ${rendered.width}x${rendered.height}`
            };

            try {
                const data = await postFieldPhotoWithRetry(payload, 3);
                uploadedCount += 1;
                lastUploadedCode = data.photo_code || photoCode;
            } catch (_netErr) {
                const localRec = Object.assign({ local_id: `LOCAL_${Date.now()}_${idx}`, saved_at: timestampStr }, payload);
                await putPendingFieldPhotoIdb(localRec);
                queuedCount += 1;
            }
        }

        if (inputEl) inputEl.value = '';
        if (noteEl && uploadedCount > 0 && queuedCount === 0) noteEl.value = '';

        if (queuedCount === 0 && uploadedCount > 0) {
            const doneMsg = totalFiles > 1
                ? `<strong>Done</strong> — Đã đẩy ${uploadedCount}/${totalFiles} ảnh lên VPS!`
                : `<strong>Done</strong> — Đã đẩy ảnh <strong>[${escapeHtml(lastUploadedCode)}]</strong> lên VPS!`;
            if (statusEl) {
                statusEl.style.color = '#15803d';
                statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${doneMsg}`;
            }
            showInstantActionToast(totalFiles > 1 ? `Done — Đã đẩy ${uploadedCount}/${totalFiles} ảnh lên VPS!` : `Done — Đã đẩy ảnh [${lastUploadedCode}] lên VPS!`);
            await loadFieldPhotosGallery(false);
        } else {
            if (statusEl) {
                statusEl.style.color = '#0369a1';
                statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đẩy lên VPS (hệ thống tự động đồng bộ hoàn tất)...';
            }
            await loadFieldPhotosGallery(false);
            scheduleAutoFieldPhotoSync();
            setTimeout(() => { syncPendingFieldPhotosQueue(true); }, 1500);
        }
    } catch (err) {
        if (inputEl) inputEl.value = '';
        if (statusEl) {
            statusEl.style.color = '#dc2626';
            statusEl.textContent = 'Lỗi xử lý ảnh hiện trường: ' + err.message;
        }
        alert('Không thể xử lý ảnh hiện trường: ' + err.message);
    }
}

async function syncPendingFieldPhotosQueue(silent = false) {
    if (!navigator.onLine || currentUser?.role === 'viewer' || currentUser?.role === 'admin1') return 0;
    const pending = await getAllPendingFieldPhotosIdb();
    updatePendingFieldPhotosUi(pending.length);
    if (!pending.length) return 0;

    const statusEl = document.getElementById('fieldQuickPhotoStatus');
    let uploaded = 0;
    for (const item of pending) {
        try {
            const res = await fetch(apiUrl('/api/field-photos'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (res.ok) {
                await deletePendingFieldPhotoIdb(item.local_id);
                uploaded += 1;
            }
        } catch (_) {}
    }

    const left = await getAllPendingFieldPhotosIdb();
    updatePendingFieldPhotosUi(left.length);
    if (left.length > 0) scheduleAutoFieldPhotoSync();
    if (uploaded > 0) {
        if (statusEl && left.length === 0) {
            statusEl.style.color = '#15803d';
            statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> <strong>Done</strong> — Đã đẩy ảnh lên VPS!';
        }
        if (!silent) showInstantActionToast(`Done — Đã đẩy ${uploaded} ảnh lên VPS!`);
        if (currentMainView === 'field-photos') {
            await loadFieldPhotosGallery(false);
        } else {
            refreshFieldPhotosBadgeCount();
        }
    }
    return uploaded;
}

function updatePendingFieldPhotosUi(count) {
    const badgeEl = document.getElementById('autoUploadPendingBadge');
    const span = document.getElementById('pendingFieldPhotosCount');
    if (span) span.textContent = String(count || 0);
    if (badgeEl) badgeEl.style.display = (count > 0) ? 'inline-flex' : 'none';
}

async function refreshFieldPhotosBadgeCount() {
    try {
        const isAdmin1 = (currentUser?.role === 'admin1');
        const list = await fetchJsonWithTimeout(apiUrl('/api/photo-library'), 8000);
        if (Array.isArray(list)) {
            window._cachedPhotoLibrary = list;
            window._cachedFieldPhotos = list;
            const pending = isAdmin1 ? [] : await getAllPendingFieldPhotosIdb();
            if (!isAdmin1) updatePendingFieldPhotosUi(pending.length);
            const total = list.length + pending.length;
            const badge = document.getElementById('menuFieldPhotosBadge');
            if (badge) {
                badge.textContent = isAdmin1 ? `${total} ảnh HD • Chỉ xem` : `${total} ảnh HD • Lưu thẳng VPS`;
            }
        }
    } catch (_) {}
}

async function initFieldPhotosView() {
    if (currentUser?.commune) {
        const sel = document.getElementById('fpCommuneSelect');
        if (sel && Array.from(sel.options).some(o => o.value === currentUser.commune)) {
            sel.value = currentUser.commune;
        }
    }
    await syncPendingFieldPhotosQueue(true);
    await loadFieldPhotosGallery(false);
}

async function loadFieldPhotosGallery(showToast = false) {
    const role = currentUser?.role || 'viewer';
    const isAdmin1 = (role === 'admin1');
    const isReadOnly = (role === 'viewer' || isAdmin1);
    const pending = isReadOnly ? [] : await getAllPendingFieldPhotosIdb();
    updatePendingFieldPhotosUi(pending.length);
    window._cachedPendingFieldPhotos = pending;

    try {
        const rows = await fetchJsonWithTimeout(apiUrl('/api/photo-library'), 12000);
        const list = Array.isArray(rows) ? rows : [];
        window._cachedPhotoLibrary = list;
        window._cachedFieldPhotos = list;
        renderFieldPhotosGallery();
        if (showToast) showInstantActionToast(`Đã tải ${list.length} ảnh hiện trường & phiếu PV từ VPS.`);
    } catch (e) {
        const galleryEl = document.getElementById('fieldPhotosGallery');
        if (galleryEl && !pending.length) {
            galleryEl.innerHTML = `<div style="color:#dc2626; font-size:0.85rem; padding:20px; text-align:center; grid-column:1 / -1;">Không thể kết nối máy chủ VPS để tải danh sách ảnh hiện trường.</div>`;
        }
    }
}

function renderFieldPhotosGallery() {
    const galleryEl = document.getElementById('fieldPhotosGallery');
    const countEl = document.getElementById('fieldPhotosGalleryCount');
    const filterSid = (document.getElementById('fpGalleryFilterSurveyor')?.value || '').trim().toUpperCase();
    const listAll = Array.isArray(window._cachedFieldPhotos) ? window._cachedFieldPhotos : [];
    const pending = Array.isArray(window._cachedPendingFieldPhotos) ? window._cachedPendingFieldPhotos : [];

    const list = filterSid
        ? listAll.filter((fp) => recordMatchesStaffId(fp, filterSid))
        : listAll;

    if (countEl) countEl.textContent = String(list.length + (filterSid ? 0 : pending.length));
    const badge = document.getElementById('menuFieldPhotosBadge');
    if (badge) badge.textContent = `${listAll.length + pending.length} ảnh HD • Lưu thẳng VPS`;

    if (!galleryEl) return;
    const role = currentUser?.role || 'viewer';
    const isReadOnly = (role === 'viewer' || role === 'admin1');

    const pendingCards = filterSid ? '' : pending.map((p) => `
            <div style="border:1.5px solid #bae6fd; border-radius:10px; background:#f0f9ff; overflow:hidden; display:flex; flex-direction:column;">
                <img src="${p.photo_data}" alt="Ảnh đang đẩy lên VPS" style="width:100%; height:190px; object-fit:cover; background:#0f172a;">
                <div style="padding:10px; font-size:0.82rem; display:flex; flex-direction:column; gap:6px; flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <strong style="color:#0369a1;">${escapeHtml(p.photo_code || 'Ảnh hiện trường')}</strong>
                        <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-spinner fa-spin"></i> Đang đẩy lên VPS...</span>
                    </div>
                    <div style="color:#475569;">${escapeHtml(p.note || 'Chưa có ghi chú')}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(p.photo_meta || p.saved_at || '')}</div>
                </div>
            </div>
        `).join('');

    const serverCards = list.map((fp) => {
        const imgUrl = apiUrl(fp.photo_url || `/api/photos/${fp.photo_path}`);
        const thumbUrl = photoThumbUrl(imgUrl);
        const hasGps = (fp.gps_lat !== null && fp.gps_lng !== null && Math.abs(Number(fp.gps_lat)) > 0.01);
        const srcType = fp.source_type || fp.source || 'field_photo';
        const isStandalone = (srcType === 'field_photo');
        const canEditOrDelete = !isReadOnly && isStandalone && (role === 'admin' || isCurrentUserOwnerOf(fp.surveyor_id, fp.surveyor_name, false));
        const cardId = String(fp.id ?? fp.uid ?? '');
        const codeLabel = fp.photo_code || fp.survey_code || ('#' + cardId);
        const sourceTag = fp.source_label || (srcType === 'survey' ? 'Phiếu hoàn thành' : (srcType === 'draft' ? 'Phiếu tạm' : 'Ảnh hiện trường'));
        return `
                <div id="fp-card-${escapeHtml(cardId)}" style="border:1px solid #cbd5e1; border-radius:10px; background:#ffffff; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 1px 3px rgba(15,23,42,0.05);">
                    <a href="${imgUrl}" target="_blank" title="Bấm để xem ảnh HD kích thước đầy đủ" style="display:block; background:#0f172a;">
                        <img src="${thumbUrl}" loading="lazy" decoding="async" alt="${escapeHtml(codeLabel)}" style="width:100%; height:195px; object-fit:cover; display:block;">
                    </a>
                    <div style="padding:10px; font-size:0.82rem; display:flex; flex-direction:column; gap:6px; flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                            <strong style="color:#0f2a4a; font-family:monospace;">${escapeHtml(codeLabel)}</strong>
                            <span style="background:#dcfce7; color:#166534; padding:2px 7px; border-radius:999px; font-size:0.72rem; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Done (${escapeHtml(sourceTag)})</span>
                        </div>
                        <div style="font-size:0.76rem; color:#475569;">
                            <strong>ĐTV:</strong> ${escapeHtml(fp.surveyor_name || fp.surveyor_id || '—')} (${escapeHtml(fp.surveyor_id || '—')}) • <strong>Xã:</strong> ${escapeHtml(fp.commune || '—')}
                            ${fp.respondent_name ? ` • <strong>Chủ hộ:</strong> ${escapeHtml(fp.respondent_name)}` : ''}
                        </div>
                        <div style="font-size:0.73rem; color:#64748b; font-family:monospace;">
                            ${escapeHtml(fp.photo_meta || (hasGps ? `${fp.gps_lat}, ${fp.gps_lng}` : fp.created_at || ''))}
                        </div>
                        <div style="margin-top:2px;">
                            <label for="fp-note-edit-${fp.id}" style="display:block; font-size:0.73rem; font-weight:700; color:#334155; margin-bottom:2px;">Ghi chú (Note):</label>
                            <textarea id="fp-note-edit-${fp.id}" rows="2" ${isReadOnly || !isStandalone ? 'readonly' : ''} placeholder="Không có ghi chú"
                                style="width:100%; padding:6px 8px; border:1px solid #cbd5e1; border-radius:5px; font-size:0.80rem; font-family:inherit; box-sizing:border-box; resize:vertical;">${escapeHtml(fp.note || '')}</textarea>
                        </div>
                        <div style="margin-top:auto; display:flex; gap:6px; flex-wrap:wrap; padding-top:4px;">
                            ${(!isReadOnly && isStandalone) ? `<button type="button" onclick="saveFieldPhotoNote(${fp.id})" class="qgis-btn-primary" style="font-size:0.75rem; padding:5px 9px; background:#0f2a4a; border-color:#1e3a8a;">
                                <i class="fa-solid fa-floppy-disk"></i> Lưu ghi chú
                            </button>` : ''}
                            ${hasGps ? `<button type="button" onclick="focusFieldPhotoOnStandaloneMap('${escapeQuotes(cardId)}')" class="qgis-btn-secondary" style="font-size:0.75rem; padding:5px 9px; color:#0f766e; border-color:#99f6e4; background:#f0fdfa;">
                                <i class="fa-solid fa-map-pin"></i> Bản đồ
                            </button>` : ''}
                            <a href="${imgUrl}" target="_blank" download class="qgis-btn-secondary" style="font-size:0.75rem; padding:5px 9px; text-decoration:none; color:#0369a1;">
                                <i class="fa-solid fa-download"></i> Ảnh HD
                            </a>
                            ${canEditOrDelete ? `<button type="button" onclick="deleteFieldPhotoItem(${fp.id}, '${escapeQuotes(codeLabel)}')" class="qgis-btn-secondary" style="font-size:0.75rem; padding:5px 9px; color:#dc2626; border-color:#fca5a5; background:#fef2f2;">
                                <i class="fa-solid fa-trash-can"></i> Xóa
                            </button>` : ''}
                        </div>
                    </div>
                </div>
            `;
    }).join('');

    if (!pendingCards && !serverCards) {
        galleryEl.innerHTML = `<div style="color:#64748b; font-size:0.86rem; padding:26px; text-align:center; grid-column:1 / -1;">${isReadOnly ? 'Chưa có ảnh hiện trường nào được tải lên từ đội ngũ điều tra viên.' : 'Chưa có ảnh hiện trường nào được tải lên. Hãy nhập ghi chú (nếu cần) và bấm <strong>Chụp ảnh HD ngay</strong> bên trên!'}</div>`;
    } else {
        galleryEl.innerHTML = pendingCards + serverCards;
    }
}

async function saveFieldPhotoNote(id) {
    if (currentUser?.role === 'viewer') return;
    const inp = document.getElementById(`fp-note-edit-${id}`);
    if (!inp) return;
    const note = inp.value.trim();
    try {
        const res = await fetch(apiUrl(`/api/field-photos/${id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note,
                role: currentUser?.role || 'editor',
                surveyor_id: currentUser?.surveyor_id || ''
            })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            const cached = (window._cachedFieldPhotos || []).find(x => String(x.id) === String(id));
            if (cached) cached.note = note;
            showInstantActionToast('Đã lưu ghi chú ảnh hiện trường lên VPS!');
        } else {
            alert('Không thể lưu ghi chú: ' + (data.error || `HTTP ${res.status}`));
        }
    } catch (_) {
        alert('Lỗi kết nối VPS khi lưu ghi chú ảnh.');
    }
}

async function deleteFieldPhotoItem(id, labelCode = '') {
    const role = currentUser?.role || 'viewer';
    if (role === 'viewer') {
        alert('Tài khoản Chỉ Xem không được phép xóa ảnh.');
        return;
    }
    const detailHtml = `
        <div><strong>Ảnh hiện trường cần xóa:</strong> <span style="font-family:monospace;color:#991b1b;">${escapeHtml(labelCode || ('#' + id))}</span></div>
        <div style="margin-top:4px;font-size:0.78rem;color:#64748b;">Ảnh sẽ được chuyển vào Thùng rác lưu trữ trên VPS (tệp ảnh gốc vẫn được bảo toàn).</div>
    `;
    const confirmed = await requestConfirmDeleteWithX('Xác nhận xóa ảnh hiện trường', detailHtml);
    if (!confirmed) return;

    try {
        const res = await fetch(apiUrl(`/api/field-photos/${id}`), {
            method: 'DELETE',
            headers: {
                'X-Confirm-Delete': 'X',
                'X-User-Role': role,
                'X-User-Id': currentUser?.surveyor_id || '',
                'X-Delete-Password': currentUser?.key || '',
                'X-Admin-Key': role === 'admin' ? (getAdminKey() || currentUser?.key || '') : ''
            }
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            showInstantActionToast(`Đã xóa ảnh hiện trường [${labelCode || id}].`);
            await loadFieldPhotosGallery(false);
        } else {
            alert('Không thể xóa ảnh: ' + (data.error || `HTTP ${res.status}`));
        }
    } catch (_) {
        alert('Lỗi kết nối máy chủ VPS khi xóa ảnh.');
    }
}

async function refreshStandaloneTeamMap(fitAll = false) {
    const summaryEl = document.getElementById('standaloneMapSummaryText');
    const staffListEl = document.getElementById('standaloneMapStaffList');
    const photoListEl = document.getElementById('standaloneMapPhotoList');
    const kmlEl = document.getElementById('btnStandaloneMapKml');
    if (kmlEl) kmlEl.href = apiUrl('/api/team-locations.kml');

    try {
        const [teamData, photosData] = await Promise.all([
            fetchJsonWithTimeout(apiUrl('/api/team-locations'), 8000),
            fetchJsonWithTimeout(apiUrl('/api/photo-library'), 10000).catch(() => null)
        ]);

        const members = Array.isArray(teamData?.members) ? teamData.members : [];
        if (Array.isArray(photosData)) {
            window._cachedFieldPhotos = photosData;
        }
        const gpsPhotos = (window._cachedFieldPhotos || []).filter(fp =>
            fp.gps_lat !== null && fp.gps_lng !== null && Math.abs(Number(fp.gps_lat)) > 0.01
        );

        if (summaryEl) {
            const totalMembers = members.length || 7;
            summaryEl.innerHTML = `Cập nhật lúc <strong>${escapeHtml(teamData?.updated_at_vn || '')}</strong> • Đang online: <strong style="color:#15803d;">${teamData?.online_count || 0}/${totalMembers}</strong> ĐTV • Đã có GPS: <strong style="color:#0369a1;">${teamData?.gps_count || 0}/${totalMembers}</strong> ĐTV • Ảnh hiện trường có GPS: <strong style="color:#be123c;">${gpsPhotos.length}</strong> ảnh • <em>Bấm vào cụm/chốt để tỏa bông tuyết</em>`;
        }

        if (staffListEl) {
            staffListEl.innerHTML = members.map((m) => {
                const hasGps = (m.lat !== null && m.lng !== null);
                const dotColor = m.status === 'online' ? '#16a34a' : (m.status === 'recent' ? '#f59e0b' : (hasGps ? '#2563eb' : '#94a3b8'));
                const coordStr = hasGps ? `${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)}` : 'Chưa có GPS';
                return `
                    <div onclick="focusMemberOnSharedMap('map', '${escapeHtml(m.surveyor_id)}')" style="border: 1px solid #e2e8f0; border-left: 4px solid ${dotColor}; border-radius: 8px; padding: 8px 10px; background: #f8fafc; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div style="min-width: 170px; flex: 1;">
                            <div style="font-size: 0.85rem; font-weight: 800; color: #0f2a4a;">
                                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:5px;"></span>[${escapeHtml(m.surveyor_id)}] ${escapeHtml(m.full_name)}
                            </div>
                            <div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">
                                Xã: <strong>${escapeHtml(m.commune || '')}</strong> • ${escapeHtml(m.last_survey_code || m.last_activity || 'Chưa có phiếu')}
                            </div>
                            <div style="font-size: 0.73rem; color: #64748b; font-family: monospace; margin-top: 2px;">
                                WGS84: ${escapeHtml(coordStr)}${m.last_seen_vn ? ` • ${escapeHtml(m.last_seen_vn)}` : ''}
                            </div>
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <div>${getTeamStatusBadgeHtml(m)}</div>
                            <div style="font-size: 0.74rem; color: #334155; font-weight: 700; margin-top: 4px;">
                                ${(m.completed_count || 0) + (m.draft_count || 0)} phiếu (${m.draft_count || 0} nháp • ${m.completed_count || 0} nộp)
                            </div>
                        </div>
                    </div>
                `;
            }).join('') || '<div style="color:#64748b;font-size:0.82rem;text-align:center;padding:14px;">Chưa có dữ liệu thành viên.</div>';
        }

        if (photoListEl) {
            photoListEl.innerHTML = gpsPhotos.length
                ? gpsPhotos.slice(0, 30).map((fp) => {
                    const pKey = String(fp.id ?? fp.uid ?? '');
                    const thumbUrl = photoThumbUrl(apiUrl(fp.photo_url || `/api/photos/${fp.photo_path}`));
                    return `
                    <div onclick="focusFieldPhotoOnStandaloneMap('${escapeQuotes(pKey)}')" style="border: 1px solid #fecdd3; border-left: 4px solid #be123c; border-radius: 8px; padding: 8px 10px; background: #fff1f2; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                        <img src="${thumbUrl}" loading="lazy" decoding="async" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:6px; border:1px solid #fda4af; flex-shrink:0;">
                        <div style="min-width: 0; flex: 1;">
                            <div style="font-size: 0.83rem; font-weight: 800; color: #9f1239; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(fp.photo_code || ('Ảnh #' + pKey))}${fp.survey_code ? ` (${escapeHtml(fp.survey_code)})` : ''}
                            </div>
                            <div style="font-size: 0.76rem; color: #334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(fp.note || 'Không có ghi chú')}
                            </div>
                            <div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">
                                ${Number(fp.gps_lat).toFixed(5)}, ${Number(fp.gps_lng).toFixed(5)} • ${escapeHtml(fp.surveyor_name || fp.surveyor_id || '')}
                            </div>
                        </div>
                        <i class="fa-solid fa-location-dot" style="color:#be123c;"></i>
                    </div>
                `;
                }).join('')
                : '<div style="color:#64748b;font-size:0.82rem;text-align:center;padding:16px;">Chưa có ảnh hiện trường nào có tọa độ GPS. Hãy chụp ảnh ở mục <strong>5. Chụp ảnh hiện trường</strong>!</div>';
        }

        const map = ensureStandaloneTeamMap();
        mapInteractiveState.map.members = members;
        if (map) {
            renderTeamMapMarkersShared('map', fitAll);
        }
        startSharedTeamMapRefreshTimer();
    } catch (e) {
        if (summaryEl) {
            summaryEl.textContent = 'Không thể tải dữ liệu bản đồ trực tuyến từ máy chủ VPS.';
        }
    }
}

async function focusFieldPhotoOnStandaloneMap(photoId) {
    if (currentMainView !== 'map') {
        switchMainView('map');
        await refreshStandaloneTeamMap(false);
    }
    const fp = (window._cachedFieldPhotos || []).find(x => String(x.id) === String(photoId));
    const st = mapInteractiveState.map;
    if (!fp || fp.gps_lat === null || fp.gps_lng === null || !st?.map) {
        alert('Ảnh này chưa ghi nhận tọa độ GPS hợp lệ để định vị trên bản đồ.');
        return;
    }
    st.map.setView([Number(fp.gps_lat), Number(fp.gps_lng)], 17, { animate: false });
    renderTeamMapMarkersShared('map', false);
    const marker = st.photoMarkersById?.[String(photoId)];
    if (marker) marker.openPopup();
    document.getElementById('standaloneActivityMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function locateMeOnStandaloneMap() {
    if (!navigator.geolocation) {
        alert('Thiết bị không hỗ trợ định vị GPS.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            const acc = Math.round(pos.coords.accuracy || 0);
            if (typeof sendTeamLocationPing === 'function') {
                await sendTeamLocationPing(lat, lng, acc, 'Định vị trên Bản đồ');
            }
            await refreshStandaloneTeamMap(false);
            const st = mapInteractiveState.map;
            if (st?.map) {
                st.map.setView([lat, lng], 16, { animate: false });
            }
            showInstantActionToast(`Đã cập nhật vị trí GPS hiện tại: ${lat}, ${lng}`);
        },
        (err) => {
            alert('Không thể định vị GPS hiện tại: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        syncPendingFieldPhotosQueue(true);
    });
}

// ========================================================
// 13. THƯ VIỆN ẢNH MENU ADMIN1 & BẢNG HỎI BLANK (CHỈ XEM)
// ========================================================
window._cachedPhotoLibrary = [];
let activeBlankTool = 'P1';

async function loadAdminMenuPhotoGallery(forceRefresh = false) {
    if (currentUser?.role !== 'admin1') return;
    const gridEl = document.getElementById('adminMenuPhotoGallery');
    const chipEl = document.getElementById('adminMenuPhotoCountChip');
    if (!forceRefresh && window._cachedPhotoLibrary.length > 0) {
        renderAdminMenuPhotoGallery();
        return;
    }
    try {
        const rows = await fetchJsonWithTimeout(apiUrl('/api/photo-library'), 10000);
        window._cachedPhotoLibrary = Array.isArray(rows) ? rows : [];
        if (chipEl) chipEl.textContent = `${window._cachedPhotoLibrary.length} ảnh`;
        renderAdminMenuPhotoGallery();
    } catch (_) {
        if (gridEl) {
            gridEl.innerHTML = '<div style="color:#dc2626;font-size:0.82rem;text-align:center;padding:16px;grid-column:1/-1;">Không tải được thư viện ảnh hiện trường từ VPS.</div>';
        }
    }
}

function photoThumbUrl(url) {
    const u = String(url || '');
    if (!u || !u.includes('/api/photos/')) return u;
    return u + (u.includes('?') ? '&' : '?') + 'thumb=1';
}

function renderAdminMenuPhotoGallery() {
    const gridEl = document.getElementById('adminMenuPhotoGallery');
    const chipEl = document.getElementById('adminMenuPhotoCountChip');
    const filterSid = (document.getElementById('adminMenuPhotoFilter')?.value || '').trim().toUpperCase();
    const all = Array.isArray(window._cachedPhotoLibrary) ? window._cachedPhotoLibrary : [];
    const items = filterSid ? all.filter(x => recordMatchesStaffId(x, filterSid)) : all;
    if (chipEl) chipEl.textContent = `${items.length} ảnh`;
    if (!gridEl) return;

    if (items.length === 0) {
        gridEl.innerHTML = '<div style="color:#64748b;font-size:0.82rem;text-align:center;padding:20px;grid-column:1/-1;">Chưa có ảnh hiện trường cho mục đã chọn.</div>';
        return;
    }

    const previewItems = items.slice(0, 12);
    const cardsHtml = previewItems.map((p) => {
        const imgUrl = apiUrl(p.photo_url || `/api/photos/${p.photo_path}`);
        const thumbUrl = photoThumbUrl(imgUrl);
        const title = p.photo_code || p.survey_code || ('#' + p.id);
        return `
            <a href="${imgUrl}" target="_blank" title="${escapeHtml(p.note || title)}" style="display:flex;flex-direction:column;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;text-decoration:none;color:inherit;">
                <img src="${thumbUrl}" loading="lazy" decoding="async" alt="${escapeHtml(title)}" style="width:100%;height:110px;object-fit:cover;background:#0f172a;">
                <div style="padding:6px 8px;font-size:0.73rem;">
                    <div style="font-weight:800;color:#0f2a4a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(title)}</div>
                    <div style="color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.surveyor_id || '')} • ${escapeHtml(p.surveyor_name || '')}</div>
                    ${p.note ? `<div style="color:#64748b;font-size:0.70rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.note)}</div>` : ''}
                </div>
            </a>
        `;
    }).join('');
    const moreBtn = items.length > previewItems.length
        ? `<button type="button" onclick="switchMainView('field-photos')" style="grid-column:1/-1; background:#fdf2f8; color:#9d174d; border:1px solid #fbcfe8; border-radius:8px; padding:8px 12px; font-size:0.80rem; font-weight:700; cursor:pointer;"><i class="fa-solid fa-images"></i> Xem đầy đủ toàn bộ ${items.length} ảnh HD trong mục 5. Thư viện ảnh hiện trường</button>`
        : '';
    gridEl.innerHTML = cardsHtml + moreBtn;
}

async function openBlankQuestionsView() {
    if (!allQuestionsData || Object.keys(allQuestionsData).length === 0) {
        if (typeof loadQuestions === 'function') {
            await loadQuestions(false);
        }
    }
    selectBlankTool(activeBlankTool || 'P1');
}

function selectBlankTool(toolCode) {
    activeBlankTool = toolCode || 'P1';
    document.querySelectorAll('#blankToolTabs [data-blank-tool]').forEach((btn) => {
        const isSel = btn.getAttribute('data-blank-tool') === activeBlankTool;
        btn.className = isSel ? 'qgis-btn-primary' : 'qgis-btn-secondary';
    });
    renderBlankQuestionsViewer();
}

function renderBlankQuestionsViewer() {
    const container = document.getElementById('blankQuestionsContainer');
    const chip = document.getElementById('blankQuestionCountChip');
    if (!container) return;
    const toolObj = (typeof allQuestionsData !== 'undefined') ? allQuestionsData[activeBlankTool] : null;
    if (!toolObj || !Array.isArray(toolObj.questions)) {
        container.innerHTML = '<div style="color:#64748b;text-align:center;padding:20px;">Đang nạp bộ câu hỏi...</div>';
        return;
    }

    const kw = (document.getElementById('blankQuestionSearch')?.value || '').trim().toLowerCase();
    const optText = (o) => {
        if (o && typeof o === 'object') {
            return String(o.label ?? o.text ?? o.name ?? o.value ?? o.code ?? '').trim();
        }
        return String(o ?? '');
    };
    // Hiển thị 100% toàn bộ câu hỏi của công cụ (bỏ qua mọi điều kiện chụp ảnh / ẩn câu hỏi)
    const questions = toolObj.questions.filter((q) => {
        if (!kw) return true;
        const hay = `${q.code || ''} ${q.section || ''} ${q.text || q.question || ''} ${q.condition || ''} ${(q.options || []).map(optText).join(' ')}`.toLowerCase();
        return hay.includes(kw);
    });

    if (chip) chip.textContent = `Hiển thị đủ ${questions.length} / ${toolObj.questions.length} câu hỏi (${activeBlankTool})`;
    if (questions.length === 0) {
        container.innerHTML = '<div style="color:#64748b;text-align:center;padding:20px;">Không tìm thấy câu hỏi phù hợp từ khóa.</div>';
        return;
    }

    let lastSec = '';
    container.innerHTML = questions.map((q) => {
        const sec = q.section || 'Thông tin chung';
        let secHtml = '';
        if (sec !== lastSec) {
            lastSec = sec;
            secHtml = `<div style="background:#0f2a4a;color:#fff;padding:7px 12px;border-radius:6px;font-weight:700;font-size:0.84rem;margin-top:6px;">${escapeHtml(sec)}</div>`;
        }
        const qType = String(q.type || 'text').toLowerCase();
        let blankInputHtml = '';
        if (Array.isArray(q.options) && q.options.length > 0) {
            const isMulti = (qType.includes('multi') || qType.includes('check'));
            blankInputHtml = `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${q.options.map((o, i) => `
                <label style="display:inline-flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:5px;padding:4px 9px;font-size:0.79rem;color:#334155;cursor:not-allowed;">
                    <input type="${isMulti ? 'checkbox' : 'radio'}" disabled style="margin:0;accent-color:#1e40af;">
                    <span>${i + 1}. ${escapeHtml(optText(o))}</span>
                </label>`).join('')}</div>`;
        } else {
            const ph = qType.includes('number') || qType.includes('num')
                ? 'Ô trống nhập số (chế độ chỉ xem Blank Full Form)'
                : 'Ô trống ghi câu trả lời (chế độ chỉ xem Blank Full Form)';
            blankInputHtml = `<div style="margin-top:8px;"><input type="text" disabled value="" placeholder="${ph}" style="width:100%;max-width:520px;padding:6px 10px;border:1px dashed #cbd5e1;border-radius:5px;background:#f8fafc;color:#64748b;font-size:0.78rem;cursor:not-allowed;"></div>`;
        }

        const condParts = [];
        if (q.condition && String(q.condition).trim()) {
            condParts.push(`Điều kiện hiển thị: ${String(q.condition).trim()}`);
        }
        if (q.follow_up_on && String(q.follow_up_on).trim()) {
            condParts.push(`Câu hỏi bổ sung khi chọn: ${String(q.follow_up_on).trim()}${q.follow_up_placeholder ? ' (' + q.follow_up_placeholder + ')' : ''}`);
        }
        const condHtml = condParts.length > 0
            ? `<div style="margin-top:7px;padding:5px 9px;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;font-size:0.80rem;color:#dc2626;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(condParts.join(' • '))}</div>`
            : '';

        return `
            ${secHtml}
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:11px 13px;background:#fff;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                    <span style="font-family:monospace;font-weight:800;background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:4px;font-size:0.78rem;">${escapeHtml(q.code || '')}</span>
                    ${q.orig_code && q.orig_code !== q.code ? `<span style="font-family:monospace;font-size:0.72rem;color:#64748b;">(${escapeHtml(q.orig_code)})</span>` : ''}
                    <span style="font-size:0.72rem;font-weight:700;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;padding:1px 6px;border-radius:4px;">${escapeHtml((q.type || 'TEXT').toUpperCase())}</span>
                    ${q.indicator ? `<span style="font-size:0.72rem;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;padding:1px 6px;border-radius:4px;">Chỉ số: ${escapeHtml(q.indicator)}</span>` : ''}
                </div>
                <div style="font-size:0.89rem;font-weight:600;color:#0f172a;line-height:1.45;">${escapeHtml(q.text || q.question || '')}</div>
                ${blankInputHtml}
                ${condHtml}
            </div>
        `;
    }).join('');
}

