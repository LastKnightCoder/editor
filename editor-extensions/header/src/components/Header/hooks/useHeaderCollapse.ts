import { useEffect, useRef, useState } from "react";
import { Editor, Node as SlateNode, Path, Element as SlateElement, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { getCommandElementPath } from "@tau/editor/api";
import type { HeaderElement } from "../../../types";

interface UseHeaderCollapseParams {
  editor: Editor;
  element: HeaderElement;
  disabled?: boolean;
  readOnly?: boolean;
}

const useHeaderCollapse = ({
  editor,
  element,
  disabled = false,
  readOnly = false,
}: UseHeaderCollapseParams) => {
  const { level } = element;
  const [viewCollapsed, setViewCollapsed] = useState<boolean>();
  const collapsed =
    !disabled && (readOnly ? (viewCollapsed ?? !!element.collapsed) : !!element.collapsed);
  useEffect(() => setViewCollapsed(undefined), [element.collapsed, readOnly]);

  // Store references to hidden nodes for cleanup
  const hiddenNodesRef = useRef<Array<HTMLElement>>([]);
  // 上一次生效的折叠状态：挂载时为 null。展开动画只在「折叠 → 展开」时播放，
  // 否则挂载时会给整节写上内联样式，压过宿主对这些块的样式（如聚焦模式的 opacity）
  const appliedRef = useRef<boolean | null>(null);

  const getCurrentPath = useMemoizedFn((): Path | null => {
    try {
      return ReactEditor.findPath(editor, element);
    } catch (e) {
      return null;
    }
  });

  const setCollapsed = useMemoizedFn((collapsed: boolean) => {
    if (disabled) return;
    if (readOnly) {
      setViewCollapsed(collapsed);
      return;
    }
    const currentPath = getCommandElementPath(editor, { element });
    if (!currentPath) return;
    Transforms.setNodes(editor, { collapsed }, { at: currentPath });
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
  const isSameOrHigherLevelHeader = useMemoizedFn((node: SlateNode): boolean => {
    if (!isHeaderNode(node)) return false;
    return (node as HeaderElement).level <= level;
  });

  // Get all nodes in the header section
  const getHeaderSectionNodes = useMemoizedFn(() => {
    try {
      const nodes: { node: SlateNode; path: Path }[] = [];
      const currentPath = getCurrentPath();
      if (!currentPath) {
        return nodes;
      }

      const parentPath = currentPath.length > 1 ? Path.parent(currentPath) : null;
      const parent = parentPath
        ? (Editor.node(editor, parentPath)[0] as SlateElement | Editor)
        : editor;
      const currentIndex = currentPath[currentPath.length - 1];
      // @ts-ignore
      const afterNodes = parent.children.slice(currentIndex + 1);

      for (let i = 0; i < afterNodes.length; i++) {
        const node = afterNodes[i];
        if (isSameOrHigherLevelHeader(node)) {
          break;
        }
        nodes.push({
          node,
          path: [...(parentPath ?? []), currentIndex + i + 1],
        });
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

    const currentPath = getCurrentPath();
    if (!currentPath) {
      return { domNodes };
    }

    getHeaderSectionNodes().forEach(({ node, path }) => {
      try {
        // Make sure we don't operate on the header itself
        if (Path.equals(path, currentPath)) {
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
      hiddenNodesRef.current.forEach(node => {
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const previous = appliedRef.current;
    appliedRef.current = collapsed;
    if (previous === collapsed || (previous === null && !collapsed)) return;
    const { domNodes } = getDomNodesToToggle();

    // Apply collapse/expand effects to all nodes in the section
    domNodes.forEach(domNode => {
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
        timers.push(
          setTimeout(() => {
            // Check if collapse state is still consistent
            domNode.style.display = "none";
          }, 250)
        );
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
        timers.push(
          setTimeout(() => {
            // Check if collapse state is still consistent
            domNode.style.overflow = "";
            domNode.style.transition = "";
            domNode.style.height = "";
            // opacity 也要清：残留的内联值会一直压着外部样式
            domNode.style.opacity = "";
          }, 250)
        );
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [collapsed, getDomNodesToToggle]);

  return {
    collapsed,
    toggleCollapse,
  };
};

export default useHeaderCollapse;
