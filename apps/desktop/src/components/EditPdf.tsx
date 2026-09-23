import PdfEmbedViewer, {
  type PdfAskAIContext,
  type PdfCitationTarget,
} from "@/components/PdfEmbed";
import { Pdf } from "@/types";
import { Flex } from "antd";

interface PdfContentProps {
  pdf: Pdf;
  onAskAI?: (context: PdfAskAIContext) => void;
  jumpTarget?: PdfCitationTarget | null;
}

const PdfContent = (props: PdfContentProps) => {
  const { pdf, onAskAI, jumpTarget } = props;

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
          <PdfEmbedViewer key={pdf.id} pdf={pdf} onAskAI={onAskAI} jumpTarget={jumpTarget} />
        </div>
      </Flex>
    </Flex>
  );
};

export default PdfContent;
