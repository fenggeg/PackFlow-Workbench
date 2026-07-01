import { create } from 'zustand'
import type {
  CommandExecution,
  CommandExecutionLogEvent,
  CommandExecutionUploadProgressEvent,
  CommandTemplate,
  SaveCommandTemplatePayload,
  StartCommandExecutionPayload,
} from '../types/domain'
import { api, registerCommandExecutionEvents } from '../services/tauri-api'

interface CommandState {
  // 模板列表
  templates: CommandTemplate[]
  templatesLoading: boolean

  // 执行列表
  executions: CommandExecution[]
  executionsLoading: boolean

  // 当前执行
  currentExecutionId: string | null
  currentExecutionLogs: string[]
  currentExecutionStatus: 'idle' | 'running' | 'success' | 'failed' | 'cancelled'

  // 上传进度
  uploadProgress: {
    percent: number
    uploaded: number
    total: number
    speed?: string
  } | null

  // 预设变量（从其他页面传递过来）
  presetVariables: Record<string, string>

  // 事件监听清理函数
  cleanupEvents: (() => void) | null
  
  // 事件注册状态
  eventsRegistering: boolean

  // 是否有后台日志连接
  hasBackgroundExecution: boolean
}

interface CommandActions {
  // 模板操作
  loadTemplates: () => Promise<void>
  saveTemplate: (payload: SaveCommandTemplatePayload) => Promise<CommandTemplate>
  deleteTemplate: (templateId: string) => Promise<void>

  // 执行操作
  loadExecutions: () => Promise<void>
  startExecution: (payload: StartCommandExecutionPayload) => Promise<string>
  cancelExecution: (executionId: string) => Promise<void>
  disconnectLog: (executionId: string) => Promise<void>
  deleteExecution: (executionId: string) => Promise<void>
  checkBackgroundExecution: (executionId: string) => Promise<void>

  // 预设变量
  setPresetVariable: (key: string, value: string) => void
  clearPresetVariables: () => void

  // 事件监听
  registerEvents: () => Promise<void>
  cleanupEventListeners: () => void

  // 重置状态
  resetCurrentExecution: () => void
}

const initialState: CommandState = {
  templates: [],
  templatesLoading: false,
  executions: [],
  executionsLoading: false,
  currentExecutionId: null,
  currentExecutionLogs: [],
  currentExecutionStatus: 'idle',
  uploadProgress: null,
  presetVariables: {},
  cleanupEvents: null,
  eventsRegistering: false,
  hasBackgroundExecution: false,
}

