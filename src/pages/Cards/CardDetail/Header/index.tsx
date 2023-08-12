import {MdOutlineArrowBackIosNew} from "react-icons/md";
import {Button, Modal, Tooltip} from "antd";
import {useNavigate} from "react-router-dom";
import { AiOutlineSave, AiOutlineLink } from "react-icons/ai";

import useEditCardStore from "@/hooks/useEditCardStore.ts";

import styles from "./index.module.less";

const Header = () => {
  const navigate = useNavigate();

  const {
    onCancel,
    onSave,
    openAddLinkModal,
  } = useEditCardStore((state) => ({
    onCancel: state.onEditingCardCancel,
    onSave: state.onEditingCardSave,
    openAddLinkModal: state.openAddLinkModal,
    readonly: state.readonly,
    setReadonly: state.setReadonly,
  }));

  const goBack = () => {
    Modal.confirm({
      title: '内容尚未保存，是否需要保存？',
      onOk: async () => {
        await onSave();
        setTimeout(() => {
          navigate(-1);
        }, 100);
      },
      onCancel: () => {
        onCancel();
        setTimeout(() => {
          navigate(-1);
        }, 100);
      },
      okText: '保存',
      cancelText: '不保存',
    })
  }

  const saveCard = async () => {
    await onSave();
    navigate(-1);
  }

  const actions = [{
    icon: <AiOutlineLink />,
    tooltip: '链接',
    onClick: () => {
      console.log('link');
      openAddLinkModal();
    }
  }, {
    icon: <AiOutlineSave />,
    tooltip: '保存',
    onClick: () => {
      console.log('save');
      saveCard();
    }
  }];

  return (
    <div className={styles.header}>
      <div className={styles.back} onClick={goBack}>
        <MdOutlineArrowBackIosNew />
      </div>
      <div className={styles.actions}>
        {
          actions.map((action, index) => (
            <Tooltip title={action.tooltip} key={index}>
              <Button
                type="text"
                icon={action.icon}
                onClick={action.onClick}
                className={styles.item}
              />
            </Tooltip>
          ))
        }
      </div>
    </div>
  )
}

export default Header;