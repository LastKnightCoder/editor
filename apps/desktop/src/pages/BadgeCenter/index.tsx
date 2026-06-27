import { useMemo, useState } from "react";
import { App } from "antd";
import { Plus, RefreshCw } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import type { BadgeAward, BadgeDefinition } from "@/types";
import { archiveBadgeDefinition } from "@/commands/badge";
import { useBadgeDashboard } from "./hooks/useBadgeDashboard";
import Button from "./components/Button";
import BadgeStatBar from "./components/BadgeStatBar";
import CheckInList, { type ManualItem } from "./components/CheckInList";
import ProgressGoalCard from "./components/ProgressGoalCard";
import BadgeWall from "./components/BadgeWall";
import ConfirmDialog from "./components/ConfirmDialog";
import BadgeFormModal from "./modals/BadgeFormModal";
import CheckInModal from "./modals/CheckInModal";
import BadgeDetailModal from "./modals/BadgeDetailModal";

const BadgeCenter = () => {
  const themeColors = useThemeColors();
  const { message } = App.useApp();
  const { dashboard, loading, refreshing, refresh, reevaluate } =
    useBadgeDashboard();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] =
    useState<BadgeDefinition | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<BadgeDefinition | null>(
    null,
  );
  const [detailTarget, setDetailTarget] = useState<BadgeDefinition | null>(
    null,
  );
  const [checkInTarget, setCheckInTarget] = useState<ManualItem | null>(null);

  const stats = useMemo(() => {
    const awards = dashboard?.awards ?? [];
    const customDefinitions =
      dashboard?.definitions.filter((d) => d.source !== "system") ?? [];
    return {
      definitions: customDefinitions.length,
      active: customDefinitions.filter((d) => d.status === "active").length,
      success: awards.filter((a) => a.awardKind === "success").length,
      failure: awards.filter((a) => a.awardKind === "failure").length,
    };
  }, [dashboard]);

  const activeGoals = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.definitions
      .filter((d) => d.status === "active" && d.source !== "system")
      .map((definition) => ({
        definition,
        progress: dashboard.progress.find(
          (p) => p.definitionId === definition.id,
        ),
      }))
      .filter(
        (
          item,
        ): item is {
          definition: BadgeDefinition;
          progress: NonNullable<typeof item.progress>;
        } => !!item.progress,
      );
  }, [dashboard]);

  const handleReevaluate = async () => {
    await reevaluate();
    message.success("徽章进度已重新结算");
  };

  const handleEdit = (definition: BadgeDefinition) => {
    setEditingDefinition(definition);
  };

  const handleArchive = (definition: BadgeDefinition) => {
    setArchiveTarget(definition);
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveBadgeDefinition(archiveTarget.id);
      await refresh();
      message.success(`已归档：${archiveTarget.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "归档失败";
      message.error(msg);
    }
  };

  const handleMedalClick = (
    _award: BadgeAward,
    definition?: BadgeDefinition,
  ) => {
    if (definition) setDetailTarget(definition);
  };

  const detailProgress = detailTarget
    ? (dashboard?.progress.find((p) => p.definitionId === detailTarget.id) ??
      null)
    : null;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-8 py-8">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className={`m-0 text-2xl font-semibold ${themeColors.activeTextClass}`}
            >
              徽章中心
            </h1>
            <p className={`mt-1 text-sm ${themeColors.secondaryTextClass}`}>
              设定目标，每一次达成与错过都会被清晰记录。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleReevaluate}
              disabled={refreshing}
              variant="secondary"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              重新结算
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              新建徽章
            </Button>
          </div>
        </header>

        {/* 统计 */}
        <BadgeStatBar
          definitions={stats.definitions}
          active={stats.active}
          success={stats.success}
          failure={stats.failure}
        />

        {/* 今日打卡 */}
        {dashboard && (
          <CheckInList
            definitions={dashboard.definitions.filter(
              (d) => d.status === "active",
            )}
            todayManualEntries={dashboard.todayManualEntries}
            onCheckIn={(item) => setCheckInTarget(item)}
          />
        )}

        {/* 进行中目标 */}
        {activeGoals.length > 0 && (
          <section
            className={`rounded-3xl border p-6 backdrop-blur ${themeColors.cardBorderClass} ${themeColors.cardBgClass}`}
          >
            <div className="mb-5">
              <h2
                className={`m-0 text-lg font-semibold ${themeColors.activeTextClass}`}
              >
                进行中目标
              </h2>
              <p className={`mt-1 text-xs ${themeColors.secondaryTextClass}`}>
                实时进度 · 连胜 ·
                累计，每一份坚持都被记录。悬停卡片可编辑或归档。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeGoals.map((item, idx) => (
                <ProgressGoalCard
                  key={item.definition.id}
                  definition={item.definition}
                  progress={item.progress}
                  awards={dashboard?.awards ?? []}
                  index={idx}
                  onEdit={handleEdit}
                  onArchive={handleArchive}
                  onClick={(d) => setDetailTarget(d)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 徽章墙 */}
        <BadgeWall
          awards={dashboard?.awards ?? []}
          definitions={dashboard?.definitions ?? []}
          loading={loading}
          onEmptyCta={() => setCreateOpen(true)}
          onMedalClick={handleMedalClick}
        />
      </div>

      {/* 新建徽章 */}
      <BadgeFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      {/* 编辑徽章 */}
      <BadgeFormModal
        open={!!editingDefinition}
        editingDefinition={editingDefinition}
        onClose={() => setEditingDefinition(null)}
        onSaved={async () => {
          await refresh();
          setEditingDefinition(null);
        }}
      />
      {/* 归档确认 */}
      <ConfirmDialog
        open={!!archiveTarget}
        title="归档徽章"
        description={`确认归档「${archiveTarget?.name ?? ""}」？归档后不再进行进度结算与打卡，已有颁奖记录保留。`}
        confirmLabel="归档"
        danger
        onConfirm={handleConfirmArchive}
        onClose={() => setArchiveTarget(null)}
      />
      {/* 徽章详情 */}
      <BadgeDetailModal
        open={!!detailTarget}
        definition={detailTarget}
        progress={detailProgress}
        awards={dashboard?.awards ?? []}
        onClose={() => setDetailTarget(null)}
      />
      {/* 打卡 */}
      <CheckInModal
        open={!!checkInTarget}
        target={checkInTarget}
        onClose={() => setCheckInTarget(null)}
        onSaved={refresh}
      />
    </div>
  );
};

export default BadgeCenter;
