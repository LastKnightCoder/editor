import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Descendant } from "slate";
import { AnchoredPanel, Button } from "@tau/ui";
import { FileText } from "lucide-react";
import { useMemoizedFn } from "ahooks";

import { useTextExtension } from "../../extensions/text";

const OPEN_DELAY = 280;
const CLOSE_DELAY = 160;
const EXCERPT_LENGTH = 160;

const blockText = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  const value = node as { text?: unknown; children?: unknown[] };
  if (typeof value.text === "string") return value.text;
  return Array.isArray(value.children) ? value.children.map(blockText).join("") : "";
};

/** 正文开头几行：跳过与标题重复的首行与空行 */
const excerptOf = (content: readonly Descendant[] | null, title: string) => {
  if (!content) return "";
  const lines = content.map(blockText).map(line => line.trim());
  const body = lines.filter((line, index) => line && !(index === 0 && line === title));
  return body.join(" ").slice(0, EXCERPT_LENGTH);
};

export interface NotePeekProps {
  contentId: number;
  title: string;
  color: string;
  style: CSSProperties;
  onOpen(): void;
  onUnlink?(): void;
}

/** 节点上的关联笔记图标：悬停浮出标题与开头几行，点击打开笔记 */
export function NotePeek({ contentId, title, color, style, onOpen, onUnlink }: NotePeekProps) {
  const { Observer } = useTextExtension();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<readonly Descendant[] | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => setContent(null), [contentId]);

  const schedule = useMemoizedFn((next: boolean) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), next ? OPEN_DELAY : CLOSE_DELAY);
  });
  const handleContent = useMemoizedFn((value: Descendant[]) => setContent(value));

  const firstLine = content ? blockText(content[0]).trim() : "";
  const heading = title || firstLine || "未命名笔记";
  const excerpt = excerptOf(content, heading);

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={`打开笔记：${heading}`}
        className="rounded-tau-sm absolute grid size-5 place-items-center transition-colors hover:bg-[color-mix(in_srgb,currentColor_16%,transparent)]"
        style={{ ...style, color }}
        onPointerDown={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          setOpen(false);
          onOpen();
        }}
        onPointerEnter={() => schedule(true)}
        onPointerLeave={() => schedule(false)}
      >
        <FileText size={14} strokeWidth={1.6} />
      </button>
      {open && Observer && <Observer contentId={contentId} onChange={handleContent} />}
      <AnchoredPanel
        anchor={anchor}
        open={open}
        placement="bottom-start"
        className="w-[280px] px-3.5 py-3"
        onPointerEnter={() => schedule(true)}
        onPointerLeave={() => schedule(false)}
      >
        <div className="text-tau-title text-ink-1 truncate font-semibold">{heading}</div>
        {excerpt && (
          <div className="text-tau-body text-ink-2 mt-1 line-clamp-3 leading-[1.65]">{excerpt}</div>
        )}
        <div className="mt-2.5 flex gap-1">
          <Button
            size="sm"
            variant="soft"
            onClick={() => {
              setOpen(false);
              onOpen();
            }}
          >
            打开
          </Button>
          {onUnlink && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onUnlink();
              }}
            >
              取消关联
            </Button>
          )}
        </div>
      </AnchoredPanel>
    </>
  );
}
