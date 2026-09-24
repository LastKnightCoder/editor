import type { FlashcardData } from "@/types";
import { Button, IconButton, Input, Segmented, Textarea, cn } from "@tau/ui";
import { Plus, Trash2 } from "lucide-react";
import { blanksOf } from "../model";

import type { FormState } from "../editorModel";
import { Field } from "./Field";

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

export function AnswerFields({
  form,
  patchData,
}: {
  form: FormState;
  patchData(next: Partial<FlashcardData>): void;
}) {
  if (form.type === "single-choice" || form.type === "multiple-choice") {
    const options = form.data.options ?? [];
    const single = form.type === "single-choice";
    const update = (id: string, next: Partial<(typeof options)[number]>) =>
      patchData({
        options: options.map(o => {
          if (o.id === id) return { ...o, ...next };
          // 单选：标记一个正确项时其余取消
          return single && next.isCorrect ? { ...o, isCorrect: false } : o;
        }),
      });
    return (
      <Field label="选项" aux={`点字母标记${single ? "唯一" : ""}正确答案`}>
        <div className="flex flex-col gap-1.5">
          {options.map((option, i) => (
            <div key={option.id} className="flex items-center gap-2">
              <button
                type="button"
                title={option.isCorrect ? "正确答案" : "标为正确答案"}
                aria-pressed={option.isCorrect}
                onClick={() => update(option.id, { isCorrect: single ? true : !option.isCorrect })}
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-[7px] font-mono text-[11px] font-semibold transition-colors",
                  option.isCorrect ? "bg-ok text-ink-inverse" : "bg-hover text-ink-2 hover:bg-press"
                )}
              >
                {"ABCDEF"[i]}
              </button>
              <Input
                className="min-w-0 flex-1"
                value={option.label}
                onChange={e => update(option.id, { label: e.target.value })}
                placeholder={`选项 ${i + 1}`}
              />
              <IconButton
                aria-label="删除选项"
                title="删除选项"
                disabled={options.length <= 2}
                className="size-6 disabled:opacity-0"
                onClick={() => patchData({ options: options.filter(o => o.id !== option.id) })}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </IconButton>
            </div>
          ))}
          {options.length < 6 && (
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              className="self-start"
              onClick={() =>
                patchData({
                  options: [...options, { id: randomId(), label: "", isCorrect: false }],
                })
              }
            >
              添加选项
            </Button>
          )}
        </div>
      </Field>
    );
  }
  if (form.type === "boolean") {
    return (
      <Field label="答案">
        <Segmented
          size="sm"
          label="答案"
          value={String(form.data.booleanAnswer ?? true)}
          onValueChange={(v: string) => patchData({ booleanAnswer: v === "true" })}
          className="self-start"
        >
          <Segmented.Item value="true" label="正确" />
          <Segmented.Item value="false" label="错误" />
        </Segmented>
      </Field>
    );
  }
  if (form.type === "qa") {
    return (
      <Field label="参考答案" aux="复习时对照；配置模型后用于 AI 评判">
        <Textarea
          value={form.data.answer ?? ""}
          onChange={e => patchData({ answer: e.target.value })}
          placeholder="标准答案或要点"
          rows={3}
        />
      </Field>
    );
  }
  const blanks = blanksOf(form.prompt);
  return (
    <Field label="填空">
      {blanks.length ? (
        <p className="text-ink-2 text-[12.5px]">
          共 {blanks.length} 个空：
          {blanks.map((b, i) => (
            <span
              key={b.blankId}
              className="bg-accent-soft text-accent-text mx-0.5 rounded-[5px] px-1.5 font-medium"
            >
              {i + 1}. {b.answer || "（未填答案）"}
            </span>
          ))}
          <span className="text-ink-3 block text-[11.5px]">点题干里的空可修改答案与备选答案</span>
        </p>
      ) : (
        <p className="text-ink-3 text-[12px]">还没有填空</p>
      )}
    </Field>
  );
}
