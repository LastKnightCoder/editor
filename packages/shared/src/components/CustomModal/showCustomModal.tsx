import { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import CustomModal, { CustomModalProps } from "./index";

export interface ShowCustomModalConfig extends Omit<
  CustomModalProps,
  "open" | "onCancel" | "children"
> {
  content: ReactNode;
  onCancel?: () => void;
}

export interface ImperativeModalInstance {
  destroy: () => void;
  update: (config: Partial<ShowCustomModalConfig>) => void;
}

const showCustomModal = (
  config: ShowCustomModalConfig,
): ImperativeModalInstance => {
  if (typeof document === "undefined") {
    throw new Error("showCustomModal can only be used in the browser");
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let currentConfig: ShowCustomModalConfig = { ...config };
  let destroyed = false;

  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    root.unmount();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };

  const render = (cfg: ShowCustomModalConfig & { open: boolean }) => {
    const { content, onCancel, afterClose, ...rest } = cfg;
    root.render(
      <CustomModal
        {...rest}
        open={cfg.open}
        onCancel={() => {
          onCancel?.();
          render({ ...currentConfig, open: false });
        }}
        afterClose={() => {
          afterClose?.();
          cleanup();
        }}
      >
        {content}
      </CustomModal>,
    );
  };

  render({ ...currentConfig, open: true });

  return {
    destroy: () => {
      if (destroyed) return;
      render({ ...currentConfig, open: false });
    },
    update: (nextConfig) => {
      if (destroyed) return;
      currentConfig = { ...currentConfig, ...nextConfig };
      render({ ...currentConfig, open: true });
    },
  };
};

export default showCustomModal;
