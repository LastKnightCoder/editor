import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { UnknownElement, type UnknownElementReason } from "../components/UnknownElement";
import { defineWhiteboardExtension } from "../extensions/api";
import type { BoardElement } from "../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const observer = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
const roots: Root[] = [];

const element = (size: { width: number; height: number }, type = "acme.box"): BoardElement => ({
  id: "u1",
  type,
  x: 10,
  y: 20,
  ...size,
});

async function mount(node: React.ReactNode) {
  vi.stubGlobal("ResizeObserver", observer);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return container;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const LOOK_BY_REASON: Record<UnknownElementReason, { title: string; description: string }> = {
  missing: { title: "缺少扩展", description: "需要安装对应的扩展才能显示，数据已完整保留" },
  "too-new": { title: "需要更新扩展", description: "此元素由更新版本的扩展创建，数据已完整保留" },
  "migration-failed": { title: "数据升级失败", description: "扩展无法升级此元素，原始数据已保留" },
  disabled: { title: "扩展已停用", description: "所属扩展与其他扩展冲突，数据已完整保留" },
  error: { title: "无法显示", description: "此元素渲染出错，数据已完整保留" },
};

describe("扩展占位四态与 error 兜底的文案", () => {
  it.each(Object.entries(LOOK_BY_REASON))("reason=%s 渲染对应标题与说明", async (reason, look) => {
    const container = await mount(
      <svg>
        <UnknownElement
          element={element({ width: 260, height: 150 })}
          reason={reason as UnknownElementReason}
        />
      </svg>
    );
    expect(container.textContent).toContain(look.title);
    expect(container.textContent).toContain(look.description);
  });

  it("reason 缺省按缺少扩展处理", async () => {
    const container = await mount(
      <svg>
        <UnknownElement element={element({ width: 260, height: 150 })} />
      </svg>
    );
    expect(container.textContent).toContain("缺少扩展");
    expect(container.textContent).toContain(LOOK_BY_REASON.missing.description);
  });

  it("扩展 ID 不出现在占位的文本内容中", async () => {
    const container = await mount(
      <svg>
        <UnknownElement
          element={element({ width: 260, height: 150 })}
          reason="missing"
          extensionId="acme.notes"
        />
      </svg>
    );
    expect(container.textContent).not.toContain("acme");
  });
});

describe("占位尺寸分级", () => {
  it("260×150 显示标题与说明", async () => {
    const container = await mount(
      <svg>
        <UnknownElement element={element({ width: 260, height: 150 })} reason="missing" />
      </svg>
    );
    expect(container.textContent).toContain("缺少扩展");
    expect(container.textContent).toContain(LOOK_BY_REASON.missing.description);
  });

  it("130×110 只有标题无说明", async () => {
    const container = await mount(
      <svg>
        <UnknownElement element={element({ width: 130, height: 110 })} reason="missing" />
      </svg>
    );
    expect(container.textContent).toContain("缺少扩展");
    expect(container.textContent).not.toContain(LOOK_BY_REASON.missing.description);
  });

  it.each([
    [60, 60],
    [180, 40],
  ] as const)("%d×%d 只有图标，title 属性仍为标题", async (width, height) => {
    const container = await mount(
      <svg>
        <UnknownElement element={element({ width, height })} reason="missing" />
      </svg>
    );
    expect(container.textContent).not.toContain("缺少扩展");
    expect(container.querySelector("div[title]")?.getAttribute("title")).toBe("缺少扩展");
  });
});

const toolbarExtension = defineWhiteboardExtension({
  id: "acme.ui",
  create: () => ({
    commands: [{ id: "acme.ui.ping", execute: () => {} }],
    tools: [
      {
        id: "acme.ui.tool",
        command: "acme.ui.ping",
        order: 1,
        group: "acme",
        component: () => <i data-acme-tool />,
      },
    ],
  }),
});

function mountBoard(options: { version?: number; readonly?: boolean; showToolbar?: boolean }) {
  return mount(
    <WhiteBoard
      extensions={[toolbarExtension]}
      initData={[]}
      initViewPort={viewport}
      showAttributeSetter={false}
      showStatusBar={false}
      version={options.version}
      readonly={options.readonly}
      showToolbar={options.showToolbar}
    />
  );
}

describe("文档版本过高的只读提示条", () => {
  it("version=3 渲染只读提示条且不渲染工具栏", async () => {
    const container = await mountBoard({ version: 3 });
    const notice = container.querySelector('[role="status"]');
    expect(notice).toBeTruthy();
    expect(notice?.textContent).toContain("只读");
    expect(notice?.textContent).toContain("此白板由更新版本的应用保存，更新应用后即可编辑");
    expect(container.querySelector("[data-acme-tool]")).toBeNull();
  });

  it("version=3 即使显式 showToolbar 也不渲染工具栏", async () => {
    const container = await mountBoard({ version: 3, showToolbar: true });
    expect(container.querySelector("[data-acme-tool]")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it("version=2 可编辑时渲染工具栏、无提示条", async () => {
    const container = await mountBoard({ version: 2 });
    expect(container.querySelector("[data-acme-tool]")).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("version=2 + readonly 普通只读不渲染提示条", async () => {
    const container = await mountBoard({ version: 2, readonly: true });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe("作者 render 抛错的 error 占位", () => {
  it("渲染出错时以 error 原因兜底并显示无法显示", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const crashing = defineWhiteboardExtension({
      id: "acme.crash",
      create: () => ({
        elements: [
          {
            type: "acme.crashbox",
            render: () => {
              throw new Error("渲染崩溃");
            },
          },
        ],
      }),
    });
    const container = await mount(
      <WhiteBoard
        extensions={[crashing]}
        initData={[element({ width: 260, height: 150 }, "acme.crashbox")]}
        initViewPort={viewport}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
      />
    );
    const placeholder = container.querySelector("[data-unknown-element]");
    expect(placeholder?.getAttribute("data-unknown-reason")).toBe("error");
    expect(container.textContent).toContain("无法显示");
  });
});
