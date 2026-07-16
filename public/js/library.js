let currentUser = null;

// Səhifə yüklənəndə işə düşən təməl funksiyalar
document.addEventListener('DOMContentLoaded', () => {
  checkUser();
  fetchBooks();
  setupDragAndDrop();
  setupUploadForm();

  // Axtarış və Kateqoriya filtrlərini dinləmək
  document.getElementById('searchInput').addEventListener('input', debounce(fetchBooks, 300));
  document.getElementById('categorySelect').addEventListener('change', fetchBooks);
});

// Debounce funksiyası (Axtarış zamanı serveri yükləməmək üçün gecikdirici)
function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

// 1. İstifadəçi məlumatlarını yoxlamaq və menyunu tənzimləmək
async function checkUser() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      document.getElementById('greetName').textContent = currentUser.username;
      document.getElementById('usernameLabel').textContent = currentUser.username;
      
      const avatar = document.getElementById('avatar');
      avatar.textContent = currentUser.username.charAt(0).toUpperCase();
      avatar.style.background = currentUser.avatarColor || '#c9a227';
    } else {
      window.location.href = '/login.html'; // Giriş edilməyibsə login səhifəsinə yönləndir
    }
  } catch (err) {
    console.error('İstifadəçi yoxlanılarkən xəta:', err);
  }
}

// İstifadəçi menyusunu açıb-bağlamaq
function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('open');
}

// Çıxış etmək
async function logout() {
  const res = await fetch('/api/logout', { method: 'POST' });
  if (res.ok) {
    window.location.href = '/login.html';
  }
}

// 2. Kitabları Serverdən Yükləmək və Ekrana Düzmək (Dinamik və Responsive)
async function fetchBooks() {
  const skeleton = document.getElementById('skeletonGrid');
  const grid = document.getElementById('bookGrid');
  const emptyState = document.getElementById('emptyState');
  
  const searchVal = document.getElementById('searchInput').value;
  const categoryVal = document.getElementById('categorySelect').value;

  // Yüklənir (Skeleton göstər)
  skeleton.style.display = 'grid';
  grid.style.display = 'none';
  emptyState.style.display = 'none';

  try {
    let url = `/api/books?q=${encodeURIComponent(searchVal)}`;
    if (categoryVal !== 'Hamısı') {
      url += `&category=${encodeURIComponent(categoryVal)}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    const books = data.books || [];

    grid.innerHTML = '';
    skeleton.style.display = 'none';

    if (books.length === 0) {
      emptyState.style.display = 'block';
      grid.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    grid.style.display = 'grid';

    books.forEach((book, index) => {
      // Əgər kitabın üz qabığı yoxdursa, default rəngli fon göstəririk
      const coverHtml = book.cover_image 
        ? `<img src="${book.cover_image}" class="book-cover-img" alt="${book.title}">`
        : `<div class="glyph">${book.title.charAt(0)}</div>`;

      // Kitabı silmək düyməsi (Yalnız yükləyən şəxsə göstərilir)
      const deleteBtn = currentUser && book.uploaded_by === currentUser.id
        ? `<button class="icon-btn del" onclick="deleteBook('${book.id}')" title="Sil">🗑️</button>`
        : '';

      const sizeKB = (book.filesize / 1024).toFixed(0);

      const card = document.createElement('div');
      card.className = 'book-card';
      card.style.animationDelay = `${index * 0.05}s`; // Slayd animasiyası üçün gecikmə

      card.innerHTML = `
        <div class="cover">
          <span class="cat-tag">${book.category}</span>
          ${coverHtml}
        </div>
        <div class="card-body">
          <div>
            <h3>${book.title}</h3>
            <div class="author">${book.author}</div>
            ${book.description ? `<p class="desc">${book.description}</p>` : ''}
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
      grid.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    showToast('Kitablar yüklənərkən xəta baş verdi!', 'error');
  }
}

// 3. Kitab Yükləmə Paneli (Modal) Kontrolları
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('uploadForm').reset();
  document.getElementById('dzFile').textContent = '';
  document.getElementById('dzCoverFile').textContent = '';
  document.getElementById('progressWrap').style.display = 'none';
}

// Sürüklə-Burax (Drag & Drop) tənzimləmələri
function setupDragAndDrop() {
  const setupZone = (zoneId, inputId, labelId) => {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);

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
        label.textContent = e.dataTransfer.files[0].name;
      }
    });

    input.addEventListener('change', () => {
      if (input.files.length) {
        label.textContent = input.files[0].name;
      }
    });
  };

  setupZone('dropZone', 'pdfInput', 'dzFile');
  setupZone('coverDropZone', 'coverInput', 'dzCoverFile');
}

// 4. Kitab Yüklənməsi Sorğusu (Ajax + Progress Bar)
function setupUploadForm() {
  const form = document.getElementById('uploadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pdfInput = document.getElementById('pdfInput');
    if (!pdfInput.files || pdfInput.files.length === 0) {
      showToast('Zəhmət olmasa PDF faylı seçin!', 'error');
      return;
    }

    const formData = new FormData(form);
    // Əgər input-lar əllə doldurulubsa, onları da əlavə edirik
    formData.set('pdf', pdfInput.files[0]);
    const coverInput = document.getElementById('coverInput');
    if (coverInput.files.length) {
      formData.set('cover', coverInput.files[0]);
    }

    const uploadBtn = document.getElementById('uploadBtn');
    const progressWrap = document.getElementById('progressWrap');
    const progressBar = document.getElementById('progressBar');

    uploadBtn.disabled = true;
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';

    try {
      // Fayl yüklənmə faizini hesablamaq üçün XMLHttpRequest istifadə edirik
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/books', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          progressBar.style.width = percentComplete + '%';
        }
      };

      xhr.onload = function () {
        if (xhr.status === 201) {
          showToast('Kitab uğurla yükləndi!');
          closeModal();
          fetchBooks();
        } else {
          const response = JSON.parse(xhr.responseText);
          showToast(response.error || 'Yüklənmə zamanı xəta oldu!', 'error');
        }
        uploadBtn.disabled = false;
        progressWrap.style.display = 'none';
      };

      xhr.onerror = function () {
        showToast('Serverlə əlaqə kəsildi!', 'error');
        uploadBtn.disabled = false;
        progressWrap.style.display = 'none';
      };

      xhr.send(formData);

    } catch (err) {
      console.error(err);
      showToast('Gözlənilməz xəta baş verdi', 'error');
      uploadBtn.disabled = false;
      progressWrap.style.display = 'none';
    }
  });
}

// 5. Kitab Silmək Funksiyası
async function deleteBook(id) {
  if (!confirm('Bu kitabı silmək istədiyinizdən əminsiniz?')) return;

  try {
    const res = await fetch(`/api/books/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
      showToast('Kitab silindi');
      fetchBooks();
    } else {
      showToast(data.error || 'Silinmə uğursuz oldu', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Xəta baş verdi', 'error');
  }
}