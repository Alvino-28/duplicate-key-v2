(() => {
  const SESSION_KEY = 'keydup_admin_logged_in';
  const DEFAULT_LOGIN = { username: 'kuncis', password: 'kuncis123' };
  const DASHBOARD_PAGE = 'index.html';

  const qs = (selector) => document.querySelector(selector);

  function showToast(message, kind = 'success') {
    const toastWrap = qs('#toastWrap');
    if (!toastWrap) return;
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.innerHTML = `<strong style="display:block;margin-bottom:4px">${kind === 'error' ? 'Gagal' : kind === 'warning' ? 'Perhatian' : 'Berhasil'}</strong><div>${message}</div>`;
    toastWrap.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  function redirectToDashboard() {
    window.location.replace(DASHBOARD_PAGE);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
      redirectToDashboard();
      return;
    }

    const form = qs('#loginForm');
    const usernameInput = qs('#loginUsername');
    const passwordInput = qs('#loginPassword');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (username === DEFAULT_LOGIN.username && password === DEFAULT_LOGIN.password) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        showToast('Login berhasil. Mengalihkan ke dashboard...');
        setTimeout(redirectToDashboard, 500);
      } else {
        showToast('Username atau password salah.', 'error');
      }
    });
  });
})();
