// Sadə, asılılıqsız JSON-based verilənlər bazası.
// better-sqlite3 əvəzinə istifadə olunur ki, Windows/Mac/Linux-da
// heç bir native compile (Visual Studio / build tools) tələb olunmasın.

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const usersFile = path.join(dataDir, 'users.json');
const booksFile = path.join(dataDir, 'books.json');

function readJson(file) {
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Verilənlər bazası oxunarkən xəta:', file, e.message);
    return [];
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function nextId(rows) {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------- USERS ----------------
function userExists(username, email) {
  const users = readJson(usersFile);
  const uLower = username.toLowerCase();
  const eLower = email.toLowerCase();
  return users.some(u => u.username.toLowerCase() === uLower || u.email.toLowerCase() === eLower);
}

function findUserByUsernameOrEmail(identifier) {
  const users = readJson(usersFile);
  const idLower = identifier.toLowerCase();
  return users.find(u => u.username.toLowerCase() === idLower || u.email.toLowerCase() === idLower) || null;
}

function findUserById(id) {
  const users = readJson(usersFile);
  return users.find(u => u.id === Number(id)) || null;
}

function createUser({ username, email, password_hash, avatar_color }) {
  const users = readJson(usersFile);
  const user = {
    id: nextId(users),
    username,
    email,
    password_hash,
    avatar_color,
    created_at: nowIso()
  };
  users.push(user);
  writeJson(usersFile, users);
  return user;
}

// ---------------- BOOKS ----------------
function listBooks({ q, category } = {}) {
  const books = readJson(booksFile);
  const users = readJson(usersFile);
  const userMap = new Map(users.map(u => [u.id, u.username]));

  let rows = books.map(b => ({ ...b, uploader: userMap.get(b.uploaded_by) || 'naməlum' }));

  if (q) {
    const qLower = q.toLowerCase();
    rows = rows.filter(b => b.title.toLowerCase().includes(qLower) || b.author.toLowerCase().includes(qLower));
  }
  if (category && category !== 'Hamısı') {
    rows = rows.filter(b => b.category === category);
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return rows;
}

function findBookById(id) {
  const books = readJson(booksFile);
  return books.find(b => b.id === Number(id)) || null;
}

function createBook(data) {
  const books = readJson(booksFile);
  const book = {
    id: nextId(books),
    title: data.title,
    author: data.author,
    description: data.description || '',
    category: data.category || 'Digər',
    filename: data.filename,
    original_name: data.original_name,
    filesize: data.filesize,
    cover_hue: data.cover_hue,
    uploaded_by: data.uploaded_by,
    downloads: 0,
    created_at: nowIso()
  };
  books.push(book);
  writeJson(booksFile, books);
  return book;
}

function deleteBook(id) {
  const books = readJson(booksFile);
  const idx = books.findIndex(b => b.id === Number(id));
  if (idx === -1) return false;
  books.splice(idx, 1);
  writeJson(booksFile, books);
  return true;
}

function incrementDownloads(id) {
  const books = readJson(booksFile);
  const book = books.find(b => b.id === Number(id));
  if (book) {
    book.downloads = (book.downloads || 0) + 1;
    writeJson(booksFile, books);
  }
}

function getStats() {
  const books = readJson(booksFile);
  const users = readJson(usersFile);
  const totalDownloads = books.reduce((sum, b) => sum + (b.downloads || 0), 0);
  return { totalBooks: books.length, totalUsers: users.length, totalDownloads };
}

module.exports = {
  userExists,
  findUserByUsernameOrEmail,
  findUserById,
  createUser,
  listBooks,
  findBookById,
  createBook,
  deleteBook,
  incrementDownloads,
  getStats
};
