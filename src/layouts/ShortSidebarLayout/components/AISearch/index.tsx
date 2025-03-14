import { useEffect, memo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import isHotkey from "is-hotkey";
import Editor from "@/components/Editor";

import { useAsyncEffect, useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useCardManagement from "@/hooks/useCardManagement.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import "@tmikeladze/react-cmdk/dist/cmdk.css";
import { Empty, Tag } from "antd";
import styles from "./index.module.less";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { IDocumentItem, VecDocument, ProjectItem } from "@/types";
import classnames from "classnames";
import { LoadingOutlined, SearchOutlined } from "@ant-design/icons";
import EditText, { EditTextHandle } from "@/components/EditText";
import If from "@/components/If";
import For from "@/components/For";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useProjectsStore from "@/stores/useProjectsStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import {
  getDocumentItem,
  getProjectItemById,
  getRootDocumentsByDocumentItemId,
  getAllProjectItems,
  getAllDocumentItems,
} from "@/commands";

const AISearch = memo(() => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<
    Array<[VecDocument, number]>
  >([]);
  const searchRef = useRef<EditTextHandle>(null);
  const lastSearchText = useRef("");
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [documentItems, setDocumentItems] = useState<IDocumentItem[]>([]);

  const { cards } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));
  const { articles } = useArticleManagementStore((state) => ({
    articles: state.articles,
  }));

  const { open, onSearch } = useCommandPanelStore((state) => ({
    open: state.open,
    onSearch: state.onSearch,
  }));

  useAsyncEffect(async () => {
    const projectItems = await getAllProjectItems();
    setProjectItems(projectItems);
    const documentItems = await getAllDocumentItems();
    setDocumentItems(documentItems);
  }, []);

  const { onCtrlClickCard } = useCardManagement();

  const onClickMask = useMemoizedFn(() => {
    useCommandPanelStore.setState({ open: false });
  });

  const onPressEnter = async () => {
    const searchText = searchRef.current?.getValue();
    if (!searchText) {
      return;
    }
    setSearchLoading(true);
    try {
      const res = await onSearch(searchText);
      setSearchResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
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

  const uniqueSearchResult = searchResult.reduce(
    (acc, cur) => {
      if (
        !acc.find(
          (item) =>
            item[0].refId === cur[0].refId &&
            item[0].refType === cur[0].refType,
        )
      ) {
        acc.push(cur);
      }
      return acc;
    },
    [] as Array<[VecDocument, number]>,
  );

  // 处理搜索结果点击
  const handleResultClick = async (res: [VecDocument, number]) => {
    useCommandPanelStore.setState({ open: false });

    if (res[0].refType === "card") {
      navigate("/cards/list");
      onCtrlClickCard(res[0].refId);
    } else if (res[0].refType === "article") {
      navigate("/articles");
      useArticleManagementStore.setState({
        activeArticleId: res[0].refId,
      });
    } else if (res[0].refType === "project") {
      const projectItem = await getProjectItemById(res[0].refId);
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
    } else if (res[0].refType === "document") {
      const documentItem = await getDocumentItem(res[0].refId);
      if (!documentItem) return;
      const documents = await getRootDocumentsByDocumentItemId(documentItem.id);
      if (!documents) return;
      const document = documents[0];
      if (!document) return;

      // 跳转到知识库项
      navigate(`/documents/${document.id}`);
      useDocumentsStore.setState({
        activeDocumentId: document.id,
        activeDocumentItem: documentItem,
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
      case "project":
        return "项目";
      case "document":
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
      case "project":
        return "green";
      case "document":
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
              setSearchResult([]);
              useCommandPanelStore.setState({ open: false });
            }}
            contentEditable
            defaultFocus
            defaultValue={lastSearchText.current || ""}
            onChange={(value) => {
              lastSearchText.current = value;
              if (!value) {
                setSearchResult([]);
              }
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
            <If condition={uniqueSearchResult.length === 0}>
              <Empty
                style={{
                  padding: 24,
                }}
                description={"暂无数据"}
              />
            </If>
            <If condition={uniqueSearchResult.length > 0}>
              <div className={styles.list}>
                <For
                  data={uniqueSearchResult}
                  renderItem={(res) => {
                    const initValue = (() => {
                      if (res[0].refType === "card") {
                        return (
                          cards.find((item) => item.id === res[0].refId)
                            ?.content || []
                        );
                      } else if (res[0].refType === "article") {
                        return (
                          articles.find((item) => item.id === res[0].refId)
                            ?.content || []
                        );
                      } else if (res[0].refType === "project") {
                        const projectItem = projectItems.find(
                          (item) => item.id === res[0].refId,
                        );
                        if (!projectItem) return [];
                        return projectItem.content || [];
                      } else if (res[0].refType === "document") {
                        const documentItem = documentItems.find(
                          (item) => item.id === res[0].refId,
                        );
                        if (!documentItem) return [];
                        return documentItem.content || [];
                      }
                      return [];
                    })();
                    return (
                      <div
                        className={styles.item}
                        key={res[0].id}
                        onClick={() => handleResultClick(res)}
                      >
                        <Tag
                          color={getTagColor(res[0].refType)}
                          style={{ marginBottom: 12 }}
                        >
                          {getRefTypeLabel(res[0].refType)}
                        </Tag>
                        <Editor
                          style={{
                            maxHeight: 160,
                            overflowY: "hidden",
                          }}
                          initValue={initValue}
                          readonly={true}
                        />
                      </div>
                    );
                  }}
                />
              </div>
            </If>
          </If>
        </div>
      </div>
    </div>
  );
});

export default AISearch;
