import {useEffect, useRef} from "react";

const useRenderCount = () => {
  const count = useRef<number>(1)
  useEffect(() => {
    count.current++
  })
  return count.current
}

const useDebugInfo = (componentName: string, props: any) => {
  const count = useRenderCount();
  const changedProps = useRef({});
  const previousProps = useRef(props);
  const lastRenderTimestamp = useRef(Date.now());
  const propKeys = Object.keys({ ...props, ...previousProps });

  changedProps.current = propKeys.reduce((obj, key) => {
    if (props[key] === previousProps.current[key]) return obj
    return {
      ...obj,
      [key]: { previous: previousProps.current[key], current: props[key] },
    }
  }, {});

  const info = {
    count,
    changedProps: changedProps.current,
    timeSinceLastRender: Date.now() - lastRenderTimestamp.current,
    lastRenderTimestamp: lastRenderTimestamp.current,
  }

  useEffect(() => {
    previousProps.current = props
    lastRenderTimestamp.current = Date.now()
    console.log("[debug-info]", componentName, info)
  });

  return info
}

export default useDebugInfo;
