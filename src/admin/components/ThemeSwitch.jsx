import React, { useState, useEffect } from 'react';
import SegmentedControl from './ui/SegmentedControl.jsx';
import { getAdminThemeName, setAdminTheme } from '../styles/admin-tokens.js';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light / Dark / System. Applies instantly (no reload) and is remembered on this device. */
export default function ThemeSwitch({ style, fill }) {
  const [theme, setTheme] = useState(getAdminThemeName);
  useEffect(() => {
    const on = () => setTheme(getAdminThemeName());
    window.addEventListener('tt-admin-theme', on);
    return () => window.removeEventListener('tt-admin-theme', on);
  }, []);
  return <SegmentedControl ariaLabel="Appearance" options={OPTIONS} value={theme} onChange={setAdminTheme} style={style} fill={fill} />;
}
