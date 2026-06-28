import { act, type ComponentPropsWithoutRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckInModal from "../CheckInModal";
import type { BadgeDefinition } from "@/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentPropsWithoutRef<"div"> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props} />,
    button: ({
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: ComponentPropsWithoutRef<"button"> & {
      whileHover?: unknown;
      whileTap?: unknown;
    }) => <button {...props} />,
  },
}));

vi.mock("lucide-react", () => {
  const Icon = (props: ComponentPropsWithoutRef<"svg">) => <svg {...props} />;
  return { X: Icon };
});

vi.mock("antd", () => ({
  App: {
    useApp: () => ({
      message: {
        success: vi.fn(),
        error: vi.fn(),
      },
    }),
  },
}));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    activeTextClass: "text-active",
    secondaryTextClass: "text-secondary",
    borderClass: "border-normal",
    tagBgClass: "bg-tag",
    cardBgClass: "bg-card",
    hoverClass: "hover-bg",
    textClass: "text-normal",
    glassPanelBg: "bg-glass",
    cardBorderClass: "border-card",
    primaryButtonClass: "bg-primary",
  }),
}));

vi.mock("@/commands/badge", () => ({
  createBadgeManualEntry: vi.fn(),
}));

const editorRenderSpy = vi.fn();

vi.mock("@tau/editor/src", () => ({
  Editor: ({
    initValue,
    placeHolder,
  }: {
    initValue: unknown[];
    placeHolder?: string;
  }) => {
    editorRenderSpy({ initValue, placeHolder });
    return (
      <div
        contentEditable
        data-placeholder={placeHolder}
        role="textbox"
        suppressContentEditableWarning
      />
    );
  },
  normalizeEditorContent: () => [
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
  ],
}));

const definition: BadgeDefinition = {
  id: 1,
  name: "每日运动",
  source: "custom",
  status: "active",
  successDesign: {
    title: "运动",
    description: "每天运动一次。",
    icon: "🏃",
    color: "#0891b2",
  },
  failureDesign: null,
  rule: {
    type: "manual_count",
    manualKey: "exercise",
    comparator: ">=",
    target: 1,
  },
  schedule: { type: "daily" },
  awardPolicy: { type: "streak", target: 7 },
  milestones: [],
  retroactiveMode: "disabled",
  createTime: 1,
  updateTime: 1,
};

const mount = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <CheckInModal
        open
        target={{ definition, manualKey: "exercise" }}
        onClose={() => undefined}
        onSaved={async () => undefined}
      />,
    );
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("CheckInModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    editorRenderSpy.mockClear();
    vi.restoreAllMocks();
  });

  it("使用规范空段落初始化描述编辑器，并提供用途 placeholder", async () => {
    const { root, container } = await mount();

    expect(editorRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initValue: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ],
        placeHolder: "记录今天完成了什么、感受或补充说明",
      }),
    );
    expect(
      document.body
        .querySelector('[role="textbox"]')
        ?.getAttribute("data-placeholder"),
    ).toBe("记录今天完成了什么、感受或补充说明");

    await unmount(root, container);
  });
});
