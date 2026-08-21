// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE CLIENT SDK — Browser-Side Authentication & Firestore
// ═══════════════════════════════════════════════════════════════════════════
// Used by portal and admin pages for Firebase Auth (Email/Password).
// This module ONLY runs in the browser. Server-side verification uses
// adminAuth.verifyIdToken() from lib/firebase/admin.js.
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Prevent re-initialization during HMR in development
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
