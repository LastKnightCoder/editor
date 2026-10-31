/** 发布计划、执行反馈及站点摘要共用同一份提供方配置。 */

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Check, ChevronRight, ExternalLink, RotateCw, Upload } from "lucide-react";
import { Button, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import { EPublishProvider } from "@/stores/useSettingStore";
import type { IPublishProgress, PublishImageWarning } from "@/types/publish";
import { type PublishConfig } from "../usePublishConfig";
import type { PlanSummary, RunState } from "../usePublishRun";
import { formatAgo } from "@/utils/formatAgo";
import { formatDuration } from "./format";

/** 右栏一节：左右内距与纸左侧内容对称（右侧扣掉 FadeScroll 的 6px 滚动条透明边） */
function RailSection({ children }: { children: ReactNode }) {
  return <section className="py-5 pr-[26px] pl-8">{children}</section>;
}

/* ─────────────── 首次引导 ─────────────── */

export function GuideCard({
  config,
  selectionCount,
  onOpenSettings,
}: {
  config: PublishConfig;
  selectionCount: number;
  onOpenSettings: () => void;
}) {
  const isLocal = config.active === EPublishProvider.Local;
  const credentialLabel = "安装、启用并配置发布插件";
  const steps = [
    ...(isLocal
      ? []
      : [
          {
            label: credentialLabel,
            done: config.credentialReady,
            action: { text: "去配置", run: onOpenSettings },
          },
        ]),
    {
      label: "选择发布目标与模板",
      done: config.targetReady && config.templateReady,
      action: { text: "去设置", run: onOpenSettings },
    },
    { label: "在左侧勾选要公开的内容", done: selectionCount > 0 },
  ];

  return (
    <RailSection>
      <PanelTitle>开始之前</PanelTitle>
      <div className="text-tau-sm text-ink-3 mt-0.5">
        {steps.length} 步完成首次发布，之后只需勾选内容再点发布。
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className={clsx(
              "text-tau-meta flex items-center gap-2.5 rounded-[10px] px-3 py-2.5",
              step.done ? "bg-ok-soft" : "border-line-1 border"
            )}
          >
            <span
              className={clsx(
                "font-tau-mono grid size-5 flex-none place-items-center rounded-full text-[11px] font-semibold",
                step.done ? "bg-ok text-ink-inverse" : "bg-hover text-ink-2"
              )}
            >
              {step.done ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            {step.label}
            {!step.done && step.action && (
              <button
                type="button"
                className="text-tau-sm text-accent-text ml-auto font-medium hover:underline"
                onClick={step.action.run}
              >
                {step.action.text}
              </button>
            )}
          </li>
        ))}
      </ol>
    </RailSection>
  );
}

/* ─────────────── 发布计划 ─────────────── */

const FILE_PREVIEW_LIMIT = 6;

