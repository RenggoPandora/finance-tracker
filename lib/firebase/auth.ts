import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { isFirebaseConfigured, requireAuth } from "@/lib/firebase/client";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const AUTH_PERSISTENCE_ERROR =
  "Browser blocks secure session storage for Google sign-in. Disable private mode and allow cookies, then try again.";

export function subscribeToAuthState(
  callback: (user: User | null) => void,
): () => void {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(requireAuth(), callback);
}

async function setBestAuthPersistence(auth: Auth): Promise<void> {
  try {
    await setPersistence(auth, browserLocalPersistence);
    return;
  } catch {
    // Fall through to session persistence.
  }

  try {
    await setPersistence(auth, browserSessionPersistence);
    return;
  } catch {
    throw new Error(AUTH_PERSISTENCE_ERROR);
  }
}

export async function ensureAuthPersistence(): Promise<void> {
  if (!isFirebaseConfigured) {
    return;
  }

  await setBestAuthPersistence(requireAuth());
}

export async function resolveRedirectSignInResult(): Promise<User | null> {
  if (!isFirebaseConfigured) {
    return null;
  }

  const auth = requireAuth();
  await setBestAuthPersistence(auth);
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export async function signInWithGoogle(): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured for sign-in.");
  }

  const auth = requireAuth();
  await setBestAuthPersistence(auth);
  await signInWithRedirect(auth, googleProvider);
}

export async function signOutCurrentUser(): Promise<void> {
  if (!isFirebaseConfigured) {
    return;
  }

  await signOut(requireAuth());
}
