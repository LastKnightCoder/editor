import React, { useState, useEffect } from "react";
import classnames from "classnames";
import styles from "./index.module.less";

interface CustomCheckboxProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
  readonly?: boolean;
}

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  className,
  readonly,
}) => {
  const [isChecked, setIsChecked] = useState(checked);
  const [showFireworks, setShowFireworks] = useState(false);

  useEffect(() => {
    setIsChecked(checked);
  }, [checked]);

  const handleClick = (e: React.MouseEvent) => {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();

    const newChecked = !isChecked;
    setIsChecked(newChecked);

    if (newChecked) {
      setShowFireworks(true);
      setTimeout(() => {
        setShowFireworks(false);
      }, 500);
    }

    onChange();
  };

  return (
    <div
      className={classnames(styles.checkboxContainer, className)}
      onClick={handleClick}
    >
      <svg
        className={styles.checkbox}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          className={`${styles.checkboxRect} ${isChecked ? styles.checked : ""}`}
          x="2"
          y="2"
          width="20"
          height="20"
          rx="4"
          strokeWidth="2"
        />
        {isChecked && (
          <path
            className={styles.checkmark}
            d="M7 13L10 16L17 9"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {showFireworks && (
        <div className={styles.fireworks}>
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={styles.particle}
              style={
                {
                  "--angle": `${i * 30}deg`,
                  "--delay": `${i * 0.05}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomCheckbox;
