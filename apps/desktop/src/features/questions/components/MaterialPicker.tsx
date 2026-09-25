/**
 * 关联已有材料：卡片 / 文章 / 项目文档 / 项目 / 白板五类分段 + 关键字检索（空关键字按最近更新），
 * 多选后一次关联；已关联项置灰。
 */

import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button, Dialog, Input, Loading, Segmented, cn } from "@tau/ui";
import type { QuestionLinkTarget, QuestionLinkTargetType } from "@/types";
import { useDebounce } from "ahooks";
import { useTargetCandidates } from "../queries";
import { TARGET_META, relativeDay } from "../model";

type PickableType = Exclude<QuestionLinkTargetType, "answer">;
const PICKABLE: PickableType[] = ["card", "article", "project_item", "project", "white_board"];

export function MaterialPicker({
  questionId,
  questionTitle,
  open,
  now,
  onClose,
  onConfirm,
}: {
  questionId: number | null;
  questionTitle: string;
  open: boolean;
  now: number;
  onClose(): void;
  onConfirm(targets: QuestionLinkTarget[]): Promise<void>;
}) {
  const [type, setType] = useState<PickableType>("card");
  const [keyword, setKeyword] = useState("");
  const debounced = useDebounce(keyword, { wait: 200 });
  const [picked, setPicked] = useState<Map<string, QuestionLinkTarget>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const { data, isPending } = useTargetCandidates(questionId, type, debounced, open);

  useEffect(() => {
    if (!open) return;
    setKeyword("");
    setPicked(new Map());
  }, [open]);

  const toggle = (target: QuestionLinkTarget) => {
    const key = `${target.targetType}:${target.targetId}`;
    setPicked(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, target);
      return next;
    });
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm([...picked.values()]);
      onClose();
    } catch {
      // 失败提示由调用方给出，弹窗保持打开以便重试
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title="关联已有材料"
      subtitle={questionTitle}
      locked={saving}
      width={720}
      footer={
        <>
          <span className="text-ink-2 mr-auto text-[12.5px]">
            {picked.size ? `已选 ${picked.size} 项` : "未选择"}
          </span>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!picked.size}
            onClick={() => void confirm()}
          >
            关联
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Input
            data-autofocus
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder={`搜索${TARGET_META[type].label}…`}
            lead={Search}
            wrapperClassName="flex-1"
          />
          <Segmented
            label="材料类型"
            size="sm"
            value={type}
            onValueChange={(v: PickableType) => setType(v)}
          >
            {PICKABLE.map(t => (
              <Segmented.Item key={t} value={t} label={TARGET_META[t].label} />
            ))}
          </Segmented>
        </div>
        <div className="bg-surface shadow-card h-[400px] overflow-y-auto rounded-[14px] p-1.5">
          {isPending && !data ? (
            <Loading />
          ) : !data?.length ? (
            <p className="text-ink-3 py-10 text-center text-[12.5px]">
              {keyword ? "没有匹配的材料" : `还没有${TARGET_META[type].label}`}
            </p>
          ) : (
            data.map(candidate => {
              const key = `${candidate.targetType}:${candidate.targetId}`;
              const on = picked.has(key);
              const Icon = TARGET_META[candidate.targetType].icon;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={candidate.linked}
                  onClick={() => toggle(candidate)}
                  className={cn(
                    "flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] text-left outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                    on ? "bg-selected" : "hover:bg-hover",
                    candidate.linked && "cursor-default opacity-50 hover:bg-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                      on
                        ? "bg-accent border-accent text-ink-inverse"
                        : "border-ink-3 text-transparent"
                    )}
                  >
                    <Check className="size-[11px]" strokeWidth={3} />
                  </span>
                  <Icon className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{candidate.title}</span>
                    {candidate.excerpt && (
                      <span className="text-ink-3 truncate text-[12px]">{candidate.excerpt}</span>
                    )}
                  </span>
                  <span className="text-ink-3 shrink-0 text-[11.5px]">
                    {candidate.linked
                      ? "已关联"
                      : [candidate.meta, relativeDay(candidate.time, now)]
                          .filter(Boolean)
                          .join(" · ")}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}
