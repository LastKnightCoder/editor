/**
 * 首页「最近编辑」：卡片、文章、日记、项目文档最近改过的条目，点击直达。
 */

import clsx from "clsx";
import { usePage } from "@/page/PageProvider";
import { EmptyNote, Panel, PanelNote, PanelTitle } from "@tau/ui";
import { useHomeSnapshot } from "../../queries";
import type { RecentEdit } from "../../types";
import { HomePanelMenu } from "../HomePanels";

const KIND_LABEL = {
  card: "卡片",
  article: "文章",
  diary: "日记",
  project: "项目",
} as const;
/** 类型色与回顾段「知识构成」一一对应（卡片 accent / 文章 tag-1 / 项目 tag-2 / 日记 tag-4） */
const KIND_TONE = {
  card: "bg-accent-soft text-accent-text",
  article: "bg-tag-1-soft text-tag-1",
  diary: "bg-tag-4-soft text-tag-4",
  project: "bg-tag-2-soft text-tag-2",
} as const;

export function RecentEditsPanel() {
  const { data } = useHomeSnapshot();
  const { navigator } = usePage();
  // 最近编辑直达具体条目：卡片 / 文章进详情，日记定位到当天，项目进详情并定位文档（散页退回项目列表）
  const openRecentEdit = (item: RecentEdit) => {
    switch (item.kind) {
      case "card":
        return navigator.push("card-detail", { id: item.targetId });
      case "article":
        return navigator.push("article-detail", { id: item.targetId });
      case "diary":
        return navigator.push("diary", { date: item.date });
      case "project":
        if (item.projectId != null)
          return navigator.push("project-detail", { id: item.projectId, itemId: item.itemId });
        return navigator.push("projects");
    }
  };
  if (!data) return null;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        最近编辑
        <PanelNote>卡片 · 文章 · 日记 · 项目</PanelNote>
        <HomePanelMenu />
      </PanelTitle>
      <div className="@max-[1180px]:grid-cols-2 @max-[860px]:grid-cols-1 grid grid-cols-3 gap-x-6 gap-y-0">
        {data.recentEdits.length > 0 ? (
          data.recentEdits.map(item => (
            <RecentRow key={item.id} item={item} onClick={() => openRecentEdit(item)} />
          ))
        ) : (
          <EmptyNote>还没有编辑记录——从新建一张卡片开始</EmptyNote>
        )}
      </div>
    </Panel>
  );
}

function RecentRow({ item, onClick }: { item: RecentEdit; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-tau-sm ease-tau-out hover:bg-hover grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-[11px] text-left transition-[background] duration-[160ms]"
      onClick={onClick}
    >
      <span
        className={clsx(
          "justify-self-start rounded-[5px] px-[7px] py-px text-[10.5px] font-medium",
          KIND_TONE[item.kind]
        )}
      >
        {KIND_LABEL[item.kind]}
      </span>
      <span className="text-tau-meta truncate font-medium">{item.title}</span>
      <span className="text-ink-3 justify-self-end truncate text-[10.5px]">
        {item.updatedText}
        {item.wordsCount > 0 ? ` · ${item.wordsCount} 字` : ""}
      </span>
    </button>
  );
}
