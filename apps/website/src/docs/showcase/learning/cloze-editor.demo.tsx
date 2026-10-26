/**
 * 填空题怎么挖空：新建闪卡窗口里的题干编辑器。选中一个词后点「标记为空格」，它变成一个空；
 * 点空格上的 ⚙️ 打开配置，可改正确答案、加备选答案与提示文本；右栏「填空」列出所有空。
 * 结构按 features/flashcards 的 CardEditorDialog、CardEditorContent、AnswerFields，
 * 以及 ClozeEditorToolbar、flashcard-blank 的 BlankConfigPopover 重建。
 */
import { useState, type ReactNode } from "react";
import {
  CircleDot,
  CreditCard,
  ListChecks,
  MessageSquareText,
  TextCursorInput,
  ToggleRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

const BEFORE = "在快要忘记的时候复习，记得最牢。这种方法叫";
const WORD = "间隔重复";
const MIDDLE = "，它由心理学家";
const WORD2 = "艾宾浩斯";
const AFTER = "的遗忘曲线研究发展而来。";

const TYPES: { label: string; icon: LucideIcon }[] = [
  { label: "问答", icon: MessageSquareText },
  { label: "填空", icon: TextCursorInput },
  { label: "单选", icon: CircleDot },
  { label: "多选", icon: ListChecks },
  { label: "判断", icon: ToggleRight },
];

interface Blank {
  answer: string;
  alternatives: string[];
  hint: string;
}

const LABEL = "text-ink-2 text-[12px] font-medium";

function Field({ label, aux, children }: { label: string; aux?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={LABEL}>{label}</span>
        {aux && <span className="text-ink-3 ml-auto truncate text-[11.5px]">{aux}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ClozeEditorDemo() {
  /** 模拟选区：点一个词即选中它 */
  const [selected, setSelected] = useState<0 | 1 | null>(null);
  const [blanks, setBlanks] = useState<(Blank | null)[]>([null, null]);
  const [config, setConfig] = useState<0 | 1 | null>(null);
  const [draft, setDraft] = useState<Blank | null>(null);
  const [warning, setWarning] = useState(false);

  const words = [WORD, WORD2];

  const toggleBlank = () => {
    if (selected === null) {
      setWarning(true);
      setTimeout(() => setWarning(false), 2400);
      return;
    }
    setBlanks(list =>
      list.map((blank, index) =>
        index === selected
          ? blank
            ? null
            : { answer: words[index], alternatives: [], hint: "" }
          : blank
      )
    );
    setSelected(null);
    setConfig(null);
  };

  const openConfig = (index: 0 | 1) => {
    setConfig(index);
    setDraft(structuredClone(blanks[index]));
    setSelected(null);
  };

  const renderWord = (index: 0 | 1) => {
    const blank = blanks[index];
    if (blank)
      return (
        <span className="relative">
          <span className="border-info bg-info-soft text-info mx-px rounded-[4px] border px-2 py-px font-medium">
            {words[index]}
            <button
              type="button"
              title="配置空格"
              aria-label="配置空格"
              onClick={() => openConfig(index)}
              className="ml-1.5 text-[12px] opacity-70 hover:opacity-100"
            >
              ⚙️
            </button>
            {blank.hint && (
              <span className="ml-1 text-[10px] font-normal italic opacity-60">{blank.hint}</span>
            )}
          </span>
          {config === index && draft && (
            <span className="bg-surface border-line-1 shadow-float animate-doc-in text-ink-1 absolute top-[calc(100%+6px)] left-0 z-20 block w-[260px] rounded-[10px] border p-3 text-[13px] leading-normal font-normal">
              <span className="mb-1 block font-medium">提示文本（可选）</span>
              <input
                value={draft.hint}
                onChange={event => setDraft({ ...draft, hint: event.target.value })}
                placeholder="如：国家名、人物、年份等"
                className="border-line-1 bg-surface placeholder:text-ink-3 focus:border-accent block w-full rounded-[6px] border px-2.5 py-1.5 outline-none select-text"
              />
              <span className="mt-3 mb-1 block font-medium">正确答案 *</span>
              <input
                value={draft.answer}
                onChange={event => setDraft({ ...draft, answer: event.target.value })}
                placeholder="输入正确答案"
                className="border-line-1 bg-surface focus:border-accent block w-full rounded-[6px] border px-2.5 py-1.5 outline-none select-text"
              />
              <span className="mt-3 mb-1 block font-medium">备选答案（可选）</span>
              {draft.alternatives.map((alt, altIndex) => (
                <span key={altIndex} className="mb-1.5 flex items-center gap-1.5">
                  <input
                    autoFocus={altIndex === draft.alternatives.length - 1}
                    value={alt}
                    onChange={event =>
                      setDraft({
                        ...draft,
                        alternatives: draft.alternatives.map((item, i) =>
                          i === altIndex ? event.target.value : item
                        ),
                      })
                    }
                    placeholder={`备选答案 ${altIndex + 1}`}
                    className="border-line-1 bg-surface placeholder:text-ink-3 focus:border-accent block min-w-0 flex-1 rounded-[6px] border px-2.5 py-1.5 outline-none select-text"
                  />
                  <button
                    type="button"
                    aria-label="删除备选答案"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        alternatives: draft.alternatives.filter((_, i) => i !== altIndex),
                      })
                    }
                    className="bg-danger-soft text-danger grid size-7 shrink-0 place-items-center rounded-[4px]"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    alternatives: [...draft.alternatives, ""],
                  })
                }
                className="border-line-1 text-ink-2 hover:bg-hover block w-full rounded-[6px] border border-dashed py-1.5 text-[12.5px]"
              >
                + 添加备选答案
              </button>
              <span className="mt-3 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfig(null)}
                  className="text-ink-2 hover:bg-hover rounded-[6px] px-3 py-1"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!draft.answer.trim()}
                  onClick={() => {
                    setBlanks(list =>
                      list.map((item, i) =>
                        i === index
                          ? {
                              ...draft,
                              answer: draft.answer.trim(),
                              alternatives: draft.alternatives
                                .map(alt => alt.trim())
                                .filter(Boolean),
                            }
                          : item
                      )
                    );
                    setConfig(null);
                  }}
                  className="bg-accent text-ink-inverse rounded-[6px] px-3 py-1 disabled:opacity-50"
                >
                  保存
                </button>
              </span>
            </span>
          )}
        </span>
      );
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setSelected(selected === index ? null : index)}
        onKeyDown={event => event.key === "Enter" && setSelected(index)}
        className={cn(
          "cursor-text rounded-[2px]",
          selected === index ? "bg-info-soft" : "hover:bg-hover"
        )}
      >
        {words[index]}
      </span>
    );
  };

  const made = blanks.filter((blank): blank is Blank => blank !== null);

  return (
    <AppWindow active="review" crumb="闪卡复习 / 学习方法" height={440} paper={false}>
      <div className="bg-overlay grid h-full place-items-center rounded-[12px] p-3">
        <div className="bg-surface shadow-float flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-[16px]">
          <div className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3">
            <span className="bg-accent-soft text-accent-text grid size-8 shrink-0 place-items-center rounded-[10px]">
              <CreditCard className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-tau-body font-semibold">新建闪卡</p>
              <p className="text-ink-3 text-[11.5px]">⌘↵ 保存 · ⌘⇧↵ 保存并新建</p>
            </div>
          </div>
          <div className="scrollbar-hide grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_180px] gap-5 overflow-y-auto px-5 pb-4 max-sm:grid-cols-1">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="bg-hover flex self-start rounded-[9px] p-0.5">
                {TYPES.map(type => {
                  const Icon = type.icon;
                  return (
                    <span
                      key={type.label}
                      className={cn(
                        "flex h-6 items-center gap-1 rounded-[7px] px-2 text-[12px]",
                        type.label === "填空"
                          ? "bg-surface text-ink-1 shadow-card font-medium"
                          : "text-ink-2"
                      )}
                    >
                      <Icon className="size-3" strokeWidth={1.75} />
                      {type.label}
                    </span>
                  );
                })}
              </div>
              <Field label="题干" aux="选中文字后用工具栏设为填空，可给每个空设备选答案">
                <div className="bg-surface border-line-1 rounded-tau-md border">
                  <p className="min-h-[84px] p-4 text-[15px] leading-[1.8]">
                    {BEFORE}
                    {renderWord(0)}
                    {MIDDLE}
                    {renderWord(1)}
                    {AFTER}
                  </p>
                  <div className="border-line-1 relative flex items-center justify-between gap-3 border-t px-4 py-3">
                    <button
                      type="button"
                      onClick={toggleBlank}
                      className="bg-accent-soft text-accent-text hover:bg-accent/20 h-7 shrink-0 rounded-[8px] px-3 text-[12.5px] font-medium"
                    >
                      标记为空格
                    </button>
                    <span className="text-ink-3 text-tau-sm truncate">
                      提示：选中文字后点击按钮即可标记为空格
                    </span>
                    {warning && (
                      <span className="bg-surface shadow-float text-tau-sm animate-doc-in absolute bottom-full left-4 mb-1.5 flex items-center gap-2 rounded-[10px] px-3 py-1.5 whitespace-nowrap">
                        <i className="bg-warn size-1.5 rounded-full" />
                        请先选中需要标记为空格的文字
                      </span>
                    )}
                  </div>
                </div>
              </Field>
              <Field label="填空">
                {made.length ? (
                  <p className="text-ink-2 text-[12.5px] leading-[1.9]">
                    共 {made.length} 个空：
                    {made.map((blank, index) => (
                      <span
                        key={blank.answer + index}
                        className="bg-accent-soft text-accent-text mx-0.5 rounded-[5px] px-1.5 font-medium"
                      >
                        {index + 1}. {blank.answer}
                        {blank.alternatives.length > 0 && ` / ${blank.alternatives.join(" / ")}`}
                      </span>
                    ))}
                    <span className="text-ink-3 block text-[11.5px]">
                      点题干里的空可修改答案与备选答案
                    </span>
                  </p>
                ) : (
                  <p className="text-ink-3 text-[12px]">还没有填空</p>
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-4 max-sm:hidden">
              <Field label="卡组">
                <span className="border-line-1 text-tau-sm flex h-8 items-center gap-2 rounded-[8px] border px-2.5">
                  <i className="bg-tag-2 size-2 rounded-full" />
                  学习方法
                </span>
              </Field>
              <Field label="难度">
                <div className="bg-hover flex rounded-[9px] p-0.5 text-[12px]">
                  {["基础", "常规", "进阶"].map(level => (
                    <span
                      key={level}
                      className={cn(
                        "flex h-6 flex-1 items-center justify-center rounded-[7px]",
                        level === "常规"
                          ? "bg-surface text-ink-1 shadow-card font-medium"
                          : "text-ink-2"
                      )}
                    >
                      {level}
                    </span>
                  ))}
                </div>
              </Field>
            </div>
          </div>
          <div className="border-line-2 flex shrink-0 justify-end gap-2 border-t px-5 py-3">
            <span className="text-ink-2 text-tau-sm flex h-8 items-center rounded-[8px] px-3">
              取消
            </span>
            <span className="text-ink-2 text-tau-sm border-line-1 flex h-8 items-center rounded-[8px] border px-3">
              保存并新建
            </span>
            <span
              className={cn(
                "bg-accent text-ink-inverse text-tau-sm flex h-8 items-center rounded-[8px] px-4 font-medium",
                made.length === 0 && "opacity-50"
              )}
            >
              保存
            </span>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
