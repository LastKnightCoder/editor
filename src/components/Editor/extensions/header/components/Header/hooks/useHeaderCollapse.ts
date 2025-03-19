import { useEffect, useRef } from "react";
import {
  Editor,
  Node as SlateNode,
  Path,
  Element as SlateElement,
  Transforms,
} from "slate";
import { ReactEditor } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { HeaderElement } from "@/components/Editor/types";

interface UseHeaderCollapseParams {
  editor: Editor;
  element: HeaderElement;
  path: Path;
}

const useHeaderCollapse = ({
  editor,
  element,
  path,
}: UseHeaderCollapseParams) => {
  const { level, collapsed = false } = element;

  // Store references to hidden nodes for cleanup
  const hiddenNodesRef = useRef<Array<HTMLElement>>([]);

  const setCollapsed = useMemoizedFn((collapsed: boolean) => {
    if (!path) return;
    Transforms.setNodes(editor, { collapsed }, { at: path });
  });

  // Toggle collapse/expand state
  const toggleCollapse = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCollapsed(!collapsed);
  });

  // Determine if a node is a header
  const isHeaderNode = useMemoizedFn((node: SlateNode): boolean => {
    return SlateElement.isElement(node) && node.type === "header";
  });

  // Determine if a header node is at the same or higher level as current header
  const isSameOrHigherLevelHeader = useMemoizedFn(
    (node: SlateNode): boolean => {
      if (!isHeaderNode(node)) return false;
      return (node as HeaderElement).level <= level;
    },
  );

  // Get all nodes in the header section
  const getHeaderSectionNodes = useMemoizedFn(() => {
    try {
      const nodes: { node: SlateNode; path: Path }[] = [];

      const deepLevel = path.length - 1;
      let parent: SlateElement | Editor = editor;
      for (let i = 0; i < deepLevel; i++) {
        // @ts-ignore
        parent = parent.children[path[i]];
      }
      // @ts-ignore
      const afterNodes = parent.children.slice(path[deepLevel] + 1);

      for (let i = 0; i < afterNodes.length; i++) {
        const node = afterNodes[i];
        if (isSameOrHigherLevelHeader(node)) {
          break;
        }
        nodes.push({ node, path: [...path, i + path[path.length - 1] + 1] });
      }

      return nodes;
    } catch (e) {
      console.error("Header node processing failed:", e);
      return [];
    }
  });

  // Get DOM nodes to toggle
  const getDomNodesToToggle = useMemoizedFn(() => {
    const domNodes: HTMLElement[] = [];

    // Header path string representation (for comparison)
    const headerPath = ReactEditor.findPath(editor, element);
    const headerPathStr = JSON.stringify(headerPath);

    getHeaderSectionNodes().forEach(({ node, path }) => {
      try {
        // Make sure we don't operate on the header itself
        if (JSON.stringify(path) === headerPathStr) {
          return;
        }

        // Get DOM node
        const domNode = ReactEditor.toDOMNode(editor, node);

        // Ensure it's an HTMLElement and not the current header
        if (domNode && domNode instanceof HTMLElement) {
          domNodes.push(domNode);
        }
      } catch (e) {
        // Node might not be rendered yet
      }
    });

    return { domNodes };
  });

  // Handle cleanup of hidden nodes' temporary styles
  useEffect(() => {
    return () => {
      // Reset all node styles on component unmount
      hiddenNodesRef.current.forEach((node) => {
        if (node) {
          node.style.display = "";
          node.style.height = "";
          node.style.opacity = "";
          node.style.overflow = "";
          node.style.transition = "";
          node.style.marginTop = "";
          node.style.marginBottom = "";
          node.style.paddingTop = "";
          node.style.paddingBottom = "";
        }
      });
      hiddenNodesRef.current = [];
    };
  }, []);

  // Apply collapse/expand effects
  useEffect(() => {
    const { domNodes } = getDomNodesToToggle();

    // Apply collapse/expand effects to all nodes in the section
    domNodes.forEach((domNode) => {
      // Save node reference
      hiddenNodesRef.current.push(domNode);

      // Smooth transition effects
      if (collapsed) {
        // Collapse process
        // 1. Record current height
        domNode.style.height = `${domNode.offsetHeight}px`;
        // 2. Force reflow
        void domNode.offsetHeight;
        // 3. Set transition effect and shrink to 0
        domNode.style.height = "0";
        domNode.style.opacity = "0";
        domNode.style.overflow = "hidden";
        domNode.style.transition = "height 0.25s ease, opacity 0.25s ease";
        domNode.style.marginTop = "0";
        domNode.style.marginBottom = "0";
        domNode.style.paddingTop = "0";
        domNode.style.paddingBottom = "0";

        // 4. Set display:none after transition completes
        setTimeout(() => {
          // Check if collapse state is still consistent
          domNode.style.display = "none";
        }, 250);
      } else {
        // Expand process
        // 1. Initialize with 0 height but visible
        domNode.style.height = "0";
        domNode.style.opacity = "0";
        domNode.style.display = "";
        domNode.style.overflow = "hidden";
        domNode.style.transition = "height 0.25s ease, opacity 0.25s ease";

        // 2. Force reflow
        void domNode.offsetHeight;

        // 3. Restore all styles
        domNode.style.height = "";
        domNode.style.opacity = "1";
        domNode.style.marginTop = "";
        domNode.style.marginBottom = "";
        domNode.style.paddingTop = "";
        domNode.style.paddingBottom = "";

        // 4. Clean up styles after transition completes
        setTimeout(() => {
          // Check if collapse state is still consistent
          domNode.style.overflow = "";
          domNode.style.transition = "";
          domNode.style.height = "";
        }, 250);
      }
    });
  }, [collapsed, getDomNodesToToggle]);

  return {
    collapsed,
    toggleCollapse,
  };
};

export default useHeaderCollapse;
