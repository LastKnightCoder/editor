import { createPortal } from "react-dom";
import { X } from "lucide-react";
import LocalImage from "@/components/LocalImage";

interface LocalImagePreviewPortalProps {
  url: string;
  alt?: string;
  onClose: () => void;
}

const LocalImagePreviewPortal = ({
  url,
  alt,
  onClose,
}: LocalImagePreviewPortalProps) =>
  createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <button
        type="button"
        className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        onClick={onClose}
        aria-label="关闭预览"
      >
        <X size={20} />
      </button>
      <button
        type="button"
        className="max-h-full max-w-full cursor-zoom-out"
        onClick={onClose}
        aria-label="关闭预览"
      >
        <LocalImage
          url={url}
          alt={alt}
          className="max-h-[90vh] max-w-[92vw] object-contain"
        />
      </button>
    </div>,
    document.body,
  );

export default LocalImagePreviewPortal;
