import { useCompanion } from "../state/store";
import { useController } from "./context";

/**
 * 页面笔记页签：嵌入扩展自己的笔记页（iframe）。Tau 编辑器在那个独立文档里运行——
 * 编辑器的选区读取与浮层都按普通页面工作，不受网页与 Shadow DOM 影响，也只在打开本页签时加载。
 */
export function NoteTab() {
  const controller = useController();
  // 换页（SPA 路由）时地址随之变化，笔记页按新页面重新载入草稿
  const pageUrl = useCompanion(state => state.pageUrl);
  return (
    <iframe
      title="页面笔记"
      src={controller.noteUrl(pageUrl)}
      className="min-h-0 w-full flex-1 border-0 bg-transparent"
    />
  );
}
