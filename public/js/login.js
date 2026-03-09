async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    const messageDiv = document.getElementById('message');

    if (res.status === 403 && data.redirect) {
        // Handle Suspension
        window.location.href = `${data.redirect}?reason=${encodeURIComponent(data.reason)}&email=${encodeURIComponent(data.email)}`;
        return;
    }

    if (res.ok) {
        localStorage.setItem('token', data.token);
        if (data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            // Also store provider_status separately if needed
            localStorage.setItem('provider_status', data.user.provider_status || 'none');
        }

        if (data.user.role === 'admin') {
            window.location.href = 'admin_dashboard.html';
        } else {
            // Always redirect to user dashboard as per requirement
            window.location.href = 'welcome_user.html';
        }
    } else {
        messageDiv.textContent = data.message;
        messageDiv.className = 'alert alert-danger';
        messageDiv.style.display = 'block';
    }
}
