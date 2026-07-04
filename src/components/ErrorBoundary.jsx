import { Component } from 'react'

// Last-resort catch for render errors, so the installed PWA never dies to a
// blank white screen - friends get a reload button instead of a broken app.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="auth">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <span className="auth-logo">😵</span>
          <h1>Something went wrong</h1>
          <p className="muted small">
            {String(this.state.error?.message || this.state.error || 'Unknown error')}
          </p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
