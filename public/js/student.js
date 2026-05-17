document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'student') {
        window.location.href = 'index.html';
        return;
    }

    // --- Cart Logic ---
    const cartItemsContainer = document.getElementById('cartItems');
    const checkoutSection = document.getElementById('checkoutSection');
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');

    function renderCart() {
        cartItemsContainer.innerHTML = '';
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-muted">Your cart is empty.</p>';
            checkoutSection.classList.add('d-none');
            return;
        }

        checkoutSection.classList.remove('d-none');
        cart.forEach((book, index) => {
            const item = document.createElement('div');
            item.className = 'd-flex justify-content-between align-items-center mb-2 p-2 bg-dark rounded border border-secondary';
            item.innerHTML = `
                <div>
                    <strong>${book.name}</strong><br>
                    <small class="text-muted">ISBN: ${book.isbn}</small>
                </div>
                <button class="btn btn-sm btn-outline-danger remove-cart-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
            `;
            cartItemsContainer.appendChild(item);
        });

        document.querySelectorAll('.remove-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.currentTarget.getAttribute('data-index');
                cart.splice(idx, 1);
                localStorage.setItem('cart', JSON.stringify(cart));
                renderCart();
            });
        });
    }

    document.getElementById('checkoutBtn').addEventListener('click', async () => {
        if (cart.length === 0) return;
        
        const durationDays = document.getElementById('loanDuration').value;
        const booksToCheckout = cart.map(b => ({ isbn: b.isbn }));

        try {
            const res = await fetch('/api/loans/checkout', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ booksToCheckout, durationDays })
            });

            const data = await res.json();
            if (res.ok) {
                alert('Checkout successful!');
                localStorage.removeItem('cart');
                cart = [];
                renderCart();
                fetchMyLoans();
            } else {
                alert(data.error || 'Checkout failed');
            }
        } catch (error) {
            alert('Network error during checkout');
        }
    });

    // --- My Books Logic ---
    const myLoansTable = document.getElementById('myLoansTable');
    let activeLoans = [];

    async function fetchMyLoans() {
        try {
            const res = await fetch('/api/loans/my', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                activeLoans = await res.json();
                renderMyLoans();
            }
        } catch (error) {
            console.error('Failed to fetch loans', error);
        }
    }

    function renderMyLoans() {
        myLoansTable.innerHTML = '';
        if (activeLoans.length === 0) {
            myLoansTable.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No active loans.</td></tr>';
            return;
        }

        activeLoans.forEach(loan => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${loan.bookName}</strong><br>
                    <small class="text-muted">ISBN: ${loan.bookIsbn}</small>
                </td>
                <td>${new Date(loan.checkoutDate).toLocaleDateString()}</td>
                <td>${new Date(loan.dueDate).toLocaleDateString()}</td>
                <td class="countdown-cell" data-due="${loan.dueDate}">Calculating...</td>
            `;
            myLoansTable.appendChild(row);
        });

        updateCountdowns();
    }

    function updateCountdowns() {
        const cells = document.querySelectorAll('.countdown-cell');
        const now = new Date();

        cells.forEach(cell => {
            const due = new Date(cell.getAttribute('data-due'));
            const diffMs = due - now;
            
            if (diffMs <= 0) {
                cell.innerHTML = '<span class="text-danger fw-bold">Expired</span>';
            } else {
                const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                
                let text = '';
                if (days > 0) text += `${days}d `;
                text += `${hours}h left`;
                
                cell.textContent = text;
                if (days < 2) cell.classList.add('text-warning');
                else cell.classList.add('text-success');
            }
        });
    }

    // Update countdowns every minute
    setInterval(updateCountdowns, 60000);

    renderCart();
    fetchMyLoans();
});
