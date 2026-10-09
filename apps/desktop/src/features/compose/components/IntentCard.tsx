/**
 * 第一次进入创作模式时的意图卡：说说想写什么、从哪些类型里找；也可以跳过、空白白板开始。
 * 白板右上角的意图按钮：点开看 / 改这一句（不在正文里常驻）。
 */

import { useState } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Button, Popover, Textarea, cn } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { EntityRefKind } from "@/entity/ref";

const KIND_OPTIONS: Array<{ kind: EntityRefKind; label: string }> = [
  { kind: "card", label: "卡片" },
  { kind: "article", label: "文章" },
  { kind: "project-item", label: "项目文档" },
  { kind: "diary-moment", label: "日记" },
];

export function IntentCard({
  initialIntent,
  canGather,
  busy,
  onStart,
  onSkip,
}: {
  initialIntent: string;
  /** 配了「AI 洞见」模型才能自动找资料 */
  canGather: boolean;
  busy: boolean;
  onStart(intent: string, kinds: EntityRefKind[]): void;
  onSkip(): void;
}) {
  const [intent, setIntent] = useState(initialIntent);
  const [kinds, setKinds] = useState<EntityRefKind[]>(KIND_OPTIONS.map(option => option.kind));
  useOverlayDismiss(onSkip, !busy);
  const start = () => {
    if (!intent.trim() || !kinds.length || busy) return;
    onStart(intent.trim(), kinds);
  };

  return (
    <div className="bg-overlay absolute inset-0 z-20 grid place-items-center p-6">
      <div className="bg-surface shadow-float rounded-tau-lg w-full max-w-[520px] px-[22px] pb-4 pt-5">
        <h3 className="text-ink-1 text-[16px] font-semibold">这篇想写什么？</h3>
        <p className="text-ink-3 text-tau-meta mb-3.5 mt-1">
          {canGather
            ? "说说主题、想表达的观点或想回答的问题。我会从你的笔记里挑出相关的，分好组放到左边白板上。"
            : "写下来留在正文上方作提醒。配置「AI 洞见」模型后，可以按这句话自动找资料。"}
        </p>
        <Textarea
          autoFocus
          rows={4}
          value={intent}
          placeholder="例如：解释间隔重复为什么有效，结合我这两个月做闪卡的体验，最后说说它的局限"
          onChange={event => setIntent(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (canGather) start();
            }
          }}
        />
        {canGather && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {KIND_OPTIONS.map(option => {
              const on = kinds.includes(option.kind);
              return (
                <button
                  key={option.kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setKinds(current =>
                      on ? current.filter(kind => kind !== option.kind) : [...current, option.kind]
                    )
                  }
                  className={cn(
                    "text-tau-meta inline-flex h-[26px] items-center rounded-full border px-2.5 transition-colors",
                    on
                      ? "bg-accent-soft text-accent-text border-transparent"
                      : "border-line-1 text-ink-2 hover:bg-hover"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>
            {canGather ? "跳过，空白白板" : "空白白板开始"}
          </Button>
          <div className="flex-1" />
          {canGather ? (
            <Button
              variant="primary"
              icon={Sparkles}
              onClick={start}
              loading={busy}
              disabled={!intent.trim() || !kinds.length}
            >
              开始找资料
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onStart(intent.trim(), [])}
              loading={busy}
              disabled={!intent.trim()}
            >
              开始
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 白板右上角的意图入口：看 / 改写作意图（改了只影响以后的「再找一些」） */
export function IntentButton({
  intent,
  onChange,
}: {
  intent: string;
  onChange(intent: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(intent);
  const save = () => {
    setOpen(false);
    if (draft.trim() !== intent) onChange(draft.trim());
  };
  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setDraft(intent);
        setOpen(next);
      }}
      placement="bottom-end"
      arrow={false}
      className="w-[340px]"
      trigger={
        <button
          type="button"
          title="写作意图"
          aria-label="写作意图"
          className={cn(
            "bg-surface shadow-card text-ink-2 hover:text-ink-1 hover:bg-surface-hover grid size-[30px] place-items-center rounded-full",
            open && "text-ink-1"
          )}
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </button>
      }
    >
      <div className="p-3">
        <p className="text-ink-3 text-tau-meta mb-2">写作意图 · 「再找一些」按它找资料</p>
        <Textarea
          autoFocus
          rows={4}
          value={draft}
          placeholder="这篇想写什么"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              save();
            }
          }}
        />
        <div className="mt-2.5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            保存
          </Button>
        </div>
      </div>
    </Popover>
  );
}
