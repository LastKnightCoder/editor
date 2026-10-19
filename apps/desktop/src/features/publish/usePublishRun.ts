/**
 * 发布页数据：发布计划预览、上次发布时间、已选内容数；执行与进度委托全局 publishRunStore。
 *
 * 后端按当前模板与部署配置计算增量及有限保留，只向页面回传上传和删除路径；发布无取消通道。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@tau/ui";
import { EPublishProvider } from "@/stores/useSettingStore";
import { selectFile } from "@/commands";
import { getPublishHistory, getPublishSelections, previewPublishPlan } from "@/commands/publish";
import type { PublishConfig } from "./usePublishConfig";
import { usePublishRunStore } from "./publishRunStore";

export type { RunState } from "./publishRunStore";

export interface PlanSummary {
  upload: string[];
  remove: string[];
  computedAt: number;
}

export function usePublishRun(config: PublishConfig) {
  const { active, providerConfig, publish, appearance } = config;

  /* ── 已选内容数 + 上次发布 ── */
  const [selectionCount, setSelectionCount] = useState<number | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<number | null>(null);

  const refreshSelections = useCallback(async () => {
    try {
      setSelectionCount((await getPublishSelections()).length);
    } catch {
      setSelectionCount(0);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const history = await getPublishHistory();
      setLastPublishedAt(
        history.length ? history.reduce((max, h) => Math.max(max, h.publishTime), 0) : null
      );
    } catch {
      setLastPublishedAt(null);
    }
  }, []);

  /* ── 计划预览：后端只回传路径 ── */
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planStale, setPlanStale] = useState(false);
  const planSeq = useRef(0);

  const refreshPlan = useCallback(async () => {
    const seq = ++planSeq.current;
    if (!publish.site.templateId) {
      setPlan(null);
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    try {
      const result = await previewPublishPlan({
        targetDir: "",
        providerType: active,
        providerConfig,
        siteConfig: publish.site,
        settings: { appearance },
      });
      if (seq !== planSeq.current) return;
      setPlan({
        upload: result.toUpload,
        remove: result.toDelete,
        computedAt: Date.now(),
      });
      setPlanStale(false);
    } catch (error) {
      if (seq !== planSeq.current) return;
      toast.error(`计算发布计划失败: ${error}`);
    } finally {
      if (seq === planSeq.current) setPlanLoading(false);
    }
  }, [active, providerConfig, publish.site, appearance]);

  useEffect(() => {
    void refreshSelections();
    void refreshHistory();
  }, [refreshSelections, refreshHistory]);
  useEffect(() => {
    planSeq.current++;
    setPlanStale(true);
    const timer = window.setTimeout(() => void refreshPlan(), 250);
    return () => {
      window.clearTimeout(timer);
      planSeq.current++;
    };
  }, [refreshPlan]);

  const onSelectionsChange = useCallback(() => {
    setPlanStale(true);
    void refreshSelections();
  }, [refreshSelections]);

  /* ── 执行：运行态在全局 store，离开页面不丢（publishRunStore） ── */
  const run = usePublishRunStore(s => s.run);
  const finishSeq = usePublishRunStore(s => s.finishSeq);
  const running = run.kind === "running";

  // 发布结束（可能发生在页面隐藏/卸载期间）后刷新历史与计划；挂载时的首次刷新已由上方 effect 负责
  const seenFinishSeq = useRef(finishSeq);
  useEffect(() => {
    if (finishSeq === seenFinishSeq.current) return;
    seenFinishSeq.current = finishSeq;
    void refreshHistory();
    void refreshPlan();
  }, [finishSeq, refreshHistory, refreshPlan]);

  const publishNow = async () => {
    if (usePublishRunStore.getState().run.kind === "running") return;
    let targetDir: string | undefined;
    if (active === EPublishProvider.Local) {
      try {
        const paths = await selectFile({ properties: ["openDirectory", "createDirectory"] });
        if (!paths || paths.length === 0) return;
        targetDir = paths[0];
      } catch (error) {
        if (error instanceof Error && error.message === "User canceled file selection") return;
        toast.error(`选择目录失败: ${error}`);
        return;
      }
    }
    await usePublishRunStore
      .getState()
      .start({ active, providerConfig, publish, appearance, targetDir });
  };

  const resetRun = usePublishRunStore.getState().reset;

  return {
    selectionCount,
    lastPublishedAt,
    onSelectionsChange,
    plan,
    planLoading,
    planStale,
    refreshPlan,
    run,
    running,
    publishNow,
    resetRun,
  };
}
