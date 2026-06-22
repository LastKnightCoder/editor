import { Descendant } from "slate";
import { MindMapNodeData } from "@/components/MindMap/types";
import { IDocument, IDocumentItem } from "@/types";
import { DocumentTreeData, DocumentTreeNode } from "./documentTree";

export interface DocumentMindMapNodeMeta extends Record<string, unknown> {
  nodeKind: "document" | "document-item";
  nodeId?: string;
  documentId: number;
  documentItemId?: number;
  parentId?: number;
  isRoot?: boolean;
  title: string;
  documentItem?: IDocumentItem;
  path: number[];
  parentChildren: number[];
}

export const DOCUMENT_MINDMAP_ROOT_PREFIX = "document:";
export const DOCUMENT_MINDMAP_ITEM_PREFIX = "document-item:";

export const getDocumentMindMapRootId = (documentId: number) =>
  `${DOCUMENT_MINDMAP_ROOT_PREFIX}${documentId}`;

export const getDocumentMindMapItemId = (documentItemId: number) =>
  `${DOCUMENT_MINDMAP_ITEM_PREFIX}${documentItemId}`;

export const getDocumentMindMapNodeId = (treeNode: DocumentTreeNode) =>
  `${DOCUMENT_MINDMAP_ITEM_PREFIX}${treeNode.nodeId}`;

export const parseDocumentMindMapItemId = (nodeId: string) => {
  if (!nodeId.startsWith(DOCUMENT_MINDMAP_ITEM_PREFIX)) return null;
  const rawId = nodeId.slice(DOCUMENT_MINDMAP_ITEM_PREFIX.length);
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
  document: IDocument,
  treeNode: DocumentTreeNode,
  isDocumentItemOpen?: (itemId: number, path: number[]) => boolean,
): MindMapNodeData => {
  const title = treeNode.item.title || `#${treeNode.item.id}`;
  return {
    id: getDocumentMindMapNodeId(treeNode),
    text: titleToSlate(title),
    isRightFold:
      treeNode.children.length > 0
        ? !isDocumentItemOpen?.(treeNode.item.id, treeNode.path)
        : false,
    meta: {
      nodeKind: "document-item",
      nodeId: treeNode.nodeId,
      documentId: document.id,
      documentItemId: treeNode.item.id,
      parentId: treeNode.parentId,
      isRoot: treeNode.isRoot,
      title,
      documentItem: treeNode.item,
      path: treeNode.path,
      parentChildren: treeNode.parentChildren,
      measureSingleLine: true,
      measureInlinePrefixWidth: 0,
    } satisfies DocumentMindMapNodeMeta,
    children: treeNode.children.map((child) =>
      buildItemMindMapNode(document, child, isDocumentItemOpen),
    ),
  };
};

export const buildDocumentMindMapData = (
  document: IDocument,
  treeData: DocumentTreeData,
  isDocumentItemOpen?: (itemId: number, path: number[]) => boolean,
): MindMapNodeData => ({
  id: getDocumentMindMapRootId(document.id),
  text: titleToSlate(document.title || `知识库 #${document.id}`),
  meta: {
    nodeKind: "document",
    documentId: document.id,
    title: document.title || `知识库 #${document.id}`,
    path: [],
    parentChildren: document.children,
    measureSingleLine: true,
    measureInlinePrefixWidth: 0,
  } satisfies DocumentMindMapNodeMeta,
  children: treeData.nodes.map((node) =>
    buildItemMindMapNode(document, node, isDocumentItemOpen),
  ),
});
