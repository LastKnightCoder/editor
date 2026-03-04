import { useMemo, useRef } from "react";
import { BoardElement, Selection } from "../types";

type ElementsSortingResult = {
  centerConnectArrows: BoardElement[];
  noneCenterConnectArrows: BoardElement[];
  centerConnectAndSelectedArrows: BoardElement[];
  isolateStaticSelection: boolean;
};

type RootLayerCache = {
  childrenRef: BoardElement[];
  rootIdSet: Set<string>;
  rootOrderIndex: Map<string, number>;
  rootElementById: Map<string, BoardElement>;
  isCenterById: Map<string, boolean>;
  promotedSelectedRootIds: Set<string>;
  centerConnectArrows: BoardElement[];
  noneCenterConnectArrows: BoardElement[];
  centerConnectAndSelectedArrows: BoardElement[];
};

type SelectionInfo = {
  selectedRootIds: Set<string>;
  hasNestedSelection: boolean;
};

const isCenterConnectElement = (element: BoardElement) => {
  return (
    element.source?.connectId === "center" ||
    element.target?.connectId === "center"
  );
};

const shouldPromoteSelectedRootElement = (
  element: BoardElement,
  isCenterConnect: boolean,
) => {
  return element.type === "arrow" || isCenterConnect;
};

const isSameIdSet = (left: Set<string>, right: Set<string>) => {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
};

const removeById = (elements: BoardElement[], id: string) => {
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return elements;
  const next = elements.slice();
  next.splice(index, 1);
  return next;
};

const insertByRootOrder = (
  elements: BoardElement[],
  element: BoardElement,
  rootOrderIndex: Map<string, number>,
) => {
  if (elements.some((item) => item.id === element.id)) {
    return elements;
  }

  const targetOrder = rootOrderIndex.get(element.id) ?? Number.MAX_SAFE_INTEGER;
  let insertIndex = elements.length;

  for (let i = 0; i < elements.length; i++) {
    const currentOrder =
      rootOrderIndex.get(elements[i].id) ?? Number.MAX_SAFE_INTEGER;
    if (currentOrder > targetOrder) {
      insertIndex = i;
      break;
    }
  }

  const next = elements.slice();
  next.splice(insertIndex, 0, element);
  return next;
};

const collectSelectionInfo = (
  selectedElements: BoardElement[],
  rootIdSet: Set<string>,
): SelectionInfo => {
  const selectedRootIds = new Set<string>();
  let hasNestedSelection = false;

  selectedElements.forEach((selectedElement) => {
    const id = selectedElement?.id;
    if (!id) {
      return;
    }
    if (rootIdSet.has(id)) {
      selectedRootIds.add(id);
    } else {
      hasNestedSelection = true;
    }
  });

  return {
    selectedRootIds,
    hasNestedSelection,
  };
};

const buildRootLayerCache = (
  children: BoardElement[],
  selectedRootIds: Set<string>,
): RootLayerCache => {
  const rootIdSet = new Set<string>();
  const rootOrderIndex = new Map<string, number>();
  const rootElementById = new Map<string, BoardElement>();
  const isCenterById = new Map<string, boolean>();
  const centerConnectArrows: BoardElement[] = [];
  const noneCenterConnectArrows: BoardElement[] = [];
  const centerConnectAndSelectedArrows: BoardElement[] = [];

  children.forEach((element, index) => {
    rootIdSet.add(element.id);
    rootOrderIndex.set(element.id, index);
    rootElementById.set(element.id, element);
    const isCenter = isCenterConnectElement(element);
    isCenterById.set(element.id, isCenter);

    const isSelected = selectedRootIds.has(element.id);
    const shouldPromoteSelected =
      isSelected && shouldPromoteSelectedRootElement(element, isCenter);
    if (shouldPromoteSelected) {
      centerConnectAndSelectedArrows.push(element);
      return;
    }
    if (isCenter) {
      centerConnectArrows.push(element);
    } else {
      noneCenterConnectArrows.push(element);
    }
  });

  const promotedSelectedRootIds = new Set<string>();
  selectedRootIds.forEach((id) => {
    const element = rootElementById.get(id);
    const isCenter = element ? (isCenterById.get(id) ?? false) : false;
    if (element && shouldPromoteSelectedRootElement(element, isCenter)) {
      promotedSelectedRootIds.add(id);
    }
  });

  return {
    childrenRef: children,
    rootIdSet,
    rootOrderIndex,
    rootElementById,
    isCenterById,
    promotedSelectedRootIds,
    centerConnectArrows,
    noneCenterConnectArrows,
    centerConnectAndSelectedArrows,
  };
};

