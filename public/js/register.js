async function registerUser(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('first_name', document.getElementById('first_name').value);
    formData.append('last_name', document.getElementById('last_name').value);
    formData.append('phone', document.getElementById('phone').value);
    formData.append('email', document.getElementById('email').value);
    formData.append('password', document.getElementById('password').value);

    const profilePic = document.getElementById('profile_pic').files[0];
    if (profilePic) {
        formData.append('profile_pic', profilePic);
    }

    const res = await fetch('/api/auth/register/user', {
        method: 'POST',
        // headers: { 'Content-Type': 'multipart/form-data' }, // Do not set content-type manually for FormData
        body: formData
    });

    const data = await res.json();
    const messageDiv = document.getElementById('message');
    if (res.ok) {
        messageDiv.textContent = data.message;
        messageDiv.className = 'alert alert-success';
        messageDiv.style.display = 'block';
        setTimeout(() => window.location.href = 'login_user.html', 2000);
    } else {
        messageDiv.textContent = data.message;
        messageDiv.className = 'alert alert-danger';
        messageDiv.style.display = 'block';
    }
}

async function registerProvider(e) {
    e.preventDefault();
    const formData = new FormData(e.target);

    const res = await fetch('/api/auth/register/provider', {
        method: 'POST',
        body: formData
    });

    const data = await res.json();
    const messageDiv = document.getElementById('message');
    if (res.ok) {
        messageDiv.textContent = data.message;
        messageDiv.className = 'alert alert-success';
        messageDiv.style.display = 'block';
        setTimeout(() => window.location.href = 'login_provider.html', 3000);
    } else {
        messageDiv.textContent = data.message;
        messageDiv.className = 'alert alert-danger';
        messageDiv.style.display = 'block';
    }
}
