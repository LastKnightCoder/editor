import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeReadContent } from "../WeReadContent";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/Database", () => ({
  default: ({ data }: { data: Array<{ title?: string }> }) => (
    <div data-testid="mock-database">
      {data
        .map((row) => row.title)
        .filter(Boolean)
        .join(",")}
    </div>
  ),
}));

vi.mock("@/hooks/useTheme", () => ({
  default: () => ({
    theme: "light",
  }),
}));

const themeColors = {
  hoverClass: "hover:bg-slate-100",
  activeClass: "bg-slate-100",
  textClass: "text-slate-700",
  secondaryTextClass: "text-slate-500",
  activeTextClass: "text-slate-900",
  tagBgClass: "bg-slate-100",
  tagTextClass: "text-slate-700",
  buttonBg: "bg-blue-500",
  buttonTextClass: "text-white",
  cardBgClass: "bg-white",
  cardBorderClass: "border-slate-200",
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("WeReadContent", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("在未连接但已有本地缓存时仍应展示表格", async () => {
    const { root, container } = await mount(
      <WeReadContent
        isConnected={false}
        initializing={false}
        hasStoredSession={false}
        error={null}
        syncing={false}
        rows={[{ id: "row-1", title: "缓存书籍" }]}
        columns={[]}
        views={[]}
        activeViewId={1}
        activeViewConfig={null}
        databaseKey="test-db"
        onQuickLogin={() => {}}
        onDataChange={() => {}}
        onViewConfigChange={() => {}}
        onCreateView={async () => null}
        onDeleteView={async () => null}
        onRenameView={async () => null}
        onUpdateView={async () => null}
        onReorderViews={async () => {}}
        onActiveViewIdChange={() => {}}
        onRowDetailOpen={() => {}}
        themeColors={themeColors}
      />,
    );

    expect(container.textContent).toContain("缓存书籍");
    expect(container.textContent).not.toContain("尚未连接微信读书");

    await unmount(root, container);
  });

  it("在初始化且已有登录凭证时不应显示扫码登录提示", async () => {
    const { root, container } = await mount(
      <WeReadContent
        isConnected={false}
        initializing={true}
        hasStoredSession={true}
        error={null}
        syncing={false}
        rows={[]}
        columns={[]}
        views={[]}
        activeViewId={1}
        activeViewConfig={null}
        databaseKey="test-db"
        onQuickLogin={() => {}}
        onDataChange={() => {}}
        onViewConfigChange={() => {}}
        onCreateView={async () => null}
        onDeleteView={async () => null}
        onRenameView={async () => null}
        onUpdateView={async () => null}
        onReorderViews={async () => {}}
        onActiveViewIdChange={() => {}}
        onRowDetailOpen={() => {}}
        themeColors={themeColors}
      />,
    );

    expect(container.textContent).toContain("正在恢复微信读书状态");
    expect(container.textContent).not.toContain("扫码登录");
    expect(container.textContent).not.toContain("尚未连接微信读书");

    await unmount(root, container);
  });
});
