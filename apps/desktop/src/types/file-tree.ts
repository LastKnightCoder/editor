export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  loaded?: boolean; // 文件夹的子项是否已加载
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}
