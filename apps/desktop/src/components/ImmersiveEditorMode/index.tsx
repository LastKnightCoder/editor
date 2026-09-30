import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Descendant, Range, Transforms } from "slate";
import { useMemoizedFn } from "ahooks";
import { ReactEditor } from "slate-react";
import PortalToBody from "@/components/PortalToBody";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import type IExtension from "@tau/editor/src/extensions/types";
import { useTypewriterScroll } from "./useTypewriterScroll";
import useSettingStore from "@/stores/useSettingStore";

export interface ImmersiveEditorExitPayload {
  selection: Range | null;
}

interface ImmersiveEditorModeProps {
  /** 实例特有扩展（如项目文档的卡片列表）；宿主通用扩展来自 kit，不必传 */
  extensions?: IExtension[];
  contentId?: number;
  initValue: Descendant[];
  initialSelection?: Range | null;
  onChange: (content: Descendant[]) => void;
  onInit: (editor: any, content: Descendant[]) => void;
  onExit: (payload: ImmersiveEditorExitPayload) => void;
  wordCount: number;
  readonly: boolean;
}

const cloneRange = (selection: Range | null): Range | null => {
  if (!selection) return null;
  return {
    anchor: {
      path: [...selection.anchor.path],
      offset: selection.anchor.offset,
    },
    focus: {
      path: [...selection.focus.path],
      offset: selection.focus.offset,
    },
  };
};

/**
 * 沉浸编辑模式组件
 * 提供全屏、无干扰的写作环境，带有打字机滚动效果
 */
export default function ImmersiveEditorMode({
  extensions,
  initValue,
  initialSelection,
  onChange,
  onInit,
  onExit,
  wordCount,
  readonly,
  contentId,
}: ImmersiveEditorModeProps) {
  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const darkMode = useSettingStore(state => state.setting.darkMode);

  // 打字机滚动
  const scrollToCursor = useTypewriterScroll({
    enabled: !readonly,
    containerRef,
    editorRef,
  });

  const handleExit = useMemoizedFn(() => {
    const selection = cloneRange(editorRef.current?.getEditor().selection ?? null);
    onExit({ selection });
  });

  // 包装 onChange，在内容变化时触发滚动
  const handleChange = (content: Descendant[]) => {
    onChange(content);

    // 清除之前的定时器
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
    }

    // 防抖：50ms 后触发滚动，确保 DOM 已更新且不会过于频繁
    changeTimeoutRef.current = setTimeout(() => {
      scrollToCursor();
    }, 50);
  };
  // ESC 键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleExit]);

  // 自动聚焦编辑器
  useEffect(() => {
    const timer = setTimeout(() => {
      const editor = editorRef.current?.getEditor();
      if (!editor) return;

      try {
        if (initialSelection) {
          Transforms.select(editor, initialSelection);
        }
        ReactEditor.focus(editor as any);
      } catch (error) {
        console.warn("恢复沉浸模式初始焦点失败:", error);
        editorRef.current?.focus();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      // 清理 onChange 的防抖定时器
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, [initialSelection]);

  return (
    <PortalToBody>
      {/* 全屏遮罩层 */}
      <div
        className="border-20 z-1001 fixed inset-0 border-transparent bg-white/95 backdrop-blur-[10px] dark:bg-[#1e1e1e]/95"
        onClick={handleExit}
      >
        {/* 内容容器 */}
        <div
          className="relative flex h-full w-full items-center justify-center"
          onClick={e => e.stopPropagation()}
        >
          {/* 退出按钮 */}
          <div
            className="fixed right-[30px] top-[30px] z-10 flex h-[50px] w-[50px] cursor-pointer items-center justify-center rounded-full bg-black/10 transition-all hover:scale-110 hover:bg-black/20"
            onClick={handleExit}
            title="退出沉浸模式 (ESC)"
          >
            <X size={18} strokeWidth={1.75} />
          </div>

          {/* 编辑器滚动容器 */}
          <div
            ref={containerRef}
            className="box-border h-full w-full max-w-[1200px] overflow-y-auto overflow-x-hidden scroll-smooth px-12 py-[10vh]"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: darkMode
                ? "rgba(255,255,255,0.4) transparent"
                : "rgba(0,0,0,0.3) transparent",
              fontSize: "24px",
              lineHeight: "1.8",
            }}
          >
            <Editor
              extensions={extensions}
              contentId={contentId}
              ref={editorRef}
              initValue={initValue}
              onChange={handleChange}
              onInit={onInit}
              readonly={readonly}
            />
          </div>

          {/* 字数统计 */}
          <div className="fixed bottom-[30px] right-[30px] z-10 rounded-[20px] bg-black/10 px-4 py-2 text-sm">
            字数: {wordCount}
          </div>
        </div>
      </div>
    </PortalToBody>
  );
}
