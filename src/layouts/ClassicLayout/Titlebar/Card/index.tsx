import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined, FileMarkdownOutlined } from "@ant-design/icons";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore";
import { Tooltip } from 'antd';
import ListOpen from '../components/ListOpen';
import FocusMode from "../components/FocusMode";

import styles from './index.module.less';

interface ICardProps {
  createCard?: () => Promise<void>;
}

const Card = (props: ICardProps) => {
  const { createCard } = props;

  const {
    leftActiveId,
    rightActiveId,
    activeSide,
  } = useCardPanelStore(state => ({
    leftActiveId: state.leftActiveCardId,
    rightActiveId: state.rightActiveCardId,
    activeSide: state.activeSide,
  }));

  const activeId = activeSide === EActiveSide.Left ? leftActiveId : rightActiveId;

  return (
    <div className={styles.iconList}>
      <ListOpen />
      <TitlebarIcon onClick={createCard}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      <Tooltip title={'导出 Markdown'} trigger={'hover'}>
        <TitlebarIcon onClick={() => {
          if (!activeId) return;
          const event = new CustomEvent('export-card-to-markdown', {
            detail: activeId,
          });
          document.dispatchEvent(event);
        }}>
          <FileMarkdownOutlined />
        </TitlebarIcon>
      </Tooltip>
    </div>
  )
}

export default Card;