import { off, on, sendSync } from '@/electron.ts';
import { useSyncExternalStore } from 'react';
import { useMemoizedFn } from "ahooks";

const useFullScreen = () => {
  const getSnapshot = useMemoizedFn(() => {
    return sendSync('get-full-screen-status') as boolean;
  });
  
  const subscribe = useMemoizedFn((callback: () => void) => {
    on('full-screen-change', callback);
    return () => {
      off('full-screen-change', callback);
    };
  });
  
  return useSyncExternalStore(subscribe, getSnapshot);
}

export default useFullScreen;
