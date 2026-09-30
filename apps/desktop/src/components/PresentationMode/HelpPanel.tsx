/** 快捷键面板与键帽 */
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@tau/ui";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-line-1 bg-surface text-tau-micro text-ink-3 inline-block rounded-[5px] border px-1.5 font-mono leading-[18px]">
      {children}
    </kbd>
  );
}

/** 一行一项：左说明、右按键；鼠标操作用 hint 文本而非键帽 */
function Row({ label, keys, hint }: { label: string; keys?: string[]; hint?: string }) {
  return (
    <div className="text-ink-2 flex items-center justify-between gap-6 whitespace-nowrap">
      <span>{label}</span>
      {hint ? (
        <span className="text-tau-sm text-ink-3">{hint}</span>
      ) : (
        <span className="flex gap-1">
          {keys?.map(key => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </span>
      )}
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <div className="text-tau-micro text-ink-3 mt-2 tracking-wide first:mt-0">{title}</div>;
}

interface HelpPanelProps {
  paged: boolean;
  onClose(): void;
}

export function HelpPanel({ paged, onClose }: HelpPanelProps) {
  return (
    <div className="bg-overlay absolute inset-0 z-20 grid place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="演示快捷键"
        className="bg-surface shadow-float text-tau-body rounded-tau-lg w-[380px] px-6 py-[22px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-tau-title mb-3.5 flex items-center justify-between font-semibold">
          快捷键
          <IconButton aria-label="关闭" onClick={onClose}>
            <X className="size-4" strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="flex flex-col gap-2">
          <Group title="推进" />
          <Row label="下一屏 / 下一节" keys={["→", "Space", "PgDn"]} />
          <Row label="上一屏 / 上一节" keys={["←", "PgUp"]} />
          <Row label="点击画面" hint="右侧前进 · 左侧后退" />
          <Row label="滚轮" hint="向下前进 · 向上后退" />
          {paged && <Row label="首节 / 末节" keys={["Home", "End"]} />}
          {paged && <Row label="跳到第 N 节" keys={["数字", "Enter"]} />}
          <Group title="画面" />
          {paged && <Row label="全览" keys={["O"]} />}
          <Row label="深浅色" keys={["D"]} />
          <Row label="全屏" keys={["F"]} />
          <Row label="快捷键" keys={["?"]} />
          <Row label="退出" keys={["Esc"]} />
        </div>
      </div>
    </div>
  );
}
