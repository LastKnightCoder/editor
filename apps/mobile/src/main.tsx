import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

type ErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  public constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[mobile-ui] render error", error, info);
  }

  private resetError = () => {
    this.setState({ error: null });
  };

  public render(): React.ReactNode {
    if (this.state.error) {
      const stack = this.state.error.stack ?? "";
      return (
        <main className="min-h-screen px-4 py-6">
          <section className="mx-auto w-full max-w-md rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-sm">
            <h1 className="text-base font-semibold">页面渲染异常</h1>
            <p className="mt-2 text-sm break-all">{this.state.error.message}</p>
            <button
              type="button"
              onClick={this.resetError}
              className="mt-3 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
            >
              重试渲染
            </button>
            {import.meta.env.DEV && stack ? (
              <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-slate-700">
                {stack}
              </pre>
            ) : null}
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
