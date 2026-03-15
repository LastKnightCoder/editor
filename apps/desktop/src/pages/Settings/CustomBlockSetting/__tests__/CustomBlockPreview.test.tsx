import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CustomBlockPreview from "../CustomBlockPreview";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { compileAndExecuteCustomBlockMock } = vi.hoisted(() => ({
  compileAndExecuteCustomBlockMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tau/editor/src", () => ({
  compileAndExecuteCustomBlock: compileAndExecuteCustomBlockMock,
}));

vi.mock("@/hooks/useTheme", () => ({
  default: () => ({
    theme: "light",
    isDark: false,
  }),
}));

describe("CustomBlockPreview", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    compileAndExecuteCustomBlockMock.mockClear();
    if (root && container) {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
  });

  it("应可在非 Slate 页面中挂载并使用桌面端预览编译逻辑", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <CustomBlockPreview
          content={"const Component = () => <div>ok</div>;"}
        />,
      );
    });

    expect(compileAndExecuteCustomBlockMock).toHaveBeenCalledTimes(1);
    expect(compileAndExecuteCustomBlockMock.mock.calls[0][4]).toMatchObject({
      tailwindRuntime: expect.any(Function),
    });
  });
});
