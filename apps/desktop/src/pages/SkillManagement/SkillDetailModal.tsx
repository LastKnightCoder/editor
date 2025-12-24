import { memo, useState, useEffect } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { AiOutlineFile, AiOutlineFolder, AiOutlineSave } from "react-icons/ai";

import CustomModal from "@/components/CustomModal";
import useThemeColors from "@/hooks/useThemeColors";
import type { SkillDetail, SkillFile } from "@/types";
import { writeSkillFile, getSkillFiles } from "@/commands/skill";
import { readTextFile } from "@/commands/file";

interface SkillDetailModalProps {
  skill: SkillDetail | null;
  open: boolean;
  onClose: () => void;
}

const SkillDetailModal = memo(
  ({ skill, open, onClose }: SkillDetailModalProps) => {
    const { message } = App.useApp();
    const themeColors = useThemeColors();

    const [files, setFiles] = useState<SkillFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [saving, setSaving] = useState(false);

    // Load files when skill changes
    useEffect(() => {
      if (skill && open) {
        loadFiles();
        // Auto-select SKILL.md
        setSelectedFile(null);
        setFileContent("");
        setOriginalContent("");
      }
    }, [skill, open]);

    const loadFiles = useMemoizedFn(async () => {
      if (!skill) return;
      try {
        const fileList = await getSkillFiles(skill.folderName);
        setFiles(fileList);
        // Auto-select SKILL.md if exists
        const skillMd = fileList.find((f) => f.name === "SKILL.md");
        if (skillMd) {
          await handleSelectFile(skillMd.path);
        }
      } catch (error) {
        message.error(`加载文件列表失败: ${(error as Error).message}`);
      }
    });

    const handleSelectFile = useMemoizedFn(async (path: string) => {
      if (!path || files.find((f) => f.path === path)?.isDirectory) return;

      try {
        const content = await readTextFile(path);
        setSelectedFile(path);
        setFileContent(content);
        setOriginalContent(content);
      } catch (error) {
        message.error(`读取文件失败: ${(error as Error).message}`);
      }
    });

    const handleSave = useMemoizedFn(async () => {
      if (!selectedFile || fileContent === originalContent) return;

      setSaving(true);
      try {
        await writeSkillFile(selectedFile, fileContent);
        setOriginalContent(fileContent);
        message.success("保存成功");
      } catch (error) {
        message.error(`保存失败: ${(error as Error).message}`);
      } finally {
        setSaving(false);
      }
    });

    const hasChanges = fileContent !== originalContent;

    // Build file tree structure
    const buildTree = (files: SkillFile[]) => {
      const rootFiles: SkillFile[] = [];
      const childrenMap = new Map<string, SkillFile[]>();

      // First pass: identify direct children of skill folder
      files.forEach((file) => {
        const parentPath = file.path.substring(0, file.path.lastIndexOf("/"));
        const isRoot = skill && parentPath.endsWith(skill.folderName);

        if (isRoot) {
          rootFiles.push(file);
        } else {
          const children = childrenMap.get(parentPath) || [];
          children.push(file);
          childrenMap.set(parentPath, children);
        }
      });

      return { rootFiles, childrenMap };
    };

    const { rootFiles, childrenMap } = buildTree(files);

    const renderFileNode = (file: SkillFile, depth = 0) => {
      const isSelected = selectedFile === file.path;
      const children = childrenMap.get(file.path) || [];

      return (
        <div key={file.path}>
          <div
            className={classNames(
              "flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm",
              isSelected
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : file.isDirectory
                  ? ""
                  : themeColors.hoverClass,
              themeColors.textClass,
            )}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={() => !file.isDirectory && handleSelectFile(file.path)}
          >
            {file.isDirectory ? (
              <AiOutlineFolder className="text-amber-500" />
            ) : (
              <AiOutlineFile
                className={file.isMarkdown ? "text-blue-500" : ""}
              />
            )}
            <span className="truncate">{file.name}</span>
          </div>
          {file.isDirectory &&
            children.map((child) => renderFileNode(child, depth + 1))}
        </div>
      );
    };

    return (
      <CustomModal
        open={open}
        onCancel={onClose}
        width={900}
        title={skill?.name || "Skill 详情"}
        icon={
          <svg
            className="w-5 h-5 text-emerald-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        }
        iconBgColor="bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/30"
        footer={
          <div className="flex justify-between">
            <div
              className={classNames("text-xs", themeColors.secondaryTextClass)}
            >
              {skill?.folderName}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
              >
                关闭
              </button>
              {hasChanges && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={classNames(
                    "flex items-center gap-1.5 px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all",
                    themeColors.buttonBg,
                    themeColors.buttonTextClass,
                  )}
                >
                  <AiOutlineSave />
                  保存
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="flex h-[500px] -mx-6 -mt-2">
          {/* File tree */}
          <div
            className={classNames(
              "w-56 border-r overflow-auto p-2",
              themeColors.borderClass,
            )}
          >
            <div
              className={classNames(
                "text-xs font-medium mb-2 px-2",
                themeColors.secondaryTextClass,
              )}
            >
              文件列表
            </div>
            {rootFiles.map((file) => renderFileNode(file))}
          </div>

          {/* Content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedFile ? (
              <>
                <div
                  className={classNames(
                    "px-4 py-2 border-b text-sm",
                    themeColors.borderClass,
                    themeColors.secondaryTextClass,
                  )}
                >
                  {selectedFile.split("/").pop()}
                  {hasChanges && (
                    <span className="ml-2 text-orange-500">*</span>
                  )}
                </div>
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className={classNames(
                    "flex-1 p-4 text-sm font-mono resize-none outline-none",
                    "bg-gray-50 dark:bg-slate-950",
                    themeColors.textClass,
                  )}
                  placeholder="文件内容..."
                />
              </>
            ) : (
              <div
                className={classNames(
                  "flex-1 flex items-center justify-center",
                  themeColors.secondaryTextClass,
                )}
              >
                选择一个文件查看内容
              </div>
            )}
          </div>
        </div>
      </CustomModal>
    );
  },
);

export default SkillDetailModal;
