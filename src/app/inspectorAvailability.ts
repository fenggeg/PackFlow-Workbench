import {useAppStore} from '@/store/useAppStore'
import {useNavigationStore} from '@/store/navigationStore'

/**
 * 检查器是否可用：仅构建页，或已经产生构建上下文（日志/诊断/非空闲状态）时展示。
 * 顶栏开关与抽屉本体共用同一判定，避免两者状态不一致。
 */
export const useInspectorAvailable = () => {
  const activePage = useNavigationStore((state) => state.activePage)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const logsCount = useAppStore((state) => state.logs.length)
  const hasDiagnosis = useAppStore((state) => Boolean(state.diagnosis))

  return activePage === 'build' || buildStatus !== 'IDLE' || logsCount > 0 || hasDiagnosis
}
