# Personal Finance Tracker

Web app pencatatan keuangan pribadi berbasis Next.js App Router dengan fitur:

- Income/expense tracking
- Multi-wallet management
- Routine expense (planned vs actual)
- Adaptive smart spending limit (strict/flexible)
- Financial goals (locked funds)
- Dashboard analytics + gamification score

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS v4
- Firebase Auth (Google Sign-In)
- Firestore (per-user collections)
- Zustand (client state + persisted cache per user)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

3. Isi semua variabel Firebase di `.env.local`:

```txt
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

4. Jalankan app:

```bash
npm run dev
```

Jika env Firebase belum diisi, aplikasi tetap jalan dalam mode demo lokal.

## Firebase Integration Guide

Panduan lengkap setup Firebase (Auth + Firestore + deploy rules) ada di:

- `FIREBASE_SETUP.md`

## Firestore Schema

Struktur dokumen:

- `users/{uid}`
- `users/{uid}/wallets/{walletId}`
- `users/{uid}/transactions/{transactionId}`
- `users/{uid}/routine_expenses/{routineExpenseId}`
- `users/{uid}/goals/{goalId}`
- `users/{uid}/transfers/{transferId}`

Rules awal ada di `firestore.rules`.

## Validation

```bash
npm run lint
npm run build
```
