import styles from './index.module.less';
import {DeleteOutlined, EditOutlined, LinkOutlined, FileTextOutlined } from "@ant-design/icons";
import {Tooltip, Popconfirm} from "antd";
import useEditCardStore from "../../hooks/useEditCardStore.ts";
import useCardsManagementStore from "../../hooks/useCardsManagementStore.ts";
import {useEditorSourceValueStore} from "@/pages/Cards/hooks/useEditorSourceValueStore.ts";

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
    cards,
    deleteCard,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    deleteCard: state.deleteCard,
  }));

  const {
    openSourceView
  } = useEditorSourceValueStore((state) => ({
    openSourceView: state.open,
  }))

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

  const handleClickSource = () => {
    const card = cards.find((card) => card.id === cardId);
    if (card) {
      const content = card.content;
      openSourceView(content);
    }
  }

  const actions = [{
    icon: <EditOutlined />,
    tooltip: '编辑',
    onClick: handleClickEdit,
  }, {
    icon: <LinkOutlined />,
    tooltip: '链接管理',
    onClick: handleClickLink,
  }, {
    icon: <FileTextOutlined />,
    tooltip: '查看源码',
    onClick: handleClickSource,
  }, {
    icon: <DeleteOutlined />,
    tooltip: '删除',
    onClick: handleClickDelete,
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