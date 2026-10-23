// 建卡/编辑表单（五题型）。题干与背面补充为 @tau/editor 富文本编辑（工具栏裁剪为基础
// 格式集），新建态与编辑态同构——编辑器原生读写 Slate JSON，桌面端富文本可无损往返。
// cloze：选中文字「设为填空」，填空块的答案/备选答案经 ✎ 配置（BottomSheet）。

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMobileFlashcardKit } from "../../services/editorKit";
import { Editor, type EditorRef } from "@tau/editor";
import type { Descendant } from "slate";
import type { Editor as SlateEditor } from "slate";
import { PageHeader } from "../../components/PageHeader";
import { useBackHandler } from "../../router";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { useEdgeFade } from "../../hooks/useScrollState";
import { toast } from "../../components/toast";
import * as tauri from "../../services/tauri";
import { invalidateFlashcardQueries, useFlashcardDecks } from "./queries";
import { extractBlanks } from "./reviewFlow";
import { genId } from "./cardDraft";
import { toggleBlank } from "./blank/flashcardBlankTransforms";
import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../cards/editorToolbar/useMobileEditorToolbarController";
import { createEmptyEditorContent, isEditorContentEmpty } from "../cards/editorContentUtils";
import {
  FLASHCARD_DIFFICULTY_LABEL,
  FLASHCARD_TYPE_META,
  FLASHCARD_TYPE_ORDER,
  FLASHCARD_TYPE_TONE,
} from "./constants";
import type { Flashcard, FlashcardDifficulty, FlashcardType } from "./types";

// 轻纸面：非核心输入无底色无边框，光标即焦点反馈（对齐 card-edit-redesign-a 方案）
const bareInputClass =
  "w-full resize-none rounded-none border-0 bg-transparent px-1 py-2 text-[14px] font-semibold text-ink-1 outline-none placeholder:font-medium placeholder:text-ink-3";

const editorClass =
  "bg-transparent text-ink-1 min-h-[110px] w-full px-1 py-1.5 text-[16px] font-bold leading-[1.7] outline-none";

/** 配件栏与 Aa 面板裁剪为基础格式集，且与复习渲染器 RichContent 的能力对齐（能编辑的就能渲染）；
 *  高亮/链接/图片/插入面板（表格/公式等重节点）不在其中，仍可在桌面端插入 */
const FLASHCARD_TOOLBAR_BUTTONS = new Set<AccessoryItemId>([
  "style",
  "bulleted-list",
  "outdent",
  "indent",
  "undo",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "block-paragraph",
  "block-heading",
  "block-bulleted-list",
  "block-numbered-list",
  "block-quote",
]);

