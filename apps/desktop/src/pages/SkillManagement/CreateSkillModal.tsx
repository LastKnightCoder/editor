import { memo, useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useSkillStore from "@/stores/useSkillStore";
import useThemeColors from "@/hooks/useThemeColors";

interface CreateSkillModalProps {
  open: boolean;
  onClose: () => void;
}

const CreateSkillModal = memo(({ open, onClose }: CreateSkillModalProps) => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();

  const { createSkill, loading } = useSkillStore(
    useShallow(state => ({
      createSkill: state.createSkill,
      loading: state.loading,
    }))
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const handleClose = useMemoizedFn(() => {
    setName("");
    setDescription("");
    setError("");
    onClose();
  });

  const handleSubmit = useMemoizedFn(async () => {
    if (!name.trim()) {
      setError("请输入 Skill 名称");
      return;
    }

    try {
      await createSkill(name.trim(), description.trim() || undefined);
      message.success("Skill 创建成功");
      handleClose();
    } catch (error) {
      message.error(`创建失败: ${(error as Error).message}`);
    }
  });

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={480}
      title="新建 Skill"
      icon={
        <svg
          className="h-5 w-5 text-[var(--th-accent)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      }
      iconBgColor="bg-[var(--th-accent-soft)] border-[var(--th-border-focus)]/30"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={classNames(
              "cursor-pointer rounded-xl border-none px-5 py-2.5 text-sm font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500",
              themeColors.buttonBg,
              themeColors.buttonTextClass
            )}
          >
            创建
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Skill 名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (error) setError("");
            }}
            placeholder="例如：代码审查"
            className={classNames(
              "w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all",
              "bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-white",
              error
                ? "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                : "border-gray-200 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700"
            )}
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
            描述
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="简短描述这个 Skill 的用途..."
            rows={3}
            className={classNames(
              "w-full resize-none rounded-xl border px-4 py-2.5 text-sm outline-none transition-all",
              "bg-gray-50 text-gray-900 dark:bg-zinc-950 dark:text-white",
              "border-gray-200 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700"
            )}
          />
        </div>

        <div
          className={classNames(
            "rounded-lg p-3 text-xs",
            "bg-gray-50 dark:bg-zinc-900",
            themeColors.secondaryTextClass
          )}
        >
          创建后将自动生成一个包含 SKILL.md 的文件夹，您可以在其中添加更多文件来丰富 Skill 内容。
        </div>
      </div>
    </CustomModal>
  );
});

export default CreateSkillModal;
