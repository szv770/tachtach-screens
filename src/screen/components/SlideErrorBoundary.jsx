import React from 'react';

/**
 * Error boundary for the kiosk slide area.
 *
 * One broken slide (bad data, a ReferenceError like the old `creditOpacity`
 * one in SlideCarousel) used to unmount the whole React tree and white-screen
 * the TV until someone restarted the kiosk. Now the failing slide renders
 * nothing, the error is logged, and `onError` is called so the caller can
 * skip ahead to the next slide.
 *
 * `resetKey` — when it changes (i.e. the slide changed), the boundary clears
 * its error and tries rendering again. Using a prop instead of a React `key`
 * keeps the carousel mounted so its exit/enter animations still work.
 */
export default class SlideErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[SlideErrorBoundary] Slide failed to render — skipping it:', this.props.resetKey, error, info?.componentStack);
    try { this.props.onError?.(error); } catch { /* never throw from here */ }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}
