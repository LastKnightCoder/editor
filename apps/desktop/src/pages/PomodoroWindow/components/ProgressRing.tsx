import React from "react";
import { motion } from "motion/react";

interface ProgressRingProps {
  progress: number;
  size: number;
  strokeWidth?: number;
  trackColor?: string;
  progressColor?: string;
  glowColor?: string;
  breathing?: boolean;
  children?: React.ReactNode;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size,
  strokeWidth = 3,
  trackColor = "rgba(255, 255, 255, 0.08)",
  progressColor = "#67e8f9",
  glowColor,
  breathing = false,
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {breathing && glowColor && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: "-15%",
            background: `radial-gradient(circle, ${glowColor}, transparent 70%)`,
          }}
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        className="absolute top-0 left-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={progressColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition:
                "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.6s ease",
            }}
          />
        )}
      </svg>
      {children && (
        <div className="relative z-10 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
};

export default ProgressRing;
