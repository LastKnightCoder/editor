import { useContext, useEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { FileSymlink, Highlighter, MessageSquarePlus, TextQuote } from "lucide-react";
import type { EditorRef } from "@tau/editor";
import type { NodeTreeEditor } from "@tau/editor-collab";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { Editor, Range, Text, Transforms } from "slate";
import { AppContext } from "../../../app/AppContext";
import { toast } from "../../../components/toast";
import { getNavigator } from "../../../router";
import { Z_INDEX } from "../../../router/zIndex";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";
import * as tauri from "../../../services/tauri";
import {
  getContentLength,
  isEditorContentEmpty,
  normalizeEditorContent,
} from "../editorContentUtils";
import { applyHighlightMark, HIGHLIGHT_OPTIONS } from "../editorToolbar/toolbarActions";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import type { ReadingModeState } from "./useReadingMode";

const ICON_SIZE = 20;
/** 标注栏高度（h-14）与离安全区上沿的间距 */
const BAR_HEIGHT = 56;
const BAR_GAP = 12;
const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";
/** 与 --tau-ease-out 同一曲线 */
const TAU_EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** 标注条高亮取第一个非默认色 */
const READING_HIGHLIGHT_VALUE = HIGHLIGHT_OPTIONS.find(option => option.value)?.value;

type ReadingSelectionBarProps = {
  editorRef: RefObject<EditorRef | null>;
  controller: MobileEditorToolbarController;
  readingMode: ReadingModeState;
  /** useReadingSelection 的选区；null 时不显示 */
  range: Range | null;
  /** 清空选区（DOM 与 range） */
  onClear: () => void;
  portalContainer?: HTMLElement | null;
};

function getSlateEditor(editorRef: RefObject<EditorRef | null>): Editor | null {
  return (editorRef.current?.getEditor() as Editor | undefined) ?? null;
}

function isRangeValid(editor: Editor, range: Range): boolean {
  return Editor.hasPath(editor, range.anchor.path) && Editor.hasPath(editor, range.focus.path);
}

/** range 覆盖到的每段文字都已高亮 */
function isRangeHighlighted(editor: Editor, range: Range): boolean {
  let covered = false;
  for (const [node, path] of Editor.nodes(editor, { at: range, match: Text.isText })) {
    const overlap = Range.intersection(range, Editor.range(editor, path));
    if (!overlap || Range.isCollapsed(overlap)) continue;
    if (!(node as { highlight?: unknown }).highlight) return false;
    covered = true;
  }
  return covered;
}

function SelectionBarButton(props: { label: string; icon: ReactNode; onPress: () => void }) {
  return (
    <button
      type="button"
      // 阻止默认行为：点按钮时保留正文的 DOM 选区
      onPointerDown={event => event.preventDefault()}
      onClick={props.onPress}
      className="text-ink-1 active:bg-press flex h-12 flex-1 flex-col items-center justify-center gap-[3px] rounded-xl text-[11px]"
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

/** 阅读态选中文字后底部浮出的标注条：高亮、批注、摘录成卡片、引用内容 */
export function ReadingSelectionBar(props: ReadingSelectionBarProps) {
  const { editorRef, controller, readingMode, range, onClear, portalContainer } = props;
  // 可选读取：宿主不在 AppContext 内时摘录后不刷新卡片列表
  const app = useContext(AppContext);
  const portalRoot = portalContainer ?? (typeof document === "undefined" ? null : document.body);
  const editor = getSlateEditor(editorRef);
  const activeRange =
    range && editor && readingMode.canEdit && !readingMode.editing && isRangeValid(editor, range)
      ? range
      : null;
  const highlighted = !!activeRange && !!editor && isRangeHighlighted(editor, activeRange);
  const visible = activeRange !== null;

  // 与配件栏同一遮挡变量：标注栏浮在正文底部时，滚动容器据此留白，末尾内容不被盖住
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.style.setProperty(OCCLUSION_VAR, `${BAR_HEIGHT + BAR_GAP}px`);
    return () => {
      root.style.removeProperty(OCCLUSION_VAR);
    };
  }, [visible]);

  /** 取当前可用的编辑器与选区；选区已失效时清空并返回 null */
  const resolveTarget = (): { editor: Editor; range: Range } | null => {
    const currentEditor = getSlateEditor(editorRef);
    if (!range || !currentEditor || !isRangeValid(currentEditor, range)) {
      onClear();
      return null;
    }
    return { editor: currentEditor, range };
  };

  const handleHighlight = () => {
    const target = resolveTarget();
    if (!target) return;
    const wasHighlighted = isRangeHighlighted(target.editor, target.range);
    Transforms.select(target.editor, target.range);
    applyHighlightMark(target.editor, wasHighlighted ? undefined : READING_HIGHLIGHT_VALUE);
    Transforms.deselect(target.editor);
    onClear();
  };

  /** 进入编辑并选中后执行配件栏操作；全部在点击内同步完成 */
  const runInEditing = (actionId: "comment" | "content-link") => {
    const target = resolveTarget();
    if (!target) return;
    readingMode.enterEditingWithSelection(target.range);
    controller.executeAction(actionId);
  };

  const handleExcerpt = () => {
    const target = resolveTarget();
    if (!target) return;
    const content = normalizeEditorContent(Editor.fragment(target.editor, target.range));
    const contracts = (target.editor as Partial<NodeTreeEditor>).nodeTree?.contracts.toJSON() as
      | ContentContractDictionary
      | undefined;
    onClear();
    if (isEditorContentEmpty(content)) return;
    void (async () => {
      try {
        const created = await tauri.createQuickCard({
          content,
          contracts,
          count: getContentLength(content),
        });
        toast({
          type: "success",
          text: "已摘录为卡片",
          action: {
            label: "查看",
            onClick: () => getNavigator().push("contentDetail", { cardId: created.id }),
          },
        });
        void app?.refreshCardsSafe({ page: 1 });
      } catch (error) {
        const parsed = parseInvokeError(error);
        toast.error(mapErrorToMessage(parsed.code, parsed.message || "摘录失败，请稍后重试"));
      }
    })();
  };

  if (!portalRoot) return null;

  return createPortal(
    <AnimatePresence>
      {activeRange ? (
        <motion.div
          key="reading-selection-bar"
          role="toolbar"
          aria-label="标注"
          data-reading-selection-bar="true"
          className="bg-surface border-line-1 shadow-float fixed inset-x-3 flex h-14 items-center rounded-2xl border px-1"
          style={{
            zIndex: Z_INDEX.POPOVER,
            bottom: `calc(var(--mobile-safe-bottom) + ${BAR_GAP}px)`,
          }}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ duration: 0.18, ease: TAU_EASE_OUT }}
        >
          <SelectionBarButton
            label={highlighted ? "取消高亮" : "高亮"}
            icon={<Highlighter size={ICON_SIZE} />}
            onPress={handleHighlight}
          />
          <SelectionBarButton
            label="批注"
            icon={<MessageSquarePlus size={ICON_SIZE} />}
            onPress={() => runInEditing("comment")}
          />
          <SelectionBarButton
            label="摘录成卡片"
            icon={<TextQuote size={ICON_SIZE} />}
            onPress={handleExcerpt}
          />
          <SelectionBarButton
            label="引用内容"
            icon={<FileSymlink size={ICON_SIZE} />}
            onPress={() => runInEditing("content-link")}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    portalRoot
  );
}

export default ReadingSelectionBar;
