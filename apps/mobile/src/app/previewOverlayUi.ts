export type PreviewPanelState = "normal" | "full";

export type PreviewOverlayUi = {
  scrollTop: number;
  panelState: PreviewPanelState;
};

export function extractPreviewOverlayUi(params: unknown): PreviewOverlayUi {
  if (!params || typeof params !== "object") {
    return { scrollTop: 0, panelState: "normal" };
  }
  const ui = (params as { ui?: unknown }).ui;
  if (!ui || typeof ui !== "object") {
    return { scrollTop: 0, panelState: "normal" };
  }
  const scrollTop = (ui as { scrollTop?: unknown }).scrollTop;
  const panelState = (ui as { panelState?: unknown }).panelState;
  const fullscreen = (ui as { fullscreen?: unknown }).fullscreen;
  return {
    scrollTop:
      typeof scrollTop === "number" && Number.isFinite(scrollTop)
        ? Math.max(0, scrollTop)
        : 0,
    panelState:
      panelState === "normal" || panelState === "full"
        ? panelState
        : fullscreen
          ? "full"
          : "normal",
  };
}
