import { useState, useRef } from "react";
import { Form, Input, Button, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import {
  createCustomBlock,
  checkCustomBlockExists,
} from "@/commands/custom-block";
import useCustomBlockStore from "@/stores/useCustomBlockStore";
import Editor, { EditorRef } from "@/components/Editor";
import { getMarkdown } from "@/utils/markdown";

interface CreateCustomBlockProps {
  onBack: () => void;
}

interface FormValues {
  id: string;
  name: string;
  author: string;
}

const CreateCustomBlock = ({ onBack }: CreateCustomBlockProps) => {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const [descriptionValue, setDescriptionValue] = useState<Descendant[]>([
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
  ]);
  const { refresh } = useCustomBlockStore((state) => ({
    refresh: state.refresh,
  }));

  const validateId = useMemoizedFn(async (_: unknown, value: string) => {
    if (!value) {
      throw new Error("请输入组件 ID");
    }

    // 验证 ID 格式：只允许字母、数字、连字符和下划线
    const idRegex = /^[a-zA-Z0-9_-]+$/;
    if (!idRegex.test(value)) {
      throw new Error("ID 只能包含字母、数字、连字符和下划线");
    }

    // 检查是否已存在
    const exists = await checkCustomBlockExists(value);
    if (exists) {
      throw new Error("该 ID 已被使用");
    }
  });

  const handleSubmit = useMemoizedFn(async (values: FormValues) => {
    if (!editorRef.current) {
      message.error("描述编辑器未初始化");
      return;
    }

    setLoading(true);
    try {
      // 获取描述的 Markdown 内容
      const editor = editorRef.current.getEditor();
      const descriptionMarkdown = getMarkdown(editor.children as Descendant[]);

      // 创建组件
      await createCustomBlock({
        ...values,
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

  return (
    <div className="w-full h-full flex flex-col p-6 overflow-auto">
      <div className="mb-6">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          className="mb-4"
        >
          返回
        </Button>
        <h2 className="text-2xl font-bold mb-1">创建自定义组件</h2>
        <p className="text-gray-500 dark:text-gray-400">填写组件的基本信息</p>
      </div>

      <div className="max-w-2xl">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="组件 ID"
            name="id"
            rules={[{ validator: validateId }]}
            extra="用作文件夹名称，只能包含字母、数字、连字符和下划线"
          >
            <Input placeholder="例如: my-custom-component" size="large" />
          </Form.Item>

          <Form.Item
            label="组件名称"
            name="name"
            rules={[{ required: true, message: "请输入组件名称" }]}
          >
            <Input placeholder="例如: 我的自定义组件" size="large" />
          </Form.Item>

          <Form.Item
            label="作者"
            name="author"
            rules={[{ required: true, message: "请输入作者名称" }]}
          >
            <Input placeholder="例如: 张三" size="large" />
          </Form.Item>

          <Form.Item
            label="描述"
            rules={[
              {
                validator: async () => {
                  if (!editorRef.current) return;
                  const editor = editorRef.current.getEditor();
                  const text = editor.children
                    .map((n: any) =>
                      n.children?.map((c: any) => c.text).join(""),
                    )
                    .join("");
                  if (!text.trim()) {
                    throw new Error("请输入组件描述");
                  }
                },
              },
            ]}
          >
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900">
              <Editor
                ref={editorRef}
                initValue={descriptionValue}
                onChange={setDescriptionValue}
                readonly={false}
              />
            </div>
          </Form.Item>

          <Form.Item>
            <div className="flex gap-3">
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                size="large"
              >
                创建组件
              </Button>
              <Button onClick={onBack} size="large">
                取消
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default CreateCustomBlock;
