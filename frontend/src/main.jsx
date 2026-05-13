import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from '@/contexts/AuthContext';
import './index.css';

/** Service worker & manifest diisi oleh vite-plugin-pwa saat build (injectRegister: auto). */

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="top-right" toastOptions={{ duration: 4000, className: 'text-sm' }} />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
