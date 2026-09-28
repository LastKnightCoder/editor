/**
 * Notebook 列表视图：共享驾驶舱（features/shared/cockpit）的 Notebook 模块装配。
 * 2026-09-28 从「项目」的 vibe-learning 类型拆出为独立顶级模块（原先借用项目列表页），
 * 对外名定为 Notebook（仿 NotebookLM），标识符沿用 vibe-learning。
 */

import { useMemo } from "react";
import { FlaskConical } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCopy, CockpitItem, CockpitVisual } from "@/features/shared/cockpit/types";
import { useVibeLearningSnapshot, useVibeLearningMutations } from "../queries";

/* 模块色沿用原 projectTypeMeta 的主题 accent（语义类） */
const VISUAL: CockpitVisual = {
  icon: FlaskConical,
  softClass: "bg-accent-soft",
  textClass: "text-accent-text",
  barClass: "bg-gradient-to-r from-accent to-transparent",
};

const COPY: CockpitCopy = {
  title: "Notebook",
  badgeLabel: "Notebook",
  entityUnit: "个 Notebook",
  metricUnit: "份资料",
  createLabel: "新建 Notebook",
  createTitle: "新建 Notebook",
  editTitle: "编辑 Notebook",
  descPlaceholder: "这个 Notebook 想搞懂什么",
  emptyTitle: "还没有 Notebook",
  emptyHint: "投入资料，边读边问，产出笔记、测验与播客",
  deleteTitle: "删除 Notebook",
  deleteDescription: "Notebook 将被永久删除。",
  deleteImpact: "Notebook 内的资料、笔记、测验和对话记录将一并删除，不可恢复。",
};

export function VibeLearningListView() {
  const { navigator } = usePage();
  const { items, loading } = useVibeLearningSnapshot();
  const mutations = useVibeLearningMutations();

  const cockpitItems: CockpitItem[] = useMemo(
    () => items.map(item => ({ ...item, metric: item.resourceCount })),
    [items]
  );

  return (
    <EntityCockpit
      items={cockpitItems}
      loading={loading}
      visual={VISUAL}
      copy={COPY}
      mutations={mutations}
      onOpen={id => navigator.push("vibe-learning-detail", { id })}
      onCreated={created => navigator.push("vibe-learning-detail", { id: created.id })}
    />
  );
}
