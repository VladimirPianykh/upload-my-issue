import { Component } from "react";

// overview, раздел 2: непредвиденные ошибки не должны ронять интерфейс в
// нерабочее состояние. React сам по себе не даёт восстановиться после
// ошибки рендера без ErrorBoundary - без него всё дерево размонтируется в
// пустой экран.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopy = () => {
    const { error } = this.state;
    const text = `${error?.message || String(error)}\n${error?.stack || ""}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="error-boundary-fallback">
        <h2>Something went wrong</h2>
        <p>An unexpected error occurred. You can reload the app to continue.</p>
        <div className="error-boundary-actions">
          <button className="btn btn-primary" onClick={this.handleReload}>Reload</button>
          <button className="btn" onClick={this.handleCopy}>Copy error</button>
        </div>
      </div>
    );
  }
}
