import { useEffect, useMemo } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Project, ProjectItem } from "@/types";
import { defaultProjectItemEventBus } from "@/utils";
import { ProjectTreeData, buildProjectTreeData, loadProjectItemMap } from "@/utils/projectTree";
import { projectTreeKey } from "@/features/projects/queries";

const EMPTY_ITEM_MAP = new Map<number, ProjectItem>();
const EMPTY_TREE_DATA: ProjectTreeData = {
  nodes: [],
  itemMap: EMPTY_ITEM_MAP,
  nodeMap: new Map(),
  itemNodeMap: new Map(),
};

export const useProjectTreeData = (project: Project | null) => {
  const queryClient = useQueryClient();
  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);

  const projectId = project?.id;
  /* children 指纹编进 key：增删/移动子项后 detail 缓存刷新返回新 children，树自动重拉；
   * 结构变更全部来自显式写操作，staleTime 不设限（Infinity）避免无谓重拉 */
  const childrenKey = (project?.children ?? []).join(",");
  const query = useQuery({
    queryKey: ["projects", "tree", projectId, childrenKey],
    queryFn: () => loadProjectItemMap(project?.children ?? []),
    enabled: projectId != null,
    staleTime: Infinity,
  });

  /* 其他编辑器/窗口发布条目更新时就地并入缓存（树内已知才替换，未知条目等结构失效重拉） */
  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToOtherEditors(
      "project-item:updated",
      ({ projectItem }) => {
        if (projectId == null) return;
        queryClient.setQueriesData<Map<number, ProjectItem>>(
          { queryKey: projectTreeKey(projectId) },
          itemMap => {
            if (!itemMap?.has(projectItem.id)) return itemMap;
            const next = new Map(itemMap);
            next.set(projectItem.id, projectItem);
            return next;
          }
        );
      }
    );
    return () => unsubscribe();
  }, [projectItemEventBus, projectId, queryClient]);

  /* invalidate 天然 silent：active query 背景重拉、期间旧数据保持，
   * 与既有调用方的 { silent: true } 约定等价，参数仅为兼容保留 */
  const reload = useMemoizedFn(async (_options?: { silent?: boolean }) => {
    if (projectId == null) return;
    await queryClient.invalidateQueries({ queryKey: projectTreeKey(projectId) });
  });

  const itemMap = query.data ?? EMPTY_ITEM_MAP;
  const treeData = useMemo<ProjectTreeData>(() => {
    if (!project) return EMPTY_TREE_DATA;
    return buildProjectTreeData(project, itemMap);
  }, [project, itemMap]);

  return {
    loading: projectId != null && query.isPending,
    treeData,
    reload,
  };
};
