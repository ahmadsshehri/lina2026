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
import { loadPropertiesForUser, PropertyBasic } from '../lib/userHelpers';
import type { AppUser } from '../types';

interface AuthContextType {
  firebaseUser:      User | null;
  appUser:           AppUser | null;
  properties:        PropertyBasic[];
  activeProperty:    PropertyBasic | null;
  setActiveProperty: (p: PropertyBasic) => void;
  loading:           boolean;
  login:             (email: string, password: string) => Promise<void>;
  logout:            () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser,   setFirebaseUser]   = useState<User | null>(null);
  const [appUser,        setAppUser]        = useState<AppUser | null>(null);
  const [properties,     setProperties]     = useState<PropertyBasic[]>([]);
  const [activeProperty, setActivePropertyState] = useState<PropertyBasic | null>(null);
  const [loading,        setLoading]        = useState(true);
  const setStoreUser = useStore(s => s.setUser);

  const setActiveProperty = (p: PropertyBasic) => {
    setActivePropertyState(p);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedPropertyId', p.id);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const userData = await getUserDoc(fbUser.uid);
          setAppUser(userData);
          setStoreUser(userData);

          if (userData) {
            const props = await loadPropertiesForUser(fbUser.uid, userData.role);
            setProperties(props);

            if (props.length > 0) {
              const savedId = typeof window !== 'undefined'
                ? localStorage.getItem('selectedPropertyId')
                : null;
              const saved = props.find(p => p.id === savedId);
              const selected = saved || props[0];
              setActivePropertyState(selected);
              if (typeof window !== 'undefined') {
                localStorage.setItem('selectedPropertyId', selected.id);
              }
            }
          }
        } catch (e) {
          console.error('AuthContext error:', e);
        }
      } else {
        setAppUser(null);
        setStoreUser(null);
        setProperties([]);
        setActivePropertyState(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      firebaseUser, appUser, properties, activeProperty,
      setActiveProperty, loading, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
