import { memo, useEffect, useRef } from "react";
import classnames from "classnames";
import { Editor, EditorServicesProvider } from "@tau/editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { IExtension } from "@tau/editor/src";
import { SearchResult } from "@/types";
import useTheme from "@/hooks/useTheme";
import { createEditorServices } from "@/services/editorServices";

interface IItemProps {
  item: SearchResult;
  active: boolean;
  extensions: IExtension[];
  onClick?: () => void;
}

const typeMap: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目",
  "document-item": "文档",
};

// 缓存 EditorServices 实例，避免重复创建
let cachedEditorServices: ReturnType<typeof createEditorServices> | null = null;

const getEditorServices = () => {
  if (!cachedEditorServices) {
    cachedEditorServices = createEditorServices();
  }
  return cachedEditorServices;
};

const Item = memo((props: IItemProps) => {
  const { item, active, extensions, onClick } = props;
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (active) {
      // 滚动到可视区域
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, [active]);

  const services = getEditorServices();

  return (
    <div
      onClick={onClick}
      ref={ref}
      className={classnames(
        "min-h-[48px] flex items-center py-2.5 px-3 mx-1 mb-0.5 rounded-[14px] cursor-pointer relative transition-all duration-150",
        "hover:bg-white/60 dark:hover:bg-slate-400/15",
        "active:scale-[0.98]",
        {
          "bg-indigo-500/10 dark:bg-indigo-400/15": active,
        },
      )}
    >
      <div className="absolute top-2.5 right-3 py-1 px-2.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider bg-indigo-500/12 dark:bg-indigo-400/15 text-indigo-500 dark:text-indigo-400 backdrop-blur-sm border border-indigo-500/20 dark:border-indigo-400/25">
        {typeMap[item.type] || item.type}
      </div>
      <ErrorBoundary>
        <div className="text-[13px] overflow-hidden text-ellipsis whitespace-nowrap pr-[100px] flex-1">
          <EditorServicesProvider services={services}>
            <Editor
              readonly={true}
              initValue={item.content.slice(0, 1)}
              extensions={extensions}
              theme={theme}
            />
          </EditorServicesProvider>
        </div>
      </ErrorBoundary>
    </div>
  );
});

export default Item;
