import { AppRenderFailure } from "./app/StartupFailure";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { connectMobileI18n, mobileI18n } from "./services/i18n";
import "./utils/console-logger-install";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initPerfObservers } from "./utils/perf";
import "./styles.css";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "./components/toast";
import { installExternalLinkBridge } from "./services/external-links";

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
      return <AppRenderFailure error={this.state.error} onRetry={this.resetError} />;
    }
    return this.props.children;
  }
}

// slate-react 补丁内置调试日志（__TAU_SLATE_DEBUG），需要排查 Android 选区问题时
// 在此设为 true 并打 debug 包，用法见 docs/slate-react-Android光标修复与补丁维护指南.md

initPerfObservers();
const stopI18n = connectMobileI18n();
import.meta.hot?.dispose(stopI18n);

if (isTauri()) {
  const release = installExternalLinkBridge(window, openUrl, message => {
    toast.error(message);
  });
  import.meta.hot?.dispose(release);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <I18nRuntimeProvider runtime={mobileI18n}>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </I18nRuntimeProvider>
);
