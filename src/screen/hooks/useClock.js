import { useState, useEffect } from 'react';

export function useClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Format: "10:23" with leading zero for consistency
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const formatted = `${h12}:${String(minutes).padStart(2, '0')}`;
  const seconds = time.getSeconds();

  return { time, formatted, ampm, hours, minutes, seconds };
}
