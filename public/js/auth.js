document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already logged in, but only if on the index/login page
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const path = window.location.pathname;
    if (token && role && (path.endsWith('index.html') || path === '/')) {
        window.location.href = 'browse.html';
    }

    const showSignupBtn = document.getElementById('showSignupBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');
    const studentLoginSection = document.getElementById('studentLoginSection');
    const studentSignupSection = document.getElementById('studentSignupSection');
    const authAlert = document.getElementById('authAlert');

    if (showSignupBtn) {
        showSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            studentLoginSection.classList.add('d-none');
            studentSignupSection.classList.remove('d-none');
            hideAlert();
        });
    }

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            studentSignupSection.classList.add('d-none');
            studentLoginSection.classList.remove('d-none');
            hideAlert();
        });
    }

    function showAlert(message, type = 'danger') {
        authAlert.textContent = message;
        authAlert.className = `alert alert-${type} mt-3 fade-in`;
    }

    function hideAlert() {
        authAlert.classList.add('d-none');
    }

    async function handleLogin(e, idElement, passwordElement) {
        e.preventDefault();
        const id = document.getElementById(idElement).value;
        const password = document.getElementById(passwordElement).value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('userId', data.id);
                window.location.href = 'browse.html';
            } else {
                showAlert(data.error || 'Login failed');
            }
        } catch (error) {
            showAlert('Network error occurred.');
        }
    }

    document.getElementById('studentLoginForm')?.addEventListener('submit', (e) => handleLogin(e, 'studentId', 'studentPassword'));
    document.getElementById('personnelLoginForm')?.addEventListener('submit', (e) => handleLogin(e, 'personnelId', 'personnelPassword'));
    document.getElementById('adminLoginForm')?.addEventListener('submit', (e) => handleLogin(e, 'adminId', 'adminPassword'));

    document.getElementById('studentSignupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('signupId').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupPasswordConfirm').value;

        if (password !== confirmPassword) {
            showAlert('Passwords do not match');
            return;
        }

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, password })
            });

            const data = await response.json();

            if (response.ok) {
                showAlert('Signup successful! Please wait for personnel approval to login.', 'success');
                document.getElementById('studentSignupForm').reset();
                setTimeout(() => {
                    showLoginBtn.click();
                }, 3000);
            } else {
                showAlert(data.error || 'Signup failed');
            }
        } catch (error) {
            showAlert('Network error occurred.');
        }
    });
});

// Global logout function available to other pages
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    window.location.href = 'index.html';
}
