import { memo } from "react";
import { Modal } from "antd";
import { type ProjectColorName } from "@/constants/project-colors";
import ProjectForm from "./ProjectForm";

interface EditProjectModalProps {
  open: boolean;
  initialData: {
    id: number;
    title: string;
    color?: ProjectColorName;
  };
  onCancel: () => void;
  onUpdate: (id: number, title: string, color?: ProjectColorName) => void;
}

const EditProjectModal = memo(
  ({ open, initialData, onCancel, onUpdate }: EditProjectModalProps) => {
    const handleSubmit = (title: string, color: ProjectColorName) => {
      onUpdate(initialData.id, title, color);
      onCancel();
    };

    return (
      <Modal
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnClose
        width={480}
        closable={false}
        className="create-project-modal"
      >
        <ProjectForm
          title="编辑项目"
          initialData={{
            title: initialData.title,
            color: initialData.color,
          }}
          onCancel={onCancel}
          onSubmit={handleSubmit}
          submitText="保存"
        />
      </Modal>
    );
  },
);

EditProjectModal.displayName = "EditProjectModal";

export default EditProjectModal;
