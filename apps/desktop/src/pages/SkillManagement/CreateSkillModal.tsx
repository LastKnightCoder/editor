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
    useShallow((state) => ({
      createSkill: state.createSkill,
      loading: state.loading,
    })),
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
        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={classNames(
              "px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all shadow-[0_4px_14px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.05)] hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700",
              themeColors.buttonBg,
              themeColors.buttonTextClass,
            )}
          >
            创建
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
            Skill 名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            placeholder="例如：代码审查"
            className={classNames(
              "w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
              "bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white",
              error
                ? "border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                : "border-gray-200 dark:border-slate-700 focus:border-emerald-500 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]",
            )}
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简短描述这个 Skill 的用途..."
            rows={3}
            className={classNames(
              "w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all border resize-none",
              "bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white",
              "border-gray-200 dark:border-slate-700 focus:border-emerald-500 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]",
            )}
          />
        </div>

        <div
          className={classNames(
            "text-xs p-3 rounded-lg",
            "bg-gray-50 dark:bg-zinc-900",
            themeColors.secondaryTextClass,
          )}
        >
          创建后将自动生成一个包含 SKILL.md
          的文件夹，您可以在其中添加更多文件来丰富 Skill 内容。
        </div>
      </div>
    </CustomModal>
  );
});

export default CreateSkillModal;
