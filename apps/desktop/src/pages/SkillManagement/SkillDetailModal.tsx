import { memo, useState, useEffect, useMemo } from "react";
import { App, Input, Tabs } from "antd";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { AiOutlineFile, AiOutlineFolder, AiOutlineSave } from "react-icons/ai";

import CustomModal from "@/components/CustomModal";
import useThemeColors from "@/hooks/useThemeColors";
import type { SkillDetail, SkillFile } from "@/types";
import { writeSkillFile, getSkillFiles } from "@/commands/skill";
import { readTextFile } from "@/commands/file";
import {
  parseSkillFrontMatter,
  serializeSkillFrontMatter,
} from "@/utils/skill-frontmatter";
import useSkillStore from "@/stores/useSkillStore";

const { TextArea } = Input;

interface SkillDetailModalProps {
  skill: SkillDetail | null;
  open: boolean;
  onClose: () => void;
}

const SkillDetailModal = memo(
  ({ skill, open, onClose }: SkillDetailModalProps) => {
    const { message } = App.useApp();
    const themeColors = useThemeColors();
    const loadSkills = useSkillStore((state) => state.loadSkills);

    const [files, setFiles] = useState<SkillFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<"meta" | "file">("meta");

    // 元信息状态（只有 description，name 从文件夹名称获取）
    const [description, setDescription] = useState("");
    const [originalDescription, setOriginalDescription] = useState("");
    const [body, setBody] = useState("");

    // Load files when skill changes
    useEffect(() => {
      if (skill && open) {
        loadFiles();
        setSelectedFile(null);
        setFileContent("");
        setOriginalContent("");
        setActiveTab("meta");
      }
    }, [skill, open]);

    const loadFiles = useMemoizedFn(async () => {
      if (!skill) return;
      try {
        const fileList = await getSkillFiles(skill.folderName);
        setFiles(fileList);
        // 加载 SKILL.md 并解析元信息
        const skillMd = fileList.find((f) => f.name === "SKILL.md");
        if (skillMd) {
          const content = await readTextFile(skillMd.path);
          const { description: parsedDesc, body: parsedBody } =
            parseSkillFrontMatter(content);
          setDescription(parsedDesc);
          setOriginalDescription(parsedDesc);
          setBody(parsedBody);
          setSelectedFile(skillMd.path);
          setFileContent(content);
          setOriginalContent(content);
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

        // 如果选择的是 SKILL.md，解析元信息
        if (path.endsWith("SKILL.md")) {
          const { description: parsedDesc, body: parsedBody } =
            parseSkillFrontMatter(content);
          setDescription(parsedDesc);
          setOriginalDescription(parsedDesc);
          setBody(parsedBody);
        }
      } catch (error) {
        message.error(`读取文件失败: ${(error as Error).message}`);
      }
    });

    // 保存元信息
    const handleSaveMeta = useMemoizedFn(async () => {
      if (!selectedFile?.endsWith("SKILL.md")) return;

      setSaving(true);
      try {
        const newContent = serializeSkillFrontMatter(description, body);
        await writeSkillFile(selectedFile, newContent);
        setOriginalDescription(description);
        setFileContent(newContent);
        setOriginalContent(newContent);
        // 刷新 skills 列表以更新元信息
        await loadSkills();
        message.success("元信息保存成功");
      } catch (error) {
        message.error(`保存失败: ${(error as Error).message}`);
      } finally {
        setSaving(false);
      }
    });

    // 保存文件内容
    const handleSaveFile = useMemoizedFn(async () => {
      if (!selectedFile || fileContent === originalContent) return;

      setSaving(true);
      try {
        await writeSkillFile(selectedFile, fileContent);
        setOriginalContent(fileContent);

        // 如果保存的是 SKILL.md，重新解析元信息
        if (selectedFile.endsWith("SKILL.md")) {
          const { description: parsedDesc, body: parsedBody } =
            parseSkillFrontMatter(fileContent);
          setDescription(parsedDesc);
          setOriginalDescription(parsedDesc);
          setBody(parsedBody);
          // 刷新 skills 列表
          await loadSkills();
        }

        message.success("保存成功");
      } catch (error) {
        message.error(`保存失败: ${(error as Error).message}`);
      } finally {
        setSaving(false);
      }
    });

    // 检查是否有未保存的更改
    const hasMetaChanges = useMemo(() => {
      return description !== originalDescription;
    }, [description, originalDescription]);

    const hasFileChanges = fileContent !== originalContent;
    const hasChanges = activeTab === "meta" ? hasMetaChanges : hasFileChanges;

    const handleSave = activeTab === "meta" ? handleSaveMeta : handleSaveFile;

    // Build file tree structure
    const buildTree = (files: SkillFile[]) => {
      const rootFiles: SkillFile[] = [];
      const childrenMap = new Map<string, SkillFile[]>();

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

    // 渲染元信息编辑面板
    const renderMetaEditor = () => (
      <div className="p-4 space-y-4 overflow-auto h-full">
        <div>
          <label
            className={classNames(
              "block text-sm font-medium mb-1.5",
              themeColors.textClass,
            )}
          >
            名称
          </label>
          <Input
            value={skill?.folderName || ""}
            disabled
            className="bg-gray-50 dark:bg-zinc-800"
          />
          <p
            className={classNames(
              "text-xs mt-1",
              themeColors.secondaryTextClass,
            )}
          >
            名称与文件夹名称保持一致，不可修改
          </p>
        </div>

        <div>
          <label
            className={classNames(
              "block text-sm font-medium mb-1.5",
              themeColors.textClass,
            )}
          >
            描述
          </label>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简短描述这个 Skill 的用途，此描述会注入到聊天系统的提示词中"
            rows={4}
          />
        </div>
      </div>
    );

    // 渲染文件编辑面板
    const renderFileEditor = () => (
      <>
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
              {hasFileChanges && (
                <span className="ml-2 text-orange-500">*</span>
              )}
            </div>
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className={classNames(
                "flex-1 p-4 text-sm font-mono resize-none outline-none",
                "bg-gray-50 dark:bg-zinc-950",
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
      </>
    );

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
                className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
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

          {/* Content area with tabs */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as "meta" | "file")}
              className="px-4"
              items={[
                {
                  key: "meta",
                  label: (
                    <span className="flex items-center gap-1.5">
                      元信息
                      {hasMetaChanges && (
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                      )}
                    </span>
                  ),
                },
                {
                  key: "file",
                  label: (
                    <span className="flex items-center gap-1.5">
                      文件编辑
                      {hasFileChanges && (
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                      )}
                    </span>
                  ),
                },
              ]}
            />
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab === "meta" ? renderMetaEditor() : renderFileEditor()}
            </div>
          </div>
        </div>
      </CustomModal>
    );
  },
);

SkillDetailModal.displayName = "SkillDetailModal";

export default SkillDetailModal;
