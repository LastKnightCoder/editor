import Editor from "@/components/Editor";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import {
  formatDate,
  getEditorText,
  embeddingContent,
  getMarkdown,
} from "@/utils";
import { getVecDocumentsByRefType, deleteVecDocumentsByRef } from "@/commands";
import { ECardCategory, ICard, VecDocument } from "@/types";
import { useState, useEffect, useMemo } from "react";
import {
  Tag,
  App,
  Button,
  Popover,
  Flex,
  Typography,
  Popconfirm,
  TableProps,
  TableColumnType,
} from "antd";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import useBatchOperation from "./useBatchOperation";

const EMBEDDING_MODEL = "text-embedding-3-large";
const PAGE_SIZE = 20;

type OnChange = NonNullable<TableProps<ICard>["onChange"]>;
type Filters = Parameters<OnChange>[1];

const useCardConfig = () => {
  const { message } = App.useApp();

  const { cards } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));

  const { provider } = useSettingStore((state) => ({
    provider: state.setting.llmProviders[ELLMProvider.OPENAI],
  }));

  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<ICard[]>([]);
  const onSelectChange = (_: React.Key[], newSelectedRows: ICard[]) => {
    setSelectedRows(newSelectedRows);
  };

  const rowSelection: TableRowSelection<ICard> = {
    selectedRowKeys: selectedRows.map((row) => row.id),
    onChange: onSelectChange,
  };

  const { configs, currentConfigId } = provider;
  const currentConfig = configs.find((item) => item.id === currentConfigId);

  const [vecDocuments, setVecDocuments] = useState<VecDocument[]>([]);
  const [current, setCurrent] = useState(1);
  const filteredCards = useMemo(() => {
    const categoryFilterArray = filteredInfo.category || [];
    const embeddingStatusFilterArray = filteredInfo.embedding_status || [];
    const filteredCards = cards.filter((card) => {
      const isHitCategory =
        categoryFilterArray.length === 0 ||
        categoryFilterArray.includes(card.category);
      if (!isHitCategory) return false;
      const matchedVecDocuments = vecDocuments.filter(
        (vecDocument) => vecDocument.refId === card.id,
      );
      let status;
      if (matchedVecDocuments.length === 0) {
        status = "未嵌入";
      } else {
        const embeddingTime = matchedVecDocuments[0].refUpdateTime;
        const cardUpdateTime = card.update_time;
        if (cardUpdateTime > embeddingTime) {
          status = "待更新";
        } else {
          status = "已嵌入";
        }
      }
      const isHitEmbeddingStatus =
        embeddingStatusFilterArray.length === 0 ||
        embeddingStatusFilterArray.includes(status);
      return isHitEmbeddingStatus;
    });

    return filteredCards;
  }, [vecDocuments, cards, filteredInfo]);
  const slicedCards = filteredCards.slice(
    (current - 1) * PAGE_SIZE,
    current * PAGE_SIZE,
  );
  const initVecDocuments = useMemoizedFn(async () => {
    const vecDocuments = await getVecDocumentsByRefType("card");
    setVecDocuments(vecDocuments);
  });

  useEffect(() => {
    initVecDocuments().then();
  }, [initVecDocuments]);

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
    vecDocuments,
    initVecDocuments,
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
        批量嵌入
      </Button>
      <Button
        danger
        disabled={deleteEmbeddings.length === 0}
        onClick={handleBatchDelete}
        loading={batchDeleteLoading}
      >
        批量删除
      </Button>
    </Flex>
  );

  const onCreateEmbedding = useMemoizedFn(
    async (markdown: string, record: ICard) => {
      if (!currentConfig) {
        return;
      }
      const { apiKey, baseUrl } = currentConfig;
      await embeddingContent(
        apiKey,
        baseUrl,
        EMBEDDING_MODEL,
        markdown,
        record.id,
        "card",
        record.update_time,
      );
      await initVecDocuments();
    },
  );

  const onRemoveEmbedding = useMemoizedFn(async (record: ICard) => {
    await deleteVecDocumentsByRef(record.id, "card");
    await initVecDocuments();
  });

  const onUpdateEmbedding = useMemoizedFn(
    async (markdown: string, record: ICard) => {
      if (!currentConfig) {
        return;
      }
      const { apiKey, baseUrl } = currentConfig;
      await deleteVecDocumentsByRef(record.id, "card");
      await embeddingContent(
        apiKey,
        baseUrl,
        EMBEDDING_MODEL,
        markdown,
        record.id,
        "card",
        record.update_time,
      );
      await initVecDocuments();
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
      key: "embedding_status",
      title: "嵌入状态",
      width: 120,
      filters: [
        {
          text: "已嵌入",
          value: "已嵌入",
        },
        {
          text: "待更新",
          value: "待更新",
        },
        {
          text: "未嵌入",
          value: "未嵌入",
        },
      ],
      render: (_, record: ICard) => {
        const vecEmbeddedDocuments = vecDocuments.filter(
          (vecDocument) => vecDocument.refId === record.id,
        );
        if (vecEmbeddedDocuments.length === 0) {
          return <Tag color="red"> 未嵌入 </Tag>;
        } else {
          const embeddingTime = vecEmbeddedDocuments[0].refUpdateTime;
          const cardUpdateTime = record.update_time;
          if (cardUpdateTime > embeddingTime) {
            return <Tag color={"orange"}> 已嵌入（待更新）</Tag>;
          } else {
            return <Tag color={"green"}> 已嵌入 </Tag>;
          }
        }
      },
    },
    {
      key: "operations",
      title: "操作",
      fixed: "right",
      render: (_, record) => {
        const vecEmbeddedDocuments = vecDocuments.filter(
          (vecDocument) => vecDocument.refId === record.id,
        );
        if (vecEmbeddedDocuments.length === 0) {
          return (
            <Button
              type="link"
              onClick={async () => {
                if (!currentConfig) {
                  message.error("未配置 OpenAI");
                  return;
                }
                const markdown = getMarkdown(record.content);
                message.loading({
                  key: "createEmbedding",
                  content: "正在创建嵌入，请稍后...",
                  duration: 0,
                });
                onCreateEmbedding(markdown, record)
                  .then(() => {
                    message.success({
                      key: "createEmbedding",
                      content: "创建嵌入成功",
                      duration: 2,
                    });
                  })
                  .catch(() => {
                    message.error({
                      key: "createEmbedding",
                      content: "创建嵌入失败",
                      duration: 2,
                    });
                  });
              }}
            >
              创建嵌入
            </Button>
          );
        } else {
          const embeddingTime = vecEmbeddedDocuments[0].refUpdateTime;
          const cardUpdateTime = record.update_time;
          if (cardUpdateTime > embeddingTime) {
            return (
              <>
                <Button
                  type="link"
                  onClick={async () => {
                    if (!currentConfig) {
                      message.error("未配置 OpenAI");
                      return;
                    }
                    const markdown = getMarkdown(record.content);
                    message.loading({
                      key: "updateEmbedding",
                      content: "正在更新嵌入，请稍后...",
                      duration: 0,
                    });
                    await onUpdateEmbedding(markdown, record)
                      .then(() => {
                        message.success({
                          key: "updateEmbedding",
                          content: "更新嵌入成功",
                          duration: 2,
                        });
                      })
                      .catch(() => {
                        message.error({
                          key: "updateEmbedding",
                          content: "更新嵌入失败",
                          duration: 2,
                        });
                      });
                  }}
                >
                  更新嵌入
                </Button>
                <Popconfirm
                  title="确定要删除嵌入吗？"
                  onConfirm={async () => {
                    message.loading({
                      key: "removeEmbedding",
                      content: "正在删除嵌入，请稍后...",
                      duration: 0,
                    });
                    await onRemoveEmbedding(record);
                    message.success({
                      key: "removeEmbedding",
                      content: "删除嵌入成功",
                      duration: 2,
                    });
                  }}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button color="danger" variant="link">
                    {" "}
                    删除嵌入{" "}
                  </Button>
                </Popconfirm>
              </>
            );
          } else {
            return (
              <Popconfirm
                title="确定要删除嵌入吗？"
                onConfirm={async () => {
                  message.loading({
                    key: "removeEmbedding",
                    content: "正在删除嵌入，请稍后...",
                    duration: 0,
                  });
                  await onRemoveEmbedding(record);
                  message.success({
                    key: "removeEmbedding",
                    content: "删除嵌入成功",
                    duration: 2,
                  });
                }}
                okText="确定"
                cancelText="取消"
              >
                <Button color="danger" variant="link">
                  删除嵌入
                </Button>
              </Popconfirm>
            );
          }
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
