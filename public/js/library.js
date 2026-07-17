let currentUser = null;

// ---------- Toast fallback (əgər library.html-də showToast yoxdursa belə çökməsin) ----------
function showToast(message, type = 'success') {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(message, type);
  }
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:9999;
    padding:12px 18px; border-radius:8px; color:#fff; font-size:14px;
    background:${type === 'error' ? '#A83232' : '#2F6F4E'};
    box-shadow:0 4px 12px rgba(0,0,0,.3);
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------- Başlanğıc ----------
// Hər init funksiyası öz try/catch-i ilə işləyir ki, biri çöksə
// digərləri (məs. yükləmə forması) yenə də işə düşsün.
document.addEventListener('DOMContentLoaded', () => {
  safeInit('checkUser', checkUser);
  safeInit('fetchBooks', fetchBooks);
  safeInit('setupDragAndDrop', setupDragAndDrop);
  safeInit('setupUploadForm', setupUploadForm);

  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  if (searchInput) searchInput.addEventListener('input', debounce(fetchBooks, 300));
  if (categorySelect) categorySelect.addEventListener('change', fetchBooks);
});

function safeInit(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`Başlatma xətası (${name}):`, err);
  }
}

function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// ---------- 1. İstifadəçi yoxlanışı ----------
async function checkUser() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      const greet = document.getElementById('greetName');
      const label = document.getElementById('usernameLabel');
      const avatar = document.getElementById('avatar');
      if (greet) greet.textContent = currentUser.username;
      if (label) label.textContent = currentUser.username;
      if (avatar) {
        avatar.textContent = currentUser.username.charAt(0).toUpperCase();
        avatar.style.background = currentUser.avatarColor || '#c9a227';
      }
    } else {
      window.location.href = '/login.html';
    }
  } catch (err) {
    console.error('İstifadəçi yoxlanılarkən xəta:', err);
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.toggle('open');
}

async function logout() {
  try {
    const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    if (res.ok) window.location.href = '/login.html';
  } catch (err) {
    console.error('Çıxış zamanı xəta:', err);
    showToast('Çıxış zamanı xəta baş verdi', 'error');
  }
}

