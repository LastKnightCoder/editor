import styles from './index.module.less';
import {DeleteOutlined, FileTextOutlined } from "@ant-design/icons";
import {Tooltip, Popconfirm} from "antd";
import useCardsManagementStore from "@/hooks/useCardsManagementStore.ts";
import useEditorSourceValueStore from "@/hooks/useEditorSourceValueStore.ts";

interface FooterProps {
  cardId: number;
}

const Footer = (props: FooterProps) => {
  const { cardId } = props;

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

  const handleClickDelete = (e: any) => {
    e.preventDefault();
    deleteCard(cardId);
  }

  const handleClickSource = (e: any) => {
    const card = cards.find((card) => card.id === cardId);
    if (card) {
      const content = card.content;
      openSourceView(content);
    }
    e.preventDefault();
  }

  const actions = [{
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
    </div>
  )
}

export default Footer;