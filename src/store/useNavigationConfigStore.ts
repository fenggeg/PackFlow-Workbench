import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import {type AppPage} from './navigationStore'

export interface NavigationItemConfig {
  key: AppPage
  label: string
  visible: boolean
  order: number
}

interface NavigationConfigState {
  items: NavigationItemConfig[]
  defaultPage: AppPage
  setItems: (items: NavigationItemConfig[]) => void
  setDefaultPage: (page: AppPage) => void
  toggleVisibility: (key: AppPage) => void
  moveItem: (fromIndex: number, toIndex: number) => void
  resetToDefault: () => void
}

const defaultItems: NavigationItemConfig[] = [
  { key: 'dashboard', label: '首页', visible: true, order: 0 },
  { key: 'build', label: '构建', visible: true, order: 1 },
  { key: 'artifacts', label: '产物', visible: true, order: 2 },
  { key: 'deployment', label: '部署', visible: true, order: 3 },
  { key: 'servers', label: '服务器', visible: true, order: 4 },
  { key: 'history', label: '历史', visible: true, order: 5 },
]

const VALID_PAGE_KEYS: AppPage[] = ['dashboard', 'build', 'artifacts', 'deployment', 'servers', 'history']

const defaultPage: AppPage = 'dashboard'

export const useNavigationConfigStore = create<NavigationConfigState>()(
  persist(
    (set) => ({
      items: defaultItems,
      defaultPage,
      setItems: (items) => set({ items }),
      setDefaultPage: (page) => set({ defaultPage: page }),
      toggleVisibility: (key) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.key === key ? { ...item, visible: !item.visible } : item
          ),
        })),
      moveItem: (fromIndex, toIndex) =>
        set((state) => {
          const newItems = [...state.items]
          const [movedItem] = newItems.splice(fromIndex, 1)
          newItems.splice(toIndex, 0, movedItem)
          return {
            items: newItems.map((item, index) => ({ ...item, order: index })),
          }
        }),
      resetToDefault: () => set({ items: defaultItems, defaultPage }),
    }),
    {
      name: 'navigation-config',
      // 迁移：过滤掉已删除的页面（如 'release', 'services'）
      migrate: (persistedState: unknown, _version: number) => {
        const state = persistedState as Partial<NavigationConfigState>
        if (state.items) {
          // 过滤掉无效的页面 key
          state.items = state.items.filter((item) => VALID_PAGE_KEYS.includes(item.key))
          // 确保 defaultPage 有效
          if (state.defaultPage && !VALID_PAGE_KEYS.includes(state.defaultPage)) {
            state.defaultPage = defaultPage
          }
        }
        return state as NavigationConfigState
      },
      version: 2,
    }
  )
)
