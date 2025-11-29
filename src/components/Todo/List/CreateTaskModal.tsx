import { DatePicker, Select, InputNumber, Checkbox, Form } from "antd";
import dayjs from "dayjs";
import { TodoItemType, RecurrenceType } from "@/types";
import CustomModal from "@/components/CustomModal";

interface CreateTaskModalProps {
  visible: boolean;
  taskType: TodoItemType;
  taskTitle: string;
  onConfirm: (data: TaskCreationData) => void;
  onCancel: () => void;
}

export interface TaskCreationData {
  title: string;
  type: TodoItemType;
  dueAt?: number | null;
  startAt?: number | null;
  remindBefore?: number | null;
  recurrence?: {
    type: RecurrenceType;
    interval: number;
    weekdays?: number[];
    monthDay?: number;
    excludeHolidays: boolean;
    startDate: number;
    endDate?: number | null;
    maxOccurrences?: number | null; // 最大重复次数
  };
}

const CreateTaskModal = ({
  visible,
  taskType,
  taskTitle,
  onConfirm,
  onCancel,
}: CreateTaskModalProps) => {
  const [form] = Form.useForm();

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const data: TaskCreationData = {
        title: taskTitle,
        type: taskType,
      };

      if (taskType === "deadline") {
        data.dueAt = values.dueAt ? values.dueAt.valueOf() : null;
        data.remindBefore = values.remindBefore || null;
      } else if (taskType === "planned") {
        data.startAt = values.startAt ? values.startAt.valueOf() : null;
        data.dueAt = values.dueAt ? values.dueAt.valueOf() : null;
        data.remindBefore = values.remindBefore || null;
      } else if (taskType === "recurring") {
        data.recurrence = {
          type: values.recurrenceType,
          interval: values.interval || 1,
          weekdays: values.weekdays,
          monthDay: values.monthDay,
          excludeHolidays: values.excludeHolidays || false,
          startDate: values.startDate ? values.startDate.valueOf() : Date.now(),
          endDate:
            values.endMode === "date" && values.endDate
              ? values.endDate.valueOf()
              : null,
          maxOccurrences:
            values.endMode === "count" ? values.maxOccurrences : null,
        };
      }

      onConfirm(data);
      form.resetFields();
    } catch (error) {
      console.error("Validation failed:", error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  const getModalTitle = () => {
    switch (taskType) {
      case "deadline":
        return "设置截止任务";
      case "planned":
        return "设置计划任务";
      case "recurring":
        return "设置周期任务";
      default:
        return "创建任务";
    }
  };

  const renderFormContent = () => {
    if (taskType === "deadline") {
      return (
        <>
          <Form.Item
            name="dueAt"
            label="截止日期"
            rules={[{ required: true, message: "请设置截止日期" }]}
          >
            <DatePicker
              showTime
              placeholder="选择截止日期和时间"
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="remindBefore" label="提前提醒">
            <Select
              placeholder="不提醒"
              allowClear
              options={[
                { value: 0, label: "准时" },
                { value: 5 * 60 * 1000, label: "5分钟前" },
                { value: 10 * 60 * 1000, label: "10分钟前" },
                { value: 15 * 60 * 1000, label: "15分钟前" },
                { value: 30 * 60 * 1000, label: "30分钟前" },
                { value: 60 * 60 * 1000, label: "1小时前" },
                { value: 2 * 60 * 60 * 1000, label: "2小时前" },
                { value: 24 * 60 * 60 * 1000, label: "1天前" },
              ]}
            />
          </Form.Item>
        </>
      );
    }

    if (taskType === "planned") {
      return (
        <>
          <Form.Item
            name="startAt"
            label="开始时间"
            rules={[{ required: true, message: "请设置开始时间" }]}
          >
            <DatePicker
              showTime
              placeholder="选择开始日期和时间"
              className="w-full"
            />
          </Form.Item>
          <Form.Item
            name="dueAt"
            label="结束时间"
            rules={[{ required: true, message: "请设置结束时间" }]}
          >
            <DatePicker
              showTime
              placeholder="选择结束日期和时间"
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="remindBefore" label="提前提醒">
            <Select
              placeholder="不提醒"
              allowClear
              options={[
                { value: 0, label: "准时" },
                { value: 5 * 60 * 1000, label: "5分钟前" },
                { value: 10 * 60 * 1000, label: "10分钟前" },
                { value: 15 * 60 * 1000, label: "15分钟前" },
                { value: 30 * 60 * 1000, label: "30分钟前" },
                { value: 60 * 60 * 1000, label: "1小时前" },
                { value: 2 * 60 * 60 * 1000, label: "2小时前" },
                { value: 24 * 60 * 60 * 1000, label: "1天前" },
              ]}
            />
          </Form.Item>
        </>
      );
    }

    if (taskType === "recurring") {
      return (
        <>
          <Form.Item
            name="recurrenceType"
            label="重复类型"
            rules={[{ required: true, message: "请选择重复类型" }]}
            initialValue="daily"
          >
            <Select
              options={[
                { value: "daily", label: "每天" },
                { value: "weekdays", label: "工作日（周一至周五）" },
                { value: "weekly", label: "每周" },
                { value: "monthly", label: "每月" },
                { value: "yearly", label: "每年" },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.recurrenceType !== currentValues.recurrenceType
            }
          >
            {({ getFieldValue }) => {
              const recurrenceType = getFieldValue("recurrenceType");

              if (recurrenceType === "weekly") {
                return (
                  <Form.Item name="weekdays" label="重复日期">
                    <Checkbox.Group
                      options={[
                        { label: "周日", value: 0 },
                        { label: "周一", value: 1 },
                        { label: "周二", value: 2 },
                        { label: "周三", value: 3 },
                        { label: "周四", value: 4 },
                        { label: "周五", value: 5 },
                        { label: "周六", value: 6 },
                      ]}
                    />
                  </Form.Item>
                );
              }

              if (recurrenceType === "monthly") {
                return (
                  <Form.Item name="monthDay" label="每月几号">
                    <InputNumber
                      min={1}
                      max={31}
                      placeholder="例如: 15 表示每月15号"
                      className="w-full"
                    />
                  </Form.Item>
                );
              }

              return null;
            }}
          </Form.Item>

          <Form.Item name="interval" label="间隔" initialValue={1}>
            <InputNumber
              min={1}
              placeholder="例如: 2 表示每2天/周/月"
              className="w-full"
            />
          </Form.Item>

          <Form.Item name="startDate" label="开始日期" initialValue={dayjs()}>
            <DatePicker placeholder="选择开始日期" className="w-full" />
          </Form.Item>

          <Form.Item name="endMode" label="结束方式" initialValue="never">
            <Select
              options={[
                { value: "never", label: "永不结束" },
                { value: "date", label: "指定结束日期" },
                { value: "count", label: "指定重复次数" },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.endMode !== currentValues.endMode
            }
          >
            {({ getFieldValue }) => {
              const endMode = getFieldValue("endMode");

              if (endMode === "date") {
                return (
                  <Form.Item
                    name="endDate"
                    label="结束日期"
                    rules={[{ required: true, message: "请选择结束日期" }]}
                  >
                    <DatePicker placeholder="选择结束日期" className="w-full" />
                  </Form.Item>
                );
              }

              if (endMode === "count") {
                return (
                  <Form.Item
                    name="maxOccurrences"
                    label="重复次数"
                    rules={[
                      { required: true, message: "请输入重复次数" },
                      { type: "number", min: 1, message: "次数至少为1" },
                    ]}
                  >
                    <InputNumber
                      min={1}
                      placeholder="例如: 10 表示重复10次后结束"
                      className="w-full"
                    />
                  </Form.Item>
                );
              }

              return null;
            }}
          </Form.Item>

          <Form.Item
            name="excludeHolidays"
            valuePropName="checked"
            initialValue={false}
          >
            <Checkbox>排除节假日</Checkbox>
          </Form.Item>
        </>
      );
    }

    return null;
  };

  return (
    <CustomModal
      title={getModalTitle()}
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="创建"
      cancelText="取消"
      width={500}
    >
      <div className="mb-4">
        <div className="text-sm text-gray-500 mb-2">任务标题</div>
        <div className="text-base font-medium">{taskTitle}</div>
      </div>
      <Form form={form} layout="vertical">
        {renderFormContent()}
      </Form>
    </CustomModal>
  );
};

export default CreateTaskModal;
