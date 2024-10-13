import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined } from '@ant-design/icons';
import styles from './index.module.less';
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";

const WhiteBoardTitlebar = () => {
  return (
    <div className={styles.iconList}>
      <TitlebarIcon
        tip={'主页'}
        onClick={() => {
          useWhiteBoardStore.setState({
            activeWhiteBoardId: null
          })
        }}
      >
        <HomeOutlined />
      </TitlebarIcon>
    </div>
  )
}

export default WhiteBoardTitlebar;