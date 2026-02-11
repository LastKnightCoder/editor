import { Editor } from "@tau/editor/src";
import { Tag } from "antd";
import { memo } from "react";
import { SearchResult } from "@/types";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

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
    const dynamicExtensions = useDynamicExtensionsStore(
      (state) => state.extensions,
    );
    return (
      <div
        className={styles.item}
        onClick={() => handleSearchResultClick(result)}
      >
        <div>
          <Tag
            color={getTagColor(result.type)}
            style={{ marginBottom: 12, flexShrink: 0 }}
          >
            {getRefTypeLabel(result.type)}
          </Tag>
        </div>
        <Editor
          style={{
            flex: 1,
            overflow: "hidden",
          }}
          initValue={result.content.slice(0, 3)}
          readonly={true}
          extensions={dynamicExtensions}
        />
      </div>
    );
  },
);

export default SearchResultItem;
