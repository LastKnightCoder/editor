import React, { useMemo } from "react";
import { ExternalLink, PanelRight } from "lucide-react";
import { CellValue, ColumnDef } from "../../types";
import { normalizeUrl } from "./utils";
import { useMemoizedFn } from "ahooks";
import { openExternal } from "@/commands";
import { Tooltip } from "@tau/ui";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

const Renderer: React.FC<{
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: CellValue) => void;
  className?: string;
}> = ({ value }) => {
  const url = useMemo(() => normalizeUrl(String(value ?? "")), [value]);

  const openInNewTab = useTabStore(state => state.openInNewTab);

  const openInBrowser = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    openExternal(url);
  });

  const handleOpenInNewTab = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    openInNewTab(TabType.WebView, { url });
  });

  if (!value) {
    return null;
  }

  return (
    <div className="relative flex h-full w-full items-center">
      <div className="max-w-full truncate px-2">
        <span className="text-accent-text text-tau-body cursor-text select-text truncate underline decoration-1">
          {String(value)}
        </span>
      </div>

      <div
        className="bg-group text-ink-2 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 px-1.5 py-1"
        onDoubleClick={e => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <Tooltip content="在浏览器中打开" delay={1000}>
          <ExternalLink
            onClick={openInBrowser}
            className="hover:text-ink-1 h-4 w-4 cursor-pointer"
            strokeWidth={1.75}
          />
        </Tooltip>
        <Tooltip content="在新 Tab 中打开" delay={1000}>
          <PanelRight
            onClick={handleOpenInNewTab}
            className="hover:text-ink-1 h-4 w-4 cursor-pointer"
            strokeWidth={1.75}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default Renderer;
