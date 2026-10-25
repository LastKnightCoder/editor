import { ArrowUpRight, Copy, MessageSquareText, NotebookPen, Sparkles, X } from "lucide-react";
import { IconButton } from "@tau/ui";
import { QUICK_LABELS } from "../state/chat";
import { stripCites } from "../state/controller";
import { showToast, useCompanion } from "../state/store";
import { useController, useEscLayer } from "./context";
import { Markdown } from "./Markdown";

const WIDTH = 360;

/** 选区快答（解释 / 翻译）：回答贴在原文下方，用完即收；「在面板继续」接着聊 */
export function QuickBubble() {
  const controller = useController();
  const bubble = useCompanion(state => state.bubble);
  const modelLabel = useCompanion(state => state.chat.model?.label);
  useEscLayer(Boolean(bubble), () => controller.closeBubble());
  if (!bubble) return null;

  const left = Math.max(12, Math.min(innerWidth - WIDTH - 12, bubble.rect.left));
  const below = bubble.rect.bottom + 10;
  const top = below + 220 > innerHeight ? Math.max(12, bubble.rect.top - 230) : below;
  const done = bubble.status !== "streaming";

  return (
    <div
      className="bg-surface shadow-float animate-tau-pop rounded-tau-md fixed z-[42] px-3.5 pt-3 pb-2"
      style={{ left, top, width: WIDTH }}
    >
      <div className="text-tau-sm text-ink-3 mb-1.5 flex items-center gap-1.5">
        <Sparkles size={14} strokeWidth={1.8} className="text-accent-text" />
        <span>{QUICK_LABELS[bubble.kind]}</span>
        {modelLabel && <span>· {modelLabel}</span>}
        <span className="flex-1" />
        <IconButton aria-label="关闭" className="size-6" onClick={() => controller.closeBubble()}>
          <X size={14} strokeWidth={1.8} />
        </IconButton>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {bubble.status === "error" ? (
          <p className="text-danger text-tau-body">{bubble.error ?? "回答失败"}</p>
        ) : bubble.text ? (
          <Markdown text={bubble.text} />
        ) : (
          <span className="bg-accent inline-block h-3.5 w-[7px] animate-pulse rounded-[1px] align-[-2px]" />
        )}
      </div>
      {done && bubble.status !== "error" && (
        <div className="-mx-1.5 mt-2 flex items-center gap-0.5">
          <BubbleAction
            icon={Copy}
            onClick={() =>
              void navigator.clipboard
                .writeText(stripCites(bubble.text))
                .then(() => showToast("已复制"))
            }
          >
            复制
          </BubbleAction>
          <BubbleAction icon={MessageSquareText} onClick={() => controller.bubbleToAnnotation()}>
            存为批注
          </BubbleAction>
          <BubbleAction
            icon={NotebookPen}
            onClick={() => {
              controller.appendToNote(stripCites(bubble.text));
              showToast("已存入页面笔记");
            }}
          >
            存为笔记
          </BubbleAction>
          <span className="flex-1" />
          <BubbleAction
            icon={ArrowUpRight}
            trailing
            onClick={() => {
              controller.closeBubble();
              controller.openPanel("chat");
            }}
          >
            在面板继续
          </BubbleAction>
        </div>
      )}
    </div>
  );
}

function BubbleAction({
  icon: Icon,
  trailing,
  onClick,
  children,
}: {
  icon: typeof Copy;
  trailing?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-sm rounded-tau-sm inline-flex h-[26px] items-center gap-[5px] px-2"
    >
      {!trailing && <Icon size={13} strokeWidth={1.8} />}
      {children}
      {trailing && <Icon size={13} strokeWidth={1.8} />}
    </button>
  );
}
