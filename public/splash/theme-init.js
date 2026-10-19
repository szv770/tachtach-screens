/* Apply the saved Light/Dark choice before first paint (no flash). Default = follow the device.
   A file (not inline) so the admin page's Content-Security-Policy can forbid inline scripts. */
try { var t = localStorage.getItem('tachtach-admin-theme-v2'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
