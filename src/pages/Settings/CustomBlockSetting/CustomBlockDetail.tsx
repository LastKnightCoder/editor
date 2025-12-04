import { useEffect, useState, useRef } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import {
  MdArrowBack,
  MdEdit,
  MdCode,
  MdDescription,
  MdDelete,
} from "react-icons/md";
import useCustomBlockStore from "@/stores/useCustomBlockStore";
import {
  getCustomBlock,
  updateCustomBlockManifest,
  deleteCustomBlock,
} from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import { getEditorText } from "@/utils/editor";
import Editor, { EditorRef } from "@/components/Editor";
import CustomBlockSourceEditor from "./CustomBlockSourceEditor";
import CustomBlockReadmeEditor from "./CustomBlockReadmeEditor";
import ConfirmDialog from "@/components/CustomModal/ConfirmDialog";
import CustomModal from "@/components/CustomModal";
import { SettingInput } from "@/pages/Settings/components";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

interface CustomBlockDetailProps {
  blockId: string;
  onBack: () => void;
}

type ViewMode = "detail" | "source" | "readme";

const CustomBlockDetail = ({ blockId, onBack }: CustomBlockDetailProps) => {
  const { message } = App.useApp();
  const [block, setBlock] = useState<ICustomBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [editManifestVisible, setEditManifestVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [formValues, setFormValues] = useState({ name: "", author: "" });
  const [errors, setErrors] = useState<{ name?: string; author?: string }>({});
  const descriptionEditorRef = useRef<EditorRef>(null);
  const [descriptionValue, setDescriptionValue] = useState<Descendant[]>([
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
  ]);
  const themeColors = useThemeColors();

  const { removeBlockFromCache } = useCustomBlockStore((state) => ({
    removeBlockFromCache: state.removeBlockFromCache,
  }));

  const loadBlock = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const data = await getCustomBlock(blockId);
      setBlock(data);
    } catch (error) {
      message.error("加载组件失败");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    loadBlock();
  }, [blockId, loadBlock]);

  const handleEditManifest = useMemoizedFn(() => {
    if (block) {
      setFormValues({
        name: block.manifest.name,
        author: block.manifest.author,
      });
      setErrors({});
      // 设置描述编辑器的内容
      const descContent: Descendant[] = block.manifest.description
        ? importFromMarkdown(block.manifest.description)
        : ([
            { type: "paragraph", children: [{ type: "formatted", text: "" }] },
          ] as Descendant[]);
      setDescriptionValue(descContent);

      // 延迟设置编辑器值，等待模态框打开
      setTimeout(() => {
        if (descriptionEditorRef.current) {
          descriptionEditorRef.current.setEditorValue(descContent);
        }
      }, 100);

      setEditManifestVisible(true);
    }
  });

  const handleManifestSubmit = useMemoizedFn(async () => {
    try {
      // 验证表单
      const newErrors: { name?: string; author?: string } = {};
      if (!formValues.name) newErrors.name = "请输入组件名称";
      if (!formValues.author) newErrors.author = "请输入作者名称";

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      // 获取描述的 Markdown 内容
      if (!descriptionEditorRef.current) {
        message.error("描述编辑器未初始化");
        return;
      }

      const editor = descriptionEditorRef.current.getEditor();
      const editorValue = editor.children as Descendant[];
      const descriptionMarkdown = getMarkdown(editorValue);

      if (!descriptionMarkdown.trim()) {
        message.error("请输入组件描述");
        return;
      }

      // 更新 manifest
      await updateCustomBlockManifest(blockId, {
        ...formValues,
        description: descriptionMarkdown,
      });

      message.success("更新成功");
      setEditManifestVisible(false);
      await loadBlock();
    } catch (error) {
      message.error("更新失败");
    }
  });

  const handleDelete = useMemoizedFn(async () => {
    try {
      await deleteCustomBlock(blockId);
      message.success("删除成功");
      removeBlockFromCache(blockId);
      onBack();
    } catch (error) {
      message.error("删除失败");
    }
  });

  const handleEditSource = useMemoizedFn(() => {
    setViewMode("source");
  });

  const handleEditReadme = useMemoizedFn(() => {
    setViewMode("readme");
  });

  const handleBackToDetail = useMemoizedFn(async () => {
    setViewMode("detail");
    await loadBlock();
  });

  // 源码编辑视图
  if (viewMode === "source" && block) {
    return (
      <CustomBlockSourceEditor block={block} onBack={handleBackToDetail} />
    );
  }

  // README 编辑视图
  if (viewMode === "readme" && block) {
    return (
      <CustomBlockReadmeEditor block={block} onBack={handleBackToDetail} />
    );
  }

  // 详情视图
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg
            className={classNames(
              "w-12 h-12 animate-spin",
              themeColors.textClass,
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              className="opacity-25"
              stroke="currentColor"
            />
            <path
              className="opacity-75"
              d="M12 3a9 9 0 0 1 9 9"
              stroke="currentColor"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className={classNames("text-sm", themeColors.secondaryTextClass)}>
            组件不存在
          </p>
          <button
            onClick={onBack}
            className={classNames(
              "px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
              themeColors.primaryButtonClass,
            )}
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const readmeContent: Descendant[] = block.readme
    ? importFromMarkdown(block.readme)
    : ([
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "暂无说明" }],
        },
      ] as Descendant[]);

  return (
    <div className="w-full h-full overflow-auto p-10 px-12">
      <div className="max-w-5xl mx-auto">
        {/* Part A: Header */}
        <button
          onClick={onBack}
          className={classNames(
            "inline-flex items-center gap-2 mb-6 px-3 py-2 rounded-lg text-sm transition-colors",
            themeColors.secondaryTextClass,
            themeColors.hoverTextClass,
            themeColors.hoverClass,
          )}
        >
          <MdArrowBack className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1
              className={classNames(
                "text-2xl font-bold m-0",
                themeColors.activeTextClass,
              )}
            >
              {block.manifest.name}
            </h1>
            {block.isLocal && (
              <span
                className={classNames(
                  "px-3 py-1 text-xs font-medium rounded-lg",
                  themeColors.tagBgClass,
                  themeColors.tagTextClass,
                )}
              >
                本地创建
              </span>
            )}
          </div>
          <p
            className={classNames(
              "text-sm m-0",
              themeColors.secondaryTextClass,
            )}
          >
            {block.manifest.description
              ? getEditorText(
                  importFromMarkdown(block.manifest.description),
                  100,
                )
              : "暂无描述"}
          </p>
        </div>

        {/* Part B: Action Bar */}
        {block.isLocal && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleEditSource}
              className={classNames(
                "px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors",
                themeColors.primaryButtonClass,
              )}
            >
              <MdCode className="w-4 h-4" />
              <span>编辑源码</span>
            </button>
            <button
              onClick={handleEditReadme}
              className={classNames(
                "px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border",
                themeColors.cardBgClass,
                themeColors.borderClass,
                themeColors.hoverClass,
                themeColors.activeTextClass,
              )}
            >
              <MdDescription className="w-4 h-4" />
              <span>编辑 README</span>
            </button>
          </div>
        )}

        {/* Part C: Content Cards */}
        {/* Card 1: Basic Info */}
        <div
          className={classNames(
            "rounded-xl border p-6 mb-6",
            themeColors.cardBgClass,
            themeColors.cardBorderClass,
          )}
        >
          <div className="flex items-center justify-between mb-5">
            <h3
              className={classNames(
                "text-lg font-semibold m-0",
                themeColors.activeTextClass,
              )}
            >
              基本信息
            </h3>
            {block.isLocal && (
              <button
                onClick={handleEditManifest}
                className={classNames(
                  "px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors",
                  themeColors.hoverClass,
                  themeColors.hoverTextClass,
                )}
              >
                <MdEdit className="w-4 h-4" />
                <span>编辑</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5 mb-6">
            <div className="flex flex-col gap-1">
              <div
                className={classNames(
                  "text-xs font-medium",
                  themeColors.secondaryTextClass,
                )}
              >
                组件 ID
              </div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                {block.id}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div
                className={classNames(
                  "text-xs font-medium",
                  themeColors.secondaryTextClass,
                )}
              >
                作者
              </div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                {block.manifest.author}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div
                className={classNames(
                  "text-xs font-medium",
                  themeColors.secondaryTextClass,
                )}
              >
                启用状态
              </div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                {block.enabled ? "已启用" : "已禁用"}
              </div>
            </div>
            {block.createTime && (
              <div className="flex flex-col gap-1">
                <div
                  className={classNames(
                    "text-xs font-medium",
                    themeColors.secondaryTextClass,
                  )}
                >
                  创建时间
                </div>
                <div
                  className={classNames(
                    "text-sm font-medium",
                    themeColors.activeTextClass,
                  )}
                >
                  {new Date(block.createTime).toLocaleString()}
                </div>
              </div>
            )}
            {block.updateTime && (
              <div className="flex flex-col gap-1">
                <div
                  className={classNames(
                    "text-xs font-medium",
                    themeColors.secondaryTextClass,
                  )}
                >
                  更新时间
                </div>
                <div
                  className={classNames(
                    "text-sm font-medium",
                    themeColors.activeTextClass,
                  )}
                >
                  {new Date(block.updateTime).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Description Section */}
          <div className="mt-6">
            <div
              className={classNames(
                "text-sm font-semibold mb-3",
                themeColors.activeTextClass,
              )}
            >
              功能描述
            </div>
            <div
              className={classNames(
                "rounded-lg border p-4",
                themeColors.inputBgClass,
                themeColors.borderClass,
              )}
            >
              <Editor
                initValue={
                  block.manifest.description
                    ? importFromMarkdown(block.manifest.description)
                    : ([
                        {
                          type: "paragraph",
                          children: [{ type: "formatted", text: "暂无描述" }],
                        },
                      ] as Descendant[])
                }
                readonly
              />
            </div>
          </div>
        </div>

        {/* Card 2: README */}
        <div
          className={classNames(
            "rounded-xl border p-6 mb-6",
            themeColors.cardBgClass,
            themeColors.cardBorderClass,
          )}
        >
          <div className="mb-5">
            <h3
              className={classNames(
                "text-lg font-semibold m-0",
                themeColors.activeTextClass,
              )}
            >
              使用说明
            </h3>
          </div>
          <div
            className={classNames(
              "rounded-lg border p-5",
              themeColors.inputBgClass,
              themeColors.borderClass,
            )}
          >
            <Editor initValue={readmeContent} readonly />
          </div>
        </div>

        {/* Footer: Delete Button */}
        {block.isLocal && (
          <div
            className={classNames(
              "mt-12 pt-6 border-t flex justify-end",
              themeColors.borderClass,
            )}
          >
            <button
              onClick={() => setDeleteConfirmVisible(true)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-transparent text-red-600 dark:text-red-400 border border-red-600 dark:border-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white"
            >
              <MdDelete className="w-4 h-4" />
              <span>删除组件</span>
            </button>
          </div>
        )}
      </div>

      {/* Edit Manifest Modal */}
      <CustomModal
        title="编辑组件信息"
        open={editManifestVisible}
        onOk={handleManifestSubmit}
        onCancel={() => setEditManifestVisible(false)}
        okText="保存"
        cancelText="取消"
        width={800}
      >
        <div className="space-y-4">
          <div>
            <SettingInput
              label="组件名称"
              value={formValues.name}
              onChange={(e) => {
                setFormValues((prev) => ({ ...prev, name: e.target.value }));
                if (errors.name)
                  setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="请输入组件名称"
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <SettingInput
              label="作者"
              value={formValues.author}
              onChange={(e) => {
                setFormValues((prev) => ({ ...prev, author: e.target.value }));
                if (errors.author)
                  setErrors((prev) => ({ ...prev, author: undefined }));
              }}
              placeholder="请输入作者名称"
            />
            {errors.author && (
              <p className="text-red-500 text-xs mt-1">{errors.author}</p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-2 text-gray-500 dark:text-slate-400">
              描述
            </label>
            <div
              className={classNames(
                "border rounded-lg p-4",
                themeColors.inputBgClass,
                themeColors.borderClass,
              )}
            >
              <Editor
                ref={descriptionEditorRef}
                initValue={descriptionValue}
                onChange={setDescriptionValue}
                readonly={false}
              />
            </div>
          </div>
        </div>
      </CustomModal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmVisible}
        title="确认删除"
        description="删除后将无法恢复，确定要删除这个组件吗？"
        onConfirm={() => {
          setDeleteConfirmVisible(false);
          handleDelete();
        }}
        onCancel={() => setDeleteConfirmVisible(false)}
        confirmText="确定"
        cancelText="取消"
        danger
      />
    </div>
  );
};

export default CustomBlockDetail;
