/**
 * AuthProvider Context
 * Centralized authentication state management
 * 
 * Features:
 * - Automatic session verification on mount
 * - Session expiry event handling
 * - Type-safe context
 */
import React, { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  useCallback,
  useMemo 
} from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../api/authService';
import type { 
  User, 
  AuthContextType, 
  LoginRequest, 
  SignupRequest 
} from '../types/api.types';

// ============================================================================
// Context Creation
// ============================================================================
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// AuthProvider Component
// ============================================================================
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  // Derived state
  const isAuthenticated = useMemo(() => user !== null, [user]);

  /**
   * Verify current session on mount
   * Checks if valid access token exists in cookies
   */
  const verifySession = useCallback(async (): Promise<void> => {
    try {
      const response = await authService.getCurrentUser();
      if (response.success && response.user) {
        setUser(response.user);
      }
    } catch {
      // No valid session - user remains null
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Handle login
   */
  const login = useCallback(async (credentials: LoginRequest): Promise<void> => {
    const response = await authService.login(credentials);
    if (response.success && response.user) {
      setUser(response.user);
    }
  }, []);

  /**
   * Handle signup
   */
  const signup = useCallback(async (data: SignupRequest): Promise<void> => {
    const response = await authService.signup(data);
    if (response.success && response.user) {
      setUser(response.user);
    }
  }, []);

  /**
   * Handle logout
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Continue with local cleanup even if API fails
    } finally {
      setUser(null);
      navigate('/login');
    }
  }, [navigate]);

  /**
   * Refresh authentication
   * Returns true if refresh was successful
   */
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await authService.refresh();
      return response.success;
    } catch {
      return false;
    }
  }, []);

  /**
   * Handle session expiry event from axios interceptor
   */
  useEffect(() => {
    const handleSessionExpired = (): void => {
      setUser(null);
      navigate('/login');
    };

    window.addEventListener('auth:sessionExpired', handleSessionExpired);
    
    return () => {
      window.removeEventListener('auth:sessionExpired', handleSessionExpired);
    };
  }, [navigate]);

  /**
   * Verify session on mount
   */
  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      signup,
      logout,
      refreshAuth,
    }),
    [user, isAuthenticated, isLoading, login, signup, logout, refreshAuth]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// ============================================================================
// Custom Hook
// ============================================================================
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

export default AuthProvider;
