import { memo, useState, useEffect, useRef } from "react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  AiOutlineFolder,
  AiOutlineFolderOpen,
  AiOutlineFile,
  AiOutlinePlus,
  AiOutlineReload,
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineFolderView,
} from "react-icons/ai";
import { MdOutlineDescription } from "react-icons/md";
import {
  useMemoizedFn,
  useRafInterval,
  useUnmount,
  useDebounceFn,
  useLocalStorageState,
} from "ahooks";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import SVG from "react-inlinesvg";
import { Descendant } from "slate";
import isHotkey from "is-hotkey";
import { UnControlled as CodeMirrorEditor } from "react-codemirror2";
import { Editor as CodeMirrorEditorType, EditorChange } from "codemirror";

// Import CodeMirror modes
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/python/python.js";
import "codemirror/mode/shell/shell.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/sql/sql.js";
import "codemirror/addon/edit/closebrackets.js";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/blackboard.css";

import useThemeColors from "@/hooks/useThemeColors";
import useTheme from "@/hooks/useTheme";
import {
  getFileTree,
  getSkillsDir,
  createDirectory,
  createFile,
  readSkillFile,
  writeSkillFile,
  deleteFileOrFolder,
  renameFileOrFolder,
  showInFolder,
} from "@/commands/skill";
import type { SkillFile } from "@/types";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import CustomModal from "@/components/CustomModal";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import { Editor, EditorRef } from "@tau/editor/src";
import { importFromMarkdown, getMarkdown } from "@/utils";
import ErrorBoundary from "@/components/ErrorBoundary";
import CreateSkillModal from "./CreateSkillModal";

interface FileTreeNodeProps {
  file: SkillFile;
  level: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (file: SkillFile) => void;
  getContextMenu: (file: SkillFile) => MenuProps["items"];
  themeColors: ReturnType<typeof useThemeColors>;
  children?: FileTreeNodeProps[];
}

const FileTreeNode = memo(
  ({
    file,
    level,
    expanded,
    selectedPath,
    onToggle,
    onSelect,
    getContextMenu,
    themeColors,
    children = [],
  }: FileTreeNodeProps) => {
    const isExpanded = expanded.has(file.path);
    const isSelected = selectedPath === file.path;

    return (
      <div>
        <Dropdown
          menu={{ items: getContextMenu(file) }}
          trigger={["contextMenu"]}
        >
          <div
            className={classNames(
              "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
              isSelected ? themeColors.activeClass : themeColors.hoverClass,
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => {
              if (file.isDirectory) {
                onToggle(file.path);
              } else {
                onSelect(file);
              }
            }}
          >
            <div
              className={classNames(
                "shrink-0 mr-2 text-base",
                themeColors.secondaryTextClass,
              )}
            >
              {file.isDirectory ? (
                isExpanded ? (
                  <AiOutlineFolderOpen />
                ) : (
                  <AiOutlineFolder />
                )
              ) : file.isMarkdown ? (
                <MdOutlineDescription />
              ) : (
                <AiOutlineFile />
              )}
            </div>
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              {file.name}
            </span>
          </div>
        </Dropdown>
        {file.isDirectory && isExpanded && (
          <div>
            {children.map((childProps) => (
              <FileTreeNode key={childProps.file.path} {...childProps} />
            ))}
          </div>
        )}
      </div>
    );
  },
);

FileTreeNode.displayName = "FileTreeNode";

// 根据文件扩展名获取 CodeMirror 模式
const getCodeMirrorMode = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const modeMap: Record<string, string> = {
    md: "markdown",
    js: "javascript",
    jsx: "javascript",
    ts: "javascript",
    tsx: "javascript",
    css: "css",
    scss: "css",
    less: "css",
    html: "htmlmixed",
    htm: "htmlmixed",
    xml: "xml",
    json: "javascript",
    py: "python",
    sh: "shell",
    bash: "shell",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    txt: "text",
  };
  return modeMap[ext || ""] || "text";
};

// 判断文件是否可编辑
const isEditableFile = (fileName: string): boolean => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const editableExts = [
    "md",
    "txt",
    "js",
    "jsx",
    "ts",
    "tsx",
    "css",
    "scss",
    "less",
    "html",
    "htm",
    "xml",
    "json",
    "py",
    "sh",
    "bash",
    "yaml",
    "yml",
    "sql",
  ];
  return editableExts.includes(ext || "");
};

