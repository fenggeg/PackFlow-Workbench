import {create} from 'zustand'

export type AppPage = 'dashboard' | 'build' | 'artifacts' | 'history'

export type InspectorTab = 'logs' | 'diagnosis' | 'details'

interface NavigationState {
  activePage: AppPage
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  projectSwitcherOpen: boolean
  setActivePage: (page: AppPage) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
  openInspector: (tab?: InspectorTab) => void
  setProjectSwitcherOpen: (open: boolean) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activePage: 'dashboard',
  inspectorOpen: false,
  inspectorTab: 'logs',
  projectSwitcherOpen: false,
  setActivePage: (activePage) => set({activePage}),
  setInspectorOpen: (inspectorOpen) => set({inspectorOpen}),
  setInspectorTab: (inspectorTab) => set({inspectorTab}),
  openInspector: (inspectorTab = 'logs') => set({inspectorOpen: true, inspectorTab}),
  setProjectSwitcherOpen: (projectSwitcherOpen) => set({projectSwitcherOpen}),
}))
