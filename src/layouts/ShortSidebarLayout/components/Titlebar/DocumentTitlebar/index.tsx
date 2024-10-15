import { useNavigate } from 'react-router-dom';
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined } from '@ant-design/icons';
import { FiSidebar } from "react-icons/fi";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import styles from './index.module.less';

const WhiteBoardTitlebar = () => {
  const navigate = useNavigate();

  const {
    activeDocumentId,
    activeDocumentItem,
    hideDocumentItemsList
  } = useDocumentsStore(state => ({
    activeDocumentId: state.activeDocumentId,
    activeDocumentItem: state.activeDocumentItem,
    hideDocumentItemsList: state.hideDocumentItemsList,
  }))

  return (
    <div className={styles.iconList}>
      {
        activeDocumentId && (
          <>
            <TitlebarIcon
              tip={'主页'}
              onClick={() => {
                useDocumentsStore.setState({
                  activeDocumentId: null,
                  activeDocumentItem: null,
                  hideDocumentItemsList: false
                });
                navigate(`/documents`)
              }}
            >
              <HomeOutlined />
            </TitlebarIcon>
            {
              activeDocumentItem && (
                <TitlebarIcon
                  onClick={() => {
                    useDocumentsStore.setState({
                      hideDocumentItemsList: !hideDocumentItemsList
                    })
                  }}
                >
                  <FiSidebar />
                </TitlebarIcon>
              )
            }
          </>
        )
      }
    </div>
  )
}

export default WhiteBoardTitlebar;