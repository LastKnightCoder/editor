import { Board, BoardElement, ElementBounds, Selection, ViewPort } from "../types";

export type ExportImageAction = "board" | "selection";

export type ExportImageBackgroundMode = "light" | "dark" | "transparent";

const DARK_BACKGROUND = "#0f172a";
const LIGHT_BACKGROUND = "#ffffff";

const findElementById = (elements: BoardElement[], id: string): BoardElement | null => {
  for (const element of elements) {
    if (element.id === id) return element;
    if (Array.isArray(element.children) && element.children.length > 0) {
      const target = findElementById(element.children, id);
      if (target) return target;
    }
  }
  return null;
};

const elementContainsId = (element: BoardElement, id: string): boolean => {
  if (element.id === id) return true;
  if (!Array.isArray(element.children) || element.children.length === 0) {
    return false;
  }
  return element.children.some(child => elementContainsId(child, id));
};

const dedupeElementsByAncestor = (elements: BoardElement[]): BoardElement[] => {
  if (elements.length <= 1) return elements;
  return elements.filter(element => {
    return !elements.some(candidate => {
      if (candidate.id === element.id) return false;
      return elementContainsId(candidate, element.id);
    });
  });
};

export const resolveExportElements = (params: {
  board: Board;
  action: ExportImageAction;
  selectedElementIds?: string[];
}): BoardElement[] => {
  const { board, action, selectedElementIds } = params;
  if (action === "board") {
    return board.children;
  }

  const ids = Array.isArray(selectedElementIds) ? Array.from(new Set(selectedElementIds)) : [];
  if (ids.length === 0) return [];

  const resolved = ids
    .map(id => findElementById(board.children, id))
    .filter((element): element is BoardElement => Boolean(element));
  return dedupeElementsByAncestor(resolved);
};

const collectBoundsRecursive = (
  board: Board,
  element: BoardElement,
  collector: ElementBounds[]
): void => {
  const bounds = board.getBounds(element);
  if (bounds) {
    collector.push(bounds);
  }

  if (Array.isArray(element.children) && element.children.length > 0) {
    element.children.forEach(child => collectBoundsRecursive(board, child, collector));
  }
};

export const calculateExportBounds = (
  board: Board,
  elements: BoardElement[]
): ElementBounds | null => {
  if (elements.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const allBounds: ElementBounds[] = [];
    collectBoundsRecursive(board, element, allBounds);
    for (const bounds of allBounds) {
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};

export const createExportViewPort = (bounds: ElementBounds, padding: number): ViewPort => {
  const safePadding = Math.max(0, padding);
  const minX = bounds.minX - safePadding;
  const minY = bounds.minY - safePadding;
  const width = Math.max(1, bounds.maxX - bounds.minX + safePadding * 2);
  const height = Math.max(1, bounds.maxY - bounds.minY + safePadding * 2);
  return {
    minX,
    minY,
    width,
    height,
    zoom: 1,
  };
};

export const resolveExportBackgroundColor = (mode: ExportImageBackgroundMode): string | null => {
  if (mode === "dark") return DARK_BACKGROUND;
  if (mode === "light") return LIGHT_BACKGROUND;
  return null;
};

export const cloneSelection = (selection: Selection): Selection => {
  return JSON.parse(JSON.stringify(selection)) as Selection;
};

export const createExportFilename = (action: ExportImageAction): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const prefix = action === "selection" ? "whiteboard-selection" : "whiteboard";
  return `${prefix}-${date}-${time}.png`;
};

export const downloadBlobAsFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
