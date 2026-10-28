import { act, forwardRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { MobileEntityCandidate, MobileEntityPickRequest } from "../../app/plugins/app-types";
import { PluginEntityPicker } from "./PluginEntityPicker";
import { Z_INDEX } from "../../router/zIndex";

let back: (() => boolean) | undefined;
const navigator = {
  getTopOverlay: () => null,
  getActiveScreen: () => ({ id: "screen" }),
  registerBackHandler: vi.fn((_id, handler) => {
    back = handler;
    return () => {
      back = undefined;
    };
  }),
};
const router = {};
vi.mock("../../router", () => ({ useNavigator: () => navigator, useRouterContext: () => router }));
vi.mock("../../components/SnapSheet", () => {
  const Sheet = ({ children }: { children: ReactNode }) => <section>{children}</section>;
  Sheet.Handle = () => null;
  Sheet.Scroll = forwardRef<HTMLDivElement, { children: ReactNode }>(function Scroll(
    { children },
    ref
  ) {
    return <div ref={ref}>{children}</div>;
  });
  return { SnapSheet: Sheet };
});

const cleanups: (() => Promise<void>)[] = [];
let nextId = 0;
const candidate = (
  id: string,
  kind: MobileEntityCandidate["ref"]["kind"] = "card",
  identity = "original"
): MobileEntityCandidate => ({
  ref: { kind, id },
  title: `${kind}-${id}`,
  identity,
});
function request(overrides: Partial<MobileEntityPickRequest> = {}) {
  const controller = new AbortController();
  const value: MobileEntityPickRequest = {
    id: ++nextId,
    plugin: { id: "example", name: "测试插件" },
    options: { kinds: ["card", "article"], multiple: false, title: "选择要关联的内容" },
    signal: controller.signal,
    query: vi.fn(async () => ({ items: [candidate("1")] })),
    submit: vi.fn(async () => undefined),
    cancel: vi.fn(),
    ...overrides,
  };
  return { value, controller };
}
async function harness(value: MobileEntityPickRequest | null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const render = (next: MobileEntityPickRequest | null) =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PluginEntityPicker request={next} />
        </QueryClientProvider>
      )
    );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
  });
  await render(value);
  return { container: document.body, mount: container, client, render };
}
async function settle(predicate: () => boolean) {
  for (let i = 0; i < 60 && !predicate(); i++)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  expect(predicate()).toBe(true);
}
function button(container: HTMLElement, text: string) {
  const found = [...container.querySelectorAll("button")].find(item => item.textContent === text);
  if (!found) throw new Error(`没有按钮：${text}`);
  return found;
}
async function click(node: HTMLElement) {
  await act(async () => node.click());
}
async function search(container: HTMLElement, text: string) {
  const input = container.querySelector("input");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!input || !setValue) throw new Error("搜索框不存在");
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllMocks();
});

it("选择器挂载在 body 的确认层，不继承插件页面浮层上下文", async () => {
  const { value } = request();
  const { container, mount } = await harness(value);
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog?.parentElement).toBe(document.body);
  expect(dialog?.style.zIndex).toBe(String(Z_INDEX.CONFIRM));
  expect(mount.querySelector('[role="dialog"]')).toBeNull();
});

it("按调用方类型顺序查询，单选保留候选身份并阻止重复确认", async () => {
  let finish!: () => void;
  const item = candidate("9", "event", "created-9");
  const { value } = request({
    options: { kinds: ["event", "card"], multiple: false, title: "选择日程" },
    query: vi.fn(async () => ({ items: [item] })),
    submit: vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    ),
  });
  const { container } = await harness(value);
  await settle(() => (container.textContent ?? "").includes(item.title));
  expect(value.query).toHaveBeenCalledWith({
    kind: "event",
    keyword: "",
    cursor: undefined,
    limit: 20,
    signal: expect.any(AbortSignal),
  });
  expect(
    [...container.querySelectorAll('[aria-label="内容类型"] button')].map(node => node.textContent)
  ).toEqual(["日程", "卡片"]);
  await click(button(container, item.title));
  await click(button(container, item.title));
  expect(value.submit).toHaveBeenCalledTimes(1);
  expect(value.submit).toHaveBeenCalledWith([item]);
  await act(async () => finish());
  expect(container.textContent).toBe("");
});

it("多选跨类型和分页保留选择，确认时才提交", async () => {
  const first = candidate("1");
  const second = candidate("2");
  const article = candidate("1", "article");
  const { value } = request({
    options: { kinds: ["card", "article"], multiple: true, title: "选择内容" },
    query: vi.fn(async input =>
      input.kind === "article"
        ? { items: [article] }
        : input.cursor
          ? { items: [second] }
          : { items: [first], nextCursor: "next" }
    ),
  });
  const { container } = await harness(value);
  await settle(() => (container.textContent ?? "").includes(first.title));
  await click(button(container, first.title));
  await click(button(container, "加载更多"));
  await settle(() => (container.textContent ?? "").includes(second.title));
  expect(value.query).toHaveBeenCalledWith(expect.objectContaining({ cursor: "next" }));
  await click(button(container, second.title));
  await click(button(container, "文章"));
  await settle(() => (container.textContent ?? "").includes(article.title));
  await click(button(container, article.title));
  expect(value.submit).not.toHaveBeenCalled();
  await click(button(container, "确认选择（3）"));
  expect(value.submit).toHaveBeenCalledWith([first, second, article]);
});

