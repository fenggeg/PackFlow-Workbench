import {create} from 'zustand'

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error'

export interface FeedbackItem {
  id: string
  tone: FeedbackTone
  title: string
  description?: string
  duration: number
}

export interface NotifyInput {
  tone?: FeedbackTone
  title: string
  description?: string
  duration?: number
}

interface FeedbackState {
  items: FeedbackItem[]
  notify: (input: NotifyInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

const DEFAULT_DURATION = 3600
const MAX_VISIBLE_ITEMS = 4

/** 定时器与 store 分离，避免组件卸载后重复触发或泄漏 */
const timers = new Map<string, ReturnType<typeof setTimeout>>()

const clearTimer = (id: string) => {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

const scheduleDismiss = (id: string, duration: number, dismiss: (id: string) => void) => {
  clearTimer(id)
  if (duration <= 0) return
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      dismiss(id)
    }, duration),
  )
}

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`

export const useFeedbackStore = create<FeedbackState>((set, get) => {
  const dismiss = (id: string) => {
    clearTimer(id)
    set((state) => ({items: state.items.filter((item) => item.id !== id)}))
  }

  return {
    items: [],

    notify: ({tone = 'info', title, description, duration = DEFAULT_DURATION}) => {
      const text = title.trim()
      if (!text) return ''

      const existing = get().items.find(
        (item) => item.title === text && item.description === description,
      )
      // 相同内容不重复堆叠，只延长展示时间
      if (existing) {
        scheduleDismiss(existing.id, duration, dismiss)
        return existing.id
      }

      const item: FeedbackItem = {id: createId(), tone, title: text, description, duration}
      set((state) => ({items: [...state.items, item].slice(-MAX_VISIBLE_ITEMS)}))
      scheduleDismiss(item.id, duration, dismiss)
      return item.id
    },

    dismiss,

    clear: () => {
      for (const id of timers.keys()) clearTimer(id)
      set({items: []})
    },
  }
})

export const notify = (input: NotifyInput) => useFeedbackStore.getState().notify(input)

export const notifySuccess = (title: string, description?: string) =>
  notify({tone: 'success', title, description})

export const notifyInfo = (title: string, description?: string) =>
  notify({tone: 'info', title, description})

export const notifyWarning = (title: string, description?: string) =>
  notify({tone: 'warning', title, description})

export const notifyError = (title: string, description?: string) =>
  notify({tone: 'error', title, description, duration: 6000})

/** 统一把 unknown 异常转成可读文案 */
export const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '操作失败，请重试。'
}
