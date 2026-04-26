import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HighlightSelect from "../index";

describe("HighlightSelect", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("渲染高亮颜色列表时不应触发缺失 key 告警", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await act(async () => {
      root.render(<HighlightSelect onClick={() => undefined} />);
    });

    const loggedMessages = consoleErrorSpy.mock.calls
      .flatMap((args) => args.map(String))
      .join("\n");

    expect(loggedMessages).not.toContain(
      'Each child in a list should have a unique "key" prop.',
    );
  });
});
