import { useNavigate } from 'react-router-dom';
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined } from '@ant-design/icons';
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import styles from './index.module.less';

const WhiteBoardTitlebar = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.iconList}>
      <TitlebarIcon
        tip={'主页'}
        onClick={() => {
          useDocumentsStore.setState({
            activeDocumentId: null,
            activeDocumentItem: null
          });
          navigate(`/documents`)
        }}
      >
        <HomeOutlined />
      </TitlebarIcon>
    </div>
  )
}

export default WhiteBoardTitlebar;