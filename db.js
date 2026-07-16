// Neon Tech Postgres-based verilənlər bazası provayderi
// Serverless mühitlər (Vercel) üçün optimallaşdırılmışdır.

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL mühit dəyişəni (environment variable) tapılmadı!");
}

const sql = neon(process.env.DATABASE_URL);

// ---------------- USERS ----------------

async function userExists(username, email) {
  const rows = await sql`
    SELECT id FROM users 
    WHERE LOWER(username) = LOWER(${username}) OR LOWER(email) = LOWER(${email}) 
    LIMIT 1
  `;
  return rows.length > 0;
}

async function findUserByUsernameOrEmail(identifier) {
  const rows = await sql`
    SELECT * FROM users 
    WHERE LOWER(username) = LOWER(${identifier}) OR LOWER(email) = LOWER(${identifier}) 
    LIMIT 1
  `;
  return rows[0] || null;
}

async function findUserById(id) {
  const rows = await sql`
    SELECT * FROM users 
    WHERE id = ${Number(id)} 
    LIMIT 1
  `;
  return rows[0] || null;
}

async function createUser({ username, email, password_hash, avatar_color }) {
  const rows = await sql`
    INSERT INTO users (username, email, password_hash, avatar_color)
    VALUES (${username}, ${email}, ${password_hash}, ${avatar_color})
    RETURNING *
  `;
  return rows[0];
}

// ---------------- BOOKS ----------------

async function listBooks({ q, category } = {}) {
  let query = sql`
    SELECT b.*, COALESCE(u.username, 'naməlum') AS uploader
    FROM books b
    LEFT JOIN users u ON b.uploaded_by = u.id
    WHERE 1=1
  `;

  if (q && category && category !== 'Hamısı') {
    query = sql`
      SELECT b.*, COALESCE(u.username, 'naməlum') AS uploader
      FROM books b
      LEFT JOIN users u ON b.uploaded_by = u.id
      WHERE (LOWER(b.title) LIKE ${'%' + q.toLowerCase() + '%'} 
         OR LOWER(b.author) LIKE ${'%' + q.toLowerCase() + '%'})
        AND b.category = ${category}
      ORDER BY b.created_at DESC
    `;
  } else if (q) {
    query = sql`
      SELECT b.*, COALESCE(u.username, 'naməlum') AS uploader
      FROM books b
      LEFT JOIN users u ON b.uploaded_by = u.id
      WHERE LOWER(b.title) LIKE ${'%' + q.toLowerCase() + '%'} 
         OR LOWER(b.author) LIKE ${'%' + q.toLowerCase() + '%'}
      ORDER BY b.created_at DESC
    `;
  } else if (category && category !== 'Hamısı') {
    query = sql`
      SELECT b.*, COALESCE(u.username, 'naməlum') AS uploader
      FROM books b
      LEFT JOIN users u ON b.uploaded_by = u.id
      WHERE b.category = ${category}
      ORDER BY b.created_at DESC
    `;
  } else {
    query = sql`
      SELECT b.*, COALESCE(u.username, 'naməlum') AS uploader
      FROM books b
      LEFT JOIN users u ON b.uploaded_by = u.id
      ORDER BY b.created_at DESC
    `;
  }

  return await query;
}

async function findBookById(id) {
  const rows = await sql`
    SELECT * FROM books 
    WHERE id = ${Number(id)} 
    LIMIT 1
  `;
  return rows[0] || null;
}

async function createBook(data) {
  // cover_hue dəyərini zəmanətə almaq üçün stringə çeviririk
  const hueString = data.cover_hue !== undefined ? data.cover_hue.toString() : '180';

  // Yüklənən üz qabığı şəklini (əgər varsa) bazaya yazırıq, yoxdursa null gedir
  const coverImage = data.cover_image || null;

  const rows = await sql`
    INSERT INTO books (
      title, author, description, category, filename, cover_image,
      original_name, filesize, cover_hue, uploaded_by
    )
    VALUES (
      ${data.title}, 
      ${data.author}, 
      ${data.description || ''}, 
      ${data.category || 'Digər'}, 
      ${data.filename}, 
      ${coverImage},
      ${data.original_name}, 
      ${Number(data.filesize)}, 
      ${hueString}, 
      ${data.uploaded_by ? Number(data.uploaded_by) : null}
    )
    RETURNING *
  `;
  return rows[0];
}

async function deleteBook(id) {
  const result = await sql`
    DELETE FROM books 
    WHERE id = ${Number(id)}
    RETURNING id
  `;
  return result.length > 0;
}

async function incrementDownloads(id) {
  await sql`
    UPDATE books 
    SET downloads = COALESCE(downloads, 0) + 1 
    WHERE id = ${Number(id)}
  `;
}

async function getStats() {
  const [booksCount, usersCount, downloadsSum] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM books`,
    sql`SELECT COUNT(*)::int AS count FROM users`,
    sql`SELECT COALESCE(SUM(downloads), 0)::int AS sum FROM books`
  ]);

  return {
    totalBooks: booksCount[0].count,
    totalUsers: usersCount[0].count,
    totalDownloads: downloadsSum[0].sum
  };
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