// ---------- 2. Kitabların siyahısı ----------
async function fetchBooks() {
  const skeleton = document.getElementById('skeletonGrid');
  const grid = document.getElementById('bookGrid');
  const emptyState = document.getElementById('emptyState');
  const searchVal = document.getElementById('searchInput')?.value || '';
  const categoryVal = document.getElementById('categorySelect')?.value || 'Hamısı';

  if (skeleton) skeleton.style.display = 'grid';
  if (grid) grid.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';

  try {
    let url = `/api/books?q=${encodeURIComponent(searchVal)}`;
    if (categoryVal !== 'Hamısı') url += `&category=${encodeURIComponent(categoryVal)}`;

    const res = await fetch(url, { credentials: 'include' });

    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server xətası (${res.status})`);
    }

    const data = await res.json();
    const books = data.books || [];

    if (grid) grid.innerHTML = '';
    if (skeleton) skeleton.style.display = 'none';

    if (books.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (grid) grid.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    books.forEach((book, index) => {
      const coverHtml = book.cover_image
        ? `<img src="${book.cover_image}" class="book-cover-img" alt="${escapeHtml(book.title)}">`
        : `<div class="glyph">${escapeHtml(book.title.charAt(0))}</div>`;

      const deleteBtn = (currentUser && book.uploaded_by === currentUser.id)
        ? `<button class="icon-btn del" onclick="deleteBook('${book.id}')" title="Sil">🗑️</button>`
        : '';

      const sizeKB = (book.filesize / 1024).toFixed(0);

      const card = document.createElement('div');
      card.className = 'book-card';
      card.style.animationDelay = `${index * 0.05}s`;
      card.innerHTML = `
        <div class="cover">
          <span class="cat-tag">${escapeHtml(book.category)}</span>
          ${coverHtml}
        </div>
        <div class="card-body">
          <div>
            <h3>${escapeHtml(book.title)}</h3>
            <div class="author">${escapeHtml(book.author)}</div>
            ${book.description ? `<p class="desc">${escapeHtml(book.description)}</p>` : ''}
          </div>
          <div class="card-actions">
            <a href="/api/books/${book.id}/view" target="_blank" class="icon-btn">👁️ Oxu</a>
            <a href="/api/books/${book.id}/download" class="icon-btn">⬇️ Endir</a>
            ${deleteBtn}
          </div>
        </div>
        <div class="meta-row">
          <span>Ölçü: ${sizeKB} KB</span>
          <span>Yükləmə: ${book.downloads || 0}</span>
        </div>
      `;
      if (grid) grid.appendChild(card);
    });
  } catch (err) {
    console.error('Kitablar yüklənərkən xəta:', err);
    if (skeleton) skeleton.style.display = 'none';
    showToast(err.message || 'Kitablar yüklənərkən xəta baş verdi!', 'error');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- 3. Modal ----------
function openModal() {
  document.getElementById('modalOverlay')?.classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('open');
  document.getElementById('uploadForm')?.reset();
  const dzFile = document.getElementById('dzFile');
  const dzCoverFile = document.getElementById('dzCoverFile');
  const progressWrap = document.getElementById('progressWrap');
  if (dzFile) dzFile.textContent = '';
  if (dzCoverFile) dzCoverFile.textContent = '';
  if (progressWrap) progressWrap.style.display = 'none';
}

// ---------- Sürüklə-burax ----------
function setupDragAndDrop() {
  const setupZone = (zoneId, inputId, labelId) => {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!zone || !input) return; // Element yoxdursa sakitcə keç, çökmə

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--gold)';
    });

    zone.addEventListener('dragleave', () => {
      zone.style.borderColor = 'var(--line)';
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--line)';
      if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        if (label) label.textContent = e.dataTransfer.files[0].name;
      }
    });

    input.addEventListener('change', () => {
      if (input.files.length && label) {
        label.textContent = input.files[0].name;
      }
    });
  };

  setupZone('dropZone', 'pdfInput', 'dzFile');
  setupZone('coverDropZone', 'coverInput', 'dzCoverFile');
}

// ---------- 4. Kitab yükləmə (XHR + progress bar) ----------
function setupUploadForm() {
  const form = document.getElementById('uploadForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pdfInput = document.getElementById('pdfInput');
    if (!pdfInput || !pdfInput.files || pdfInput.files.length === 0) {
      showToast('Zəhmət olmasa PDF faylı seçin!', 'error');
      return;
    }

    const formData = new FormData(form);
    formData.set('pdf', pdfInput.files[0]);
    const coverInput = document.getElementById('coverInput');
    if (coverInput && coverInput.files.length) {
      formData.set('cover', coverInput.files[0]);
    }

    const uploadBtn = document.getElementById('uploadBtn');
    const progressWrap = document.getElementById('progressWrap');
    const progressBar = document.getElementById('progressBar');

    if (uploadBtn) uploadBtn.disabled = true;
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';

    const resetUi = () => {
      if (uploadBtn) uploadBtn.disabled = false;
      if (progressWrap) progressWrap.style.display = 'none';
    };

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/books', true);
      xhr.withCredentials = true; // sessiya cookie-si mütləq getsin

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && progressBar) {
          const percent = (event.loaded / event.total) * 100;
          progressBar.style.width = percent + '%';
        }
      };

      xhr.onload = function () {
        resetUi();
        let response = {};
        try { response = JSON.parse(xhr.responseText); } catch (_) { /* HTML gəlibsə boş qalsın */ }

        if (xhr.status === 201) {
          showToast('Kitab uğurla yükləndi!');
          closeModal();
          fetchBooks();
        } else if (xhr.status === 401) {
          window.location.href = '/login.html';
        } else {
          showToast(response.error || `Yüklənmə zamanı xəta oldu (${xhr.status})`, 'error');
        }
      };

      xhr.onerror = function () {
        resetUi();
        showToast('Serverlə əlaqə kəsildi!', 'error');
      };

      xhr.send(formData);
    } catch (err) {
      console.error('Yükləmə xətası:', err);
      resetUi();
      showToast('Gözlənilməz xəta baş verdi', 'error');
    }
  });
}

// ---------- 5. Kitabı silmək ----------
async function deleteBook(id) {
  if (!confirm('Bu kitabı silmək istədiyinizdən əminsiniz?')) return;

  try {
    const res = await fetch(`/api/books/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.success || data.ok)) {
      showToast('Kitab silindi');
      fetchBooks();
    } else {
      showToast(data.error || `Silinmə uğursuz oldu (${res.status})`, 'error');
    }
  } catch (err) {
    console.error('Silinmə xətası:', err);
    showToast('Xəta baş verdi', 'error');
  }
}