type CardEditPageProps = {
  deckId: number;
  /** -1 表示新建 */
  cardId: number;
  /** 新建时的题型（编辑态忽略，以卡片数据为准） */
  type: FlashcardType;
  /** 从内容详情进入时携带的参考资料（仅新建生效） */
  reference?: { refType: "content"; contentId: number; title: string };
  onBack: () => void;
  onSaved: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function CardEditPage({
  deckId,
  cardId,
  type: initialType,
  reference,
  onBack,
  onSaved,
  onError,
}: CardEditPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const decksQuery = useFlashcardDecks();
  const [pageRootEl, setPageRootEl] = useState<HTMLDivElement | null>(null);

  const [card, setCard] = useState<Flashcard | null>(null);
  const [loaded, setLoaded] = useState(cardId === -1);
  const isEditing = cardId !== -1;

  const [cardType, setCardType] = useState<FlashcardType>(initialType);
  // 各自独立副本：同屏两个编辑器共享同一 EMPTY 引用会触发 slate WeakMap 映射冲突（findPath 崩溃）
  const [promptValue, setPromptValue] = useState<Descendant[]>(createEmptyEditorContent);
  const [detailValue, setDetailValue] = useState<Descendant[]>(createEmptyEditorContent);
  const [options, setOptions] = useState<Array<{ id: string; label: string; isCorrect: boolean }>>([
    { id: genId(), label: "", isCorrect: true },
    { id: genId(), label: "", isCorrect: false },
  ]);
  const [answerText, setAnswerText] = useState("");
  const [hintText, setHintText] = useState("");
  const [booleanAnswer, setBooleanAnswer] = useState(true);
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>("standard");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const promptEditorRef = useRef<EditorRef | null>(null);
  const detailEditorRef = useRef<EditorRef | null>(null);
  // 工具栏控制器绑定「当前聚焦」的编辑器：题干/背面两个编辑器共享一条工具栏
  const activeEditorRef = useRef<EditorRef | null>(null);
  const toolbarController = useMobileEditorToolbarController({ editorRef: activeEditorRef });

  useEffect(() => {
    if (cardId === -1) return;
    let cancelled = false;
    tauri
      .flashcardGetCard(cardId)
      .then(item => {
        // 用户可能在加载完成前已返回：迟到的 onBack 会多弹一层栈
        if (cancelled) return;
        if (!item) {
          toast({ type: "warning", text: "卡片不存在" });
          onBack();
          return;
        }
        setCard(item);
        setCardType(item.type);
        // 空数组（异常存量数据）兜底为空段落：编辑器 normalize 后回传空段落，
        // 若直接注入 [] 会与初始快照不等导致 dirty 误报（退出总弹确认）
        setPromptValue(
          Array.isArray(item.prompt) && item.prompt.length > 0
            ? (item.prompt as Descendant[])
            : createEmptyEditorContent()
        );
        setDetailValue(
          Array.isArray(item.detail) && item.detail.length > 0
            ? (item.detail as Descendant[])
            : createEmptyEditorContent()
        );
        setOptions(
          (item.data.options ?? []).map(option => ({
            id: option.id,
            label: option.label,
            isCorrect: option.isCorrect,
          }))
        );
        setAnswerText(item.data.answer ?? "");
        setHintText(item.data.hint ?? "");
        setBooleanAnswer(item.data.booleanAnswer ?? true);
        setExplanation(item.data.explanation ?? "");
        setDifficulty(item.difficulty);
        setTags(item.tags);
        setLoaded(true);
      })
      .catch(error => {
        if (!cancelled) onError(error, "加载卡片失败");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const clozeBlanks = useMemo(
    () => (cardType === "cloze" ? extractBlanks(promptValue) : []),
    [cardType, promptValue]
  );

  // dirty 语义 = 相对加载快照有改动（而非「有任何内容」），避免零修改也弹确认
  const draftSnapshot = JSON.stringify([
    cardType,
    promptValue,
    detailValue,
    options,
    answerText,
    hintText,
    booleanAnswer,
    explanation,
    difficulty,
    tags,
  ]);
  const initialSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (loaded && initialSnapshotRef.current === null) {
      initialSnapshotRef.current = draftSnapshot;
    }
  }, [loaded, draftSnapshot]);
  // 编辑器挂载后 Slate normalize 会回写一次等价内容（见 packages/editor 的
  // editor.mount-onchange 测试），回调里无法与用户输入区分；回写只发生在挂载后
  // 极短窗口内（转场未完、用户不可能已输入），窗口内的编辑器 onChange 刷新基线
  // 而不计入未保存改动
  const editorSettleDeadlineRef = useRef(0);
  useEffect(() => {
    if (loaded) editorSettleDeadlineRef.current = Date.now() + 600;
  }, [loaded]);
  const syncBaselineIfEditorSettling = () => {
    if (Date.now() < editorSettleDeadlineRef.current) initialSnapshotRef.current = null;
  };
  const dirty = loaded && draftSnapshot !== initialSnapshotRef.current;

  const requestExit = () => {
    if (dirty) setConfirmExit(true);
    else onBack();
  };

  // 系统返回/边缘侧滑走守卫：干净直接放行弹栈（handler 内严禁调 goBack——
  // 外层 historyBack 的并发守卫会拒绝嵌套调用，手势会被双重消费后无声失败）；
  // 有未保存改动则弹确认，确认后的退出走 goBackBypassed
  useBackHandler(() => {
    if (!dirty) return false;
    setConfirmExit(true);
    return true;
  });

  const handleToggleBlank = () => {
    const editor = promptEditorRef.current?.getEditor() as SlateEditor | undefined;
    if (!editor) return;
    const result = toggleBlank(editor);
    if (result === "needs-selection") {
      toast({ type: "info", text: "先选中要挖空的文字" });
      return;
    }
    toolbarController.syncSelection();
  };

  // 标签 chip：回车/逗号提交（去重），退格在空草稿时删末尾（输入框 onKeyDown）
  const commitTagDraft = () => {
    const value = tagDraft
      .trim()
      .replace(/[，,]+$/, "")
      .trim();
    if (value && !tags.includes(value)) {
      setTags(prev => [...prev, value]);
    }
    setTagDraft("");
  };

  const validate = (): string | null => {
    if (isEditorContentEmpty(promptValue)) return "请填写题干";
    switch (cardType) {
      case "single-choice":
      case "multiple-choice": {
        const filled = options.filter(option => option.label.trim() !== "");
        if (filled.length < 2) return "至少填写两个选项";
        if (!filled.some(option => option.isCorrect)) return "请标记正确答案";
        return null;
      }
      case "cloze":
        if (clozeBlanks.length === 0) return "题干中至少设置一个填空（选中文字点「设为填空」）";
        return null;
      case "qa":
        if (!answerText.trim()) return "请填写参考答案";
        return null;
      default:
        return null;
    }
  };

  const buildData = (): Record<string, unknown> => {
    // 以原卡 data 为底合并：桌面端写入的 hint/referenceNotes 等字段不能被静默清空
    const base: Record<string, unknown> = {
      ...((isEditing ? card?.data : null) as Record<string, unknown> | null),
      explanation: explanation.trim(),
      hint: hintText.trim(),
    };
    switch (cardType) {
      case "single-choice":
      case "multiple-choice":
        base.options = options
          .filter(option => option.label.trim() !== "")
          .map(option => ({
            id: option.id,
            label: option.label.trim(),
            isCorrect: option.isCorrect,
          }));
        break;
      case "qa":
        base.answer = answerText.trim();
        break;
      case "boolean":
        base.booleanAnswer = booleanAnswer;
        break;
    }
    return base;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      toast({ type: "warning", text: problem });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: cardType,
        // 编辑器原生 Slate JSON 直存（新建/编辑同构），杜绝提纯降级转换
        prompt: promptValue,
        detail: detailValue,
        data: buildData(),
        difficulty,
        tags,
      };
      if (isEditing) {
        await tauri.flashcardUpdateCard(cardId, payload);
      } else {
        await tauri.flashcardCreateCard({
          deckId,
          ...payload,
          references: reference ? [reference] : undefined,
        });
      }
      invalidateFlashcardQueries();
      toast({ type: "success", text: isEditing ? "已保存" : "闪卡已创建" });
      onSaved();
    } catch (error) {
      onError(error, "保存闪卡失败");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="bg-page flex h-full flex-col">
        <PageHeader title="编辑闪卡" onBack={onBack} />
        <div className="text-ink-3 grid flex-1 place-items-center text-[13px] font-semibold">
          加载中…
        </div>
      </div>
    );
  }

  const deckName = decksQuery.data?.find(
    item => item.id === (isEditing ? card?.deckId : deckId)
  )?.name;

  return (
    <div
      ref={setPageRootEl}
      className="mobile-kb-screen bg-page flex h-full flex-col"
      style={{ paddingBottom: "var(--page-bottom-inset)" }}
    >
      <PageHeader
        title={deckName ?? (isEditing ? "编辑闪卡" : "新建闪卡")}
        onBack={requestExit}
        actions={
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="text-accent text-[14.5px] font-extrabold disabled:opacity-50"
          >
            {saving ? "保存中" : "保存"}
          </button>
        }
      />
      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-floating-toolbar-scroll flex-1 overflow-y-auto"
      >
        <div className="flex flex-col gap-[18px] px-4 pt-2">
          {/* 题干（主角卡）：题型徽标 + 无底色编辑器 */}
          <div className="shadow-card bg-surface rounded-[22px] p-4">
            {isEditing ? (
              <span
                className="mb-2 inline-flex items-center gap-1 rounded-[9px] px-2.5 py-1 text-[11px] font-extrabold"
                style={{
                  background: FLASHCARD_TYPE_TONE[cardType].soft,
                  color: FLASHCARD_TYPE_TONE[cardType].color,
                }}
              >
                {FLASHCARD_TYPE_TONE[cardType].icon} {FLASHCARD_TYPE_META[cardType].label}
              </span>
            ) : (
              // 新建态：题型在这里切换（各入口直达编辑页时不再绕选题型页；
              // 切换后已填的题型专属内容保留在草稿里，切回即恢复）
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {FLASHCARD_TYPE_ORDER.map(type => {
                  const tone = FLASHCARD_TYPE_TONE[type];
                  const active = type === cardType;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCardType(type)}
                      className={`rounded-[9px] px-2.5 py-1 text-[11px] font-extrabold transition-colors ${
                        active ? "" : "bg-page text-ink-3 active:bg-hover"
                      }`}
                      style={active ? { background: tone.soft, color: tone.color } : undefined}
                    >
                      {tone.icon} {FLASHCARD_TYPE_META[type].label}
                    </button>
                  );
                })}
              </div>
            )}
            <Editor
              kit={getMobileFlashcardKit({ blanks: cardType === "cloze" })}
              ref={promptEditorRef}
              key={`prompt-${cardId}`}
              initValue={promptValue}
              // 编辑器 readonly 默认为 true，表单场景必须显式放开
              readonly={false}
              placeHolder={
                cardType === "cloze" ? "输入题干，选中文字后点「设为填空」" : "输入题目…"
              }
              className={editorClass}
              onFocus={() => {
                activeEditorRef.current = promptEditorRef.current;
                toolbarController.handleEditorFocus();
              }}
              onBlur={toolbarController.handleEditorBlur}
              onChange={value => {
                setPromptValue(value);
                syncBaselineIfEditorSettling();
                toolbarController.syncSelection();
              }}
              onSelectionChange={toolbarController.syncSelection}
            />
            {cardType === "cloze" ? (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onPointerDown={event => {
                    // 不抢编辑器焦点，保住 Slate 选区（同底部工具栏按钮的时序）
                    event.preventDefault();
                    event.stopPropagation();
                    handleToggleBlank();
                  }}
                  className="bg-accent-soft text-accent rounded-[12px] px-3 py-2 text-[12px] font-extrabold active:opacity-70"
                >
                  ▭ 设为填空
                </button>
                <span className="text-ink-3 text-[11px] font-semibold">
                  再点一次可取消 · 点填空块 ✎ 改答案 · 已设 {clozeBlanks.length} 处
                </span>
              </div>
            ) : null}
          </div>

          {/* 选项（单选/多选）：一张答案纸，行间发丝线，行内 textarea 自适应 */}
          {cardType === "single-choice" || cardType === "multiple-choice" ? (
            <div>
              <SectionLabel
                aux={`已标 ${options.filter(o => o.isCorrect && o.label.trim()).length} 个正确 · 点行切换`}
              >
                选项
              </SectionLabel>
              <div className="shadow-card bg-surface flex flex-col gap-2.5 rounded-[22px] p-2.5">
                {options.map((option, index) => (
                  <OptionRow
                    key={option.id}
                    index={index}
                    option={option}
                    multiple={cardType === "multiple-choice"}
                    canDelete={options.length > 2}
                    onLabelChange={label =>
                      setOptions(prev =>
                        prev.map(item => (item.id === option.id ? { ...item, label } : item))
                      )
                    }
                    onToggleCorrect={() =>
                      setOptions(prev =>
                        prev.map(item =>
                          item.id === option.id
                            ? {
                                ...item,
                                isCorrect: cardType === "multiple-choice" ? !item.isCorrect : true,
                              }
                            : cardType === "single-choice"
                              ? { ...item, isCorrect: false }
                              : item
                        )
                      )
                    }
                    onDelete={() => setOptions(prev => prev.filter(item => item.id !== option.id))}
                  />
                ))}
                {options.length < 6 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOptions(prev => [...prev, { id: genId(), label: "", isCorrect: false }])
                    }
                    className="text-accent w-full px-4 py-3 text-[13px] font-extrabold"
                  >
                    ＋ 添加选项
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 判断题答案 */}
          {cardType === "boolean" ? (
            <div className="px-2">
              <SectionLabel>答案</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map(value => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setBooleanAnswer(value)}
                    className={`rounded-[18px] border-2 py-4 font-extrabold ${
                      booleanAnswer === value
                        ? value
                          ? "bg-tag-1-soft text-tag-1 border-[var(--tau-tag-1)]"
                          : "bg-tag-5-soft text-danger border-[var(--tau-danger)]"
                        : "bg-surface text-ink-2 shadow-card border-transparent"
                    }`}
                  >
                    <span className="block text-[24px] leading-none">{value ? "✓" : "✕"}</span>
                    <span className="mt-1.5 block text-[13.5px]">{value ? "正确" : "错误"}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* 问答参考答案 / 提示：轻纸面裸输入，高度自适应 */}
          {cardType === "qa" ? (
            <div className="px-2">
              <SectionLabel>参考答案</SectionLabel>
              <AutoGrowTextarea
                value={answerText}
                onChange={setAnswerText}
                placeholder="复习时先自答再对照"
                className={`${bareInputClass} text-[15px] leading-[1.7]`}
              />
            </div>
          ) : null}
          {cardType === "qa" || cardType === "cloze" ? (
            <div className="px-2">
              <SectionLabel aux="选填 · 答题前可见">提示</SectionLabel>
              <AutoGrowTextarea
                value={hintText}
                onChange={setHintText}
                placeholder="给作答方向的提示"
                className={bareInputClass}
              />
            </div>
          ) : null}

          {/* 背面补充（富文本，保留卡片边界） */}
          <div className="shadow-card bg-surface rounded-[22px] p-4">
            <div className="text-ink-2 mb-1 text-[12px] font-extrabold">背面补充（选填）</div>
            <Editor
              kit={getMobileFlashcardKit({ blanks: false })}
              ref={detailEditorRef}
              key={`detail-${cardId}`}
              initValue={detailValue}
              readonly={false}
              placeHolder="翻面后与答案、解析一起展示"
              className={`${editorClass} min-h-[84px] text-[15px] font-semibold`}
              onFocus={() => {
                activeEditorRef.current = detailEditorRef.current;
                toolbarController.handleEditorFocus();
              }}
              onBlur={toolbarController.handleEditorBlur}
              onChange={value => {
                setDetailValue(value);
                syncBaselineIfEditorSettling();
                toolbarController.syncSelection();
              }}
              onSelectionChange={toolbarController.syncSelection}
            />
          </div>

          {/* 解析：轻纸面裸输入 */}
          <div className="px-2">
            <SectionLabel aux="选填 · 揭示答案时展示">解析</SectionLabel>
            <AutoGrowTextarea
              value={explanation}
              onChange={setExplanation}
              placeholder="帮助建立记忆锚点"
              className={bareInputClass}
            />
          </div>

          {/* 难度 + 标签 */}
          <div className="px-2">
            <SectionLabel>难度</SectionLabel>
            <div className="flex gap-2">
              {(Object.keys(FLASHCARD_DIFFICULTY_LABEL) as FlashcardDifficulty[]).map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDifficulty(item)}
                  className={`rounded-full border-[1.5px] px-[15px] py-2 text-[12.5px] font-bold transition-colors ${
                    difficulty === item
                      ? "border-ink-1 bg-ink-1 text-[var(--tau-ink-inverse)]"
                      : "border-line-1 text-ink-2"
                  }`}
                >
                  {FLASHCARD_DIFFICULTY_LABEL[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="px-2">
            <SectionLabel aux="回车添加 · 点 × 删除">标签</SectionLabel>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-[7px] pb-1.5">
                {tags.map((tag, index) => (
                  <span
                    key={tag}
                    className="bg-accent-soft text-ink-1 inline-flex items-center gap-1.5 rounded-full py-[7px] pl-3 pr-1.5 text-[12.5px] font-bold"
                  >
                    #{tag}
                    <button
                      type="button"
                      aria-label={`删除标签 ${tag}`}
                      onClick={() => setTags(prev => prev.filter((_, i) => i !== index))}
                      className="text-ink-2 hover:text-danger grid h-[18px] w-[18px] place-items-center text-[11px]"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <input
              value={tagDraft}
              onChange={event => setTagDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === "," || event.key === "，") {
                  event.preventDefault();
                  commitTagDraft();
                } else if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
                  setTags(prev => prev.slice(0, -1));
                }
              }}
              placeholder="输入后按回车，如：期货"
              className="text-ink-1 placeholder:text-ink-3 w-full bg-transparent px-1 pb-1 pt-1.5 text-[13px] font-semibold outline-none placeholder:font-medium"
            />
          </div>
        </div>
      </div>

      <MobileEditorBottomToolbar
        controller={toolbarController}
        portalContainer={pageRootEl}
        visibleButtons={FLASHCARD_TOOLBAR_BUTTONS}
      />

      <MobileConfirmDialog
        open={confirmExit}
        title="放弃编辑"
        description="内容尚未保存，确定退出吗？"
        danger
        confirmText="放弃"
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => {
          // 先关弹窗再返回：等弹窗播完 200ms 退场（MobileConfirmDialog 的固定时长），
          // 避免它保持满开度叠在页面退场转场上"跟着慢慢消失"
          setConfirmExit(false);
          window.setTimeout(onBack, 200);
        }}
      />
    </div>
  );
}

/** 轻纸面小节标题：品牌短杠 + 标签，右侧可挂操作提示 */
function SectionLabel({ children, aux }: { children: ReactNode; aux?: string }) {
  return (
    <div className="text-ink-2 mb-2 flex items-center gap-2 text-[12px] font-extrabold tracking-wide">
      <span className="bg-accent h-3.5 w-1 rounded-sm" />
      {children}
      {aux ? <span className="text-ink-3 ml-auto text-[10.5px] font-bold">{aux}</span> : null}
    </div>
  );
}

/** 高度自适应的多行输入：归零再测（scrollHeight 会被当前高度抬高），光标即焦点反馈 */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      className={className}
    />
  );
}

