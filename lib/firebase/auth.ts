import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
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

export async function signInWithGoogle(): Promise<User> {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured for sign-in.");
  }

  const result = await signInWithPopup(requireAuth(), googleProvider);
  return result.user;
}

export async function signOutCurrentUser(): Promise<void> {
  if (!isFirebaseConfigured) {
    return;
  }

  await signOut(requireAuth());
}
