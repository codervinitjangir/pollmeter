import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            textAlign: 'center',
            background: 'var(--bg-main, #0F172A)',
            color: 'var(--text-main, #F8FAFC)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#94A3B8', maxWidth: '380px', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
            {this.state.error?.message || 'A display issue occurred on this screen.'}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '0.75rem 1.75rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              background: '#6366F1',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
            }}
          >
            ↻ Reload Quiz Screen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
