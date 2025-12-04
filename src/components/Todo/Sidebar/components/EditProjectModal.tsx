import { memo } from "react";
import { type ProjectColorName } from "@/constants/project-colors";
import ProjectForm from "./ProjectForm";
import CustomModal from "@/components/CustomModal";

interface EditProjectModalProps {
  open: boolean;
  initialData: {
    id: number;
    title: string;
    color?: ProjectColorName;
  };
  onCancel: () => void;
  onUpdate: (id: number, title: string, color?: ProjectColorName) => void;
  isSystem?: boolean;
}

const EditProjectModal = memo(
  ({
    open,
    initialData,
    onCancel,
    onUpdate,
    isSystem = false,
  }: EditProjectModalProps) => {
    const handleSubmit = (title: string, color: ProjectColorName) => {
      onUpdate(initialData.id, title, color);
      onCancel();
    };

    return (
      <CustomModal
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnClose
        width={480}
        showCloseButton={false}
      >
        <ProjectForm
          title={isSystem ? "修改颜色" : "编辑项目"}
          initialData={{
            title: initialData.title,
            color: initialData.color,
          }}
          onCancel={onCancel}
          onSubmit={handleSubmit}
          submitText="保存"
          disableTitleEdit={isSystem}
        />
      </CustomModal>
    );
  },
);

EditProjectModal.displayName = "EditProjectModal";

export default EditProjectModal;
