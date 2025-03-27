import Editor from "@/components/Editor";
import { formatDate, getEditorText, getMarkdown } from "@/utils";
import { getAllDocuments, getAllDocumentItems } from "@/commands";
import { IDocument, IDocumentItem, IndexParams, SearchResult } from "@/types";
import { useState, useEffect, useMemo } from "react";
import {
  Button,
  Popover,
  Typography,
  TableProps,
  TableColumnType,
  Select,
  Space,
  Tag,
  Flex,
  App,
} from "antd";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import useBatchOperation from "./useBatchOperation";
import useEmbeddingConfig from "./useEmbeddingConfig";
import { indexContent, removeIndex, getAllIndexResults } from "@/utils/search";

const PAGE_SIZE = 20;

type OnChange = NonNullable<TableProps<IDocumentItem>["onChange"]>;
type Filters = Parameters<OnChange>[1];

// 扩展IDocumentItem类型，添加UI相关属性
interface ExtendedDocumentItem extends Omit<IDocumentItem, "children"> {
  level?: number;
  children?: ExtendedDocumentItem[];
}

// 递归获取所有子项的ID
const getAllChildrenIds = (
  item: ExtendedDocumentItem,
  items: ExtendedDocumentItem[],
): number[] => {
  const result: number[] = [];

  if (item.children && item.children.length > 0) {
    for (const child of item.children) {
      result.push(child.id);
      result.push(...getAllChildrenIds(child, items));
    }
  }

  return result;
};

// 递归查找知识库项
const findItemById = (
  id: number,
  items: ExtendedDocumentItem[],
): ExtendedDocumentItem | undefined => {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }

    if (item.children && item.children.length > 0) {
      const found = findItemById(id, item.children);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
};