export const useCommandStore = create<CommandState & CommandActions>((set, get) => ({
  ...initialState,

  // 加载模板列表
  loadTemplates: async () => {
    set({ templatesLoading: true })
    try {
      const templates = await api.listCommandTemplates()
      set({ templates, templatesLoading: false })
    } catch (error) {
      console.error('加载模板列表失败:', error)
      set({ templatesLoading: false })
      throw error
    }
  },

  // 保存模板
  saveTemplate: async (payload: SaveCommandTemplatePayload) => {
    try {
      const template = await api.saveCommandTemplate(payload)
      // 重新加载模板列表
      await get().loadTemplates()
      return template
    } catch (error) {
      console.error('保存模板失败:', error)
      throw error
    }
  },

  // 删除模板
  deleteTemplate: async (templateId: string) => {
    try {
      await api.deleteCommandTemplate(templateId)
      // 重新加载模板列表
      await get().loadTemplates()
    } catch (error) {
      console.error('删除模板失败:', error)
      throw error
    }
  },

  // 加载执行列表
  loadExecutions: async () => {
    set({ executionsLoading: true })
    try {
      const executions = await api.listCommandExecutions()
      set({ executions, executionsLoading: false })
    } catch (error) {
      console.error('加载执行列表失败:', error)
      set({ executionsLoading: false })
      throw error
    }
  },

  // 开始执行
  startExecution: async (payload: StartCommandExecutionPayload) => {
    try {
      const executionId = await api.startCommandExecution(payload)
      set({
        currentExecutionId: executionId,
        currentExecutionLogs: [],
        currentExecutionStatus: 'running',
        uploadProgress: null,
        hasBackgroundExecution: false,
      })
      return executionId
    } catch (error) {
      console.error('开始执行失败:', error)
      throw error
    }
  },

  // 取消执行
  cancelExecution: async (executionId: string) => {
    try {
      await api.cancelCommandExecution(executionId)
    } catch (error) {
      console.error('取消执行失败:', error)
      throw error
    }
  },

  // 断开日志连接
  disconnectLog: async (executionId: string) => {
    try {
      await api.disconnectCommandLog(executionId)
      set({ hasBackgroundExecution: false })
    } catch (error) {
      console.error('断开日志失败:', error)
      throw error
    }
  },

  // 检查是否有后台日志连接
  checkBackgroundExecution: async (executionId: string) => {
    try {
      const has = await api.hasCommandBackgroundExecution(executionId)
      set({ hasBackgroundExecution: has })
    } catch {
      set({ hasBackgroundExecution: false })
    }
  },

  // 删除执行记录
  deleteExecution: async (executionId: string) => {
    try {
      await api.deleteCommandExecution(executionId)
      // 重新加载执行列表
      await get().loadExecutions()
    } catch (error) {
      console.error('删除执行记录失败:', error)
      throw error
    }
  },

  // 注册事件监听
  registerEvents: async () => {
    // 防止重复注册
    if (get().eventsRegistering || get().cleanupEvents) {
      return
    }
    
    set({ eventsRegistering: true })
    
    // 上传进度节流：每 100ms 最多更新一次
    let lastUploadProgressUpdate = 0
    const UPLOAD_PROGRESS_THROTTLE_MS = 100
    
    try {
      // 清理之前的监听
      get().cleanupEventListeners()

      const cleanup = await registerCommandExecutionEvents(
        // 日志事件
        (event: CommandExecutionLogEvent) => {
          const { currentExecutionId } = get()
          if (event.executionId === currentExecutionId) {
            const newLines = event.lines ?? (event.line ? [event.line] : [])
            if (newLines.length > 0) {
              set((state) => ({
                currentExecutionLogs: [...state.currentExecutionLogs, ...newLines],
              }))
            }
            if (event.disconnected) {
              set({ hasBackgroundExecution: false })
            }
          }
        },
        // 执行完成事件
        (event: CommandExecution) => {
          const { currentExecutionId } = get()
          if (event.id === currentExecutionId) {
            const newStatus = event.status as CommandState['currentExecutionStatus']
            set({
              currentExecutionStatus: newStatus,
            })
            if (newStatus === 'success' && currentExecutionId) {
              set({ hasBackgroundExecution: true })
              get().checkBackgroundExecution(currentExecutionId)
            } else {
              set({ hasBackgroundExecution: false })
            }
          }
          get().loadExecutions()
        },
        // 上传进度事件（带节流）
        (event: CommandExecutionUploadProgressEvent) => {
          const { currentExecutionId } = get()
          if (event.executionId === currentExecutionId) {
            const now = Date.now()
            // 如果是100%完成状态，立即更新；否则节流
            const isComplete = event.percent >= 100
            if (isComplete || now - lastUploadProgressUpdate >= UPLOAD_PROGRESS_THROTTLE_MS) {
              lastUploadProgressUpdate = now
              set({
                uploadProgress: {
                  percent: event.percent,
                  uploaded: event.uploaded,
                  total: event.total,
                  speed: event.speed,
                },
              })
            }
          }
        },
      )

      set({ cleanupEvents: cleanup, eventsRegistering: false })
    } catch (error) {
      set({ eventsRegistering: false })
      throw error
    }
  },

  // 清理事件监听
  cleanupEventListeners: () => {
    const { cleanupEvents } = get()
    if (cleanupEvents) {
      cleanupEvents()
      set({ cleanupEvents: null })
    }
  },

  // 设置预设变量
  setPresetVariable: (key: string, value: string) => {
    set((state) => ({
      presetVariables: { ...state.presetVariables, [key]: value },
    }))
  },

  // 清除预设变量
  clearPresetVariables: () => {
    set({ presetVariables: {} })
  },

  // 重置当前执行状态
  resetCurrentExecution: () => {
    set({
      currentExecutionId: null,
      currentExecutionLogs: [],
      currentExecutionStatus: 'idle',
      uploadProgress: null,
      hasBackgroundExecution: false,
    })
  },
}))
