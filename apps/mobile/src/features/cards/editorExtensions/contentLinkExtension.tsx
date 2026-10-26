import {
  defineElement,
  defineExtension,
  InlineChromiumBugfix,
  type ElementRenderProps,
} from "@tau/editor";
import { cn } from "@tau/ui";
import { useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Node, Transforms, type Editor, type NodeEntry } from "slate";
import { useFocused, useReadOnly, useSelected, type RenderElementProps } from "slate-react";

import { ContentLinkPreviewSheet } from "./ContentLinkPreviewSheet";
import {
  CONTENT_LINK_TYPE,
  readContentLinkTarget,
  useContentLinkDetail,
  useIsUnsharedContentLink,
  type ContentLinkElement,
} from "./contentLinkModel";

/** 与网页链接同族：accent 字色 + 淡点线下划线（网页链接为实线），与桌面一致 */
const LINK =
  "rounded-[4px] text-accent-text underline decoration-dotted decoration-[1.5px] underline-offset-[4px] " +
  "decoration-[color:color-mix(in_srgb,var(--tau-accent)_45%,transparent)] " +
  "transition-[background-color,text-decoration-color] duration-200";
/** 正在预览或光标在引用内：淡底 + 实色下划线 */
const LINK_ACTIVE = "bg-accent-soft decoration-accent";
const LINK_BROKEN = "text-ink-3 line-through decoration-solid decoration-ink-3";

/** 面板挂在行内节点下（经 portal），React 事件仍会冒泡回节点与编辑器，在此截断 */
const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

function ContentLink(props: {
  attributes: RenderElementProps["attributes"];
  element: ContentLinkElement;
  children: ReactNode;
}) {
  const { attributes, element, children } = props;
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const target = readContentLinkTarget(element);
  const unshared = useIsUnsharedContentLink();
  // 只读缓存：打开过的预览判定内容已删除后，这里随之显示失效
  const cached = useContentLinkDetail(target.contentId, false);
  const broken = !unshared && (target.contentId <= 0 || cached.data === null);

  const [previewOpen, setPreviewOpen] = useState(false);
  // 面板只在首次打开后挂载，关闭时保留以播完退场动画
  const [previewMounted, setPreviewMounted] = useState(false);

  // 编辑态单击只放光标，引用的操作在配件栏的引用模式里
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    if (!readOnly) return;
    if (!(event.target instanceof globalThis.Node) || !event.currentTarget.contains(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPreviewMounted(true);
    setPreviewOpen(true);
  };

  return (
    <span
      {...attributes}
      // 只读时整段作为交互元素：阅读态的双击进入编辑与长按选字都绕开它
      contentEditable={readOnly ? false : undefined}
      role={readOnly ? "button" : undefined}
      onClick={handleClick}
      className={cn(
        LINK,
        readOnly && "active:bg-accent-soft cursor-pointer",
        (previewOpen || (!readOnly && selected && focused)) && LINK_ACTIVE,
        broken && LINK_BROKEN
      )}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
      {previewMounted && typeof document !== "undefined"
        ? createPortal(
            <div
              onClick={stopPropagation}
              onMouseDown={stopPropagation}
              onPointerDown={stopPropagation}
              onTouchStart={stopPropagation}
              onTouchEnd={stopPropagation}
            >
              <ContentLinkPreviewSheet
                open={previewOpen}
                target={target}
                onClose={() => setPreviewOpen(false)}
              />
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

/** 显示文字被删空的引用没有意义，直接移除节点 */
function normalizeEmptyContentLink(editor: Editor, [node, path]: NodeEntry): boolean {
  if (Node.string(node) !== "") return false;
  Transforms.removeNodes(editor, { at: path });
  return true;
}

export const mobileContentLinkExtension = defineExtension({
  id: "host.content-link",
  elements: [
    defineElement({
      type: CONTENT_LINK_TYPE,
      dataVersion: 1,
      kind: "inline",
      render: ({ attributes, children, element }: ElementRenderProps) => (
        <ContentLink attributes={attributes} element={element as unknown as ContentLinkElement}>
          {children}
        </ContentLink>
      ),
      behaviors: { normalize: normalizeEmptyContentLink },
    }),
  ],
});
