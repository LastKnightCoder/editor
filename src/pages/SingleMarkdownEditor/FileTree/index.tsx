import { memo, useEffect, useState } from "react";
import { FileTreeNode } from "@/types/file-tree";
import { readDirectory } from "@/commands/file";
import { useMemoizedFn } from "ahooks";
import TreeNode from "./TreeNode";
import { LoadingOutlined } from "@ant-design/icons";

import styles from "./index.module.less";

interface FileTreeProps {
  currentFilePath: string;
  onFileClick: (filePath: string) => void;
  rootPath: string;
}

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

const isMarkdownFile = (fileName: string): boolean => {
  return MARKDOWN_EXTENSIONS.some((ext) =>
    fileName.toLowerCase().endsWith(ext),
  );
};

const FileTree = memo(
  ({ currentFilePath, onFileClick, rootPath }: FileTreeProps) => {
    const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    // 只加载一层目录，不递归
    const loadDirectory = useMemoizedFn(
      async (dirPath: string): Promise<FileTreeNode[]> => {
        try {
          const entries = await readDirectory(dirPath);

          // 过滤并排序：只保留 Markdown 文件和文件夹
          const nodes: FileTreeNode[] = entries
            .filter((entry) => entry.isDirectory || isMarkdownFile(entry.name))
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

    const renderTree = useMemoizedFn((nodes: FileTreeNode[], depth = 0) => {
      return nodes.map((node) => {
        const shouldExpand = expandedPaths.has(node.path);
        return (
          <TreeNode
            key={node.path}
            node={node}
            depth={depth}
            currentFilePath={currentFilePath}
            onFileClick={onFileClick}
            onFolderExpand={loadFolderChildren}
            defaultExpanded={shouldExpand}
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

    if (treeData.length === 0) {
      return <div className={styles.empty}>当前目录无 Markdown 文件</div>;
    }

    return <div className={styles.fileTree}>{renderTree(treeData)}</div>;
  },
);

FileTree.displayName = "FileTree";

export default FileTree;
