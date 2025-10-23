import { memo, useEffect, useMemo, useRef } from "react";
import { Empty } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useDebounceFn, useClickAway } from "ahooks";
import IExtension from "@/components/Editor/extensions/types";
import PortalToBody from "@/components/PortalToBody";
import { searchContent, getAllIndexResults } from "@/utils/search";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import useMentionPanelStore from "../../stores/useMentionPanelStore";
import List from "./List";

import styles from "./index.module.less";

interface IMentionPanelProps {
  extensions: IExtension[];
}

const MentionPanel = memo((props: IMentionPanelProps) => {
  const { extensions } = props;
  const modelInfo = useEmbeddingConfig();
  const panelRef = useRef<HTMLDivElement>(null);

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
  useClickAway(() => {
    if (mentionPanelVisible) {
      reset();
    }
  }, panelRef);

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

  const [left, top] = useMemo(() => {
    const pageHeight = document.body.clientHeight;
    const bottom = pageHeight - position.y;
    const panelHeight = 400;

    if (bottom < panelHeight) {
      return [position.x + 10, position.y - panelHeight];
    }

    return [position.x + 10, position.y];
  }, [position]);

  if (!mentionPanelVisible) return null;

  return (
    <PortalToBody>
      <div ref={panelRef} className={styles.mentionPanel} style={{ left, top }}>
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
        {!loading && searchResults.length > 0 && (
          <List extensions={extensions} />
        )}
      </div>
    </PortalToBody>
  );
});

export default MentionPanel;
