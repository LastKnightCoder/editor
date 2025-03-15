import Editor from "@/components/Editor";
import { formatDate, getEditorText, getMarkdown } from "@/utils";
import { getProjectList, getAllProjectItems } from "@/commands";
import { Project, ProjectItem, SearchResult } from "@/types";
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
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { indexContent, removeIndex, getAllIndexResults } from "@/utils/search";

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
  const [indexResults, setIndexResults] = useState<
    [SearchResult[], SearchResult[]]
  >([[], []]);
  const [filteredInfo, setFilteredInfo] = useState<Filters>({});
  const [selectedRows, setSelectedRows] = useState<ExtendedProjectItem[]>([]);
  const [current, setCurrent] = useState(1);
  const [allTreeData, setAllTreeData] = useState<ExtendedProjectItem[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);

  // 解构索引结果
  const [ftsResults, vecResults] = indexResults;

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

  // 获取索引结果
  const initIndexResults = useMemoizedFn(async () => {
    const results = await getAllIndexResults("project-item");
    setIndexResults(results);
  });

  useEffect(() => {
    initIndexResults().then();
  }, [initIndexResults]);

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

    // 应用索引状态过滤条件
    if (
      filteredInfo.index_status &&
      Array.isArray(filteredInfo.index_status) &&
      filteredInfo.index_status.length > 0
    ) {
      // 递归过滤函数
      const filterItems = (
        items: ExtendedProjectItem[],
      ): ExtendedProjectItem[] => {
        return items.filter((item) => {
          // 查找索引状态
          const hasFTSIndex = ftsResults.some(
            (result) => result.id === item.id && result.type === "project-item",
          );

          const vecResult = vecResults.find(
            (result) => result.id === item.id && result.type === "project-item",
          );

          let status;
          if (!hasFTSIndex && !vecResult) {
            status = "未索引";
          } else if (vecResult && item.updateTime > vecResult.updateTime) {
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
  }, [filteredProjectItems, filteredInfo, ftsResults, vecResults]);

  // 分页处理
  const slicedProjectItems = useMemo(() => {
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
          const item = projectItems.find((item) => item.id === row.id);
          if (!item) return undefined;

          // 转换为ExtendedProjectItem
          const { children, ...rest } = item;
          return { ...rest } as ExtendedProjectItem;
        })
        .filter(Boolean) as ExtendedProjectItem[];

      setSelectedRows(originalRows);
    },
    type: "project-item",
    indexResults,
    initIndexResults,
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

  // 创建索引
  const onCreateEmbedding = useMemoizedFn(
    async (markdown: string, record: ExtendedProjectItem) => {
      if (!provider.currentConfigId) {
        message.error("未配置OpenAI API密钥");
        return false;
      }

      const currentConfig = provider.configs.find(
        (config) => config.id === provider.currentConfigId,
      );

      if (!currentConfig) {
        message.error("未找到有效的API配置");
        return false;
      }

      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `create-index-${record.id}`;
      message.loading({ content: "正在创建索引...", key: messageKey });

      try {
        const { apiKey, baseUrl } = currentConfig;

        await indexContent({
          id: record.id,
          content: markdown,
          type: "project-item",
          updateTime: record.updateTime,
          modelInfo: {
            key: apiKey,
            baseUrl,
            model: EMBEDDING_MODEL,
          },
        });

        await initIndexResults();
        message.success({ content: "索引创建成功", key: messageKey });
        return true;
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
    async (markdown: string, record: ExtendedProjectItem) => {
      if (!provider.currentConfigId) {
        message.error("未配置OpenAI API密钥");
        return false;
      }

      const currentConfig = provider.configs.find(
        (config) => config.id === provider.currentConfigId,
      );

      if (!currentConfig) {
        message.error("未找到有效的API配置");
        return false;
      }

      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `update-index-${record.id}`;
      message.loading({ content: "正在更新索引...", key: messageKey });

      try {
        const { apiKey, baseUrl } = currentConfig;

        await indexContent({
          id: record.id,
          content: markdown,
          type: "project-item",
          updateTime: record.updateTime,
          modelInfo: {
            key: apiKey,
            baseUrl,
            model: EMBEDDING_MODEL,
          },
        });

        await initIndexResults();
        message.success({ content: "索引更新成功", key: messageKey });
        return true;
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
    async (record: ExtendedProjectItem) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const messageKey = `remove-index-${record.id}`;
      message.loading({ content: "正在删除索引...", key: messageKey });

      try {
        await removeIndex(record.id, "project-item");
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
        const hasFTSIndex = ftsResults.some(
          (result) => result.id === record.id && result.type === "project-item",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "project-item",
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
                    record.updateTime > vecResult.updateTime
                      ? "orange"
                      : "green"
                  }
                >
                  向量:{" "}
                  {record.updateTime > vecResult.updateTime
                    ? "待更新"
                    : "已索引"}
                </Tag>
              ) : (
                <Tag color="red">向量: 未索引</Tag>
              )}
            </Flex>
          );
        };

        let status = "已索引";
        if (!hasFTSIndex && !vecResult) {
          status = "未索引";
        } else if (
          (hasFTSIndex && !vecResult) ||
          (!hasFTSIndex && vecResult) ||
          (vecResult && record.updateTime > vecResult.updateTime)
        ) {
          status = "待更新";
        }

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
        const hasFTSIndex = ftsResults.some(
          (result) => result.id === record.id && result.type === "project-item",
        );

        const vecResult = vecResults.find(
          (result) => result.id === record.id && result.type === "project-item",
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
          (vecResult && record.updateTime > vecResult.updateTime)
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
