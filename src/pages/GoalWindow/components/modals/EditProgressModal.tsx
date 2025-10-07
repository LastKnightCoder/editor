import { memo } from "react";
import { Modal, Form, InputNumber } from "antd";

interface EditProgressModalProps {
  visible: boolean;
  unit?: string;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const EditProgressModal = memo(
  ({ visible, unit, onCancel, onSubmit, form }: EditProgressModalProps) => {
    return (
      <Modal
        title="编辑进度记录"
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={400}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="current_value"
            label={`进度增量${unit ? ` (${unit})` : ""}`}
            rules={[
              { required: true, message: "请输入进度增量" },
              { type: "number", min: 0, message: "进度增量不能为负数" },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="输入进度增量"
              min={0}
            />
          </Form.Item>

          <div className="p-3 bg-gray-100 dark:bg-zinc-800 rounded-md mb-4 text-gray-600 dark:text-gray-400 text-xs">
            💡 修改此进度记录的增量值，总进度将会自动重新计算
          </div>

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
                保存
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    );
  },
);

export default EditProgressModal;
