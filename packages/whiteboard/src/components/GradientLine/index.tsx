interface GradientLineProps {
  gradientId: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  startColor: string;
  stopColor: string;
  strokeDasharray?: string;
  strokeWidth?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "bevel" | "miter" | "round";
}

const GradientLine = (props: GradientLineProps) => {
  const {
    gradientId,
    x1,
    x2,
    y1,
    y2,
    startColor,
    stopColor,
    strokeDasharray,
    strokeWidth = 1,
  } = props;

  return (
    <g>
      <defs>
        <linearGradient
          id={gradientId}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={stopColor} />
        </linearGradient>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
    </g>
  );
};

export default GradientLine;
