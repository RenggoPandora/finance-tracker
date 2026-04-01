import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function sanitizeEnvValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  let nextValue = value.trim().replace(/[\r\n]/g, "").replace(/\\r|\\n/g, "");

  while (nextValue.length >= 2 && nextValue.startsWith('"') && nextValue.endsWith('"')) {
    nextValue = nextValue.slice(1, -1).trim();
  }

  if (nextValue.startsWith('"')) {
    nextValue = nextValue.slice(1).trim();
  }

  if (nextValue.endsWith('"')) {
    nextValue = nextValue.slice(0, -1).trim();
  }

  return nextValue || undefined;
}

const normalizedFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

for (const key of Object.keys(normalizedFirebaseConfig) as Array<keyof typeof normalizedFirebaseConfig>) {
  normalizedFirebaseConfig[key] = sanitizeEnvValue(normalizedFirebaseConfig[key]);
}

function hasValue(value: string | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

export const isFirebaseConfigured = [
  normalizedFirebaseConfig.apiKey,
  normalizedFirebaseConfig.authDomain,
  normalizedFirebaseConfig.projectId,
  normalizedFirebaseConfig.storageBucket,
  normalizedFirebaseConfig.messagingSenderId,
  normalizedFirebaseConfig.appId,
].every(hasValue);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey: normalizedFirebaseConfig.apiKey!,
    authDomain: normalizedFirebaseConfig.authDomain!,
    projectId: normalizedFirebaseConfig.projectId!,
    storageBucket: normalizedFirebaseConfig.storageBucket!,
    messagingSenderId: normalizedFirebaseConfig.messagingSenderId!,
    appId: normalizedFirebaseConfig.appId!,
    measurementId: normalizedFirebaseConfig.measurementId,
  };

  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  firestoreDb = getFirestore(firebaseApp);
}

export { firebaseApp, firebaseAuth, firestoreDb };

export function requireFirestore(): Firestore {
  if (!firestoreDb) {
    throw new Error(
      "Firebase Firestore is not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local.",
    );
  }

  return firestoreDb;
}

export function requireAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error(
      "Firebase Auth is not configured. Add NEXT_PUBLIC_FIREBASE_* to .env.local.",
    );
  }

  return firebaseAuth;
}
