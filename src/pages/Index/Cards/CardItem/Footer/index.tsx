import styles from './index.module.less';
import {DeleteOutlined, EditOutlined} from "@ant-design/icons";
import {Tooltip} from "antd";
import useEditCardStore from "../../hooks/useEditCardStore.ts";
import useCardsManagementStore from "../../hooks/useCardsManagementStore.ts";

interface FooterProps {
  cardId: number;
}

const Footer = (props: FooterProps) => {
  const { cardId } = props;

  const {
    openModal,
  } = useEditCardStore((state) => ({
    openModal: state.openEditableModal,
  }));

  const {
    deleteCard,
  } = useCardsManagementStore((state) => ({
    deleteCard: state.deleteCard,
  }));

  const handleClickDetail = () => {
    openModal(cardId, false);
  }

  const handleClickEdit = () => {
    openModal(cardId, true);
  }

  const handleClickDelete = () => {
    deleteCard(cardId);
  }

  const actions = [{
    icon: <EditOutlined />,
    tooltip: '编辑',
    onClick: handleClickEdit,
  },{
    icon: <DeleteOutlined />,
    tooltip: '删除',
    onClick: handleClickDelete,
  }];

  return (
    <div className={styles.footer}>
      <div className={styles.actions}>
        {
          actions.map((action) => {
            return (
              <Tooltip key={action.tooltip} title={action.tooltip}>
                <div className={styles.item} onClick={action.onClick}>
                  {action.icon}
                </div>
              </Tooltip>
            )
          })
        }
      </div>
      <div onClick={handleClickDetail} className={styles.detail}>查看详情{'>>'}</div>
    </div>
  )
}

export default Footer;