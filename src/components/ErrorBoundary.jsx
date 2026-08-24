import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            padding: '24px',
            background: 'var(--color-bg, #F2F1EC)',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <div style={{ fontSize: '28px' }}>⚠️</div>
          <h1
            style={{
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '18px',
              color: 'var(--color-label, #0C0F14)',
              margin: 0,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-label-secondary, rgba(12,15,20,0.55))',
              maxWidth: '360px',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '8px',
              padding: '8px 20px',
              borderRadius: '10px',
              border: 'none',
              background: '#1A6EFF',
              color: '#fff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <details
            style={{
              marginTop: '4px',
              fontSize: '11px',
              color: 'var(--color-label-tertiary, rgba(12,15,20,0.35))',
              maxWidth: '480px',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              cursor: 'pointer',
            }}
          >
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            {this.state.error?.stack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
