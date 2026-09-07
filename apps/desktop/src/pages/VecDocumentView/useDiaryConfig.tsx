import Editor from "@/components/ContentEditor";
import { formatDate, getEditorText, getMarkdown } from "@/utils";
import { DiaryEntry, IndexParams, SearchResult, IndexType } from "@/types";
import { useState, useEffect, useMemo } from "react";
import { Tag, Button, Popover, Flex, Typography, TableProps, TableColumnType, App } from "antd";
import { Descendant } from "slate";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import { indexContent, removeIndex, getAllIndexResults } from "@/utils/search";
import { getAllDiaryEntries, getAllDiaryTagSettings } from "@/commands";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

const PAGE_SIZE = 20;
const ALL_TAG_FILTER = "__all__";
const EMPTY_TAG_FILTER = "__empty__";

type OnChange = NonNullable<TableProps<DiaryEntry>["onChange"]>;
type Filters = Parameters<OnChange>[1];

// 适配 useBatchOperation 需要的数据格式
interface DiaryEntryForBatch {
  id: number;
  content: Descendant[];
  update_time: number;
}

const useDiaryConfig = () => {
  const { message } = App.useApp();
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);

  // 获取所有日记
  useEffect(() => {
    Promise.all([getAllDiaryEntries(), getAllDiaryTagSettings()])
      .then(([entries, settings]) => {
        setDiaryEntries(entries);
        const tagSet = new Set(settings.map(setting => setting.name));
        entries.forEach(entry => {
          entry.tags.forEach(tag => tagSet.add(tag));
        });
        setTagOptions(Array.from(tagSet));
      })
      .catch(error => {
        console.error("获取日记索引数据失败", error);
      });
  }, []);

  const modelInfo = useEmbeddingConfig();
  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<DiaryEntry[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);
  const [pageSize, setPageSize] = useLocalStorageState<number>("diary-pagesize", {
    defaultValue: PAGE_SIZE,
  });

  const onSelectChange = (_: React.Key[], newSelectedRows: DiaryEntry[]) => {
    setSelectedRows(newSelectedRows);
  };

  const rowSelection: TableRowSelection<DiaryEntry> = {
    selectedRowKeys: selectedRows.map(row => row.id),
    onChange: onSelectChange,
  };

  const [vecResults, setVecResults] = useState<SearchResult[]>([]);
  const [current, setCurrent] = useState(1);

  const getIndexType = (_entry: DiaryEntry): IndexType => "diary-daily";

  const filteredEntries = useMemo(() => {
    const tagFilterArray = filteredInfo.tags || [];
    const indexStatusFilterArray = filteredInfo.index_status || [];

    return diaryEntries.filter(entry => {
      const isHitTags =
        tagFilterArray.length === 0 ||
        tagFilterArray.includes(ALL_TAG_FILTER) ||
        tagFilterArray.some(tag =>
          tag === EMPTY_TAG_FILTER ? entry.tags.length === 0 : entry.tags.includes(String(tag))
        );
      if (!isHitTags) return false;

      // 获取对应的索引类型
      const indexType = getIndexType(entry);

      const vecResult = vecResults.find(
        result => result.id === entry.id && result.type === indexType
      );

      let status;
      if (!vecResult) {
        status = "未索引";
      } else if (entry.updateTime > vecResult.updateTime) {
        status = "待更新";
      } else {
        status = "已索引";
      }

      const isHitIndexStatus =
        indexStatusFilterArray.length === 0 || indexStatusFilterArray.includes(status);

      return isHitIndexStatus;
    });
  }, [diaryEntries, filteredInfo, vecResults]);

  const slicedEntries = filteredEntries.slice(
    (current - 1) * (pageSize || PAGE_SIZE),
    current * (pageSize || PAGE_SIZE)
  );

  const initIndexResults = useMemoizedFn(async () => {
    try {
      // 迁移后周记、月记都作为带标签的 diary-daily 索引。
      const [dailyResults] = await Promise.all([getAllIndexResults("diary-daily")]);
      setVecResults([...dailyResults]);
    } catch (e) {
      console.error("初始化索引结果失败", e);
      throw e;
    }
  });

  useEffect(() => {
    initIndexResults();
  }, [initIndexResults]);

  // 转换为 useBatchOperation 需要的格式
  const selectedRowsForBatch: DiaryEntryForBatch[] = selectedRows.map(entry => ({
    id: entry.id,
    content: entry.content,
    update_time: entry.updateTime,
  }));

  // 自定义批量操作，需要根据每个日记的类型确定索引类型
  const [batchCreateOrUpdateLoading, setBatchCreateOrUpdateLoading] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const [batchCreateOrUpdateTotal, setBatchCreateOrUpdateTotal] = useState(0);
  const [batchCreateOrUpdateSuccess, setBatchCreateOrUpdateSuccess] = useState(0);
  const [batchCreateOrUpdateError, setBatchCreateOrUpdateError] = useState(0);

  // 计算需要创建、更新、删除的项目
  const { createEmbeddings, updateEmbeddings, deleteEmbeddings } = useMemo(() => {
    const createEmbeddings: DiaryEntryForBatch[] = [];
    const updateEmbeddings: DiaryEntryForBatch[] = [];
    const deleteEmbeddings: DiaryEntryForBatch[] = [];

    selectedRowsForBatch.forEach(entry => {
      const indexType = "diary-daily";
      const vecResult = vecResults.find(
        result => result.id === entry.id && result.type === indexType
      );

      if (!vecResult) {
        createEmbeddings.push(entry);
      } else if (entry.update_time > vecResult.updateTime) {
        updateEmbeddings.push(entry);
      } else {
        deleteEmbeddings.push(entry);
      }
    });

    return { createEmbeddings, updateEmbeddings, deleteEmbeddings };
  }, [selectedRowsForBatch, vecResults]);

  const handleBatchEmbedding = useMemoizedFn(async () => {
    const toProcess = [...createEmbeddings, ...updateEmbeddings];
    if (toProcess.length === 0) return;

    setBatchCreateOrUpdateLoading(true);
    setBatchCreateOrUpdateTotal(toProcess.length);
    setBatchCreateOrUpdateSuccess(0);
    setBatchCreateOrUpdateError(0);

    for (const entry of toProcess) {
      try {
        const diaryEntry = diaryEntries.find(d => d.id === entry.id);
        if (!diaryEntry) continue;

        const markdown = getMarkdown(diaryEntry.content);
        const indexType = "diary-daily";

        const params: IndexParams = {
          id: entry.id,
          content: markdown,
          type: indexType,
          updateTime: entry.update_time,
          modelInfo,
        };

        const success = await indexContent(params);
        if (success) {
          setBatchCreateOrUpdateSuccess(prev => prev + 1);
        } else {
          setBatchCreateOrUpdateError(prev => prev + 1);
        }
      } catch (error) {
        console.error("批量索引失败:", error);
        setBatchCreateOrUpdateError(prev => prev + 1);
      }
    }

    await initIndexResults();
    setSelectedRows([]);
    setBatchCreateOrUpdateLoading(false);
  });

  const handleBatchDelete = useMemoizedFn(async () => {
    if (deleteEmbeddings.length === 0) return;

    setBatchDeleteLoading(true);

    for (const entry of deleteEmbeddings) {
      try {
        await removeIndex(entry.id, "diary-daily");
      } catch (error) {
        console.error("批量删除失败:", error);
      }
    }

    await initIndexResults();
    setSelectedRows([]);
    setBatchDeleteLoading(false);
  });

  const rightExtraNode = (
    <Flex gap={12} justify="right">
      {batchCreateOrUpdateTotal > 0 && (
        <Flex vertical gap={12}>
          <Flex gap={12} justify="right">
            <Tag color="green">成功：{batchCreateOrUpdateSuccess}</Tag>
            <Tag color="red">失败：{batchCreateOrUpdateError}</Tag>
            <Tag color="purple">总数：{batchCreateOrUpdateTotal}</Tag>
          </Flex>
        </Flex>
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

  const onCreateEmbedding = useMemoizedFn(async (markdown: string, record: DiaryEntry) => {
    setLoadingIds(prev => [...prev, record.id]);
    const messageKey = `create-diary-index-${record.id}`;
    message.loading({ content: "正在创建索引...", key: messageKey });

    try {
      const indexType = getIndexType(record);
      const vecResult = vecResults.find(
        result => result.id === record.id && result.type === indexType
      );

      if (vecResult && vecResult.updateTime === record.updateTime) {
        message.success({ content: "索引已存在", key: messageKey });
        return true;
      }

      const params: IndexParams = {
        id: record.id,
        content: markdown,
        type: indexType,
        updateTime: record.updateTime,
        modelInfo,
      };

      const success = await indexContent(params);

      if (success) {
        await initIndexResults();
        message.success({ content: "索引创建成功", key: messageKey });
        return true;
      } else {
        message.error({ content: "索引创建失败", key: messageKey });
        return false;
      }
    } catch (error) {
      console.error("创建索引失败:", error);
      message.error({ content: "索引创建失败", key: messageKey });
      return false;
    } finally {
      setLoadingIds(prev => prev.filter(id => id !== record.id));
    }
  });

  const onRemoveEmbedding = useMemoizedFn(async (record: DiaryEntry) => {
    setLoadingIds(prev => [...prev, record.id]);
    const messageKey = `remove-diary-index-${record.id}`;
    message.loading({ content: "正在删除索引...", key: messageKey });

    try {
      const indexType = getIndexType(record);
      await removeIndex(record.id, indexType);
      await initIndexResults();
      message.success({ content: "索引删除成功", key: messageKey });
    } catch (error) {
      console.error("删除索引失败:", error);
      message.error({ content: "索引删除失败", key: messageKey });
    } finally {
      setLoadingIds(prev => prev.filter(id => id !== record.id));
    }
  });

  const onUpdateEmbedding = useMemoizedFn(async (markdown: string, record: DiaryEntry) => {
    setLoadingIds(prev => [...prev, record.id]);
    const messageKey = `update-diary-index-${record.id}`;
    message.loading({ content: "正在更新索引...", key: messageKey });

    try {
      const indexType = getIndexType(record);
      const vecResult = vecResults.find(
        result => result.id === record.id && result.type === indexType
      );

      if (!vecResult || record.updateTime > vecResult.updateTime) {
        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: indexType,
          updateTime: record.updateTime,
          modelInfo,
        };

        const success = await indexContent(params);

        if (success) {
          await initIndexResults();
          message.success({ content: "索引更新成功", key: messageKey });
          return true;
        } else {
          message.error({ content: "索引更新失败", key: messageKey });
          return false;
        }
      } else {
        message.success({ content: "索引已是最新", key: messageKey });
        return true;
      }
    } catch (error) {
      console.error("更新索引失败:", error);
      message.error({ content: "索引更新失败", key: messageKey });
      return false;
    } finally {
      setLoadingIds(prev => prev.filter(id => id !== record.id));
    }
  });

  const columns: TableColumnType<DiaryEntry>[] = [
    {
      key: "id",
      dataIndex: "id",
      title: "ID",
      width: 80,
    },
    {
      key: "date",
      dataIndex: "date",
      title: "日期",
      width: 140,
    },
    {
      key: "tags",
      dataIndex: "tags",
      title: "标签",
      width: 180,
      filters: [
        { text: "全部", value: ALL_TAG_FILTER },
        { text: "无标签", value: EMPTY_TAG_FILTER },
        ...tagOptions.map(tag => ({ text: tag, value: tag })),
      ],
      filteredValue: filteredInfo.tags || null,
      render: (tags: string[]) => {
        if (!tags.length) {
          return <Typography.Text type="secondary">无标签</Typography.Text>;
        }
        return (
          <Flex gap={4} wrap>
            {tags.map(tag => (
              <Tag color="blue" key={tag}>
                {tag}
              </Tag>
            ))}
          </Flex>
        );
      },
    },
    {
      key: "createTime",
      dataIndex: "createTime",
      title: "创建时间",
      width: 160,
      render: (createTime: number) => <div>{formatDate(createTime, true)}</div>,
    },
    {
      key: "updateTime",
      dataIndex: "updateTime",
      title: "更新时间",
      width: 160,
      render: (updateTime: number) => <div>{formatDate(updateTime, true)}</div>,
    },
    {
      key: "content",
      dataIndex: "content",
      title: "内容",
      render: (content: Descendant[]) => (
        <Flex vertical gap={12} align="flex-start">
          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ maxWidth: 400 }}>
            {getEditorText(content, 50)}
          </Typography.Paragraph>
          <Popover
            trigger="hover"
            placement="bottom"
            content={
              <Editor
                previewBlocks={3}
                style={{ maxWidth: 320, maxHeight: 180, overflow: "hidden" }}
                readonly
                initValue={content?.slice(0, 3) || []}
              />
            }
          >
            <Button style={{ padding: 0 }} type="link">
              查看更多
            </Button>
          </Popover>
        </Flex>
      ),
    },
    {
      key: "wordCount",
      dataIndex: "wordCount",
      title: "字数",
      width: 80,
    },
    {
      key: "index_status",
      dataIndex: "index_status",
      title: "索引状态",
      width: 120,
      filters: [
        { text: "未索引", value: "未索引" },
        { text: "已索引", value: "已索引" },
        { text: "待更新", value: "待更新" },
      ],
      filteredValue: filteredInfo.index_status || null,
      render: (_, record) => {
        const indexType = getIndexType(record);
        const vecResult = vecResults.find(
          result => result.id === record.id && result.type === indexType
        );

        if (vecResult) {
          return (
            <Tag color={record.updateTime > vecResult.updateTime ? "orange" : "green"}>
              {record.updateTime > vecResult.updateTime ? "待更新" : "已索引"}
            </Tag>
          );
        } else {
          return <Tag color="red">未索引</Tag>;
        }
      },
    },
    {
      key: "operations",
      title: "操作",
      width: 120,
      render: (_: any, record: DiaryEntry) => {
        const isLoading = loadingIds.includes(record.id);
        const indexType = getIndexType(record);
        const vecResult = vecResults.find(
          result => result.id === record.id && result.type === indexType
        );

        if (!vecResult) {
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
        } else if (record.updateTime > vecResult.updateTime) {
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
    total: filteredEntries.length,
    showSizeChanger: true,
  };

  const onChange: TableProps["onChange"] = useMemoizedFn((pagination, filteredInfo) => {
    if (pagination.current !== current) {
      setCurrent(pagination.current || 1);
      setSelectedRows([]);
    }
    if (pagination.pageSize !== pageSize) {
      setPageSize(pagination.pageSize || PAGE_SIZE);
    }
    setFilteredInfo(prevFilteredInfo => {
      return {
        ...prevFilteredInfo,
        ...filteredInfo,
        tags: filteredInfo.tags,
        index_status: filteredInfo.index_status,
      };
    });
  });

  return {
    dataSource: slicedEntries,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
  };
};

export default useDiaryConfig;
