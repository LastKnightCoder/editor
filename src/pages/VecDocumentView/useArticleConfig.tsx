import Editor from "@/components/Editor";
import { formatDate, getEditorText, getMarkdown } from "@/utils";
import { IArticle, IndexParams, SearchResult } from "@/types";
import { useState, useEffect, useMemo } from "react";
import {
  Tag,
  Button,
  Popover,
  Flex,
  Typography,
  TableProps,
  TableColumnType,
  App,
} from "antd";
import { Descendant } from "slate";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import useBatchOperation from "./useBatchOperation";
import useEmbeddingConfig from "./useEmbeddingConfig";
import { indexContent, removeIndex, getAllIndexResults } from "@/utils/search";
import { getAllArticles } from "@/commands";

const PAGE_SIZE = 20;

type OnChange = NonNullable<TableProps<IArticle>["onChange"]>;
type Filters = Parameters<OnChange>[1];

const useArticleConfig = () => {
  const { message } = App.useApp();
  const [articles, setArticles] = useState<IArticle[]>([]);

  useEffect(() => {
    getAllArticles().then((articles) => {
      setArticles(articles);
    });
  }, []);

  const modelInfo = useEmbeddingConfig();

  const [selectedRows, setSelectedRows] = useState<IArticle[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);
  const [pageSize, setPageSize] = useLocalStorageState<number>(
    "article-pagesize",
    {
      defaultValue: PAGE_SIZE,
    },
  );
  const onSelectChange = (_: React.Key[], newSelectedRows: IArticle[]) => {
    setSelectedRows(newSelectedRows);
  };

  const rowSelection: TableRowSelection<IArticle> = {
    selectedRowKeys: selectedRows.map((row) => row.id),
    onChange: onSelectChange,
  };

  const [indexResults, setIndexResults] = useState<
    [SearchResult[], SearchResult[]]
  >([[], []]);
  const [current, setCurrent] = useState(1);
  const [filteredInfo, setFilteredInfo] = useState<Filters>({});

  // 解构索引结果
  const [ftsResults, vecResults] = indexResults;

  const filteredArticles = useMemo(() => {
    const indexStatusFilterArray = filteredInfo.index_status || [];

    const filteredArticles = articles.filter((article) => {
      // 查找索引状态
      const ftsResult = ftsResults.find(
        (result) => result.id === article.id && result.type === "article",
      );

      const vecResult = vecResults.find(
        (result) => result.id === article.id && result.type === "article",
      );

      let status;
      if (!ftsResult && !vecResult) {
        status = "未索引";
      } else if (
        (vecResult && article.update_time !== vecResult.updateTime) ||
        (ftsResult && article.update_time !== ftsResult.updateTime)
      ) {
        status = "待更新";
      } else {
        status = "已索引";
      }

      // 索引状态过滤
      const isHitIndexStatus =
        indexStatusFilterArray.length === 0 ||
        indexStatusFilterArray.includes(status);

      return isHitIndexStatus;
    });

    return filteredArticles;
  }, [articles, filteredInfo, ftsResults, vecResults]);

  const slicedArticles = filteredArticles.slice(
    (current - 1) * (pageSize || PAGE_SIZE),
    current * (pageSize || PAGE_SIZE),
  );

  const initIndexResults = useMemoizedFn(async () => {
    try {
      const results = await getAllIndexResults("article");
      setIndexResults(results);
    } catch (e) {
      console.error("初始化索引结果失败", e);
      throw e;
    }
  });

  useEffect(() => {
    initIndexResults().then();
  }, [initIndexResults]);

  const {
    batchCreateOrUpdateError,
    batchCreateOrUpdateLoading,
    batchCreateOrUpdateSuccess,
    batchCreateOrUpdateTotal,
    batchDeleteLoading,
    handleBatchEmbedding,
    handleBatchDelete,
    createEmbeddings,
    updateEmbeddings,
    deleteEmbeddings,
  } = useBatchOperation<IArticle>({
    selectedRows,
    setSelectedRows,
    type: "article",
    indexResults,
    initIndexResults,
  });

  const rightExtraNode = (
    <Flex gap={12} justify="right">
      {batchCreateOrUpdateTotal > 0 && (
        <>
          <Flex vertical gap={12}>
            <Flex gap={12} justify="right">
              <Tag color="green">成功：{batchCreateOrUpdateSuccess}</Tag>
              <Tag color="red">失败：{batchCreateOrUpdateError}</Tag>
              <Tag color="purple">总数：{batchCreateOrUpdateTotal}</Tag>
            </Flex>
          </Flex>
        </>
      )}
      <Button
        disabled={createEmbeddings.length + updateEmbeddings.length === 0}
        onClick={handleBatchEmbedding}
        loading={batchCreateOrUpdateLoading}
      >
        批量索引
      </Button>
      <Button
        danger
        disabled={deleteEmbeddings.length === 0}
        onClick={handleBatchDelete}
        loading={batchDeleteLoading}
      >
        批量删除索引
      </Button>
    </Flex>
  );

  const onCreateEmbedding = useMemoizedFn(
    async (markdown: string, record: IArticle) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `create-article-index-${record.id}`;
      message.loading({ content: "正在创建索引...", key: messageKey });

      try {
        // 检查当前索引状态
        const ftsResult = ftsResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        // 确定需要创建的索引类型
        const indexTypes: ("fts" | "vec")[] = [];
        if (!ftsResult || record.update_time !== ftsResult.updateTime)
          indexTypes.push("fts");
        if (!vecResult || record.update_time !== vecResult.updateTime)
          indexTypes.push("vec");

        // 如果没有需要创建的索引，直接返回成功
        if (indexTypes.length === 0) {
          message.success({ content: "索引已存在", key: messageKey });
          return true;
        }

        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: "article",
          updateTime: record.update_time,
          indexTypes,
          modelInfo,
        };

        const success = await indexContent(params);

        if (success) {
          try {
            await initIndexResults();
            message.success({ content: "索引创建成功", key: messageKey });
            return true;
          } catch (error) {
            console.error("初始化索引结果失败", error);
            message.error({
              content: "索引创建成功，但初始化索引结果失败",
              key: messageKey,
            });
            return false;
          }
        } else {
          message.error({ content: "索引创建失败", key: messageKey });
          return false;
        }
      } catch (error) {
        console.error("创建索引失败:", error);
        message.error({ content: "索引创建失败", key: messageKey });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  const onRemoveEmbedding = useMemoizedFn(async (record: IArticle) => {
    setLoadingIds((prev) => [...prev, record.id]);
    const messageKey = `remove-article-index-${record.id}`;
    message.loading({ content: "正在删除索引...", key: messageKey });

    try {
      await removeIndex(record.id, "article");
      await initIndexResults();
      message.success({ content: "索引删除成功", key: messageKey });
    } catch (error) {
      console.error("删除索引失败:", error);
      message.error({ content: "索引删除失败", key: messageKey });
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== record.id));
    }
  });

  const onUpdateEmbedding = useMemoizedFn(
    async (markdown: string, record: IArticle) => {
      // if (!currentConfig) {
      //   message.error("未配置OpenAI API密钥");
      //   return false;
      // }

      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `update-index-${record.id}`;
      message.loading({ content: "正在更新索引...", key: messageKey });

      try {
        // const { apiKey, baseUrl } = currentConfig;

        // 检查当前索引状态
        const ftsResult = ftsResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        // 确定需要更新的索引类型
        const indexTypes: ("fts" | "vec")[] = [];
        if (!ftsResult) indexTypes.push("fts");
        if (!vecResult || record.update_time > vecResult.updateTime)
          indexTypes.push("vec");

        // 如果没有需要更新的索引，直接返回成功
        if (indexTypes.length === 0) {
          message.success({ content: "索引已是最新", key: messageKey });
          return true;
        }

        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: "article",
          updateTime: record.update_time,
          indexTypes,
          modelInfo,
        };

        const success = await indexContent(params);

        if (success) {
          try {
            await initIndexResults();
            message.success({ content: "索引更新成功", key: messageKey });
            return true;
          } catch (error) {
            console.error("初始化索引结果失败", error);
            message.error({
              content: "索引更新成功，但初始化索引结果失败",
              key: messageKey,
            });
            return false;
          }
        } else {
          message.error({ content: "索引更新失败", key: messageKey });
          return false;
        }
      } catch (error) {
        console.error("更新索引失败:", error);
        message.error({ content: "索引更新失败", key: messageKey });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  const columns: TableColumnType<IArticle>[] = [
    {
      key: "id",
      dataIndex: "id",
      title: "ID",
      width: 80,
    },
    {
      key: "create_time",
      dataIndex: "create_time",
      title: "创建时间",
      width: 160,
      render: (createTime: number) => {
        return <div>{formatDate(createTime, true)} </div>;
      },
    },
    {
      key: "update_time",
      dataIndex: "update_time",
      title: "更新时间",
      width: 160,
      render: (updateTime: number) => {
        return <div>{formatDate(updateTime, true)} </div>;
      },
    },
    {
      key: "title",
      dataIndex: "title",
      title: "标题",
      render: (title: string) => {
        return <div>{title} </div>;
      },
    },
    {
      key: "content",
      dataIndex: "content",
      title: "文章内容",
      render: (content: Descendant[]) => {
        return (
          <Flex vertical gap={12} align={"flex-start"}>
            <Typography.Paragraph
              ellipsis={{ rows: 1 }}
              style={{ maxWidth: 400 }}
            >
              {getEditorText(content, 20)}
            </Typography.Paragraph>
            <Popover
              trigger={"hover"}
              placement={"bottom"}
              content={
                <Editor
                  style={{
                    width: 320,
                    height: 180,
                    overflow: "hidden",
                  }}
                  readonly
                  initValue={content}
                />
              }
            >
              <Button style={{ padding: 0 }} type={"link"}>
                查看更多
              </Button>
            </Popover>
          </Flex>
        );
      },
    },
    {
      key: "index_status",
      dataIndex: "index_status",
      title: "索引状态",
      width: 120,
      filters: [
        {
          text: "未索引",
          value: "未索引",
        },
        {
          text: "已索引",
          value: "已索引",
        },
        {
          text: "待更新",
          value: "待更新",
        },
      ],
      filteredValue: filteredInfo.index_status || null,
      render: (_, record) => {
        // 查找索引状态
        const ftsResult = ftsResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        // 显示FTS和向量索引状态
        const renderIndexStatus = () => {
          return (
            <Flex gap={4}>
              {ftsResult ? (
                <Tag
                  color={
                    record.update_time !== ftsResult.updateTime
                      ? "orange"
                      : "green"
                  }
                >
                  FTS:{" "}
                  {record.update_time !== ftsResult.updateTime
                    ? "待更新"
                    : "已索引"}
                </Tag>
              ) : (
                <Tag color="red">FTS: 未索引</Tag>
              )}
              {vecResult ? (
                <Tag
                  color={
                    record.update_time !== vecResult.updateTime
                      ? "orange"
                      : "green"
                  }
                >
                  向量:{" "}
                  {record.update_time !== vecResult.updateTime
                    ? "待更新"
                    : "已索引"}
                </Tag>
              ) : (
                <Tag color="red">向量: 未索引</Tag>
              )}
            </Flex>
          );
        };

        return renderIndexStatus();
      },
    },
    {
      key: "operations",
      title: "操作",
      width: 120,
      render: (_: any, record: IArticle) => {
        const isLoading = loadingIds.includes(record.id);

        // 查找索引状态
        const ftsResult = ftsResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "article",
        );

        if (!ftsResult && !vecResult) {
          return (
            <Button
              type="link"
              size="small"
              loading={isLoading}
              disabled={isLoading}
              onClick={async () => {
                const markdown = getMarkdown(record.content);
                await onCreateEmbedding(markdown, record);
              }}
            >
              创建索引
            </Button>
          );
        } else if (
          (ftsResult && !vecResult) ||
          (!ftsResult && vecResult) ||
          (vecResult && record.update_time !== vecResult.updateTime) ||
          (ftsResult && record.update_time !== ftsResult.updateTime)
        ) {
          return (
            <Button
              type="link"
              size="small"
              style={{ color: "#faad14" }}
              loading={isLoading}
              disabled={isLoading}
              onClick={async () => {
                const markdown = getMarkdown(record.content);
                await onUpdateEmbedding(markdown, record);
              }}
            >
              更新索引
            </Button>
          );
        } else {
          return (
            <Button
              type="link"
              size="small"
              danger
              loading={isLoading}
              disabled={isLoading}
              onClick={async () => {
                await onRemoveEmbedding(record);
              }}
            >
              删除索引
            </Button>
          );
        }
      },
    },
  ];

  const pagination = {
    pageSize,
    current,
    total: filteredArticles.length,
    showSizeChanger: true,
  };

  const onChange: TableProps["onChange"] = useMemoizedFn(
    (pagination, filteredInfo) => {
      if (pagination.current !== current) {
        setCurrent(pagination.current || 1);
        setSelectedRows([]);
      }
      if (pagination.pageSize !== pageSize) {
        setPageSize(pagination.pageSize || PAGE_SIZE);
      }
      setFilteredInfo(filteredInfo);
    },
  );

  return {
    dataSource: slicedArticles,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
  };
};

export default useArticleConfig;
