const API_URL = '/api';

// Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCpceaN6NCYjF8aBSnAr2oorcc9WpveyoA",
  authDomain: "chat-app-demo-7d5c8.firebaseapp.com",
  projectId: "chat-app-demo-7d5c8",
  storageBucket: "chat-app-demo-7d5c8.firebasestorage.app",
  messagingSenderId: "447306601552",
  appId: "1:447306601552:web:44bd55538f9d245404ad55",
  measurementId: "G-DV11GKP596"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const analytics = firebase.analytics();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let isProcessing = false; // Biến chặn nhấn nhiều lần

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    setupAuthListeners();
});

function updateAuthUI() {
    const user = JSON.parse(localStorage.getItem('user'));
    const authBlock = document.getElementById('nav-auth-block');
    if (!authBlock) return;

    if (user) {
        const avatarHtml = user.avatar 
            ? `<img src="${user.avatar}" style="width: 38px; height: 38px; border-radius: 12px; object-fit: cover; border: 1px solid #e0e6e4;">`
            : `<div style="width: 38px; height: 38px; border-radius: 12px; background: #eef2f1; display: flex; align-items: center; justify-content: center; color: #00796B; border: 1px solid #e0e6e4;">
                    <i class="fa-solid fa-user"></i>
               </div>`;

        authBlock.innerHTML = `
            <div class="user-profile-wrapper" style="position: relative; display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 5px 0;">
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: #333; font-size: 14px;">${user.name}</div>
                    <div style="font-size: 11px; color: #00796B; font-weight: 600;">${user.role.toUpperCase()}</div>
                </div>
                ${avatarHtml}
                
                <div class="user-dropdown-menu">
                    <div class="dropdown-item" onclick="window.location.href='profile.html'"><i class="fa-solid fa-circle-user"></i> Trang cá nhân</div>
                    ${user.role === 'admin' ? `<div class="dropdown-item" onclick="window.location.href='admin.html'"><i class="fa-solid fa-gauge-high"></i> Admin Panel</div>` : ''}
                    <div class="dropdown-divider" style="height: 1px; background: #eee; margin: 5px 0;"></div>
                    <div class="dropdown-item logout" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</div>
                </div>
            </div>
        `;

        // Thêm CSS cho hiệu ứng Hover mượt mà nếu chưa có
        if (!document.getElementById('auth-custom-style')) {
            const style = document.createElement('style');
            style.id = 'auth-custom-style';
            style.innerHTML = `
                .user-profile-wrapper .user-dropdown-menu {
                    display: block;
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background: white;
                    min-width: 180px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    border-radius: 12px;
                    padding: 8px 0;
                    z-index: 1000;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(10px);
                    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    border: 1px solid #f0f0f0;
                }
                .user-profile-wrapper:hover .user-dropdown-menu {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                .dropdown-item {
                    padding: 10px 18px;
                    font-size: 14px;
                    color: #444;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: 0.2s;
                }
                .dropdown-item:hover {
                    background: #f5f8f7;
                    color: #00796B;
                }
                .dropdown-item i { width: 16px; text-align: center; }
                .dropdown-item.logout:hover { color: #d32f2f; background: #fff5f5; }
            `;
            document.head.appendChild(style);
        }
    } else {
        authBlock.innerHTML = `
            <button onclick="showAuthModal('login')" class="btn-primary" style="padding: 8px 20px; font-size: 14px; border-radius: 10px;">
                Đăng nhập
            </button>
        `;
    }
}

async function handleGoogleLogin() {
    if (isProcessing) return;
    isProcessing = true;
    const errEl = document.getElementById('modal-auth-err');
    if (errEl) errEl.innerText = "Đang kết nối Google...";

    try {
        const result = await auth.signInWithPopup(googleProvider);
        const idToken = await result.user.getIdToken();

        const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken })
        });

        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
            const errorText = await res.text();
            throw new Error(errorText || "Server Render không phản hồi JSON");
        }

        const data = await res.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            location.reload();
        } else {
            throw new Error(data.error || "Đăng nhập thất bại");
        }
    } catch (error) {
        console.error("Lỗi Google Login:", error);
        if (errEl) errEl.innerText = "Lỗi: " + (error.message.includes("cancelled") ? "Bạn đã đóng cửa sổ đăng nhập" : error.message);
    } finally {
        isProcessing = false;
    }
}

function showAuthModal(mode) {
    const modal = document.getElementById('auth-screen');
    const title = document.getElementById('auth-modal-title');
    const fields = document.getElementById('auth-form-fields');
    const submitBtn = document.getElementById('btn-auth-submit');
    const toggleBtn = document.getElementById('modal-toggle-wrapper');
    const errEl = document.getElementById('modal-auth-err');
    
    if (errEl) errEl.innerText = '';
    modal.style.display = 'flex';

    const googleBtn = document.getElementById('btn-google-login');
    if (googleBtn) googleBtn.onclick = handleGoogleLogin;
    
    if (mode === 'register') {
        title.innerText = 'Tạo tài khoản';
        fields.innerHTML = `
            <input type="text" id="auth-name" class="modal-input" placeholder="Họ và tên">
            <input type="email" id="auth-email" class="modal-input" placeholder="Email">
            <input type="password" id="auth-password" class="modal-input" placeholder="Mật khẩu">
        `;
        submitBtn.innerText = 'Đăng ký';
        toggleBtn.innerText = 'Đã có tài khoản? Đăng nhập';
        toggleBtn.onclick = () => showAuthModal('login');
        submitBtn.onclick = handleRegister;
    } else {
        title.innerText = 'Đăng nhập';
        fields.innerHTML = `
            <input type="email" id="auth-email" class="modal-input" placeholder="Email">
            <input type="password" id="auth-password" class="modal-input" placeholder="Mật khẩu">
        `;
        submitBtn.innerText = 'Đăng nhập';
        toggleBtn.innerText = 'Chưa có tài khoản? Đăng ký';
        toggleBtn.onclick = () => showAuthModal('register');
        submitBtn.onclick = handleLogin;
    }
}

async function handleLogin() {
    if (isProcessing) return;
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('modal-auth-err');
    
    isProcessing = true;
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            location.reload();
        } else {
            errEl.innerText = data.error || "Sai tài khoản hoặc mật khẩu.";
        }
    } catch (err) {
        errEl.innerText = 'Lỗi kết nối server.';
    } finally {
        isProcessing = false;
    }
}

async function handleRegister() {
    if (isProcessing) return;
    const name = document.getElementById('auth-name').value;
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('modal-auth-err');
    
    isProcessing = true;
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Đăng ký thành công!');
            showAuthModal('login');
        } else {
            errEl.innerText = data.error || "Đăng ký thất bại.";
        }
    } catch (err) {
        errEl.innerText = 'Lỗi kết nối server.';
    } finally {
        isProcessing = false;
    }
}

function toggleUserDropdown() {
    const menu = document.getElementById('user-dropdown');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function logout() {
    auth.signOut().then(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.reload();
    });
}

function setupAuthListeners() {
    window.onclick = (event) => {
        if (!event.target.closest('#nav-auth-block')) {
            const dropdown = document.getElementById('user-dropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    };
}
