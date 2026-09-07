import { memo, useEffect, useRef } from "react";
import classnames from "classnames";
import { Editor } from "@tau/editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { IExtension } from "@tau/editor/src";
import { SearchResult } from "@/types";
import useTheme from "@/hooks/useTheme";

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

  return (
    <div
      onClick={onClick}
      ref={ref}
      className={classnames(
        "relative mx-1 mb-0.5 flex min-h-[48px] cursor-pointer items-center rounded-[14px] px-3 py-2.5 transition-all duration-150",
        "hover:bg-white/60 dark:hover:bg-slate-400/15",
        "active:scale-[0.98]",
        {
          "bg-indigo-500/10 dark:bg-indigo-400/15": active,
        }
      )}
    >
      <div className="bg-indigo-500/12 absolute right-3 top-2.5 rounded-lg border border-indigo-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-500 backdrop-blur-sm dark:border-indigo-400/25 dark:bg-indigo-400/15 dark:text-indigo-400">
        {typeMap[item.type] || item.type}
      </div>
      <ErrorBoundary>
        <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-[100px] text-[13px]">
          <Editor
            readonly={true}
            initValue={item.content.slice(0, 1)}
            extensions={extensions}
            theme={theme}
          />
        </div>
      </ErrorBoundary>
    </div>
  );
});

export default Item;
