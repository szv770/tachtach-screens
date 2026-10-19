import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/manrope';
import '@fontsource-variable/rubik';
import './styles/admin-theme.css';
import './styles/admin-tokens.js';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Lets the admin install to the phone's home screen and run full-screen.
// Scoped to /admin/ even though the file is served from the root, since the
// default service worker scope is the directory containing the script URL.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/admin/' }).catch((err) => {
      console.warn('[admin] service worker registration failed:', err.message);
    });
  });
}
