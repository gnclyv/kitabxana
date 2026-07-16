// Qlobal Toast (Bildiriş) Sistemi
function showToast(message, type = 'success') {
  const container = document.getElementById('toastWrap');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // 4 saniyə sonra bildirişi sil
  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}