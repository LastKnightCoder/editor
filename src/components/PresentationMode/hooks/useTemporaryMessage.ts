import { useState, useRef, useCallback, useEffect } from "react";

// 消息提示hook
const useTemporaryMessage = () => {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showMessage = useCallback((text: string, duration = 2000) => {
    setMessage(text);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { message, showMessage };
};

export default useTemporaryMessage;
