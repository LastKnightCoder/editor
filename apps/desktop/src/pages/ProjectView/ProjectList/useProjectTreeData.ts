import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { Project, ProjectItem } from "@/types";
import { defaultProjectItemEventBus } from "@/utils";
import {
  ProjectTreeData,
  buildProjectTreeData,
  loadProjectItemMap,
} from "./projectTree";

export const useProjectTreeData = (project: Project | null) => {
  const [itemMap, setItemMap] = useState<Map<number, ProjectItem>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    setItemMap(new Map());
  }, [project?.id]);

  const reload = useMemoizedFn(async (options?: { silent?: boolean }) => {
    if (!project) {
      setItemMap(new Map());
      return;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      setItemMap(await loadProjectItemMap(project.children || []));
      hasLoadedRef.current = true;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    void reload({ silent: hasLoadedRef.current });
  }, [project?.id, project?.children.join(","), reload]);

  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToOtherEditors(
      "project-item:updated",
      ({ projectItem }) => {
        setItemMap((previous) => {
          if (!previous.has(projectItem.id)) return previous;
          const next = new Map(previous);
          next.set(projectItem.id, projectItem);
          return next;
        });
      },
    );
    return () => unsubscribe();
  }, [projectItemEventBus]);

  const treeData = useMemo<ProjectTreeData>(() => {
    if (!project) {
      return {
        nodes: [],
        itemMap,
        nodeMap: new Map(),
        itemNodeMap: new Map(),
      };
    }
    return buildProjectTreeData(project, itemMap);
  }, [itemMap, project]);

  return {
    loading,
    treeData,
    reload,
    setItemMap,
  };
};
