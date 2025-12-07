import BoardUtil from "./BoardUtil";
import type { BoardElement } from "../types";
import {
  incrementResourceRefCount,
  decrementResourceRefCount,
} from "@/commands";

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

const collectResourcePaths = (elements: BoardElement[]): string[] => {
  const paths: string[] = [];
  elements.forEach((element) => {
    BoardUtil.dfs(element, (node) => {
      if (
        isResourceElement(node) &&
        typeof node.src === "string" &&
        node.src.trim()
      ) {
        paths.push(node.src);
      }
    });
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
