import { memo } from "react";
import { motion } from "framer-motion";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";
import styles from "./index.module.less";

interface ViewOption {
  label: string;
  value: string;
}

interface ViewSwitcherProps {
  options: ViewOption[];
  value: string;
  onChange: (value: string) => void;
}

const ViewSwitcher = memo(({ options, value, onChange }: ViewSwitcherProps) => {
  const { isDark } = useTheme();
  const switcherClass = classNames(styles.viewSwitcher, {
    [styles.dark]: isDark,
  });

  return (
    <div className={switcherClass}>
      <div className={styles.optionsContainer}>
        {options.map((option) => (
          <button
            key={option.value}
            className={styles.option}
            onClick={() => onChange(option.value)}
            data-active={value === option.value}
          >
            {value === option.value && (
              <motion.div
                className={styles.activeBackground}
                layoutId="activeTab"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
              />
            )}
            <span className={styles.label}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

ViewSwitcher.displayName = "ViewSwitcher";

export default ViewSwitcher;
