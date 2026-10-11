import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ColumnEditModal from "../ColumnEditModal";
import PluginManager from "../../../../PluginManager";
import { builtInPlugins } from "../../../../plugins";
import { createDatabaseStore } from "../../../../DatabaseStore";
import { DatabaseContext } from "../../../../DatabaseContext";
import type { CellPlugin, ColumnDef, RowData } from "../../../../types";

let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const buildPluginManager = () => {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins(builtInPlugins as never);
  return pluginManager;
};

/** 模拟桌面 rich-text 字段：无 ConfigPanel 的自定义类型，保存不得改动 config */
const richTextLikePlugin: CellPlugin<unknown> = {
  type: "rich-text",
  name: "富文本",
  editable: false,
  Renderer: () => null,
};

const renderModal = (options: {
  column?: ColumnDef | null;
  columns?: ColumnDef[];
  rows?: RowData[];
  pluginManager?: PluginManager;
}) => {
  const pluginManager = options.pluginManager ?? buildPluginManager();
  const columns = options.columns ?? [];
  const rows = options.rows ?? [];
  const store = createDatabaseStore(columns, rows, undefined, undefined, undefined, pluginManager);
  const onSave = vi.fn<(column: Partial<ColumnDef>) => void>();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  void act(() => {
    root!.render(
      <DatabaseContext.Provider value={store}>
        <ColumnEditModal
          open
          column={options.column ?? null}
          onCancel={() => {}}
          onSave={onSave}
          theme="light"
          pluginManager={pluginManager}
        />
      </DatabaseContext.Provider>
    );
  });
  return onSave;
};

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

/** 受控输入：React 劫持 value 描述符，需经原型 setter 赋值后再派发 input */
const typeInto = (input: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

/** 弹窗与浮层都经 Portal 挂到 body，统一查整棵文档树 */
const bodyButton = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    button => button.textContent?.trim() === text
  );

const bodyText = (text: string) =>
  Array.from(document.body.querySelectorAll("*")).find(el => el.textContent?.trim() === text);

/** 列类型选择：弹窗主体内第一个 combobox 是类型下拉 */
const pickType = async (label: string) => {
  const trigger = document.body.querySelector('button[role="combobox"]');
  expect(trigger).toBeTruthy();
  click(trigger!);
  let option: Element | undefined;
  await act(async () => {
    option = Array.from(document.body.querySelectorAll('[role="option"]')).find(el =>
      el.textContent?.includes(label)
    );
  });
  expect(option).toBeTruthy();
  click(option!);
};

const clickSave = () => {
  const save = bodyButton("保存");
  expect(save).toBeTruthy();
  click(save!);
};

