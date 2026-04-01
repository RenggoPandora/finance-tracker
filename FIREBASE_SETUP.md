# Setup Firebase untuk Personal Finance Tracker

Panduan ini fokus pada integrasi Firebase Auth + Firestore agar aplikasi bisa dipakai dengan data real per-user.

## 1. Prasyarat

- Node.js dan npm sudah terpasang.
- Project ini sudah berhasil di-install (`npm install`).
- Akun Google untuk membuat project Firebase.

## 2. Buat Project Firebase

1. Buka Firebase Console: https://console.firebase.google.com/
2. Klik **Create project**.
3. Isi nama project, lalu lanjutkan sampai project terbentuk.

## 3. Daftarkan Web App Firebase

1. Di Firebase Console, buka project yang baru dibuat.
2. Klik ikon Web (`</>`), lalu register app.
3. Ambil nilai config berikut:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- `measurementId` (opsional)

## 4. Isi Environment Variables

Di root project, buat file `.env.local` dari template:

```powershell
Copy-Item .env.example .env.local
```

Isi semua variabel:

```txt
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Catatan:

- Setelah mengubah `.env.local`, restart dev server.
- Jika env kosong, aplikasi akan masuk mode demo lokal (tanpa Firebase).

## 5. Aktifkan Authentication (Google Sign-In)

1. Firebase Console -> **Authentication** -> **Get started**.
2. Tab **Sign-in method** -> aktifkan **Google** provider.
3. Isi email support project jika diminta.
4. Tab **Settings** -> **Authorized domains**:

- Pastikan `localhost` ada.
- Tambahkan domain production kamu saat deploy.

## 6. Aktifkan Firestore Database

1. Firebase Console -> **Firestore Database** -> **Create database**.
2. Pilih region (disarankan dekat user utama).
3. Mode awal bisa **Production mode**.

## 7. Deploy Firestore Rules dari Project Ini

File rules ada di `firestore.rules` dan mapping-nya ada di `firebase.json`.

Opsi A (global, sekali saja):

```powershell
npm install -g firebase-tools
```

Lalu login:

```powershell
firebase login
```

Opsi B (tanpa install global, langsung via npx):

```powershell
npx firebase-tools login
```

Pilih project:

```powershell
firebase use --add
```

Jika pakai Opsi B, gunakan juga bentuk `npx` untuk command berikut:

```powershell
npx firebase-tools use --add
```

Deploy rules:

```powershell
firebase deploy --only firestore:rules
```

Jika pakai Opsi B:

```powershell
npx firebase-tools deploy --only firestore:rules
```

## 8. Jalankan Aplikasi

```powershell
npm run dev
```

Buka app, lalu:

1. Klik login Google.
2. Tambah wallet/transaksi.
3. Reload halaman.
4. Pastikan data tetap ada (berarti tersimpan di Firestore user yang login).

## 9. Struktur Data Firestore

Aplikasi menyimpan data dengan pola:

- `users/{uid}`
- `users/{uid}/wallets/{walletId}`
- `users/{uid}/transactions/{transactionId}`
- `users/{uid}/routine_expenses/{routineExpenseId}`
- `users/{uid}/goals/{goalId}`
- `users/{uid}/transfers/{transferId}`

## 10. Troubleshooting Umum

### A. Tetap masuk mode demo

Penyebab: env Firebase belum lengkap atau salah.

Periksa:

- Semua variabel `NEXT_PUBLIC_FIREBASE_*` sudah terisi.
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` benar.
- Dev server sudah direstart.

### B. Command `firebase` tidak dikenali

Perbaikan:

- Jalankan `npm install -g firebase-tools`.
- Tutup dan buka ulang terminal PowerShell.
- Cek dengan `firebase --version`.
- Jika masih gagal, gunakan command berbasis `npx`, contoh: `npx firebase-tools login`.

### C. Error popup login Google

Periksa:

- Google provider sudah aktif.
- `localhost` ada di Authorized domains.
- Browser tidak memblok popup.

### D. Error `permission-denied`

Periksa:

- Rules sudah di-deploy dari file `firestore.rules`.
- User sudah login (request.auth tidak null).
- Path data sesuai `users/{uid}/...`.

### E. Error soal index Firestore

Saat ini query bawaan umumnya memakai single-field `orderBy` dan biasanya tidak butuh index komposit manual. Jika Firebase meminta index, ikuti link yang muncul di error log untuk membuat index tersebut.

### F. Data awal masih berisi data demo

Jika kamu sempat login sebelum auto-seed dimatikan, data demo mungkin sudah terlanjur tersimpan di Firestore.

Cara bersihkan data user:

1. Buka Firebase Console -> Authentication -> Users.
2. Salin UID user yang ingin dibersihkan.
3. Jalankan:

```powershell
firebase firestore:delete /users/<UID> --recursive --force
```

4. Logout lalu login ulang di aplikasi.

Opsional: jika cache browser masih menampilkan data lama, hapus localStorage key:

- `finance-tracker-user-cache-v1`

## 11. Checklist Siap Production

- Env production (hosting) diisi semua.
- Domain production ditambahkan di Authorized domains.
- Rules sudah deploy terbaru.
- Login dan CRUD diuji dari akun user berbeda.
