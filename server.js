const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 8080;

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer config for photo uploads
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Database setup
const db = new Database(path.join(__dirname, 'family.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT,
        caption TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS family_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        birth TEXT DEFAULT '',
        death TEXT DEFAULT '',
        generation INTEGER DEFAULT 0,
        parent_id INTEGER,
        spouse TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS histories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        era TEXT DEFAULT '',
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
`);

// ========== PHOTOS API ==========

app.get('/api/photos', (req, res) => {
    const photos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all();
    res.json(photos);
});

app.post('/api/photos', upload.array('photos', 20), (req, res) => {
    const insert = db.prepare('INSERT INTO photos (filename, original_name) VALUES (?, ?)');
    const photos = [];
    for (const file of req.files) {
        const info = insert.run(file.filename, file.originalname);
        photos.push({ id: info.lastInsertRowid, filename: file.filename, original_name: file.originalname, caption: '' });
    }
    res.json(photos);
});

app.patch('/api/photos/:id', (req, res) => {
    const { caption } = req.body;
    db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(caption, req.params.id);
    res.json({ ok: true });
});

app.delete('/api/photos/:id', (req, res) => {
    const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
    if (photo) {
        const filepath = path.join(__dirname, 'uploads', photo.filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
});

// ========== NEWS API ==========

app.get('/api/news', (req, res) => {
    const news = db.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
    res.json(news);
});

app.post('/api/news', (req, res) => {
    const { title, date, content } = req.body;
    const info = db.prepare('INSERT INTO news (title, date, content) VALUES (?, ?, ?)').run(title, date, content);
    res.json({ id: info.lastInsertRowid, title, date, content });
});

app.delete('/api/news/:id', (req, res) => {
    db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ========== FAMILY MEMBERS API ==========

app.get('/api/members', (req, res) => {
    const members = db.prepare('SELECT * FROM family_members ORDER BY generation, name').all();
    res.json(members);
});

app.post('/api/members', (req, res) => {
    const { name, birth, death, generation, parent_id, spouse } = req.body;
    const info = db.prepare(
        'INSERT INTO family_members (name, birth, death, generation, parent_id, spouse) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, birth || '', death || '', generation || 0, parent_id || null, spouse || '');
    res.json({ id: info.lastInsertRowid, name, birth, death, generation, parent_id, spouse });
});

app.put('/api/members/:id', (req, res) => {
    const { name, birth, death, generation, parent_id, spouse } = req.body;
    db.prepare(
        'UPDATE family_members SET name=?, birth=?, death=?, generation=?, parent_id=?, spouse=? WHERE id=?'
    ).run(name, birth || '', death || '', generation || 0, parent_id || null, spouse || '', req.params.id);
    res.json({ ok: true });
});

app.delete('/api/members/:id', (req, res) => {
    db.prepare('DELETE FROM family_members WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ========== HISTORIES API ==========

app.get('/api/histories', (req, res) => {
    const histories = db.prepare('SELECT * FROM histories ORDER BY created_at DESC').all();
    res.json(histories);
});

app.post('/api/histories', (req, res) => {
    const { title, era, content } = req.body;
    const info = db.prepare('INSERT INTO histories (title, era, content) VALUES (?, ?, ?)').run(title, era || '', content);
    res.json({ id: info.lastInsertRowid, title, era, content });
});

app.put('/api/histories/:id', (req, res) => {
    const { title, era, content } = req.body;
    db.prepare('UPDATE histories SET title=?, era=?, content=? WHERE id=?').run(title, era || '', content, req.params.id);
    res.json({ ok: true });
});

app.delete('/api/histories/:id', (req, res) => {
    db.prepare('DELETE FROM histories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ========== AUTH HELPERS ==========

function getUser(token) {
    if (!token) return null;
    const row = db.prepare(
        'SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?'
    ).get(token);
    return row || null;
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = getUser(token);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    req.user = user;
    next();
}

// ========== AUTH API ==========

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 2 || username.length > 30) return res.status(400).json({ error: 'Username must be 2-30 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').run(info.lastInsertRowid, token);
    res.json({ token, user: { id: info.lastInsertRowid, username } });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').run(user.id, token);
    res.json({ token, user: { id: user.id, username: user.username } });
});

app.post('/api/auth/logout', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = getUser(token);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user });
});

// ========== POSTS API ==========

app.get('/api/posts', (req, res) => {
    const posts = db.prepare(
        'SELECT posts.*, users.username FROM posts JOIN users ON users.id = posts.user_id ORDER BY posts.created_at DESC'
    ).all();
    res.json(posts);
});

app.post('/api/posts', requireAuth, (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
    const info = db.prepare('INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)').run(req.user.id, title, body);
    res.json({ id: info.lastInsertRowid, user_id: req.user.id, username: req.user.username, title, body, created_at: new Date().toISOString() });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not your post' });
    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`Family History server running at http://localhost:${PORT}`);
});
