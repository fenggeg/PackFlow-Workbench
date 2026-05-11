import React from "react";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Badge} from "@/components/ui/badge";
import {FavoriteGroupsCard} from "../components/FavoriteGroups/FavoriteGroupsCard";
import {GitStatusCard} from "../components/GitStatus/GitStatusCard";
import {ModuleTreePanel} from "../components/ModuleTree/ModuleTreePanel";
import {ProjectSelector} from "../components/ProjectSelector/ProjectSelector";
import {useAppStore} from "../store/useAppStore";
import {type AppPage, useNavigationStore} from "../store/navigationStore";
import {useWorkflowStore} from "../store/useWorkflowStore";

interface SidebarPanelProps {
  activePage: AppPage;
}

export function SidebarPanel({ activePage }: SidebarPanelProps) {
  const history = useAppStore((state) => state.history);
  const deploymentTasks = useWorkflowStore((state) => state.deploymentTasks);
  const buildSidebarTab = useNavigationStore((state) => state.buildSidebarTab);
  const setBuildSidebarTab = useNavigationStore((state) => state.setBuildSidebarTab);

  if (activePage === "build") {
    return (
      <aside className="w-[300px] border-r border-border bg-background flex flex-col overflow-hidden">
        <Tabs
          defaultValue="project"
          className="flex-1 flex flex-col min-h-0"
          value={buildSidebarTab}
          onValueChange={(value) => setBuildSidebarTab(value as typeof buildSidebarTab)}
        >
          <TabsList className="grid w-full grid-cols-4 px-2 pt-2 bg-transparent">
            <TabsTrigger value="project">项目</TabsTrigger>
            <TabsTrigger value="git">Git</TabsTrigger>
            <TabsTrigger value="modules">模块</TabsTrigger>
            <TabsTrigger value="favorites">常用</TabsTrigger>
          </TabsList>
          <TabsContent value="project" className="flex-1 overflow-auto p-4">
            <ProjectSelector />
          </TabsContent>
          <TabsContent value="git" className="flex-1 overflow-auto p-4">
            <GitStatusCard />
          </TabsContent>
          <TabsContent value="modules" className="flex-1 overflow-auto p-4">
            <ModuleTreePanel />
          </TabsContent>
          <TabsContent value="favorites" className="flex-1 overflow-auto p-4">
            <FavoriteGroupsCard />
          </TabsContent>
        </Tabs>
      </aside>
    );
  }

  if (
    activePage === "dashboard" ||
    activePage === "release" ||
    activePage === "deployment" ||
    activePage === "artifacts" ||
    activePage === "services" ||
    activePage === "servers"
  ) {
    return null;
  }

  if (activePage === "history") {
    const buildSuccess = history.filter((h) => h.status === "SUCCESS").length;
    const buildFailed = history.filter((h) => h.status === "FAILED").length;
    const lastBuild = history[0];
    const lastDeployment = deploymentTasks[0];

    return (
      <aside className="w-[300px] border-r border-border bg-background p-4 overflow-auto">
        <div className="flex flex-col gap-6">
          <div>
            <h4 className="text-sm font-medium mb-2">历史摘要</h4>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">构建记录</span>
                <div className="flex gap-2">
                  <Badge variant="secondary">总计 {history.length}</Badge>
                  <Badge variant="default" className="bg-green-500 hover:bg-green-600">成功 {buildSuccess}</Badge>
                  <Badge variant="destructive">失败 {buildFailed}</Badge>
                </div>
                {lastBuild && (
                  <span className="text-xs text-muted-foreground">
                    最近：{new Date(lastBuild.createdAt).toLocaleString()} · {lastBuild.status === "SUCCESS" ? "成功" : lastBuild.status === "FAILED" ? "失败" : "已取消"}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">部署记录</span>
                <Badge variant="secondary">总计 {deploymentTasks.length}</Badge>
                {lastDeployment && (
                  <span className="text-xs text-muted-foreground">
                    最近：{lastDeployment.deploymentProfileName ?? "-"} · {lastDeployment.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[300px] border-r border-border bg-background p-4">
      <h4 className="text-sm font-medium mb-2">工作区</h4>
      <p className="text-sm text-muted-foreground">选择左侧功能后，这里会显示对应的辅助信息。</p>
    </aside>
  );
}
