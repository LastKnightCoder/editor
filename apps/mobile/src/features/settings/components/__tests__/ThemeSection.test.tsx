import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { ThemeSection } from "../ThemeSection";

function Harness() {
  const [isDark, setIsDark] = useState(false);
  return <ThemeSection isDark={isDark} setIsDark={setIsDark} />;
}

describe("ThemeSection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("展示浅色/深色选项并支持切换", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<Harness />);
    });

    const buttonTexts = Array.from(document.querySelectorAll("button")).map(
      item => item.textContent
    );
    expect(buttonTexts).toContain("浅色");
    expect(buttonTexts).toContain("深色");

    const darkButton = Array.from(document.querySelectorAll("button")).find(item =>
      item.textContent?.includes("深色")
    ) as HTMLButtonElement;
    await act(async () => {
      darkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
