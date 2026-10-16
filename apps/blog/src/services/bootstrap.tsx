import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { getInitData, initTheme } from "@blog/utils";
import { getBlogKit } from "./editorKit";
import { blogMarkdown } from "./editorMarkdown";

/** 插件与样式就绪后才挂载编辑器，避免先显示未知节点再重建。 */
export async function mountBlogPage(page: ReactNode) {
  const root = document.getElementById("root");
  if (!root) throw new Error("页面缺少根节点");
  try {
    const data = getInitData();
    if (data.pluginRenderers?.length) {
      const { loadPublishedPlugins } = await import("./plugin-runtime");
      await loadPublishedPlugins(data.pluginRenderers);
      getBlogKit(data.settings);
      blogMarkdown.importFromMarkdown("");
    }
    initTheme();
    createRoot(root).render(
      <StrictMode>
        <UiProvider>{page}</UiProvider>
      </StrictMode>
    );
  } catch (error) {
    root.setAttribute("role", "alert");
    root.textContent = `页面加载失败：${error instanceof Error ? error.message : String(error)}`;
  }
}
