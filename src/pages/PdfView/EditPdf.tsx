import PDFViewer from "@/components/PDF";
import { Pdf } from "@/types";
import { Flex } from "antd";

interface PdfContentProps {
  pdf: Pdf;
}

const PdfContent = (props: PdfContentProps) => {
  const { pdf } = props;

  if (!pdf) return null;

  return (
    <Flex style={{ height: "100%", width: "100%" }} vertical gap={0}>
      <Flex gap={"middle"} style={{ height: "100%" }}>
        <div
          style={{
            position: "relative",
            height: "100%",
            width: "100%",
            boxSizing: "border-box",
            border: "20px solid transparent",
          }}
        >
          <PDFViewer key={pdf.id} pdf={pdf} />
        </div>
      </Flex>
    </Flex>
  );
};

export default PdfContent;
