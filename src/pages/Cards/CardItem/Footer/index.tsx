import styles from './index.module.less';
import {DeleteOutlined, EditOutlined, LinkOutlined } from "@ant-design/icons";
import {Tooltip, Popconfirm} from "antd";
import useEditCardStore from "../../hooks/useEditCardStore.ts";
import useCardsManagementStore from "../../hooks/useCardsManagementStore.ts";

interface FooterProps {
  cardId: number;
}

const Footer = (props: FooterProps) => {
  const { cardId } = props;

  const {
    openEditModal,
    openAddLinkModal,
  } = useEditCardStore((state) => ({
    openEditModal: state.openEditableModal,
    openAddLinkModal: state.openAddLinkModal,
  }));

  const {
    deleteCard,
  } = useCardsManagementStore((state) => ({
    deleteCard: state.deleteCard,
  }));

  const handleClickDetail = () => {
    openEditModal(cardId, false);
  }

  const handleClickEdit = () => {
    openEditModal(cardId, true);
  }

  const handleClickDelete = () => {
    deleteCard(cardId);
  }

  const handleClickLink = () => {
    openAddLinkModal(cardId);
  }

  const actions = [{
    icon: <EditOutlined />,
    tooltip: '编辑',
    onClick: handleClickEdit,
  }, {
    icon: <DeleteOutlined />,
    tooltip: '删除',
    onClick: handleClickDelete,
  }, {
    icon: <LinkOutlined />,
    tooltip: '链接管理',
    onClick: handleClickLink,
  }]

  return (
    <div className={styles.footer}>
      <div className={styles.actions}>
        {
          actions.map((action) => {
            return (
              <Tooltip key={action.tooltip} title={action.tooltip}>
                <Popconfirm
                  title={'确认删除'}
                  trigger={'click'}
                  open={action.tooltip === '删除' ? undefined : false}
                  onConfirm={action.onClick}
                  okText={'确认'}
                  cancelText={'取消'}
                  okButtonProps={{ danger: true }}
                  placement={'bottom'}
                >
                  <div className={styles.item} onClick={ action.tooltip !== '删除' ? action.onClick : undefined }>
                    {action.icon}
                  </div>
                </Popconfirm>
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