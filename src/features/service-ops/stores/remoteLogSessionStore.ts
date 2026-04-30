import {create} from 'zustand'
import {api} from '../../../services/tauri-api'
import type {RemoteLogLineEvent, RemoteLogSession, ServiceRuntimeConfig} from '../../../types/domain'

interface RemoteLogSessionState {
  sessionsById: Record<string, RemoteLogSession>
  activeSessionId?: string
  linesBySessionId: Record<string, string[]>
  autoScrollBySessionId: Record<string, boolean>
  error?: string
  openSession: (config: ServiceRuntimeConfig, tailLines?: number) => Promise<RemoteLogSession>
  stopSession: (sessionId: string) => Promise<void>
  appendLine: (event: RemoteLogLineEvent) => void
  updateSession: (session: RemoteLogSession) => void
  clearSessionLines: (sessionId: string) => void
  setAutoScroll: (sessionId: string, autoScroll: boolean) => void
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const useRemoteLogSessionStore = create<RemoteLogSessionState>((set) => ({
  sessionsById: {},
  linesBySessionId: {},
  autoScrollBySessionId: {},

  openSession: async (config, tailLines = config.logSource?.tailLines ?? 300) => {
    try {
      const session = await api.startRemoteLogSession(config.id, tailLines)
      set((state) => ({
        activeSessionId: session.id,
        sessionsById: {...state.sessionsById, [session.id]: session},
        linesBySessionId: {...state.linesBySessionId, [session.id]: []},
        autoScrollBySessionId: {...state.autoScrollBySessionId, [session.id]: true},
        error: undefined,
      }))
      return session
    } catch (error) {
      const message = getErrorMessage(error)
      set({error: message})
      throw new Error(message)
    }
  },

  stopSession: async (sessionId) => {
    try {
      await api.stopRemoteLogSession(sessionId)
      set((state) => {
        const session = state.sessionsById[sessionId]
        if (!session) return {}
        return {
          sessionsById: {
            ...state.sessionsById,
            [sessionId]: {...session, status: 'stopped', stoppedAt: new Date().toISOString()},
          },
        }
      })
    } catch (error) {
      set({error: getErrorMessage(error)})
    }
  },

  appendLine: (event) => {
    set((state) => ({
      linesBySessionId: {
        ...state.linesBySessionId,
        [event.sessionId]: [...(state.linesBySessionId[event.sessionId] ?? []), event.line],
      },
    }))
  },

  updateSession: (session) => {
    set((state) => ({
      activeSessionId: session.id,
      sessionsById: {...state.sessionsById, [session.id]: session},
      autoScrollBySessionId: {
        ...state.autoScrollBySessionId,
        [session.id]: state.autoScrollBySessionId[session.id] ?? session.autoScroll,
      },
    }))
  },

  clearSessionLines: (sessionId) => {
    set((state) => ({
      linesBySessionId: {...state.linesBySessionId, [sessionId]: []},
    }))
  },

  setAutoScroll: (sessionId, autoScroll) => {
    set((state) => ({
      autoScrollBySessionId: {...state.autoScrollBySessionId, [sessionId]: autoScroll},
    }))
  },
}))
