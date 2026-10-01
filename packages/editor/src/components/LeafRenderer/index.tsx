import { Component, createElement, Suspense, type ComponentType, type ReactNode } from "react";
import type { RenderLeafProps } from "slate-react";
import type { MarkRenderProps, RegisteredMark } from "../../api/marks";

interface BoundaryProps extends MarkRenderProps {
  render: ComponentType<MarkRenderProps>;
  owner: string;
  resetKey: unknown;
  onError: (owner: string, error: unknown) => void;
}

class MarkBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  private failure: { leaf: unknown; resetKey: unknown } | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.failure = { leaf: this.props.leaf, resetKey: this.props.resetKey };
    this.props.onError(this.props.owner, error);
  }

  componentDidUpdate() {
    if (
      this.state.failed &&
      this.failure &&
      (this.failure.leaf !== this.props.leaf || this.failure.resetKey !== this.props.resetKey)
    ) {
      this.failure = null;
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    const { leaf, children, render } = this.props;
    if (this.state.failed) return children;
    return <Suspense fallback={children}>{createElement(render, { leaf, children })}</Suspense>;
  }
}

interface LeafRendererProps extends Pick<RenderLeafProps, "attributes" | "leaf" | "children"> {
  marks: readonly RegisteredMark[];
  wrapper?: ComponentType<MarkRenderProps>;
  onError: (owner: string, error: unknown) => void;
}

const preventDrag = (event: React.DragEvent) => event.preventDefault();

export default function LeafRenderer({
  attributes,
  leaf,
  children,
  marks,
  wrapper,
  onError,
}: LeafRendererProps) {
  let content = children;
  const values = leaf as unknown as Record<string, unknown>;
  for (const { owner, spec } of marks) {
    if (
      !spec.keys.some(
        key => Object.prototype.hasOwnProperty.call(values, key) && values[key] !== undefined
      )
    )
      continue;
    content = (
      <MarkBoundary
        key={JSON.stringify([owner, spec.id])}
        leaf={leaf}
        render={spec.render}
        owner={owner}
        resetKey={spec}
        onError={onError}
      >
        {content}
      </MarkBoundary>
    );
  }
  if (wrapper) {
    content = (
      <MarkBoundary
        leaf={leaf}
        render={wrapper}
        owner="host.leaf-wrapper"
        resetKey={wrapper}
        onError={onError}
      >
        {content}
      </MarkBoundary>
    );
  }
  return (
    <span {...attributes} className="pl-[0.1px]" onDragStart={preventDrag} onDrop={preventDrag}>
      {content}
    </span>
  );
}
