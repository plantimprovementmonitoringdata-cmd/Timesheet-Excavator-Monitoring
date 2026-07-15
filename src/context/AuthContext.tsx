import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getDriveToken: () => string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory token cache
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (!isSigningIn && !cachedAccessToken) {
          // If we reloaded the page, we lost the access token in memory.
          // We can't silently get it back with just onAuthStateChanged if the user hasn't explicitly logged in this session
          // However, we wait to see if we need it. 
        }
        setUser(currentUser);
      } else {
        cachedAccessToken = null;
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      setUser(result.user);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    cachedAccessToken = null;
    setUser(null);
  };

  const isAdmin = user?.email === 'plantimprovementmonitoringdata@gmail.com';

  const getDriveToken = () => cachedAccessToken;

  return (
    <AuthContext.Provider value={{ user, isAdmin, login, logout: handleLogout, getDriveToken, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
