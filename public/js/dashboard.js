function checkUserAuth() {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');

    if (!token || !user) {
        window.location.href = 'index.html'; // Fallback to landing if not logged in
        return null;
    }
    return user;
}

function checkProviderStatus() {
    const user = checkUserAuth();
    if (!user) return;

    // Handle User Dashboard specific logic
    if (window.location.href.includes('welcome_user.html')) {
        document.getElementById('userInfo').textContent = `Hello, ${user.first_name} ${user.last_name}`;

        // Update Profile Pic
        if (user.profile_pic) {
            const picElement = document.getElementById('headerProfilePic');
            if (picElement) picElement.src = user.profile_pic;
        }

        // Update Dropdown Provider Link
        const providerLink = document.getElementById('providerLink');
        if (providerLink && user.provider_status === 'approved') {
            providerLink.style.display = 'block';
            providerLink.href = 'welcome_provider.html';
        }

        const providerSection = document.getElementById('provider-section');
        if (providerSection) {
            const status = user.provider_status || 'none';
            if (status === 'none') {
                providerSection.innerHTML = '<a href="become_provider.html" class="btn" style="background-color: #007bff;">Become a Provider</a>';
            } else if (status === 'pending') {
                providerSection.innerHTML = '<div class="alert alert-warning">Provider Application Pending...</div>';
            } else if (status === 'approved') {
                providerSection.innerHTML = '<a href="welcome_provider.html" class="btn" style="background-color: #28a745;">Go to Provider Dashboard</a>';
            } else if (status === 'rejected') {
                providerSection.innerHTML = '<div class="alert alert-danger">Application Rejected. <a href="become_provider.html">Apply Again</a></div>';
            }
        }
    }
    // Handle Provider Dashboard specific logic
    else if (window.location.href.includes('welcome_provider.html')) {
        if (user.provider_status !== 'approved') {
            alert('Access Denied. You are not an approved provider.');
            window.location.href = 'welcome_user.html';
        } else {
            // Safe to show content
            const welcomeTitle = document.getElementById('welcomeTitle');
            const statusMessage = document.getElementById('statusMessage');
            if (welcomeTitle) welcomeTitle.textContent = 'Provider Dashboard';
            if (statusMessage) statusMessage.textContent = `Hello, ${user.first_name}. You are an active provider.`;
        }
    }
}

async function logout() {
    try {
        const token = localStorage.getItem('token');
        if (token) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    } catch (e) { console.error(e); }
    localStorage.clear();
    window.location.replace('index.html');
}
