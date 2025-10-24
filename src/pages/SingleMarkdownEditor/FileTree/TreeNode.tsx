import { memo, useState } from "react";
import { FileTreeNode } from "@/types/file-tree";
import classnames from "classnames";
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileMarkdownOutlined,
  RightOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";

import styles from "./index.module.less";

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  currentFilePath: string;
  onFileClick: (filePath: string) => void;
  onFolderExpand: (folderPath: string) => Promise<void>;
  defaultExpanded?: boolean;
}

const TreeNode = memo(
  ({
    node,
    depth,
    currentFilePath,
    onFileClick,
    onFolderExpand,
    defaultExpanded = false,
  }: TreeNodeProps) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    const handleToggle = useMemoizedFn(async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isDirectory) {
        const newExpanded = !expanded;
        setExpanded(newExpanded);

        // 如果展开且尚未加载，则加载子项
        if (newExpanded && !node.loaded) {
          await onFolderExpand(node.path);
        }
      }
    });

    const handleClick = useMemoizedFn(async () => {
      if (node.isDirectory) {
        const newExpanded = !expanded;
        setExpanded(newExpanded);

        // 如果展开且尚未加载，则加载子项
        if (newExpanded && !node.loaded) {
          await onFolderExpand(node.path);
        }
      } else {
        onFileClick(node.path);
      }
    });

    const isActive = !node.isDirectory && node.path === currentFilePath;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div className={styles.treeNodeContainer}>
        <div
          className={classnames(styles.treeNode, {
            [styles.active]: isActive,
            [styles.directory]: node.isDirectory,
          })}
          onClick={handleClick}
        >
          <span className={styles.arrow} onClick={handleToggle}>
            {node.isDirectory ? (
              expanded ? (
                <DownOutlined />
              ) : (
                <RightOutlined />
              )
            ) : null}
          </span>
          <span className={styles.icon}>
            {node.isDirectory ? (
              expanded ? (
                <FolderOpenOutlined />
              ) : (
                <FolderOutlined />
              )
            ) : (
              <FileMarkdownOutlined />
            )}
          </span>
          <span className={styles.name}>{node.name}</span>
        </div>
        {node.isDirectory && expanded && hasChildren && node.children && (
          <div className={styles.children}>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                currentFilePath={currentFilePath}
                onFileClick={onFileClick}
                onFolderExpand={onFolderExpand}
                defaultExpanded={false}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);

TreeNode.displayName = "TreeNode";

export default TreeNode;
