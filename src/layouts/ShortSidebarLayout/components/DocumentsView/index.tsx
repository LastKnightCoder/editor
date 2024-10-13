import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import For from "@/components/For";
import DocumentCard from "./DocumentCard";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { FloatButton } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import EditDocumentModal from "./EditDocumentModal";

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";
import { ICreateDocument } from "@/types";

const MIN_WIDTH = 320;
const MAX_WIDTH = 400;
const GAP = 20;

const DocumentsView = () => {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [itemWidth, setItemWidth] = useState(MIN_WIDTH);
  const [createOpen, setCreateOpen] = useState(false);

  const navigate = useNavigate();

  const { documents, createDocument } = useDocumentsStore(state => ({
    documents: state.documents,
    createDocument: state.createDocument
  }));

  const handleResize = useMemoizedFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;

    const nMin = Math.ceil((width + GAP) / (MAX_WIDTH + GAP));
    const nMax = Math.floor((width + GAP) / (MIN_WIDTH + GAP));

    const n = Math.min(nMin, nMax);

    const itemWidth = (width + GAP) / n - GAP;

    setItemWidth(itemWidth);
  });

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);

    observer.observe(container);

    return () => {
      observer.disconnect();
    }
  }, [handleResize]);

  return (
    <div className={styles.container} ref={gridContainerRef} style={{ gap: GAP }}>
      <For
        data={documents}
        renderItem={document => (
          <DocumentCard
            style={{ width: itemWidth, height: 160 }}
            key={document.id}
            document={document}
          />
        )}
      />
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={'新建知识库'}
        onClick={() => {
          setCreateOpen(true);
        }}
      />
      <EditDocumentModal
        open={createOpen}
        title={'创建知识库'}
        onCancel={() => {
          setCreateOpen(false);
        }}
        onOk={async (title, desc) => {
          const newDocument: ICreateDocument = {
            title,
            desc,
            content: [],
            tags: [],
            links: [],
            children: [],
            authors: [],
            icon: '',
            bannerBg: '',
            isTop: false
          };
          const createId = await createDocument(newDocument);
          setCreateOpen(false);
          useDocumentsStore.setState({
            activeDocumentId: createId,
            activeDocumentItem: null
          })
          navigate(`/documents/${createId}`);
        }}
        defaultTitle={''}
        defaultDesc={''}
      />
    </div>
  )
}

export default DocumentsView;