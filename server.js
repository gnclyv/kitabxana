require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(session({
  store: new PgSession({ conString: process.env.DATABASE_URL, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'gizli-acar-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ storage: multer.memoryStorage() });

// AUTH API - Əsas hissə bura idi
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser({ username, email, password_hash: hash, avatar_color: '#3C6E71' });
    req.session.userId = user.id;
    res.json({ user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const user = await db.findUserByUsernameOrEmail(req.body.identifier);
    if (user && await bcrypt.compare(req.body.password, user.password_hash)) {
      req.session.userId = user.id;
      res.json({ user });
    } else { res.status(401).json({ error: 'Yanlış məlumat' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SESSİYA YOXLAMA - Frontend üçün bu lazımdır!
app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ userId: req.session.userId });
  } else {
    res.status(401).json({ error: 'Giriş olunmayıb' });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

// BOOKS
app.post('/api/books', upload.single('pdf'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Daxil olun' });
  try {
    const fileName = Date.now() + '.pdf';
    await supabase.storage.from('books').upload(fileName, req.file.buffer);
    const publicUrl = supabase.storage.from('books').getPublicUrl(fileName).data.publicUrl;
    const book = await db.createBook({
      title: req.body.title, author: req.body.author, filename: publicUrl, uploaded_by: req.session.userId
    });
    res.json({ id: book.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
