import Editor from "@/components/Editor";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { formatDate, getEditorText, getMarkdown } from "@/utils";
import { ECardCategory, ICard, SearchResult } from "@/types";
import { useState, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
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
import { useMemoizedFn } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import useBatchOperation from "./useBatchOperation";
import { indexContent, removeIndex, getAllIndexResults } from "@/utils/search";
import { getAllCards } from "@/commands";

const EMBEDDING_MODEL = "text-embedding-3-large";
const PAGE_SIZE = 20;

type OnChange = NonNullable<TableProps<ICard>["onChange"]>;
type Filters = Parameters<OnChange>[1];

const useCardConfig = () => {
  const { message } = App.useApp();
  const [cards, setCards] = useState<ICard[]>([]);
  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const { provider } = useSettingStore(
    useShallow((state) => ({
      provider: state.setting.llmProviders[ELLMProvider.OPENAI],
    })),
  );

  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<ICard[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);
  const onSelectChange = (_: React.Key[], newSelectedRows: ICard[]) => {
    setSelectedRows(newSelectedRows);
  };

  const rowSelection: TableRowSelection<ICard> = {
    selectedRowKeys: selectedRows.map((row) => row.id),
    onChange: onSelectChange,
  };

  const { configs, currentConfigId } = provider;
  const currentConfig = configs.find((item) => item.id === currentConfigId);

  const [indexResults, setIndexResults] = useState<
    [SearchResult[], SearchResult[]]
  >([[], []]);
  const [current, setCurrent] = useState(1);

  // 解构索引结果
  const [ftsResults, vecResults] = indexResults;

  const filteredCards = useMemo(() => {
    const categoryFilterArray = filteredInfo.category || [];
    const indexStatusFilterArray = filteredInfo.index_status || [];

    const filteredCards = cards.filter((card) => {
      // 分类过滤
      const isHitCategory =
        categoryFilterArray.length === 0 ||
        categoryFilterArray.includes(card.category);
      if (!isHitCategory) return false;

      // 查找索引状态
      const hasFTSIndex = ftsResults.some(
        (result) => result.id === card.id && result.type === "card",
      );

      const hasVecResult = vecResults.some(
        (result) => result.id === card.id && result.type === "card",
      );

      const vecResult = vecResults.find(
        (result) => result.id === card.id && result.type === "card",
      );
      const ftsResult = ftsResults.find(
        (result) => result.id === card.id && result.type === "card",
      );

      let status;
      if (!hasFTSIndex && !hasVecResult) {
        status = "未索引";
      } else if (
        (vecResult && card.update_time > vecResult.updateTime) ||
        (ftsResult && card.update_time > ftsResult.updateTime)
      ) {
        status = "待更新";
      } else {
        status = "已索引";
      }

      // 索引状态过滤
      const isHitIndexStatus =
        indexStatusFilterArray.length === 0 ||
        indexStatusFilterArray.includes(status);

      console.log(
        "card.id: ",
        card.id,
        "status: ",
        status,
        "isHitIndexStatus: ",
        isHitIndexStatus,
      );

      return isHitIndexStatus;
    });

    return filteredCards;
  }, [indexResults, cards, filteredInfo]);

  const slicedCards = filteredCards.slice(
    (current - 1) * PAGE_SIZE,
    current * PAGE_SIZE,
  );

  const initIndexResults = useMemoizedFn(async () => {
    try {
      const results = await getAllIndexResults("card");
      setIndexResults(results);
    } catch (e) {
      console.error("初始化索引结果失败", e);
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
  } = useBatchOperation<ICard>({
    selectedRows,
    setSelectedRows,
    type: "card",
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
    async (markdown: string, record: ICard) => {
      if (!currentConfig) {
        message.error("未配置OpenAI API密钥");
        return;
      }

      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `create-index-${record.id}`;
      message.loading({ content: "正在创建索引...", key: messageKey });

      try {
        const { apiKey, baseUrl } = currentConfig;
        await indexContent({
          id: record.id,
          content: markdown,
          type: "card",
          updateTime: record.update_time,
          modelInfo: {
            key: apiKey,
            baseUrl,
            model: EMBEDDING_MODEL,
          },
        });
        await initIndexResults();
        message.success({ content: "索引创建成功", key: messageKey });
      } catch (error) {
        console.error("创建索引失败:", error);
        message.error({ content: "索引创建失败", key: messageKey });
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  const onRemoveEmbedding = useMemoizedFn(async (record: ICard) => {
    setLoadingIds((prev) => [...prev, record.id]);
    const messageKey = `remove-index-${record.id}`;
    message.loading({ content: "正在删除索引...", key: messageKey });

    try {
      await removeIndex(record.id, "card");
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
    async (markdown: string, record: ICard) => {
      if (!currentConfig) {
        message.error("未配置OpenAI API密钥");
        return;
      }

      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `update-index-${record.id}`;
      message.loading({ content: "正在更新索引...", key: messageKey });

      try {
        const { apiKey, baseUrl } = currentConfig;
        await indexContent({
          id: record.id,
          content: markdown,
          type: "card",
          updateTime: record.update_time,
          modelInfo: {
            key: apiKey,
            baseUrl,
            model: EMBEDDING_MODEL,
          },
        });
        await initIndexResults();
        message.success({ content: "索引更新成功", key: messageKey });
      } catch (error) {
        console.error("更新索引失败:", error);
        message.error({ content: "索引更新失败", key: messageKey });
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  const columns: TableColumnType<ICard>[] = [
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
      key: "content",
      dataIndex: "content",
      title: "卡片内容",
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
                    maxWidth: 400,
                    maxHeight: 300,
                    overflow: "auto",
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
      key: "category",
      dataIndex: "category",
      title: "分类",
      width: 80,
      filters: [
        {
          text: "永久笔记",
          value: ECardCategory.Permanent,
        },
        {
          text: "闪念笔记",
          value: ECardCategory.Temporary,
        },
        {
          text: "主题笔记",
          value: ECardCategory.Theme,
        },
      ],
      render: (category: ICard["category"]) => {
        let text = "";
        let color = "";
        if (category === ECardCategory.Permanent) {
          text = "永久笔记";
          color = "blue";
        } else if (category === ECardCategory.Temporary) {
          text = "闪念笔记";
          color = "green";
        } else if (category === ECardCategory.Theme) {
          text = "主题笔记";
          color = "orange";
        }

        return <Tag color={color}> {text} </Tag>;
      },
    },
    {
      key: "tags",
      dataIndex: "tags",
      title: "标签",
      render: (tags: string[]) => {
        return (
          <>
            {tags.map((tag) => (
              <Tag color="blue" key={tag}>
                {" "}
                {tag}{" "}
              </Tag>
            ))}
          </>
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
      render: (_: any, record: ICard) => {
        // 查找索引状态
        const hasFTSIndex = ftsResults.some(
          (result) => result.id === record.id && result.type === "card",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "card",
        );

        // 显示FTS和向量索引状态
        const renderIndexStatus = () => {
          return (
            <Flex gap={4}>
              <Tag color={hasFTSIndex ? "green" : "red"}>
                FTS: {hasFTSIndex ? "已索引" : "未索引"}
              </Tag>
              {vecResult ? (
                <Tag
                  color={
                    record.update_time > vecResult.updateTime
                      ? "orange"
                      : "green"
                  }
                >
                  向量:{" "}
                  {record.update_time > vecResult.updateTime
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
      render: (_: any, record: ICard) => {
        const isLoading = loadingIds.includes(record.id);

        // 查找索引状态
        const hasFTSIndex = ftsResults.some(
          (result) => result.id === record.id && result.type === "card",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "card",
        );

        if (!hasFTSIndex && !vecResult) {
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
          (hasFTSIndex && !vecResult) ||
          (!hasFTSIndex && vecResult) ||
          (vecResult && record.update_time > vecResult.updateTime)
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
    pageSize: PAGE_SIZE,
    current,
    total: filteredCards.length,
    showSizeChanger: false,
  };

  const onChange: TableProps["onChange"] = useMemoizedFn(
    (pagination, filteredInfo) => {
      if (pagination.current !== current) {
        setCurrent(pagination.current || 1);
        setSelectedRows([]);
      }
      setFilteredInfo(filteredInfo);
    },
  );

  return {
    dataSource: slicedCards,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
  };
};

export default useCardConfig;