function ImageWarnings({ warnings = [] }: { warnings?: PublishImageWarning[] }) {
  if (!warnings.length) return null;
  return (
    <details className="bg-warn-soft rounded-tau-sm mt-3 p-3">
      <summary className="text-tau-sm text-warn cursor-pointer font-medium">
        {warnings.length} 处图片无法发布
      </summary>
      <p className="text-tau-sm text-ink-2 mt-2">不影响继续发布，你可以稍后修复这些图片。</p>
      <ul className="text-tau-sm mt-2 flex max-h-64 flex-col gap-3 overflow-auto">
        {warnings.map(warning => (
          <li key={JSON.stringify([warning.content.key, warning.url])} className="min-w-0">
            <div className="text-ink-1 font-medium break-words">{warning.title}</div>
            <div className="text-ink-2 font-tau-mono mt-0.5 break-all select-text">
              {warning.url}
            </div>
            <div className="text-ink-3 mt-0.5">{warning.reason}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PlanRow({
  color,
  label,
  files,
  muted,
}: {
  color: string;
  label: string;
  files: string[];
  muted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expandable = files.length > 0;
  return (
    <>
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setOpen(v => !v)}
        className={clsx(
          "text-tau-meta flex items-center gap-2.5 rounded-[7px] px-1.5 py-[5px] text-left",
          expandable ? "hover:bg-hover cursor-pointer" : "cursor-default"
        )}
      >
        <ChevronRight
          size={11}
          strokeWidth={2}
          className={clsx(
            "text-ink-3 w-2.5 flex-none transition-transform duration-150",
            open && "rotate-90",
            !expandable && "invisible"
          )}
        />
        <i className={clsx("size-2 flex-none rounded-[3px]", color)} />
        {label}
        <b
          className={clsx(
            "font-tau-mono ml-auto text-[12.5px] font-semibold",
            muted && "text-ink-3"
          )}
        >
          {files.length}
        </b>
      </button>
      {open && (
        <div className="font-tau-mono text-ink-2 mt-0.5 mb-1 ml-6 text-[11px] leading-[1.9]">
          {files.slice(0, FILE_PREVIEW_LIMIT).map(path => (
            <div key={path} className="truncate" title={path}>
              {path}
            </div>
          ))}
          {files.length > FILE_PREVIEW_LIMIT && (
            <div className="text-ink-3 font-tau">
              … 另外 {files.length - FILE_PREVIEW_LIMIT} 个文件
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function PlanCard({
  plan,
  loading,
  stale,
  isLocal,
  onRefresh,
}: {
  plan: PlanSummary | null;
  loading: boolean;
  stale: boolean;
  isLocal: boolean;
  onRefresh: () => void;
}) {
  const upload = plan?.upload.length ?? 0;
  const remove = isLocal ? 0 : (plan?.remove.length ?? 0);

  return (
    <RailSection>
      <PanelTitle>
        本次发布
        <PanelNote>{isLocal ? "全量生成静态站点" : "全量生成并推送"}</PanelNote>
        <PanelAction onClick={onRefresh} disabled={loading}>
          <RotateCw size={12} strokeWidth={2} className={clsx("mr-1", loading && "animate-spin")} />
          {loading ? "计算中" : "重新计算"}
        </PanelAction>
      </PanelTitle>

      {stale && !loading && (
        <div className="text-tau-micro text-warn mt-1.5">内容已变动，点「重新计算」刷新计划</div>
      )}

      {/* 比例条：上传 accent / 删除 danger，空计划为纯轨道 */}
      <div className="bg-track mt-3.5 mb-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {upload > 0 && <i className="bg-accent block h-full" style={{ flex: upload }} />}
        {remove > 0 && <i className="bg-danger block h-full" style={{ flex: remove }} />}
      </div>

      {plan ? (
        <div className="flex flex-col gap-0.5">
          <PlanRow
            color="bg-accent"
            label={isLocal ? "生成文件" : "上传文件"}
            files={plan.upload}
          />
          {!isLocal && (
            <PlanRow
              color="bg-danger"
              label="删除（已取消勾选）"
              files={plan.remove}
              muted={remove === 0}
            />
          )}
        </div>
      ) : (
        <div className="text-tau-sm text-ink-3 px-1.5">
          {loading ? "正在按当前勾选生成文件清单…" : "暂无计划"}
        </div>
      )}
      {plan && (
        <div className="text-tau-tiny text-ink-3 mt-2 px-1.5">{formatAgo(plan.computedAt)}计算</div>
      )}
      <ImageWarnings warnings={plan?.imageWarnings} />
    </RailSection>
  );
}

/* ─────────────── 发布动作 ─────────────── */

const PHASES: { key: IPublishProgress["phase"]; label: string }[] = [
  { key: "preparing", label: "准备" },
  { key: "uploading", label: "生成" },
  { key: "pushing", label: "推送" },
  { key: "deleting", label: "清理" },
  { key: "finishing", label: "完成" },
];

function Steps({ phase }: { phase: IPublishProgress["phase"] | null }) {
  const current = phase ? PHASES.findIndex(p => p.key === phase) : 0;
  return (
    <div className="mt-4 mb-3 flex">
      {PHASES.map((p, i) => {
        const done = i < current;
        const cur = i === current;
        return (
          <div
            key={p.key}
            className={clsx(
              "relative flex flex-1 flex-col items-center gap-1.5 text-[11px]",
              done ? "text-ink-2" : cur ? "text-accent-text font-medium" : "text-ink-3"
            )}
          >
            {i > 0 && (
              <span
                className={clsx(
                  "absolute left-[-50%] right-1/2 top-[5px] h-0.5",
                  done || cur ? "bg-accent" : "bg-track"
                )}
              />
            )}
            <span
              className={clsx(
                "relative z-[1] size-3 rounded-full",
                done && "bg-accent",
                cur && "bg-surface ring-accent animate-pulse ring-[2.5px] ring-inset",
                !done && !cur && "bg-track"
              )}
            />
            {p.label}
          </div>
        );
      })}
    </div>
  );
}

const BIG = "mt-3.5 h-10 w-full justify-center rounded-[11px] text-[14px]";

function targetHint(config: PublishConfig) {
  return config.active === EPublishProvider.Local ? "点击后选择输出文件夹" : config.providerLabel;
}

export function ActionCard({
  config,
  run,
  canPublish,
  onPublish,
  onReset,
  onOpenSettings,
  onVisit,
}: {
  config: PublishConfig;
  run: RunState;
  canPublish: boolean;
  onPublish: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
  onVisit?: () => void;
}) {
  const isLocal = config.active === EPublishProvider.Local;
  const verb = isLocal ? "导出" : "发布";
  const hint = targetHint(config);

  if (run.kind === "running") {
    const { progress } = run;
    // 快照推送是一次性的，没有中间进度，用流动条代替百分比
    const pushing = progress?.phase === "pushing";
    const percent =
      progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <RailSection>
        <PanelTitle>
          正在{verb}
          <PanelNote className="truncate">{hint}</PanelNote>
        </PanelTitle>
        <Steps phase={progress?.phase ?? null} />
        <div className="bg-track relative h-1.5 overflow-hidden rounded-full">
          {pushing ? (
            <i className="bg-accent animate-progress-flow absolute inset-y-0 block w-1/3 rounded-full" />
          ) : (
            <i
              className="bg-accent block h-full rounded-full transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
        <div className="text-tau-micro text-ink-3 mt-2 flex justify-between gap-3">
          <span className="font-tau-mono text-ink-2 truncate">
            {pushing
              ? `推送 ${progress.total} 个文件`
              : (progress?.currentFile ?? (progress ? "" : "正在准备模板…"))}
          </span>
          {!pushing && progress && progress.total > 0 && (
            <span className="font-tau-mono flex-none">
              {progress.current} / {progress.total}
            </span>
          )}
        </div>
        <div className="text-tau-tiny text-ink-3 mt-3">发布进行中，完成前请勿关闭应用</div>
      </RailSection>
    );
  }

  if (run.kind === "done" || run.kind === "exported" || run.kind === "error") {
    let tone: "ok" | "warn" | "danger" = "ok";
    let title: ReactNode;
    let desc: ReactNode = null;
    let failures: { path: string; error: string }[] = [];
    const imageWarnings =
      run.kind === "done"
        ? run.result.imageWarnings
        : run.kind === "exported"
          ? run.imageWarnings
          : [];
    if (run.kind === "done") {
      const { result } = run;
      failures = result.failed;
      tone = result.success && failures.length === 0 && !imageWarnings?.length ? "ok" : "warn";
      title =
        failures.length === 0
          ? `${result.uploaded.length} 个文件已上传`
          : `${result.uploaded.length} 个上传成功，${failures.length} 个失败`;
      desc = [
        result.deleted.length > 0 && `${result.deleted.length} 个旧文件已删除`,
        result.skipped.length > 0 && `${result.skipped.length} 个跳过`,
      ]
        .filter(Boolean)
        .join("，");
    } else if (run.kind === "exported") {
      if (imageWarnings?.length) tone = "warn";
      title = "静态站点已导出";
      desc = <span className="font-tau-mono break-all">{run.targetDir}</span>;
    } else {
      tone = "danger";
      title = `${verb}失败`;
      desc = run.message;
    }

    return (
      <RailSection>
        <PanelTitle>
          {run.kind === "error" ? `${verb}未完成` : `${verb}完成`}
          {run.kind !== "error" && (
            <PanelNote>
              {formatAgo(run.finishedAt)} · 用时 {formatDuration(run.duration)}
            </PanelNote>
          )}
          <PanelAction onClick={onReset}>收起</PanelAction>
        </PanelTitle>
        <div
          className={clsx(
            "mt-3 flex items-start gap-3 rounded-[11px] p-3",
            tone === "ok" && "bg-ok-soft",
            tone === "warn" && "bg-warn-soft",
            tone === "danger" && "bg-danger-soft"
          )}
        >
          <span
            className={clsx(
              "text-ink-inverse grid size-[26px] flex-none place-items-center rounded-full text-[13px] font-semibold",
              tone === "ok" && "bg-ok",
              tone === "warn" && "bg-warn",
              tone === "danger" && "bg-danger"
            )}
          >
            {tone === "ok" ? <Check size={14} strokeWidth={2.5} /> : "!"}
          </span>
          <div className="min-w-0">
            <b className="text-[13px] font-semibold">{title}</b>
            {desc && <p className="text-tau-sm text-ink-2 mt-0.5">{desc}</p>}
          </div>
        </div>
        {failures.length > 0 && (
          <div className="font-tau-mono mt-2.5 max-h-40 overflow-auto text-[11px] leading-[1.8]">
            {failures.map(f => (
              <div key={f.path} className="flex gap-2">
                <span className="min-w-0 truncate" title={f.path}>
                  {f.path}
                </span>
                <span className="text-danger font-tau ml-auto flex-none" title={f.error}>
                  {f.error.length > 18 ? `${f.error.slice(0, 18)}…` : f.error}
                </span>
              </div>
            ))}
          </div>
        )}
        <ImageWarnings warnings={imageWarnings} />
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={RotateCw}
            className="flex-1 justify-center"
            disabled={!canPublish}
            onClick={onPublish}
          >
            重新{verb}
          </Button>
          {onVisit && !isLocal && (
            <Button
              variant="secondary"
              size="sm"
              icon={ExternalLink}
              className="flex-1 justify-center"
              onClick={onVisit}
            >
              访问站点
            </Button>
          )}
        </div>
      </RailSection>
    );
  }

  return (
    <RailSection>
      <PanelTitle>{isLocal ? "导出到本地文件夹" : `发布到 ${config.providerLabel}`}</PanelTitle>
      <div className="text-tau-sm text-ink-3 mt-0.5 truncate">{hint}</div>
      <Button
        variant="primary"
        icon={Upload}
        className={BIG}
        disabled={!canPublish}
        onClick={onPublish}
      >
        {verb}
      </Button>
      <div className="text-tau-micro text-ink-3 mt-2.5 flex items-center justify-between">
        <span>{isLocal ? "生成完整静态站点，自行部署" : "重新生成全部页面并推送"}</span>
        {!isLocal && (
          <button
            type="button"
            className="text-ink-2 hover:text-accent-text"
            onClick={onOpenSettings}
          >
            测试连接
          </button>
        )}
      </div>
    </RailSection>
  );
}

/* ─────────────── 站点设置摘要 ─────────────── */

function SiteRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-tau-sm flex items-baseline gap-3 py-[3px]">
      <span className="text-ink-3 w-14 flex-none">{label}</span>
      <span
        className={clsx(
          "min-w-0 flex-1 truncate text-right",
          value ? "text-ink-2" : "text-ink-3",
          mono && "font-tau-mono text-[11.5px]"
        )}
        title={value || undefined}
      >
        {value || "未设置"}
      </span>
    </div>
  );
}

export function SiteCard({ config, onOpen }: { config: PublishConfig; onOpen: () => void }) {
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "发布目标", value: config.providerLabel },
    { label: "访问路径", value: config.basePath, mono: true },
    { label: "博客模板", value: config.templateName },
  ];

  return (
    <RailSection>
      <PanelTitle>
        站点设置
        <PanelNote>{config.providerLabel}</PanelNote>
        <PanelAction onClick={onOpen}>
          详情
          <ChevronRight size={12} strokeWidth={2} className="ml-0.5" />
        </PanelAction>
      </PanelTitle>
      <div className="mt-2 flex flex-col">
        {rows.map(row => (
          <SiteRow key={row.label} {...row} />
        ))}
      </div>
    </RailSection>
  );
}
