import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import useArticleDeletedCleanup from "../useArticleDeletedCleanup";
import useSettingStore from "@/stores/useSettingStore";
import { closeArticleWindow } from "@/commands/article";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import type { IArticle } from "@/types";

vi.mock("@/commands/article", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/article")>()),
  closeArticleWindow: vi.fn().mockResolvedValue(undefined),
}));

const HookHarness = () => {
  useArticleDeletedCleanup();
  return null;
};

const publishArticleDeleted = (articleId: number) => {
  defaultArticleEventBus.publish("article:deleted", {
    article: { id: articleId } as IArticle,
    sourceUuid: "test",
  });
};

describe("useArticleDeletedCleanup", () => {
  let root: Root | undefined;
  let container: HTMLDivElement;

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    container?.remove();
    vi.clearAllMocks();
  });

  it("文章删除后关闭对应库的编辑器窗口", async () => {
    container = document.createElement("div");
    root = createRoot(container);
    act(() => root!.render(<HookHarness />));

    await act(async () => {
      publishArticleDeleted(42);
    });

    const databaseName = useSettingStore.getState().setting.database.active;
    expect(closeArticleWindow).toHaveBeenCalledWith(databaseName, 42);
  });
});
