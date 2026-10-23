import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initPerfObservers } from "./utils/perf";
// 方案 B：内置 MiSans（离线可用；先于全局样式加载）。
// 注意各字面声明的字重是 330/380/520/630/700——Heavy(700) 必须加载，
// 否则 font-extrabold(800) 会回落到更细的 Bold(630) 字面，标题「不黑」
import "misans/lib/Normal/MiSans-Regular.min.css";
import "misans/lib/Normal/MiSans-Medium.min.css";
import "misans/lib/Normal/MiSans-Semibold.min.css";
import "misans/lib/Normal/MiSans-Bold.min.css";
import "misans/lib/Normal/MiSans-Heavy.min.css";
import "./styles.css";

type ErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
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
          <section className="bg-tag-5-soft text-danger shadow-card mx-auto w-full max-w-md rounded-3xl p-4">
            <h1 className="text-base font-semibold">页面渲染异常</h1>
            <p className="mt-2 break-all text-sm">{this.state.error.message}</p>
            <button
              type="button"
              onClick={this.resetError}
              className="bg-accent shadow-lift text-ink-inverse mt-3 rounded-full px-3.5 py-2 text-sm font-bold"
            >
              重试渲染
            </button>
            {import.meta.env.DEV && stack ? (
              <pre className="bg-surface text-ink-2 mt-3 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-xs">
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

// slate-react 补丁内置调试日志（__TAU_SLATE_DEBUG），需要排查 Android 选区问题时
// 在此设为 true 并打 debug 包，用法见 docs/slate-react-Android光标修复与补丁维护指南.md

initPerfObservers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
