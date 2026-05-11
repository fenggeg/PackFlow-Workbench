import {AdvancedOptionsPanel} from '../components/AdvancedOptions/AdvancedOptionsPanel'
import {BuildNextActionsPanel} from '../components/BuildCenter/BuildNextActionsPanel'
import {BuildOptionsPanel} from '../components/BuildOptions/BuildOptionsPanel'
import {EnvPanel} from '../components/EnvPanel/EnvPanel'
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion"

export function BuildPage() {
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-lg font-medium">构建中心</h3>
          <span className="text-sm text-muted-foreground">选模块、配参数、开始构建，构建结果会自然流向产物和部署。</span>
        </div>
      </div>
      <div className="flex flex-col gap-5 w-full">
        <BuildOptionsPanel />
        <Accordion type="multiple" className="workspace-collapse">
          <AccordionItem value="environment">
            <AccordionTrigger>构建环境摘要</AccordionTrigger>
            <AccordionContent>
              <EnvPanel />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="advanced">
            <AccordionTrigger>高级参数</AccordionTrigger>
            <AccordionContent>
              <AdvancedOptionsPanel />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <BuildNextActionsPanel />
      </div>
    </main>
  )
}