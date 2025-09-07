import React, { useMemo } from "react";
import { CellPlugin, CellValue, ColumnDef } from "../../types";
import { MdLink } from "react-icons/md";
import { TbLayoutSidebarRight } from "react-icons/tb";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

function normalizeUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

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
    return (
      <div className="flex items-center h-full w-full px-2">
        <span className="text-gray-300 italic">-</span>
      </div>
    );
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

const LinkPlugin: CellPlugin<unknown> = {
  type: "link",
  name: "链接",
  Renderer,
  Icon: ({ className }) => <MdLink className={className} />,
  beforeSave: (value) => {
    if (value === null || value === undefined)
      return null as unknown as CellValue;
    const raw = String(value).trim();
    if (!raw) return null as unknown as CellValue;
    return normalizeUrl(raw);
  },
  afterLoad: (value) => {
    if (value === null || value === undefined)
      return null as unknown as CellValue;
    const raw = String(value).trim();
    if (!raw) return null as unknown as CellValue;
    return raw;
  },
};

export default LinkPlugin;
