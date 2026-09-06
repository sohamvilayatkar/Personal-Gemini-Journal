import React from 'react';
import { AuthProvider } from './components/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { JournalChatPage } from './pages/JournalChatPage';

export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <JournalChatPage />
      </ProtectedRoute>
    </AuthProvider>
  );
}
