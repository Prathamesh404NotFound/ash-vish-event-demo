/// <reference types="vite/client" />
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD3yC_XnRdd2K9-1uP2B_0spI2VcT9VbnI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ashevents-aa490.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://ashevents-aa490-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ashevents-aa490",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ashevents-aa490.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123510874360",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123510874360:web:8123f4bb25d30fa2b55b0d",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-E8H9VLEJFW"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
