'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getUserDoc } from '../lib/db';
import { useStore } from '../store/useStore';
import type { AppUser } from '../types';

interface AuthContextType {
  firebaseUser: User | null;
  appUser:      AppUser | null;
  loading:      boolean;
  login:        (email: string, password: string) => Promise<void>;
  logout:       () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser,      setAppUser]      = useState<AppUser | null>(null);
  const [loading,      setLoading]      = useState(true);
  const setStoreUser = useStore(s => s.setUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const userData = await getUserDoc(fbUser.uid);
          setAppUser(userData);
          setStoreUser(userData);
        } catch (e) {
          console.error('Error fetching user doc:', e);
        }
      } else {
        setAppUser(null);
        setStoreUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    console.log('Login success:', result.user.uid);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
