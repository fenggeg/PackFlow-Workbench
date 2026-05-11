import {DeploymentHistoryTable} from '../Deployment/DeploymentHistoryTable'
import {HistoryTable} from './HistoryTable'
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs"

export function WorkbenchHistoryPanel() {
  return (
    <Tabs defaultValue="build" className="w-full">
      <TabsList>
        <TabsTrigger value="build">构建记录</TabsTrigger>
        <TabsTrigger value="deployment">部署记录</TabsTrigger>
      </TabsList>
      <TabsContent value="build">
        <HistoryTable />
      </TabsContent>
      <TabsContent value="deployment">
        <DeploymentHistoryTable />
      </TabsContent>
    </Tabs>
  )
}