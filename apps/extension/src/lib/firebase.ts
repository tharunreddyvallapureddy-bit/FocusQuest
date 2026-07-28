import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
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
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBsL-59WgNG9uiqVYnF1wRfBD0hXqQhcs8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "focus-quest-3c87c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "focus-quest-3c87c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "focus-quest-3c87c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "942832286654",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:942832286654:web:d4b7b441478b33c018d7ef",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-5X4B07PR47",
};

// Initialize Firebase App singleton
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Safe Analytics initialization for browser extensions
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

// Authentication & Firestore Helpers
export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  addDoc,
  query,
  where,
};
export type { User };

// Firestore Profile Helper (Student Users Only)
export async function syncProfileToFirestore(
  userId: string,
  profile: {
    username?: string;
    name?: string;
    email?: string;
    mobileNumber?: string;
    upiId?: string;
    avatarSeed?: string;
    customAvatarUrl?: string;
    focusMode?: boolean;
    xp: number;
    hp: number;
    maxHp: number;
    gold: number;
    level: number;
    isDead: boolean;
    isAdmin?: boolean;
  }
) {
  try {
    if (!userId) return;

    const email = (profile.email || "").toLowerCase();
    const username = (profile.username || profile.name || "").toLowerCase();
    const isAdmin =
      profile.isAdmin === true ||
      email === "vallapureddytharunreddy6281@gmail.com" ||
      username === "tharun" ||
      userId === "admin_tharun" ||
      userId.includes("vallapureddytharunreddy6281");

    // If Admin account, sync strictly to 'admin_tharun' document and DO NOT create a student user document!
    if (isAdmin) {
      await syncAdminProfileToFirestore(profile);
      
      // Clean up legacy student user document if it exists in Firestore
      try {
        const legacyDocKey = userId || `user_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
        if (legacyDocKey !== "admin_tharun") {
          await deleteDoc(doc(db, "profiles", legacyDocKey));
          console.log("[Firebase] Successfully deleted legacy student document for Admin:", legacyDocKey);
        }
      } catch (e) {
        // ignore delete error if document doesn't exist
      }
      return;
    }

    const userRef = doc(db, "profiles", userId);
    await setDoc(
      userRef,
      {
        ...profile,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`[Firebase] Profile synced successfully for UID: ${userId}`);
  } catch (err) {
    console.warn("[Firebase] Profile sync error:", err);
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
    await addDoc(logsRef, {
      userId,
      ...activity,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[Firebase] Activity log error:", err);
  }
}

// Save Payout Request for Admin Approval in Firestore
export async function savePayoutRequestToFirestore(payout: {
  userId: string;
  username: string;
  name?: string;
  email?: string;
  mobileNumber?: string;
  upiId: string;
  goldAmount: number;
  inrValue: string;
  status: string;
}) {
  try {
    const payoutsCol = collection(db, "payout_requests");
    const docRef = await addDoc(payoutsCol, {
      ...payout,
      createdAt: new Date().toISOString(),
    });
    console.log("[Firebase] Payout request saved with ID:", docRef.id, payout);
    return docRef.id;
  } catch (err) {
    console.warn("[Firebase] Error saving payout request:", err);
    return null;
  }
}

// Save / Sync Admin Profile Details strictly to 'admin_tharun' document in Firestore
export async function syncAdminProfileToFirestore(adminDetails?: any) {
  try {
    const adminRef = doc(db, "profiles", "admin_tharun");
    await setDoc(
      adminRef,
      {
        userId: "admin_tharun",
        username: "Tharun",
        name: "Vallapureddy Tharun Reddy",
        email: "vallapureddytharunreddy6281@gmail.com",
        role: "ADMIN",
        isAdmin: true,
        hp: adminDetails?.hp ?? 300,
        maxHp: adminDetails?.maxHp ?? 300,
        gold: adminDetails?.gold ?? adminDetails?.coins ?? 0,
        xp: adminDetails?.xp ?? adminDetails?.intellectXp ?? 0,
        mobileNumber: adminDetails?.mobileNumber || "75692 00917",
        upiId: adminDetails?.upiId || "7569200917@upi",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Also attempt cleanup of user_vallapureddytharunreddy6281_gmail_com
    try {
      await deleteDoc(doc(db, "profiles", "user_vallapureddytharunreddy6281_gmail_com"));
    } catch (e) {
      // ignore if already deleted
    }

    console.log("[Firebase] Admin profile synced to 'admin_tharun' in Firestore!");
  } catch (err) {
    console.warn("[Firebase] Error syncing admin profile:", err);
  }
}

// Immediately ensure Admin details exist in Firestore on initialization
syncAdminProfileToFirestore();
