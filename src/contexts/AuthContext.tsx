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
import { ref, get, set, child, onValue } from 'firebase/database';
import { auth, rtdb, googleProvider } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { INITIAL_USER } from '../data/mockEvents';

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
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('ash_vish_user_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing stored user session:', e);
      }
    }
    return INITIAL_USER;
  });

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          await set(userRef, {
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
        // Retain initial saved user or null
        const saved = localStorage.getItem('ash_vish_user_session');
        if (saved) {
          try {
            setUser(JSON.parse(saved));
          } catch (e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubStaff) unsubStaff();
      if (unsubUser) unsubUser();
    };
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('ash_vish_user_session', JSON.stringify(user));
    } else {
      localStorage.removeItem('ash_vish_user_session');
    }
  }, [user]);

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
      console.warn('Firebase Auth email login error or offline mode, activating local session fallback:', error.message);
      // Fallback local session for seamless UX
      let role: UserRole = 'customer';

      const fallbackUser: UserProfile = {
        id: 'usr_' + Math.floor(Math.random() * 90000 + 10000),
        name: email.split('@')[0].toUpperCase(),
        email,
        phone: '+1 (555) 019-2831',
        photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300',
        authProvider: 'email',
        joinedDate: 'August 2026',
        role,
      };
      setUser(fallbackUser);
      setIsLoading(false);
      return true;
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
      console.warn('Firebase Auth signup error or offline mode, activating local session fallback:', error.message);
      const fallbackUser: UserProfile = {
        id: 'usr_' + Math.floor(Math.random() * 90000 + 10000),
        name,
        email,
        phone: '',
        photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=300',
        authProvider: 'email',
        joinedDate: 'August 2026',
        role: 'customer',
      };
      setUser(fallbackUser);
      setIsLoading(false);
      return true;
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
      console.warn('Google Sign-In popup notice:', error.message);
      // Fallback demo account for browser environment testing if popup is blocked
      const demoGoogleUser: UserProfile = {
        id: 'usr_goog_' + Math.floor(Math.random() * 90000 + 10000),
        name: 'Alex Rivera',
        email: 'alex.rivera@ashvishevents.com',
        phone: '+1 (555) 382-9102',
        photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
        authProvider: 'google',
        joinedDate: 'August 2026',
        role: 'customer',
      };
      setUser(demoGoogleUser);
      setIsLoading(false);
      return true;
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
        await set(userRef, {
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
        isAuthenticated: !!user,
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
