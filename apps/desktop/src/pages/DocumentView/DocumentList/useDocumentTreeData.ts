import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { IDocument, IDocumentItem } from "@/types";
import { defaultDocumentItemEventBus } from "@/utils";
import {
  DocumentTreeData,
  buildDocumentTreeData,
  loadDocumentItemMap,
} from "./documentTree";

export const useDocumentTreeData = (document: IDocument | null) => {
  const [itemMap, setItemMap] = useState<Map<number, IDocumentItem>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    setItemMap(new Map());
  }, [document?.id]);

  const reload = useMemoizedFn(async (options?: { silent?: boolean }) => {
    if (!document) {
      setItemMap(new Map());
      return;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      setItemMap(await loadDocumentItemMap(document.children || []));
      hasLoadedRef.current = true;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    void reload({ silent: hasLoadedRef.current });
  }, [document?.id, document?.children.join(","), reload]);

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToOtherEditors(
      "document-item:updated",
      ({ documentItem }) => {
        setItemMap((previous) => {
          if (!previous.has(documentItem.id)) return previous;
          const next = new Map(previous);
          next.set(documentItem.id, documentItem);
          return next;
        });
      },
    );
    return () => unsubscribe();
  }, [documentItemEventBus]);

  const treeData = useMemo<DocumentTreeData>(() => {
    if (!document) {
      return {
        nodes: [],
        itemMap,
        nodeMap: new Map(),
        itemNodeMap: new Map(),
      };
    }
    return buildDocumentTreeData(document, itemMap);
  }, [document, itemMap]);

  return {
    loading,
    treeData,
    reload,
    setItemMap,
  };
};
