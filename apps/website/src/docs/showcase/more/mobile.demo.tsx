/**
 * 手机端：「我的 › 同步」页。云端有其他设备上传的新版本时主按钮是「下载更新」，
 * 下载完成后变成「已是最新」；底部是四个页签与中间的新建按钮。
 * 结构按 apps/mobile 的 SyncCenterSection（状态球、同步到、内容）、syncState 与 AppDock 重建。
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarPlus,
  ChevronRight,
  CircleCheck,
  CloudDownload,
  Database,
  FileText,
  House,
  Image as ImageIcon,
  Layers,
  NotebookPen,
  Plus,
  RefreshCw,
  User,
} from "lucide-react";
import { cn } from "@tau/ui";

type State = "behind" | "syncing" | "latest";

const HERO: Record<State, { title: string; description: string; button: string; orb: string }> = {
  behind: {
    title: "云端有更新",
    description: "其他设备上传了新版本，下载后即可看到",
    button: "下载更新",
    orb: "bg-warn-soft text-warn",
  },
  syncing: {
    title: "正在同步…",
    description: "可以离开此页，完成后会提示",
    button: "同步中",
    orb: "bg-info-soft text-info",
  },
  latest: {
    title: "已是最新",
    description: "云端没有其他设备的新版本",
    button: "立即同步",
    orb: "bg-ok-soft text-ok",
  },
};

const FAB = [
  { icon: Layers, label: "新卡片", tone: "bg-tag-2-soft text-tag-2" },
  { icon: FileText, label: "新文章", tone: "bg-accent-soft text-accent-text" },
  { icon: CalendarPlus, label: "新日程", tone: "bg-tag-3-soft text-tag-3" },
  { icon: BookOpen, label: "写日记", tone: "bg-tag-1-soft text-tag-1" },
];

function Row({ tile, title, detail }: { tile: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-3.5">
      {tile}
      <span className="min-w-0 flex-1">
        <span className="text-tau-body block font-medium">{title}</span>
        <span className="text-ink-3 text-tau-sm block truncate">{detail}</span>
      </span>
      <ChevronRight className="text-ink-3 size-4" />
    </div>
  );
}

export default function MobileDemo() {
  const [state, setState] = useState<State>("behind");
  const [fab, setFab] = useState(false);
  const hero = HERO[state];

  useEffect(() => {
    if (state !== "syncing") return;
    const timer = setTimeout(() => setState("latest"), 1600);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <div className="flex justify-center">
      <div className="bg-page border-line-1 shadow-float font-tau text-ink-1 relative flex h-[560px] w-[290px] flex-col overflow-hidden rounded-[38px] border-[6px] select-none">
        <div className="flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="bg-ink-1 h-[18px] w-[72px] rounded-full" />
          <span>100%</span>
        </div>
        <div className="flex-1 overflow-hidden px-3.5 pt-2">
          <p className="text-tau-title px-1 font-semibold">同步</p>
          <div className="bg-surface shadow-card mt-3 flex flex-col items-center rounded-[20px] px-4 pt-5 pb-4 text-center">
            <span
              className={cn(
                "grid size-[64px] place-items-center rounded-full transition-colors duration-300",
                hero.orb
              )}
            >
              {state === "latest" ? (
                <CircleCheck className="animate-doc-in size-7" strokeWidth={1.9} />
              ) : state === "syncing" ? (
                <RefreshCw
                  className="size-7 animate-spin [animation-duration:1.6s]"
                  strokeWidth={1.9}
                />
              ) : (
                <CloudDownload className="size-7" strokeWidth={1.9} />
              )}
            </span>
            <b className="text-tau-title-lg mt-2.5 font-extrabold tracking-tight">{hero.title}</b>
            <span className="text-ink-2 text-tau-sm mt-0.5 leading-relaxed">
              {hero.description}
            </span>
            <span className="text-ink-3 text-tau-sm mt-2 flex gap-3 tabular-nums">
              <span>本机 v{state === "latest" ? 42 : 41}</span>
              <span>云端 v42</span>
              <span>data.db</span>
            </span>
          </div>
          <button
            type="button"
            disabled={state === "syncing"}
            onClick={() => setState(state === "latest" ? "behind" : "syncing")}
            className={cn(
              "mt-3 flex h-11 w-full items-center justify-center rounded-[14px] text-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-60",
              state === "latest"
                ? "bg-surface text-ink-1 shadow-card"
                : "bg-accent text-ink-inverse"
            )}
          >
            {hero.button}
          </button>

          <p className="text-ink-2 text-tau-sm mt-3 mb-1.5 px-1.5">同步到</p>
          <div className="bg-surface shadow-card overflow-hidden rounded-[16px]">
            <Row
              tile={
                <span className="bg-hover text-ink-2 grid size-[34px] shrink-0 place-items-center rounded-xl text-[14px] font-extrabold">
                  W
                </span>
              }
              title="WebDAV"
              detail="https://dav.jianguoyun.com/dav · tau"
            />
          </div>
          <p className="text-ink-2 text-tau-sm mt-3 mb-1.5 px-1.5">内容</p>
          <div className="bg-surface shadow-card divide-line-2 divide-y overflow-hidden rounded-[16px]">
            <Row
              tile={
                <span className="bg-tag-3-soft text-tag-3 grid size-[34px] shrink-0 place-items-center rounded-xl">
                  <Database className="size-4" strokeWidth={1.9} />
                </span>
              }
              title="数据库"
              detail="data.db"
            />
            <Row
              tile={
                <span className="bg-tag-4-soft text-tag-4 grid size-[34px] shrink-0 place-items-center rounded-xl">
                  <ImageIcon className="size-4" strokeWidth={1.9} />
                </span>
              }
              title="资源文件"
              detail="128 个"
            />
          </div>
        </div>

        {fab && (
          <div className="animate-doc-in bg-page/70 absolute inset-x-0 top-0 bottom-[78px] flex items-end justify-center gap-2.5 pb-4 backdrop-blur-[2px]">
            {FAB.map(item => (
              <span key={item.label} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "shadow-float grid size-11 place-items-center rounded-full",
                    item.tone
                  )}
                >
                  <item.icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="text-[10.5px] font-medium">{item.label}</span>
              </span>
            ))}
          </div>
        )}
        <div className="bg-surface shadow-float mx-3 mb-3 flex h-[62px] shrink-0 items-center justify-around rounded-[22px] px-2">
          {[
            { icon: House, label: "今天" },
            { icon: Layers, label: "卡片" },
          ].map(item => (
            <span
              key={item.label}
              className="text-ink-3 flex flex-col items-center gap-0.5 text-[10px]"
            >
              <item.icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </span>
          ))}
          <button
            type="button"
            aria-label="新建"
            onClick={() => setFab(open => !open)}
            className="bg-accent text-ink-inverse -mt-6 grid size-12 place-items-center rounded-full shadow-[0_6px_16px_color-mix(in_srgb,var(--tau-accent)_40%,transparent)]"
          >
            <Plus
              className={cn("size-6 transition-transform duration-200", fab && "rotate-45")}
              strokeWidth={2}
            />
          </button>
          {[
            { icon: NotebookPen, label: "日记" },
            { icon: User, label: "我的", on: true },
          ].map(item => (
            <span
              key={item.label}
              className={cn(
                "flex flex-col items-center gap-0.5 text-[10px]",
                item.on ? "text-accent-text" : "text-ink-3"
              )}
            >
              <item.icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
