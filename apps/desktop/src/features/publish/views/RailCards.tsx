/**
 * 发布页右栏：首次引导 / 发布计划 / 发布动作（就绪 → 发布中 → 完成）。
 *
 * 计划卡只陈述后端真实给出的两件事：将生成（全量）与将删除（历史有、本次未生成）；
 * 不做「未变跳过 / 内容哈希比对」——后端没有增量比对（D-035）。
 * 动作卡发布中无取消按钮（无取消 IPC），完成后提供「重新发布」而非失败重试。
 * 站点卡：站点设置的只读摘要，详情与编辑收在抽屉里。
 */

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Check, ChevronRight, ExternalLink, RotateCw, Upload } from "lucide-react";
import { Button, Panel, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import { EPublishProvider } from "@/stores/useSettingStore";
import type { IPublishProgress } from "@/types/publish";
import { PROVIDER_LABELS, type PublishConfig } from "../usePublishConfig";
import type { PlanSummary, RunState } from "../usePublishRun";
import { formatAgo, formatDuration } from "./format";

/* ─────────────── 首次引导 ─────────────── */

export function GuideCard({
  config,
  selectionCount,
  onOpenSettings,
  onOpenIntegration,
}: {
  config: PublishConfig;
  selectionCount: number;
  onOpenSettings: () => void;
  onOpenIntegration: () => void;
}) {
  const isLocal = config.active === EPublishProvider.Local;
  const credentialLabel =
    config.active === EPublishProvider.S3
      ? "在「集成」中配置 S3 AccessKey"
      : "在「集成」中配置 GitHub Token";
  const steps = [
    ...(isLocal
      ? []
      : [
          {
            label: credentialLabel,
            done: config.credentialReady,
            action: { text: "去配置", run: onOpenIntegration },
          },
        ]),
    {
      label: config.active === EPublishProvider.Github ? "选择发布目标与仓库" : "选择发布目标",
      done: config.targetReady,
      action: { text: "去设置", run: onOpenSettings },
    },
    { label: "在左侧勾选要公开的内容", done: selectionCount > 0 },
  ];

  return (
    <Panel pad="none" className="px-4 pb-3.5 pt-4">
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
    </Panel>
  );
}

/* ─────────────── 发布计划 ─────────────── */

const FILE_PREVIEW_LIMIT = 6;

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
        <div className="font-tau-mono text-ink-2 mb-1 ml-6 mt-0.5 text-[11px] leading-[1.9]">
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
    <Panel pad="none" className="px-4 pb-3.5 pt-4">
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
      <div className="bg-track mb-3 mt-3.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
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
        <div className="text-tau-tiny text-ink-3 mt-2 px-1.5">
          {formatAgo(plan.computedAt)}计算 · 按访问路径 “/” 估算，不含 favicon
        </div>
      )}
    </Panel>
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
    <div className="mb-3 mt-4 flex">
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
  const { publish, active } = config;
  if (active === EPublishProvider.Github) {
    return [
      publish.github.repo || "未选仓库",
      publish.github.branch || "未选分支",
      publish.github.useGitCli ? "Git Push" : "GitHub API",
    ].join(" · ");
  }
  if (active === EPublishProvider.S3) {
    return [publish.s3.bucket || "未填 Bucket", publish.s3.region].filter(Boolean).join(" · ");
  }
  return "点击后选择输出文件夹";
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
    const percent =
      progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <Panel pad="none" className="px-4 pb-3.5 pt-4">
        <PanelTitle>
          正在{verb}
          <PanelNote className="truncate">{hint}</PanelNote>
        </PanelTitle>
        <Steps phase={progress?.phase ?? null} />
        <div className="bg-track h-1.5 overflow-hidden rounded-full">
          <i
            className="bg-accent block h-full rounded-full transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="text-tau-micro text-ink-3 mt-2 flex justify-between gap-3">
          <span className="font-tau-mono text-ink-2 truncate">
            {progress?.currentFile ?? (progress ? "" : "正在准备模板…")}
          </span>
          {progress && progress.total > 0 && (
            <span className="font-tau-mono flex-none">
              {progress.current} / {progress.total}
            </span>
          )}
        </div>
        <div className="text-tau-tiny text-ink-3 mt-3">发布进行中，完成前请勿关闭应用</div>
      </Panel>
    );
  }

  if (run.kind === "done" || run.kind === "exported" || run.kind === "error") {
    let tone: "ok" | "warn" | "danger" = "ok";
    let title: ReactNode;
    let desc: ReactNode = null;
    let failures: { path: string; error: string }[] = [];
    if (run.kind === "done") {
      const { result } = run;
      failures = result.failed;
      tone = result.success && failures.length === 0 ? "ok" : "warn";
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
      title = "静态站点已导出";
      desc = <span className="font-tau-mono break-all">{run.targetDir}</span>;
    } else {
      tone = "danger";
      title = `${verb}失败`;
      desc = run.message;
    }

    return (
      <Panel pad="none" className="px-4 pb-3.5 pt-4">
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
      </Panel>
    );
  }

  return (
    <Panel pad="none" className="px-4 pb-3.5 pt-4">
      <PanelTitle>
        {isLocal ? "导出到本地文件夹" : `发布到 ${PROVIDER_LABELS[config.active]}`}
      </PanelTitle>
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
    </Panel>
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
  const { publish, active } = config;
  const rows: { label: string; value: string; mono?: boolean }[] =
    active === EPublishProvider.Github
      ? [
          { label: "仓库", value: publish.github.repo, mono: true },
          { label: "分支", value: publish.github.branch, mono: true },
          { label: "方式", value: publish.github.useGitCli ? "Git Push" : "GitHub API" },
          { label: "访问路径", value: publish.github.basePath, mono: true },
        ]
      : active === EPublishProvider.S3
        ? [
            { label: "Bucket", value: publish.s3.bucket, mono: true },
            { label: "Region", value: publish.s3.region, mono: true },
            { label: "路径前缀", value: publish.s3.path, mono: true },
            { label: "访问路径", value: publish.s3.basePath, mono: true },
          ]
        : [{ label: "访问路径", value: publish.local.basePath, mono: true }];

  return (
    <Panel pad="none" className="px-4 pb-3 pt-4">
      <PanelTitle>
        站点设置
        <PanelNote>{PROVIDER_LABELS[active]}</PanelNote>
        <PanelAction onClick={onOpen}>
          详情
          <ChevronRight size={12} strokeWidth={2} className="ml-0.5" />
        </PanelAction>
      </PanelTitle>
      <div className="mt-2 flex flex-col">
        {rows.map(row => (
          <SiteRow key={row.label} {...row} />
        ))}
        <SiteRow label="站点描述" value={publish.site.description} />
      </div>
    </Panel>
  );
}
