import { useState, useEffect } from "react";
import { Whiteboard, WhiteboardContent } from "@/types";
import SelectWhiteboardModal from "@/components/SelectWhiteboardModal";
import { getAllWhiteboards } from "@/commands/white-board";

import { useWhiteboardEmbedI18n } from "../../i18n";

interface ISelectWhiteboardContentModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (whiteboardContent: WhiteboardContent, whiteboard: Whiteboard) => Promise<void>;
}

const SelectWhiteboardContentModal = (props: ISelectWhiteboardContentModalProps) => {
  const { t } = useWhiteboardEmbedI18n();
  const { open, onCancel, onOk } = props;
  const [loading, setLoading] = useState(false);
  const [allWhiteboards, setAllWhiteboards] = useState<Whiteboard[]>([]);
  const [selectedWhiteboards, setSelectedWhiteboards] = useState<Whiteboard[]>([]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getAllWhiteboards()
        .then(whiteboards => {
          setAllWhiteboards(whiteboards);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open]);

  const handleOk = async (whiteboards: Whiteboard[]) => {
    if (whiteboards.length === 0) return;
    const whiteboard = whiteboards[0];
    const activeContent =
      whiteboard.whiteboardContentList.find(
        item => item.id === whiteboard.activeWhiteboardContentId
      ) ?? whiteboard.whiteboardContentList[0];
    if (!activeContent) {
      return;
    }
    const whiteboardContent: WhiteboardContent = {
      id: activeContent.id,
      name: activeContent.name,
      imgUrl: activeContent.imgUrl || "",
      createTime: activeContent.createTime,
      updateTime: activeContent.updateTime,
      data: activeContent.data,
    };
    await onOk(whiteboardContent, whiteboard);
    setSelectedWhiteboards([]);
  };

  const handleCancel = () => {
    setSelectedWhiteboards([]);
    onCancel();
  };

  return (
    <SelectWhiteboardModal
      open={open}
      title={t("select.title")}
      multiple={false}
      loading={loading}
      onCancel={handleCancel}
      onChange={setSelectedWhiteboards}
      onOk={handleOk}
      selectedWhiteboards={selectedWhiteboards}
      allWhiteboards={allWhiteboards}
    />
  );
};

export default SelectWhiteboardContentModal;