const useDocumentConfig = () => {
  const { message } = App.useApp();
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [documentItems, setDocumentItems] = useState<IDocumentItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(
    null,
  );
  const [indexResults, setIndexResults] = useState<
    [SearchResult[], SearchResult[]]
  >([[], []]);
  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<ExtendedDocumentItem[]>([]);
  const [current, setCurrent] = useState(1);
  const [allTreeData, setAllTreeData] = useState<ExtendedDocumentItem[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);

  const modelInfo = useEmbeddingConfig();

  // 解构索引结果
  const [ftsResults, vecResults] = indexResults;

  const handleFetchDocuments = useMemoizedFn(async () => {
    try {
      const docs = await getAllDocuments();
      setDocuments(docs);
      if (docs.length > 0 && !selectedDocumentId) {
        setSelectedDocumentId(docs[0].id);
      }
    } catch (error) {
      console.error("获取知识库列表失败", error);
    }
  });

  useEffect(() => {
    handleFetchDocuments();
  }, [handleFetchDocuments]);

  // 获取所有知识库项
  useEffect(() => {
    const fetchDocumentItems = async () => {
      try {
        const items = await getAllDocumentItems();
        setDocumentItems(items);
      } catch (error) {
        console.error("获取知识库项失败", error);
      }
    };
    fetchDocumentItems();
  }, []);

  // 获取索引结果
  const initIndexResults = useMemoizedFn(async () => {
    try {
      const results = await getAllIndexResults("document-item");
      setIndexResults(results);
    } catch (e) {
      console.error("初始化索引结果失败", e);
      throw e;
    }
  });

  useEffect(() => {
    initIndexResults().then();
  }, [initIndexResults]);

  // 构建知识库项的树形结构
  const filteredDocumentItems = useMemo(() => {
    if (!selectedDocumentId) return [];

    // 获取选中的知识库
    const selectedDocument = documents.find(
      (doc) => doc.id === selectedDocumentId,
    );
    if (!selectedDocument) return [];

    // 获取直接子文档项的ID
    const directChildrenIds = selectedDocument.children || [];

    // 构建ID到文档项的映射，方便快速查找
    const itemMap = new Map<number, IDocumentItem>();
    documentItems.forEach((item) => {
      itemMap.set(item.id, item);
    });

    // 递归构建树结构
    const buildTree = (itemIds: number[]): ExtendedDocumentItem[] => {
      return itemIds
        .map((id) => itemMap.get(id))
        .filter(Boolean)
        .map((item) => {
          if (!item) return null;

          // 递归构建子树
          const childrenItems =
            item.children && item.children.length > 0
              ? buildTree(item.children)
              : undefined;

          const { children: _, ...rest } = item;

          return {
            ...rest,
            level: 0,
            children: childrenItems,
          } as ExtendedDocumentItem;
        })
        .filter(Boolean) as ExtendedDocumentItem[];
    };

    const treeData = buildTree(directChildrenIds);
    setAllTreeData(treeData);
    return treeData;
  }, [selectedDocumentId, documentItems, documents]);

  // 应用过滤条件
  const filteredData = useMemo(() => {
    let result = [...filteredDocumentItems];

    // 应用索引状态过滤条件
    if (
      filteredInfo.index_status &&
      Array.isArray(filteredInfo.index_status) &&
      filteredInfo.index_status.length > 0
    ) {
      // 递归过滤函数
      const filterItems = (
        items: ExtendedDocumentItem[],
      ): ExtendedDocumentItem[] => {
        return items.filter((item) => {
          // 查找索引状态
          const ftsResult = ftsResults.find(
            (result) =>
              result.id === item.id && result.type === "document-item",
          );

          const vecResult = vecResults.find(
            (result) =>
              result.id === item.id && result.type === "document-item",
          );

          let status;
          if (!ftsResult && !vecResult) {
            status = "未索引";
          } else if (
            (vecResult && item.updateTime !== vecResult.updateTime) ||
            (ftsResult && item.updateTime !== ftsResult.updateTime)
          ) {
            status = "待更新";
          } else {
            status = "已索引";
          }

          const matchesFilter = filteredInfo.index_status?.includes(status);

          // 如果有子项，递归过滤
          if (item.children && item.children.length > 0) {
            const filteredChildren = filterItems(item.children);
            item.children =
              filteredChildren.length > 0 ? filteredChildren : undefined;
          }

          // 如果当前项匹配或者有匹配的子项，则保留
          return matchesFilter || (item.children && item.children.length > 0);
        });
      };

      result = filterItems(result);
    }

    return result;
  }, [filteredDocumentItems, filteredInfo, ftsResults, vecResults]);

  // 分页处理
  const slicedDocumentItems = useMemo(() => {
    const start = (current - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredData.slice(start, end);
  }, [filteredData, current]);

  // 适配useBatchOperation所需的数据结构
  const adaptedSelectedRows = selectedRows.map((item) => ({
    id: item.id,
    content: item.content,
    update_time: item.updateTime,
  }));

  const {
    handleBatchEmbedding,
    handleBatchDelete,
    batchCreateOrUpdateLoading,
    batchDeleteLoading,
    createEmbeddings,
    updateEmbeddings,
    deleteEmbeddings,
    batchCreateOrUpdateError,
    batchCreateOrUpdateSuccess,
    batchCreateOrUpdateTotal,
  } = useBatchOperation<{
    id: number;
    content: Descendant[];
    update_time: number;
  }>({
    selectedRows: adaptedSelectedRows,
    setSelectedRows: (newRows) => {
      // 将适配后的数据转换回原始数据结构
      const originalRows = (Array.isArray(newRows) ? newRows : [])
        .map((row) => {
          const item = documentItems.find((item) => item.id === row.id);
          if (!item) return undefined;

          // 转换为ExtendedDocumentItem
          const { children: _, ...rest } = item;
          return { ...rest } as ExtendedDocumentItem;
        })
        .filter(Boolean) as ExtendedDocumentItem[];

      setSelectedRows(originalRows);
    },
    type: "document-item",
    indexResults,
    initIndexResults,
  });

  // 行选择配置
  const rowSelection: TableRowSelection<ExtendedDocumentItem> = {
    selectedRowKeys: selectedRows.map((row) => row.id),
    onChange: (selectedRowKeys, newSelectedRows) => {
      // 找出新增的行
      const oldSelectedKeys = selectedRows.map((row) => row.id);
      const newlySelectedKeys = selectedRowKeys.filter(
        (key) => !oldSelectedKeys.includes(key as number),
      );

      // 找出取消选择的行
      const deselectedKeys = oldSelectedKeys.filter(
        (key) => !selectedRowKeys.includes(key),
      );

      // 处理新增选择的行，自动选中其所有子项
      const additionalRows: ExtendedDocumentItem[] = [];
      for (const key of newlySelectedKeys) {
        const item = findItemById(key as number, allTreeData);
        if (item && item.children && item.children.length > 0) {
          // 获取所有子项的ID
          const childrenIds = getAllChildrenIds(item, allTreeData);

          // 找到所有子项并添加到选择列表
          for (const childId of childrenIds) {
            const childItem = findItemById(childId, allTreeData);
            if (childItem && !selectedRowKeys.includes(childId)) {
              additionalRows.push(childItem);
            }
          }
        }
      }

      // 处理取消选择的行，自动取消选择其所有子项
      let finalSelectedRows = [...newSelectedRows, ...additionalRows];
      for (const key of deselectedKeys) {
        const item = findItemById(key, allTreeData);
        if (item && item.children && item.children.length > 0) {
          // 获取所有子项的ID
          const childrenIds = getAllChildrenIds(item, allTreeData);

          // 从选择列表中移除所有子项
          finalSelectedRows = finalSelectedRows.filter(
            (row) => !childrenIds.includes(row.id),
          );
        }
      }

      setSelectedRows(finalSelectedRows);
    },
  };

  // 创建索引
  const onCreateEmbedding = useMemoizedFn(
    async (markdown: string, record: ExtendedDocumentItem) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `create-document-item-index-${record.id}`;
      message.loading({ content: "正在创建索引...", key: messageKey });

      try {
        // 检查当前索引状态
        const ftsResult = ftsResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        const vecResult = vecResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        // 确定需要创建的索引类型
        const indexTypes: ("fts" | "vec")[] = [];
        if (!ftsResult || ftsResult.updateTime !== record.updateTime)
          indexTypes.push("fts");
        if (!vecResult || vecResult.updateTime !== record.updateTime)
          indexTypes.push("vec");

        // 如果没有需要创建的索引，直接返回成功
        if (indexTypes.length === 0) {
          message.success({ content: "索引已存在", key: messageKey });
          return true;
        }

        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: "document-item",
          updateTime: record.updateTime,
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
        console.error("创建索引失败", error);
        message.error({ content: "索引创建失败", key: messageKey });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  // 更新索引
  const onUpdateEmbedding = useMemoizedFn(
    async (markdown: string, record: ExtendedDocumentItem) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `update-document-item-index-${record.id}`;
      message.loading({ content: "正在更新索引...", key: messageKey });

      try {
        // 检查当前索引状态
        const ftsResult = ftsResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        const vecResult = vecResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        // 确定需要更新的索引类型
        const indexTypes: ("fts" | "vec")[] = [];
        if (!ftsResult || ftsResult.updateTime !== record.updateTime)
          indexTypes.push("fts");
        if (!vecResult || vecResult.updateTime !== record.updateTime)
          indexTypes.push("vec");

        // 如果没有需要更新的索引，直接返回成功
        if (indexTypes.length === 0) {
          message.success({ content: "索引已是最新", key: messageKey });
          return true;
        }

        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: "document-item",
          updateTime: record.updateTime,
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
        console.error("更新索引失败", error);
        message.error({ content: "索引更新失败", key: messageKey });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  // 删除索引
  const onRemoveEmbedding = useMemoizedFn(
    async (record: ExtendedDocumentItem) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `remove-document-item-index-${record.id}`;
      message.loading({ content: "正在删除索引...", key: messageKey });

      try {
        await removeIndex(record.id, "document-item");
        await initIndexResults();
        message.success({ content: "索引删除成功", key: messageKey });
        return true;
      } catch (error) {
        console.error("删除索引失败", error);
        message.error({ content: "索引删除失败", key: messageKey });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  // 表格列配置
  const columns: TableColumnType<ExtendedDocumentItem>[] = [
    {
      title: "标题",
      dataIndex: "title",
      key: "title",
      render: (text: string) => (
        <Typography.Text ellipsis style={{ maxWidth: 300 }}>
          {text}
        </Typography.Text>
      ),
    },
    {
      title: "内容",
      dataIndex: "content",
      key: "content",
      render: (content: Descendant[]) => {
        // 添加空值检查
        if (!content || !Array.isArray(content)) return null;

        return (
          <Popover
            content={
              <div style={{ width: 400, maxHeight: 400, overflow: "auto" }}>
                <Editor initValue={content || []} readonly={true} />
              </div>
            }
            trigger="click"
          >
            <Typography.Text
              ellipsis
              style={{ maxWidth: 300, cursor: "pointer" }}
            >
              {getEditorText(content || [])}
            </Typography.Text>
          </Popover>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "createTime",
      key: "createTime",
      render: (time: number) => formatDate(time, true),
    },
    {
      title: "更新时间",
      dataIndex: "updateTime",
      key: "updateTime",
      render: (time: number) => formatDate(time, true),
    },
    {
      title: "索引状态",
      key: "index_status",
      dataIndex: "index_status",
      filters: [
        { text: "未索引", value: "未索引" },
        { text: "已索引", value: "已索引" },
        { text: "待更新", value: "待更新" },
      ],
      filteredValue: filteredInfo.index_status || null,
      render: (_, record) => {
        // 查找索引状态
        const ftsResult = ftsResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        const vecResult = vecResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        // 显示FTS和向量索引状态
        const renderIndexStatus = () => {
          return (
            <Flex gap={4}>
              {ftsResult ? (
                <Tag
                  color={
                    record.updateTime !== ftsResult.updateTime
                      ? "orange"
                      : "green"
                  }
                >
                  FTS:{" "}
                  {record.updateTime !== ftsResult.updateTime
                    ? "待更新"
                    : "已索引"}
                </Tag>
              ) : (
                <Tag color="red">FTS: 未索引</Tag>
              )}
              {vecResult ? (
                <Tag
                  color={
                    record.updateTime !== vecResult.updateTime
                      ? "orange"
                      : "green"
                  }
                >
                  向量:{" "}
                  {record.updateTime !== vecResult.updateTime
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
      title: "操作",
      key: "operations",
      width: 120,
      render: (_, record) => {
        const isLoading = loadingIds.includes(record.id);

        // 查找索引状态
        const ftsResult = ftsResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
        );

        const vecResult = vecResults.find(
          (result) =>
            result.id === record.id && result.type === "document-item",
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
          (vecResult && record.updateTime !== vecResult.updateTime) ||
          (ftsResult && record.updateTime !== ftsResult.updateTime)
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

  // 分页配置
  const pagination = {
    pageSize: PAGE_SIZE,
    current,
    total: filteredData.length,
    showSizeChanger: false,
  };

  // 表格变化处理
  const onChange: TableProps<ExtendedDocumentItem>["onChange"] = useMemoizedFn(
    (pagination, filteredInfo) => {
      if (pagination.current !== current) {
        setCurrent(pagination.current || 1);
        setSelectedRows([]);
      }
      setFilteredInfo(filteredInfo);
    },
  );

  // 右侧额外节点
  const rightExtraNode = (
    <Space>
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
        type="primary"
        disabled={
          selectedRows.length === 0 ||
          createEmbeddings.length + updateEmbeddings.length === 0
        }
        loading={batchCreateOrUpdateLoading}
        onClick={handleBatchEmbedding}
      >
        批量索引
      </Button>
      <Button
        danger
        disabled={selectedRows.length === 0 || deleteEmbeddings.length === 0}
        loading={batchDeleteLoading}
        onClick={handleBatchDelete}
      >
        批量删除索引
      </Button>
    </Space>
  );

  // 左侧知识库选择下拉框
  const leftExtraNode = (
    <Select
      style={{ width: 160 }}
      placeholder="选择知识库"
      value={selectedDocumentId}
      onChange={setSelectedDocumentId}
      options={documents.map((doc) => ({
        label: doc.title,
        value: doc.id,
      }))}
    />
  );

  return {
    dataSource: slicedDocumentItems,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
    leftExtraNode,
  };
};

export default useDocumentConfig;
