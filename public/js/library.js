let currentUser = null;
let allBooks = [];
let selectedFile = null;
let searchDebounce = null;

const CATEGORY_ICONS = {
  'Bədii ədəbiyyat': '✎', 'Elmi': '🜸', 'Tarix': '⌛', 'Psixologiya': '❊',
  'Biznes': '◆', 'Uşaq ədəbiyyatı': '✺', 'Digər': '❋'
};

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

async function init() {
  const meRes = await fetch('/api/me');
  const meJson = await meRes.json();
  if (!meJson.user) { window.location.href = '/'; return; }
  currentUser = meJson.user;
  document.getElementById('avatar').textContent = initials(currentUser.username);
  document.getElementById('avatar').style.background = currentUser.avatarColor;
  document.getElementById('usernameLabel').textContent = currentUser.username;
  document.getElementById('greetName').textContent = currentUser.username;
  await loadBooks();
}

async function loadBooks() {
  const q = document.getElementById('searchInput').value.trim();
  const category = document.getElementById('categorySelect').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const res = await fetch('/api/books?' + params.toString());
  if (!res.ok) return;
  const json = await res.json();
  allBooks = json.books;
  render();
}

function render() {
  const grid = document.getElementById('bookGrid');
  const skeleton = document.getElementById('skeletonGrid');
  const empty = document.getElementById('emptyState');
  skeleton.style.display = 'none';

  if (allBooks.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = allBooks.map((b, i) => {
    const hue = b.coverHue;
    const isMine = b.uploadedBy === currentUser.id;
    const icon = CATEGORY_ICONS[b.category] || '❋';
    return `
    <div class="book-card" style="animation-delay:${Math.min(i * 0.05, 0.6)}s">
      <div class="cover" style="background: linear-gradient(150deg, hsl(${hue},48%,30%), hsl(${(hue+40)%360},55%,18%));">
        <span class="cat-tag">${icon} ${escapeHtml(b.category)}</span>
        <span class="glyph">${escapeHtml(initials(b.title))}</span>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(b.title)}</h3>
        <div class="author">${escapeHtml(b.author)}</div>
        <div class="desc">${escapeHtml(b.description || 'Təsvir əlavə edilməyib.')}</div>
        <div class="card-actions">
          <button class="icon-btn" onclick="viewBook(${b.id})">👁 Oxu</button>
          <button class="icon-btn" onclick="downloadBook(${b.id})">⬇ Endir</button>
          ${isMine ? `<button class="icon-btn del" onclick="deleteBook(${b.id})" title="Sil">🗑</button>` : ''}
        </div>
      </div>
      <div class="meta-row">
        <span>${escapeHtml(b.uploader)}</span>
        <span>${fmtSize(b.filesize)} · ${b.downloads} endirmə</span>
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function viewBook(id) { window.open('/api/books/' + id + '/view', '_blank'); }
function downloadBook(id) { window.location.href = '/api/books/' + id + '/download'; }

async function deleteBook(id) {
  if (!confirm('Bu kitabı silmək istədiyinizə əminsiniz?')) return;
  const res = await fetch('/api/books/' + id, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) { showToast(json.error, 'error'); return; }
  showToast('Kitab silindi', 'success');
  loadBooks();
}

document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadBooks, 300);
});
document.getElementById('categorySelect').addEventListener('change', loadBooks);

function toggleUserMenu() {
  document.getElementById('userDropdown').classList.toggle('open');
}
document.addEventListener('click', (e) => {
  if (!document.getElementById('userChip').contains(e.target)) {
    document.getElementById('userDropdown').classList.remove('open');
  }
});

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// ---- Modal ----
function openModal() { document.getElementById('modalOverlay').classList.add('open'); }
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('uploadForm').reset();
  selectedFile = null;
  document.getElementById('dzFile').textContent = '';
  document.getElementById('progressWrap').classList.remove('show');
  document.getElementById('progressBar').style.width = '0%';
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

const dropZone = document.getElementById('dropZone');
const pdfInput = document.getElementById('pdfInput');
dropZone.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', (e) => setFile(e.target.files[0]));
['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

function setFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Yalnız PDF faylları qəbul olunur', 'error');
    return;
  }
  selectedFile = file;
  document.getElementById('dzFile').textContent = '✓ ' + file.name + ' (' + fmtSize(file.size) + ')';
  if (!document.getElementById('titleInput').value) {
    document.getElementById('titleInput').value = file.name.replace(/\.pdf$/i, '');
  }
}

document.getElementById('uploadForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!selectedFile) { showToast('Zəhmət olmasa PDF faylı seçin', 'error'); return; }

  const fd = new FormData();
  fd.append('pdf', selectedFile);
  fd.append('title', document.getElementById('titleInput').value);
  fd.append('author', document.getElementById('authorInput').value);
  fd.append('category', document.getElementById('categoryInput').value);
  fd.append('description', document.getElementById('descInput').value);

  const btn = document.getElementById('uploadBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  progressWrap.classList.add('show');

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/books');
  xhr.upload.addEventListener('progress', (evt) => {
    if (evt.lengthComputable) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      progressBar.style.width = pct + '%';
    }
  });
  xhr.onload = () => {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-label">Yüklə</span>';
    let json = {};
    try { json = JSON.parse(xhr.responseText); } catch (e) {}
    if (xhr.status >= 200 && xhr.status < 300) {
      showToast('Kitab uğurla yükləndi! 🎉', 'success');
      closeModal();
      loadBooks();
    } else {
      showToast(json.error || 'Yükləmə zamanı xəta baş verdi', 'error');
      progressWrap.classList.remove('show');
    }
  };
  xhr.onerror = () => {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-label">Yüklə</span>';
    showToast('Şəbəkə xətası baş verdi', 'error');
  };
  xhr.send(fd);
});

init();
