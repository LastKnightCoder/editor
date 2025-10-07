import { memo } from "react";
import { Modal, Form, Input, DatePicker } from "antd";

const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface CreateGoalModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const CreateGoalModal = memo(
  ({ visible, onCancel, onSubmit, form }: CreateGoalModalProps) => {
    return (
      <Modal
        title="新建目标"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="title"
            label="目标标题"
            rules={[{ required: true, message: "请输入目标标题" }]}
          >
            <Input placeholder="输入目标标题" />
          </Form.Item>

          <Form.Item
            name="description"
            label="目标描述"
            rules={[{ required: true, message: "请输入目标描述" }]}
          >
            <TextArea rows={4} placeholder="输入目标描述（可选）" />
          </Form.Item>

          <Form.Item name="dateRange" label="时间范围">
            <RangePicker
              style={{ width: "100%" }}
              placeholder={["开始时间（可选）", "结束时间（可选）"]}
            />
          </Form.Item>

          <Form.Item>
            <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-gray-100 dark:border-zinc-800">
              <button
                className="inline-flex items-center justify-center gap-2 px-4 h-9 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 text-sm font-medium cursor-pointer transition-all duration-200 outline-none hover:border-gray-400 dark:hover:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-800"
                onClick={onCancel}
              >
                取消
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 px-4 h-9 border-none rounded-lg bg-gradient-to-br from-indigo-500/60 to-purple-600/60 hover:from-indigo-600/70 hover:to-purple-700/70 text-white text-sm font-semibold cursor-pointer transition-all duration-200 outline-none"
                type="submit"
              >
                创建
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    );
  },
);

export default CreateGoalModal;
