import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  inMemoryPersistence,
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
    // Fall through to in-memory persistence.
  }

  await setPersistence(auth, inMemoryPersistence);
}

export async function resolveRedirectSignInResult(): Promise<User | null> {
  if (!isFirebaseConfigured) {
    return null;
  }

  const result = await getRedirectResult(requireAuth());
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
