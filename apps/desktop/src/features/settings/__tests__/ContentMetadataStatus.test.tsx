import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ContentAiStatus } from "@/types/content-ai";

const status = vi.hoisted(() => ({ current: null as ContentAiStatus | null }));
vi.mock("../sections/useContentAiStatus", () => ({
  useContentAiStatus: () => ({ data: status.current }),
}));

import {
  ContentMetadataDescription,
  ContentMetadataProgressRow,
  formatTokenCount,
} from "../sections/ContentMetadataStatus";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (node: React.ReactNode) => act(() => root.render(node));

it("token 估算按万取整", () => {
  expect(formatTokenCount(860)).toBe("860");
  expect(formatTokenCount(342_000)).toBe("34.2 万");
  expect(formatTokenCount(12_000_000)).toBe("1200 万");
});

it("说明写清读取全部笔记与首轮估算", () => {
  status.current = {
    configured: false,
    running: false,
    total: 674,
    processed: 0,
    estimatedTokens: 342_000,
  };
  render(<ContentMetadataDescription />);
  expect(container.textContent).toContain("读取全部笔记");
  expect(container.textContent).toContain("当前库 674 份，首轮约 34.2 万 token");
});

it("未配置且从未处理过时不显示进度行；处理中显示已处理 N / M", () => {
  status.current = {
    configured: false,
    running: false,
    total: 10,
    processed: 0,
    estimatedTokens: 0,
  };
  render(<ContentMetadataProgressRow />);
  expect(container.textContent).toBe("");

  status.current = { configured: true, running: true, total: 10, processed: 4, estimatedTokens: 0 };
  render(<ContentMetadataProgressRow />);
  expect(container.textContent).toContain("已处理 4 / 10 · 处理中");
  expect(container.textContent).toContain("6 份待处理");
  expect(container.textContent).toContain("40%");

  status.current = {
    configured: false,
    running: false,
    total: 10,
    processed: 10,
    estimatedTokens: 0,
  };
  render(<ContentMetadataProgressRow />);
  expect(container.textContent).toContain("未配置模型，已停止");
  expect(container.textContent).toContain("已是最新");
});
