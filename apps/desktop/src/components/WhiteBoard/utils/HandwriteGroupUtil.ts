import { Board, BoardElement } from "../types";

interface HandwriteLikeElement extends BoardElement {
  type: "handwrite";
  groupId?: string;
}

export interface GroupSelectionBounds {
  groupId: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const normalizeGroupId = (groupId?: string): string | null => {
  if (typeof groupId !== "string") return null;
  const trimmed = groupId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const walkElements = (
  elements: BoardElement[] | undefined,
  visitor: (element: BoardElement) => void,
) => {
  if (!elements || elements.length === 0) return;
  for (const element of elements) {
    visitor(element);
    if (Array.isArray(element.children) && element.children.length > 0) {
      walkElements(element.children, visitor);
    }
  }
};

export const isHandwriteElement = (
  element: BoardElement | null | undefined,
): element is HandwriteLikeElement => {
  return !!element && element.type === "handwrite";
};

export const getElementGroupId = (
  element: BoardElement | null | undefined,
): string | null => {
  if (!element) return null;
  return normalizeGroupId(element.groupId);
};

export const collectGroupMembers = (
  board: Pick<Board, "children">,
  groupId: string,
): BoardElement[] => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) return [];

  const members: BoardElement[] = [];
  walkElements(board.children, (element) => {
    if (getElementGroupId(element) !== normalizedGroupId) return;
    members.push(element);
  });

  return members;
};

export const getSelectedGroupBounds = (
  board: Pick<Board, "children" | "getBounds">,
  selectedElements: BoardElement[],
): GroupSelectionBounds[] => {
  if (selectedElements.length < 2) return [];

  const selectedIds = new Set(selectedElements.map((element) => element.id));
  const groupIds = Array.from(
    new Set(
      selectedElements
        .map((element) => getElementGroupId(element))
        .filter((groupId): groupId is string => Boolean(groupId)),
    ),
  );

  const boundsCollection: GroupSelectionBounds[] = [];

  groupIds.forEach((groupId) => {
    const groupMembers = collectGroupMembers(board, groupId);
    if (groupMembers.length < 2) return;

    const isAllSelected = groupMembers.every((member) =>
      selectedIds.has(member.id),
    );
    if (!isAllSelected) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    groupMembers.forEach((member) => {
      const bounds = board.getBounds(member);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return;
    }

    boundsCollection.push({
      groupId,
      minX,
      minY,
      maxX,
      maxY,
    });
  });

  return boundsCollection;
};

export const isPointInGroupBounds = (
  bounds: GroupSelectionBounds,
  x: number,
  y: number,
  padding = 0,
): boolean => {
  return (
    x >= bounds.minX - padding &&
    x <= bounds.maxX + padding &&
    y >= bounds.minY - padding &&
    y <= bounds.maxY + padding
  );
};

export const isPointInAnySelectedGroupBounds = (
  board: Pick<Board, "children" | "getBounds">,
  selectedElements: BoardElement[],
  x: number,
  y: number,
  padding = 0,
): boolean => {
  const boundsCollection = getSelectedGroupBounds(board, selectedElements);
  return boundsCollection.some((bounds) =>
    isPointInGroupBounds(bounds, x, y, padding),
  );
};

export const expandSelectionByGroup = (
  board: Pick<Board, "children">,
  elements: BoardElement[],
): BoardElement[] => {
  if (elements.length === 0) return [];

  const selectedMap = new Map<string, BoardElement>();
  const groupIds = new Set<string>();

  for (const element of elements) {
    selectedMap.set(element.id, element);
    const groupId = getElementGroupId(element);
    if (groupId) {
      groupIds.add(groupId);
    }
  }

  for (const groupId of groupIds) {
    const members = collectGroupMembers(board, groupId);
    for (const member of members) {
      selectedMap.set(member.id, member);
    }
  }

  return Array.from(selectedMap.values());
};

export const isMergeableHandwriteSelection = (elements: BoardElement[]) => {
  return elements.length > 1 && elements.every(isHandwriteElement);
};

export const getSharedHandwriteGroupId = (
  elements: BoardElement[],
): string | null => {
  if (elements.length === 0 || !elements.every(isHandwriteElement)) {
    return null;
  }

  const firstGroupId = normalizeGroupId(elements[0].groupId);
  if (!firstGroupId) return null;

  for (const element of elements) {
    if (normalizeGroupId(element.groupId) !== firstGroupId) {
      return null;
    }
  }

  return firstGroupId;
};

export const collectHandwriteGroupMembers = (
  board: Pick<Board, "children">,
  groupId: string,
): HandwriteLikeElement[] => {
  return collectGroupMembers(board, groupId).filter(isHandwriteElement);
};

export const expandSelectionByHandwriteGroup = (
  board: Pick<Board, "children">,
  elements: BoardElement[],
): BoardElement[] => {
  const handwriteElements = elements.filter(isHandwriteElement);
  return expandSelectionByGroup(board, handwriteElements).filter(
    isHandwriteElement,
  );
};

export const applyHandwriteGroupIdPatch = (
  elements: BoardElement[],
  nextGroupId: string | null,
): BoardElement[] => {
  const normalizedNextGroupId = normalizeGroupId(nextGroupId ?? undefined);

  return elements.map((element) => {
    if (!isHandwriteElement(element)) {
      return element;
    }

    if (normalizedNextGroupId) {
      return {
        ...element,
        groupId: normalizedNextGroupId,
      };
    }

    const { groupId: _groupId, ...rest } = element;
    return rest;
  });
};
