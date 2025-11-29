import { List, Empty } from "antd";
import { WhiteBoardContent } from "@/types";
import CustomModal from "@/components/CustomModal";

interface SelectSubWhiteBoardModalProps {
  open: boolean;
  whiteBoardContents: WhiteBoardContent[];
  onSelect: (content: WhiteBoardContent) => void;
  onCancel: () => void;
}

const SelectSubWhiteBoardModal = (props: SelectSubWhiteBoardModalProps) => {
  const { open, whiteBoardContents, onSelect, onCancel } = props;

  return (
    <CustomModal
      title="选择子白板"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      {whiteBoardContents.length > 0 ? (
        <List
          dataSource={whiteBoardContents}
          renderItem={(item) => (
            <List.Item
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors px-4"
              onClick={() => onSelect(item)}
            >
              <div className="flex flex-col gap-1">
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-gray-500">
                  创建时间: {new Date(item.createTime).toLocaleString()}
                </div>
              </div>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="该白板没有子白板" />
      )}
    </CustomModal>
  );
};

export default SelectSubWhiteBoardModal;
