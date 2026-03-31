import * as admin from 'firebase-admin';

if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Handle newlines in the private key correctly
                privateKey: process.env.FIREBASE_PRIVATE_KEY 
                    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                    : undefined,
            })
        });
    } catch (error) {
        console.error('Firebase admin initialization error', error);
    }
}

// Ensure the build doesn't crash if envs are missing during static generation
export const adminDb = process.env.FIREBASE_PROJECT_ID ? admin.firestore() : null;
export const adminAuth = process.env.FIREBASE_PROJECT_ID ? admin.auth() : null;
export const adminStorage = process.env.FIREBASE_PROJECT_ID ? admin.storage() : null;
