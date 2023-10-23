import { useEffect } from 'react'
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'
import { message } from '@tauri-apps/api/dialog'

const useUpdate = () => {
  useEffect(() => {
    window.checkUpdate = async () => {
      try {
        const { shouldUpdate, manifest } = await checkUpdate()

        if (shouldUpdate) {
          console.log(
            `Installing update ${manifest?.version}, ${manifest?.date}, ${manifest?.body}`
          )

          await installUpdate()
          await relaunch()
        } else {
          message('已是最新版本');
        }
      } catch (error) {
        // @ts-ignore
        message(error);
        console.error(error)
      }
    }
  }, [])
}

export default useUpdate;