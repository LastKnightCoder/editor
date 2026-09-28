/**
 * Notebook 详情视图（薄壳）：判存在 + 面包屑注入（左栏开关）后渲染 VibeLearningView。
 * 对齐 ProjectDetailView 的职责划分——壳层只管存在性与标题栏，工作台本体不动。
 */

import { useMemo } from "react";
import { ArrowLeft, PanelLeft } from "lucide-react";
import { usePage, usePageParams, usePageBreadcrumb } from "@/page/PageProvider";
import { Button, IconButton, Loading, Tooltip } from "@tau/ui";
import { useVibeLearningDetail } from "../queries";
import { useVibeLearningPanelStore } from "../panelStore";
import VibeLearningView from "./VibeLearningView";

export function VibeLearningDetailView() {
  const { id } = usePageParams<{ id: number }>();
  const { project, loading } = useVibeLearningDetail(id);
  const { navigator } = usePage();
  const collapsed = useVibeLearningPanelStore(s => s.collapsed);
  const toggle = useVibeLearningPanelStore(s => s.toggle);

  /* 标题栏面包屑（node 须 useMemo 稳定化）：目录开关 + 项目标题。
     按钮钉在标题栏固定位置，收起/展开只换图标，不随侧栏移动 */
  const breadcrumbNode = useMemo(
    () => (
      <span className="flex min-w-0 items-center gap-1">
        {!!project && (
          <Tooltip content={collapsed ? "展开目录" : "收起目录"} placement="bottom">
            <IconButton
              className="shrink-0"
              onClick={toggle}
              aria-label={collapsed ? "展开目录" : "收起目录"}
              aria-expanded={!collapsed}
            >
              <PanelLeft size={17} strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        )}
        <span className="text-tau-meta text-ink-2 min-w-0 truncate px-1.5 py-0.5">
          {project?.title || `Notebook #${id}`}
        </span>
      </span>
    ),
    [project, id, collapsed, toggle]
  );
  usePageBreadcrumb("vibe-learning-detail", breadcrumbNode);

  if (loading) return <Loading />;

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-surface shadow-card mx-auto flex w-[460px] flex-col items-center rounded-[var(--tau-radius-lg)] px-8 py-7 text-center">
          <p className="text-ink-1 text-[15px] font-medium">Notebook 不存在或已删除</p>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowLeft}
            className="mt-4"
            onClick={() => navigator.back()}
          >
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  return <VibeLearningView projectId={id} />;
}
