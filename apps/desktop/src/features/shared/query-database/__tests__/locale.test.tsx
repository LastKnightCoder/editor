import { act } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { QueryDefinition, QueryResult } from "@tau/shared/query-database";
import { AssistRow, ParamChips } from "../QueryParts";
import { useQueryAssist } from "../useQueryAssist";
import { useQueryDatabase } from "../useQueryDatabase";
import StoredQueryDatabase from "../StoredQueryDatabase";
import { queueQueryOpenIntent } from "../headerSlot";
import { initialQueryPresentation } from "../presentation";
import { queryUiTranslator } from "../ui.i18n";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  complete: vi.fn(),
  startQuery: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/electron", async importOriginal => ({
  ...(await importOriginal<typeof import("@/electron")>()),
  invoke: mocks.invoke,
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock("../../database/useFormulaAssist", () => ({ useCodeAssist: () => mocks.complete }));
vi.mock("@tau/shared/query-database/client", () => ({
  retainQueryRuntime: () => () => undefined,
  startQuery: mocks.startQuery,
}));

let container: HTMLDivElement;
let root: Root;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => (resolve = done));
  return { promise, resolve };
};
const render = (node: React.ReactNode) =>
  act(() =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <DndProvider backend={HTML5Backend}>{node}</DndProvider>
      </I18nRuntimeProvider>
    )
  );
const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const locales = ["zh-TW", "en-US"] as const;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  desktopLocaleSource.setLocale("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.startQuery.mockReturnValue({
    result: new Promise<QueryResult>(() => undefined),
    cancel: mocks.cancel,
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});

it("参数编辑跨语言保留原草稿和焦点，仅确认后解析并提交原参数名", async () => {
  const changed = vi.fn();
  render(
    <ParamChips
      params={{ amount: 1 }}
      names={["amount"]}
      adding={false}
      onAddingChange={vi.fn()}
      onChange={changed}
    />
  );
  const trigger = container.querySelector("button");
  if (!trigger) throw new Error("parameter trigger missing");
  await act(async () => trigger.click());
  const input = container.querySelector("input");
  if (!input) throw new Error("parameter input missing");
  await type(input, "37");
  input.focus();
  input.setSelectionRange(1, 2);
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("37");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
    expect(changed).not.toHaveBeenCalled();
  }
  await act(async () => input.blur());
  expect(changed).toHaveBeenCalledExactlyOnceWith({ amount: 37 });
});

it("AI请求草稿与进行中的查询跨语言保持，提交后仅应用一次原请求生成的结果", async () => {
  const result = deferred<string>();
  mocks.complete.mockReturnValue(result.promise);
  const changed = vi.fn();
  const original: QueryDefinition = {
    version: 1,
    language: "dsl",
    code: "TABLE title FROM cards",
    params: { raw: "参数原文" },
  };
  function Harness() {
    useQueryDatabase(original);
    const assist = useQueryAssist({ definition: original, onDefinitionChange: changed });
    return (
      <AssistRow
        state={assist.state}
        hasError={false}
        onSubmit={request => void assist.generate(request)}
        onStop={assist.stop}
        onUndo={assist.undo}
        onAccept={assist.accept}
        onDismiss={assist.dismiss}
      />
    );
  }
  render(<Harness />);
  await act(async () => vi.advanceTimersByTime(250));
  const input = container.querySelector("input");
  if (!input) throw new Error("AI request input missing");
  await type(input, "按原始要求查找");
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("按原始要求查找");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.startQuery).toHaveBeenCalledOnce();
    expect(mocks.cancel).not.toHaveBeenCalled();
  }
  await act(async () =>
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );
  expect(mocks.complete).toHaveBeenCalledOnce();
  expect(JSON.stringify(mocks.complete.mock.calls[0][0])).toContain("按原始要求查找");
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.startQuery).toHaveBeenCalledOnce();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  }
  await act(async () => result.resolve("TABLE title FROM articles"));
  expect(changed).toHaveBeenCalledExactlyOnceWith({
    ...original,
    code: "TABLE title FROM articles",
  });
});

it("已有保存队列跨语言不重发，完成仍保留原定义与版本请求", async () => {
  const pending = deferred<{ definition: QueryDefinition; revision: number }>();
  mocks.invoke.mockImplementation((method: string) => {
    if (method === "data-table-query:update") return pending.promise;
    return Promise.resolve(undefined);
  });
  const initial: QueryDefinition = {
    version: 1,
    language: "dsl",
    code: "TABLE title FROM cards",
    params: { amount: 1 },
  };
  const presentation = initialQueryPresentation();
  queueQueryOpenIntent(42, {});
  render(
    <StoredQueryDatabase
      tableId={42}
      query={{ definition: initial, revision: 3 }}
      columns={[]}
      data={[]}
      views={presentation.views}
      activeViewId={1}
      viewConfig={presentation.views[0].config}
    />
  );
  const trigger = [...container.querySelectorAll("button")].find(
    button => button.textContent === "1"
  );
  if (!trigger) throw new Error("stored parameter trigger missing");
  await act(async () => trigger.click());
  const input = container.querySelector<HTMLInputElement>(
    `input[aria-label="${queryUiTranslator.t("param.value", { name: "amount" })}"]`
  );
  if (!input) throw new Error("stored parameter input missing");
  await type(input, "29");
  await act(async () => input.blur());
  const saves = () =>
    mocks.invoke.mock.calls.filter(([method]) => method === "data-table-query:update");
  expect(saves()).toHaveLength(1);
  const request = saves()[0][1];
  expect(request).toMatchObject({
    tableId: 42,
    expectedRevision: 3,
    definition: { ...initial, params: { amount: 29 } },
  });
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(saves()).toHaveLength(1);
    expect(saves()[0][1]).toBe(request);
  }
  await act(async () =>
    pending.resolve({ definition: { ...initial, params: { amount: 29 } }, revision: 4 })
  );
  expect(saves()).toHaveLength(1);
});
