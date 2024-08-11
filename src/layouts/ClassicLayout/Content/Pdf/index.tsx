import PDFViewer from "@/components/PDF";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import { Flex } from 'antd';

const PdfContent = () => {
  const {
    activePdf,
  } = usePdfsStore(state => ({
    activePdf: state.activePdf,
  }));

  if (!activePdf) return null;

  return (
    <Flex style={{ height: '100%', width: '100%' }} vertical gap={0}>
      <Flex gap={"middle"} style={{ height: '100%' }}>
        {/*<div style={{ width: '200px' }}>*/}
        {/*  Sidebar*/}
        {/*</div>*/}
        <div style={{ position: 'relative', height: '100%', width: '100%', boxSizing: 'border-box', border: '20px solid transparent' }}>
          <PDFViewer
            key={activePdf.id}
            pdf={activePdf}
          />
        </div>
      </Flex>
    </Flex>
  );
}

export default PdfContent;