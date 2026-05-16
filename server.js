const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Mutex } = require('async-mutex');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey_for_library';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mutexes for safe JSON operations
// Since Node.js handles multiple requests asynchronously, reading/writing to the same JSON file simultaneously
// can cause data corruption. Mutexes (Mutual Exclusion locks) act like a traffic light, ensuring that
// only one request can read/modify/write a specific JSON file at a time.
const usersMutex = new Mutex();
const booksMutex = new Mutex();
const loansMutex = new Mutex();

const dataPath = (filename) => path.join(__dirname, 'data', filename);

// Helper functions
async function readJson(filename, mutex) {
    const release = await mutex.acquire();
    try {
        const rawData = await fs.readFile(dataPath(filename), 'utf8');
        return JSON.parse(rawData || '[]');
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    } finally {
        release();
    }
}

async function writeJson(filename, data, mutex) {
    const release = await mutex.acquire();
    try {
        await fs.writeFile(dataPath(filename), JSON.stringify(data, null, 2), 'utf8');
    } finally {
        release();
    }
}

// Authentication Middleware
// This function protects sensitive routes. It intercepts the request, checks if the user sent a valid JWT
// (which acts as a digital signature proving they are logged in), and decodes it to find out who they are.
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user; // Attach decoded user info (id, role) to the request
        next(); // Proceed to the actual route handler
    });
}

// Authorization Middleware
// This checks if the logged-in user has the correct role (e.g., stopping students from deleting books)
function requireRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
}

// --- Auth Routes ---
app.post('/api/auth/login', async (req, res) => {
    const { id, password } = req.body;
    const users = await readJson('users.json', usersMutex);
    const user = users.find(u => u.id === id);

    if (!user) return res.status(400).json({ error: 'User not found' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Account pending approval' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, role: user.role, id: user.id });
});

app.post('/api/auth/signup', async (req, res) => {
    const { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ error: 'ID and password required' });

    const users = await readJson('users.json', usersMutex);
    if (users.find(u => u.id === id)) {
        return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id, role: 'student', password: hashedPassword, status: 'pending' };
    
    users.push(newUser);
    await writeJson('users.json', users, usersMutex);
    res.status(201).json({ message: 'Signup successful. Pending approval.' });
});

// --- Books Routes ---
app.get('/api/books', authenticateToken, async (req, res) => {
    const books = await readJson('books.json', booksMutex);
    res.json(books);
});

app.post('/api/books', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const { isbn, name, author, publisher, publishYear, stock, location } = req.body;
    const books = await readJson('books.json', booksMutex);
    
    if (books.find(b => b.isbn === isbn)) {
        return res.status(400).json({ error: 'Book with this ISBN already exists' });
    }

    const newBook = { isbn, name, author, publisher, publishYear, stock: parseInt(stock), location };
    books.push(newBook);
    await writeJson('books.json', books, booksMutex);
    res.status(201).json(newBook);
});

app.put('/api/books/:isbn', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const books = await readJson('books.json', booksMutex);
    const idx = books.findIndex(b => b.isbn === req.params.isbn);
    if (idx === -1) return res.status(404).json({ error: 'Book not found' });

    books[idx] = { ...books[idx], ...req.body };
    await writeJson('books.json', books, booksMutex);
    res.json(books[idx]);
});

app.delete('/api/books/:isbn', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    let books = await readJson('books.json', booksMutex);
    books = books.filter(b => b.isbn !== req.params.isbn);
    await writeJson('books.json', books, booksMutex);
    res.json({ message: 'Book deleted' });
});

// --- Users Routes ---
app.get('/api/users/pending', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const users = await readJson('users.json', usersMutex);
    const pending = users.filter(u => u.status === 'pending').map(u => ({ id: u.id, role: u.role, status: u.status }));
    res.json(pending);
});

app.post('/api/users/approve', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const { id } = req.body;
    const users = await readJson('users.json', usersMutex);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    
    users[idx].status = 'active';
    await writeJson('users.json', users, usersMutex);
    res.json({ message: 'User approved' });
});

app.get('/api/users', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const users = await readJson('users.json', usersMutex);
    // Personnel can only see students. Admin sees all.
    let visibleUsers = users.map(u => ({ id: u.id, role: u.role, status: u.status }));
    if (req.user.role === 'personnel') {
        visibleUsers = visibleUsers.filter(u => u.role === 'student');
    }
    res.json(visibleUsers);
});

app.post('/api/users/promote', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { id, newRole } = req.body;
    const users = await readJson('users.json', usersMutex);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    if (!['student', 'personnel', 'admin'].includes(newRole)) return res.status(400).json({ error: 'Invalid role' });
    
    users[idx].role = newRole;
    await writeJson('users.json', users, usersMutex);
    res.json({ message: 'User promoted' });
});

app.post('/api/users/create', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { id, password, role } = req.body;
    const users = await readJson('users.json', usersMutex);
    if (users.find(u => u.id === id)) return res.status(400).json({ error: 'User already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id, role, password: hashedPassword, status: 'active' });
    await writeJson('users.json', users, usersMutex);
    res.status(201).json({ message: 'User created' });
});

app.put('/api/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    const { password, role, status } = req.body;
    const users = await readJson('users.json', usersMutex);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    
    if (role) users[idx].role = role;
    if (status) users[idx].status = status;
    if (password && password.trim() !== '') {
        users[idx].password = await bcrypt.hash(password, 10);
    }
    
    await writeJson('users.json', users, usersMutex);
    res.json({ message: 'User updated successfully' });
});