/** 单个选项行：textarea 自适应长高；超 4 行折叠为 3 行渐隐（聚焦/点按钮展开），点行或徽标切换正确 */
function OptionRow({
  index,
  option,
  multiple,
  canDelete,
  onLabelChange,
  onToggleCorrect,
  onDelete,
}: {
  index: number;
  option: { id: string; label: string; isCorrect: boolean };
  multiple: boolean;
  canDelete: boolean;
  onLabelChange: (label: string) => void;
  onToggleCorrect: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [foldable, setFoldable] = useState(false);

  const LINE_HEIGHT = 1.6;
  const FOLD_LINES = 4;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 归零再测拿纯内容高度；行数按 em 换算（字号 × 行距），与渲染样式一致
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
    setFoldable(el.scrollHeight / (14 * LINE_HEIGHT) > FOLD_LINES);
  }, [option.label]);

  const folded = foldable && !expanded;

  return (
    <div
      // 选中态与答题页一致：品牌色描边 + 品牌浅底 + 徽标反白（多选右侧 sage ✓ 同款）；
      // 徽标与右侧操作相对行内容垂直居中
      className={`shadow-card flex items-center gap-3 rounded-[16px] border-2 px-4 py-3 transition-colors ${
        option.isCorrect
          ? "border-accent bg-accent-soft"
          : "bg-page active:bg-hover border-transparent"
      }`}
      onClick={event => {
        // 点输入框正常聚焦编辑，点行其余区域（含徽标）切换正确
        if (event.target instanceof HTMLTextAreaElement) return;
        if (event.target instanceof HTMLButtonElement) return;
        onToggleCorrect();
      }}
    >
      <span
        className={`grid h-7 w-7 flex-none place-items-center rounded-[10px] text-[12.5px] font-extrabold ${
          option.isCorrect ? "bg-accent text-ink-inverse" : "bg-page text-ink-2"
        }`}
      >
        {String.fromCharCode(65 + index)}
      </span>
      <div className="min-w-0 flex-1">
        <textarea
          ref={ref}
          rows={1}
          value={option.label}
          placeholder={`选项 ${String.fromCharCode(65 + index)}`}
          onChange={event => onLabelChange(event.target.value)}
          onFocus={() => setExpanded(true)}
          className="text-ink-1 placeholder:text-ink-3 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[14px] font-semibold leading-[1.6] outline-none placeholder:font-medium"
          style={
            folded
              ? {
                  maxHeight: `calc(${FOLD_LINES - 1} * ${LINE_HEIGHT}em)`,
                  maskImage: "linear-gradient(180deg, #000 62%, transparent 98%)",
                  WebkitMaskImage: "linear-gradient(180deg, #000 62%, transparent 98%)",
                }
              : undefined
          }
        />
        {folded ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              setExpanded(true);
            }}
            className="text-accent px-0 pt-1.5 text-[11.5px] font-extrabold"
          >
            ⋯ 展开全文
          </button>
        ) : null}
      </div>
      {multiple ? (
        <span
          aria-hidden
          className={`grid h-[23px] w-[23px] flex-none place-items-center rounded-[7px] border-2 text-[11px] font-extrabold ${
            option.isCorrect
              ? "bg-tag-1 text-ink-inverse border-[var(--tau-tag-1)]"
              : "border-[var(--tau-ink-3)] text-transparent"
          }`}
        >
          ✓
        </span>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          aria-label="删除选项"
          onClick={event => {
            event.stopPropagation();
            onDelete();
          }}
          className="text-ink-3 active:text-danger flex-none p-1 text-[13px]"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
