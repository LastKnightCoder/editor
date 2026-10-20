/**
 * @ 引用面板（D-048 二轮换皮，外观与输入框 ＋ 面板同一套 ComposerPanel）：
 *  - 编辑器在对话输入框里（祖先带 COMPOSER_ANCHOR_ATTR）→ 从输入框上沿向上展开、与外框同宽；
 *  - 其它编辑器（文档正文等）→ 仍跟随光标，320px 宽，优先右下、空间不够翻转。
 * 搜索 / 键盘（↑↓ Enter Esc Backspace 在 hotkeys/mentionCommand）/ 选中逻辑不变。
 */

import { memo, useEffect, useLayoutEffect, useState, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useDebounceFn } from "ahooks";
import { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { Search } from "lucide-react";
import { Spinner } from "@tau/ui";
import { searchContent, getAllIndexResults } from "@/utils/search";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import { COMPOSER_ANCHOR_ATTR, ComposerPanel, ComposerPanelFooter } from "@tau/shared";
import useMentionPanelStore from "../../stores/useMentionPanelStore";
import { cleanupMentionPanel } from "../../plugins/withMentionCommands";
import List from "./List";
import { isMentionableResult } from "@/services/plugin-entity-kinds";

interface IMentionPanelProps {
  editor: Editor;
}

const GAP = 8;
const CARET_PANEL_WIDTH = 320;

/** 编辑器所在的对话输入框外框（不在输入框里返回 null） */
const findComposerAnchor = (editor: Editor): HTMLElement | null => {
  try {
    const el = ReactEditor.toDOMNode(editor as ReactEditor, editor);
    return el.closest<HTMLElement>(`[${COMPOSER_ANCHOR_ATTR}]`);
  } catch {
    return null;
  }
};

const MentionPanel = memo((props: IMentionPanelProps) => {
  const { editor } = props;
  const modelInfo = useEmbeddingConfig();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ left: 0, top: 0 });

  // 从 context store 获取状态
  const {
    mentionPanelVisible,
    position,
    inputValue,
    trigger,
    searchResults,
    loading,
    setSearchResults,
    setLoading,
    reset,
  } = useMentionPanelStore(state => ({
    mentionPanelVisible: state.mentionPanelVisible,
    position: state.position,
    inputValue: state.inputValue,
    trigger: state.trigger,
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
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
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
          types: ["card", "article", "project-item", "plugin-entity"],
          limit: 10,
          modelInfo,
        });
        setSearchResults(results.filter(isMentionableResult));
      } catch (error) {
        console.error("搜索失败:", error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    },
    { wait: 300 }
  );

  // 当输入值变化时触发搜索
  useEffect(() => {
    if (!mentionPanelVisible) return;

    const query = inputValue.slice(trigger.length);
    if (!query) {
      // 只有触发词时，显示所有最近的文档
      setLoading(true);
      getAllIndexResults()
        .then(results => {
          setSearchResults(results.filter(isMentionableResult).slice(0, 10));
        })
        .catch(error => {
          console.error("获取所有文档失败:", error);
          setSearchResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // 有关键字时进行搜索
      debouncedSearch(query);
    }
  }, [inputValue, trigger, mentionPanelVisible, debouncedSearch, setSearchResults, setLoading]);

  // 定位：对话输入框里贴外框上沿，否则跟随光标
  useLayoutEffect(() => {
    if (!panelRef.current || !mentionPanelVisible) return;

    const composer = findComposerAnchor(editor);
    if (composer) {
      const rect = composer.getBoundingClientRect();
      setPanelStyle({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + GAP,
        maxHeight: Math.max(160, rect.top - GAP * 2),
      });
      return;
    }

    const panelRect = panelRef.current.getBoundingClientRect();
    const pageHeight = window.innerHeight;
    const pageWidth = window.innerWidth;

    // 优先放在右下角，右侧 / 下方空间不够时翻转
    let finalLeft = position.x + 10;
    let finalTop = position.y + 4;
    if (pageWidth - position.x < panelRect.width + 10) {
      finalLeft = position.x - panelRect.width - 10;
    }
    if (pageHeight - position.y < panelRect.height + GAP) {
      finalTop = position.y - panelRect.height - 24;
      if (finalTop < GAP) {
        finalTop = pageHeight - panelRect.height - GAP;
      }
    }
    finalLeft = Math.max(GAP, Math.min(finalLeft, pageWidth - panelRect.width - GAP));
    finalTop = Math.max(GAP, finalTop);

    setPanelStyle({ left: finalLeft, top: finalTop, width: CARET_PANEL_WIDTH });
  }, [position, mentionPanelVisible, searchResults, loading, editor]);

  if (!mentionPanelVisible) return null;

  const query = inputValue.slice(trigger.length);

  return createPortal(
    <ComposerPanel
      ref={panelRef}
      className="fixed z-[250] max-w-[calc(100vw-16px)]"
      style={panelStyle}
    >
      <div className="text-tau-body text-ink-1 flex items-center gap-2 px-3.5 pb-1 pt-3">
        <Search size={15} strokeWidth={1.75} className="text-ink-3 shrink-0" />
        <span className="min-w-0 truncate">
          {query ? (
            <>
              {trigger}
              <span className="text-accent-text">{query}</span>
            </>
          ) : (
            <span className="text-ink-3">最近内容</span>
          )}
        </span>
        {loading && <Spinner className="ml-auto size-3.5 border-[1.5px]" />}
      </div>
      {!loading && searchResults.length === 0 ? (
        <div className="text-tau-sm text-ink-3 px-3.5 pb-4 pt-3">没有找到相关内容</div>
      ) : (
        <List query={query} />
      )}
      <ComposerPanelFooter
        hints={[
          ["↑↓", "选择"],
          ["Enter", "引用"],
          ["Esc", "关闭"],
        ]}
      />
    </ComposerPanel>,
    document.body
  );
});

export default MentionPanel;
