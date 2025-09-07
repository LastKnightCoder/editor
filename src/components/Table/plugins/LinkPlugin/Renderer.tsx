import React, { useMemo } from "react";
import { CellValue, ColumnDef } from "../../types";
import { TbLayoutSidebarRight } from "react-icons/tb";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { normalizeUrl } from "./utils";

const Renderer: React.FC<{
  value: CellValue;
  config?: unknown;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange?: (newValue: CellValue) => void;
  className?: string;
}> = ({ value, theme }) => {
  const url = useMemo(() => normalizeUrl(String(value ?? "")), [value]);

  const isDark = theme === "dark";

  const openInRightSidebar = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!url) return;
    useRightSidebarStore.getState().addTab({
      id: url,
      type: "webview",
      title: url,
    });
  };

  if (!value) {
    return null;
  }

  return (
    <div className="relative w-full h-full flex items-center">
      <div className="px-4 truncate max-w-full">
        <span className="underline decoration-1 cursor-text select-text truncate">
          {String(value)}
        </span>
      </div>

      <div
        className={
          "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 rounded-md" +
          (isDark
            ? " bg-gray-700/80 text-gray-200"
            : " bg-gray-200/80 text-gray-700")
        }
        onClick={openInRightSidebar}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        role="button"
        aria-label="在侧边栏打开"
      >
        <TbLayoutSidebarRight className="w-4 h-4" />
      </div>
    </div>
  );
};

export default Renderer;
