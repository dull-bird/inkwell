import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[Inkwell ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ color: '#b71c1c' }}>Something went wrong</h2>
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, overflow: 'auto' }}>
              {this.state.error.message}
            </pre>
            <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16 }}>
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
