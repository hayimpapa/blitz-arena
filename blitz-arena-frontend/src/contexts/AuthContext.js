'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { generateGuestName, generateGuestId } from '@/lib/guestNames';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for guest session in localStorage first
    const guestSession = localStorage.getItem('guestSession');
    if (guestSession) {
      try {
        const guestData = JSON.parse(guestSession);
        setUser({ id: guestData.id });
        setProfile({
          id: guestData.id,
          username: guestData.username,
          isGuest: true
        });
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error parsing guest session:', error);
        localStorage.removeItem('guestSession');
      }
    }

    // Check active Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, username) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username
          }
        }
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signInAsGuest = () => {
    const guestId = generateGuestId();
    const guestName = generateGuestName();

    const guestData = {
      id: guestId,
      username: guestName
    };

    // Store in localStorage for session persistence
    localStorage.setItem('guestSession', JSON.stringify(guestData));

    // Set user and profile state
    setUser({ id: guestId });
    setProfile({
      id: guestId,
      username: guestName,
      isGuest: true
    });

    return { data: guestData, error: null };
  };

  const signOut = async () => {
    try {
      // Check if this is a guest session
      const guestSession = localStorage.getItem('guestSession');
      if (guestSession) {
        localStorage.removeItem('guestSession');
        setUser(null);
        setProfile(null);
        return;
      }

      // Otherwise sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInAsGuest,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}