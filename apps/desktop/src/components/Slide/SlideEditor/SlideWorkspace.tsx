import { useEffect, useCallback, useState, useRef } from "react";
import useSlideStore from "@/stores/useSlideStore";
import NavigatorPanel from "./components/NavigatorPanel";
import InspectorPanel from "./components/InspectorPanel";
import SlideEditorView from "./components/SlideEditorView";

export type SlideEditorMode = "navigation" | "immersive" | "overview";

interface SlideWorkspaceProps {
  onStartPresent: () => void;
}

const SlideWorkspace = ({ onStartPresent }: SlideWorkspaceProps) => {
  const [editorMode, setEditorMode] = useState<SlideEditorMode>("navigation");
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const { init, currentDeckId, currentPageId } = useSlideStore((state) => ({
    init: state.init,
    currentDeckId: state.currentDeckId,
    currentPageId: state.currentPageId,
  }));

  useEffect(() => {
    init();
  }, [init]);

  // 快捷键绑定
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // F11: 切换沉浸模式
      if (event.key === "F11") {
        event.preventDefault();
        setEditorMode((prev) =>
          prev === "immersive" ? "navigation" : "immersive",
        );
        return;
      }

      // Ctrl/Cmd + Enter: 新增页面
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        // 新增页面逻辑将在 NavigatorPanel 中处理
        return;
      }

      // Ctrl/Cmd + G: Goto Slide
      if ((event.ctrlKey || event.metaKey) && event.key === "g") {
        event.preventDefault();
        // TODO: 显示 Goto Slide 命令面板
        return;
      }

      // F5 或 Ctrl/Cmd + Shift + P: 开始演示
      if (
        event.key === "F5" ||
        ((event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.key === "p")
      ) {
        event.preventDefault();
        onStartPresent();
        return;
      }
    },
    [onStartPresent],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // 沉浸模式：只显示编辑区
  if (editorMode === "immersive") {
    return (
      <div className="flex w-full h-full bg-gray-50 dark:bg-[#0c0f17]">
        <div className="flex-1 p-4 relative" ref={editorContainerRef}>
          <SlideEditorView
            isImmersive
            onExitImmersive={() => setEditorMode("navigation")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-full bg-gray-50 dark:bg-[#0c0f17]">
      {/* 左侧导航面板 */}
      <NavigatorPanel
        collapsed={navigatorCollapsed}
        onToggleCollapse={() => setNavigatorCollapsed(!navigatorCollapsed)}
        onStartPresent={onStartPresent}
      />

      {/* 中央编辑区 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative" ref={editorContainerRef}>
        <SlideEditorView />
      </div>

      {/* 右侧属性面板 */}
      {currentDeckId && currentPageId && (
        <InspectorPanel
          collapsed={inspectorCollapsed}
          onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
        />
      )}
    </div>
  );
};

export default SlideWorkspace;