const updateRootLayerCacheBySelection = (
  cache: RootLayerCache,
  nextSelectedRootIds: Set<string>,
): RootLayerCache => {
  const nextPromotedSelectedRootIds = new Set<string>();
  nextSelectedRootIds.forEach((id) => {
    const element = cache.rootElementById.get(id);
    if (!element) return;
    const isCenter = cache.isCenterById.get(id) ?? false;
    if (shouldPromoteSelectedRootElement(element, isCenter)) {
      nextPromotedSelectedRootIds.add(id);
    }
  });

  if (isSameIdSet(cache.promotedSelectedRootIds, nextPromotedSelectedRootIds)) {
    return cache;
  }

  let centerConnectArrows = cache.centerConnectArrows;
  let noneCenterConnectArrows = cache.noneCenterConnectArrows;
  let centerConnectAndSelectedArrows = cache.centerConnectAndSelectedArrows;

  cache.promotedSelectedRootIds.forEach((id) => {
    if (nextPromotedSelectedRootIds.has(id)) return;
    const element = cache.rootElementById.get(id);
    if (!element) return;
    centerConnectAndSelectedArrows = removeById(
      centerConnectAndSelectedArrows,
      id,
    );
    if (cache.isCenterById.get(id)) {
      centerConnectArrows = insertByRootOrder(
        centerConnectArrows,
        element,
        cache.rootOrderIndex,
      );
    } else {
      noneCenterConnectArrows = insertByRootOrder(
        noneCenterConnectArrows,
        element,
        cache.rootOrderIndex,
      );
    }
  });

  nextPromotedSelectedRootIds.forEach((id) => {
    if (cache.promotedSelectedRootIds.has(id)) return;
    const element = cache.rootElementById.get(id);
    if (!element) return;
    centerConnectAndSelectedArrows = insertByRootOrder(
      centerConnectAndSelectedArrows,
      element,
      cache.rootOrderIndex,
    );
    if (cache.isCenterById.get(id)) {
      centerConnectArrows = removeById(centerConnectArrows, id);
    } else {
      noneCenterConnectArrows = removeById(noneCenterConnectArrows, id);
    }
  });

  return {
    ...cache,
    promotedSelectedRootIds: nextPromotedSelectedRootIds,
    centerConnectArrows,
    noneCenterConnectArrows,
    centerConnectAndSelectedArrows,
  };
};

/**
 * 对元素进行分组和排序的 hook
 * 渲染顺序（从下到上）：
 * 1. 中心连接且未选中的箭头（最底层）
 * 2. 非中心连接的元素（中间层）
 * 3. 交互层元素（优先放置选中元素，确保箭头/连接点交互置顶）
 */
const useElementsSorting = (children: BoardElement[], selection: Selection) => {
  const cacheRef = useRef<RootLayerCache | null>(null);

  return useMemo<ElementsSortingResult>(() => {
    const previousCache = cacheRef.current;
    const childrenChanged =
      !previousCache || previousCache.childrenRef !== children;

    const initialRootIdSet = childrenChanged
      ? new Set(children.map((element) => element.id))
      : previousCache.rootIdSet;
    const selectionInfo = collectSelectionInfo(
      selection.selectedElements,
      initialRootIdSet,
    );

    let nextCache: RootLayerCache;
    if (childrenChanged) {
      nextCache = buildRootLayerCache(children, selectionInfo.selectedRootIds);
    } else {
      nextCache = updateRootLayerCacheBySelection(
        previousCache as RootLayerCache,
        selectionInfo.selectedRootIds,
      );
    }
    cacheRef.current = nextCache;
    const hasNonPromotedRootSelection = Array.from(
      selectionInfo.selectedRootIds,
    ).some((id) => !nextCache.promotedSelectedRootIds.has(id));

    return {
      centerConnectArrows: nextCache.centerConnectArrows,
      noneCenterConnectArrows: nextCache.noneCenterConnectArrows,
      centerConnectAndSelectedArrows: nextCache.centerConnectAndSelectedArrows,
      isolateStaticSelection:
        !selectionInfo.hasNestedSelection && !hasNonPromotedRootSelection,
    };
  }, [children, selection.selectedElements]);
};

export default useElementsSorting;
