import { useState, memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { type ProjectColorName } from "@/constants/project-colors";
import ProjectForm from "./ProjectForm";
import CustomModal from "@/components/CustomModal";

interface SidebarHeaderProps {
  onCreate: (title: string, color?: ProjectColorName) => void;
}

const SidebarHeader = memo(({ onCreate }: SidebarHeaderProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleSubmit = useMemoizedFn(
    (title: string, color: ProjectColorName) => {
      onCreate(title, color);
      setModalOpen(false);
    },
  );

  const handleCancel = useMemoizedFn(() => {
    setModalOpen(false);
  });

  return (
    <div className="flex items-center justify-between p-5 pb-2 select-none">
      <span className="text-[16px] font-bold text-gray-600 dark:text-gray-400">
        我的项目
      </span>
      <button
        className={classNames(
          "text-base rounded-full p-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
        )}
        onClick={() => setModalOpen(true)}
        title="新建项目"
      >
        <MdAdd />
      </button>
      <CustomModal
        open={modalOpen}
        onCancel={handleCancel}
        footer={null}
        destroyOnClose
        width={480}
        showCloseButton={false}
        contentClassName="create-project-modal"
      >
        <ProjectForm
          title="添加项目"
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitText="添加"
        />
      </CustomModal>
    </div>
  );
});

SidebarHeader.displayName = "SidebarHeader";

export default SidebarHeader;
