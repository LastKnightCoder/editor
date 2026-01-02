import { useEffect, memo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import isHotkey from "is-hotkey";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import "@tmikeladze/react-cmdk/dist/cmdk.css";
import { Empty } from "antd";
import { SearchResult } from "@/types";
import classnames from "classnames";
import { LoadingOutlined, SearchOutlined } from "@ant-design/icons";
import EditText, { EditTextHandle } from "@/components/EditText";
import If from "@/components/If";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import SearchResultItem from "./SearchResultItem";
import {
  getProjectItemById,
  getRootDocumentsByDocumentItemId,
} from "@/commands";

const Search = memo(() => {
  const { isDark } = useTheme();
  const openInNewTab = useTabStore((state) => state.openInNewTab);

  const searchRef = useRef<EditTextHandle>(null);
  const lastSearchText = useRef("");
  const resultsListRef = useRef<HTMLDivElement>(null);

  const { open, searchLoading, searchResults, onSearch } = useCommandPanelStore(
    useShallow((state) => ({
      open: state.open,
      searchLoading: state.searchLoading,
      searchResults: state.searchResults,
      onSearch: state.onSearch,
    })),
  );

  const resultsVirtualizer = useVirtualizer({
    count: searchResults.length,
    getScrollElement: () => resultsListRef.current,
    estimateSize: () => 240,
    overscan: 5,
  });

  const onClickMask = useMemoizedFn(() => {
    useCommandPanelStore.setState({ open: false });
  });

  const onPressEnter = async () => {
    const searchText = searchRef.current?.getValue();
    if (!searchText) {
      return;
    }
    await onSearch(searchText);
    searchRef.current?.focusEnd();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey("mod+k", e)) {
        e.preventDefault();
        useCommandPanelStore.setState({ open: true });
      } else if (isHotkey("esc", e) && open) {
        useCommandPanelStore.setState({
          open: false,
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // 处理搜索结果点击 - SearchResult 类型
  const handleSearchResultClick = async (result: SearchResult) => {
    useCommandPanelStore.setState({ open: false });

    if (result.type === "card") {
      openInNewTab(TabType.CardDetail, { id: result.id });
    } else if (result.type === "article") {
      openInNewTab(TabType.ArticleDetail, { id: result.id });
    } else if (result.type === "project-item") {
      // 获取项目项所属的项目
      try {
        const projectItem = await getProjectItemById(result.id);
        if (projectItem && projectItem.projects.length > 0) {
          const projectId = projectItem.projects[0];
          openInNewTab(TabType.ProjectDetail, {
            id: projectId,
            itemId: result.id,
          });
        } else {
          // 如果没有找到项目，回退到项目列表
          openInNewTab(TabType.ProjectList);
        }
      } catch (error) {
        console.error("Failed to get project item:", error);
        openInNewTab(TabType.ProjectList);
      }
    } else if (result.type === "document-item") {
      // 获取知识库项所属的知识库
      try {
        const documents = await getRootDocumentsByDocumentItemId(result.id);
        if (documents && documents.length > 0) {
          const documentId = documents[0].id;
          openInNewTab(TabType.DocumentDetail, {
            id: documentId,
            itemId: result.id,
          });
        } else {
          // 如果没有找到知识库，回退到知识库列表
          openInNewTab(TabType.DocumentList);
        }
      } catch (error) {
        console.error("Failed to get document:", error);
        openInNewTab(TabType.DocumentList);
      }
    }
  };

  // 获取引用类型的标签文本
  const getRefTypeLabel = (refType: string) => {
    switch (refType) {
      case "card":
        return "卡片";
      case "article":
        return "文章";
      case "project-item":
        return "项目";
      case "document-item":
        return "知识库";
      default:
        return refType;
    }
  };

  // 获取标签颜色
  const getTagColor = (refType: string) => {
    switch (refType) {
      case "card":
        return "pink";
      case "article":
        return "blue";
      case "project-item":
        return "green";
      case "document-item":
        return "orange";
      default:
        return "default";
    }
  };

  if (!open) return null;

  return (
    <div className="fixed w-screen h-screen left-0 top-0 z-[10000]">
      <div
        className={classnames(
          "absolute w-full h-full bg-[rgba(17,25,39,0.8)]",
          isDark && "dark:bg-[rgba(17,25,39,0.8)]",
        )}
        onClick={onClickMask}
      />
      <div
        className={classnames(
          "absolute w-[640px] max-h-[80vh] max-w-[80vw] top-[15vh] left-1/2 -translate-x-1/2 min-h-[200px] flex flex-col rounded-lg shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.1)_0px_10px_15px_-3px,rgba(0,0,0,0.1)_0px_4px_6px_-4px]",
          isDark ? "bg-[rgba(49,49,52,1)]" : "bg-white",
        )}
      >
        <div className="flex w-full h-14 py-4 box-border items-center border-b border-[var(--line-color)]">
          <div className="flex-none w-10 h-full flex items-center justify-center">
            {searchLoading ? <LoadingOutlined /> : <SearchOutlined />}
          </div>
          <EditText
            ref={searchRef}
            className="flex-1"
            onPressEnter={onPressEnter}
            contentEditable
            defaultFocus
            defaultValue={lastSearchText.current || ""}
            onChange={(value) => {
              lastSearchText.current = value;
            }}
          />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col max-h-[calc(80vh-56px)]">
          <div
            className="flex-1 flex flex-col min-h-[160px] h-full"
            style={{ overflow: searchLoading ? "hidden" : "auto" }}
          >
            <If condition={searchLoading}>
              <div className="flex-1 flex items-center justify-center text-4xl min-h-[160px] w-full">
                <LoadingOutlined />
              </div>
            </If>
            <If condition={!searchLoading}>
              <>
                <If condition={searchResults.length === 0}>
                  <Empty
                    style={{
                      padding: 24,
                    }}
                    description={"暂无数据"}
                  />
                </If>
                <If condition={searchResults.length > 0}>
                  <div
                    ref={resultsListRef}
                    className="flex flex-col gap-4 p-4 overflow-y-auto flex-1"
                  >
                    <div
                      style={{
                        height: `${resultsVirtualizer.getTotalSize()}px`,
                        width: "100%",
                        position: "relative",
                      }}
                    >
                      {resultsVirtualizer
                        .getVirtualItems()
                        .map((virtualItem) => {
                          const result = searchResults[virtualItem.index];
                          return (
                            <div
                              key={`search-${result.id}-${result.type}`}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                              }}
                            >
                              <SearchResultItem
                                result={result}
                                getRefTypeLabel={getRefTypeLabel}
                                getTagColor={getTagColor}
                                handleSearchResultClick={
                                  handleSearchResultClick
                                }
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </If>
              </>
            </If>
          </div>
        </div>
      </div>
    </div>
  );
});

export default Search;
