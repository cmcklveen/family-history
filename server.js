const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

// Middleware
app.use(express.json({ limit: '50mb' }));
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

// Start server
app.listen(PORT, () => {
    console.log(`Family History server running at http://localhost:${PORT}`);
});
