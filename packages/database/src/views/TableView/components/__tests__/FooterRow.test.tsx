import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import FooterRow from "../FooterRow";
import PluginManager from "../../../../PluginManager";
import { builtInPlugins } from "../../../../plugins";
import {
  AggregateRegistry,
  type DatabaseAggregateDefinition,
} from "../../../../core/formula/aggregateRegistry";
import { builtInAggregateDefinitions } from "../../../../core/formula/aggregate";
import type {
  CellPlugin,
  ColumnDef,
  FooterSpec,
  RowData,
  TableViewConfig,
} from "../../../../types";

const extensionAggregates: DatabaseAggregateDefinition[] = [
  {
    op: "acme.range",
    label: "极差",
    valueTypes: ["number"],
    resultKind: "numeric",
    compute: values => {
      const numbers = values.filter((value): value is number => typeof value === "number");
      return numbers.length ? Math.max(...numbers) - Math.min(...numbers) : null;
    },
  },
  {
    op: "acme.textCount",
    label: "文本条数",
    resultKind: "count",
    compute: values => values.filter(value => typeof value === "string").length,
  },
];

const columns: ColumnDef[] = [
  { id: "title", title: "任务", type: "text", isPrimary: true },
  { id: "qty", title: "数量", type: "number" },
];
const rows: RowData[] = [
  { id: "row-a", title: "甲", qty: 10 },
  { id: "row-b", title: "乙", qty: 4 },
];
const viewConfig: TableViewConfig = {
  columnOrder: columns.map(column => column.id),
  rowOrder: rows.map(row => row.id),
  sorts: [],
  filters: null,
};

const buildRegistry = (withExtensions: boolean) => {
  const registry = new AggregateRegistry();
  registry.registerAll(builtInAggregateDefinitions);
  if (withExtensions) registry.registerAll(extensionAggregates);
  return registry;
};

let root: Root | undefined;
let host: HTMLDivElement;
const onChange = vi.fn();

const renderFooter = (footer: Record<string, FooterSpec> | undefined, withExtensions = true) => {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins(builtInPlugins as unknown as CellPlugin<unknown>[]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  void act(() => {
    root!.render(
      <FooterRow
        columns={columns}
        columnOrder={viewConfig.columnOrder}
        columnWidths={{ title: 200, qty: 200 }}
        rows={rows}
        footer={footer}
        pluginManager={pluginManager}
        aggregateRegistry={buildRegistry(withExtensions)}
        readonly={false}
        onChange={onChange}
      />
    );
  });
  return host;
};

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  onChange.mockClear();
});

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

const menuLabels = () =>
  Array.from(document.querySelectorAll('[role="menu"][data-open="true"] [data-menu-item]')).map(
    el => (el as HTMLElement).dataset.label ?? ""
  );

const checkedLabels = () =>
  Array.from(
    document.querySelectorAll('[role="menu"][data-open="true"] [aria-checked="true"]')
  ).map(el => (el as HTMLElement).dataset.label ?? "");

const openMenuAt = (index: number) => {
  // 表尾每列一个汇总按钮（含「汇总」占位文本），按列序取第 index 个
  const triggers = host.querySelectorAll("button");
  click(triggers[index]);
};

describe("FooterRow 扩展聚合算子", () => {
  it("数字列菜单：内置分组后追加扩展算子组（前有分隔线）", () => {
    renderFooter(undefined);
    openMenuAt(1); // qty 列
    expect(menuLabels()).toEqual([
      "无",
      "求和",
      "平均",
      "中位数",
      "最小值",
      "最大值",
      "计数",
      "非空",
      "空值",
      "去重",
      "极差",
      "文本条数",
      "公式…",
    ]);
  });

  it("文本列按 valueType 过滤：无内置数值算子，也不含限数字列的扩展算子", () => {
    renderFooter(undefined);
    openMenuAt(0); // title 列
    expect(menuLabels()).toEqual(["无", "计数", "非空", "空值", "去重", "文本条数", "公式…"]);
  });

  it("选中扩展算子后按 compute 显示结果", () => {
    renderFooter({ qty: { kind: "aggregate", op: "acme.range" } });
    const cell = host.querySelectorAll("button")[1];
    expect(cell.textContent).toContain("极差");
    expect(cell.textContent).toContain("6"); // max 10 - min 4

    openMenuAt(1);
    expect(checkedLabels()).toEqual(["极差"]);
  });

  it("未登记算子（扩展被移除）：显示为空、菜单不选中、配置原样保留", () => {
    // 配置了 acme.range 但当前实例未登记该扩展算子
    renderFooter({ qty: { kind: "aggregate", op: "acme.range" } }, false);
    const cell = host.querySelectorAll("button")[1];
    expect(cell.textContent).not.toContain("极差");
    expect(cell.textContent).not.toContain("—");
    expect(cell.textContent).toContain("汇总"); // 回到未配置的占位入口

    openMenuAt(1);
    expect(menuLabels()).not.toContain("极差");
    expect(checkedLabels()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("切换算子经 onChange 提交（op 为字符串，含扩展算子）", () => {
    renderFooter(undefined);
    openMenuAt(1);
    const items = Array.from(
      document.querySelectorAll('[role="menu"][data-open="true"] [data-menu-item]')
    );
    click(items.find(el => (el as HTMLElement).dataset.label === "极差")!);
    expect(onChange).toHaveBeenCalledWith("qty", { kind: "aggregate", op: "acme.range" });
  });
});
