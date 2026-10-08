/**
 * 发布页（从设置弹窗抽出的独立页面），外壳为一整张纸（同 MCP / 协作页）。
 *
 * 按使用频率分区：页头 = 站点身份（favicon / 标题 / 访问地址 / 目标徽标 / 上次发布，
 * 访问地址即站点入口，不另设按钮）；配置在右栏底部摘要卡，详情收进「站点设置」抽屉；主区 = 内容选择（PublishSelector 吃满宽度）；
 * 右栏 = 本次发布计划 + 发布动作（全页唯一主按钮在流程末端）。
 * 未配置目标或未勾选内容时右栏换成三步引导。
 */

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import PublishSelector from "@/components/PublishSelector";
import { FadeScroll } from "@tau/ui";
import LocalImage from "@/components/LocalImage";
import { openExternal } from "@/commands/extra";
import { useSettingsStore } from "@/app/settingsStore";
import { EPublishProvider } from "@/stores/useSettingStore";
import { PROVIDER_LABELS, usePublishConfig, type PublishConfig } from "../usePublishConfig";
import { usePublishRun } from "../usePublishRun";
import { ActionCard, GuideCard, PlanCard, SiteCard } from "./RailCards";
import { SiteSettingsDrawer } from "./SiteSettingsDrawer";
import { formatAgo } from "@/utils/formatAgo";

function targetChip(config: PublishConfig) {
  const { active, publish } = config;
  if (!config.targetReady) return null;
  if (active === EPublishProvider.Github) return `GitHub Pages · ${publish.github.branch}`;
  if (active === EPublishProvider.S3) return `S3 · ${publish.s3.bucket}`;
  return PROVIDER_LABELS[EPublishProvider.Local];
}

export function PublishView() {
  const config = usePublishConfig();
  const runner = usePublishRun(config);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 项目「全选」会逐个实体回调，合并成一次刷新
  const selectionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { onSelectionsChange } = runner;
  const handleSelectionsChange = () => {
    clearTimeout(selectionTimer.current);
    selectionTimer.current = setTimeout(onSelectionsChange, 250);
  };
  useEffect(() => () => clearTimeout(selectionTimer.current), []);

  const { publish, siteUrl } = config;
  const chip = targetChip(config);
  const selectionCount = runner.selectionCount ?? 0;
  const showGuide =
    runner.selectionCount !== null &&
    runner.run.kind === "idle" &&
    (!config.targetReady || selectionCount === 0);
  const canPublish = config.targetReady && selectionCount > 0 && !runner.running;
  const visit = siteUrl ? () => void openExternal(siteUrl) : undefined;
  const openIntegration = () => {
    setDrawerOpen(false);
    useSettingsStore.getState().openSettings("integration");
  };
  const isLocal = config.active === EPublishProvider.Local;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：页头固定在纸顶，内容选择与右栏在纸内（同 MCP / 协作页） */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* ── 页头：站点身份 ── */}
        <header className="border-line-1 flex flex-none items-center gap-3.5 border-b px-8 pb-4 pt-5">
          <span className="bg-hover text-ink-3 grid size-11 flex-none place-items-center overflow-hidden rounded-[12px]">
            {publish.site.favicon ? (
              <LocalImage
                url={publish.site.favicon.cachePath}
                alt={publish.site.favicon.fileName}
                className="size-6 object-contain"
              />
            ) : (
              <Globe size={22} strokeWidth={1.75} />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="text-tau-title-lg truncate font-semibold tracking-[-0.01em]">
              {publish.site.title.trim() || "未命名站点"}
            </h1>
            <div className="text-tau-sm text-ink-3 mt-0.5 flex flex-wrap items-center gap-2.5">
              {siteUrl && !isLocal && (
                <button
                  type="button"
                  className="font-tau-mono text-accent-text text-[11.5px] hover:underline"
                  onClick={visit}
                >
                  {siteUrl.replace(/^https?:\/\//, "")}
                </button>
              )}
              <span
                className={clsx(
                  "text-tau-micro inline-flex items-center gap-1.5 rounded-full px-[9px] py-px",
                  chip ? "bg-hover text-ink-2" : "bg-warn-soft text-warn"
                )}
              >
                <i className={clsx("size-1.5 rounded-full", chip ? "bg-ok" : "bg-warn")} />
                {chip ?? "尚未配置发布目标"}
              </span>
              <span>
                {runner.lastPublishedAt
                  ? `上次发布 ${formatAgo(runner.lastPublishedAt)}`
                  : "从未发布"}
              </span>
            </div>
          </div>
        </header>

        {/* ── 纸内主体：左 = 内容选择，右 = 分节右栏；竖线分隔，左右各留 32px 与页头对齐 ── */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-h-0 overflow-hidden pl-5">
            <PublishSelector onSelectionsChange={handleSelectionsChange} />
          </div>

          <aside className="border-line-1 flex min-h-0 flex-col border-l">
            <FadeScroll className="divide-line-1 flex min-h-0 flex-1 flex-col divide-y">
              {showGuide ? (
                <GuideCard
                  config={config}
                  selectionCount={selectionCount}
                  onOpenSettings={() => setDrawerOpen(true)}
                  onOpenIntegration={openIntegration}
                />
              ) : (
                <>
                  <PlanCard
                    plan={runner.plan}
                    loading={runner.planLoading}
                    stale={runner.planStale}
                    isLocal={isLocal}
                    onRefresh={() => void runner.refreshPlan()}
                  />
                  <ActionCard
                    config={config}
                    run={runner.run}
                    canPublish={canPublish}
                    onPublish={() => void runner.publishNow()}
                    onReset={runner.resetRun}
                    onOpenSettings={() => setDrawerOpen(true)}
                    onVisit={visit}
                  />
                </>
              )}
              <SiteCard config={config} onOpen={() => setDrawerOpen(true)} />
            </FadeScroll>
          </aside>
        </div>
      </div>

      <SiteSettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={config}
        onOpenIntegration={openIntegration}
      />
    </div>
  );
}
