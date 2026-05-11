import React from "react"
import {useNavigationStore} from '../store/navigationStore'
import {ActivityBar} from './ActivityBar'
import {BottomActionBar} from './BottomActionBar'
import {InspectorDrawer} from './InspectorDrawer'
import {MainWorkspace} from './MainWorkspace'
import {SidebarPanel} from './SidebarPanel'

const noSidebarPages = new Set(['dashboard', 'release', 'deployment', 'artifacts', 'services', 'servers'])

const branchStatusColor = (hasLocalChanges?: boolean, hasRemoteUpdates?: boolean) => {
  if (hasRemoteUpdates) {
    return 'orange'
  }
  if (hasLocalChanges) {
    return 'gold'
  }
  return 'green'
}

export function AppShell() {
  const activePage = useNavigationStore((state) => state.activePage)
  const sidebarHidden = noSidebarPages.has(activePage)

  return (
    <div className="flex flex-col h-full">
      {/* Header moved to AppLayout */}
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        {!sidebarHidden && <SidebarPanel activePage={activePage} />}
        <MainWorkspace activePage={activePage} />
        <InspectorDrawer />
      </div>
      <BottomActionBar />
    </div>
  )
}
