import type { ColumnDef, DatabaseView, RowData, TableViewConfig } from "@tau/database";

export const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true, width: 280 },
  {
    id: "status",
    title: "状态",
    type: "select",
    config: {
      options: [
        { id: "todo", name: "待处理", color: "gray" },
        { id: "doing", name: "进行中", color: "blue" },
        { id: "done", name: "已完成", color: "green" },
      ],
    },
  },
  { id: "date", title: "日期", type: "date", config: { isRange: false } },
  { id: "done", title: "完成", type: "checkbox" },
  { id: "link", title: "链接", type: "link" },
];

const today = new Date().setHours(0, 0, 0, 0);
export const rows: RowData[] = [
  {
    id: "r1",
    title: "验证表格编辑",
    status: "done",
    date: { start: today, end: today },
    done: true,
    link: "https://example.com",
  },
  {
    id: "r2",
    title: "切换四种视图",
    status: "doing",
    date: { start: today, end: today },
    done: false,
  },
  {
    id: "r3",
    title: "查看通用行属性",
    status: "todo",
    date: { start: today, end: today },
    done: false,
  },
];

export const config: TableViewConfig = {
  columnOrder: columns.map(column => column.id),
  rowOrder: rows.map(row => row.id),
  sorts: [],
  filters: null,
  viewOptions: {
    gallery: { coverType: "detail" },
    calendar: { dateColumnId: "date" },
    kanban: {
      groupColumnId: "status",
      cardDisplay: { template: "task", doneColumnId: "done" },
    },
  },
};

export const views: DatabaseView[] = (["table", "gallery", "calendar", "kanban"] as const).map(
  (type, index) => ({
    id: index + 1,
    name: ["表格", "画廊", "日历", "看板"][index],
    type,
    order: index,
    config: structuredClone(config),
  })
);
