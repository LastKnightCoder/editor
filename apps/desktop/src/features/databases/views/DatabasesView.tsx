/**
 * 数据库列表视图：共享驾驶舱（features/shared/cockpit）的数据库模块装配。
 * 从「项目」的 data-table 类型拆出为独立顶级模块。
 */

import { useMemo, useState } from "react";
import { Radio, Table } from "lucide-react";
import { Menu } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import { EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCopy, CockpitItem, CockpitVisual } from "@/features/shared/cockpit/types";
import { useDatabasesSnapshot, useDatabaseMutations } from "../queries";
import { useDatabasesI18n } from "../i18n";
import { CreateDatabaseDialog } from "../CreateDatabaseDialog";

/* 模块色沿用原 projectTypeMeta 的数据表格紫罗兰（数据色，不进主题词表） */
const VISUAL: CockpitVisual = {
  icon: Table,
  softClass: "bg-[rgba(111,83,150,0.13)]",
  textClass: "text-[#6f5396]",
  barClass: "bg-gradient-to-r from-[#6f5396] to-transparent",
};

export function DatabasesView() {
  const { t } = useDatabasesI18n();
  const copy: CockpitCopy = {
    title: t("view.title"),
    itemTitle: id => t("view.item.fallback", { id }),
    entityCount: (count, amount) => t("view.entity.count", { count, amount }),
    metricCount: (count, amount) => t("view.metric.count", { count, amount }),
    metricLabel: t("view.metric.label"),
    recentHint: t("view.recent.hint"),
    createLabel: t("view.create"),
    createTitle: t("view.create"),
    editTitle: t("view.edit"),
    descPlaceholder: t("view.desc.placeholder"),
    emptyTitle: t("view.empty.title"),
    emptyHint: t("view.empty.hint"),
    deleteTitle: t("view.delete.title"),
    deleteDescription: t("view.delete.description"),
    deleteImpact: t("view.delete.impact"),
  };
  const { navigator } = usePage();
  const { items, loading } = useDatabasesSnapshot();
  const mutations = useDatabaseMutations();
  const [creating, setCreating] = useState(false);

  // 数据库没有子条目，只有打开时间，卡片不出现「上次看到」
  const cockpitItems: CockpitItem[] = useMemo(
    () =>
      items.map(item => ({
        ...item,
        metric: item.rowCount,
        metricText: item.rowCount === null ? t("view.liveQuery") : undefined,
        lastItemTitle: null,
      })),
    [items, t]
  );

  return (
    <>
      <EntityCockpit
        prefsKey="databases"
        items={cockpitItems}
        loading={loading}
        visual={VISUAL}
        copy={copy}
        mutations={mutations}
        onOpen={id => navigator.push("database-detail", { id })}
        onCreated={created => navigator.push("database-detail", { id: created.id })}
        renderCreateMenu={openBlank => (
          <>
            <Menu.Item icon={<Table />} onSelect={openBlank}>
              <span className="flex flex-col">
                {t("view.menu.blank.title")}
                <span className="text-ink-3 text-[11.5px]">{t("view.menu.blank.hint")}</span>
              </span>
            </Menu.Item>
            <Menu.Item icon={<Radio />} onSelect={() => setCreating(true)}>
              <span className="flex flex-col">
                {t("view.menu.live.title")}
                <span className="text-ink-3 text-[11.5px]">{t("view.menu.live.hint")}</span>
              </span>
            </Menu.Item>
          </>
        )}
      />
      <CreateDatabaseDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={created => navigator.push("database-detail", { id: created.id })}
      />
    </>
  );
}
