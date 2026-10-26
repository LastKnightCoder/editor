/**
 * 配置同步：设置 › 同步里选择「WebDAV」→ 跳到插件详情 › 设置填写账号并「保存并测试」
 * →「设为同步服务」→ 回到同步页点「同步到云端」，本地与远程版本一致。
 * 结构按 features/settings 的 SettingsScreen、SyncSection、ProviderChoiceList、SyncCard，
 * 与 features/plugins 的 PluginDetailView（设置页签）、ProviderFormView 重建；示例数据写死。
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Archive,
  ChevronRight,
  CircleCheck,
  CloudUpload,
  Database,
  ExternalLink,
  Eye,
  FolderSync,
  HardDrive,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Switch, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type Stage = "choose" | "form" | "ready" | "syncing" | "done";

const NAV = [
  { group: "通用", items: [{ label: "外观", icon: Palette }] },
  {
    group: "数据",
    items: [
      { label: "同步", icon: RefreshCw },
      { label: "资源存储", icon: HardDrive },
      { label: "剪藏与缓存", icon: Archive },
      { label: "导入与导出", icon: ArrowLeftRight },
    ],
  },
  { group: "AI 服务", items: [{ label: "大语言模型", icon: Sparkles }] },
];

interface Field {
  label: string;
  value: string;
  note?: string;
  secret?: boolean;
}

const FIELDS: { group: string; rows: Field[] }[] = [
  {
    group: "账号",
    rows: [
      { label: "服务地址", value: "https://dav.jianguoyun.com/dav" },
      { label: "用户名", value: "reader@example.com" },
      {
        label: "密码",
        value: "••••••••••••",
        note: "坚果云等服务请使用「应用密码」",
        secret: true,
      },
    ],
  },
  {
    group: "存储位置",
    rows: [{ label: "目录", value: "tau", note: "可选" }],
  },
];

const BTN_PRIMARY =
  "bg-accent text-ink-inverse hover:bg-accent-hover inline-flex h-7 items-center justify-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium disabled:opacity-50";
const BTN_SECONDARY =
  "border-line-1 bg-surface hover:bg-hover inline-flex h-7 items-center justify-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] disabled:opacity-50";

function StatusChip({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "accent" | "neutral";
  children: ReactNode;
}) {
  return (
    <span className="bg-hover text-ink-2 text-tau-micro inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-px whitespace-nowrap">
      <span
        className={cn(
          "size-1.5 rounded-full",
          {
            ok: "bg-ok",
            warn: "bg-warn",
            accent: "bg-accent",
            neutral: "bg-ink-3",
          }[tone]
        )}
      />
      {children}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-tau-sm text-ink-2">{label}</dt>
      <dd
        className={cn(
          "text-tau-title leading-tight font-semibold tabular-nums",
          accent === false && "text-ink-3"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** 设置 › 同步：概览页签 */
