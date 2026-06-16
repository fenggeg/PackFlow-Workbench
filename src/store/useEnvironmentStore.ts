import {create} from 'zustand'
import {api} from '../services/tauri-api'
import {getErrorMessage} from '../utils/errors'
import type {
    BuildEnvironment,
    EnvironmentProfile,
    EnvironmentSettings,
} from '../types/domain'

interface EnvironmentState {
  environment?: BuildEnvironment
  environmentSettings?: EnvironmentSettings
  savedProjectPaths: string[]
  loadSettings: () => Promise<void>
  detectForProject: (rootPath: string) => Promise<void>
  refreshEnvironment: (projectRoot?: string) => Promise<void>
  updateEnvironment: (settings: EnvironmentSettings, projectRoot?: string) => Promise<void>
  applyEnvironmentProfile: (profileId: string, projectRoot?: string) => Promise<void>
  saveEnvironmentProfile: (name: string, projectRoot?: string) => Promise<void>
  deleteEnvironmentProfile: (profileId: string, projectRoot?: string) => Promise<void>
  saveLastProjectPath: (rootPath: string) => Promise<void>
  removeSavedProject: (rootPath: string) => Promise<void>
}

const emptyEnvironmentSettings = (): EnvironmentSettings => ({
  profiles: [],
})

const normalizeProjectPaths = (paths: string[]) =>
  paths.reduce<string[]>((result, path) => {
    const trimmed = path.trim()
    if (!trimmed || result.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      return result
    }
    return [...result, trimmed]
  }, [])

const upsertProjectPath = (paths: string[], rootPath: string) => {
  const trimmed = rootPath.trim()
  if (!trimmed) {
    return paths
  }
  return [
    trimmed,
    ...paths.filter((path) => path.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, 20)
}

const createProfileFromEnvironment = (
  name: string,
  environment?: BuildEnvironment,
  existingId?: string,
): EnvironmentProfile => ({
  id: existingId ?? crypto.randomUUID(),
  name: name.trim(),
  javaHome: environment?.javaHome,
  mavenHome: environment?.mavenHome,
  settingsXmlPath: environment?.settingsXmlPath,
  localRepoPath: environment?.localRepoPath,
  useMavenWrapper: environment?.useMavenWrapper ?? false,
  updatedAt: new Date().toISOString(),
})

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  savedProjectPaths: [],

  loadSettings: async () => {
    try {
      const settings = await api.loadEnvironmentSettings()
      const savedProjectPaths = normalizeProjectPaths([
        ...(settings.projectPaths ?? []),
        ...(settings.lastProjectPath ? [settings.lastProjectPath] : []),
      ])
      set({savedProjectPaths, environmentSettings: settings})
    } catch {
      // Browser preview or first launch — keep empty.
    }
  },

  detectForProject: async (rootPath: string) => {
    try {
      const environment = await api.detectEnvironment(rootPath)
      set({environment})
    } catch {
      // Ignore detection errors.
    }
  },

  refreshEnvironment: async (projectRoot?: string) => {
    try {
      const environment = await api.detectEnvironment(projectRoot ?? '')
      const environmentSettings = await api.loadEnvironmentSettings()
      set({environment, environmentSettings})
    } catch (error) {
      set({error: getErrorMessage(error)} as Partial<EnvironmentState>)
    }
  },

  updateEnvironment: async (settings: EnvironmentSettings, projectRoot?: string) => {
    try {
      await api.saveEnvironmentSettings({
        ...settings,
        profiles: settings.profiles ?? [],
        projectPaths: get().savedProjectPaths,
      })
      const environmentSettings = await api.loadEnvironmentSettings()
      const environment = await api.detectEnvironment(projectRoot ?? '')
      set({environment, environmentSettings})
    } catch (error) {
      set({error: getErrorMessage(error)} as Partial<EnvironmentState>)
    }
  },

  applyEnvironmentProfile: async (profileId: string, projectRoot?: string) => {
    const {environmentSettings} = get()
    const profile = environmentSettings?.profiles.find((item) => item.id === profileId)
    if (!profile) {
      return
    }

    try {
      await api.saveEnvironmentSettings({
        ...(environmentSettings ?? emptyEnvironmentSettings()),
        activeProfileId: profile.id,
        profiles: environmentSettings?.profiles ?? [],
        projectPaths: get().savedProjectPaths,
      })
      const nextSettings = await api.loadEnvironmentSettings()
      const environment = await api.detectEnvironment(projectRoot ?? '')
      set({environment, environmentSettings: nextSettings})
    } catch (error) {
      set({error: getErrorMessage(error)} as Partial<EnvironmentState>)
    }
  },

  saveEnvironmentProfile: async (name: string, projectRoot?: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      return
    }

    const {environmentSettings, environment} = get()
    const baseSettings = environmentSettings ?? emptyEnvironmentSettings()
    const existing = baseSettings.profiles.find((profile) => profile.name === trimmedName)
    const profile = createProfileFromEnvironment(trimmedName, environment, existing?.id)
    const profiles = [
      profile,
      ...baseSettings.profiles.filter((item) => item.id !== profile.id),
    ].slice(0, 12)

    try {
      await api.saveEnvironmentSettings({
        ...baseSettings,
        activeProfileId: profile.id,
        profiles,
        projectPaths: get().savedProjectPaths,
      })
      const nextSettings = await api.loadEnvironmentSettings()
      const env = await api.detectEnvironment(projectRoot ?? '')
      set({environment: env, environmentSettings: nextSettings})
    } catch (error) {
      set({error: getErrorMessage(error)} as Partial<EnvironmentState>)
    }
  },

  deleteEnvironmentProfile: async (profileId: string, projectRoot?: string) => {
    const {environmentSettings} = get()
    const profiles = (environmentSettings?.profiles ?? []).filter(
      (profile) => profile.id !== profileId,
    )
    const activeProfileId = environmentSettings?.activeProfileId === profileId
      ? undefined
      : environmentSettings?.activeProfileId

    try {
      await api.saveEnvironmentSettings({
        ...(environmentSettings ?? emptyEnvironmentSettings()),
        activeProfileId,
        profiles,
        projectPaths: get().savedProjectPaths,
      })
      const nextSettings = await api.loadEnvironmentSettings()
      const environment = await api.detectEnvironment(projectRoot ?? '')
      set({environment, environmentSettings: nextSettings})
    } catch (error) {
      set({error: getErrorMessage(error)} as Partial<EnvironmentState>)
    }
  },

  saveLastProjectPath: async (rootPath: string) => {
    set((state) => ({
      savedProjectPaths: upsertProjectPath(state.savedProjectPaths, rootPath),
    }))
    await api.saveLastProjectPath(rootPath)
  },

  removeSavedProject: async (rootPath: string) => {
    try {
      const settings = await api.removeSavedProjectPath(rootPath)
      set({
        savedProjectPaths: normalizeProjectPaths(settings.projectPaths ?? []),
      })
    } catch (error) {
      set({error: getErrorMessage(error)} as Partial<EnvironmentState>)
    }
  },
}))
