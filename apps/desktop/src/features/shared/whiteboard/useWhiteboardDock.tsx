import { isDocumentVersionSupported, type WhiteboardOutline } from "@tau/whiteboard";
import { useWhiteboardChromeI18n } from "@/features/whiteboards/i18n-chrome";
import { useWhiteboardDockStore } from "./dockStore";
import { MaterialShelf } from "./components/Document/MaterialShelf";
import { useDocumentHost } from "./components/Document/DocumentHostContext";

export function useWhiteboardDock({
  readonly,
  version,
  onDockWidthChange,
}: {
  readonly?: boolean;
  version?: number;
  onDockWidthChange?(width: number): void;
}): WhiteboardOutline {
  const { t } = useWhiteboardChromeI18n();
  const { panel, widths, setWidth } = useWhiteboardDockStore();
  const { shelf } = useDocumentHost();
  const showShelf =
    panel === "shelf" && shelf && !readonly && isDocumentVersionSupported(version ?? 1);
  const current = showShelf ? "shelf" : "outline";
  return {
    open: panel === "outline" || !!showShelf,
    width: widths[current],
    onWidthChange: width => setWidth(current, width),
    onDockWidthChange,
    panel: showShelf
      ? { id: "shelf", label: t("chrome.shelf.label"), content: <MaterialShelf /> }
      : undefined,
  };
}
