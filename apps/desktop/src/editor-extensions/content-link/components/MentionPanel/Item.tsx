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
        "relative mx-1 mb-0.5 flex min-h-[48px] cursor-pointer items-center rounded-[14px] px-3 py-2.5 transition-all duration-150",
        "hover:bg-white/60 dark:hover:bg-slate-400/15",
        "active:scale-[0.98]",
        {
          "bg-[var(--th-accent)]/10": active,
        }
      )}
    >
      <div className="bg-[var(--th-accent)]/12 border-[var(--th-accent)]/20 absolute right-3 top-2.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--th-accent)] backdrop-blur-sm">
        {typeMap[item.type] || item.type}
      </div>
      <ErrorBoundary>
        <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-[100px] text-[13px]">
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
