const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js'); // Supabase əlavə olundu
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

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'kitabxana-gizli-acar-' + crypto.randomBytes(16).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: true,
    sameSite: 'none' 
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Multer (RAM-da müvəqqəti saxlamaq üçün) ----------
const storage = multer.memoryStorage();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
}); // Limit artıq 50 MB-dır!
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
app.post('/api/register', async (req, res) => {
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

    const exists = await db.userExists(uname, email2);
    if (exists) {
      return res.status(409).json({ error: 'Bu istifadəçi adı və ya email artıq istifadə olunub' });
    }

    const hash = await bcrypt.hash(password, 10);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    
    const user = await db.createUser({ username: uname, email: email2, password_hash: hash, avatar_color: color });
    
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xətası, yenidən cəhd edin' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Bütün xanaları doldurun' });
    
    const user = await db.findUserByUsernameOrEmail(identifier.trim());
    if (!user) {
      return res.status(401).json({ error: 'İstifadəçi adı/email və ya şifrə yanlışdır' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
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

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  try {
    const user = await db.findUserById(req.session.userId);
    if (!user) return res.json({ user: null });
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.json({ user: null });
  }
});

// ---------- BOOKS API ----------
app.get('/api/books', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    
    const rows = await db.listBooks({ q, category });
    
    res.json({
      books: rows.map(r => ({
        id: r.id, title: r.title, author: r.author, description: r.description,
        category: r.category, filesize: r.filesize, coverHue: r.cover_hue,
        uploader: r.uploader, uploadedBy: r.uploaded_by, downloads: r.downloads,
        createdAt: r.created_at
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Kitablar gətirilərkən xəta baş verdi' });
  }
});

// Supabase Storage-ə yükləmə hissəsi
app.post('/api/books', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF faylı seçilməyib' });
    const { title, author, description, category } = req.body;
    if (!title || !author) {
      return res.status(400).json({ error: 'Kitabın adı və müəllif tələb olunur' });
    }

    const uniqueName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.pdf';
    
    // Supabase Storage-ə faylı göndəririk
    const { data, error } = await supabase.storage
      .from('books')
      .upload(uniqueName, req.file.buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase Storage Xətası:', error);
      return res.status(500).json({ error: 'Fayl bulud yaddaşına yüklənə bilmədi' });
    }

    // Public URL-i götürürük
    const { data: urlData } = supabase.storage
      .from('books')
      .getPublicUrl(uniqueName);

    const publicUrl = urlData.publicUrl;
    const hue = Math.floor(Math.random() * 360);
    
    const book = await db.createBook({
      title: title.trim(),
      author: author.trim(),
      description: (description || '').trim(),
      category: category || 'Digər',
      filename: publicUrl, // Bazada birbaşa Supabase linki qalacaq
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

app.get('/api/books/:id/download', requireAuth, async (req, res) => {
  try {
    const book = await db.findBookById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
    
    await db.incrementDownloads(book.id);
    res.redirect(book.filename);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Yükləmə zamanı xəta baş verdi' });
  }
});

app.get('/api/books/:id/view', requireAuth, async (req, res) => {
  try {
    const book = await db.findBookById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
    
    res.redirect(book.filename);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Fayl oxunarkən xəta baş verdi' });
  }
});

app.delete('/api/books/:id', requireAuth, async (req, res) => {
  try {
    const book = await db.findBookById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Kitab tapılmadı' });
    if (book.uploaded_by !== req.session.userId) {
      return res.status(403).json({ error: 'Yalnız öz yüklədiyiniz kitabı silə bilərsiniz' });
    }
    
    // URL-dən faylın adını çıxarırıq
    const fileUrlParts = book.filename.split('/');
    const fileName = fileUrlParts[fileUrlParts.length - 1];

    // Supabase-dən faylı silirik
    await supabase.storage.from('books').remove([fileName]);
    
    await db.deleteBook(book.id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Silinmə zamanı xəta baş verdi' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (e) {
    console.error(e);
    res.status(500).json({ totalBooks: 0, totalUsers: 0, totalDownloads: 0 });
  }
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
  console.log(`\n📚 Kitabxana saytı işə düşdü: http://localhost:${PORT}\n`);
});
