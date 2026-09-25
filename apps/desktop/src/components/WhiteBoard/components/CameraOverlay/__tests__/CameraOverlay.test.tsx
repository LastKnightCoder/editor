import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import CameraOverlay from "../index";

const createStream = () =>
  ({
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  }) as unknown as MediaStream;

afterEach(() => {
  document.body.innerHTML = "";
});

const renderCameraOverlay = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<CameraOverlay camera={{ stream: createStream(), enabled: true }} />);
  });

  const overlay = container.firstElementChild as HTMLElement;
  return { container, overlay, root };
};

const createPointerLikeEvent = (type: string, options: MouseEventInit): MouseEvent => {
  return new MouseEvent(type, options);
};

const getOverlayBox = (overlay: HTMLElement) => {
  const left = Number.parseFloat(overlay.style.left);
  const top = Number.parseFloat(overlay.style.top);
  const size = Number.parseFloat(overlay.style.width);
  return {
    left,
    top,
    size,
    centerX: left + size / 2,
    centerY: top + size / 2,
    leftEdgeX: left,
    rightEdgeX: left + size,
  };
};

describe("CameraOverlay", () => {
  it("只显示摄像头画面，不在预览层叠加关闭按钮和缩放点", async () => {
    const { container, root } = await renderCameraOverlay();

    expect(container.querySelector("video")).toBeTruthy();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('[title="关闭摄像头"]')).toBeNull();
    expect(container.querySelector('[title="调整大小"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("拖动圆形边缘时缩放预览且不显示额外 handle", async () => {
    const { overlay, root } = await renderCameraOverlay();
    const box = getOverlayBox(overlay);

    await act(async () => {
      overlay.dispatchEvent(
        createPointerLikeEvent("pointerdown", {
          bubbles: true,
          clientX: box.rightEdgeX,
          clientY: box.centerY,
        })
      );
      window.dispatchEvent(
        createPointerLikeEvent("pointermove", {
          bubbles: true,
          clientX: box.rightEdgeX + 40,
          clientY: box.centerY,
        })
      );
      window.dispatchEvent(createPointerLikeEvent("pointerup", { bubbles: true }));
    });

    expect(overlay.style.width).toBe("248px");
    expect(overlay.style.height).toBe("248px");
    expect(overlay.querySelector('[title="调整大小"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("从左边缘向外拖动时应放大预览", async () => {
    const { overlay, root } = await renderCameraOverlay();
    const box = getOverlayBox(overlay);

    await act(async () => {
      overlay.dispatchEvent(
        createPointerLikeEvent("pointerdown", {
          bubbles: true,
          clientX: box.leftEdgeX,
          clientY: box.centerY,
        })
      );
      window.dispatchEvent(
        createPointerLikeEvent("pointermove", {
          bubbles: true,
          clientX: box.leftEdgeX - 40,
          clientY: box.centerY,
        })
      );
      window.dispatchEvent(createPointerLikeEvent("pointerup", { bubbles: true }));
    });

    expect(overlay.style.width).toBe("248px");
    expect(overlay.style.height).toBe("248px");

    await act(async () => {
      root.unmount();
    });
  });

  it("拖动圆形中心时移动预览但不缩放", async () => {
    const { overlay, root } = await renderCameraOverlay();
    const box = getOverlayBox(overlay);

    await act(async () => {
      overlay.dispatchEvent(
        createPointerLikeEvent("pointerdown", {
          bubbles: true,
          clientX: box.centerX,
          clientY: box.centerY,
        })
      );
      window.dispatchEvent(
        createPointerLikeEvent("pointermove", {
          bubbles: true,
          clientX: box.centerX + 30,
          clientY: box.centerY + 20,
        })
      );
      window.dispatchEvent(createPointerLikeEvent("pointerup", { bubbles: true }));
    });

    expect(overlay.style.width).toBe("168px");
    expect(overlay.style.height).toBe("168px");

    await act(async () => {
      root.unmount();
    });
  });
});
