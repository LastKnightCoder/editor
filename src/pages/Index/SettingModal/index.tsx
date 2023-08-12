import useSettingStore from "@/hooks/useSettingStore.ts";
import {Input, Modal} from "antd";

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
      <div>字体</div>
      <div>
        <div>中文字体</div>
        <Input placeholder={''} />
      </div>
      <div>
        <div>英文字体</div>
        <Input placeholder={''} />
      </div>
    </Modal>
  )
}

export default SettingModal;