import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import type {DeployStep} from '../types/domain'
import {
    builtinDeploymentTemplates,
    createSpringBootJarSteps,
} from '../components/Deployment/deploymentCenterUtils'

export interface DeploymentTemplate {
  id: string
  name: string
  description: string
  steps: DeployStep[]
  builtin?: boolean
  updatedAt?: string
}

interface DeploymentTemplateState {
  customTemplates: DeploymentTemplate[]
  allTemplates: () => DeploymentTemplate[]
  saveCustomTemplate: (template: DeploymentTemplate) => void
  deleteCustomTemplate: (templateId: string) => void
  createTemplateDraft: () => DeploymentTemplate
}

export const useDeploymentTemplateStore = create<DeploymentTemplateState>()(
  persist(
    (set, get) => ({
      customTemplates: [],

      allTemplates: () => {
        const builtins = builtinDeploymentTemplates()
        const customs = get().customTemplates
        return [...builtins, ...customs]
      },

      saveCustomTemplate: (template: DeploymentTemplate) => {
        set((state) => {
          const existing = state.customTemplates.findIndex((t) => t.id === template.id)
          const updated = {...template, updatedAt: new Date().toISOString()}
          if (existing >= 0) {
            const next = [...state.customTemplates]
            next[existing] = updated
            return {customTemplates: next}
          }
          return {customTemplates: [...state.customTemplates, updated]}
        })
      },

      deleteCustomTemplate: (templateId: string) => {
        set((state) => ({
          customTemplates: state.customTemplates.filter((t) => t.id !== templateId),
        }))
      },

      createTemplateDraft: () => ({
        id: crypto.randomUUID(),
        name: '',
        description: '',
        steps: createSpringBootJarSteps(),
        updatedAt: new Date().toISOString(),
      }),
    }),
    {
      name: 'packflow-workbench.deploymentTemplates.v1',
    },
  ),
)
