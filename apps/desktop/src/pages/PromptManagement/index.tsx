import { memo, useMemo, useState } from "react";
import { App } from "antd";
import { AiOutlinePlus, AiOutlineEdit, AiOutlineDelete } from "react-icons/ai";
import { HiOutlineDocumentText } from "react-icons/hi";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import usePromptStore from "@/stores/usePromptStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import useThemeColors from "@/hooks/useThemeColors";
import type { Prompt } from "@/types";

const PromptManagement = memo(() => {
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();

  const {
    prompts,
    loading,
    initPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
  } = usePromptStore(
    useShallow((state) => ({
      prompts: state.prompts,
      loading: state.loading,
      initPrompts: state.initPrompts,
      createPrompt: state.createPrompt,
      updatePrompt: state.updatePrompt,
      deletePrompt: state.deletePrompt,
    })),
  );

  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    tags: "",
    content: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 在数据库连接或切换时加载 Prompt 数据
  useDatabaseChangeEffect(() => {
    initPrompts();
  });

  const openCreateModal = useMemoizedFn(() => {
    setEditingPrompt(null);
    setFormData({ name: "", tags: "", content: "" });
    setErrors({});
    setModalVisible(true);
  });

  const openEditModal = useMemoizedFn((prompt: Prompt) => {
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      tags: prompt.tags.join(", "),
      content: prompt.content,
    });
    setErrors({});
    setModalVisible(true);
  });

  const handleDelete = useMemoizedFn((prompt: Prompt) => {
    modal.confirm({
      title: "删除 Prompt",
      content: `确认删除「${prompt.name}」吗？`,
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await deletePrompt(prompt.id);
        message.success("删除成功");
      },
    });
  });

  const handleSubmit = useMemoizedFn(async () => {
    // 表单验证
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = "请输入名称";
    }
    if (!formData.content.trim()) {
      newErrors.content = "请输入 Prompt 内容";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const tags = formData.tags
      ? formData.tags
          .split(",")
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : [];
    const payload = {
      name: formData.name.trim(),
      tags,
      content: formData.content.trim(),
    };

    if (editingPrompt) {
      await updatePrompt({ id: editingPrompt.id, ...payload });
      message.success("已更新 Prompt");
    } else {
      await createPrompt(payload);
      message.success("已创建 Prompt");
    }

    setModalVisible(false);
    setEditingPrompt(null);
    setFormData({ name: "", tags: "", content: "" });
    setErrors({});
  });

  const sortedPrompts = useMemo(() => {
    return [...prompts].sort((a, b) => b.updateTime - a.updateTime);
  }, [prompts]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div
        className={classNames(
          "flex items-center justify-between px-6 py-4 border-b",
          themeColors.borderClass,
        )}
      >
        <div>
          <div
            className={classNames(
              "text-lg font-semibold",
              themeColors.activeTextClass,
            )}
          >
            Prompt 管理
          </div>
          <div
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            管理可复用的系统 Prompt，便于快速切换对话基调
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className={classNames(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
            themeColors.buttonBg,
            themeColors.buttonTextClass,
          )}
        >
          <AiOutlinePlus />
          新建 Prompt
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {sortedPrompts.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center py-12">
            <div
              className={classNames(
                "w-20 h-20 rounded-full flex items-center justify-center mb-4",
                themeColors.tagBgClass,
              )}
            >
              <HiOutlineDocumentText
                className={classNames(
                  "text-4xl",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <p className={classNames("text-sm mb-4", themeColors.textClass)}>
              还没有 Prompt
            </p>
            <button
              onClick={openCreateModal}
              className={classNames(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer",
                themeColors.buttonBg,
                themeColors.buttonTextClass,
              )}
            >
              立即创建
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {sortedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className={classNames(
                  "border rounded-2xl p-4 shadow-sm flex flex-col gap-3",
                  themeColors.cardBorderClass,
                  themeColors.cardBgClass,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={classNames(
                      "text-lg font-semibold leading-tight",
                      themeColors.activeTextClass,
                    )}
                  >
                    {prompt.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(prompt)}
                      title="编辑"
                      className={classNames(
                        "w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                        themeColors.hoverClass,
                        themeColors.textClass,
                      )}
                    >
                      <AiOutlineEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(prompt)}
                      title="删除"
                      className="w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <AiOutlineDelete />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {prompt.tags.length > 0 ? (
                    prompt.tags.map((tag) => (
                      <span
                        key={tag}
                        className={classNames(
                          "text-xs px-2 py-0.5 rounded transition-colors",
                          themeColors.tagBgClass,
                          themeColors.tagTextClass,
                        )}
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      未添加标签
                    </span>
                  )}
                </div>

                <div
                  className={classNames(
                    "text-sm",
                    themeColors.secondaryTextClass,
                  )}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                  title={prompt.content}
                >
                  {prompt.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CustomModal
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingPrompt(null);
          setFormData({ name: "", tags: "", content: "" });
          setErrors({});
        }}
        width={600}
        title={editingPrompt ? "编辑 Prompt" : "新建 Prompt"}
        icon={
          <svg
            className="w-5 h-5 text-indigo-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
          </svg>
        }
        iconBgColor="bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setModalVisible(false);
                setEditingPrompt(null);
                setFormData({ name: "", tags: "", content: "" });
                setErrors({});
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={classNames(
                "px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all shadow-[0_4px_14px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.05)] hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700",
                themeColors.buttonBg,
                themeColors.buttonTextClass,
              )}
            >
              {editingPrompt ? "保存" : "创建"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 名称字段 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) {
                  setErrors({ ...errors, name: "" });
                }
              }}
              placeholder="例如：代码助手"
              className={classNames(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
                "bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white",
                errors.name
                  ? "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                  : "border-gray-200 dark:border-slate-700 focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]",
              )}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          {/* 标签字段 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
              标签
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) =>
                setFormData({ ...formData, tags: e.target.value })
              }
              placeholder="使用英文逗号分隔多个标签"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all border bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
            />
          </div>

          {/* Prompt 内容字段 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
              Prompt 内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => {
                setFormData({ ...formData, content: e.target.value });
                if (errors.content) {
                  setErrors({ ...errors, content: "" });
                }
              }}
              rows={6}
              placeholder="输入系统 Prompt 内容"
              className={classNames(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all border resize-none",
                "bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white",
                errors.content
                  ? "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                  : "border-gray-200 dark:border-slate-700 focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]",
              )}
            />
            {errors.content && (
              <p className="mt-1 text-xs text-red-500">{errors.content}</p>
            )}
          </div>
        </div>
      </CustomModal>
    </div>
  );
});

export default PromptManagement;
