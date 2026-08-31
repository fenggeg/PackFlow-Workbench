import {useEffect} from 'react'
import {registerBuildEvents} from '../services/tauri-api'
import {useAppStore} from '../store/useAppStore'

export function useEventSubscriptions() {
  const appendBuildLog = useAppStore((state) => state.appendBuildLog)
  const finishBuild = useAppStore((state) => state.finishBuild)
  const initialize = useAppStore((state) => state.initialize)

  useEffect(() => {
    void initialize()

    let cleanupBuild: (() => void) | undefined
    let disposed = false

    void registerBuildEvents(
      (event) => {
        appendBuildLog(event)
      },
      (event) => {
        finishBuild(event)
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupBuild = unlisten
    })

    return () => {
      disposed = true
      cleanupBuild?.()
    }
  }, [
    appendBuildLog,
    finishBuild,
    initialize,
  ])
}
