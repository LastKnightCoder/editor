import { useState } from "react";
import { Globe } from "lucide-react";

import { useBoard } from "@tau/whiteboard";
import { ChromeButton } from "@tau/whiteboard";
import WebviewSelectorModal from "../../WebviewSelectorModal";

const Webview = () => {
  const board = useBoard();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ChromeButton label="网页" onClick={() => setOpen(true)}>
        <Globe strokeWidth={1.75} />
      </ChromeButton>
      <WebviewSelectorModal open={open} onClose={() => setOpen(false)} board={board} />
    </>
  );
};

export default Webview;
