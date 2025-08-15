import Editor from "@/components/Editor";
import { formatDate, getMarkdown } from "@/utils";
import { useEffect, useMemo, useState } from "react";
import { Button, Popover, TableProps, TableColumnType, App, Tag } from "antd";
import { Descendant } from "slate";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { TableRowSelection } from "antd/es/table/interface";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import { indexContent, removeIndex, getAllIndexResults } from "@/utils/search";
import { IndexParams, SearchResult } from "@/types";
import { getAllLogs } from "@/commands/log";

const PAGE_SIZE = 20;

interface LogRow {
  id: number;
  update_time: number;
  create_time: number;
  title: string;
  content: Descendant[];
}

const useLogConfig = () => {
  const { message } = App.useApp();
  const [logs, setLogs] = useState<LogRow[]>([]);
  useEffect(() => {
    getAllLogs().then((ls) =>
      setLogs(
        ls.map((l) => ({
          id: l.id,
          update_time: l.update_time,
          create_time: l.create_time,
          title: l.title,
          content: l.content,
        })),
      ),
    );
  }, []);

  const modelInfo = useEmbeddingConfig();
  const [vecResults, setVecResults] = useState<SearchResult[]>([]);
  const [selectedRows, setSelectedRows] = useState<LogRow[]>([]);
  const [loadingIds, setLoadingIds] = useState<number[]>([]);
  const [pageSize, setPageSize] = useLocalStorageState<number>("log-pagesize", {
    defaultValue: PAGE_SIZE,
  });
  const [current, setCurrent] = useState(1);

  const rowSelection: TableRowSelection<LogRow> = {
    selectedRowKeys: selectedRows.map((r) => r.id),
    onChange: (_k, rows) => setSelectedRows(rows),
  };

  const initIndexResults = useMemoizedFn(async () => {
    try {
      const results = await getAllIndexResults("log-entry");
      setVecResults(results);
    } catch (e) {
      console.error("初始化索引结果失败", e);
      throw e;
    }
  });
  useEffect(() => {
    initIndexResults().then();
  }, [initIndexResults]);

  const onCreateEmbedding = useMemoizedFn(
    async (markdown: string, record: LogRow) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const key = `create-log-index-${record.id}`;
      message.loading({ content: "正在创建索引...", key });
      try {
        const vecResult = vecResults.find(
          (r) => r.id === record.id && r.type === "log-entry",
        );
        if (vecResult && vecResult.updateTime >= record.update_time) {
          message.success({ content: "索引已存在", key });
          return true;
        }
        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: "log-entry",
          updateTime: record.update_time,
          modelInfo,
        };
        const success = await indexContent(params);
        if (success) {
          await initIndexResults();
          message.success({ content: "索引创建成功", key });
          return true;
        }
        message.error({ content: "索引创建失败", key });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  const onUpdateEmbedding = useMemoizedFn(
    async (markdown: string, record: LogRow) => {
      setLoadingIds((prev) => [...prev, record.id]);
      const key = `update-log-index-${record.id}`;
      message.loading({ content: "正在更新索引...", key });
      try {
        const params: IndexParams = {
          id: record.id,
          content: markdown,
          type: "log-entry",
          updateTime: record.update_time,
          modelInfo,
        };
        const success = await indexContent(params);
        if (success) {
          await initIndexResults();
          message.success({ content: "索引更新成功", key });
          return true;
        }
        message.error({ content: "索引更新失败", key });
        return false;
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== record.id));
      }
    },
  );

  const onRemoveEmbedding = useMemoizedFn(async (record: LogRow) => {
    setLoadingIds((prev) => [...prev, record.id]);
    const key = `remove-log-index-${record.id}`;
    message.loading({ content: "正在删除索引...", key });
    try {
      await removeIndex(record.id, "log-entry");
      await initIndexResults();
      message.success({ content: "索引删除成功", key });
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== record.id));
    }
  });

  const columns: TableColumnType<LogRow>[] = [
    { key: "id", dataIndex: "id", title: "ID", width: 80 },
    {
      key: "create_time",
      dataIndex: "create_time",
      title: "创建时间",
      width: 160,
      render: (t: number) => formatDate(t, true),
    },
    {
      key: "update_time",
      dataIndex: "update_time",
      title: "更新时间",
      width: 160,
      render: (t: number) => formatDate(t, true),
    },
    {
      key: "title",
      dataIndex: "title",
      title: "标题",
    },
    {
      key: "content",
      dataIndex: "content",
      title: "内容",
      render: (content: Descendant[]) => (
        <Popover
          trigger="hover"
          placement="bottom"
          content={
            <Editor
              style={{ width: 320, height: 180, overflow: "hidden" }}
              readonly
              initValue={content}
            />
          }
        >
          <Button type="link" style={{ padding: 0 }}>
            查看更多
          </Button>
        </Popover>
      ),
    },
    {
      key: "index_status",
      title: "索引状态",
      render: (_, record) => {
        const vecResult = vecResults.find(
          (r) => r.id === record.id && r.type === "log-entry",
        );
        if (!vecResult) return <Tag color="red">未索引</Tag>;
        return (
          <Tag
            color={
              record.update_time > vecResult.updateTime ? "orange" : "green"
            }
          >
            {record.update_time > vecResult.updateTime ? "待更新" : "已索引"}
          </Tag>
        );
      },
    },
    {
      key: "operations",
      title: "操作",
      width: 120,
      render: (_: any, record: LogRow) => {
        const isLoading = loadingIds.includes(record.id);
        const vecResult = vecResults.find(
          (r) => r.id === record.id && r.type === "log-entry",
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
        } else if (record.update_time > vecResult.updateTime) {
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
    total: logs.length,
    showSizeChanger: true,
  };

  const onChange: TableProps["onChange"] = useMemoizedFn((pagination) => {
    if (pagination.current !== current) setCurrent(pagination.current || 1);
    if (pagination.pageSize !== pageSize)
      setPageSize(pagination.pageSize || PAGE_SIZE);
  });

  const dataSource = useMemo(
    () =>
      logs.slice(
        (current - 1) * (pageSize || PAGE_SIZE),
        current * (pageSize || PAGE_SIZE),
      ),
    [logs, current, pageSize],
  );

  return {
    dataSource,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode: null,
  };
};

export default useLogConfig;
