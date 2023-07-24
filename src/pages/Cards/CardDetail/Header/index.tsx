import {MdOutlineArrowBackIosNew} from "react-icons/md";
import {Button, Tooltip} from "antd";
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
    navigate(-1);
    onCancel();
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