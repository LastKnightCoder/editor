/**
 * Notebook 模块数据源。形态与 features/projects/queries.ts 同构：
 * 列表全量轻表，变更后整域 ["vibe-learning"] 失效重拉。
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVibeLearningProjects,
  getVibeLearningProject,
  createVibeLearningProject,
  updateVibeLearningProject,
  deleteVibeLearningProject,
  recordVibeLearningProjectOpen,
} from "@/commands/vibe-learning-project";
import type {
  VibeLearningOpenedItem,
  VibeLearningProject,
  VibeLearningProjectSummary,
} from "@/types";
import type { CockpitMutations } from "@/features/shared/cockpit/types";

/* 空值兜底用模块级常量：?? [] 每次渲染新建引用会击穿下游 useMemo deps 链 */
const EMPTY_ITEMS: VibeLearningProjectSummary[] = [];

export function useVibeLearningSnapshot(): {
  items: VibeLearningProjectSummary[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["vibe-learning", "list"],
    queryFn: listVibeLearningProjects,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { items: query.data ?? EMPTY_ITEMS, loading: query.isPending };
}

/** 记录打开：进入 Notebook 或切换资料 / 笔记各记一次；item 缺省时保留上次打开的条目 */
export function useRecordVibeLearningOpen(
  id: number,
  item: VibeLearningOpenedItem | undefined,
  ready: boolean
) {
  const queryClient = useQueryClient();
  const kind = item?.kind;
  const itemId = item?.id;
  useEffect(() => {
    if (!ready) return;
    recordVibeLearningProjectOpen(
      id,
      kind && itemId !== undefined ? { kind, id: itemId } : undefined
    )
      .then(() => queryClient.invalidateQueries({ queryKey: ["vibe-learning", "list"] }))
      .catch(error => console.error("[vibe-learning] 记录打开失败", error));
  }, [id, kind, itemId, ready, queryClient]);
}

export function useVibeLearningDetail(id: number): {
  project: VibeLearningProject | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["vibe-learning", "detail", id],
    queryFn: () => getVibeLearningProject(id),
    enabled: Number.isFinite(id),
    staleTime: 60_000,
  });
  return { project: query.data ?? null, loading: query.isPending };
}

export function useVibeLearningMutations(): CockpitMutations {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["vibe-learning"] });

  const patch = async (id: number, changes: Partial<VibeLearningProject>) => {
    const project = await findProject(queryClient, id);
    if (!project) return;
    await updateVibeLearningProject({ ...project, ...changes });
    invalidate();
  };

  return {
    async create({ title, desc }) {
      const created = await createVibeLearningProject({ title, desc });
      invalidate();
      return created;
    },
    async updateInfo(id, title, desc) {
      await patch(id, { title, desc });
    },
    async togglePin(id, pinned) {
      await patch(id, { pinned });
    },
    async setArchived(id, archived) {
      // 归档即退出活跃空间，同时清置顶（置顶段不再捞起）
      await patch(id, archived ? { archived, pinned: false } : { archived });
    },
    async remove(id) {
      /* 先释放学习对话的宿主会话与运行态（与删 PDF 同理）：主进程删项目时连对话文件一起删，
         宿主还开着的话会往已删的文件里继续写 */
      const { default: useChatSessionStore } = await import("@/stores/useChatSessionStore");
      await useChatSessionStore
        .getState()
        .releaseBucket({ scope: "vibe-learning-chat", domainRef: String(id) });
      await deleteVibeLearningProject(id);
      invalidate();
    },
  };
}

/** 优先取列表缓存中的实例（免一次 IPC）；未命中再单独拉取 */
async function findProject(
  queryClient: ReturnType<typeof useQueryClient>,
  id: number
): Promise<VibeLearningProject | null> {
  const cached = queryClient.getQueryData<VibeLearningProjectSummary[]>(["vibe-learning", "list"]);
  const hit = cached?.find(item => item.id === id);
  if (hit) return hit;
  return getVibeLearningProject(id);
}
