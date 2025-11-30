import { useCallback, useEffect, useRef, useState } from "react";
import { Editor, Element as SlateElement, NodeEntry, Path } from "slate";
import { ReactEditor } from "slate-react";
import type { CommentElement, CustomEditor } from "@/components/Editor/types";
import type { CommentPosition } from "../types";
import { resolveCollisions } from "../utils/collisionDetection";

const isCommentElement = (value: any): value is CommentElement => {
  return SlateElement.isElement(value) && value.type === "comment";
};

const useCommentPositions = (
  editorRef: React.RefObject<CustomEditor | null>,
  containerRef: React.RefObject<HTMLDivElement>,
  minCardHeight: number,
  cardGap: number,
  cardHeights: Record<string, number>,
) => {
  const [positions, setPositions] = useState<CommentPosition[]>([]);
  const rafRef = useRef<number | null>(null);

  const calculateAllPositions = useCallback(() => {
    const editor = editorRef.current;
    const container = containerRef.current;
    if (!editor || !container) {
      setPositions([]);
      return;
    }

    const entries: NodeEntry<CommentElement>[] = [];
    for (const entry of Editor.nodes(editor, {
      at: [],
      match: (node) => !Editor.isEditor(node) && isCommentElement(node),
    })) {
      entries.push(entry as NodeEntry<CommentElement>);
    }

    const containerRect = container.getBoundingClientRect();
    const nextPositions: CommentPosition[] = [];

    entries.forEach(([node, path]) => {
      if (!node.comments || node.comments.length === 0) return;

      try {
        const domNode = ReactEditor.toDOMNode(editor, node);
        const rect = domNode.getBoundingClientRect();

        const offsetTop =
          rect.top - containerRect.top + (container.scrollTop ?? 0);

        const cardHeight = Math.max(
          cardHeights[node.uuid] ?? minCardHeight,
          minCardHeight,
        );

        nextPositions.push({
          element: node,
          path,
          originalY: offsetTop,
          displayY: offsetTop,
          cardHeight,
          domNode,
        });
      } catch {
        // Ignore nodes that are not currently rendered
      }
    });

    nextPositions.sort((a, b) => {
      const compareResult = Path.compare(a.path, b.path);
      if (compareResult !== 0) return compareResult;
      return a.originalY - b.originalY;
    });

    const adjusted = resolveCollisions(nextPositions, cardGap);
    setPositions(adjusted);
  }, [cardGap, cardHeights, containerRef, editorRef, minCardHeight]);

  const scheduleCalculation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(calculateAllPositions);
  }, [calculateAllPositions]);

  useEffect(() => {
    scheduleCalculation();
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [scheduleCalculation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      scheduleCalculation();
    });
    resizeObserver.observe(container);

    const mutationObserver = new MutationObserver(() => {
      scheduleCalculation();
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const handleScroll = () => {
      scheduleCalculation();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [containerRef, scheduleCalculation]);

  return positions;
};

export default useCommentPositions;