it("搜索防抖期间不能选择旧结果，搜索后从新游标开始", async () => {
  const { value } = request({
    query: vi.fn(async input => ({ items: [candidate(input.keyword || "old")] })),
  });
  const { container } = await harness(value);
  await settle(() => (container.textContent ?? "").includes("card-old"));
  await search(container, "新词");
  expect(button(container, "card-old").disabled).toBe(true);
  await click(button(container, "card-old"));
  expect(value.submit).not.toHaveBeenCalled();
  await settle(() => (container.textContent ?? "").includes("card-新词"));
  expect(value.query).toHaveBeenLastCalledWith(
    expect.objectContaining({ keyword: "新词", cursor: undefined })
  );
});

it("全局选择层消费返回并取消查询，迟到结果不能再提交", async () => {
  let finish!: (value: { items: MobileEntityCandidate[] }) => void;
  let signal!: AbortSignal;
  const { value } = request({
    query: vi.fn(input => {
      signal = input.signal;
      return new Promise<{ items: MobileEntityCandidate[] }>(resolve => {
        finish = resolve;
      });
    }),
  });
  const { container, client } = await harness(value);
  expect(navigator.registerBackHandler).toHaveBeenCalledWith("screen", expect.any(Function), {
    blockEdgeBack: true,
  });
  await act(async () => expect(back?.()).toBe(true));
  expect(value.cancel).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ items: [candidate("late")] }));
  expect(container.textContent).toBe("");
  expect(value.submit).not.toHaveBeenCalled();
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: ["plugin-entity-picker", value.id] })
      .every(query => !query.state.data)
  ).toBe(true);
});

it("请求中止后关闭，下一请求不继承选择或搜索", async () => {
  const { value, controller } = request({
    options: { kinds: ["card"], multiple: true, title: "第一项" },
  });
  const { container, render } = await harness(value);
  await settle(() => (container.textContent ?? "").includes("card-1"));
  await click(button(container, "card-1"));
  await act(async () => controller.abort());
  expect(value.cancel).not.toHaveBeenCalled();
  expect(container.textContent).toBe("");
  const next = request({ options: { kinds: ["card"], multiple: true, title: "第二项" } }).value;
  await render(next);
  await settle(() => (container.textContent ?? "").includes("card-1"));
  expect(button(container, "确认选择（0）").disabled).toBe(true);
  expect(container.querySelector("input")?.value).toBe("");
  expect(value.submit).not.toHaveBeenCalled();
});

it("查询失败可重试，确认冲突保留选择并展示错误", async () => {
  const { value } = request({
    query: vi
      .fn()
      .mockRejectedValueOnce(new Error("读取失败"))
      .mockResolvedValue({ items: [candidate("1")] }),
    submit: vi.fn().mockRejectedValue(new Error("内容已变化，请重新选择")),
  });
  const { container } = await harness(value);
  await settle(() => (container.textContent ?? "").includes("读取失败"));
  await click(button(container, "重新加载"));
  await settle(() => (container.textContent ?? "").includes("card-1"));
  await click(button(container, "card-1"));
  expect(container.textContent).toContain("内容已变化，请重新选择");
  expect(button(container, "card-1").disabled).toBe(false);
  expect(value.cancel).not.toHaveBeenCalled();
});

it("相同引用的新身份不继承旧身份的选中状态", async () => {
  const old = candidate("1", "card", "old");
  const fresh = candidate("1", "card", "fresh");
  const { value } = request({
    options: { kinds: ["card"], multiple: true, title: "选择内容" },
    query: vi.fn(async input => ({ items: [input.keyword ? fresh : old] })),
  });
  const { container } = await harness(value);
  await settle(() => (container.textContent ?? "").includes(old.title));
  await click(button(container, old.title));
  await search(container, "新身份");
  await settle(
    () =>
      vi.mocked(value.query).mock.calls.length === 2 &&
      [...container.querySelectorAll("button")].some(
        node => node.textContent === fresh.title && !node.disabled
      )
  );
  expect(button(container, fresh.title).getAttribute("aria-pressed")).toBe("false");
  await click(button(container, "确认选择（1）"));
  expect(value.submit).toHaveBeenCalledWith([old]);
});

it("确认在途时取消按钮和系统返回不撤销已经确认的选择", async () => {
  let finish!: () => void;
  const { value } = request({
    submit: vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    ),
  });
  const { container } = await harness(value);
  await settle(() => (container.textContent ?? "").includes("card-1"));
  await click(button(container, "card-1"));
  expect(button(container, "取消").disabled).toBe(true);
  await click(button(container, "取消"));
  await act(async () => expect(back?.()).toBe(true));
  expect(value.cancel).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => finish());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("确认在途收到会话中止仍强制关闭，迟到确认不能恢复界面", async () => {
  let finish!: () => void;
  const { value, controller } = request({
    submit: vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    ),
  });
  const { container, client } = await harness(value);
  await settle(() => (container.textContent ?? "").includes("card-1"));
  await click(button(container, "card-1"));
  await act(async () => controller.abort());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(
    client.getQueryCache().findAll({ queryKey: ["plugin-entity-picker", value.id] })
  ).toHaveLength(0);
  await act(async () => finish());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(value.cancel).not.toHaveBeenCalled();
});
