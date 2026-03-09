const token = localStorage.getItem('token');
if (!token) window.location.href = 'admin_login.html';

const headers = { 'Authorization': 'Bearer ' + token };

async function fetchUsers() {
    const res = await fetch('/api/admin/users', { headers });
    if (res.ok) {
        const users = await res.json();
        const tbody = document.querySelector('#usersTable tbody');
        if (tbody) {
            tbody.innerHTML = users.length ? users.map(u => `
                <tr>
                    <td>${u.first_name} ${u.last_name}</td>
                    <td>${u.email}</td>
                    <td>${u.phone}</td>
                    <td><button class="btn btn-secondary" style="background-color: #dc3545; padding: 0.25rem 0.5rem;" onclick="deleteUser(${u.id})">Delete</button></td>
                </tr>
            `).join('') : '<tr><td colspan="4" style="text-align:center;">No users found</td></tr>';
        }
    } else {
        console.error('Failed to fetch users');
    }
}

async function fetchProviders(filter = 'all') {
    const res = await fetch('/api/admin/providers', { headers });
    if (res.ok) {
        const providers = await res.json();

        let targetTable = '';
        let filteredProviders = providers;

        if (filter === 'pending') {
            targetTable = '#approvalTable tbody';
            filteredProviders = providers.filter(p => p.status === 'pending');
        } else {
            targetTable = '#providersTable tbody';
        }

        const tbody = document.querySelector(targetTable);
        if (tbody) {
            if (filteredProviders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No ${filter === 'pending' ? 'pending requests' : 'providers found'}</td></tr>`;
                return;
            }

            tbody.innerHTML = filteredProviders.map(p => {
                let actionBtn = '';
                if (filter === 'pending') {
                    actionBtn = `<button class="btn" style="padding: 0.25rem 0.5rem;" onclick="approveProvider(${p.id})">Approve</button>`;
                } else {
                    actionBtn = `<button class="btn btn-secondary" style="background-color: #dc3545; padding: 0.25rem 0.5rem;" onclick="deleteProvider(${p.id})">Delete</button>`;
                }

                // For approval, show ID Card link or number if available
                let info = filter === 'pending'
                    ? `<div>ID: ${p.id_card_number}</div>${p.id_card_image ? `<a href="${p.id_card_image}" target="_blank"><img src="${p.id_card_image}" alt="ID Card" style="width: 100px; height: auto; margin-top: 5px; border-radius: 4px;"></a>` : ''}`
                    : p.status;

                return `<tr>
                    <td>${p.first_name} ${p.last_name}</td>
                    <td>${p.email}</td>
                    <td>${info}</td>
                    <td>${actionBtn}</td>
                </tr>`;
            }).join('');
        }
    } else {
        console.error('Failed to fetch providers');
    }
}

async function approveProvider(id) {
    if (!confirm('Approve this provider?')) return;
    const res = await fetch(`/api/admin/approve-provider/${id}`, {
        method: 'PUT',
        headers
    });
    if (res.ok) {
        alert('Provider Approved');
        fetchProviders('pending');
    } else {
        alert('Error approving provider');
    }
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const res = await fetch(`/api/admin/user/${id}`, { method: 'DELETE', headers });
    if (res.ok) {
        fetchUsers();
    } else {
        alert('Error deleting user');
    }
}

async function deleteProvider(id) {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    const res = await fetch(`/api/admin/provider/${id}`, { method: 'DELETE', headers });
    if (res.ok) {
        fetchProviders('all');
    } else {
        alert('Error deleting provider');
    }
}

async function logout() {
    try {
        if (token) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    } catch (e) { console.error(e); }
    localStorage.clear();
    window.location.replace('admin_login.html');
}
