import useSettingStore from "@/hooks/useSettingStore.ts";
import {Modal} from "antd";

const SettingModal = () => {
  const {
    open,
    setOpen
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setOpen: state.setSettingModalOpen,
  }));

  const close = () => {
    setOpen(false);
  }

  return (
    <Modal
      title={null}
      open={open}
      footer={null}
      onCancel={close}
    >
      设置面板
    </Modal>
  )
}

export default SettingModal;