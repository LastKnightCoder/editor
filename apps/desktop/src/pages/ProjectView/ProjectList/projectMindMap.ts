import { Descendant } from "slate";
import { MindMapNodeData } from "@/components/MindMap/types";
import { Project, ProjectItem } from "@/types";
import { ProjectTreeData, ProjectTreeNode } from "./projectTree";

export interface ProjectMindMapNodeMeta extends Record<string, unknown> {
  nodeKind: "project" | "project-item";
  nodeId?: string;
  projectId: number;
  projectItemId?: number;
  parentId?: number;
  isRoot?: boolean;
  title: string;
  projectItem?: ProjectItem;
  path: number[];
  parentChildren: number[];
}

export const PROJECT_MINDMAP_ROOT_PREFIX = "project:";
export const PROJECT_MINDMAP_ITEM_PREFIX = "project-item:";
const PROJECT_NODE_INLINE_PREFIX_WIDTH = 28;

export const getProjectMindMapRootId = (projectId: number) =>
  `${PROJECT_MINDMAP_ROOT_PREFIX}${projectId}`;

export const getProjectMindMapItemId = (projectItemId: number) =>
  `${PROJECT_MINDMAP_ITEM_PREFIX}${projectItemId}`;

export const getProjectMindMapNodeId = (treeNode: ProjectTreeNode) =>
  `${PROJECT_MINDMAP_ITEM_PREFIX}${treeNode.nodeId}`;

export const parseProjectMindMapItemId = (nodeId: string) => {
  if (!nodeId.startsWith(PROJECT_MINDMAP_ITEM_PREFIX)) return null;
  const rawId = nodeId.slice(PROJECT_MINDMAP_ITEM_PREFIX.length);
  const match = rawId.match(/^([1-9]\d*)(?:@|$)/);
  return match ? Number(match[1]) : null;
};

const titleToSlate = (title: string): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: title }],
  } as Descendant,
];

const buildItemMindMapNode = (
  project: Project,
  treeNode: ProjectTreeNode,
  isProjectItemOpen?: (itemId: number, path: number[]) => boolean,
): MindMapNodeData => {
  const title = treeNode.item.title || `#${treeNode.item.id}`;
  return {
    id: getProjectMindMapNodeId(treeNode),
    text: titleToSlate(title),
    isRightFold:
      treeNode.children.length > 0
        ? !isProjectItemOpen?.(treeNode.item.id, treeNode.path)
        : false,
    meta: {
      nodeKind: "project-item",
      nodeId: treeNode.nodeId,
      projectId: project.id,
      projectItemId: treeNode.item.id,
      parentId: treeNode.parentId,
      isRoot: treeNode.isRoot,
      title,
      projectItem: treeNode.item,
      path: treeNode.path,
      parentChildren: treeNode.parentChildren,
      measureSingleLine: true,
      measureInlinePrefixWidth: PROJECT_NODE_INLINE_PREFIX_WIDTH,
    } satisfies ProjectMindMapNodeMeta,
    children: treeNode.children.map((child) =>
      buildItemMindMapNode(project, child, isProjectItemOpen),
    ),
  };
};

export const buildProjectMindMapData = (
  project: Project,
  treeData: ProjectTreeData,
  isProjectItemOpen?: (itemId: number, path: number[]) => boolean,
): MindMapNodeData => ({
  id: getProjectMindMapRootId(project.id),
  text: titleToSlate(project.title || `项目 #${project.id}`),
  meta: {
    nodeKind: "project",
    projectId: project.id,
    title: project.title || `项目 #${project.id}`,
    path: [],
    parentChildren: project.children,
    measureSingleLine: true,
    measureInlinePrefixWidth: PROJECT_NODE_INLINE_PREFIX_WIDTH,
  } satisfies ProjectMindMapNodeMeta,
  children: treeData.nodes.map((node) =>
    buildItemMindMapNode(project, node, isProjectItemOpen),
  ),
});
