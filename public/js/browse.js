document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Setup Navbar based on role
    const navLinks = document.getElementById('navLinks');
    let navHtml = '';
    
    if (role === 'student') {
        navHtml += `
            <li class="nav-item"><a class="nav-link" href="student.html"><i class="bi bi-cart"></i> Cart <span id="cartCount" class="badge bg-danger rounded-pill">0</span></a></li>
            <li class="nav-item"><a class="nav-link" href="student.html#mybooks"><i class="bi bi-journal-bookmark"></i> My Books</a></li>
        `;
    }
    if (role === 'personnel' || role === 'admin') {
        navHtml += `<li class="nav-item"><a class="nav-link" href="personnel.html"><i class="bi bi-person-badge"></i> Personnel Page</a></li>`;
    }
    if (role === 'admin') {
        navHtml += `<li class="nav-item"><a class="nav-link" href="admin.html"><i class="bi bi-shield-lock"></i> Admin Page</a></li>`;
    }
    
    navLinks.innerHTML = navHtml;

    updateCartCount();

    // Books Data
    let allBooks = [];
    const booksGrid = document.getElementById('booksGrid');

    async function fetchBooks() {
        try {
            const res = await fetch('/api/books', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401 || res.status === 403) {
                logout();
                return;
            }
            allBooks = await res.json();
            renderBooks(allBooks);
        } catch (error) {
            console.error('Failed to fetch books', error);
        }
    }

    function renderBooks(booksToRender) {
        booksGrid.innerHTML = '';
        if (booksToRender.length === 0) {
            booksGrid.innerHTML = '<div class="col-12 text-center text-muted mt-5"><h4>No books found</h4></div>';
            return;
        }

        booksToRender.forEach(book => {
            const inStock = book.stock > 0;
            const stockBadge = inStock ? `<span class="badge bg-success">In Stock (${book.stock})</span>` : `<span class="badge bg-danger">Out of Stock</span>`;
            
            let actionButton = '';
            if (role === 'student' && inStock) {
                actionButton = `<button class="btn btn-sm btn-primary-custom w-100 mt-3 add-to-cart-btn" data-isbn="${book.isbn}">Add to Cart</button>`;
            } else if (role === 'student' && !inStock) {
                actionButton = `<button class="btn btn-sm btn-secondary w-100 mt-3" disabled>Out of Stock</button>`;
            }

            const card = document.createElement('div');
            card.className = 'col-sm-6 col-md-4 col-lg-3 mb-4';
            card.innerHTML = `
                <div class="glass-card h-100 d-flex flex-column book-card p-3" id="book-${book.isbn}">
                    <div class="mb-3 text-center" style="height: 250px; border-radius: 1rem; overflow: hidden; background: #1e293b; display: flex; align-items: center; justify-content: center;">
                        <img src="https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false" 
                             onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'400\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23334155\\'/><text x=\\'50%\\' y=\\'50%\\' font-family=\\'Arial\\' font-size=\\'20\\' fill=\\'%2394a3b8\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>No Cover</text></svg>';" 
                             alt="${book.name} Cover" 
                             style="max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                    </div>
                    <div class="flex-grow-1">
                        <h5 class="fw-bold mb-1">${book.name}</h5>
                        <p class="text-muted small mb-2">${book.author}</p>
                        <div class="mb-2">${stockBadge}</div>
                        <div class="small">
                            <strong>ISBN:</strong> ${book.isbn}<br>
                            <strong>Year:</strong> ${book.publishYear}<br>
                            <strong>Loc:</strong> ${book.location}
                        </div>
                    </div>
                    ${actionButton}
                </div>
            `;
            booksGrid.appendChild(card);
        });

        // Add event listeners for Add to Cart
        document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const isbn = e.target.getAttribute('data-isbn');
                const book = allBooks.find(b => b.isbn === isbn);
                addToCart(book);
            });
        });
    }

    function addToCart(book) {
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        if (!cart.find(item => item.isbn === book.isbn)) {
            cart.push(book);
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartCount();
            alert(`"${book.name}" added to cart!`);
        } else {
            alert(`"${book.name}" is already in your cart.`);
        }
    }

    function updateCartCount() {
        const cartCountEl = document.getElementById('cartCount');
        if (cartCountEl) {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            cartCountEl.textContent = cart.length;
        }
    }

    // Search and Filter
    document.getElementById('searchBtn').addEventListener('click', applyFilters);
    document.getElementById('searchInput').addEventListener('keyup', (e) => {
        if(e.key === 'Enter') applyFilters();
    });

    function applyFilters() {
        const query = document.getElementById('searchInput').value.toLowerCase();
        const filterBy = document.getElementById('filterBy').value;
        const availability = document.getElementById('availabilityFilter').value;

        const filtered = allBooks.filter(book => {
            let matchesSearch = false;
            if (filterBy === 'all') {
                matchesSearch = book.name.toLowerCase().includes(query) || 
                                book.author.toLowerCase().includes(query) || 
                                book.isbn.toLowerCase().includes(query) ||
                                book.publisher.toLowerCase().includes(query);
            } else {
                matchesSearch = book[filterBy] && book[filterBy].toString().toLowerCase().includes(query);
            }

            let matchesAvail = true;
            if (availability === 'available') {
                matchesAvail = book.stock > 0;
            }

            return matchesSearch && matchesAvail;
        });

        renderBooks(filtered);
    }

    // Scanner logic
    const scannerModal = document.getElementById('scannerModal');
    let html5QrcodeScanner;

    scannerModal.addEventListener('shown.bs.modal', () => {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: {width: 250, height: 150} },
            /* verbose= */ false);
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    });

    scannerModal.addEventListener('hidden.bs.modal', () => {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().catch(error => {
                console.error("Failed to clear scanner", error);
            });
        }
        document.getElementById('scannerResult').textContent = '';
    });

    function onScanSuccess(decodedText, decodedResult) {
        document.getElementById('scannerResult').textContent = `Scanned: ${decodedText}`;
        // Automatically search for this ISBN
        document.getElementById('searchInput').value = decodedText;
        document.getElementById('filterBy').value = 'all';
        applyFilters();
        
        // Highlight the book card if found
        setTimeout(() => {
            const bookCard = document.getElementById(`book-${decodedText}`);
            if (bookCard) {
                bookCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                bookCard.style.boxShadow = '0 0 20px #4f46e5';
                setTimeout(() => bookCard.style.boxShadow = '', 2000);
            }
            
            // Close modal
            const bsModal = bootstrap.Modal.getInstance(scannerModal);
            bsModal.hide();
        }, 500);
    }

    function onScanFailure(error) {
        // handle scan failure, usually better to ignore and keep scanning
    }

    fetchBooks();
});
