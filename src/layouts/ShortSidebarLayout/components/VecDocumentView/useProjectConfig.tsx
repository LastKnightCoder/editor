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
  getProjectList,
  getAllProjectItems,
} from "@/commands";
import { Project, ProjectItem, VecDocument } from "@/types";
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

type OnChange = NonNullable<TableProps<ProjectItem>["onChange"]>;
type Filters = Parameters<OnChange>[1];

// 扩展ProjectItem类型，添加UI相关属性
interface ExtendedProjectItem extends Omit<ProjectItem, "children"> {
  level?: number;
  children?: ExtendedProjectItem[];
}

// 递归获取所有子项的ID
const getAllChildrenIds = (
  item: ExtendedProjectItem,
  items: ExtendedProjectItem[],
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

// 递归查找项目项
const findItemById = (
  id: number,
  items: ExtendedProjectItem[],
): ExtendedProjectItem | undefined => {
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

const useProjectConfig = () => {
  const { message } = App.useApp();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  const [vecDocuments, setVecDocuments] = useState<VecDocument[]>([]);
  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<ExtendedProjectItem[]>([]);
  const [current, setCurrent] = useState(1);
  const [allTreeData, setAllTreeData] = useState<ExtendedProjectItem[]>([]);

  const { provider } = useSettingStore((state) => ({
    provider: state.setting.llmProviders[ELLMProvider.OPENAI],
  }));

  // 获取所有项目
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projects = await getProjectList();
        setProjects(projects);
        if (projects.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projects[0].id);
        }
      } catch (error) {
        console.error("获取项目列表失败", error);
      }
    };
    fetchProjects();
  }, []);

  // 获取所有项目项
  useEffect(() => {
    const fetchProjectItems = async () => {
      try {
        const items = await getAllProjectItems();
        setProjectItems(items);
      } catch (error) {
        console.error("获取项目项失败", error);
      }
    };
    fetchProjectItems();
  }, []);

  // 获取向量文档
  useEffect(() => {
    const fetchVecDocuments = async () => {
      try {
        const docs = await getVecDocumentsByRefType("project");
        setVecDocuments(docs);
      } catch (error) {
        console.error("获取向量文档失败", error);
      }
    };
    fetchVecDocuments();
  }, []);

  // 构建项目项的树形结构
  const filteredProjectItems = useMemo(() => {
    if (!selectedProjectId) return [];

    // 获取属于该项目的所有项目项
    const projectRelatedItems = projectItems.filter((item) =>
      item.projects.includes(selectedProjectId),
    );

    // 获取根级项目项（没有父级或父级不在当前项目中的项目项）
    const rootItems = projectRelatedItems.filter((item) => {
      if (!item.parents || item.parents.length === 0) return true;

      // 检查父级是否都不在当前项目中
      return !item.parents.some((parentId) =>
        projectRelatedItems.some((pi) => pi.id === parentId),
      );
    });

    // 构建树形结构
    const buildTree = (items: ProjectItem[]): ExtendedProjectItem[] => {
      return items.map((item) => {
        // 查找子项
        const childrenIds = item.children || [];
        const childItems = projectRelatedItems.filter((child) =>
          childrenIds.includes(child.id),
        );

        // 递归构建子树
        const children =
          childItems.length > 0 ? buildTree(childItems) : undefined;

        // 创建扩展的项目项，排除原始的children属性
        const { children: _, ...rest } = item;
        return {
          ...rest,
          level: 0, // 根级项目的层级为0
          children,
        };
      });
    };

    const treeData = buildTree(rootItems);
    setAllTreeData(treeData);
    return treeData;
  }, [selectedProjectId, projectItems]);

  // 应用过滤条件
  const filteredData = useMemo(() => {
    let result = [...filteredProjectItems];

    // 应用嵌入状态过滤条件
    if (
      filteredInfo.embeddingStatus &&
      Array.isArray(filteredInfo.embeddingStatus) &&
      filteredInfo.embeddingStatus.length > 0
    ) {
      // 递归过滤函数
      const filterItems = (
        items: ExtendedProjectItem[],
      ): ExtendedProjectItem[] => {
        return items.filter((item) => {
          const hasEmbedding = vecDocuments.some(
            (doc) => doc.refId === item.id && doc.refType === "project",
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
  }, [filteredProjectItems, filteredInfo, vecDocuments]);

  // 分页处理
  const slicedProjectItems = useMemo(() => {
    const start = (current - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredData.slice(start, end);
  }, [filteredData, current]);

  // 批量操作
  const initVecDocuments = async () => {
    try {
      const docs = await getVecDocumentsByRefType("project");
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
          const item = projectItems.find((item) => item.id === row.id);
          if (!item) return undefined;

          // 转换为ExtendedProjectItem
          const { children, ...rest } = item;
          return { ...rest } as ExtendedProjectItem;
        })
        .filter(Boolean) as ExtendedProjectItem[];

      setSelectedRows(originalRows);
    },
    type: "project",
    vecDocuments,
    initVecDocuments,
  });

  // 行选择配置
  const rowSelection: TableRowSelection<ExtendedProjectItem> = {
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
      const additionalRows: ExtendedProjectItem[] = [];
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

  // 嵌入单个项目项
  const onEmbedding = async (record: ExtendedProjectItem) => {
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
        "project",
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

  // 更新单个项目项的嵌入
  const onUpdateEmbedding = async (record: ExtendedProjectItem) => {
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
      await deleteVecDocumentsByRef(record.id, "project");

      // 创建新的嵌入
      await embeddingContent(
        apiKey,
        baseUrl,
        EMBEDDING_MODEL,
        markdown,
        record.id,
        "project",
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

  // 删除单个项目项的嵌入
  const onRemoveEmbedding = async (record: ExtendedProjectItem) => {
    try {
      await deleteVecDocumentsByRef(record.id, "project");

      // 刷新向量文档列表
      await initVecDocuments();

      return true;
    } catch (error) {
      console.error("删除嵌入失败", error);
      return false;
    }
  };

  // 表格列配置
  const columns: TableColumnType<ExtendedProjectItem>[] = [
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
          (doc) => doc.refId === record.id && doc.refType === "project",
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
          (doc) => doc.refId === record.id && doc.refType === "project",
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
  const onChange: TableProps<ExtendedProjectItem>["onChange"] = useMemoizedFn(
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

  // 左侧项目选择下拉框
  const leftExtraNode = (
    <Select
      style={{ width: 160 }}
      placeholder="选择项目"
      value={selectedProjectId}
      onChange={setSelectedProjectId}
      options={projects.map((project) => ({
        label: project.title,
        value: project.id,
      }))}
    />
  );

  return {
    dataSource: slicedProjectItems,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
    leftExtraNode,
  };
};

export default useProjectConfig;
