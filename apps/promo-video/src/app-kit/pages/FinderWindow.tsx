/**
 * macOS 访达窗口（导出完成后 Tau 会自动在访达里显示导出的压缩包：services/markdown-export.ts 的 showInFolder）。
 * 这是系统界面，不走 Tau 主题 token，按 macOS 浅色外观画；selected 为选中那一行的高亮进度。
 */
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Clock, Download, FileArchive, FileText, Folder, HardDrive, LayoutGrid, Monitor, Search } from "lucide-react";

const SIDEBAR = [
  { icon: Clock, label: "最近使用" },
  { icon: Monitor, label: "桌面" },
  { icon: FileText, label: "文稿" },
  { icon: Download, label: "下载", active: true },
];

export type FinderRow = { name: string; date: string; size: string; kind: string; zip?: boolean };

export function FinderWindow({ rows, selected }: { rows: FinderRow[]; selected: number }) {
  return (
    <div
      className="grid overflow-hidden text-[13px] antialiased"
      style={{
        width: 980,
        height: 560,
        gridTemplateColumns: "200px minmax(0,1fr)",
        borderRadius: 12,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
        color: "#1d1d1f",
        background: "#ffffff",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08), 0 40px 100px -30px rgba(0,0,0,0.45)",
      }}
    >
      <aside className="flex flex-col gap-0.5 px-2.5 pt-3" style={{ background: "rgba(242,242,246,0.96)", borderRight: "1px solid rgba(0,0,0,0.08)" }}>
        <div className="mb-4 flex items-center gap-2 px-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="px-2 pb-1 text-[11px] font-semibold" style={{ color: "rgba(0,0,0,0.42)" }}>
          个人收藏
        </div>
        {SIDEBAR.map(item => (
          <div key={item.label} className="flex h-7 items-center gap-2 rounded-[6px] px-2" style={item.active ? { background: "rgba(0,0,0,0.08)" } : undefined}>
            <item.icon className="size-4" strokeWidth={1.75} style={{ color: "#2f7cf6" }} />
            {item.label}
          </div>
        ))}
        <div className="mt-3 px-2 pb-1 text-[11px] font-semibold" style={{ color: "rgba(0,0,0,0.42)" }}>
          位置
        </div>
        <div className="flex h-7 items-center gap-2 rounded-[6px] px-2">
          <HardDrive className="size-4" strokeWidth={1.75} style={{ color: "rgba(0,0,0,0.55)" }} />
          Macintosh HD
        </div>
      </aside>
      <div className="flex min-h-0 flex-col">
        <div className="flex h-[52px] flex-none items-center gap-3 px-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <ChevronLeft className="size-5" strokeWidth={1.75} style={{ color: "rgba(0,0,0,0.5)" }} />
          <ChevronRight className="size-5" strokeWidth={1.75} style={{ color: "rgba(0,0,0,0.25)" }} />
          <span className="text-[14px] font-semibold">下载</span>
          <span className="flex-1" />
          <LayoutGrid className="size-4" strokeWidth={1.75} style={{ color: "rgba(0,0,0,0.5)" }} />
          <Search className="size-4" strokeWidth={1.75} style={{ color: "rgba(0,0,0,0.5)" }} />
        </div>
        <div className="grid flex-none grid-cols-[minmax(0,1fr)_170px_80px_110px] px-4 py-1.5 text-[11.5px]" style={{ color: "rgba(0,0,0,0.5)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <span>名称</span>
          <span>修改日期</span>
          <span>大小</span>
          <span>种类</span>
        </div>
        <div className="px-2 pt-1">
          {rows.map((row, i) => {
            const on = i === 0 && selected > 0;
            return (
              <div
                key={row.name}
                className={clsx("grid h-[26px] grid-cols-[minmax(0,1fr)_170px_80px_110px] items-center rounded-[5px] px-2")}
                style={{
                  background: on ? `rgba(47,124,246,${selected})` : i % 2 ? "rgba(0,0,0,0.025)" : undefined,
                  color: on && selected > 0.5 ? "#fff" : undefined,
                }}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  {row.zip ? (
                    <FileArchive className="size-4 shrink-0" strokeWidth={1.75} style={{ color: on && selected > 0.5 ? "#fff" : "#8e8e93" }} />
                  ) : (
                    <Folder className="size-4 shrink-0" strokeWidth={1.75} style={{ color: on && selected > 0.5 ? "#fff" : "#5aa9f7" }} />
                  )}
                  {row.name}
                </span>
                <span style={{ opacity: on ? 0.9 : 0.55 }}>{row.date}</span>
                <span style={{ opacity: on ? 0.9 : 0.55 }}>{row.size}</span>
                <span style={{ opacity: on ? 0.9 : 0.55 }}>{row.kind}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
