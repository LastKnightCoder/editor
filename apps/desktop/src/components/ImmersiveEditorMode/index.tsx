import { useEffect, useRef } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Descendant } from "slate";
import PortalToBody from "@/components/PortalToBody";
import { Editor, EditorRef } from "@tau/editor/src";
import type IExtension from "@tau/editor/src/extensions/types";
import { useTypewriterScroll } from "./useTypewriterScroll";
import useSettingStore from "@/stores/useSettingStore";

interface ImmersiveEditorModeProps {
  initValue: Descendant[];
  onChange: (content: Descendant[]) => void;
  onInit: (editor: any, content: Descendant[]) => void;
  onExit: () => void;
  wordCount: number;
  readonly: boolean;
  extensions: IExtension[];
}

/**
 * 沉浸编辑模式组件
 * 提供全屏、无干扰的写作环境，带有打字机滚动效果
 */
export default function ImmersiveEditorMode({
  initValue,
  onChange,
  onInit,
  onExit,
  wordCount,
  readonly,
  extensions,
}: ImmersiveEditorModeProps) {
  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const darkMode = useSettingStore((state) => state.setting.darkMode);

  // 打字机滚动
  const scrollToCursor = useTypewriterScroll({
    enabled: !readonly,
    containerRef,
    editorRef,
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
        onExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  // 自动聚焦编辑器
  useEffect(() => {
    const timer = setTimeout(() => {
      editorRef.current?.focus();
    }, 100);

    return () => {
      clearTimeout(timer);
      // 清理 onChange 的防抖定时器
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <PortalToBody>
      {/* 全屏遮罩层 */}
      <div
        className="fixed border-20 border-transparent inset-0 z-1001 backdrop-blur-[10px] bg-white/95 dark:bg-[#1e1e1e]/95"
        onClick={onExit}
      >
        {/* 内容容器 */}
        <div
          className="w-full h-full flex items-center justify-center relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 退出按钮 */}
          <div
            className="fixed top-[30px] right-[30px] w-[50px] h-[50px] rounded-full bg-black/10 hover:bg-black/20 hover:scale-110 flex items-center justify-center cursor-pointer transition-all z-10"
            onClick={onExit}
            title="退出沉浸模式 (ESC)"
          >
            <CloseOutlined className="text-lg" />
          </div>

          {/* 编辑器滚动容器 */}
          <div
            ref={containerRef}
            className="w-full max-w-[1200px] h-full overflow-y-auto overflow-x-hidden py-[10vh] px-12 box-border scroll-smooth"
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
              ref={editorRef}
              initValue={initValue}
              onChange={handleChange}
              onInit={onInit}
              extensions={extensions}
              readonly={readonly}
            />
          </div>

          {/* 字数统计 */}
          <div className="fixed bottom-[30px] right-[30px] px-4 py-2 bg-black/10 rounded-[20px] text-sm z-10">
            字数: {wordCount}
          </div>
        </div>
      </div>
    </PortalToBody>
  );
}
