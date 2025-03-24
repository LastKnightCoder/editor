import React, { useRef, useState } from "react";
import { Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";

import EditText from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import Editor from "@/components/Editor";

import {
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
} from "@/editor-extensions";

import { searchFTS } from "@/commands";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";
import { formatDate } from "@/utils";

import styles from "./index.module.less";
import { SearchResult } from "@/types/search";
import useTheme from "@/hooks/useTheme";

interface ProjectItemSelectorProps {
  onSelect: (projectItem: SearchResult) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
];

const ProjectItemSelector: React.FC<ProjectItemSelectorProps> = ({
  onSelect,
}) => {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [searchedProjectItems, setSearchedProjectItems] = useState<
    SearchResult[]
  >([]);
  const [searching, setSearching] = useState(false);

  const searchProjectItems = useMemoizedFn(async () => {
    if (!search.trim()) {
      setSearchedProjectItems([]);
      return;
    }

    setSearching(true);
    try {
      console.time("searchProjectItems");
      const result = await searchFTS({
        query: search,
        types: ["project-item"],
        limit: 10,
      });
      setSearchedProjectItems(result);
      console.timeEnd("searchProjectItems");
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
    }
  });

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchedProjectItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 350,
    overscan: 3,
    getItemKey: (index) => searchedProjectItems[index].id,
    measureElement: (el) => {
      const item = el.firstElementChild;
      if (!item) return 350;
      return el.getBoundingClientRect().height;
    },
  });

  const handleProjectItemClick = useMemoizedFn((projectItem: SearchResult) => {
    onSelect(projectItem);
  });

  return (
    <div className={styles.container}>
      <div className={styles.searchHeader}>
        <div className={styles.searchIcon}>
          {searching ? <LoadingOutlined /> : <SearchOutlined />}
        </div>
        <EditText
          defaultValue=""
          contentEditable={true}
          onChange={setSearch}
          onPressEnter={searchProjectItems}
          className={styles.search}
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedProjectItems([]);
          }}
        />
      </div>
      <div className={styles.list} ref={listRef}>
        <If condition={searching}>
          <div className={styles.searching}>
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedProjectItems.length === 0}>
          <Empty description="无结果" />
        </If>
        <If condition={!searching && searchedProjectItems.length > 0}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const projectItem = searchedProjectItems[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    padding: "10px 0",
                  }}
                >
                  <div
                    className={styles.itemContainer}
                    onClick={handleProjectItemClick.bind(null, projectItem)}
                  >
                    <div className={styles.title}>{projectItem.title}</div>
                    <div className={styles.time}>
                      <span>
                        更新于：{formatDate(projectItem.updateTime, true)}
                      </span>
                    </div>
                    <ErrorBoundary>
                      <div className={styles.content}>
                        <Editor
                          readonly={true}
                          initValue={projectItem.content.slice(0, 3)}
                          extensions={customExtensions}
                          theme={theme}
                        />
                      </div>
                    </ErrorBoundary>
                  </div>
                </div>
              );
            })}
          </div>
        </If>
      </div>
    </div>
  );
};

export default ProjectItemSelector;
