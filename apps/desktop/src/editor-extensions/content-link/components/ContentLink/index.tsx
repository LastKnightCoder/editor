import React, { useEffect, useRef, useState, memo } from "react";
import { Transforms, type Node } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";

import type { ContentLinkElement } from "../../types";
import { InlineChromiumBugfix } from "@tau/editor";
import { useCollaboration } from "@tau/editor-collab";
import Content from "../Content";
import { AnchoredPanel, cn, toast } from "@tau/ui";
import { openContent } from "@/services/open-content";

import { getContentById } from "@/commands";
import { IContent } from "@/types";

interface IContentLinkProps {
  attributes: RenderElementProps["attributes"];
  element: ContentLinkElement;
  children: React.ReactNode;
}

/** hover 进入延迟与 Tooltip 同档；离开留宽限，让指针能移进预览卡 */
const OPEN_DELAY = 450;
const CLOSE_GRACE = 160;

const LINK =
  "cursor-pointer text-ink-1 underline decoration-dotted decoration-ink-3 underline-offset-4 " +
  "transition-colors duration-[160ms] hover:text-accent-text hover:decoration-accent " +
  "after:ml-px after:inline-block after:align-super after:text-[0.68em] after:font-semibold " +
  "after:leading-none after:text-accent after:content-['↗'] " +
  "after:transition-transform after:duration-[160ms] hover:after:translate-x-px hover:after:-translate-y-px";
const LINK_ACTIVE = "text-accent-text decoration-accent after:translate-x-px after:-translate-y-px";
const LINK_BROKEN = "cursor-default text-ink-3 line-through decoration-ink-3";

const ContentLink = memo((props: IContentLinkProps) => {
  const { attributes, children, element } = props;
  const { contentId, contentType, contentTitle, refId } = element;

  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [content, setContent] = useState<IContent | null | undefined>(undefined);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  // 卡片内容（含只读编辑器）只在打开期间挂载，收起动画结束后卸载
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<number>(0);

  const collaboration = useCollaboration();
  // 协作者本机没有被引用内容，查询本地库还可能命中同 ID 的无关内容，直接降级为提示。
  const remoteView = Boolean(
    collaboration && collaboration.mode !== "local" && collaboration.role !== "owner"
  );
  const broken = !remoteView && content === null;

  useEffect(() => {
    if (remoteView) {
      setContent(null);
      return;
    }
    setContent(undefined);
    getContentById(contentId).then(content => {
      setContent(content);
    });
  }, [contentId, remoteView]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const schedule = (next: boolean, wait: number) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setOpen(next);
      if (next) setMounted(true);
    }, wait);
  };
  const cancel = () => window.clearTimeout(timerRef.current);

  const handleOpen = async () => {
    cancel();
    setOpen(false);
    if (!content || remoteView) return;
    try {
      await openContent(contentType, refId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开内容失败");
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleOpen();
  };

  const handleRemove = () => {
    setOpen(false);
    const at = ReactEditor.findPath(editor, element as unknown as Node);
    Transforms.unwrapNodes(editor, { at });
  };

  return (
    <>
      <span
        {...attributes}
        onClick={handleClick}
        onMouseEnter={e => {
          setAnchor(e.currentTarget);
          if (open) cancel();
          else schedule(true, OPEN_DELAY);
        }}
        onMouseLeave={() => schedule(false, open ? CLOSE_GRACE : 0)}
        className={cn(LINK, open && LINK_ACTIVE, broken && LINK_BROKEN, broken && "after:hidden")}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>
      {anchor && (
        <AnchoredPanel
          anchor={anchor}
          open={open}
          placement="bottom-start"
          className="w-[380px] max-w-[380px]"
          onMouseEnter={cancel}
          onMouseLeave={() => schedule(false, CLOSE_GRACE)}
          onTransitionEnd={e => {
            if (!open && e.target === e.currentTarget) setMounted(false);
          }}
        >
          {mounted && (
            <Content
              content={content}
              contentType={contentType}
              contentTitle={contentTitle}
              unshared={remoteView}
              onOpen={handleOpen}
              onRemove={readOnly ? undefined : handleRemove}
            />
          )}
        </AnchoredPanel>
      )}
    </>
  );
});

export default ContentLink;
