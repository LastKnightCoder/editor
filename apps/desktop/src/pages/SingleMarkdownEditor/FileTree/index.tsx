import { memo, useEffect, useRef, useState } from "react";
import { FileTreeNode } from "@/types/file-tree";
import {
  createTextFileExclusive,
  onDirectoryChanged,
  offDirectoryChanged,
  readDirectory,
  unwatchDirectory,
  watchDirectory,
} from "@/commands/file";
import { useMemoizedFn } from "ahooks";
import TreeNode from "./TreeNode";
import { Button, Input, Modal, Tooltip, message } from "antd";
import {
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { getFileCategory, isSupportedFile } from "../fileTypes";

import styles from "./index.module.less";

interface FileTreeProps {
  currentFilePath: string;
  onFileClick: (filePath: string) => void;
  rootPath: string;
  onFileRenamed: (oldPath: string, newPath: string) => Promise<void>;
  onFileDeleted: (filePath: string) => Promise<void>;
}

const normalizePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+$/, "");

const isPathWithinRoot = (path: string, rootPath: string) => {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(rootPath);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
};

const isValidFileName = (fileName: string) =>
  !!fileName &&
  !/[\\/:*?"<>|]/.test(fileName) &&
  fileName !== "." &&
  fileName !== "..";

const isFileConflictError = (error: unknown) =>
  error instanceof Error && /EEXIST|already exists/i.test(error.message);

const FileTree = memo(
  ({
    currentFilePath,
    onFileClick,
    rootPath,
    onFileRenamed,
    onFileDeleted,
  }: FileTreeProps) => {
    const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 只加载一层目录，不递归
    const loadDirectory = useMemoizedFn(
      async (dirPath: string): Promise<FileTreeNode[]> => {
        try {
          const entries = await readDirectory(dirPath);

          const nodes: FileTreeNode[] = entries
            .filter((entry) => entry.isDirectory || isSupportedFile(entry.name))
            .map((entry) => ({
              ...entry,
              loaded: false, // 文件夹初始状态未加载
            }));

          // 排序：文件夹在前，文件在后，同类型按名称排序
          nodes.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
              return a.name.localeCompare(b.name, "zh-CN");
            }
            return a.isDirectory ? -1 : 1;
          });

          return nodes;
        } catch (error) {
          console.error("加载目录失败:", error);
          return [];
        }
      },
    );

    // 动态加载文件夹的子项
    const loadFolderChildren = useMemoizedFn(async (folderPath: string) => {
      const children = await loadDirectory(folderPath);

      // 更新树数据，递归查找并更新对应节点
      const updateNodeChildren = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.map((node) => {
          if (node.path === folderPath) {
            return {
              ...node,
              children,
              loaded: true,
            };
          }
          if (node.children) {
            return {
              ...node,
              children: updateNodeChildren(node.children),
            };
          }
          return node;
        });
      };

      setTreeData((prevData) => updateNodeChildren(prevData));
    });

    const handleFolderToggle = useMemoizedFn(
      (folderPath: string, expanded: boolean) => {
        setExpandedPaths((previousPaths) => {
          const nextPaths = new Set(previousPaths);
          if (expanded) nextPaths.add(folderPath);
          else nextPaths.delete(folderPath);
          return nextPaths;
        });
      },
    );

    const refreshTree = useMemoizedFn(async () => {
      if (!rootPath) return;
      const tree = await loadDirectory(rootPath);
      setTreeData(tree);
      const paths = Array.from(expandedPaths).sort(
        (a, b) => a.length - b.length,
      );
      for (const folderPath of paths) {
        const children = await loadDirectory(folderPath);
        setTreeData((prevData) => {
          const update = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map((node) =>
              node.path === folderPath
                ? { ...node, children, loaded: true }
                : node.children
                  ? { ...node, children: update(node.children) }
                  : node,
            );
          return update(prevData);
        });
      }
    });

    const findExpandedPaths = useMemoizedFn(
      (filePath: string, rootDir: string): Set<string> => {
        const paths = new Set<string>();
        let currentPath = filePath;

        while (
          currentPath &&
          currentPath !== rootDir &&
          currentPath.length > rootDir.length
        ) {
          // 找到最后一个路径分隔符的位置（支持 Windows 和 Unix）
          const lastSlash = currentPath.lastIndexOf("/");
          const lastBackslash = currentPath.lastIndexOf("\\");
          const lastSeparator = Math.max(lastSlash, lastBackslash);

          if (lastSeparator === -1) break;

          const dirPath = currentPath.substring(0, lastSeparator);
          if (dirPath && dirPath.length >= rootDir.length) {
            paths.add(dirPath);
            currentPath = dirPath;
          } else {
            break;
          }
        }

        return paths;
      },
    );

    // 递归加载从根目录到目标文件的所有父目录
    const loadPathToFile = useMemoizedFn(
      async (filePath: string, rootDir: string) => {
        const pathsToLoad = findExpandedPaths(filePath, rootDir);
        const sortedPaths = Array.from(pathsToLoad).sort(
          (a, b) => a.length - b.length,
        );

        // 从根目录开始逐层加载
        for (const dirPath of sortedPaths) {
          await loadFolderChildren(dirPath);
        }
      },
    );

    useEffect(() => {
      if (!rootPath) return;

      const initializeFileTree = async () => {
        try {
          setLoading(true);

          // rootPath 本身就是目录，直接使用
          const tree = await loadDirectory(rootPath);
          setTreeData(tree);

          // 如果有当前文件，加载并展开到该文件的路径
          if (currentFilePath) {
            const pathsToExpand = findExpandedPaths(currentFilePath, rootPath);
            setExpandedPaths(pathsToExpand);

            // 递归加载所有父目录
            await loadPathToFile(currentFilePath, rootPath);
          }
        } catch (error) {
          console.error("初始化文件树失败:", error);
        } finally {
          setLoading(false);
        }
      };

      initializeFileTree();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rootPath]);

    // 当 currentFilePath 变化时，加载并展开到该文件的路径
    useEffect(() => {
      if (!rootPath || !currentFilePath) return;

      const updateExpandedPaths = async () => {
        const pathsToExpand = findExpandedPaths(currentFilePath, rootPath);
        setExpandedPaths(pathsToExpand);

        // 加载尚未加载的父目录
        await loadPathToFile(currentFilePath, rootPath);
      };

      updateExpandedPaths();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFilePath]);

    useEffect(() => {
      if (!rootPath) return;
      const directories = [rootPath, ...Array.from(expandedPaths)];
      directories.forEach(
        (directoryPath) => void watchDirectory(directoryPath),
      );
      const handleDirectoryChanged = (
        _event: unknown,
        payload: { directoryPath?: string },
      ) => {
        const changedPath = payload?.directoryPath;
        if (changedPath && isPathWithinRoot(changedPath, rootPath)) {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => {
            refreshTimerRef.current = null;
            void refreshTree();
          }, 120);
        }
      };
      onDirectoryChanged(handleDirectoryChanged);
      return () => {
        offDirectoryChanged(handleDirectoryChanged);
        directories.forEach(
          (directoryPath) => void unwatchDirectory(directoryPath),
        );
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
      };
    }, [rootPath, expandedPaths, refreshTree]);

    const handleCreateFile = useMemoizedFn(async () => {
      let fileName = "未命名.md";
      Modal.confirm({
        title: "新建 Markdown 文件",
        content: (
          <Input
            defaultValue={fileName}
            autoFocus
            onChange={(event) => {
              fileName = event.target.value.trim();
            }}
          />
        ),
        okText: "创建",
        cancelText: "取消",
        onOk: async () => {
          const normalizedName = fileName.toLowerCase().endsWith(".md")
            ? fileName
            : `${fileName}.md`;
          if (!isValidFileName(normalizedName)) {
            message.warning('文件名不能包含 \\ / : * ? " < > |');
            return Promise.reject();
          }
          const separator = rootPath.includes("\\") ? "\\" : "/";
          const filePath = `${rootPath}${separator}${normalizedName}`;
          try {
            await createTextFileExclusive(filePath, "");
            await refreshTree();
            await onFileClick(filePath);
          } catch (error) {
            if (isFileConflictError(error)) {
              message.warning("文件已存在");
              return Promise.reject(error);
            }
            console.error("新建 Markdown 文件失败:", error);
            message.error("新建文件失败");
            return Promise.reject(error);
          }
        },
      });
    });

    const handleRename = useMemoizedFn((node: FileTreeNode) => {
      if (node.isDirectory) return;
      let renameValue = node.name;
      Modal.confirm({
        title: "重命名文件",
        content: (
          <Input
            defaultValue={renameValue}
            autoFocus
            onChange={(event) => {
              renameValue = event.target.value.trim();
            }}
          />
        ),
        okText: "保存",
        cancelText: "取消",
        onOk: async () => {
          if (!isValidFileName(renameValue)) {
            message.warning('文件名不能包含 \\ / : * ? " < > |');
            return Promise.reject();
          }
          if (renameValue === node.name) return;
          if (getFileCategory(renameValue) !== getFileCategory(node.name)) {
            message.warning("不能通过重命名改变文件类型");
            return Promise.reject();
          }
          const separator = node.path.includes("\\") ? "\\" : "/";
          const parentPath = node.path.slice(
            0,
            node.path.lastIndexOf(separator),
          );
          const nextPath = `${parentPath}${separator}${renameValue}`;
          try {
            await onFileRenamed(node.path, nextPath);
            await refreshTree();
          } catch (error) {
            if (isFileConflictError(error)) {
              message.warning("同名文件已存在");
              return Promise.reject(error);
            }
            console.error("重命名文件失败:", error);
            message.error("重命名失败");
            return Promise.reject(error);
          }
        },
      });
    });

    const handleDelete = useMemoizedFn((node: FileTreeNode) => {
      Modal.confirm({
        title: "删除文件",
        content: `确定删除“${node.name}”吗？`,
        okText: "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: async () => {
          try {
            await onFileDeleted(node.path);
            await refreshTree();
          } catch (error) {
            console.error("删除文件失败:", error);
            message.error("删除失败");
            return Promise.reject(error);
          }
        },
      });
    });

    const renderTree = useMemoizedFn((nodes: FileTreeNode[], depth = 0) => {
      return nodes.map((node) => {
        return (
          <TreeNode
            key={node.path}
            node={node}
            depth={depth}
            currentFilePath={currentFilePath}
            onFileClick={onFileClick}
            onFolderExpand={loadFolderChildren}
            onFolderToggle={handleFolderToggle}
            expandedPaths={expandedPaths}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        );
      });
    });

    if (loading) {
      return (
        <div className={styles.loading}>
          <LoadingOutlined spin />
        </div>
      );
    }

    return (
      <div className={styles.fileTreeWrapper}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>文件</span>
          <span className={styles.toolbarActions}>
            <Tooltip title="新建 Markdown 文件">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                aria-label="新建 Markdown 文件"
                onClick={handleCreateFile}
              />
            </Tooltip>
            <Tooltip title="刷新文件列表">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                aria-label="刷新文件列表"
                onClick={refreshTree}
              />
            </Tooltip>
          </span>
        </div>
        {treeData.length === 0 ? (
          <div className={styles.empty}>当前目录无可打开的文件</div>
        ) : (
          <div className={styles.fileTree}>{renderTree(treeData)}</div>
        )}
      </div>
    );
  },
);

FileTree.displayName = "FileTree";

export default FileTree;
