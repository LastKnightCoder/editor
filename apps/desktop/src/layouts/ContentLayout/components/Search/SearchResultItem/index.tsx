import Editor from "@/components/ContentEditor";
import { Tag } from "antd";
import { memo, useMemo } from "react";
import { SearchResult } from "@/types";

import styles from "./index.module.less";

// 搜索结果项组件
const SearchResultItem = memo(
  ({
    result,
    getRefTypeLabel,
    getTagColor,
    handleSearchResultClick,
  }: {
    result: SearchResult;
    getRefTypeLabel: (type: string) => string;
    getTagColor: (type: string) => string;
    handleSearchResultClick: (result: SearchResult) => void;
  }) => {
    const previewContent = useMemo(() => result.content.slice(0, 3), [result.content]);
    return (
      <div className={styles.item} onClick={() => handleSearchResultClick(result)}>
        <div>
          <Tag color={getTagColor(result.type)} style={{ marginBottom: 12, flexShrink: 0 }}>
            {getRefTypeLabel(result.type)}
          </Tag>
        </div>
        <Editor
          style={{
            flex: 1,
            overflow: "hidden",
          }}
          initValue={previewContent}
          readonly={true}
        />
      </div>
    );
  }
);

export default SearchResultItem;
