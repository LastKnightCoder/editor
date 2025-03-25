import { useEffect, memo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import isHotkey from "is-hotkey";
import Editor from "@/components/Editor";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useCardManagement from "@/hooks/useCardManagement.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import "@tmikeladze/react-cmdk/dist/cmdk.css";
import { Empty, Tag, Tabs } from "antd";
import styles from "./index.module.less";
import { SearchResult } from "@/types";
import classnames from "classnames";
import { LoadingOutlined, SearchOutlined } from "@ant-design/icons";
import EditText, { EditTextHandle } from "@/components/EditText";
import If from "@/components/If";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useProjectsStore from "@/stores/useProjectsStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import {
  getDocumentItem,
  getProjectItemById,
  getRootDocumentsByDocumentItemId,
} from "@/commands";

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
        />
      </div>
    );
  },
);

const AISearch = memo(() => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const searchRef = useRef<EditTextHandle>(null);
  const lastSearchText = useRef("");
  const [activeTab, setActiveTab] = useState<string>("fts");

  const ftsListRef = useRef<HTMLDivElement>(null);
  const vecListRef = useRef<HTMLDivElement>(null);

  const { open, searchLoading, ftsResults, vecResults, onSearch } =
    useCommandPanelStore(
      useShallow((state) => ({
        open: state.open,
        searchLoading: state.searchLoading,
        ftsResults: state.ftsResults,
        vecResults: state.vecResults,
        onSearch: state.onSearch,
      })),
    );
  const { onCtrlClickCard } = useCardManagement();

  const ftsVirtualizer = useVirtualizer({
    count: ftsResults.length,
    getScrollElement: () => ftsListRef.current,
    estimateSize: () => 240,
    overscan: 5,
  });

  const vecVirtualizer = useVirtualizer({
    count: vecResults.length,
    getScrollElement: () => vecListRef.current,
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
      navigate(`/cards/detail/${result.id}`);
    } else if (result.type === "article") {
      navigate("/articles");
      useArticleManagementStore.setState({
        activeArticleId: result.id,
      });
    } else if (result.type === "project-item") {
      const projectItem = await getProjectItemById(result.id);
      if (!projectItem) return;
      const projectId = projectItem.projects[0];
      if (!projectId) return;

      // 跳转到项目项
      navigate(`/projects/${projectId}`);
      useProjectsStore.setState({
        activeProjectId: projectId,
        activeProjectItemId: projectItem.id,
        hideProjectItemList: false,
      });
    } else if (result.type === "document-item") {
      const documentItem = await getDocumentItem(result.id);
      if (!documentItem) return;
      const documents = await getRootDocumentsByDocumentItemId(documentItem.id);
      if (!documents) return;
      const document = documents[0];
      if (!document) return;

      // 跳转到知识库项
      navigate(`/documents/${document.id}`);
      useDocumentsStore.setState({
        activeDocumentId: document.id,
        activeDocumentItemId: documentItem.id,
        hideDocumentItemsList: false,
      });
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
    <div className={styles.commandContainer}>
      <div
        className={classnames(styles.mask, { [styles.dark]: isDark })}
        onClick={onClickMask}
      />
      <div className={classnames(styles.panel, { [styles.dark]: isDark })}>
        <div className={styles.searchHeader}>
          <div className={styles.searchIcon}>
            {searchLoading ? <LoadingOutlined /> : <SearchOutlined />}
          </div>
          <EditText
            ref={searchRef}
            className={styles.search}
            onPressEnter={onPressEnter}
            onDeleteEmpty={() => {
              useCommandPanelStore.setState({ open: false });
            }}
            contentEditable
            defaultFocus
            defaultValue={lastSearchText.current || ""}
            onChange={(value) => {
              lastSearchText.current = value;
            }}
          />
        </div>

        <div className={styles.resultContainer}>
          <If condition={searchLoading}>
            <div className={styles.loadingContainer}>
              <LoadingOutlined />
            </div>
          </If>
          <If condition={!searchLoading}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: "fts",
                  label: "全文搜索",
                  children: (
                    <>
                      <If condition={ftsResults.length === 0}>
                        <Empty
                          style={{
                            padding: 24,
                          }}
                          description={"暂无数据"}
                        />
                      </If>
                      <If condition={ftsResults.length > 0}>
                        <div ref={ftsListRef} className={styles.list}>
                          <div
                            style={{
                              height: `${ftsVirtualizer.getTotalSize()}px`,
                              width: "100%",
                              position: "relative",
                            }}
                          >
                            {ftsVirtualizer
                              .getVirtualItems()
                              .map((virtualItem) => {
                                const result = ftsResults[virtualItem.index];
                                return (
                                  <div key={`fts-${result.id}-${result.type}`}>
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
                  ),
                },
                {
                  key: "vec",
                  label: "AI 搜索",
                  children: (
                    <>
                      <If condition={vecResults.length === 0}>
                        <Empty
                          style={{
                            padding: 24,
                          }}
                          description={"暂无数据"}
                        />
                      </If>
                      <If condition={vecResults.length > 0}>
                        <div ref={vecListRef} className={styles.list}>
                          <div
                            style={{
                              height: `${vecVirtualizer.getTotalSize()}px`,
                              width: "100%",
                            }}
                          >
                            {vecVirtualizer
                              .getVirtualItems()
                              .map((virtualItem) => {
                                const result = vecResults[virtualItem.index];
                                return (
                                  <SearchResultItem
                                    key={`vec-${result.id}-${result.type}`}
                                    result={result}
                                    getRefTypeLabel={getRefTypeLabel}
                                    getTagColor={getTagColor}
                                    handleSearchResultClick={
                                      handleSearchResultClick
                                    }
                                  />
                                );
                              })}
                          </div>
                        </div>
                      </If>
                    </>
                  ),
                },
              ]}
            />
          </If>
        </div>
      </div>
    </div>
  );
});

export default AISearch;