const SkillManagement = memo(() => {
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();
  const { isDark } = useTheme();

  const [fileMap, setFileMap] = useState<Map<string, SkillFile[]>>(new Map());
  const [skillsDir, setSkillsDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useLocalStorageState<string[]>(
    "skill-management-expanded-paths",
    {
      defaultValue: [],
    },
  );
  const expanded = new Set(expandedPaths || []);
  const [selectedFile, setSelectedFile] = useState<SkillFile | null>(null);
  const [fileContent, setFileContent] = useState<Descendant[]>([]);
  const [codeContent, setCodeContent] = useState("");
  const [hideSidebar, setHideSidebar] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const editorRef = useRef<EditorRef>(null);
  const codeEditorRef = useRef<CodeMirrorEditorType>();
  const currentMarkdownText = useRef("");
  const currentCodeText = useRef("");

  // 弹窗状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [createName, setCreateName] = useState("");
  const [createParentPath, setCreateParentPath] = useState("");
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingFile, setRenamingFile] = useState<SkillFile | null>(null);
  const [newName, setNewName] = useState("");
  const [createSkillModalVisible, setCreateSkillModalVisible] = useState(false);

  const loadFiles = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const [fileTree, dir] = await Promise.all([
        getFileTree(),
        getSkillsDir(),
      ]);
      setSkillsDir(dir);

      // 构建文件映射（父路径 -> 子文件列表）
      const map = new Map<string, SkillFile[]>();
      map.set(dir, fileTree);
      setFileMap(map);
    } catch (error) {
      message.error(`加载文件失败: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  });

  const loadChildren = useMemoizedFn(async (dirPath: string) => {
    if (fileMap.has(dirPath)) {
      return fileMap.get(dirPath) || [];
    }

    try {
      const childrenFiles = await getFileTree(dirPath);
      setFileMap((prev) => new Map(prev).set(dirPath, childrenFiles));
      return childrenFiles;
    } catch (error) {
      message.error(`加载子文件失败: ${(error as Error).message}`);
      return [];
    }
  });

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleToggle = useMemoizedFn(async (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      // 如果已经展开，则收起
      newExpanded.delete(path);
      setExpandedPaths(Array.from(newExpanded));
    } else {
      // 如果未展开，先加载子文件，然后再展开
      await loadChildren(path);
      newExpanded.add(path);
      setExpandedPaths(Array.from(newExpanded));
    }
  });

  const handleSelectFile = useMemoizedFn(async (file: SkillFile) => {
    if (!isEditableFile(file.name)) {
      message.info("不支持编辑此类型的文件");
      return;
    }

    // 保存当前文件
    if (selectedFile && selectedFile.path !== file.path) {
      await handleSaveFile();
    }

    try {
      const content = await readSkillFile(file.path);

      if (file.isMarkdown) {
        // Markdown 文件使用 Editor
        const editorContent = importFromMarkdown(content);
        currentMarkdownText.current = content;
        setFileContent(editorContent);
        setCodeContent("");
        currentCodeText.current = "";
      } else {
        // 其他代码文件使用 CodeMirror
        currentCodeText.current = content;
        setCodeContent(content);
        setFileContent([]);
        currentMarkdownText.current = "";
      }

      setSelectedFile(file);
    } catch (error) {
      message.error(`读取文件失败: ${(error as Error).message}`);
    }
  });

  const handleSaveFile = useMemoizedFn(async () => {
    if (!selectedFile) return;

    try {
      let textToSave = "";

      if (selectedFile.isMarkdown) {
        textToSave = getMarkdown(fileContent);
        if (textToSave === currentMarkdownText.current) {
          return;
        }
        currentMarkdownText.current = textToSave;
      } else {
        textToSave = currentCodeText.current;
      }

      await writeSkillFile(selectedFile.path, textToSave);
    } catch (error) {
      console.error("保存失败:", error);
    }
  });

  const handleContentChange = useMemoizedFn((value: Descendant[]) => {
    setFileContent(value);
  });

  // 使用防抖保存代码文件
  const { run: saveCodeFile } = useDebounceFn(
    async () => {
      if (!selectedFile || selectedFile.isMarkdown) return;

      const textToSave = currentCodeText.current;

      try {
        await writeSkillFile(selectedFile.path, textToSave);
      } catch (error) {
        console.error("自动保存失败:", error);
      }
    },
    { wait: 500 },
  );

  const handleCodeChange = useMemoizedFn(
    (_editor: CodeMirrorEditorType, _change: EditorChange, code: string) => {
      currentCodeText.current = code;
      saveCodeFile();
    },
  );

  const onCodeEditorDidMount = useMemoizedFn((editor: CodeMirrorEditorType) => {
    codeEditorRef.current = editor;
  });

  const getContextMenu = useMemoizedFn(
    (file: SkillFile): MenuProps["items"] => {
      const items: MenuProps["items"] = [];

      if (file.isDirectory) {
        items.push({
          key: "create-file",
          label: "新建文件",
          icon: <AiOutlinePlus />,
          onClick: () => {
            setCreateType("file");
            setCreateParentPath(file.path);
            setCreateName("");
            setCreateModalVisible(true);
          },
        });
        items.push({
          key: "create-folder",
          label: "新建文件夹",
          icon: <AiOutlinePlus />,
          onClick: () => {
            setCreateType("folder");
            setCreateParentPath(file.path);
            setCreateName("");
            setCreateModalVisible(true);
          },
        });
      }

      items.push({
        key: "show-in-folder",
        label: "在文件系统中显示",
        icon: <AiOutlineFolderView />,
        onClick: async () => {
          try {
            await showInFolder(file.path);
          } catch (error) {
            message.error(`打开失败: ${(error as Error).message}`);
          }
        },
      });

      items.push({
        key: "rename",
        label: "重命名",
        icon: <AiOutlineEdit />,
        disabled: file.name === "SKILL.md",
        onClick: () => {
          // SKILL.md 不允许重命名
          if (file.name === "SKILL.md") {
            message.warning("SKILL.md 是必需文件，不允许重命名");
            return;
          }

          setRenamingFile(file);
          setNewName(file.name);
          setRenameModalVisible(true);
        },
      });

      items.push({
        key: "delete",
        label: "删除",
        icon: <AiOutlineDelete />,
        danger: true,
        disabled: file.name === "SKILL.md",
        onClick: () => {
          // SKILL.md 不允许删除
          if (file.name === "SKILL.md") {
            message.warning("SKILL.md 是必需文件，不允许删除");
            return;
          }

          modal.confirm({
            title: "确认删除",
            content: `确定要删除 "${file.name}" 吗？${file.isDirectory ? "这将删除文件夹及其所有内容。" : ""}`,
            okButtonProps: { danger: true },
            okText: "删除",
            cancelText: "取消",
            onOk: async () => {
              try {
                await deleteFileOrFolder(file.path);
                message.success("删除成功");
                if (selectedFile?.path === file.path) {
                  setSelectedFile(null);
                  setFileContent([]);
                  setCodeContent("");
                  currentMarkdownText.current = "";
                  currentCodeText.current = "";
                }
                await loadFiles();
              } catch (error) {
                message.error(`删除失败: ${(error as Error).message}`);
              }
            },
          });
        },
      });

      return items;
    },
  );

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 保存: Ctrl+S 或 Command+S
      if (isHotkey("mod+s", event)) {
        event.preventDefault();
        handleSaveFile();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSaveFile]);

  // 每隔 3 秒自动保存
  useRafInterval(() => {
    if (selectedFile) {
      handleSaveFile();
    }
  }, 3000);

  // 窗口关闭时保存
  useUnmount(() => {
    if (selectedFile) {
      handleSaveFile();
    }
  });

  const handleCreateConfirm = useMemoizedFn(async () => {
    if (!createName.trim()) {
      message.error("名称不能为空");
      return;
    }

    try {
      if (createType === "file") {
        await createFile(createParentPath, createName);
        message.success("文件创建成功");
      } else {
        await createDirectory(createParentPath, createName);
        message.success("文件夹创建成功");
      }
      setCreateModalVisible(false);
      setCreateName("");

      // 保存当前的展开状态
      const currentExpanded = Array.from(expanded);

      // 重新加载文件树
      await loadFiles();

      // 恢复展开状态并确保父文件夹也展开
      const newExpandedSet = new Set(currentExpanded);
      newExpandedSet.add(createParentPath);
      setExpandedPaths(Array.from(newExpandedSet));

      // 重新加载父文件夹的子文件
      await loadChildren(createParentPath);
    } catch (error) {
      message.error(`创建失败: ${(error as Error).message}`);
    }
  });

  const handleRenameConfirm = useMemoizedFn(async () => {
    if (!renamingFile || !newName.trim()) {
      message.error("名称不能为空");
      return;
    }

    try {
      await renameFileOrFolder(renamingFile.path, newName);
      message.success("重命名成功");
      setRenameModalVisible(false);
      setRenamingFile(null);
      setNewName("");

      if (selectedFile?.path === renamingFile.path) {
        setSelectedFile(null);
        setFileContent([]);
        setCodeContent("");
        currentMarkdownText.current = "";
        currentCodeText.current = "";
      }

      await loadFiles();
    } catch (error) {
      message.error(`重命名失败: ${(error as Error).message}`);
    }
  });

  const buildFileTree = (
    parentPath: string,
    level = 0,
  ): FileTreeNodeProps[] => {
    const children = fileMap.get(parentPath) || [];
    return children.map((file) => ({
      file,
      level,
      expanded,
      selectedPath: selectedFile?.path || null,
      onToggle: handleToggle,
      onSelect: handleSelectFile,
      getContextMenu,
      themeColors,
      children: file.isDirectory ? buildFileTree(file.path, level + 1) : [],
    }));
  };

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左侧文件树 */}
      <ResizeableAndHideableSidebar
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        disableResize={false}
        className="h-full overflow-hidden"
      >
        <div
          className={classNames(
            "h-full flex flex-col border-r",
            themeColors.borderClass,
          )}
        >
          {/* 标题栏 */}
          <div
            className={classNames(
              "px-4 py-3 flex justify-between items-center border-b",
              themeColors.borderClass,
            )}
          >
            <h3
              className={classNames(
                "m-0 text-base font-semibold",
                themeColors.activeTextClass,
              )}
            >
              Skills
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateSkillModalVisible(true)}
                className={classNames(
                  "p-1.5 rounded-md transition-colors",
                  themeColors.hoverClass,
                )}
                title="新建 Skill"
              >
                <AiOutlinePlus />
              </button>
              <button
                onClick={loadFiles}
                disabled={loading}
                className={classNames(
                  "p-1.5 rounded-md transition-colors",
                  themeColors.hoverClass,
                  loading && "opacity-50 cursor-not-allowed",
                )}
                title="刷新"
              >
                <AiOutlineReload className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* 文件树 */}
          <div className="flex-1 overflow-y-auto py-2">
            {skillsDir &&
              buildFileTree(skillsDir).map((props) => (
                <FileTreeNode key={props.file.path} {...props} />
              ))}
          </div>
        </div>
      </ResizeableAndHideableSidebar>

      {/* 右侧编辑器 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedFile ? (
          <>
            {/* 编辑器顶部栏 - 显示文件名 */}
            <div
              className={classNames(
                "px-6 py-3 border-b",
                themeColors.borderClass,
              )}
            >
              <div
                className={classNames(
                  "text-base font-semibold",
                  themeColors.activeTextClass,
                )}
              >
                {selectedFile.name}
              </div>
              <div
                className={classNames(
                  "text-xs mt-0.5",
                  themeColors.secondaryTextClass,
                )}
              >
                {selectedFile.path}
              </div>
            </div>

            {/* 编辑器 */}
            <div className="flex-1 border-20 border-transparent overflow-auto">
              <ErrorBoundary>
                {selectedFile.isMarkdown ? (
                  <div className="p-5 h-full">
                    <Editor
                      key={selectedFile.path}
                      ref={editorRef}
                      initValue={fileContent}
                      onChange={handleContentChange}
                      readonly={false}
                      theme={isDark ? "dark" : "light"}
                      className="h-full max-w-[720px] mx-auto"
                    />
                  </div>
                ) : (
                  <div className="h-full p-6">
                    <div className="h-full max-w-[720px] mx-auto">
                      <style>{`
                        .skill-code-editor .CodeMirror {
                          box-shadow: var(--code-block-shadow);
                          background-color: var(--code-block-bg-color);
                          height: 100%;
                          line-height: 1.8;
                          font-size: 0.9em;
                          font-family: var(--mono-font, "'Maple Mono', '楷体'");
                        }
                        .skill-code-editor .CodeMirror pre.CodeMirror-line,
                        .skill-code-editor .CodeMirror pre.CodeMirror-line-like {
                          padding: 0 1.2em;
                        }
                        .skill-code-editor .CodeMirror-gutters {
                          background-color: transparent;
                          border-right: none;
                        }
                        .skill-code-editor .CodeMirror-linenumber {
                          cursor: pointer;
                        }
                        .skill-code-editor .CodeMirror-scroll {
                          overflow-y: auto !important;
                          overflow-x: auto !important;
                        }
                      `}</style>
                      <div className="skill-code-editor h-full">
                        <CodeMirrorEditor
                          key={selectedFile.path}
                          value={codeContent}
                          options={{
                            mode: getCodeMirrorMode(selectedFile.name),
                            theme: isDark ? "blackboard" : "default",
                            viewportMargin: Infinity,
                            lineNumbers: true,
                            firstLineNumber: 1,
                            lineWrapping: true,
                            smartIndent: true,
                            cursorHeight: 1,
                            tabindex: -1,
                            extraKeys: {
                              "Shift-Tab": "indentLess",
                            },
                            indentUnit: 2,
                            tabSize: 2,
                            autoCloseBrackets: true,
                            readOnly: false,
                          }}
                          onChange={handleCodeChange}
                          editorDidMount={onCodeEditorDidMount}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </ErrorBoundary>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MdOutlineDescription
                className={classNames(
                  "text-6xl mx-auto mb-4",
                  themeColors.secondaryTextClass,
                )}
              />
              <p className={classNames("text-sm", themeColors.textClass)}>
                选择一个 Markdown 文件进行编辑
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 侧边栏折叠按钮 */}
      <AnimatePresence>
        {hideSidebar && (
          <motion.div
            className="absolute top-5 left-5 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SVG
              className="cursor-pointer"
              src={rightSidebarIcon}
              onClick={() => setHideSidebar(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 创建文件/文件夹弹窗 */}
      <CustomModal
        title={createType === "file" ? "新建文件" : "新建文件夹"}
        open={createModalVisible}
        onOk={handleCreateConfirm}
        onCancel={() => setCreateModalVisible(false)}
        okText="创建"
        cancelText="取消"
      >
        <div className="py-4">
          <div className={classNames("text-sm mb-2", themeColors.textClass)}>
            {createType === "file"
              ? "文件名（需要包含后缀，如 .md）"
              : "文件夹名"}
          </div>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateConfirm()}
            placeholder={createType === "file" ? "example.md" : "新文件夹"}
            autoFocus
            className={classNames(
              "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
              "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
              "text-gray-800 dark:text-white shadow-inner",
              "placeholder:text-gray-400 dark:placeholder:text-slate-500",
              "focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)]",
              "dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]",
            )}
          />
        </div>
      </CustomModal>

      {/* 重命名弹窗 */}
      <CustomModal
        title="重命名"
        open={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={() => setRenameModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <div className="py-4">
          <div className={classNames("text-sm mb-2", themeColors.textClass)}>
            新名称
          </div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
            placeholder="请输入新名称"
            autoFocus
            className={classNames(
              "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
              "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
              "text-gray-800 dark:text-white shadow-inner",
              "placeholder:text-gray-400 dark:placeholder:text-slate-500",
              "focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)]",
              "dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]",
            )}
          />
        </div>
      </CustomModal>

      {/* 新建 Skill 弹窗 */}
      <CreateSkillModal
        open={createSkillModalVisible}
        onClose={() => {
          setCreateSkillModalVisible(false);
          loadFiles();
        }}
      />
    </div>
  );
});

export default SkillManagement;
