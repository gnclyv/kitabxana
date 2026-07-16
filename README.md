# 📖 Vərəq — Rəqəmsal Kitab Kitabxanası

Login/qeydiyyat, SQLite verilənlər bazası və PDF yükləmə/oxuma imkanı olan, animasiyalı dizaynlı kitab paylaşma saytı.

## Xüsusiyyətlər

- 🔐 Qeydiyyat və giriş (şifrələr `bcrypt` ilə hash-lənir)
- 🗄️ Fayl əsaslı verilənlər bazası (JSON) — heç bir native compile / build alətləri tələb olunmur, `npm install` istənilən Windows/Mac/Linux kompüterində problemsiz işləyir
- ⬆️ Sürüklə-burax üsulu ilə PDF yükləmə (irəliləyiş zolağı ilə)
- 📚 Kitabları axtarış və kateqoriya üzrə süzgəcdən keçirmə
- 👁️ Kitabı birbaşa brauzerdə oxuma və ya öz cihazına endirmə
- 🗑️ Yalnız öz yüklədiyin kitabı silə bilmə
- ✨ Bol animasiya: səhifə keçidləri, kartların "canlanması", sürüklə-burax effektləri, üzən vərəq fonu və s.

## Quraşdırma

1. Kompüterində **Node.js** (versiya 18 və ya daha yuxarı) quraşdırılmış olmalıdır.
   Yoxlamaq üçün: `node -v`
   Yoxdursa buradan yüklə: https://nodejs.org

2. Bu qovluğu (zip-dən çıxardıqdan sonra) terminalda aç və asılılıqları quraşdır:

   ```bash
   npm install
   ```

3. Serveri işə sal:

   ```bash
   npm start
   ```

4. Brauzerdə aç:

   ```
   http://localhost:3000
   ```

Bu qədər! Qeydiyyatdan keç, kitab yüklə, paylaş.

## Qovluq strukturu

```
kitabxana/
├── server.js          → Express server + bütün API endpoint-lər
├── db.js              → JSON-based verilənlər bazası modulu (users, books)
├── package.json
├── data/               → users.json və books.json burada avtomatik yaranır
├── uploads/            → yüklənən PDF-lər burada saxlanılır
└── public/
    ├── index.html      → Giriş/qeydiyyat səhifəsi
    ├── library.html    → Kitabxana (dashboard) səhifəsi
    ├── css/style.css   → Dizayn və animasiyalar
    └── js/
        ├── common.js   → toast bildirişləri
        └── library.js  → kitabxana səhifəsinin məntiqi
```

## Qeydlər

- Verilənlər bazası faylları (`data/users.json`, `data/books.json`) və yüklənən
  fayllar (`uploads/`) serveri ilk dəfə işə saldıqda avtomatik yaranır. Onları
  silsən, bütün istifadəçi və kitablar sıfırlanar.
- PDF fayl ölçüsü limiti: 80 MB (server.js-də `limits.fileSize` dəyişəni ilə artırıla bilər).
- Sessiyalar server yenidən başladıqda sıfırlanır (istifadəçilər yenidən giriş etməli olacaq),
  çünki sessiya yaddaşda (memory) saxlanılır. Uzunmüddətli/production istifadə üçün
  sessiya mağazasını fayla/verilənlər bazasına bağlamaq tövsiyə olunur.
- Saytı internetə açmaq istəsən (məs. başqaları da daxil olsun), server.js-də
  `PORT` dəyişənini və host konfiqurasiyasını uyğun hosting mühitinə (Render,
  Railway, VPS və s.) görə tənzimləməlisən. Yerli şəbəkədə paylaşmaq üçün
  kompüterinin IP-sini (`http://SƏNİN_IP:3000`) digərlərinə verə bilərsən.

## Texnologiyalar

- **Backend:** Node.js, Express
- **Verilənlər bazası:** Sadə JSON fayl əsaslı store (`db.js`, əlavə asılılıq yoxdur)
- **Autentifikasiya:** `express-session` + `bcryptjs`
- **Fayl yükləmə:** `multer`
- **Frontend:** Xalis HTML/CSS/JS (framework yoxdur), Google Fonts (Fraunces + Inter)

Uğurlar! 📚
