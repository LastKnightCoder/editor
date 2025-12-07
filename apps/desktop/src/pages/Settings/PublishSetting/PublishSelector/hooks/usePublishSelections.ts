import { useState, useCallback, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { getPublishSelections, batchUpsertPublishSelections } from "@/commands";
import { PublishContentType } from "@/types/publish";
import { EntityScope } from "../types";
import { encodeScope, decodeScope } from "../utils";

interface UsePublishSelectionsReturn {
  selections: Map<string, boolean>;
  projectScopes: Map<number, EntityScope>;
  documentScopes: Map<number, EntityScope>;
  isLoading: boolean;
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  toggleSelection: (type: PublishContentType, id: number) => void;
  batchToggle: (
    type: PublishContentType,
    ids: number[],
    selected: boolean,
    options?: { parentPath?: string },
  ) => Promise<void>;
  loadSelections: () => Promise<void>;
  handleEntityToggle: (
    type: "project" | "document",
    id: number,
    enabled: boolean,
  ) => Promise<void>;
  updateEntityScope: (
    type: "project" | "document",
    entityId: number,
    scope: EntityScope,
  ) => Promise<void>;
  getSelectedCount: (type: PublishContentType, ids: number[]) => number;
  getTotalSelectedCount: () => number;
  getTypeSelectedCount: (type: PublishContentType) => number;
}

export function usePublishSelections(): UsePublishSelectionsReturn {
  const [selections, setSelections] = useState<Map<string, boolean>>(new Map());
  const [projectScopes, setProjectScopes] = useState<Map<number, EntityScope>>(
    new Map(),
  );
  const [documentScopes, setDocumentScopes] = useState<
    Map<number, EntityScope>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const isItemSelected = useCallback(
    (type: PublishContentType, id: number) =>
      selections.get(`${type}-${id}`) ?? false,
    [selections],
  );

  const loadSelections = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPublishSelections();
      const map = new Map<string, boolean>();
      const projectScope = new Map<number, EntityScope>();
      const documentScope = new Map<number, EntityScope>();

      data.forEach((item) => {
        const key = `${item.contentType}-${item.contentId}`;
        map.set(key, item.selected);
        if (item.contentType === "project") {
          projectScope.set(item.contentId, decodeScope(item.parentPath));
        }
        if (item.contentType === "document") {
          documentScope.set(item.contentId, decodeScope(item.parentPath));
        }
      });

      setSelections(map);
      setProjectScopes(projectScope);
      setDocumentScopes(documentScope);
    } catch (error) {
      console.error("Failed to load selections:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const batchToggle = useMemoizedFn(
    async (
      type: PublishContentType,
      ids: number[],
      selected: boolean,
      options?: { parentPath?: string },
    ) => {
      const newSelections = new Map(selections);
      ids.forEach((id) => newSelections.set(`${type}-${id}`, selected));
      setSelections(newSelections);

      try {
        await batchUpsertPublishSelections(
          ids.map((id) => ({
            contentType: type,
            contentId: id,
            selected,
            parentPath: options?.parentPath ?? "",
          })),
        );
      } catch (error) {
        console.error("Failed to save selections:", error);
      }
    },
  );

  const toggleSelection = useMemoizedFn(
    (type: PublishContentType, id: number) => {
      const next = !isItemSelected(type, id);
      batchToggle(type, [id], next);
    },
  );

  const handleEntityToggle = useMemoizedFn(
    async (type: "project" | "document", id: number, enabled: boolean) => {
      if (!enabled) {
        if (type === "project") {
          setProjectScopes((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        } else {
          setDocumentScopes((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }
        await batchToggle(type, [id], false);
        return;
      }

      const scopes = type === "project" ? projectScopes : documentScopes;
      const scope = scopes.get(id) ?? { mode: "all" };
      await batchToggle(type, [id], true, {
        parentPath: encodeScope(scope),
      });

      if (type === "project") {
        setProjectScopes((prev) => new Map(prev).set(id, scope));
      } else {
        setDocumentScopes((prev) => new Map(prev).set(id, scope));
      }
    },
  );

  const updateEntityScope = useMemoizedFn(
    async (
      type: "project" | "document",
      entityId: number,
      scope: EntityScope,
    ) => {
      if (type === "project") {
        setProjectScopes((prev) => new Map(prev).set(entityId, scope));
      } else {
        setDocumentScopes((prev) => new Map(prev).set(entityId, scope));
      }

      await batchToggle(type, [entityId], true, {
        parentPath: encodeScope(scope),
      });
    },
  );

  const getSelectedCount = useCallback(
    (type: PublishContentType, ids: number[]) => {
      return ids.filter((id) => isItemSelected(type, id)).length;
    },
    [isItemSelected],
  );

  const getTotalSelectedCount = useMemo(() => {
    return () => Array.from(selections.values()).filter(Boolean).length;
  }, [selections]);

  const getTypeSelectedCount = useCallback(
    (type: PublishContentType) => {
      let count = 0;
      selections.forEach((selected, key) => {
        if (selected && key.startsWith(`${type}-`)) {
          count++;
        }
      });
      return count;
    },
    [selections],
  );

  return {
    selections,
    projectScopes,
    documentScopes,
    isLoading,
    isItemSelected,
    toggleSelection,
    batchToggle,
    loadSelections,
    handleEntityToggle,
    updateEntityScope,
    getSelectedCount,
    getTotalSelectedCount,
    getTypeSelectedCount,
  };
}
