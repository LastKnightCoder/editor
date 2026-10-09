/**
 * 创作模式叠在白板文档卡上的内容：召集理由、已引用、检查连接时的编号与降淡、
 * 写作时亮起与「连到此段」、悬停时的拖进正文抓手与「插入到正文」。
 */

import { useEffect, useState } from "react";
import { Check, CornerDownLeft, GripVertical } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { CANVAS_OVERLAY_ATTR, useBoard, type DocumentElement } from "@tau/whiteboard";
import { entityRefKey } from "@/entity/ref";
import { useDocumentSource } from "@/features/shared/whiteboard/components/Document/source";
import { ENTITY_DRAG_TYPE, insertEntityLink, type LinkTarget } from "../insert";
import type { ComposeDocumentElement } from "../model";
import { useComposeSession, useComposeSessionApi } from "../session";

const overlay = { [CANVAS_OVERLAY_ATTR]: "" };
const FLASH_MS = 1200;

export function ComposeCardAccessory({ element }: { element: DocumentElement }) {
  const board = useBoard();
  const session = useComposeSessionApi();
  const key = entityRefKey(element.entityRef);
  const { source } = useDocumentSource(element);
  const cited = useComposeSession(state => state.cited.has(key));
  const number = useComposeSession(state => state.numbers.get(key) ?? null);
  const checking = useComposeSession(state => state.numbers.size > 0);
  const focused = useComposeSession(state => state.focusKey === key);
  const glow = useComposeSession(state => state.glow?.elementId === element.id);
  const [flash, setFlash] = useState(false);
  const why = (element as ComposeDocumentElement).composeWhy;

  useEffect(() => {
    let timer = 0;
    const onFlash = (id: string) => {
      if (id !== element.id) return;
      setFlash(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(false), FLASH_MS);
    };
    board.on("element:flash", onFlash);
    return () => {
      board.off("element:flash", onFlash);
      window.clearTimeout(timer);
    };
  }, [board, element.id]);

  const target: LinkTarget | null = source
    ? { ref: element.entityRef, contentId: source.contentId, title: source.title }
    : null;

  const insert = (block?: number) => {
    const editor = session.getState().getEditor();
    if (!editor || !target) return;
    if (insertEntityLink(editor, target, { block })) {
      session.setState({ glow: null });
    } else {
      toast.warning("这里不能插入链接，先在正文里放好光标");
    }
  };

  return (
    <>
      {checking && !number && !focused && (
        <div className="bg-page pointer-events-none absolute inset-0 opacity-55" />
      )}
      {(glow || focused || flash) && (
        <div
          className={cn(
            "ring-accent pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset",
            glow && "animate-pulse"
          )}
        />
      )}
      {number != null && (
        <span className="bg-info text-surface absolute left-2 top-2 grid size-5 place-items-center rounded-full text-[11px] font-semibold">
          {number}
        </span>
      )}
      {why && !glow && (
        <div className="text-accent-text bg-surface border-line-2 pointer-events-none absolute inset-x-0 bottom-0 truncate border-t px-3 py-1.5 text-[11.5px]">
          {why}
        </div>
      )}
      {cited && (
        <span className="bg-ok-soft text-ok pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-0.5 rounded-full px-1.5 text-[11px] leading-5">
          <Check className="size-3" strokeWidth={2} />
          已引用
        </span>
      )}
      {glow && target && (
        <div
          {...overlay}
          className="bg-surface border-line-2 absolute inset-x-0 bottom-0 flex items-center gap-2 border-t px-3 py-1.5"
        >
          <span className="text-ink-2 min-w-0 flex-1 truncate text-[11.5px]">
            与正在写的这段相关
          </span>
          <button
            type="button"
            onClick={() => insert(session.getState().glow?.block)}
            className="bg-accent text-surface shrink-0 rounded-[6px] px-2 text-[11.5px] leading-[22px]"
          >
            连到此段
          </button>
        </div>
      )}
      {target && (
        <div
          {...overlay}
          className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity [[data-document-card]:hover_&]:opacity-100"
        >
          <button
            type="button"
            title="插入到正文"
            onClick={() => insert()}
            className="bg-surface shadow-card text-ink-2 hover:text-ink-1 grid size-6 place-items-center rounded-[6px]"
          >
            <CornerDownLeft className="size-3.5" strokeWidth={1.75} />
          </button>
          <span
            draggable
            title="拖进正文"
            onDragStart={event => {
              event.dataTransfer.setData(ENTITY_DRAG_TYPE, JSON.stringify(target));
              event.dataTransfer.setData("text/plain", target.title);
              event.dataTransfer.effectAllowed = "copy";
            }}
            className="bg-surface shadow-card text-ink-2 hover:text-ink-1 grid size-6 cursor-grab place-items-center rounded-[6px] active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" strokeWidth={1.75} />
          </span>
        </div>
      )}
    </>
  );
}
