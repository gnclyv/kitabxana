const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'kitabxana-gizli-acar-' + crypto.randomBytes(8).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 gün
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Multer (PDF yükləmə) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, unique + '.pdf');
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Yalnız PDF fayllarına icazə verilir'));
    }
  }
});

// ---------- Köməkçi funksiyalar ----------
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Bu əməliyyat üçün daxil olmalısınız' });
  next();
}

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email, avatarColor: row.avatar_color };
}

const AVATAR_COLORS = ['#C9A227', '#A83232', '#3C6E71', '#7A5C9E', '#B5651D', '#2F6F4E'];

// ---------- AUTH API ----------
app.post('/api/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Bütün xanaları doldurun' });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'İstifadəçi adı ən azı 3 simvol olmalıdır' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Şifrə ən azı 6 simvol olmalıdır' });
    }
    const uname = username.trim();
    const email2 = email.trim().toLowerCase();
    if (db.userExists(uname, email2)) {
      return res.status(409).json({ error: 'Bu istifadəçi adı və ya email artıq istifadə olunub' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const user = db.createUser({ username: uname, email: email2, password_hash: hash, avatar_color: color });
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası, yenidən cəhd edin' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Bütün xanaları doldurun' });
    const user = db.findUserByUsernameOrEmail(identifier.trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'İstifadəçi adı/email və ya şifrə yanlışdır' });
    }
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası, yenidən cəhd edin' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.findUserById(req.session.userId);
  if (!user) return res.json({ user: null });
  res.json({ user: publicUser(user) });
});

// ---------- BOOKS API ----------
app.get('/api/books', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  const category = (req.query.category || '').trim();
  const rows = db.listBooks({ q, category });
  res.json({
    books: rows.map(r => ({
      id: r.id, title: r.title, author: r.author, description: r.description,
      category: r.category, filesize: r.filesize, coverHue: r.cover_hue,
      uploader: r.uploader, uploadedBy: r.uploaded_by, downloads: r.downloads,
      createdAt: r.created_at
    }))
  });
});

app.post('/api/books', requireAuth, upload.single('pdf'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF faylı seçilməyib' });
    const { title, author, description, category } = req.body;
    if (!title || !author) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Kitabın adı və müəllif tələb olunur' });
    }
    const hue = Math.floor(Math.random() * 360);
    const book = db.createBook({
      title: title.trim(),
      author: author.trim(),
      description: (description || '').trim(),
      category: category || 'Digər',
      filename: req.file.filename,
      original_name: req.file.originalname,
      filesize: req.file.size,
      cover_hue: hue,
      uploaded_by: req.session.userId
    });
    res.json({ id: book.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Yükləmə zamanı xəta baş verdi' });
  }
});

app.get('/api/books/:id/download', requireAuth, (req, res) => {
  const book = db.findBookById(req.params.id);
  if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
  const filePath = path.join(UPLOAD_DIR, book.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fayl serverdə tapılmadı' });
  db.incrementDownloads(book.id);
  res.download(filePath, book.original_name.endsWith('.pdf') ? book.original_name : book.original_name + '.pdf');
});

app.get('/api/books/:id/view', requireAuth, (req, res) => {
  const book = db.findBookById(req.params.id);
  if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
  const filePath = path.join(UPLOAD_DIR, book.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fayl serverdə tapılmadı' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + book.original_name.replace(/"/g, '') + '"');
  fs.createReadStream(filePath).pipe(res);
});

app.delete('/api/books/:id', requireAuth, (req, res) => {
  const book = db.findBookById(req.params.id);
  if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
  if (book.uploaded_by !== req.session.userId) {
    return res.status(403).json({ error: 'Yalnız öz yüklədiyiniz kitabı silə bilərsiniz' });
  }
  const filePath = path.join(UPLOAD_DIR, book.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.deleteBook(book.id);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  // Bu endpoint login tələb etmir ki, giriş səhifəsində ümumi statistika göstərilə bilsin
  res.json(db.getStats());
});

// ---------- Səhifələr ----------
app.get('/kitabxana', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'library.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n📚 Kitabxana sayti isə düşdü: http://localhost:${PORT}\n`);
});
