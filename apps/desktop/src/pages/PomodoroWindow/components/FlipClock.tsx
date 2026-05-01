import React, { useEffect, useRef, useState } from "react";
import "./FlipClock.css";

interface FlipDigitProps {
  digit: string;
}

const FlipDigit: React.FC<FlipDigitProps> = ({ digit }) => {
  const [current, setCurrent] = useState(digit);
  const [previous, setPrevious] = useState(digit);
  const [flipping, setFlipping] = useState(false);
  const prevRef = useRef(digit);

  useEffect(() => {
    if (digit !== prevRef.current) {
      setPrevious(prevRef.current);
      setCurrent(digit);
      setFlipping(true);
      prevRef.current = digit;

      const timer = setTimeout(() => setFlipping(false), 500);
      return () => clearTimeout(timer);
    }
  }, [digit]);

  return (
    <div className="fc-digit">
      <div className="fc-half fc-upper">
        <span className="fc-num">{current}</span>
      </div>
      <div className="fc-half fc-lower">
        <span className="fc-num">{flipping ? previous : current}</span>
      </div>
      {flipping && (
        <div className="fc-half fc-flap fc-flap-top" key={`t-${current}`}>
          <span className="fc-num">{previous}</span>
        </div>
      )}
      {flipping && (
        <div className="fc-half fc-flap fc-flap-bottom" key={`b-${current}`}>
          <span className="fc-num">{current}</span>
        </div>
      )}
    </div>
  );
};

interface FlipClockProps {
  time: string;
}

const FlipClock: React.FC<FlipClockProps> = ({ time }) => {
  const segments = time.split(":");

  return (
    <div className="fc-clock">
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className="fc-colon">
              <div className="fc-colon-dot" />
              <div className="fc-colon-dot" />
            </div>
          )}
          <div className="fc-pair">
            {seg.split("").map((ch, j) => (
              <FlipDigit key={`${i}-${j}`} digit={ch} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export default FlipClock;
