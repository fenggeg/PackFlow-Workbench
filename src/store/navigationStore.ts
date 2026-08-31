import {create} from 'zustand'

export type AppPage = 'dashboard' | 'build' | 'artifacts' | 'history'
export type BuildSidebarTab = 'project' | 'git' | 'modules' | 'conflicts' | 'favorites'

export type InspectorTab = 'logs' | 'diagnosis' | 'details'

export type InspectorLogSource = 'build'

interface NavigationState {
  activePage: AppPage
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  inspectorLogSource: InspectorLogSource
  buildSidebarTab: BuildSidebarTab
  setActivePage: (page: AppPage) => void
  setBuildSidebarTab: (tab: BuildSidebarTab) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
  setInspectorLogSource: (source: InspectorLogSource) => void
  openInspector: (tab?: InspectorTab) => void
  navigateToProjectSelector: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activePage: 'dashboard',
  inspectorOpen: false,
  inspectorTab: 'logs',
  inspectorLogSource: 'build',
  buildSidebarTab: 'modules',
  setActivePage: (activePage) => set({activePage}),
  setBuildSidebarTab: (buildSidebarTab) => set({buildSidebarTab}),
  setInspectorOpen: (inspectorOpen) => set({inspectorOpen}),
  setInspectorTab: (inspectorTab) => set({inspectorTab}),
  setInspectorLogSource: (inspectorLogSource) => set({inspectorLogSource}),
  openInspector: (inspectorTab = 'logs') => set({inspectorOpen: true, inspectorTab}),
  navigateToProjectSelector: () => set({activePage: 'build', buildSidebarTab: 'project'}),
}))
