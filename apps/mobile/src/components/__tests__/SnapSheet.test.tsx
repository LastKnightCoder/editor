import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PanTimeline } from "../panModel";
import { SnapSheet } from "../SnapSheet";

const MOCK_TIMELINE: PanTimeline = {
  state: "normal",
  overallProgress: 0.5,
  segmentProgress: {
    miniToNormal: 1,
    normalToFull: 0.5,
  },
  isDragging: false,
};

let lastPanProps: Record<string, unknown> | null = null;

vi.mock("../PanContainer", () => {
  function MockPanContainer(props: Record<string, unknown>) {
    lastPanProps = props;

    useEffect(() => {
      const onTimelineChange = props.onTimelineChange as
        | ((timeline: PanTimeline) => void)
        | undefined;
      onTimelineChange?.(MOCK_TIMELINE);
    }, [props.onTimelineChange]);

    return (
      <section data-pan-state={String(props.initialState)}>
        {props.children as ReactNode}
      </section>
    );
  }

  return {
    PanContainer: MockPanContainer,
    default: MockPanContainer,
  };
});

type SheetController = {
  render: (element: ReactNode) => Promise<void>;
  cleanup: () => Promise<void>;
};

function createSheetController(): SheetController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  return {
    render: async (element) => {
      act(() => {
        root.render(element);
      });
      await Promise.resolve();
    },
    cleanup: async () => {
      act(() => {
        root.unmount();
      });
      host.remove();
      await Promise.resolve();
    },
  };
}

describe("SnapSheet", () => {
  beforeEach(() => {
    lastPanProps = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("非受控模式应使用 defaultState", async () => {
    const controller = createSheetController();
    await controller.render(
      <SnapSheet open defaultState="full">
        <>
          <SnapSheet.Handle />
          <SnapSheet.Scroll data-testid="sheet-scroll" />
        </>
      </SnapSheet>,
    );

    const panel = document.querySelector("section");
    expect(panel?.getAttribute("data-pan-state")).toBe("full");
    await controller.cleanup();
  });

  it("受控模式下 state 变化应传递到 PanContainer", async () => {
    const controller = createSheetController();
    await controller.render(
      <SnapSheet open state="normal">
        <>
          <SnapSheet.Handle />
          <SnapSheet.Scroll />
        </>
      </SnapSheet>,
    );
    let panel = document.querySelector("section");
    expect(panel?.getAttribute("data-pan-state")).toBe("normal");

    await controller.render(
      <SnapSheet open state="full">
        <>
          <SnapSheet.Handle />
          <SnapSheet.Scroll />
        </>
      </SnapSheet>,
    );
    panel = document.querySelector("section");
    expect(panel?.getAttribute("data-pan-state")).toBe("full");
    await controller.cleanup();
  });

  it("Scroll 与 FixedFooterScroll 应注入正确类名", async () => {
    const controller = createSheetController();
    await controller.render(
      <SnapSheet open defaultState="normal">
        <>
          <SnapSheet.Scroll data-testid="kb-scroll" />
          <SnapSheet.FixedFooterScroll data-testid="footer-scroll" />
        </>
      </SnapSheet>,
    );

    const kbScroll = document.querySelector(
      '[data-testid="kb-scroll"]',
    ) as HTMLDivElement | null;
    const footerScroll = document.querySelector(
      '[data-testid="footer-scroll"]',
    ) as HTMLDivElement | null;
    expect(kbScroll?.className).toContain("mobile-kb-scroll");
    expect(footerScroll?.className).toContain("mobile-fixed-footer-scroll");
    await controller.cleanup();
  });

  it("应透传 scrollRef、onTimelineChange、onStateChange", async () => {
    const controller = createSheetController();
    const onTimelineChange = vi.fn();
    const onStateChange = vi.fn();
    const scrollRef = { current: null as HTMLDivElement | null };

    await controller.render(
      <SnapSheet
        open
        defaultState="normal"
        onTimelineChange={onTimelineChange}
        onStateChange={onStateChange}
        scrollRef={scrollRef}
      >
        <SnapSheet.Scroll data-testid="sheet-scroll" />
      </SnapSheet>,
    );

    const scroll = document.querySelector(
      '[data-testid="sheet-scroll"]',
    ) as HTMLDivElement | null;
    expect(scrollRef.current).toBe(scroll);
    expect(onTimelineChange).toHaveBeenCalledWith(MOCK_TIMELINE);

    const panOnStateChange = lastPanProps?.onStateChange as
      | ((next: string, prev: string) => void)
      | undefined;
    expect(typeof panOnStateChange).toBe("function");
    act(() => {
      panOnStateChange?.("full", "normal");
    });
    expect(onStateChange).toHaveBeenCalledWith("full", "normal");

    await controller.cleanup();
  });
});
