import Editor from "@/components/Editor";
import {
  formatDate,
  getEditorText,
  embeddingContent,
  getMarkdown,
} from "@/utils";
import {
  getVecDocumentsByRefType,
  deleteVecDocumentsByRef,
  getAllDocuments,
  getAllDocumentItems,
} from "@/commands";
import { IDocument, IDocumentItem, VecDocument } from "@/types";
import { useState, useEffect, useMemo } from "react";
import {
  App,
  Button,
  Popover,
  Typography,
  Popconfirm,
  TableProps,
  TableColumnType,
  Select,
  Space,
  Tag,
  Flex,
} from "antd";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import useBatchOperation from "./useBatchOperation";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";

const EMBEDDING_MODEL = "text-embedding-3-large";
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
  const [vecDocuments, setVecDocuments] = useState<VecDocument[]>([]);
  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<ExtendedDocumentItem[]>([]);
  const [current, setCurrent] = useState(1);
  const [allTreeData, setAllTreeData] = useState<ExtendedDocumentItem[]>([]);

  const { provider } = useSettingStore((state) => ({
    provider: state.setting.llmProviders[ELLMProvider.OPENAI],
  }));

  // 获取所有知识库
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const docs = await getAllDocuments();
        setDocuments(docs);
        if (docs.length > 0 && !selectedDocumentId) {
          setSelectedDocumentId(docs[0].id);
        }
      } catch (error) {
        console.error("获取知识库列表失败", error);
      }
    };
    fetchDocuments();
  }, []);

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

  // 获取向量文档
  useEffect(() => {
    const fetchVecDocuments = async () => {
      try {
        const docs = await getVecDocumentsByRefType("document");
        setVecDocuments(docs);
      } catch (error) {
        console.error("获取向量文档失败", error);
      }
    };
    fetchVecDocuments();
  }, []);

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

          // 创建扩展的知识库项，排除原始的children属性
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

    // 应用嵌入状态过滤条件
    if (
      filteredInfo.embeddingStatus &&
      Array.isArray(filteredInfo.embeddingStatus) &&
      filteredInfo.embeddingStatus.length > 0
    ) {
      // 递归过滤函数
      const filterItems = (
        items: ExtendedDocumentItem[],
      ): ExtendedDocumentItem[] => {
        return items.filter((item) => {
          const hasEmbedding = vecDocuments.some(
            (doc) => doc.refId === item.id && doc.refType === "document",
          );

          const matchesFilter = filteredInfo.embeddingStatus?.some(
            (status) =>
              (status === "已嵌入" && hasEmbedding) ||
              (status === "未嵌入" && !hasEmbedding),
          );

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
  }, [filteredDocumentItems, filteredInfo, vecDocuments]);

  // 分页处理
  const slicedDocumentItems = useMemo(() => {
    const start = (current - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredData.slice(start, end);
  }, [filteredData, current]);

  // 批量操作
  const initVecDocuments = async () => {
    try {
      const docs = await getVecDocumentsByRefType("document");
      setVecDocuments(docs);
    } catch (error) {
      console.error("获取向量文档失败", error);
    }
  };

  // 适配useBatchOperation所需的数据结构
  const adaptedSelectedRows = selectedRows.map((item) => ({
    id: item.id,
    content: item.content,
    update_time: item.updateTime,
  }));

  const {
    handleBatchEmbedding,
    handleBatchDelete: handleBatchRemoveEmbedding,
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
          const { children, ...rest } = item;
          return { ...rest } as ExtendedDocumentItem;
        })
        .filter(Boolean) as ExtendedDocumentItem[];

      setSelectedRows(originalRows);
    },
    type: "document",
    vecDocuments,
    initVecDocuments,
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

  // 嵌入单个知识库项
  const onEmbedding = async (record: ExtendedDocumentItem) => {
    try {
      // 添加空值检查，避免 getEditorText 的 undefined 错误
      const content = record.content
        ? getEditorText((record.content as Descendant[]) || [])
        : "";
      const markdown = record.content
        ? getMarkdown(record.content as Descendant[])
        : "";

      if (!content) {
        message.error("内容为空，无法嵌入");
        return false;
      }

      // 获取API密钥和baseUrl
      const config = provider.configs.find(
        (config) => config.id === provider.currentConfigId,
      );

      if (!config) {
        message.error("未找到API配置");
        return false;
      }

      const { apiKey, baseUrl } = config;

      // 调用嵌入API
      await embeddingContent(
        apiKey,
        baseUrl,
        EMBEDDING_MODEL,
        markdown,
        record.id,
        "document",
        record.updateTime,
      );

      // 刷新向量文档列表
      await initVecDocuments();

      return true;
    } catch (error) {
      console.error("嵌入失败", error);
      return false;
    }
  };

  // 更新单个知识库项的嵌入
  const onUpdateEmbedding = async (record: ExtendedDocumentItem) => {
    try {
      // 添加空值检查，避免 getEditorText 的 undefined 错误
      const content = record.content
        ? getEditorText((record.content as Descendant[]) || [])
        : "";
      const markdown = record.content
        ? getMarkdown(record.content as Descendant[])
        : "";

      if (!content) {
        message.error("内容为空，无法更新嵌入");
        return false;
      }

      // 获取API密钥和baseUrl
      const config = provider.configs.find(
        (config) => config.id === provider.currentConfigId,
      );

      if (!config) {
        message.error("未找到API配置");
        return false;
      }

      const { apiKey, baseUrl } = config;

      // 先删除旧的嵌入
      await deleteVecDocumentsByRef(record.id, "document");

      // 创建新的嵌入
      await embeddingContent(
        apiKey,
        baseUrl,
        EMBEDDING_MODEL,
        markdown,
        record.id,
        "document",
        record.updateTime,
      );

      // 刷新向量文档列表
      await initVecDocuments();

      return true;
    } catch (error) {
      console.error("更新嵌入失败", error);
      return false;
    }
  };

  // 删除单个知识库项的嵌入
  const onRemoveEmbedding = async (record: ExtendedDocumentItem) => {
    try {
      await deleteVecDocumentsByRef(record.id, "document");

      // 刷新向量文档列表
      await initVecDocuments();

      return true;
    } catch (error) {
      console.error("删除嵌入失败", error);
      return false;
    }
  };

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
      title: "嵌入状态",
      key: "embeddingStatus",
      filters: [
        { text: "已嵌入", value: "已嵌入" },
        { text: "待更新", value: "待更新" },
        { text: "未嵌入", value: "未嵌入" },
      ],
      filteredValue: filteredInfo.embeddingStatus || null,
      render: (_, record) => {
        const vecEmbeddedDocuments = vecDocuments.filter(
          (doc) => doc.refId === record.id && doc.refType === "document",
        );

        if (vecEmbeddedDocuments.length === 0) {
          return <Tag color="red">未嵌入</Tag>;
        } else {
          const embeddingTime = vecEmbeddedDocuments[0].refUpdateTime;
          const itemUpdateTime = record.updateTime;

          if (itemUpdateTime > embeddingTime) {
            return <Tag color="orange">已嵌入（待更新）</Tag>;
          } else {
            return <Tag color="green">已嵌入</Tag>;
          }
        }
      },
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => {
        const vecEmbeddedDocuments = vecDocuments.filter(
          (doc) => doc.refId === record.id && doc.refType === "document",
        );

        if (vecEmbeddedDocuments.length === 0) {
          // 未嵌入状态
          return (
            <Button
              type="link"
              onClick={async () => {
                message.loading({
                  key: "embedding",
                  content: "正在嵌入，请稍后...",
                  duration: 0,
                });
                const success = await onEmbedding(record);
                if (success) {
                  message.success({
                    key: "embedding",
                    content: "嵌入成功",
                    duration: 2,
                  });
                } else {
                  message.error({
                    key: "embedding",
                    content: "嵌入失败",
                    duration: 2,
                  });
                }
              }}
            >
              创建嵌入
            </Button>
          );
        } else {
          const embeddingTime = vecEmbeddedDocuments[0].refUpdateTime;
          const itemUpdateTime = record.updateTime;

          if (itemUpdateTime > embeddingTime) {
            // 需要更新的状态
            return (
              <>
                <Button
                  type="link"
                  onClick={async () => {
                    message.loading({
                      key: "updateEmbedding",
                      content: "正在更新嵌入，请稍后...",
                      duration: 0,
                    });
                    const success = await onUpdateEmbedding(record);
                    if (success) {
                      message.success({
                        key: "updateEmbedding",
                        content: "更新嵌入成功",
                        duration: 2,
                      });
                    } else {
                      message.error({
                        key: "updateEmbedding",
                        content: "更新嵌入失败",
                        duration: 2,
                      });
                    }
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
                    const success = await onRemoveEmbedding(record);
                    if (success) {
                      message.success({
                        key: "removeEmbedding",
                        content: "删除嵌入成功",
                        duration: 2,
                      });
                    } else {
                      message.error({
                        key: "removeEmbedding",
                        content: "删除嵌入失败",
                        duration: 2,
                      });
                    }
                  }}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="link" danger>
                    删除嵌入
                  </Button>
                </Popconfirm>
              </>
            );
          } else {
            // 已嵌入状态
            return (
              <Popconfirm
                title="确定要删除嵌入吗？"
                onConfirm={async () => {
                  message.loading({
                    key: "removeEmbedding",
                    content: "正在删除嵌入，请稍后...",
                    duration: 0,
                  });
                  const success = await onRemoveEmbedding(record);
                  if (success) {
                    message.success({
                      key: "removeEmbedding",
                      content: "删除嵌入成功",
                      duration: 2,
                    });
                  } else {
                    message.error({
                      key: "removeEmbedding",
                      content: "删除嵌入失败",
                      duration: 2,
                    });
                  }
                }}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" danger>
                  删除嵌入
                </Button>
              </Popconfirm>
            );
          }
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
        批量嵌入
      </Button>
      <Button
        danger
        disabled={selectedRows.length === 0 || deleteEmbeddings.length === 0}
        loading={batchDeleteLoading}
        onClick={handleBatchRemoveEmbedding}
      >
        批量删除
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
