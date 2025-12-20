import { memo, useEffect, useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useDebounceFn } from "ahooks";
import { Editor } from "slate";
import { Loader2, Search } from "lucide-react";
import { IExtension } from "@tau/editor/src";
import { searchContent, getAllIndexResults } from "@/utils/search";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import useMentionPanelStore from "../../stores/useMentionPanelStore";
import { cleanupMentionPanel } from "../../plugins/withMentionCommands";
import List from "./List";

interface IMentionPanelProps {
  extensions: IExtension[];
  editor: Editor;
}

const MentionPanel = memo((props: IMentionPanelProps) => {
  const { extensions, editor } = props;
  const modelInfo = useEmbeddingConfig();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState({ left: 0, top: 0 });

  // 从 context store 获取状态
  const {
    mentionPanelVisible,
    position,
    inputValue,
    searchResults,
    loading,
    setSearchResults,
    setLoading,
    reset,
  } = useMentionPanelStore((state) => ({
    mentionPanelVisible: state.mentionPanelVisible,
    position: state.position,
    inputValue: state.inputValue,
    searchResults: state.searchResults,
    loading: state.loading,
    setSearchResults: state.setSearchResults,
    setLoading: state.setLoading,
    reset: state.reset,
  }));

  // 点击外部关闭面板
  useEffect(() => {
    if (!mentionPanelVisible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        reset();
        // 卸载面板
        setTimeout(() => {
          cleanupMentionPanel(editor);
        }, 0);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mentionPanelVisible, reset, editor]);

  // 防抖搜索函数
  const { run: debouncedSearch } = useDebounceFn(
    async (query: string) => {
      setLoading(true);
      try {
        const results = await searchContent({
          query,
          types: ["card", "article", "project-item", "document-item"],
          limit: 10,
          modelInfo,
        });
        setSearchResults(results);
      } catch (error) {
        console.error("搜索失败:", error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    },
    { wait: 300 },
  );

  // 当输入值变化时触发搜索
  useEffect(() => {
    if (!mentionPanelVisible) return;

    if (inputValue === "@") {
      // 只有 @ 时，显示所有最近的文档
      setLoading(true);
      getAllIndexResults()
        .then((results) => {
          setSearchResults(results.slice(0, 10));
        })
        .catch((error) => {
          console.error("获取所有文档失败:", error);
          setSearchResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else if (inputValue.length > 1) {
      // 有关键字时进行搜索
      const query = inputValue.slice(1); // 移除 @
      debouncedSearch(query);
    }
  }, [
    inputValue,
    mentionPanelVisible,
    debouncedSearch,
    setSearchResults,
    setLoading,
  ]);

  // 动态计算弹窗位置（参考 BlockPanel 的实现）
  useLayoutEffect(() => {
    if (!panelRef.current || !mentionPanelVisible) return;

    const panelRect = panelRef.current.getBoundingClientRect();
    const pageHeight = window.innerHeight;
    const pageWidth = window.innerWidth;
    const gap = 8;

    // 计算右侧剩余空间
    const rightSpace = pageWidth - position.x;
    // 计算下方剩余空间
    const bottomSpace = pageHeight - position.y;

    // 优先放在右下角
    let finalLeft = position.x + 10;
    let finalTop = position.y;

    // 如果右侧空间不够，放在左侧
    if (rightSpace < panelRect.width + 10) {
      finalLeft = position.x - panelRect.width - 10;
    }

    // 如果下方空间不够，放在上方
    if (bottomSpace < panelRect.height + gap) {
      finalTop = position.y - panelRect.height;
      if (finalTop < gap) {
        finalTop = pageHeight - panelRect.height - gap;
      }
    }

    // 确保不超出屏幕边界
    finalLeft = Math.max(
      gap,
      Math.min(finalLeft, pageWidth - panelRect.width - gap),
    );
    finalTop = Math.max(gap, finalTop);

    setPanelPosition({ left: finalLeft, top: finalTop });
  }, [position, mentionPanelVisible, searchResults, loading]);

  if (!mentionPanelVisible) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed min-w-[180px] w-[360px] max-w-[90vw] max-h-[400px] flex flex-col m-0 p-2 rounded-[18px] bg-[rgba(248,250,255,0.92)] dark:bg-[rgba(10,15,28,0.85)] backdrop-blur-[18px] saturate-[180%] border border-white/45 dark:border-white/12 shadow-[0_18px_45px_rgba(15,23,42,0.25)] dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)] text-[rgba(15,23,42,0.95)] dark:text-[rgba(241,245,249,0.95)] z-[9999] animate-fadeIn"
      style={{
        left: panelPosition.left,
        top: panelPosition.top,
      }}
    >
      {loading && (
        <div className="flex flex-col justify-center items-center gap-3 py-10 px-5 text-indigo-500/80 dark:text-indigo-400/80">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-[13px] font-medium text-slate-800/70 dark:text-slate-300/70">
            正在搜索...
          </span>
        </div>
      )}
      {!loading && searchResults.length === 0 && (
        <div className="flex flex-col justify-center items-center gap-3 py-10 px-5 text-center text-slate-800/45 dark:text-slate-300/60">
          <Search className="w-12 h-12 opacity-50 stroke-[1.5]" />
          <div className="text-[13px] font-medium">没有找到相关内容</div>
        </div>
      )}
      {!loading && searchResults.length > 0 && <List extensions={extensions} />}
    </div>,
    document.body,
  );
});

export default MentionPanel;
