import { useState, useRef } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import {
  createCustomBlock,
  checkCustomBlockExists,
} from "@/commands/custom-block";
import useCustomBlockStore from "@/stores/useCustomBlockStore";
import Editor, { EditorRef } from "@/components/Editor";
import { getMarkdown } from "@/utils/markdown";
import { SettingInput, SettingButton } from "@/pages/Settings/components";
import useThemeColors from "@/hooks/useThemeColors";

interface CreateCustomBlockProps {
  onBack: () => void;
}

interface FormValues {
  id: string;
  name: string;
  author: string;
}

const CreateCustomBlock = ({ onBack }: CreateCustomBlockProps) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>({
    id: "",
    name: "",
    author: "",
  });
  const [errors, setErrors] = useState<Partial<FormValues>>({});
  const editorRef = useRef<EditorRef>(null);
  const [descriptionValue, setDescriptionValue] = useState<Descendant[]>([
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
  ]);
  const { refresh } = useCustomBlockStore((state) => ({
    refresh: state.refresh,
  }));
  const themeColors = useThemeColors();

  const validateId = async (value: string): Promise<string | null> => {
    if (!value) {
      return "请输入组件 ID";
    }

    // 验证 ID 格式：只允许字母、数字、连字符和下划线
    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(value)) {
      return "ID 只能包含字母、数字、连字符和下划线";
    }

    // 检查是否已存在
    const exists = await checkCustomBlockExists(value);
    if (exists) {
      return "该 ID 已被使用";
    }

    return null;
  };

  const handleSubmit = useMemoizedFn(async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证表单
    const newErrors: Partial<FormValues> = {};

    const idError = await validateId(formValues.id);
    if (idError) newErrors.id = idError;

    if (!formValues.name) newErrors.name = "请输入组件名称";
    if (!formValues.author) newErrors.author = "请输入作者名称";

    // 验证描述
    if (!editorRef.current) {
      message.error("描述编辑器未初始化");
      return;
    }
    const editor = editorRef.current.getEditor();
    const text = editor.children
      .map((n: any) => n.children?.map((c: any) => c.text).join(""))
      .join("");
    if (!text.trim()) {
      message.error("请输入组件描述");
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      // 获取描述的 Markdown 内容
      const descriptionMarkdown = getMarkdown(editor.children as Descendant[]);

      // 创建组件
      await createCustomBlock({
        ...formValues,
        description: descriptionMarkdown,
      });

      message.success("组件创建成功");
      await refresh(); // 刷新列表
      onBack(); // 返回列表
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setLoading(false);
    }
  });

  const handleFieldChange = (field: keyof FormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    // 清除该字段的错误
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-6 overflow-auto">
      <div className="mb-6">
        <button
          onClick={onBack}
          className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-sm transition-colors ${themeColors.hoverClass} ${themeColors.hoverTextClass}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          返回
        </button>
        <h2 className="text-2xl font-bold mb-1 text-gray-800 dark:text-gray-200">
          创建自定义组件
        </h2>
        <p className="text-gray-500 dark:text-gray-400">填写组件的基本信息</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        <div>
          <SettingInput
            label="组件 ID"
            value={formValues.id}
            onChange={(e) => handleFieldChange("id", e.target.value)}
            placeholder="例如: my-custom-component"
          />
          {errors.id && (
            <p className="text-red-500 text-xs mt-1">{errors.id}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            用作文件夹名称，只能包含字母、数字、连字符和下划线
          </p>
        </div>

        <div>
          <SettingInput
            label="组件名称"
            value={formValues.name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
            placeholder="例如: 我的自定义组件"
          />
          {errors.name && (
            <p className="text-red-500 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <SettingInput
            label="作者"
            value={formValues.author}
            onChange={(e) => handleFieldChange("author", e.target.value)}
            placeholder="例如: 张三"
          />
          {errors.author && (
            <p className="text-red-500 text-xs mt-1">{errors.author}</p>
          )}
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-1.5">
            描述
          </label>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900">
            <Editor
              ref={editorRef}
              initValue={descriptionValue}
              onChange={setDescriptionValue}
              readonly={false}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <SettingButton
            variant="primary"
            type="submit"
            loading={loading}
            disabled={loading}
          >
            创建组件
          </SettingButton>
          <SettingButton variant="secondary" onClick={onBack} type="button">
            取消
          </SettingButton>
        </div>
      </form>
    </div>
  );
};

export default CreateCustomBlock;
