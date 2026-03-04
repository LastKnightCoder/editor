import type { BoardElement } from "../types";
import {
  incrementResourceRefCount,
  decrementResourceRefCount,
} from "@/commands/resource";

export type ResourceSource = {
  type: "whiteboard";
  id: number;
};

type ResourceElement = BoardElement & {
  type: "image" | "video";
  src?: string;
};

const isResourceElement = (element: BoardElement): element is ResourceElement =>
  element?.type === "image" || element?.type === "video";

// BoardOperations.metadata.insertedElements/removedElements 已经是“扁平化后的子树节点列表”。
// 因此这里不再做 dfs，避免同一子树被重复遍历导致 refCount 误增/误减。
const collectResourcePaths = (elements: BoardElement[]): string[] => {
  const paths: string[] = [];
  elements.forEach((element) => {
    if (isResourceElement(element) && typeof element.src === "string") {
      const src = element.src.trim();
      if (src) paths.push(src);
    }
  });
  return paths;
};

const fireAndForget = (task: Promise<unknown>) => {
  task.catch((error) => {
    console.error("Resource reference update failed:", error);
  });
};

class ResourceUsageTracker {
  static track(
    metadata: {
      insertedElements: BoardElement[];
      removedElements: BoardElement[];
    },
    source?: ResourceSource | null,
  ) {
    if (!source) return;

    const inserted = collectResourcePaths(metadata.insertedElements || []);
    const removed = collectResourcePaths(metadata.removedElements || []);

    inserted.forEach((path) => {
      fireAndForget(
        incrementResourceRefCount(path, {
          type: source.type,
          id: source.id,
        }),
      );
    });

    removed.forEach((path) => {
      fireAndForget(decrementResourceRefCount(path));
    });
  }
}

export default ResourceUsageTracker;
