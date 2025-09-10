import React, { useMemo } from "react";
import { CellValue, ColumnDef } from "../../types";
import { TbLayoutSidebarRight } from "react-icons/tb";
import { TbExternalLink } from "react-icons/tb";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { normalizeUrl } from "./utils";
import { useMemoizedFn } from "ahooks";
import { openExternal } from "@/commands";
import { Tooltip } from "antd";

const Renderer: React.FC<{
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange?: (newValue: CellValue) => void;
  className?: string;
}> = ({ value, theme }) => {
  const url = useMemo(() => normalizeUrl(String(value ?? "")), [value]);

  const isDark = theme === "dark";

  const openInRightSidebar = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    useRightSidebarStore.getState().addTab({
      id: url,
      type: "webview",
      title: url,
    });
  });

  const openInBrowser = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    openExternal(url);
  });

  if (!value) {
    return null;
  }

  return (
    <div className="relative w-full h-full flex items-center">
      <div className="px-2 truncate max-w-full">
        <span className="underline decoration-1 cursor-text select-text truncate">
          {String(value)}
        </span>
      </div>

      <div
        className={
          "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer" +
          (isDark
            ? " bg-gray-700/80 text-gray-200"
            : " bg-gray-200/80 text-gray-700")
        }
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <Tooltip title="在浏览器中打开" mouseEnterDelay={1}>
          <TbExternalLink onClick={openInBrowser} className="w-4 h-4" />
        </Tooltip>
        <Tooltip title="在侧边栏中打开" mouseEnterDelay={1}>
          <TbLayoutSidebarRight
            onClick={openInRightSidebar}
            className="w-4 h-4"
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default Renderer;
