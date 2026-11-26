import { useChatUiI18n } from "../../i18n";
import React from "react";

interface ToolCallRendererErrorBoundaryProps {
  toolName: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ToolCallRendererErrorBoundaryState {
  hasError: boolean;
}

function RendererFailureNotice() {
  const { t } = useChatUiI18n();
  return <div className="text-tau-tiny text-ink-3 px-1 py-1.5">{t("tool.rendererFailed")}</div>;
}

class ToolCallRendererErrorBoundary extends React.Component<
  ToolCallRendererErrorBoundaryProps,
  ToolCallRendererErrorBoundaryState
> {
  state: ToolCallRendererErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ToolCallRendererErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[ToolCallRenderer] Custom renderer for "${this.props.toolName}" crashed`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <>
          <RendererFailureNotice />
          {this.props.fallback}
        </>
      );
    }
    return this.props.children;
  }
}

export default ToolCallRendererErrorBoundary;
