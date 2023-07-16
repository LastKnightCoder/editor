import styles from './index.module.less';
import {DeleteOutlined, EditOutlined, FileTextOutlined } from "@ant-design/icons";
import {Tooltip, Popconfirm, Drawer} from "antd";
import { useNavigate } from 'react-router-dom';
import useCardsManagementStore from "../../hooks/useCardsManagementStore.ts";
import {useEditorSourceValueStore} from "@/pages/Cards/hooks/useEditorSourceValueStore.ts";
import Editor from "@/components/Editor";
import {useState} from "react";

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

  const navigate = useNavigate();

  const [open, setOpen] = useState<boolean>(false);
  const card = cards.find((card) => card.id === cardId);

  const handleClickEdit = () => {
    navigate(`/cards/detail/${cardId}`);
  }

  const handleClickDetail = () => {
    setOpen(true);
  }

  const handleClickDelete = () => {
    deleteCard(cardId);
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
      <Drawer
        title="卡片详情"
        open={open}
        onClose={() => { setOpen(false) }}
        width={600}
      >
        <Editor initValue={card?.content} readonly />
      </Drawer>
    </div>
  )
}

export default Footer;