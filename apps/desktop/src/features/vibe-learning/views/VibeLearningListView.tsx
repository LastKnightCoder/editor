import { notebookTranslator, useNotebookI18n } from "@/features/vibe-learning/i18n";
/**
 * Notebook 列表视图：共享驾驶舱（features/shared/cockpit）的 Notebook 模块装配。
 * 从「项目」的 vibe-learning 类型拆出为独立顶级模块（原先借用项目列表页），
 * 对外名定为 Notebook（仿 NotebookLM），标识符沿用 vibe-learning。
 */

import { useMemo } from "react";
import { FlaskConical } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCopy, CockpitItem, CockpitVisual } from "@/features/shared/cockpit/types";
import { useVibeLearningSnapshot, useVibeLearningMutations } from "../queries";
const t = notebookTranslator.t;

/* 模块色沿用原 projectTypeMeta 的主题 accent（语义类） */
const VISUAL: CockpitVisual = {
  icon: FlaskConical,
  softClass: "bg-accent-soft",
  textClass: "text-accent-text",
  barClass: "bg-gradient-to-r from-accent to-transparent",
};

const COPY: CockpitCopy = {
  title: "Notebook",
  itemTitle: id => `Notebook #${id}`,
  entityCount: (count, amount) => t("list.count", { count, amount }),
  metricCount: (count, amount) => t("list.resources", { count, amount }),
  get metricLabel() {
    return t("list.metric");
  },
  get recentHint() {
    return t("list.recent");
  },
  get createLabel() {
    return t("list.create");
  },
  get createTitle() {
    return t("list.create");
  },
  get editTitle() {
    return t("list.edit");
  },
  get descPlaceholder() {
    return t("list.goal");
  },
  get emptyTitle() {
    return t("list.empty");
  },
  get emptyHint() {
    return t("list.emptyHint");
  },
  get deleteTitle() {
    return t("list.delete");
  },
  get deleteDescription() {
    return t("list.deleteDescription");
  },
  get deleteImpact() {
    return t("list.deleteImpact");
  },
};

export function VibeLearningListView() {
  useNotebookI18n();
  const { navigator } = usePage();
  const { items, loading } = useVibeLearningSnapshot();
  const mutations = useVibeLearningMutations();

  const cockpitItems: CockpitItem[] = useMemo(
    () => items.map(item => ({ ...item, metric: item.resourceCount })),
    [items]
  );

  // 详情页自行恢复上次打开的资料 / 笔记，列表只需打开 Notebook
  return (
    <EntityCockpit
      prefsKey="vibe-learning"
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
