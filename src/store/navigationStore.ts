import {create} from 'zustand'

export type AppPage = 'build' | 'artifacts' | 'deployment' | 'services' | 'servers' | 'history'
export type BuildSidebarTab = 'project' | 'git' | 'modules' | 'favorites'

export type InspectorTab = 'logs' | 'diagnosis' | 'details'

export type InspectorLogSource = 'build' | 'deployment' | 'serviceOps' | 'remoteLog'

export type ServerDetailTab = 'overview' | 'terminal' | 'files' | 'logs' | 'commands'

interface NavigationState {
  activePage: AppPage
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  inspectorLogSource: InspectorLogSource
  buildSidebarTab: BuildSidebarTab
  deploymentPreselectProfileId?: string
  selectedServerId?: string
  serverDetailTab: ServerDetailTab
  setActivePage: (page: AppPage) => void
  setBuildSidebarTab: (tab: BuildSidebarTab) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
  setInspectorLogSource: (source: InspectorLogSource) => void
  openInspector: (tab?: InspectorTab) => void
  navigateToProjectSelector: () => void
  navigateToDeployment: (profileId?: string) => void
  clearDeploymentPreselect: () => void
  setSelectedServerId: (id?: string) => void
  setServerDetailTab: (tab: ServerDetailTab) => void
  navigateToServerDetail: (serverId: string, tab?: ServerDetailTab) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activePage: 'build',
  inspectorOpen: false,
  inspectorTab: 'logs',
  inspectorLogSource: 'build',
  buildSidebarTab: 'modules',
  selectedServerId: undefined,
  serverDetailTab: 'overview',
  setActivePage: (activePage) => set({activePage}),
  setBuildSidebarTab: (buildSidebarTab) => set({buildSidebarTab}),
  setInspectorOpen: (inspectorOpen) => set({inspectorOpen}),
  setInspectorTab: (inspectorTab) => set({inspectorTab}),
  setInspectorLogSource: (inspectorLogSource) => set({inspectorLogSource}),
  openInspector: (inspectorTab = 'logs') => set({inspectorOpen: true, inspectorTab}),
  navigateToProjectSelector: () => set({activePage: 'build', buildSidebarTab: 'project'}),
  navigateToDeployment: (deploymentPreselectProfileId) =>
    set({activePage: 'deployment', deploymentPreselectProfileId}),
  clearDeploymentPreselect: () => set({deploymentPreselectProfileId: undefined}),
  setSelectedServerId: (selectedServerId) => set({selectedServerId}),
  setServerDetailTab: (serverDetailTab) => set({serverDetailTab}),
  navigateToServerDetail: (serverId, tab = 'overview') =>
    set({activePage: 'servers', selectedServerId: serverId, serverDetailTab: tab}),
}))
