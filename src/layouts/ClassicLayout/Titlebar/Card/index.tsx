import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined } from "@ant-design/icons";
import { MdCenterFocusWeak } from "react-icons/md";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import { Tooltip } from 'antd';

import styles from './index.module.less';

interface ICardProps {
  createCard?: () => Promise<void>;
}

const Card = (props: ICardProps) => {
  const { createCard } = props;

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
    </div>
  )
}

export default Card;