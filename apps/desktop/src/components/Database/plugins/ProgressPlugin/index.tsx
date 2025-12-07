import { CellPlugin } from "../../types";
import { MdAutoGraph } from "react-icons/md";
import { Renderer, Editor } from "./components";
import { ProgressValue } from "./types";

const ProgressPlugin: CellPlugin<null> = {
  type: "progress",
  name: "进度",
  editable: true,
  Renderer,
  Editor,
  Icon: ({ className }) => <MdAutoGraph className={className} />,

  beforeSave: (value: ProgressValue | string | number) => {
    // 处理不同格式的输入
    if (typeof value === "string") {
      const num = parseFloat(value);
      return isNaN(num)
        ? { current: 0, target: 100 }
        : { current: num, target: 100 };
    }
    if (typeof value === "number") {
      return { current: value, target: 100 };
    }
    if (
      value &&
      typeof value === "object" &&
      "current" in value &&
      "target" in value
    ) {
      return {
        current: Math.max(0, value.current || 0),
        target: Math.max(0.01, value.target || 100), // 目标值只需大于0，可以是任意正数
      };
    }
    return { current: 0, target: 100 };
  },

  afterLoad: (value: ProgressValue | string | number) => {
    // 处理不同格式的加载值
    if (typeof value === "string") {
      const num = parseFloat(value);
      return isNaN(num)
        ? { current: 0, target: 100 }
        : { current: num, target: 100 };
    }
    if (typeof value === "number") {
      return { current: value, target: 100 };
    }
    if (
      value &&
      typeof value === "object" &&
      "current" in value &&
      "target" in value
    ) {
      return {
        current: Math.max(0, value.current || 0),
        target: Math.max(0.01, value.target || 100), // 目标值只需大于0，可以是任意正数
      };
    }
    return { current: 0, target: 100 };
  },

  getGroupKey: (row, column) => {
    const value = row[column.id];
    if (
      !value ||
      typeof value !== "object" ||
      !("current" in value) ||
      !("target" in value)
    )
      return "";
    return `${value.current}/${value.target}`;
  },
  sort: (params) => {
    const { a, b, direction } = params;
    if (typeof a !== "object" || typeof b !== "object") return 0;
    if (a === b || a === null || b === null) return 0;

    const aCurrent = a.current;
    const bCurrent = b.current;
    const aTarget = a.target;
    const bTarget = b.target;

    const aProgress = aCurrent / aTarget;
    const bProgress = bCurrent / bTarget;
    if (aProgress === bProgress) return 0;

    return direction === "asc" ? aProgress - bProgress : bProgress - aProgress;
  },
  filters: [
    {
      operator: "进度>=",
      label: "进度>=",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const value = row[column.id] as ProgressValue | undefined;
        if (!value || typeof filterValue !== "number") return false;
        const ratio = value.target ? value.current / value.target : 0;
        return ratio >= filterValue;
      },
    },
    {
      operator: "进度>",
      label: "进度>",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const value = row[column.id] as ProgressValue | undefined;
        if (!value || typeof filterValue !== "number") return false;
        const ratio = value.target ? value.current / value.target : 0;
        return ratio > filterValue;
      },
    },
    {
      operator: "进度<=",
      label: "进度<=",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const value = row[column.id] as ProgressValue | undefined;
        if (!value || typeof filterValue !== "number") return false;
        const ratio = value.target ? value.current / value.target : 0;
        return ratio <= filterValue;
      },
    },
    {
      operator: "进度<",
      label: "进度<",
      requiresValue: true,
      filter: (filterValue, row, column) => {
        const value = row[column.id] as ProgressValue | undefined;
        if (!value || typeof filterValue !== "number") return false;
        const ratio = value.target ? value.current / value.target : 0;
        return ratio < filterValue;
      },
    },
  ],
};

export default ProgressPlugin;
