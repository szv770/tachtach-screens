import { useEffect, useRef, useState } from 'react';

/**
 * SSE hook with automatic reconnection, state re-fetch on reconnect,
 * and a polling fallback to catch any missed events.
 *
 * Uses refs for callbacks to prevent React re-renders from
 * tearing down and rebuilding the SSE connection.
 */
export function useSSE(onEvent, onFullState, { enabled = true } = {}) {
  const esRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimer = useRef(null);
  const lastEventTime = useRef(Date.now());
  const [status, setStatus] = useState('disconnected');

  // Store callbacks in refs so the SSE connection doesn't depend on them
  const onEventRef = useRef(onEvent);
  const onFullStateRef = useRef(onFullState);
  onEventRef.current = onEvent;
  onFullStateRef.current = onFullState;

  // Fetch full state from the server
  const fetchFullState = useRef(() => {
    fetch('/api/state')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && onFullStateRef.current) onFullStateRef.current(data); })
      .catch(err => console.error('[SSE] State fetch failed:', err.message));
  });

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      const isPreview = new URLSearchParams(window.location.search).get('preview') === 'true';
      const streamUrl = isPreview ? '/stream?preview=true' : '/stream';
      const es = new EventSource(streamUrl);
      esRef.current = es;

      es.onopen = () => {
        console.log('[SSE] Connected');
        setStatus('connected');
        lastEventTime.current = Date.now();
        fetchFullState.current();
      };

      es.onmessage = (event) => {
        lastEventTime.current = Date.now();
        try {
          const parsed = JSON.parse(event.data);
          onEventRef.current(parsed);
        } catch (err) {
          console.error('[SSE] Parse error:', err);
        }
      };

      es.onerror = () => {
        console.warn('[SSE] Connection lost, reconnecting in 3s...');
        setStatus('reconnecting');
        es.close();
        esRef.current = null;
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    // Polling fallback — re-fetch full state every 5 seconds
    pollTimer.current = setInterval(() => {
      const stale = Date.now() - lastEventTime.current > 20000;
      if (stale && esRef.current) {
        console.warn('[SSE] Stale connection detected, forcing reconnect');
        esRef.current.close();
        esRef.current = null;
        setStatus('reconnecting');
        connect();
        return;
      }
      fetchFullState.current();
    }, 5000);

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []); // Empty deps — connect once, never tear down from re-renders

  return { status };
}
