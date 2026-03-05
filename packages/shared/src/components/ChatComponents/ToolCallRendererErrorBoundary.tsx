import React from "react";

interface ToolCallRendererErrorBoundaryProps {
  toolName: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ToolCallRendererErrorBoundaryState {
  hasError: boolean;
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
    console.error(
      `[ToolCallRenderer] Custom renderer for "${this.props.toolName}" crashed`,
      error,
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default ToolCallRendererErrorBoundary;
