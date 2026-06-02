import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

import useEditContent from "../useEditContent";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/commands", () => ({
  getContentById: vi.fn(async () => null),
  updateContent: vi.fn(),
}));

vi.mock("@/utils", () => ({
  defaultContentEventBus: {
    createEditor: () => ({
      subscribeToContentWithId: vi.fn(() => vi.fn()),
      publishContentEvent: vi.fn(),
    }),
  },
}));

const HookHarness = ({
  contentId,
  onContentChange,
}: {
  contentId?: number;
  onContentChange: (content: Descendant[]) => void;
}) => {
  useEditContent(contentId, onContentChange);
  return null;
};

describe("useEditContent", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root && container) {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
    vi.clearAllMocks();
  });

  it("无内容 ID 时每次创建独立的默认 Slate 节点", async () => {
    const onContentChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness contentId={undefined} onContentChange={onContentChange} />,
      );
    });

    await act(async () => {
      root?.render(
        <HookHarness contentId={1} onContentChange={onContentChange} />,
      );
    });

    await act(async () => {
      root?.render(
        <HookHarness contentId={undefined} onContentChange={onContentChange} />,
      );
    });

    const defaultContents = onContentChange.mock.calls
      .map(([content]) => content as Descendant[])
      .filter((content) => content[0]?.type === "paragraph");

    expect(defaultContents.length).toBeGreaterThanOrEqual(2);
    expect(defaultContents.at(0)).not.toBe(defaultContents.at(-1));
    expect(defaultContents.at(0)?.[0]).not.toBe(defaultContents.at(-1)?.[0]);
  });
});
