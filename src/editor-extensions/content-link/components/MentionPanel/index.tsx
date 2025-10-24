import { memo, useEffect, useLayoutEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useDebounceFn } from "ahooks";
import { Editor } from "slate";
import IExtension from "@/components/Editor/extensions/types";
import { searchContent, getAllIndexResults } from "@/utils/search";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import useMentionPanelStore from "../../stores/useMentionPanelStore";
import { cleanupMentionPanel } from "../../plugins/withMentionCommands";
import List from "./List";

import styles from "./index.module.less";

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

  // 使用 Popover API 控制显示/隐藏
  useEffect(() => {
    const popover = panelRef.current;
    if (!popover) return;

    if (mentionPanelVisible) {
      try {
        popover.showPopover();
      } catch (e) {
        // 如果浏览器不支持 popover API，静默失败
        console.warn("Popover API not supported", e);
      }
    } else {
      try {
        popover.hidePopover();
      } catch (e) {
        // 静默失败
      }
    }
  }, [mentionPanelVisible]);

  // 监听 popover 关闭事件（点击外部或按 ESC）
  useEffect(() => {
    const popover = panelRef.current;
    if (!popover) return;

    const handleToggle = (e: Event) => {
      // @ts-ignore - ToggleEvent is not yet in TypeScript types
      if (e.newState === "closed" && mentionPanelVisible) {
        reset();
        // 卸载面板
        setTimeout(() => {
          cleanupMentionPanel(editor);
        }, 0);
      }
    };

    popover.addEventListener("toggle", handleToggle);
    return () => {
      popover.removeEventListener("toggle", handleToggle);
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

  // 动态计算弹窗位置
  useLayoutEffect(() => {
    if (!panelRef.current || !mentionPanelVisible) return;

    const panelRect = panelRef.current.getBoundingClientRect();
    const pageHeight = document.body.clientHeight;
    const pageWidth = document.body.clientWidth;

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
    if (bottomSpace < panelRect.height + 10) {
      finalTop = position.y - panelRect.height;
    }

    // 确保不超出屏幕边界
    finalLeft = Math.max(
      10,
      Math.min(finalLeft, pageWidth - panelRect.width - 10),
    );
    finalTop = Math.max(
      10,
      Math.min(finalTop, pageHeight - panelRect.height - 10),
    );

    setPanelPosition({ left: finalLeft, top: finalTop });
  }, [position, mentionPanelVisible, searchResults, loading]);

  return (
    <div
      ref={panelRef}
      // @ts-ignore - popover is a valid HTML attribute
      popover="auto"
      className={styles.mentionPanel}
      style={{ left: panelPosition.left, top: panelPosition.top }}
    >
      {loading && (
        <div className={styles.loading}>
          <LoadingOutlined />
        </div>
      )}
      {!loading && searchResults.length === 0 && (
        <div className={styles.empty}>
          <Empty description="没有找到相关内容" />
        </div>
      )}
      {!loading && searchResults.length > 0 && <List extensions={extensions} />}
    </div>
  );
});

export default MentionPanel;