describe("ColumnEditModal（字段声明配置面板）", () => {
  it("新建 select：切类型后落默认 config { options: [] }", async () => {
    const onSave = renderModal({});
    await pickType("单选");
    clickSave();
    expect(onSave).toHaveBeenCalledWith({
      title: "列名",
      type: "select",
      width: 200,
      config: { options: [] },
    });
  });

  it("新建 multiSelect：与单选共用选项面板，默认 config { options: [] }", async () => {
    const onSave = renderModal({});
    await pickType("多选");
    clickSave();
    expect(onSave).toHaveBeenCalledWith({
      title: "列名",
      type: "multiSelect",
      width: 200,
      config: { options: [] },
    });
  });

  it("新建 date：默认 config 为 showTime/isRange/sortField/groupField 四键", async () => {
    const onSave = renderModal({});
    await pickType("日期");
    clickSave();
    expect(onSave).toHaveBeenCalledWith({
      title: "列名",
      type: "date",
      width: 200,
      config: { showTime: false, isRange: false, sortField: "start", groupField: "start" },
    });
  });

  it("新建 text：payload 不含 config（原 config 保留由 store 负责）", () => {
    const onSave = renderModal({});
    clickSave();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({ title: "列名", type: "text", width: 200 });
  });

  it("编辑 select：回填已有选项，回车新增、点 × 删除后保存", () => {
    const column: ColumnDef = {
      id: "col-select",
      title: "状态",
      type: "select",
      width: 120,
      config: { options: [{ id: "opt1", name: "待处理", color: "blue" as never }] },
    };
    const onSave = renderModal({ column });
    expect(bodyText("待处理")).toBeTruthy();

    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="输入后按回车新增"]'
    );
    expect(input).toBeTruthy();
    typeInto(input!, "已完成");
    void act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(bodyText("已完成")).toBeTruthy();

    const remove = document.body.querySelector('button[aria-label="移除"]');
    expect(remove).toBeTruthy();
    click(remove!);
    clickSave();

    const payload = onSave.mock.calls[0][0];
    expect(payload.type).toBe("select");
    const options = (payload.config as { options: { id: string; name: string }[] }).options;
    expect(options.map(option => option.name)).toEqual(["已完成"]);
  });

  it("编辑 date：回填范围配置，勾选包含时间后保存进 config", () => {
    const column: ColumnDef = {
      id: "col-date",
      title: "日期",
      type: "date",
      width: 140,
      config: { showTime: false, isRange: true, sortField: "start", groupField: "end" },
    };
    const onSave = renderModal({ column });
    expect(bodyText("排序依据")).toBeTruthy();
    expect(bodyText("分组依据")).toBeTruthy();

    const checkbox = Array.from(document.body.querySelectorAll("label"))
      .find(el => el.textContent?.includes("包含时间"))
      ?.querySelector("input");
    expect(checkbox).toBeTruthy();
    click(checkbox!);
    clickSave();

    expect(onSave).toHaveBeenCalledWith({
      title: "日期",
      type: "date",
      width: 140,
      config: { showTime: true, isRange: true, sortField: "start", groupField: "end" },
    });
  });

  it("编辑无面板字段（rich-text 模拟插件）：payload 不含 config，原 config 不被改写", () => {
    const pluginManager = new PluginManager();
    pluginManager.registerPlugins([...(builtInPlugins as never[]), richTextLikePlugin] as never);
    const column: ColumnDef = {
      id: "col-rich",
      title: "正文",
      type: "rich-text",
      width: 300,
      config: { keep: true },
    };
    const onSave = renderModal({ column, pluginManager });
    clickSave();

    const payload = onSave.mock.calls[0][0];
    expect(payload).toEqual({ title: "正文", type: "rich-text", width: 300 });
    expect("config" in payload).toBe(false);
    // 原列 config 原样保留（store editColumn 不收到 config 键）
    expect(column.config).toEqual({ keep: true });
  });

  it("新建 formula：未选择内容保存中止并提示「先选择要计算的内容」", async () => {
    const onSave = renderModal({});
    await pickType("公式");
    clickSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(bodyText("先选择要计算的内容")).toBeTruthy();
  });

  it("编辑 formula：已有合法表达式保存时原样带出（unsupported 同理不丢）", () => {
    const column: ColumnDef = {
      id: "col-formula",
      title: "合计",
      type: "formula",
      width: 140,
      config: {
        expr: {
          kind: "binary",
          op: "+",
          left: { kind: "column", columnId: "a" },
          right: { kind: "literal", value: 1 },
        },
        output: "number",
      },
    };
    const columns: ColumnDef[] = [{ id: "a", title: "数字", type: "number" }, column];
    const onSave = renderModal({ column, columns });
    clickSave();

    const payload = onSave.mock.calls[0][0];
    expect(payload.type).toBe("formula");
    expect(payload.config).toEqual(column.config);
  });

  it("切换类型再切回：草稿配置回到该列原 config", async () => {
    const column: ColumnDef = {
      id: "col-select",
      title: "状态",
      type: "select",
      width: 120,
      config: { options: [{ id: "opt1", name: "待处理", color: "blue" as never }] },
    };
    const onSave = renderModal({ column });
    await pickType("日期");
    expect(bodyText("待处理")).toBeFalsy();
    await pickType("单选");
    expect(bodyText("待处理")).toBeTruthy();
    clickSave();

    const payload = onSave.mock.calls[0][0];
    expect(payload.config).toEqual(column.config);
  });
});
