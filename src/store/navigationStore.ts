import {create} from 'zustand'

export type AppPage = 'dashboard' | 'build' | 'artifacts' | 'history'
export type BuildSidebarTab = 'project' | 'git' | 'modules' | 'conflicts' | 'favorites'

export type InspectorTab = 'logs' | 'diagnosis' | 'details'

interface NavigationState {
  activePage: AppPage
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  buildSidebarTab: BuildSidebarTab
  setActivePage: (page: AppPage) => void
  setBuildSidebarTab: (tab: BuildSidebarTab) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
  openInspector: (tab?: InspectorTab) => void
  navigateToProjectSelector: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activePage: 'dashboard',
  inspectorOpen: false,
  inspectorTab: 'logs',
  buildSidebarTab: 'modules',
  setActivePage: (activePage) => set({activePage}),
  setBuildSidebarTab: (buildSidebarTab) => set({buildSidebarTab}),
  setInspectorOpen: (inspectorOpen) => set({inspectorOpen}),
  setInspectorTab: (inspectorTab) => set({inspectorTab}),
  openInspector: (inspectorTab = 'logs') => set({inspectorOpen: true, inspectorTab}),
  navigateToProjectSelector: () => set({activePage: 'build', buildSidebarTab: 'project'}),
}))
