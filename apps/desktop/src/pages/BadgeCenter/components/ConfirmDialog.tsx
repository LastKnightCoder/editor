import { AlertTriangle } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import ModalShell from "./ModalShell";
import Button from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) => {
  const themeColors = useThemeColors();
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      widthClass="max-w-md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            danger ? "bg-red-500/15 text-red-400" : themeColors.tagBgClass
          }`}
        >
          <AlertTriangle size={18} />
        </div>
        <p className={`text-sm leading-relaxed ${themeColors.textClass}`}>
          {description}
        </p>
      </div>
    </ModalShell>
  );
};

export default ConfirmDialog;
