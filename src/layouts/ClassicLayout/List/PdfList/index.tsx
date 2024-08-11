import usePdfsStore from "@/stores/usePdfsStore.ts";
import For from "@/components/For";
import { Pdf } from "@/types";
import { App, Flex, Tag } from "antd";
import styles from './index.module.less';
import { CloseOutlined } from "@ant-design/icons";
import classnames from "classnames";

const PdfList = () => {
  const {
    pdfs,
    activePdf,
    removePdf,
  } = usePdfsStore((state) => ({
    pdfs: state.pdfs,
    activePdf: state.activePdf,
    removePdf: state.removePdf,
  }));

  const {
    modal,
  } = App.useApp();

  const onClickPdf = (pdf: Pdf) => {
    usePdfsStore.setState({
      activePdf: pdf.id === activePdf?.id ? null : pdf,
    });
  }

  const onRemovePdf = (pdf: Pdf) => {
    modal.confirm({
      title: '删除PDF',
      content: '确定删除该PDF吗？',
      onOk: async () => {
        await removePdf(pdf.id);
        if (activePdf?.id === pdf.id) {
          usePdfsStore.setState({
            activePdf: null,
          });
        }
      },
      cancelText: '取消',
      okText: '确定',
      okButtonProps: {
        danger: true,
      },
    })
  }

  return (
    <Flex className={styles.list} vertical gap={"middle"}>
      <For
        data={pdfs}
        renderItem={(pdf) => (
          <Flex className={classnames(styles.item, { [styles.active]: activePdf?.id === pdf.id })} gap={"middle"} justify={'space-between'} key={pdf.id} onClick={() => onClickPdf(pdf)}>
            <Flex gap={"small"} vertical>
              <div>{pdf.fileName}</div>
              <div>
                <Tag color={pdf.isLocal ? 'blue' : 'red'}>{pdf.isLocal ? '本地' : '远程'}</Tag>
              </div>
            </Flex>
            <CloseOutlined
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                marginRight: 2
              }}
              onClick={(e) => {
                e.stopPropagation();
                onRemovePdf(pdf);
              }}
            />
          </Flex>
        )}
      />
    </Flex>
  )
}

export default PdfList;