function SyncScreen({
  stage,
  onConfigure,
  onSync,
}: {
  stage: Stage;
  onConfigure: () => void;
  onSync: () => void;
}) {
  const configured = stage !== "choose";
  const done = stage === "done";
  return (
    <div className="bg-page font-tau text-tau-body text-ink-1 border-line-1 shadow-float grid h-[460px] grid-cols-[168px_minmax(0,1fr)] overflow-hidden rounded-[14px] border select-none max-sm:grid-cols-1">
      <nav className="flex flex-col px-2.5 pt-3 pb-3 max-sm:hidden">
        <span className="text-ink-2 text-tau-body flex h-8 items-center gap-2.5 rounded-[10px] px-2.5">
          <ArrowLeft className="size-[15px]" strokeWidth={1.75} />
          返回应用
        </span>
        {NAV.map(group => (
          <div key={group.group} className="mt-3">
            <div className="text-tau-tiny text-ink-3 px-2.5 pb-1.5">{group.group}</div>
            {group.items.map(item => (
              <span
                key={item.label}
                className={cn(
                  "text-tau-body flex h-8 items-center gap-2.5 rounded-[10px] px-2.5",
                  item.label === "同步" ? "bg-selected text-ink-1 font-medium" : "text-ink-2"
                )}
              >
                <item.icon className="size-[15px]" strokeWidth={1.75} />
                {item.label}
              </span>
            ))}
          </div>
        ))}
      </nav>

      <div className="scrollbar-hide min-w-0 overflow-y-auto px-7 pt-5 pb-6 max-sm:px-4">
        <h3 className="text-tau-title-lg font-semibold">同步</h3>
        <p className="text-tau-meta text-ink-2 mt-1">
          把数据库和本地资源文件同步到远端，全部手动触发
        </p>
        <div className="mt-4 mb-4 flex gap-[22px]">
          {["概览", "资源文件", "本地数据库"].map((label, index) => (
            <span
              key={label}
              className={cn(
                "text-tau-body after:bg-accent relative pt-1 pb-[7px] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
                index === 0
                  ? "text-ink-1 font-semibold after:opacity-100"
                  : "text-ink-2 after:opacity-0"
              )}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <div className="bg-surface shadow-card flex min-w-0 flex-col rounded-[14px] px-4 pt-4 pb-3.5">
            <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
              <Database className="text-ink-2 size-[15px]" strokeWidth={1.75} />
              数据库
              <span className="ml-auto font-normal">
                {!configured ? (
                  <StatusChip tone="warn">未配置</StatusChip>
                ) : stage === "syncing" ? (
                  <StatusChip tone="accent">同步中</StatusChip>
                ) : done ? (
                  <StatusChip tone="ok">已是最新</StatusChip>
                ) : (
                  <StatusChip tone="neutral">未检查</StatusChip>
                )}
              </span>
            </div>
            <div className="text-tau-meta text-ink-2 mt-0.5 truncate">
              data.db{configured && " · WebDAV"}
            </div>
            <dl className="mt-3.5 grid auto-cols-fr grid-flow-col gap-3">
              <Stat label="本地版本" value={done ? 1 : 0} />
              <Stat label="远程版本" value={done ? 1 : "—"} accent={done} />
            </dl>
            <div className="mt-auto flex gap-2 pt-4 *:flex-1">
              {!configured ? (
                <span className="text-tau-meta text-ink-2">在下方选择同步服务后即可同步</span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={stage === "syncing"}
                    onClick={onSync}
                    className={BTN_PRIMARY}
                  >
                    <CloudUpload className="size-3.5" strokeWidth={1.75} />
                    {stage === "syncing" ? "同步中…" : "同步到云端"}
                  </button>
                  <button type="button" disabled className={BTN_SECONDARY}>
                    <RefreshCw className="size-3.5" strokeWidth={1.75} />
                    检查
                  </button>
                </>
              )}
            </div>
          </div>
          {configured ? (
            <div className="bg-surface shadow-card flex min-w-0 flex-col rounded-[14px] px-4 pt-4 pb-3.5">
              <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
                <FolderSync className="text-ink-2 size-[15px]" strokeWidth={1.75} />
                资源文件
                <span className="ml-auto font-normal">
                  <StatusChip tone={done ? "ok" : "neutral"}>
                    {done ? "已同步" : "未同步"}
                  </StatusChip>
                </span>
              </div>
              <div className="text-tau-meta text-ink-2 mt-0.5 truncate">
                resources/ · {done ? "最近同步 10-26 21:08" : "暂无同步记录"}
              </div>
              <dl className="mt-3.5 grid auto-cols-fr grid-flow-col gap-3">
                <Stat label="文件" value={128} />
                <Stat label="待上传" value={done ? 0 : 128} />
                <Stat label="失败" value={0} />
              </dl>
            </div>
          ) : (
            <div className="bg-surface shadow-card text-tau-meta text-ink-2 grid place-items-center rounded-[14px] px-6 py-6 text-center">
              资源文件与数据库共用同一个远端，配置同步存储后即可镜像 resources 目录
            </div>
          )}
        </div>

        <div className="mt-6 px-1 pb-2">
          <h4 className="text-tau-body-lg font-semibold">同步服务</h4>
          <p className="text-tau-meta text-ink-2">同一时间只同步到一个服务，数据库与资源文件共用</p>
        </div>
        <div className="bg-surface shadow-card rounded-[14px] p-1.5">
          <div className="flex min-h-14 items-center gap-3 px-3 py-2">
            <span
              className={cn(
                "grid size-4 flex-none place-items-center rounded-full border",
                configured ? "border-accent" : "border-line-1"
              )}
            >
              {configured && <span className="bg-accent size-2 rounded-full" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-tau-body-lg inline-flex items-center gap-2 font-medium">
                WebDAV
                {configured && <StatusChip tone="accent">当前</StatusChip>}
              </span>
              <span className="text-tau-meta text-ink-2 block truncate">
                {configured ? "https://dav.jianguoyun.com/dav · tau" : "未配置"}
              </span>
            </span>
            <button
              type="button"
              onClick={onConfigure}
              className={cn(
                configured
                  ? "text-ink-2 hover:bg-hover inline-flex h-7 items-center gap-1 rounded-[8px] px-2.5 text-[12.5px]"
                  : BTN_SECONDARY,
                !configured && "ring-accent/40 animate-pulse ring-2"
              )}
            >
              {configured ? "配置" : "去配置"}
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <div className="border-line-2 hover:bg-hover mx-3 flex min-h-12 items-center gap-3 border-t text-left">
            <Plus className="text-ink-3 size-[15px]" />
            <span className="text-tau-body-lg text-ink-2 min-w-0 flex-1">添加同步服务</span>
            <ExternalLink className="text-ink-3 size-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 插件详情 › 设置：WebDAV 的同步表单 */
function PluginSettings({
  saved,
  onSave,
  onUse,
  onBack,
}: {
  saved: boolean;
  onSave: () => void;
  onUse: () => void;
  onBack: () => void;
}) {
  return (
    <AppWindow active="plugins" crumb="插件 / WebDAV 存储" height={420}>
      <div className="scrollbar-hide h-full overflow-y-auto px-7 pt-5 pb-6 max-sm:px-4">
        <div className="flex items-center gap-3.5">
          <span className="bg-tag-3-soft text-tag-3 grid size-11 flex-none place-items-center rounded-[13px] text-[18px] font-semibold">
            W
          </span>
          <div className="min-w-0 flex-1">
            <b className="text-[17px] font-semibold">WebDAV 存储</b>
            <div className="text-tau-meta text-ink-2 flex gap-2">
              <span>@tau</span>
              <span className="tabular-nums">0.3.3</span>
              <span>已启用</span>
            </div>
          </div>
          <Switch size="sm" checked aria-label="停用 WebDAV 存储" />
        </div>
        <div className="border-line-2 mt-4 flex gap-[22px] border-b px-1">
          {["介绍", "设置", "更新日志", "版本"].map(label => (
            <span
              key={label}
              className={cn(
                "text-tau-body after:bg-accent relative -mb-px pt-2 pb-[7px] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
                label === "设置"
                  ? "text-ink-1 font-semibold after:opacity-100"
                  : "text-ink-2 after:opacity-0"
              )}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="bg-accent-soft text-accent-text text-tau-meta mt-4 flex items-center gap-2 rounded-[12px] px-3 py-2">
          <ArrowLeft className="size-3.5 flex-none" />
          <span className="min-w-0 flex-1">从「设置 › 同步」进入，保存后可回去继续</span>
          <button type="button" onClick={onBack} className={BTN_SECONDARY}>
            返回同步设置
          </button>
        </div>

        <div className="mt-4 mb-1 flex gap-2">
          {["资源上传", "同步"].map(label => (
            <span
              key={label}
              className={cn(
                "rounded-[8px] px-2.5 text-[12.5px] leading-7",
                label === "同步" ? "bg-accent-soft text-accent-text" : "text-ink-2"
              )}
            >
              {label === "资源上传" ? "WebDAV · 上传" : "WebDAV · 同步"}
            </span>
          ))}
        </div>

        <div className="bg-surface shadow-card my-4 flex items-center gap-3 rounded-[14px] px-4 py-3">
          <span className="bg-tag-2-soft text-tag-2 grid size-8 flex-none place-items-center rounded-[10px]">
            <RefreshCw className="size-[15px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-tau-body-lg font-semibold">同步服务</p>
            <p className="text-tau-meta text-ink-2">
              {saved ? "配置已保存，尚未使用" : "填写下方配置并保存后可使用"}
            </p>
          </div>
          <button
            type="button"
            disabled={!saved}
            onClick={onUse}
            className={cn(BTN_SECONDARY, saved && "ring-accent/40 animate-pulse ring-2")}
          >
            设为同步服务
          </button>
        </div>

        {FIELDS.map(group => (
          <section key={group.group} className="mb-4">
            <h4 className="text-tau-body-lg px-1 pb-2 font-semibold">{group.group}</h4>
            <div className="bg-surface shadow-card rounded-[14px] p-1.5">
              {group.rows.map((row, index) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex min-h-12 items-center gap-4 px-3 py-2",
                    index > 0 && "border-line-2 border-t"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-tau-body-lg font-medium">{row.label}</div>
                    {row.note && <div className="text-tau-meta text-ink-2">{row.note}</div>}
                  </div>
                  <span className="border-line-1 bg-surface text-ink-1 flex h-[30px] w-[230px] items-center rounded-[8px] border px-2.5 text-[12.5px] max-sm:w-[150px]">
                    <span className="min-w-0 flex-1 truncate">{row.value}</span>
                    {row.secret && <Eye className="text-ink-3 size-3.5" />}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="flex items-center gap-2 px-1">
          <p className="text-tau-meta text-ink-2 flex min-w-0 flex-1 items-center gap-1.5">
            {saved ? (
              <>
                <CircleCheck className="text-ok size-3.5 flex-none" />
                连接正常 · 云端还没有这个数据库，首次同步会上传
              </>
            ) : (
              "有未保存的修改"
            )}
          </p>
          <button
            type="button"
            disabled={saved}
            onClick={onSave}
            className={cn(BTN_PRIMARY, !saved && "ring-accent/40 animate-pulse ring-2")}
          >
            保存并测试
          </button>
        </div>
      </div>
    </AppWindow>
  );
}

export default function SyncSetupDemo() {
  const [stage, setStage] = useState<Stage>("choose");
  const [page, setPage] = useState<"settings" | "plugin">("settings");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (stage !== "syncing") return;
    const timer = setTimeout(() => setStage("done"), 1500);
    return () => clearTimeout(timer);
  }, [stage]);

  if (page === "plugin")
    return (
      <PluginSettings
        saved={saved}
        onSave={() => setSaved(true)}
        onUse={() => {
          setStage("ready");
          setPage("settings");
        }}
        onBack={() => setPage("settings")}
      />
    );

  return (
    <div className="relative">
      <SyncScreen
        stage={stage}
        onConfigure={() => setPage("plugin")}
        onSync={() => setStage("syncing")}
      />
      {stage === "done" && (
        <button
          type="button"
          onClick={() => {
            setStage("choose");
            setSaved(false);
          }}
          className="text-ink-3 hover:text-ink-1 text-tau-sm absolute right-3 bottom-3"
        >
          重新开始
        </button>
      )}
    </div>
  );
}
