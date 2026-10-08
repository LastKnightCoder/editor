import { Component, createElement, Suspense, type ComponentType, type ReactNode } from "react";
import type { Text } from "slate";
import { useSlateSelector, type RenderLeafProps } from "slate-react";
import type { MarkRenderProps, RegisteredMark } from "../../api/marks";
import { getCaretSpacerTarget, hasCaretSpacer } from "../../utils/caretAffinity";

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

interface LeafRendererProps
  extends
    Pick<RenderLeafProps, "attributes" | "leaf" | "children" | "leafPosition">,
    Partial<Pick<RenderLeafProps, "text">> {
  marks: readonly RegisteredMark[];
  wrapper?: ComponentType<MarkRenderProps>;
  onError: (owner: string, error: unknown) => void;
}

const preventDrag = (event: React.DragEvent) => event.preventDefault();

/**
 * 带标记文本开头的不可编辑占位：光标停在文本开头时隔开前一个文本，让浏览器在 offset 0
 * 处的输入留在本文本内（光标偏向的右侧槽位，见 utils/caretAffinity）。放在标记包装内侧，
 * 光标显示在格式框里。
 */
const CaretSpacer = ({ text }: { text: Text }) => {
  const active = useSlateSelector(editor => getCaretSpacerTarget(editor) === text);
  if (!active) return null;
  return (
    <span contentEditable={false} className="text-[0px]">
      {String.fromCodePoint(160)}
    </span>
  );
};

export default function LeafRenderer({
  attributes,
  leaf,
  text,
  leafPosition,
  children,
  marks,
  wrapper,
  onError,
}: LeafRendererProps) {
  // 零宽占位叶子（leaf.text 为空）与装饰切出的后续叶子不放 spacer
  const spacerText =
    text && leaf.text !== "" && (leafPosition?.start ?? 0) === 0 && hasCaretSpacer(text)
      ? text
      : null;
  let content = spacerText ? (
    <>
      <CaretSpacer text={spacerText} />
      {children}
    </>
  ) : (
    children
  );
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
