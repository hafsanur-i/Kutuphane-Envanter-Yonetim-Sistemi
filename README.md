# Kütüphane Envanter Yönetim Sistemi (Library Management System)

A custom-built, monolithic Node.js web application designed to act as a fully functional Library Portal for Students, Personnel, and Admins.

## Project Summary

This project avoids heavy relational databases (like PostgreSQL or MySQL) in favor of a **pure JSON file database**. This makes the data incredibly portable, easy to manually read, and fast to back up. 

### Core Technologies
- **Backend**: Node.js & Express.js
- **Frontend**: Vanilla HTML/JS with a custom Bootstrap 5 Glassmorphism UI
- **Database**: Local JSON Files (`books.json`, `users.json`, `loans.json`)
- **Authentication**: JWT (JSON Web Tokens) with Bcrypt password hashing
- **Deployment**: PM2 for process management and Nginx as a reverse proxy

### How the Backend Works

Since Node.js is asynchronous and handles multiple user requests concurrently, reading and writing to a standard JSON file could easily corrupt the file if two users click a button at the exact same millisecond. 

To solve this, the backend uses **Mutexes** (Mutual Exclusion locks) via the `async-mutex` package. 
When a user wants to check out a book:
1. The backend puts a "lock" on both `books.json` and `loans.json`.
2. It subtracts 1 from the book's physical stock.
3. It creates a new loan record with a future due date.
4. It writes both files back to the disk.
5. It releases the lock, allowing the next user's request to process.

### User Roles
- **Students**: Can browse books, scan physical ISBN barcodes via their webcam, add books to a cart, and check them out. They can view their active and expired loans.
- **Personnel**: Can manage the physical inventory (add/edit books), scan ISBNs to auto-fetch real covers from the Open Library API, approve pending student registrations, and mark returned loans.
- **Admin**: Has full access. Can view global statistics and edit or delete users entirely, including promoting students to personnel.

