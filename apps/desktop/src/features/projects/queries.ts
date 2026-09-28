/**
 * 项目页数据源：学习驾驶舱（方案 C 定稿，mockups/projects/plan-c-cockpit.html）。
 * - 列表：getProjectList 全量轻表（项目数量级小，无分页窗口）；
 * - 变更（置顶/归档/编辑/新建/删除）后整域失效重拉；
 * - 摘要与相对时间是渲染派生，不落库。
 */

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Descendant } from "slate";
import {
  getProjectList,
  getProjectItemCounts,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from "@/commands/project";
import { getAllCards, getAllWhiteBoards } from "@/commands";
import type { ICard, WhiteBoard } from "@/types";
import type { Project, UpdateProject } from "@/types/project";
import type { ProjectPageItem } from "./types";

/* ---------- 查询 ---------- */

/** 条目计数（含文档树深层节点——projects 数组逐层登记，主进程聚合命令一次拉全量映射）。
 *  独立 queryKey 供列表与详情页共用；["projects"] 前缀失效随域变更一并重拉 */
const EMPTY_COUNTS: Record<number, number> = {};

export function useProjectItemCounts(): {
  counts: Record<number, number>;
} {
  const query = useQuery({
    queryKey: ["projects", "item-counts"],
    queryFn: getProjectItemCounts,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  /* 空值兜底用模块级常量：?? {} 每次渲染新建引用会击穿下游 useMemo deps 链 */
  return { counts: query.data ?? EMPTY_COUNTS };
}

/** 详情域文档树缓存 key 前缀（完整 key 末位拼接 children 指纹，见 useProjectTreeData） */
export const projectTreeKey = (projectId: number) => ["projects", "tree", projectId] as const;

/** 原始项目列表（详情页项目切换下拉等，不装配计数） */
const EMPTY_PROJECTS: Project[] = [];

export function useProjectsList(): {
  projects: Project[];
} {
  const query = useQuery({
    queryKey: ["projects", "list"],
    queryFn: getProjectList,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { projects: query.data ?? EMPTY_PROJECTS };
}

export function useProjectsSnapshot(): {
  projects: ProjectPageItem[];
  loading: boolean;
  refresh(): void;
} {
  const query = useQuery({
    queryKey: ["projects", "list"],
    queryFn: getProjectList,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const { counts } = useProjectItemCounts();
  /* useMemo 稳定引用：下游 useMemo 派生（activeAll/状态栏读数）以本数组为 deps */
  const projects = useMemo(
    () =>
      (query.data ?? []).map(project => ({
        ...project,
        itemCount: counts[project.id] ?? 0,
      })),
    [query.data, counts]
  );
  return {
    projects,
    loading: query.isPending,
    refresh: () => void query.refetch(),
  };
}

/** 项目详情：按 id 拉单项目（详情工作台/壳层共用） */
export function useProjectDetail(id: number): {
  project: Project | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: () => getProjectById(id),
    enabled: Number.isFinite(id),
    staleTime: 60_000,
  });
  return { project: query.data ?? null, loading: query.isPending };
}

/* 详情侧关联数据源：文档树「关联卡片/白板」弹窗的全量轻表。
 * 空值兜底用模块级常量：?? [] 每次渲染新建引用会击穿下游 useMemo deps 链 */
const EMPTY_CARDS: ICard[] = [];
const EMPTY_WHITE_BOARDS: WhiteBoard[] = [];

export function useProjectRefCards(): {
  cards: ICard[];
} {
  const query = useQuery({
    queryKey: ["projects", "ref-cards"],
    queryFn: getAllCards,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { cards: query.data ?? EMPTY_CARDS };
}

export function useProjectRefWhiteBoards(): {
  whiteBoards: WhiteBoard[];
} {
  const query = useQuery({
    queryKey: ["projects", "ref-white-boards"],
    queryFn: getAllWhiteBoards,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { whiteBoards: query.data ?? EMPTY_WHITE_BOARDS };
}

/* ---------- 变更 ---------- */

/** 列表快照里已含全量字段，patch 后构造 UpdateProject（主进程自取 update_time） */
function toUpdate(project: Project, changes: Partial<Project>): UpdateProject {
  return { ...project, ...changes };
}

export interface CreateProjectInput {
  title: string;
  desc: Descendant[];
}

/** 项目域变更：操作后整域失效（列表 + 详情缓存一并重拉） */
export function useProjectMutations(): {
  create(input: CreateProjectInput): Promise<Project>;
  updateInfo(id: number, title: string, desc: Descendant[]): Promise<void>;
  togglePin(id: number, pinned: boolean): Promise<void>;
  setArchived(id: number, archived: boolean): Promise<void>;
  remove(id: number): Promise<void>;
} {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["projects"] });

  return {
    async create({ title, desc }) {
      const project = await createProject({
        title,
        desc,
        children: [],
        archived: false,
        pinned: false,
      });
      invalidate();
      return project;
    },
    async updateInfo(id, title, desc) {
      const project = await findProject(queryClient, id);
      if (!project) return;
      await updateProject(toUpdate(project, { title, desc }));
      invalidate();
    },
    async togglePin(id, pinned) {
      const project = await findProject(queryClient, id);
      if (!project) return;
      await updateProject(toUpdate(project, { pinned }));
      invalidate();
    },
    async setArchived(id, archived) {
      const project = await findProject(queryClient, id);
      if (!project) return;
      // 归档即退出活跃空间，同时清置顶（hero/置顶段不再捞起）
      await updateProject(
        toUpdate(project, { archived, pinned: archived ? false : project.pinned })
      );
      invalidate();
    },
    async remove(id) {
      await deleteProject(id);
      invalidate();
    },
  };
}

/** 优先取列表缓存中的实例（免一次 IPC）；未命中再单独拉取 */
async function findProject(
  queryClient: ReturnType<typeof useQueryClient>,
  id: number
): Promise<Project | null> {
  const cached = queryClient.getQueryData<Project[]>(["projects", "list"]);
  const hit = cached?.find(p => p.id === id);
  if (hit) return hit;
  return getProjectById(id);
}
