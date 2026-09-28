import {create} from 'zustand'
import {api} from '../services/tauri-api'
import {getErrorMessage} from '../utils/errors'
import {notifyError} from './useFeedbackStore'
import {useEnvironmentStore} from './useEnvironmentStore'

/**
 * JDK 注册表域动作。
 *
 * 注册表数据本身持久化在后端设置里（environmentSettings.jdkRegistry），
 * 唯一状态源是 useEnvironmentStore；这里只承载 JDK 注册表的四个操作。
 * 成功后重读设置写回 useEnvironmentStore，所有订阅方自动更新；
 * 失败直接弹通知 —— 之前走 appStore 包装层，错误要绕一圈才能被看到。
 */
interface JdkRegistryActions {
  scanSystemJdks: () => Promise<void>
  addJdkToRegistry: (path: string, name?: string) => Promise<void>
  removeJdkFromRegistry: (jdkId: string) => Promise<void>
  setDefaultJdk: (jdkId: string) => Promise<void>
}

/** 调用成功后统一重读设置，保证 environmentSettings 与后端一致 */
const reloadSettings = async () => {
  const settings = await api.loadEnvironmentSettings()
  useEnvironmentStore.setState({environmentSettings: settings})
}

export const useJdkRegistryStore = create<JdkRegistryActions>(() => ({
  scanSystemJdks: async () => {
    try {
      await api.scanSystemJdks()
      await reloadSettings()
    } catch (error) {
      notifyError('扫描系统 JDK 失败', getErrorMessage(error))
    }
  },

  addJdkToRegistry: async (path: string, name?: string) => {
    try {
      await api.addJdkToRegistry(path, name)
      await reloadSettings()
    } catch (error) {
      notifyError('添加 JDK 失败', getErrorMessage(error))
    }
  },

  removeJdkFromRegistry: async (jdkId: string) => {
    try {
      await api.removeJdkFromRegistry(jdkId)
      await reloadSettings()
    } catch (error) {
      notifyError('移除 JDK 失败', getErrorMessage(error))
    }
  },

  setDefaultJdk: async (jdkId: string) => {
    try {
      await api.setDefaultJdk(jdkId)
      await reloadSettings()
    } catch (error) {
      notifyError('设置默认 JDK 失败', getErrorMessage(error))
    }
  },
}))
