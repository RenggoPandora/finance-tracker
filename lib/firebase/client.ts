import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const rawFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function hasValue(value: string | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

export const isFirebaseConfigured = [
  rawFirebaseConfig.apiKey,
  rawFirebaseConfig.authDomain,
  rawFirebaseConfig.projectId,
  rawFirebaseConfig.storageBucket,
  rawFirebaseConfig.messagingSenderId,
  rawFirebaseConfig.appId,
].every(hasValue);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey: rawFirebaseConfig.apiKey!,
    authDomain: rawFirebaseConfig.authDomain!,
    projectId: rawFirebaseConfig.projectId!,
    storageBucket: rawFirebaseConfig.storageBucket!,
    messagingSenderId: rawFirebaseConfig.messagingSenderId!,
    appId: rawFirebaseConfig.appId!,
    measurementId: rawFirebaseConfig.measurementId,
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
