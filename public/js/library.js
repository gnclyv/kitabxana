require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Storage müştərisi
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Sessiya konfiqurasiyası (Vercel və Localhost üçün uyğunlaşdırılmış)
const sessionStore = new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: 'session',
  createTableIfMissing: true, // 'session' cədvəli yoxdursa avtomatik yaradılsın
  ssl: { rejectUnauthorized: false } // Neon Postgres SSL tələb edir
});

// Sessiya bazasında xəta olarsa artıq sükutla uduldma yerinə loglanır
sessionStore.on('error', (err) => {
  console.error('SESSION STORE XƏTASI:', err);
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'kitabxana-gizli-acar-' + crypto.randomBytes(16).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Multer (PDF + üz qabığı şəkli üçün xətasız konfiqurasiya)
// DİQQƏT: frontend həm 'pdf', həm də 'cover' adlı fayl sahələri göndərir.
// upload.single('pdf') yalnız 'pdf' sahəsini qəbul edir və 'cover' gələn kimi
// Multer xəta atırdı (bu da JSON əvəzinə HTML xəta səhifəsi qaytarılmasına səbəb olurdu).
// upload.fields(...) hər iki sahəni ayrıca qəbul edir.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf') {
      if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        return cb(null, true);
      }
      return cb(new Error('Yalnız PDF fayllarına icazə verilir'));
    }
    if (file.fieldname === 'cover') {
      if (file.mimetype.startsWith('image/')) {
        return cb(null, true);
      }
      return cb(new Error('Üz qabığı yalnız şəkil formatında ola bilər'));
    }
    cb(new Error('Naməlum fayl sahəsi: ' + file.fieldname));
  }
});

const uploadBookFiles = upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]);
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
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Bütün xanaları doldurun' });

    const uname = username.trim();
    const email2 = email.trim().toLowerCase();
    const exists = await db.userExists(uname, email2);
    if (exists) return res.status(409).json({ error: 'İstifadəçi artıq mövcuddur' });

    const hash = await bcrypt.hash(password, 10);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const user = await db.createUser({ username: uname, email: email2, password_hash: hash, avatar_color: color });

    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error('REGISTER ERROR:', e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await db.findUserByUsernameOrEmail(identifier.trim());
    if (user && await bcrypt.compare(password, user.password_hash)) {
      req.session.userId = user.id;
      res.json({ user: publicUser(user) });
    } else {
      res.status(401).json({ error: 'Yanlış giriş məlumatları' });
    }
  } catch (e) {
    console.error('LOGIN ERROR:', e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', async (req, res) => {
  try {
    if (!req.session.userId) return res.json({ user: null });
    const user = await db.findUserById(req.session.userId);
    res.json({ user: user ? publicUser(user) : null });
  } catch (e) {
    console.error('ME ERROR:', e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ---------- BOOKS API ----------
app.get('/api/books', requireAuth, async (req, res) => {
  try {
    const rows = await db.listBooks({ q: (req.query.q || ''), category: (req.query.category || '') });
    res.json({ books: rows.map(r => ({ ...r, id: r.id, title: r.title, author: r.author, description: r.description, category: r.category, filesize: r.filesize, cover_image: r.cover_image, uploaded_by: r.uploaded_by, downloads: r.downloads })) });
  } catch (e) {
    console.error('LIST BOOKS ERROR:', e);
    res.status(500).json({ error: 'Kitablar yüklənmədi' });
  }
});

app.post('/api/books', requireAuth, uploadBookFiles, async (req, res) => {
  try {
    const pdfFile = req.files && req.files.pdf && req.files.pdf[0];
    const coverFile = req.files && req.files.cover && req.files.cover[0];

    if (!pdfFile) return res.status(400).json({ error: 'PDF faylı seçilməyib' });
    if (!req.body.title || !req.body.author) {
      return res.status(400).json({ error: 'Kitabın adı və müəllifi mütləqdir' });
    }

    const uniqueName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.pdf';
    const { error: pdfError } = await supabase.storage
      .from('books')
      .upload(uniqueName, pdfFile.buffer, { contentType: 'application/pdf' });
    if (pdfError) throw pdfError;
    const publicUrl = supabase.storage.from('books').getPublicUrl(uniqueName).data.publicUrl;

    // Üz qabığı şəkli seçilibsə, onu da Supabase-ə yükləyirik
    let coverUrl = null;
    if (coverFile) {
      const coverExt = (coverFile.originalname.split('.').pop() || 'jpg').toLowerCase();
      const coverName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + coverExt;
      const { error: coverError } = await supabase.storage
        .from('books')
        .upload(coverName, coverFile.buffer, { contentType: coverFile.mimetype });
      if (coverError) throw coverError;
      coverUrl = supabase.storage.from('books').getPublicUrl(coverName).data.publicUrl;
    }

    const book = await db.createBook({
      title: req.body.title.trim(),
      author: req.body.author.trim(),
      description: (req.body.description || '').trim(),
      category: req.body.category || 'Digər',
      filename: publicUrl,
      original_name: pdfFile.originalname,
      filesize: pdfFile.size,
      cover_image: coverUrl,
      uploaded_by: req.session.userId
    });
    res.status(201).json({ id: book.id });
  } catch (e) {
    console.error('UPLOAD ERROR:', e);
    res.status(500).json({ error: 'Yükləmə xətası' });
  }
});

app.get('/api/books/:id/download', requireAuth, async (req, res) => {
  try {
    const book = await db.findBookById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
    await db.incrementDownloads(book.id);
    res.redirect(book.filename);
  } catch (e) {
    console.error('DOWNLOAD ERROR:', e);
    res.status(500).json({ error: 'Yükləmə xətası' });
  }
});

app.get('/api/books/:id/view', requireAuth, async (req, res) => {
  try {
    const book = await db.findBookById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
    res.redirect(book.filename);
  } catch (e) {
    console.error('VIEW ERROR:', e);
    res.status(500).json({ error: 'Fayl oxunarkən xəta' });
  }
});

app.delete('/api/books/:id', requireAuth, async (req, res) => {
  try {
    const book = await db.findBookById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
    if (book.uploaded_by !== req.session.userId) {
      return res.status(403).json({ error: 'Yalnız öz kitabınızı silə bilərsiniz' });
    }

    const fileName = book.filename.split('/').pop();
    await supabase.storage.from('books').remove([fileName]);
    await db.deleteBook(book.id);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE ERROR:', e);
    res.status(500).json({ error: 'Silinmə xətası' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (e) {
    console.error('STATS ERROR:', e);
    res.status(500).json({ totalBooks: 0 });
  }
});

// ---------- Səhifə Yönləndirmələri ----------
app.get('/kitabxana', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'library.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Qlobal xəta idarəedicisi ----------
// Multer (fayl ölçüsü, naməlum sahə və s.) və digər tutulmamış xətalar
// bura düşür. Bu olmadan Express default HTML xəta səhifəsi qaytarır,
// bu da frontend-də JSON.parse-i çökdürür.
app.use((err, req, res, next) => {
  console.error('QLOBAL XƏTA:', err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fayl həcmi icazə verilən limitdən böyükdür' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Sorğu emal edilərkən xəta baş verdi' });
  }
  next();
});

// ---------- Server / Vercel export ----------
// Yalnız lokal işə salınanda port dinlə (məs. `node server.js`).
// Vercel bu faylı özü import edib serverless funksiya kimi çağırır,
// ona görə app.listen() Vercel-də ÇAĞIRILMAMALIDIR.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n📚 Kitabxana saytı işə düşdü: http://localhost:${PORT}\n`);
  });
}

module.exports = app;
