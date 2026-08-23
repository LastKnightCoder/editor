import { memo } from "react";
import { FileTreeNode } from "@/types/file-tree";
import { Dropdown, type MenuProps } from "antd";
import classnames from "classnames";
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileMarkdownOutlined,
  FileImageOutlined,
  FileTextOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  FilePdfOutlined,
  RightOutlined,
  DownOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { getFileCategory, type FileCategory } from "../fileTypes";

import styles from "./index.module.less";

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  currentFilePath: string;
  onFileClick: (filePath: string) => void;
  onFolderExpand: (folderPath: string) => Promise<void>;
  onFolderToggle: (folderPath: string, expanded: boolean) => void;
  expandedPaths: ReadonlySet<string>;
  onRename?: (node: FileTreeNode) => void;
  onDelete?: (node: FileTreeNode) => void;
}

const TreeNode = memo(
  ({
    node,
    depth,
    currentFilePath,
    onFileClick,
    onFolderExpand,
    onFolderToggle,
    expandedPaths,
    onRename,
    onDelete,
  }: TreeNodeProps) => {
    const expanded = expandedPaths.has(node.path);

    const handleToggle = useMemoizedFn(async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isDirectory) {
        const newExpanded = !expanded;
        onFolderToggle(node.path, newExpanded);

        // 如果展开且尚未加载，则加载子项
        if (newExpanded && !node.loaded) {
          await onFolderExpand(node.path);
        }
      }
    });

    const handleClick = useMemoizedFn(async () => {
      if (node.isDirectory) {
        const newExpanded = !expanded;
        onFolderToggle(node.path, newExpanded);

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

    const getFileIcon = (category: FileCategory) => {
      switch (category) {
        case "markdown":
          return <FileMarkdownOutlined />;
        case "image":
          return <FileImageOutlined />;
        case "video":
          return <VideoCameraOutlined />;
        case "audio":
          return <SoundOutlined />;
        case "external":
          return <FilePdfOutlined />;
        case "code":
        default:
          return <FileTextOutlined />;
      }
    };

    const contextMenuItems: MenuProps["items"] = node.isDirectory
      ? []
      : [
          { key: "rename", label: "重命名", icon: <EditOutlined /> },
          { type: "divider" },
          {
            key: "delete",
            label: "删除",
            icon: <DeleteOutlined />,
            danger: true,
          },
        ];

    const handleContextMenuClick: MenuProps["onClick"] = ({ key }) => {
      if (key === "rename") onRename?.(node);
      if (key === "delete") onDelete?.(node);
    };

    const nodeContent = (
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
              getFileIcon(getFileCategory(node.name))
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
                onFolderToggle={onFolderToggle}
                expandedPaths={expandedPaths}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    );

    if (node.isDirectory) return nodeContent;

    return (
      <Dropdown
        menu={{ items: contextMenuItems, onClick: handleContextMenuClick }}
        trigger={["contextMenu"]}
      >
        {nodeContent}
      </Dropdown>
    );
  },
);

TreeNode.displayName = "TreeNode";

export default TreeNode;
