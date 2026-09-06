import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface SettingModalShellProps {
  open: boolean;
  title: ReactNode;
  onCancel: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  bodyClassName?: string;
}

const SettingModalShell = ({
  open,
  title,
  onCancel,
  children,
  footer,
  widthClassName = "max-w-md",
  bodyClassName = "p-6 space-y-4",
}: SettingModalShellProps) => {
  const themeColors = useThemeColors();

  if (!open) return null;

  return createPortal(
    <div className="z-9999 fixed inset-0 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <div
        className={classNames(
          "relative w-full overflow-hidden rounded-2xl border shadow-2xl",
          themeColors.modalPanelBg,
          themeColors.borderClass,
          widthClassName
        )}
        onClick={e => e.stopPropagation()}
      >
        <div
          className={classNames(
            "flex items-center justify-between border-b px-6 py-4",
            themeColors.borderClass
          )}
        >
          <h3 className={classNames("text-lg font-semibold", themeColors.textClass)}>{title}</h3>
          <button
            onClick={onCancel}
            className={classNames(
              "rounded-lg p-2 transition-colors",
              themeColors.secondaryTextClass,
              themeColors.hoverTextClass,
              themeColors.hoverClass
            )}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className={bodyClassName}>{children}</div>

        {footer && (
          <div
            className={classNames(
              "flex items-center justify-end gap-3 border-t px-6 py-4",
              themeColors.borderClass
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SettingModalShell;
