import { Modal, Input, Upload, message as antdMessage } from "antd";
import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { PlusOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import useUploadResource from "@/hooks/useUploadResource";

interface CreateWhiteBoardModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (name: string, description: string, snapshot?: string) => Promise<void>;
}

const CreateWhiteBoardModal = (props: CreateWhiteBoardModalProps) => {
  const { open, onCancel, onOk } = props;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  const uploadResource = useUploadResource();

  const handleOk = useMemoizedFn(async () => {
    if (!name.trim()) {
      antdMessage.error("请输入白板名称");
      return;
    }

    setLoading(true);
    try {
      let snapshotUrl: string | undefined;

      // 如果有上传图片，先上传
      if (fileList.length > 0 && fileList[0].originFileObj) {
        const result = await uploadResource(fileList[0].originFileObj);
        if (result) {
          snapshotUrl = result;
        }
      }

      await onOk(name, description, snapshotUrl);

      // 成功后重置表单
      setName("");
      setDescription("");
      setFileList([]);
    } catch (error) {
      console.error("Create whiteboard failed:", error);
    } finally {
      setLoading(false);
    }
  });

  const handleCancel = useMemoizedFn(() => {
    setName("");
    setDescription("");
    setFileList([]);
    onCancel();
  });

  return (
    <Modal
      title="创建新白板"
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      confirmLoading={loading}
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2">名称 *</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入白板名称"
          />
        </div>

        <div>
          <div className="mb-2">描述</div>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="请输入白板描述"
            rows={3}
          />
        </div>

        <div>
          <div className="mb-2">封面图</div>
          <Upload
            listType="picture-card"
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList }) => setFileList(fileList.slice(-1))}
            maxCount={1}
          >
            {fileList.length === 0 && (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>上传</div>
              </div>
            )}
          </Upload>
        </div>
      </div>
    </Modal>
  );
};

export default CreateWhiteBoardModal;
