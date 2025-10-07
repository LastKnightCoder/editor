import { memo } from "react";
import { Modal, Form, Input, InputNumber } from "antd";

import { EGoalItemType } from "@/types";

const { TextArea } = Input;

interface ProgressModalProps {
  visible: boolean;
  itemType: EGoalItemType | null;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const ProgressModal = memo(
  ({ visible, itemType, onCancel, onSubmit, form }: ProgressModalProps) => {
    return (
      <Modal
        title={"添加进度"}
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入进度记录标题" }]}
          >
            <Input placeholder="输入进度记录标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea
              rows={3}
              placeholder={
                itemType === EGoalItemType.Milestone
                  ? "输入里程碑的进度记录描述"
                  : "输入进度描述"
              }
            />
          </Form.Item>

          {itemType === EGoalItemType.Progress && (
            <Form.Item
              name="progress_delta"
              label="进度增量"
              rules={[{ required: true, message: "请输入进度增量" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                placeholder="输入进度增量"
              />
            </Form.Item>
          )}

          {itemType === EGoalItemType.Milestone && (
            <div className="p-3 bg-gray-100 dark:bg-zinc-800 rounded-md mb-4 text-gray-600 dark:text-gray-400 text-xs">
              💡 里程碑的进度记录不会影响完成状态，请使用右键菜单手动标记完成。
            </div>
          )}

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
                添加记录
              </button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    );
  },
);

export default ProgressModal;
