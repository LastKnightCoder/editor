import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined, FileMarkdownOutlined } from "@ant-design/icons";
import { MdCenterFocusWeak } from "react-icons/md";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore";
import { Tooltip } from 'antd';

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

  const {
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }));

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={createCard}>
        <PlusOutlined />
      </TitlebarIcon>
      <Tooltip title={'专注模式'} trigger={'hover'}>
        <TitlebarIcon active={focusMode} onClick={() => {
          useGlobalStateStore.setState({
            focusMode: !focusMode,
          });
        }}>
          <MdCenterFocusWeak />
        </TitlebarIcon>
      </Tooltip>
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