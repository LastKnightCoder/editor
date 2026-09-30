import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import RowCover from "../RowCover";
import { coverGradientOfKey } from "@/utils/cover";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 路径解析依赖主进程；桩里 url 含 broken 时模拟加载失败
vi.mock("@/components/LocalImage", async () => {
  const { useEffect } = await import("react");
  function LocalImageStub({ url, onLoadError }: { url: string; onLoadError?: () => void }) {
    useEffect(() => {
      if (url.includes("broken")) onLoadError?.();
    }, [url, onLoadError]);
    return <img src={url} alt="" />;
  }
  return { default: LocalImageStub };
});

let root: Root | undefined;
let host: HTMLDivElement;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
});

const render = (url: string, onPreview = vi.fn()) => {
  host ??= document.createElement("div");
  document.body.appendChild(host);
  root ??= createRoot(host);
  act(() => {
    root!.render(<RowCover rowId="r1" image={{ id: "1", url }} onPreview={onPreview} />);
  });
  return host.querySelector("button")!;
};

const derivedBackground = (rowId: string) => {
  // jsdom 会规范化渐变串，用同一套规范化结果比对
  const probe = document.createElement("div");
  probe.style.backgroundImage = coverGradientOfKey(rowId);
  return probe.style.backgroundImage;
};

describe("RowCover", () => {
  it("底色恒为按行 id 派生的渐变，加载成功时图片铺在其上、点击预览", () => {
    const onPreview = vi.fn();
    const button = render("ok.png", onPreview);
    expect(button.style.backgroundImage).toBe(derivedBackground("r1"));
    expect(button.querySelector("img")).not.toBeNull();
    act(() => button.click());
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("加载失败后只留派生渐变，不能点开预览；换图后重新尝试", () => {
    const onPreview = vi.fn();
    let button = render("broken.png", onPreview);
    expect(button.querySelector("img")).toBeNull();
    expect(button.style.backgroundImage).toBe(derivedBackground("r1"));
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(onPreview).not.toHaveBeenCalled();

    button = render("ok.png", onPreview);
    expect(button.querySelector("img")).not.toBeNull();
    expect(button.disabled).toBe(false);
  });
});
