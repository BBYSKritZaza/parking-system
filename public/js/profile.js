// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'index.html';
}

// Fetch Profile Data
async function fetchProfile() {
    try {
        const res = await fetch('/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('first_name').value = data.first_name;
            document.getElementById('last_name').value = data.last_name;
            document.getElementById('phone').value = data.phone;

            // Set current profile pic if available
            if (data.profile_pic) {
                const picEl = document.getElementById('currentProfilePic');
                if (picEl) picEl.src = data.profile_pic;
            }

            // Email removed from UI as per request, but keeping safe check just in case
            const emailField = document.getElementById('email');
            if (emailField) emailField.value = data.email;
        } else {
            // Handle 403 or 401
            if (res.status === 401 || res.status === 403) window.location.href = 'index.html';
            else alert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
}

async function updateProfile(e) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('first_name', document.getElementById('first_name').value);
    formData.append('last_name', document.getElementById('last_name').value);
    formData.append('phone', document.getElementById('phone').value);

    const profilePic = document.getElementById('profile_pic').files[0];
    if (profilePic) {
        formData.append('profile_pic', profilePic);
    }

    try {
        const res = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }, // No Content-Type for FormData
            body: formData
        });

        const data = await res.json();

        if (res.ok) {
            alert('Profile updated successfully');
            // Update local storage user data to reflect new pic immediately if we want
            // Or just reload. Reload is safer to get fresh data everywhere.
            // But we need to update localStorage 'user' so dashboard header sees it without re-login.
            // Let's re-fetch profile to get the new pic url and update localStorage.

            if (profilePic) {
                // Determine new path (best guess or response should return it)
                // Ideally backend returns the new profile_pic path.
                // For now, reload. The user will be on profile page. 
                // To update header, we need to update localStorage.
                // Let's do a fetchProfile to get new data and update localStorage?
                // For simplicity: Alert and reload. User might need to relogin to see header update if we default to localStorage only? 
                // Dashboard uses localStorage. Logic there: `const user = JSON.parse(localStorage.getItem('user'));`
                // So we MUST update localStorage.

                // Let's do a quick fetch to update localStorage
                const freshRes = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
                if (freshRes.ok) {
                    const freshData = await freshRes.json();
                    let user = JSON.parse(localStorage.getItem('user'));
                    user = { ...user, ...freshData }; // Merge updates
                    localStorage.setItem('user', JSON.stringify(user));
                }
            } else {
                // Even without pic, name might change
                const freshRes = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
                if (freshRes.ok) {
                    const freshData = await freshRes.json();
                    let user = JSON.parse(localStorage.getItem('user'));
                    user = { ...user, ...freshData };
                    localStorage.setItem('user', JSON.stringify(user));
                }
            }

            window.location.reload();
        } else {
            alert('Error updating profile: ' + data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Error updating profile');
    }
}

async function changePassword(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;

    if (!password) return alert('Password required');

    const res = await fetch('/api/profile/password', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password })
    });

    if (res.ok) {
        alert('Password updated successfully');
        document.getElementById('password').value = '';
    } else {
        alert('Error updating password');
    }
}

// Auto-init only if profile form exists
if (document.getElementById('profileForm')) {
    fetchProfile();
    document.getElementById('profileForm').addEventListener('submit', updateProfile);
}
