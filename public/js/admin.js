document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    
    if (!token || role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // --- Stats ---
    async function fetchStats() {
        try {
            const res = await fetch('/api/stats', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const stats = await res.json();
                document.getElementById('adminTotalUniqueBooks').textContent = stats.totalUniqueBooks;
                document.getElementById('adminTotalStock').textContent = stats.totalStock;
                document.getElementById('adminTotalLended').textContent = stats.totalLended;
                document.getElementById('adminTotalUsers').textContent = stats.totalUsers;
            }
        } catch (error) { console.error(error); }
    }

    // --- Manage Users ---
    async function fetchAllUsers() {
        try {
            const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const users = await res.json();
                renderAllUsers(users);
            }
        } catch (error) { console.error(error); }
    }

    function renderAllUsers(users) {
        const tbody = document.getElementById('allUsersTable');
        tbody.innerHTML = '';
        users.forEach(u => {
            const isSelf = u.id === localStorage.getItem('userId');
            let actionHtml = '';
            if (!isSelf) {
                actionHtml = `
                    <button class="btn btn-sm btn-outline-info me-2 edit-btn" data-id="${u.id}" data-role="${u.role}" data-status="${u.status}"><i class="bi bi-pencil"></i> Edit</button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${u.id}"><i class="bi bi-trash"></i> Delete</button>
                `;
            } else {
                actionHtml = '<span class="text-muted small">You</span>';
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${u.id}</td>
                <td><span class="badge ${u.role === 'admin' ? 'bg-danger' : (u.role === 'personnel' ? 'bg-info text-dark' : 'bg-secondary')}">${u.role}</span></td>
                <td><span class="badge ${u.status === 'active' ? 'bg-success' : 'bg-warning text-dark'}">${u.status}</span></td>
                <td>${actionHtml}</td>
            `;
            tbody.appendChild(row);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('editUserId').value = target.getAttribute('data-id');
                document.getElementById('editUserRole').value = target.getAttribute('data-role');
                document.getElementById('editUserStatus').value = target.getAttribute('data-status');
                document.getElementById('editUserPassword').value = '';
                new bootstrap.Modal(document.getElementById('editUserModal')).show();
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm(`Are you sure you want to delete user ${id}?`)) {
                    try {
                        const res = await fetch(`/api/users/${id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                            fetchAllUsers();
                            fetchStats();
                        } else {
                            alert('Failed to delete user');
                        }
                    } catch (err) { alert('Network error'); }
                }
            });
        });
    }

    // --- Create User ---
    document.getElementById('createUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('newUserId').value;
        const password = document.getElementById('newUserPassword').value;
        const r = document.getElementById('newUserRole').value;

        try {
            const res = await fetch('/api/users/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id, password, role: r })
            });

            if (res.ok) {
                alert('User created successfully');
                document.getElementById('createUserForm').reset();
                fetchAllUsers();
                fetchStats();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create user');
            }
        } catch (error) { alert('Network error'); }
    });

    // --- Edit User Submit ---
    const editForm = document.getElementById('editUserForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editUserId').value;
            const role = document.getElementById('editUserRole').value;
            const status = document.getElementById('editUserStatus').value;
            const password = document.getElementById('editUserPassword').value;

            try {
                const res = await fetch(`/api/users/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ role, status, password })
                });
                if (res.ok) {
                    bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
                    fetchAllUsers();
                    fetchStats();
                } else {
                    alert('Failed to update user');
                }
            } catch (err) { alert('Network error'); }
        });
    }

    fetchStats();
    fetchAllUsers();
});
