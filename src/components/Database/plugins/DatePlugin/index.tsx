import { CellPlugin } from "../../types";
import Renderer from "./components/Renderer";
import Editor from "./components/Editor";
import { MdCalendarToday } from "react-icons/md";

// 日期插件配置类型
export interface DatePluginConfig {
  format?: string;
  showTime?: boolean; // 包含时间
  isRange?: boolean; // 结束日期
  sortField?: "start" | "end"; // 排序字段
  groupField?: "start" | "end"; // 分组字段
}

// 日期值类型（统一格式）
export interface DateValue {
  start: number | null;
  end: number | null;
}

const DatePlugin: CellPlugin<DatePluginConfig> = {
  type: "date",
  name: "日期",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }) => <MdCalendarToday className={className} />,

  // 保存前转换为统一格式 { start, end }
  beforeSave: (value, config) => {
    if (value === null || value === undefined) {
      return { start: null, end: null };
    }

    // 如果已经是目标格式
    if (
      typeof value === "object" &&
      value !== null &&
      "start" in value &&
      "end" in value
    ) {
      const dateValue = value as DateValue;
      const start = dateValue.start;
      const end = dateValue.end;

      // 当不是范围模式时，确保 end = start
      if (!config?.isRange && start !== null) {
        return { start, end: start };
      }

      return { start, end };
    }

    // 兼容旧数据：number → { start, end }
    if (typeof value === "number") {
      return { start: value, end: value };
    }

    if (value instanceof Date) {
      const ts = value.getTime();
      return { start: ts, end: ts };
    }

    return { start: null, end: null };
  },

  // 加载后返回统一格式，并迁移旧数据
  afterLoad: (value) => {
    if (value === null || value === undefined) {
      return { start: null, end: null };
    }

    // 如果已经是新格式
    if (
      typeof value === "object" &&
      value !== null &&
      "start" in value &&
      "end" in value
    ) {
      const dateValue = value as DateValue;
      return {
        start: typeof dateValue.start === "number" ? dateValue.start : null,
        end: typeof dateValue.end === "number" ? dateValue.end : null,
      };
    }

    // 迁移旧数据：number → { start, end }
    if (typeof value === "number") {
      return { start: value, end: value };
    }

    return { start: null, end: null };
  },

  getGroupKey: (row, column) => {
    const value = row[column.id];
    if (!value || typeof value !== "object") return "null";

    const dateValue = value as DateValue;
    const config = column.config as DatePluginConfig | undefined;
    const field = config?.groupField || "start";

    const timestamp = dateValue[field];
    return timestamp !== null ? String(timestamp) : "null";
  },

  sort: (params) => {
    const { a, b, direction, columnConfig } = params;
    const config = columnConfig as DatePluginConfig | undefined;
    const field = config?.sortField || "start";

    // 提取要比较的字段
    let aValue: number | null = null;
    let bValue: number | null = null;

    if (a && typeof a === "object" && "start" in a && "end" in a) {
      const dateA = a as DateValue;
      aValue = dateA[field];
    }

    if (b && typeof b === "object" && "start" in b && "end" in b) {
      const dateB = b as DateValue;
      bValue = dateB[field];
    }

    // 处理 null 值：null 排在最后
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    return direction === "asc" ? aValue - bValue : bValue - aValue;
  },
  filters: [
    // 单值模式筛选（对 start 字段）
    {
      operator: "是",
      label: "是",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellStart = cellValue.start;
        const filterStart = filterDate.start;

        if (typeof cellStart !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellStart === filterStart;
      },
    },
    {
      operator: "不早于",
      label: "不早于",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellStart = cellValue.start;
        const filterStart = filterDate.start;

        if (typeof cellStart !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellStart >= filterStart;
      },
    },
    {
      operator: "不晚于",
      label: "不晚于",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellStart = cellValue.start;
        const filterStart = filterDate.start;

        if (typeof cellStart !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellStart <= filterStart;
      },
    },
    // 范围模式筛选（对 start 字段）
    {
      operator: "开始日期是",
      label: "开始日期是",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellStart = cellValue.start;
        const filterStart = filterDate.start;

        if (typeof cellStart !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellStart === filterStart;
      },
    },
    {
      operator: "开始日期不早于",
      label: "开始日期不早于",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellStart = cellValue.start;
        const filterStart = filterDate.start;

        if (typeof cellStart !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellStart >= filterStart;
      },
    },
    {
      operator: "开始日期不晚于",
      label: "开始日期不晚于",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellStart = cellValue.start;
        const filterStart = filterDate.start;

        if (typeof cellStart !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellStart <= filterStart;
      },
    },
    // 范围模式筛选（对 end 字段）
    {
      operator: "结束日期是",
      label: "结束日期是",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellEnd = cellValue.end;
        const filterStart = filterDate.start;

        if (typeof cellEnd !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellEnd === filterStart;
      },
    },
    {
      operator: "结束日期不早于",
      label: "结束日期不早于",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellEnd = cellValue.end;
        const filterStart = filterDate.start;

        if (typeof cellEnd !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellEnd >= filterStart;
      },
    },
    {
      operator: "结束日期不晚于",
      label: "结束日期不晚于",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;

        const filterDate = filterValue as DateValue;
        if (!filterDate || typeof filterDate !== "object") return false;

        const cellEnd = cellValue.end;
        const filterStart = filterDate.start;

        if (typeof cellEnd !== "number" || typeof filterStart !== "number") {
          return false;
        }

        return cellEnd <= filterStart;
      },
    },
    // 空值筛选
    {
      operator: "为空",
      label: "为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return true;
        return cellValue.start === null && cellValue.end === null;
      },
    },
    {
      operator: "不为空",
      label: "不为空",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id] as DateValue;
        if (!cellValue || typeof cellValue !== "object") return false;
        return cellValue.start !== null || cellValue.end !== null;
      },
    },
  ],
};

export default DatePlugin;
