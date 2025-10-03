import { memo } from "react";
import { Modal, Form, Input, Select, InputNumber } from "antd";

import { EGoalItemType } from "@/types";
import styles from "../../index.module.less";

const { TextArea } = Input;
const { Option } = Select;

interface CreateItemModalProps {
  visible: boolean;
  isChildItem: boolean;
  onCancel: () => void;
  onSubmit: (values: any) => void;
  form: any;
}

const CreateItemModal = memo(
  ({
    visible,
    isChildItem,
    onCancel,
    onSubmit,
    form,
  }: CreateItemModalProps) => {
    return (
      <Modal
        title={isChildItem ? "添加子目标" : "添加根目标"}
        open={visible}
        onCancel={onCancel}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: "请输入标题" }]}
          >
            <Input placeholder="输入子目标标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="输入描述（可选）" />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: "请选择类型" }]}
          >
            <Select placeholder="选择子目标类型">
              <Option value={EGoalItemType.BigGoal}>大目标</Option>
              <Option value={EGoalItemType.Milestone}>里程碑</Option>
              <Option value={EGoalItemType.Progress}>进度</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.type !== currentValues.type
            }
          >
            {({ getFieldValue }) =>
              getFieldValue("type") === EGoalItemType.Progress && (
                <>
                  <Form.Item
                    name="target_value"
                    label="目标值"
                    rules={[{ required: true, message: "请输入目标值" }]}
                  >
                    <InputNumber
                      min={0}
                      style={{ width: "100%" }}
                      placeholder="输入目标值"
                    />
                  </Form.Item>
                  <Form.Item name="unit" label="单位">
                    <Input placeholder="输入单位（如：页、小时、%）" />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>

          <Form.Item>
            <div className={styles.modalActions}>
              <button className={styles.customButton} onClick={onCancel}>
                取消
              </button>
              <button
                className={`${styles.customButton} ${styles.primary}`}
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

export default CreateItemModal;
