// Firebase Integration Layer for Focus Quest (Firestore & Firebase Auth)
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSy_YOUR_FIREBASE_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "focusquest-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "focusquest-project",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "focusquest-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456",
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Authentication Helpers
export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };
export type { User };

// Firestore Profile Helper
export async function syncProfileToFirestore(
  userId: string,
  profile: {
    username?: string;
    avatarSeed?: string;
    xp: number;
    hp: number;
    maxHp: number;
    gold: number;
    level: number;
    isDead: boolean;
  }
) {
  try {
    const userRef = doc(db, "profiles", userId);
    await setDoc(
      userRef,
      {
        ...profile,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("[Firebase] Profile sync fallback:", err);
  }
}

// Load Profile from Firestore
export async function loadProfileFromFirestore(userId: string) {
  try {
    const userRef = doc(db, "profiles", userId);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      return snapshot.data();
    }
  } catch (err) {
    console.warn("[Firebase] Error fetching profile:", err);
  }
  return null;
}

// Log Focus Activity to Firestore
export async function logActivityToFirestore(
  userId: string,
  activity: {
    domain: string;
    category: "educational" | "distracting" | "neutral";
    durationSeconds: number;
  }
) {
  try {
    const logsRef = collection(db, "activity_logs");
    await setDoc(doc(logsRef), {
      userId,
      ...activity,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[Firebase] Activity log error:", err);
  }
}
