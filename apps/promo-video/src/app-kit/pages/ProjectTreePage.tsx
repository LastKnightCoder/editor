/**
 * 项目页重建（只画功能片用到的部分）：结构摘自 features/projects（views/ProjectDetailView 的面包屑、ProjectList 的文档树侧栏、
 * ProjectItem 的行、shared/constants/menuItems 的「+」菜单）。左侧项目栏 300px 可收起，右侧的条目区由调用方给。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, FileText, House, ListTree, PanelLeft, Plus, Video } from "lucide-react";
import { IconButton } from "@tau/ui";
import { MenuItem, MenuSurface } from "../parts/Menu";

export type TreeItem = { id: string; title: string; kind: "doc" | "video" | "folder" };

export type AddMenu = {
  /** 菜单展开 0→1 */
  appear: number;
  /** 「添加视频」子菜单展开 0→1 */
  submenu?: number;
  /** 高亮的项：主菜单的序号，或子菜单里 `video:<序号>`；子菜单开着时父项也一直高亮 */
  highlighted?: string[];
};

/** 「添加视频」子菜单：前两项固定，后面是已启用的视频插件 */
export const ADD_MENU = ["添加文档", "添加白板", "添加视频", "添加网页", "添加表格", "添加 PDF", "关联卡片", "关联白板", "导入Markdown"];
export const VIDEO_MENU = ["本地视频", "远程视频"];

/** 标题栏面包屑：展开 / 收起文档树的按钮 + 项目名（ProjectDetailView） */
export function ProjectCrumb({ project, pressed }: { project: string; pressed?: boolean }) {
  return (
    <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1" data-hit="tree-toggle">
      <IconButton className={clsx("shrink-0", pressed && "bg-selected text-accent-text")}>
        <PanelLeft size={17} strokeWidth={1.75} />
      </IconButton>
      <span className="min-w-0 truncate px-1.5 py-0.5">{project}</span>
    </span>
  );
}

export function ProjectTreePage({
  project,
  items,
  activeId,
  tree = 1,
  menu,
  providers = [],
  children,
}: {
  project: string;
  items: TreeItem[];
  activeId?: string;
  /** 文档栏展开 0→1（视频笔记放不下两栏时会自动收起） */
  tree?: number;
  menu?: AddMenu;
  /** 已启用的视频插件名，接在「本地视频 / 远程视频」后面 */
  providers?: string[];
  children?: ReactNode;
}) {
  const menuOpen = !!menu && menu.appear > 0;
  const submenu = menu?.submenu ?? 0;
  const videoIndex = ADD_MENU.indexOf("添加视频");
  return (
    <div className="h-full px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex h-full overflow-hidden">
        <div className="relative h-full shrink-0" style={{ width: 300 * tree, opacity: Math.min(1, tree * 3) }}>
          <div className="relative box-border flex h-full w-[300px] flex-col border-b-16 border-transparent px-4 pb-0">
            <div className="flex h-[60px] flex-none items-center justify-between pr-3 pl-[9px]">
              <span className="hover:bg-hover flex size-[30px] shrink-0 items-center justify-center rounded-full transition-colors">
                <House className="size-4" strokeWidth={1.75} />
              </span>
              <span className="hover:bg-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition-all">
                <span className="truncate">{project}</span>
                <ChevronDown size={16} strokeWidth={1.75} className="text-ink-1" />
              </span>
              <span className="flex items-center gap-3">
                <ListTree className="size-4" strokeWidth={1.75} />
                <span data-hit="add" className="cursor-pointer">
                  <Plus className="size-4" strokeWidth={1.75} />
                </span>
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map(item => {
                const active = item.id === activeId;
                return (
                  <div
                    key={item.id}
                    data-hit={`item:${item.id}`}
                    className={clsx(
                      "relative flex min-w-0 cursor-pointer items-center justify-between rounded-[6px] border border-transparent pr-[2px] pl-[4px] transition-all duration-200",
                      active ? "bg-accent-soft text-accent-text" : "hover:bg-hover"
                    )}
                  >
                    <div className="flex min-h-[30px] min-w-0 flex-1 items-center gap-[6px] overflow-hidden">
                      {item.kind === "folder" ? (
                        <span className="text-ink-1 flex size-4 flex-none items-center justify-center opacity-45">
                          <ChevronRight className="size-[13px]" strokeWidth={1.75} />
                        </span>
                      ) : (
                        <span className="size-4 flex-none" aria-hidden />
                      )}
                      <span className="flex size-4 flex-none items-center justify-center">
                        {item.kind === "video" ? (
                          <Video className={clsx("size-4", active ? "text-accent-text" : "text-ink-3")} strokeWidth={1.75} />
                        ) : (
                          <FileText className={clsx("size-4", active ? "text-accent-text" : "text-ink-3")} strokeWidth={1.75} />
                        )}
                      </span>
                      <span className={clsx("w-full min-w-0 max-w-full truncate leading-[30px]", active ? "text-accent-text font-semibold" : "text-ink-2")}>{item.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {menuOpen && (
              // 菜单从「+」下方展开、右对齐（align="end"）；外层不裁切，子菜单才能伸到右边
              <div className="absolute z-[250]" style={{ right: 12, top: 54, opacity: menu.appear, transform: `translateY(${(1 - menu.appear) * 4}px)` }}>
                <MenuSurface className="!relative">
                  {ADD_MENU.map((label, i) => (
                    <MenuItem key={label} hit={`add:${i}`} chevron={label === "添加视频" || label === "添加 PDF"} highlighted={menu.highlighted?.includes(String(i))}>
                      {label}
                    </MenuItem>
                  ))}
                </MenuSurface>
                {submenu > 0 && (
                  // 子菜单贴着「添加视频」那一行的右边展开（right-start，间距 4px）：第一项和这一行对齐（两层面板的内边距相同，互相抵掉）
                  <MenuSurface style={{ left: "calc(100% + 4px)", top: videoIndex * 36, opacity: submenu }}>
                    {[...VIDEO_MENU, ...providers].map((label, i) => (
                      <MenuItem key={label} hit={`video:${i}`} highlighted={menu.highlighted?.includes(`video:${i}`)}>
                        {label}
                      </MenuItem>
                    ))}
                  </MenuSurface>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
