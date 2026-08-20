import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile as updateFirebaseProfile
} from 'firebase/auth';
import { ref, get, update, onValue } from 'firebase/database';
import { auth, rtdb, googleProvider } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';

const DEMO_ACCOUNT_EMAILS = new Set([
  'alex.rivera@example.com',
  'alex.rivera@ashvishevents.com',
]);

const isDemoAccount = (email?: string | null) =>
  Boolean(email && DEMO_ACCOUNT_EMAILS.has(email.trim().toLowerCase()));

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<boolean>;
  signupWithEmail: (name: string, email: string, pass: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Legacy builds persisted a local demo profile and treated it as authenticated
  // after refresh. Firebase is now the sole session authority.
  useEffect(() => {
    localStorage.removeItem('ash_vish_user_session');
  }, []);

  // Sync profile from Realtime Database users/$uid and staff/$uid
  // Sync profile from Realtime Database users/$uid and staff/$uid
  const fetchAndSyncUserProfile = async (fbUser: FirebaseUser): Promise<UserProfile> => {
    let resolvedRole: UserRole = 'customer';

    try {
      // 1. Check if user uid exists in staff/$uid node (read-only node set by console)
      const staffRef = ref(rtdb, `staff/${fbUser.uid}`);
      const staffSnapshot = await get(staffRef);
      if (staffSnapshot.exists()) {
        const staffData = staffSnapshot.val();
        if (staffData.role === 'admin' || staffData.role === 'ticket_counter') {
          resolvedRole = staffData.role;
        }
      } else {
        // 2. Check users/$uid/role
        const userRef = ref(rtdb, `users/${fbUser.uid}`);
        const userSnapshot = await get(userRef);
        if (userSnapshot.exists()) {
          const uData = userSnapshot.val();
          if (uData.role) {
            resolvedRole = uData.role;
          }
        } else {
          // Initialize user document in Realtime Database on first login
          const defaultRole = 'customer';
          await update(userRef, {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Member',
            email: fbUser.email || '',
            role: defaultRole,
            createdAt: new Date().toISOString()
          });
          resolvedRole = defaultRole;
        }
      }
    } catch (err) {
      console.warn('[Firebase RTDB Sync Note] Could not connect to RTDB, using fallback role logic:', err);
    }

      // Mint Firebase custom claims so the ID token carries { admin: true,
      // role } — the RTDB security rules inspect auth.token for staff reads.
      if (resolvedRole !== 'customer') {
        try {
          const claimsRes = await fetch('/api/auth/claims', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await fbUser.getIdToken()}` }
          });
          if (claimsRes.ok) {
            // Force a fresh ID token so the new claims are embedded.
            await fbUser.getIdToken(true);
          }
        } catch (e) {
          console.warn('[AUTH] claims mint skipped:', e);
        }
      }
    const userProfile: UserProfile = {
      id: fbUser.uid,
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Ash-vish Member',
      email: fbUser.email || '',
      phone: fbUser.phoneNumber || '+1 (555) 019-2831',
      photoUrl: fbUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300',
      authProvider: fbUser.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email',
      joinedDate: 'August 2026',
      role: resolvedRole,
    };

    return userProfile;
  };

  useEffect(() => {
    let unsubStaff: (() => void) | null = null;
    let unsubUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsLoading(true);

      // Clean up previous listeners
      if (unsubStaff) { unsubStaff(); unsubStaff = null; }
      if (unsubUser) { unsubUser(); unsubUser = null; }

      if (fbUser) {
        if (isDemoAccount(fbUser.email)) {
          // A legacy demo identity must not survive as a valid customer session.
          // This signs it out only; permanent Firebase Auth deletion is handled
          // separately with explicit approval and administrator credentials.
          await signOut(auth).catch(() => undefined);
          setFirebaseUser(null);
          setUser(null);
          localStorage.removeItem('ash_vish_user_session');
          setIsLoading(false);
          return;
        }
        setFirebaseUser(fbUser);
        const profile = await fetchAndSyncUserProfile(fbUser);
        setUser(profile);

        // Real-time listener for user profile/role details
        const userRef = ref(rtdb, `users/${fbUser.uid}`);
        unsubUser = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const uData = snapshot.val();
            setUser(prev => {
              if (!prev) return null;
              // Check if actual fields changed to avoid unnecessary re-renders
              const updatedRole = uData.role || prev.role;

              if (
                prev.name === uData.name &&
                prev.email === uData.email &&
                prev.phone === uData.phone &&
                prev.role === updatedRole
              ) {
                return prev;
              }
              return {
                ...prev,
                name: uData.name || prev.name,
                email: uData.email || prev.email,
                phone: uData.phone || prev.phone,
                role: updatedRole
              };
            });
          }
        });

        // Real-time listener for staff node (higher authority than standard users collection)
        const staffRef = ref(rtdb, `staff/${fbUser.uid}`);
        unsubStaff = onValue(staffRef, (snapshot) => {
          if (snapshot.exists()) {
            const staffData = snapshot.val();
            if (staffData && (staffData.role === 'admin' || staffData.role === 'ticket_counter')) {
              setUser(prev => prev ? { ...prev, role: staffData.role } : null);
            }
          } else {
            // Re-verify against users table if staff node is deleted
            const userRef = ref(rtdb, `users/${fbUser.uid}`);
            get(userRef).then((uSnap) => {
              const uData = uSnap.val();
              const targetRole = (uData && uData.role) || 'customer';
              setUser(prev => prev ? { ...prev, role: targetRole } : null);
            }).catch(() => {});
          }
        });
      } else {
        setFirebaseUser(null);
        setUser(null);
        localStorage.removeItem('ash_vish_user_session');
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubStaff) unsubStaff();
      if (unsubUser) unsubUser();
    };
  }, []);

  // Login with Email
  const loginWithEmail = async (email: string, pass: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const profile = await fetchAndSyncUserProfile(userCredential.user);
      setUser(profile);
      setIsLoading(false);
      return true;
    } catch (error: any) {
      console.warn('Firebase Auth email login failed:', error.message);
      setIsLoading(false);
      return false;
    }
  };

  // Signup with Email
  const signupWithEmail = async (name: string, email: string, pass: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      if (userCredential.user) {
        await updateFirebaseProfile(userCredential.user, { displayName: name });
      }
      const profile = await fetchAndSyncUserProfile(userCredential.user);
      setUser(profile);
      setIsLoading(false);
      return true;
    } catch (error: any) {
      console.warn('Firebase Auth signup failed:', error.message);
      setIsLoading(false);
      return false;
    }
  };

  // Login with Google (VoltSetu Pattern with Capacitor Native Platform Guard)
  const loginWithGoogle = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Check if running in native Capacitor platform (Android/iOS)
      let isNative = false;
      try {
        // @ts-ignore
        if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform()) {
          isNative = true;
        }
      } catch (e) {
        isNative = false;
      }

      if (isNative) {
        console.log('[Native Mobile] Performing Capacitor Google Sign-In Plugin authentication');
      }

      // Web Popup Authentication
      const result = await signInWithPopup(auth, googleProvider);
      const profile = await fetchAndSyncUserProfile(result.user);
      setUser(profile);
      setIsLoading(false);
      return true;
    } catch (error: any) {
      console.warn('Google Sign-In failed:', error.message);
      setIsLoading(false);
      return false;
    }
  };

  // Password reset
  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      console.warn('Password reset notice:', err.message);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setUser(null);
    setFirebaseUser(null);
    localStorage.removeItem('ash_vish_user_session');
  };

  // Update profile
  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const updated = { ...user, ...data };
    setUser(updated);

    if (firebaseUser) {
      try {
        const userRef = ref(rtdb, `users/${firebaseUser.uid}`);
        await update(userRef, {
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          role: updated.role
        });
      } catch (e) {
        console.warn('Could not sync profile update to database:', e);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAuthenticated: !!firebaseUser,
        isLoading,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        resetPassword,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
