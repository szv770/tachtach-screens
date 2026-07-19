import { useState, useEffect } from 'react';

export function useMessages(initialMessages) {
  const [messages, setMessages] = useState(initialMessages || []);

  // Update when new messages arrive via SSE
  useEffect(() => {
    if (initialMessages) setMessages(initialMessages);
  }, [initialMessages]);

  // Auto-remove expired messages every second
  useEffect(() => {
    const id = setInterval(() => {
      setMessages(prev => prev.filter(m => {
        if (!m.expiresAt) return true; // manual dismiss — stays
        return new Date(m.expiresAt) > new Date();
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const banners = messages.filter(m => m.type === 'banner');
  const boards = messages.filter(m => m.type === 'board');
  const takeovers = messages.filter(m => m.type === 'takeover');

  return { messages, setMessages, banners, boards, takeovers };
}