app.delete('/api/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    let users = await readJson('users.json', usersMutex);
    users = users.filter(u => u.id !== req.params.id);
    await writeJson('users.json', users, usersMutex);
    res.json({ message: 'User deleted successfully' });
});


// --- Loans Routes ---
app.post('/api/loans/checkout', authenticateToken, async (req, res) => {
    const { booksToCheckout, durationDays } = req.body; 
    const studentId = req.user.id;
    
    // Acquire both locks to ensure consistency. 
    // Always acquire booksMutex FIRST, then loansMutex SECOND to prevent deadlocks.
    // We must lock BOTH files because we are taking stock away from books.json AND creating a record in loans.json
    // at the exact same time. If someone else tries to checkout the same book millisecond later, they will wait in line.
    const bRelease = await booksMutex.acquire();
    const lRelease = await loansMutex.acquire();
    
    try {
        const books = await fs.readFile(dataPath('books.json'), 'utf8').then(d => JSON.parse(d || '[]')).catch(() => []);
        const loans = await fs.readFile(dataPath('loans.json'), 'utf8').then(d => JSON.parse(d || '[]')).catch(() => []);
        
        let checkedOutList = [];
        
        for (let item of booksToCheckout) {
            const bIdx = books.findIndex(b => b.isbn === item.isbn);
            if (bIdx > -1 && books[bIdx].stock > 0) {
                books[bIdx].stock -= 1;
                
                const checkoutDate = new Date();
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + parseInt(durationDays));
                
                const loan = {
                    loanId: Date.now() + Math.random().toString(36).substr(2, 9),
                    bookIsbn: item.isbn,
                    bookName: books[bIdx].name,
                    studentId,
                    checkoutDate: checkoutDate.toISOString(),
                    dueDate: dueDate.toISOString(),
                    status: 'active'
                };
                loans.push(loan);
                checkedOutList.push(loan);
            }
        }
        
        if (checkedOutList.length === 0) {
            return res.status(400).json({ error: 'None of the requested books could be checked out (out of stock or not found)' });
        }
        
        await fs.writeFile(dataPath('books.json'), JSON.stringify(books, null, 2), 'utf8');
        await fs.writeFile(dataPath('loans.json'), JSON.stringify(loans, null, 2), 'utf8');
        
        res.status(201).json({ message: 'Checkout successful', loans: checkedOutList });
    } finally {
        lRelease();
        bRelease();
    }
});

app.get('/api/loans/my', authenticateToken, async (req, res) => {
    const loans = await readJson('loans.json', loansMutex);
    const myLoans = loans.filter(l => l.studentId === req.user.id && l.status === 'active');
    res.json(myLoans);
});

app.get('/api/loans', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const loans = await readJson('loans.json', loansMutex);
    // Add expired flag
    const now = new Date();
    const updatedLoans = loans.map(l => {
        if (l.status === 'active' && new Date(l.dueDate) < now) {
            return { ...l, isExpired: true };
        }
        return { ...l, isExpired: false };
    });
    res.json(updatedLoans);
});

app.post('/api/loans/return', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const { loanId } = req.body;
    
    const bRelease = await booksMutex.acquire();
    const lRelease = await loansMutex.acquire();
    try {
        const books = await fs.readFile(dataPath('books.json'), 'utf8').then(d => JSON.parse(d || '[]')).catch(() => []);
        const loans = await fs.readFile(dataPath('loans.json'), 'utf8').then(d => JSON.parse(d || '[]')).catch(() => []);
        
        const lIdx = loans.findIndex(l => l.loanId === loanId);
        if (lIdx === -1) return res.status(404).json({ error: 'Loan not found' });
        if (loans[lIdx].status !== 'active') return res.status(400).json({ error: 'Loan is already returned' });
        
        loans[lIdx].status = 'returned';
        
        const bIdx = books.findIndex(b => b.isbn === loans[lIdx].bookIsbn);
        if (bIdx > -1) {
            books[bIdx].stock += 1;
        }
        
        await fs.writeFile(dataPath('books.json'), JSON.stringify(books, null, 2), 'utf8');
        await fs.writeFile(dataPath('loans.json'), JSON.stringify(loans, null, 2), 'utf8');
        
        res.json({ message: 'Book returned successfully' });
    } finally {
        lRelease();
        bRelease();
    }
});

// --- Stats Routes ---
app.get('/api/stats', authenticateToken, requireRole(['personnel', 'admin']), async (req, res) => {
    const books = await readJson('books.json', booksMutex);
    const loans = await readJson('loans.json', loansMutex);
    const users = await readJson('users.json', usersMutex);
    
    const totalUniqueBooks = books.length;
    const totalStock = books.reduce((sum, b) => sum + b.stock, 0);
    const activeLoans = loans.filter(l => l.status === 'active');
    const totalLended = activeLoans.length;
    const totalUsers = users.length;
    
    res.json({
        totalUniqueBooks,
        totalStock,
        totalLended,
        totalUsers
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
