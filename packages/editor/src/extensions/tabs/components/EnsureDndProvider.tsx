import { useContext, type ReactNode } from "react";
import { DndContext, DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

/**
 * 祖先已有 DndProvider 时直接透传（嵌套 Provider 会让内外拖拽分属两个 manager，
 * 跨组件拖放失效）；缺失时兜底补一层，使 tabs 组件在移动端、独立窗口等
 * 未包 Provider 的宿主中渲染不会因 "Expected drag drop context" 崩溃。
 */
const EnsureDndProvider = ({ children }: { children: ReactNode }) => {
  const { dragDropManager } = useContext(DndContext);
  if (dragDropManager) return <>{children}</>;
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
};

export default EnsureDndProvider;
