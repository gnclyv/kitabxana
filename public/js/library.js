let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  checkUser();
  fetchBooks();
  setupDragAndDrop();
  setupUploadForm();

  document.getElementById('searchInput').addEventListener('input', debounce(fetchBooks, 300));
  document.getElementById('categorySelect').addEventListener('change', fetchBooks);
});

function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

async function checkUser() {
  try {
    // credentials: 'include' - SESSIYANI SERVERƏ GÖNDƏRİR
    const res = await fetch('/api/me', { credentials: 'include' });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      document.getElementById('greetName').textContent = currentUser.username;
      document.getElementById('usernameLabel').textContent = currentUser.username;
      const avatar = document.getElementById('avatar');
      avatar.textContent = currentUser.username.charAt(0).toUpperCase();
      avatar.style.background = currentUser.avatarColor || '#c9a227';
    } else {
      window.location.href = '/login.html';
    }
  } catch (err) {
    console.error('İstifadəçi yoxlanılarkən xəta:', err);
  }
}

async function logout() {
  const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  if (res.ok) { window.location.href = '/login.html'; }
}

async function fetchBooks() {
  const skeleton = document.getElementById('skeletonGrid');
  const grid = document.getElementById('bookGrid');
  const emptyState = document.getElementById('emptyState');
  const searchVal = document.getElementById('searchInput').value;
  const categoryVal = document.getElementById('categorySelect').value;

  skeleton.style.display = 'grid';
  grid.style.display = 'none';

  try {
    let url = `/api/books?q=${encodeURIComponent(searchVal)}`;
    if (categoryVal !== 'Hamısı') url += `&category=${encodeURIComponent(categoryVal)}`;

    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json();
    const books = data.books || [];

    grid.innerHTML = '';
    skeleton.style.display = 'none';

    if (books.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    grid.style.display = 'grid';

    books.forEach((book, index) => {
      const coverHtml = book.cover_image 
        ? `<img src="${book.cover_image}" class="book-cover-img" alt="${book.title}">`
        : `<div class="glyph">${book.title.charAt(0)}</div>`;

      const deleteBtn = (currentUser && book.uploaded_by === currentUser.id)
        ? `<button class="icon-btn del" onclick="deleteBook('${book.id}')">🗑️</button>` : '';

      const card = document.createElement('div');
      card.className = 'book-card';
      card.innerHTML = `
        <div class="cover">${coverHtml}</div>
        <div class="card-body">
          <h3>${book.title}</h3>
          <div class="card-actions">
            <a href="/api/books/${book.id}/view" target="_blank">👁️</a>
            <a href="/api/books/${book.id}/download">⬇️</a>
            ${deleteBtn}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) { console.error(err); }
}

async function deleteBook(id) {
  if (!confirm('Silmək istədiyinizə əminsiniz?')) return;
  try {
    const res = await fetch(`/api/books/${id}`, { 
      method: 'DELETE', 
      credentials: 'include' 
    });
    const data = await res.json();
    if (data.success || data.ok) { // Hər iki formanı da qəbul edir
      fetchBooks();
    }
  } catch (err) { console.error(err); }
}

function setupUploadForm() {
  const form = document.getElementById('uploadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    
    const res = await fetch('/api/books', {
      method: 'POST',
      body: formData,
      credentials: 'include' // Fayl yükləmədə də mütləqdir
    });
    
    if (res.ok) {
      closeModal();
      fetchBooks();
    }
  });
}
