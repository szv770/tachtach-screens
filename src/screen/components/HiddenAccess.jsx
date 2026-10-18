import React, { useRef } from 'react';

/**
 * Five taps on the top-left corner open the normal sign-in page in a new
 * window. (It used to pop up its own password box; with several people and
 * 2-step codes the real login page is the one place that handles all of it.)
 */
export default function HiddenAccess() {
  const clickTimes = useRef([]);

  const handleClick = () => {
    const now = Date.now();
    clickTimes.current.push(now);
    // Keep only clicks within last 2 seconds
    clickTimes.current = clickTimes.current.filter(t => now - t < 2000);
    if (clickTimes.current.length >= 5) {
      clickTimes.current = [];
      window.open('/login', '_blank');
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '10px',
        height: '10px',
        zIndex: 9999,
        cursor: 'default',
      }}
    />
  );
}
