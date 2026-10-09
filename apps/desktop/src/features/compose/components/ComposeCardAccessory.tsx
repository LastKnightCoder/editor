/**
 * 创作模式叠在白板文档卡上的内容：召集理由、标出可引用处时的编号与降淡、写作时亮起与「连到此段」；
 * 右上角一枚小签：没引用时悬停出现「引用」（插到正文光标处），引用了常驻「已引用」，点它撤掉正文里的链接。
 */

import { useEffect, useState } from "react";
import { HistoryEditor } from "slate-history";
import { Check, Quote, X } from "lucide-react";
import { Tooltip, cn, toast } from "@tau/ui";
import { CANVAS_OVERLAY_ATTR, useBoard, type DocumentElement } from "@tau/whiteboard";
import { entityRefKey } from "@/entity/ref";
import { useDocumentSource } from "@/features/shared/whiteboard/components/Document/source";
import { insertEntityLink, removeEntityLinks, type LinkTarget } from "../insert";
import type { ComposeDocumentElement } from "../model";
import { useComposeSession, useComposeSessionApi } from "../session";

const overlay = { [CANVAS_OVERLAY_ATTR]: "" };
const FLASH_MS = 1200;
const CHIP =
  "absolute right-2 top-2 inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] leading-5 transition-colors";

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

  const uncite = () => {
    const editor = session.getState().getEditor();
    if (!editor) return;
    const count = removeEntityLinks(editor, element.entityRef);
    if (!count) return;
    toast.success(count > 1 ? `已取消正文里的 ${count} 处引用` : "已取消引用", {
      action: HistoryEditor.isHistoryEditor(editor)
        ? { label: "撤销", onClick: () => editor.undo() }
        : undefined,
    });
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
      {cited ? (
        <Tooltip content="撤掉正文里指向它的链接">
          <button
            type="button"
            {...overlay}
            onClick={uncite}
            className={cn(
              CHIP,
              "bg-ok-soft text-ok hover:bg-danger-soft hover:text-danger group/cite"
            )}
          >
            <Check className="size-3 group-hover/cite:hidden" strokeWidth={2} />
            <X className="hidden size-3 group-hover/cite:block" strokeWidth={2} />
            <span className="group-hover/cite:hidden">已引用</span>
            <span className="hidden group-hover/cite:inline">取消引用</span>
          </button>
        </Tooltip>
      ) : (
        target && (
          <Tooltip content="在正文光标处插入指向它的链接">
            <button
              type="button"
              {...overlay}
              onClick={() => insert()}
              className={cn(
                CHIP,
                "bg-surface shadow-card text-ink-2 hover:text-ink-1 opacity-0 transition-opacity focus-visible:opacity-100 [[data-document-card]:hover_&]:opacity-100"
              )}
            >
              <Quote className="size-3" strokeWidth={1.75} />
              引用
            </button>
          </Tooltip>
        )
      )}
    </>
  );
}
