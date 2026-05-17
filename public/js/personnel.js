document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    
    if (!token || (role !== 'personnel' && role !== 'admin')) {
        window.location.href = 'index.html';
        return;
    }

    if (role === 'admin') {
        document.querySelector('.admin-link').classList.remove('d-none');
    }

    // --- Book Management ---
    const bookForm = document.getElementById('bookForm');
    const inventoryTable = document.getElementById('inventoryTable');
    let allBooks = [];

    async function fetchBooks() {
        try {
            const res = await fetch('/api/books', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                allBooks = await res.json();
                renderInventory();
            }
        } catch (error) {
            console.error(error);
        }
    }

    function renderInventory() {
        inventoryTable.innerHTML = '';
        allBooks.forEach(book => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${book.isbn}</td>
                <td>${book.name}</td>
                <td>${book.stock}</td>
                <td>
                    <button class="btn btn-sm btn-info edit-btn" data-isbn="${book.isbn}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-isbn="${book.isbn}">Del</button>
                </td>
            `;
            inventoryTable.appendChild(row);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', editBook));
        document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', deleteBook));
    }

    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isbn = document.getElementById('b-isbn').value;
        const name = document.getElementById('b-name').value;
        const author = document.getElementById('b-author').value;
        const publisher = document.getElementById('b-publisher').value;
        const publishYear = document.getElementById('b-year').value;
        const stock = document.getElementById('b-stock').value;
        const location = document.getElementById('b-location').value;
        
        const isEdit = document.getElementById('editMode').value === 'true';
        const method = isEdit ? 'PUT' : 'POST';
        const url = isEdit ? `/api/books/${isbn}` : '/api/books';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ isbn, name, author, publisher, publishYear, stock, location })
            });

            if (res.ok) {
                alert(isEdit ? 'Book updated' : 'Book added');
                document.getElementById('clearBookFormBtn').click();
                fetchBooks();
                fetchStats();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to save book');
            }
        } catch (error) {
            alert('Network error');
        }
    });

    function editBook(e) {
        const isbn = e.target.getAttribute('data-isbn');
        const book = allBooks.find(b => b.isbn === isbn);
        if (book) {
            document.getElementById('b-isbn').value = book.isbn;
            document.getElementById('b-isbn').disabled = true; // prevent changing isbn
            document.getElementById('b-name').value = book.name;
            document.getElementById('b-author').value = book.author;
            document.getElementById('b-publisher').value = book.publisher;
            document.getElementById('b-year').value = book.publishYear;
            document.getElementById('b-stock').value = book.stock;
            document.getElementById('b-location').value = book.location;
            document.getElementById('editMode').value = 'true';
            document.getElementById('saveBookBtn').textContent = 'Update Book';
        }
    }

    async function deleteBook(e) {
        if (!confirm('Are you sure you want to delete this book?')) return;
        const isbn = e.target.getAttribute('data-isbn');
        try {
            const res = await fetch(`/api/books/${isbn}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchBooks();
                fetchStats();
            }
        } catch (error) {
            alert('Network error');
        }
    }

    document.getElementById('clearBookFormBtn').addEventListener('click', () => {
        bookForm.reset();
        document.getElementById('b-isbn').disabled = false;
        document.getElementById('editMode').value = 'false';
        document.getElementById('saveBookBtn').textContent = 'Save Book';
    });


    // --- Google Books API & Scanner ---
    const scannerModal = document.getElementById('scannerModal');
    let html5QrcodeScanner;

    scannerModal.addEventListener('shown.bs.modal', () => {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
        html5QrcodeScanner.render(onScanSuccess);
    });

    scannerModal.addEventListener('hidden.bs.modal', () => {
        if (html5QrcodeScanner) html5QrcodeScanner.clear().catch(e => console.error(e));
        document.getElementById('scannerResult').textContent = '';
        document.getElementById('apiResult').textContent = '';
    });

    async function onScanSuccess(decodedText) {
        document.getElementById('scannerResult').textContent = `Scanned ISBN: ${decodedText}`;
        if (html5QrcodeScanner) html5QrcodeScanner.clear();

        // Check if exists locally
        if (allBooks.find(b => b.isbn === decodedText)) {
            document.getElementById('apiResult').textContent = 'Book already exists in inventory. Loading for edit...';
            const editBtn = document.querySelector(`.edit-btn[data-isbn="${decodedText}"]`);
            if (editBtn) editBtn.click();
            setTimeout(() => bootstrap.Modal.getInstance(scannerModal).hide(), 1500);
            return;
        }

        document.getElementById('apiResult').textContent = 'Fetching metadata from Google Books...';
        
        try {
            const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${decodedText}`);
            const data = await res.json();
            
            if (data.items && data.items.length > 0) {
                const info = data.items[0].volumeInfo;
                document.getElementById('b-isbn').value = decodedText;
                document.getElementById('b-name').value = info.title || '';
                document.getElementById('b-author').value = info.authors ? info.authors.join(', ') : '';
                document.getElementById('b-publisher').value = info.publisher || '';
                document.getElementById('b-year').value = info.publishedDate ? info.publishedDate.substring(0,4) : '';
                
                document.getElementById('apiResult').textContent = 'Metadata loaded successfully!';
                document.getElementById('apiResult').className = 'mt-2 text-success small';
            } else {
                document.getElementById('apiResult').textContent = 'Book not found in Google Books. Please enter manually.';
                document.getElementById('apiResult').className = 'mt-2 text-warning small';
                document.getElementById('b-isbn').value = decodedText;
            }
        } catch (err) {
            document.getElementById('apiResult').textContent = 'Error fetching from Google Books.';
        }

        setTimeout(() => bootstrap.Modal.getInstance(scannerModal).hide(), 2000);
    }

    // --- User Management ---
    async function fetchUsers() {
        try {
            const pRes = await fetch('/api/users/pending', { headers: { 'Authorization': `Bearer ${token}` } });
            if (pRes.ok) {
                const pending = await pRes.json();
                renderPendingUsers(pending);
            }
            const aRes = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (aRes.ok) {
                const active = await aRes.json();
                renderActiveUsers(active.filter(u => u.status === 'active'));
            }
        } catch (error) { console.error(error); }
    }

    function renderPendingUsers(users) {
        const tbody = document.getElementById('pendingUsersTable');
        tbody.innerHTML = '';
        if(users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No pending approvals.</td></tr>';
            return;
        }
        users.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${u.id}</td>
                <td>${u.role}</td>
                <td><span class="badge bg-warning text-dark">Pending</span></td>
                <td><button class="btn btn-sm btn-success approve-btn" data-id="${u.id}">Approve</button></td>
            `;
            tbody.appendChild(row);
        });

        document.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                const res = await fetch('/api/users/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ id })
                });
                if(res.ok) fetchUsers();
            });
        });
    }

    function renderActiveUsers(users) {
        const tbody = document.getElementById('activeUsersTable');
        tbody.innerHTML = '';
        users.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${u.id}</td><td>${u.role}</td>`;
            tbody.appendChild(row);
        });
    }

    // --- Loan Management ---
    async function fetchLoans() {
        try {
            const res = await fetch('/api/loans', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const loans = await res.json();
                const active = loans.filter(l => l.status === 'active' && !l.isExpired);
                const expired = loans.filter(l => l.status === 'active' && l.isExpired);
                
                renderLoans(active, document.getElementById('activeLoansTable'));
                renderLoans(expired, document.getElementById('expiredLoansTable'));
            }
        } catch (error) { console.error(error); }
    }

    function renderLoans(loans, tbody) {
        tbody.innerHTML = '';
        if(loans.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No records found.</td></tr>`;
            return;
        }
        loans.forEach(l => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="small">${l.loanId}</td>
                <td>${l.bookName} (${l.bookIsbn})</td>
                <td>${l.studentId}</td>
                <td>${new Date(l.dueDate).toLocaleDateString()}</td>
                <td><button class="btn btn-sm btn-primary return-btn" data-id="${l.loanId}">Confirm Return</button></td>
            `;
            tbody.appendChild(row);
        });

        tbody.querySelectorAll('.return-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const loanId = e.target.getAttribute('data-id');
                const res = await fetch('/api/loans/return', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ loanId })
                });
                if (res.ok) {
                    alert('Book returned successfully');
                    fetchLoans();
                    fetchBooks();
                    fetchStats();
                }
            });
        });
    }

    // --- Stats ---
    async function fetchStats() {
        try {
            const res = await fetch('/api/stats', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const stats = await res.json();
                document.getElementById('statUniqueBooks').textContent = stats.totalUniqueBooks;
                document.getElementById('statTotalStock').textContent = stats.totalStock;
                document.getElementById('statTotalLended').textContent = stats.totalLended;
            }
        } catch (error) { console.error(error); }
    }

    fetchBooks();
    fetchUsers();
    fetchLoans();
    fetchStats();

    // Reload tab data when switched
    document.querySelectorAll('button[data-bs-toggle="pill"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', (e) => {
            if (e.target.dataset.bsTarget === '#book-mgmt') fetchBooks();
            if (e.target.dataset.bsTarget === '#user-mgmt') fetchUsers();
            if (e.target.dataset.bsTarget === '#loan-mgmt') fetchLoans();
            if (e.target.dataset.bsTarget === '#stats') fetchStats();
        });
    });
});
