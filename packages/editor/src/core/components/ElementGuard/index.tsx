import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { useSlateStatic, type RenderElementProps } from "slate-react";

/**
 * 元素渲染的错误隔离与未知节点占位（01 §5.2、ER-006）。
 *
 * 两种占位都保留 Slate 的 `attributes` 与 `children`：DOM ↔ 节点映射不断，选区不丢；
 * 节点数据不动，保存时原样写回。未知节点在内核里按 void 处理（extensionGuard.ts），
 * 所以 children 只是 Slate 的占位文本，放进隐藏容器即可。
 */

interface PlaceholderProps {
  props: RenderElementProps;
  message: string;
  title: string;
}

function ElementPlaceholder({ props, message, title }: PlaceholderProps) {
  const editor = useSlateStatic();
  const inline = editor.isInline(props.element);
  const Tag = inline ? "span" : "div";
  return (
    <Tag
      {...props.attributes}
      contentEditable={false}
      data-element-placeholder={props.element.type}
      title={title}
      className={
        inline
          ? "mx-[0.125em] inline-flex items-center gap-[0.375em] rounded-[0.375em] border border-dashed border-[var(--ed-border)] px-[0.375em] align-baseline text-[0.875em] text-[var(--ed-text-tertiary)]"
          : "my-[0.375em] flex items-center gap-[0.5em] rounded-[0.5em] border border-dashed border-[var(--ed-border)] bg-[var(--ed-bg-sunken)] px-[0.75em] py-[0.5em] text-[0.8125em] text-[var(--ed-text-tertiary)]"
      }
    >
      <i className="h-[0.4375em] w-[0.4375em] flex-none rounded-full bg-[var(--ed-warn)]" />
      <span>{message}</span>
      <span style={{ display: "none" }}>{props.children}</span>
    </Tag>
  );
}

/** kit 没注册该类型时的只读占位 */
/** 不露出节点类型名：用户不必知道这块内容来自哪个插件 */
export function UnknownElement(props: RenderElementProps) {
  return (
    <ElementPlaceholder
      props={props}
      message="此处的内容在当前编辑器中无法显示"
      title="内容已原样保留，在支持该类型的编辑器中打开即可查看"
    />
  );
}

type ElementRenderer = (props: RenderElementProps) => ReactElement | undefined;

interface BoundaryProps {
  props: RenderElementProps;
  render: ElementRenderer;
  onError: (type: string, error: unknown) => void;
}

/** 扩展的 render 可能直接调用 hook，须在函数组件里调用，不能放进边界的 class render */
function RenderByExtension({
  props,
  render,
}: {
  props: RenderElementProps;
  render: ElementRenderer;
}) {
  return render(props) ?? <UnknownElement {...props} />;
}

interface BoundaryState {
  failed: boolean;
}

/**
 * 包住单个元素的扩展渲染。出错后停在占位，直到该节点数据变化（例如撤销、远端更新）再重试，
 * 否则一个稳定复现的渲染错误会在每次重渲染时反复抛出。
 */
export class ElementErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };
  private failedElement: unknown = null;

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.failedElement = this.props.props.element;
    this.props.onError(this.props.props.element.type, error);
  }

  componentDidUpdate() {
    if (
      this.state.failed &&
      this.failedElement &&
      this.failedElement !== this.props.props.element
    ) {
      this.failedElement = null;
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    const { props, render } = this.props;
    if (this.state.failed) {
      return (
        <ElementPlaceholder
          props={props}
          message={`「${props.element.type}」渲染失败，内容已保留`}
          title="该扩展渲染出错，数据未受影响"
        />
      );
    }
    return <RenderByExtension props={props} render={render} />;
  }
}
