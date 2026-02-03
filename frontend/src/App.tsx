/**
 * App Router Configuration
 * Defines all routes with protected route handling
 * Hierarchical Structure: Dashboard > Vault > Subject > Chapter
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedLayout from './components/ProtectedLayout';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VaultListPage from './pages/VaultListPage';
import SubjectListPage from './pages/SubjectListPage';
import ChapterListPage from './pages/ChapterListPage';
import ChapterView from './pages/ChapterView';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected Routes - Hierarchical Content Vault */}
          
          {/* Level 1: Dashboard - Shows all Vaults */}
          <Route
            path="/dashboard"
            element={
              <ProtectedLayout>
                <VaultListPage />
              </ProtectedLayout>
            }
          />

          {/* Level 2: Vault View - Shows Subjects in a Vault */}
          <Route
            path="/vault/:vaultId"
            element={
              <ProtectedLayout>
                <SubjectListPage />
              </ProtectedLayout>
            }
          />

          {/* Level 3: Subject View - Shows Chapters in a Subject */}
          <Route
            path="/subject/:subjectId"
            element={
              <ProtectedLayout>
                <ChapterListPage />
              </ProtectedLayout>
            }
          />

          {/* Level 4: Chapter View - Video Player with Playlist */}
          <Route
            path="/chapter/:chapterId"
            element={
              <ProtectedLayout>
                <ChapterView />
              </ProtectedLayout>
            }
          />

          {/* Default Redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 404 Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
