import React, { useMemo } from "react";
import { ExternalLink, PanelRight } from "lucide-react";
import { CellValue, ColumnDef } from "@tau/database";
import { normalizeUrl } from "@tau/database";
import { useMemoizedFn } from "ahooks";
import { openExternal } from "@/commands";
import { Tooltip, toast } from "@tau/ui";
import { openWebInDock } from "@/features/web/openInDock";

const Renderer: React.FC<{
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: CellValue) => void;
  className?: string;
}> = ({ value }) => {
  const url = useMemo(() => normalizeUrl(String(value ?? "")), [value]);

  const openInBrowser = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    openExternal(url);
  });

  const openInApp = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    openWebInDock(url).catch(() => toast.error("打开网页失败"));
  });

  if (!value) {
    return null;
  }

  return (
    <div className="relative flex h-full w-full items-center" data-web-link={url}>
      <div className="max-w-full truncate px-2">
        <span className="text-accent-text text-tau-body cursor-text truncate underline decoration-1 select-text">
          {String(value)}
        </span>
      </div>

      <div
        className="bg-surface-hover text-ink-2 rounded-tau-sm absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-1 px-1.5 py-1"
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
        <Tooltip content="在应用内打开" delay={1000}>
          <PanelRight
            onClick={openInApp}
            className="hover:text-ink-1 h-4 w-4 cursor-pointer"
            strokeWidth={1.75}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default Renderer;
