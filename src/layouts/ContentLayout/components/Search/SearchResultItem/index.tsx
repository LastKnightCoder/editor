import Editor from "@/components/Editor";
import { Tag } from "antd";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
  documentCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { memo } from "react";
import { SearchResult } from "@/types";

import styles from "./index.module.less";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
  documentCardListExtension,
  questionCardExtension,
];

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
          extensions={customExtensions}
        />
      </div>
    );
  },
);

export default SearchResultItem;
