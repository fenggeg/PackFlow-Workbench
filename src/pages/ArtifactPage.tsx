import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {Tooltip, TooltipContent, TooltipTrigger,} from '@/components/ui/tooltip'
import {Copy, FolderOpen, Rocket, Trash2} from 'lucide-react'
import {api} from '../services/tauri-api'
import {useAppStore} from '../store/useAppStore'
import {useNavigationStore} from '../store/navigationStore'
import type {BuildArtifact} from '../types/domain'

const formatSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(2)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${size} B`
}

const dedupeArtifacts = (artifacts: BuildArtifact[]) => {
  const seen = new Set<string>()
  return artifacts.filter((artifact) => {
    if (seen.has(artifact.path)) {
      return false
    }
    seen.add(artifact.path)
    return true
  })
}

export function ArtifactPage() {
  const artifacts = useAppStore((state) => state.artifacts)
  const history = useAppStore((state) => state.history)
  const setActivePage = useNavigationStore((state) => state.setActivePage)
  const removeArtifact = useAppStore((state) => state.removeArtifact)
  const allArtifacts = dedupeArtifacts([
    ...artifacts,
    ...history.flatMap((record) => record.artifacts ?? []),
  ])
  const openArtifactLocation = async (artifact: BuildArtifact) => {
    try {
      await api.openPathInExplorer(artifact.path)
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    }
  }
  const deleteArtifact = async (artifact: BuildArtifact) => {
    try {
      await removeArtifact(artifact.path)
      alert(`已清理 ${artifact.fileName}`)
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <h3 className="text-xl font-semibold">产物管理</h3>
          <p className="text-sm text-muted-foreground">集中查看构建产物，复制路径、打开目录，并进入部署。</p>
        </div>
      </div>
      {allArtifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <p>暂无构建产物</p>
        </div>
      ) : (
        <div className="border rounded-md divide-y workspace-list">
          {allArtifacts.map((artifact) => (
            <div key={artifact.path} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{artifact.fileName}</span>
                  <Badge variant="secondary">{artifact.extension}</Badge>
                  <Badge className="bg-green-500 text-white">{formatSize(artifact.sizeBytes)}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {artifact.modulePath || '根项目'}
                </span>
                <span className="text-xs text-muted-foreground path-text truncate">
                  {artifact.path}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void navigator.clipboard?.writeText(artifact.path)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制路径</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void openArtifactLocation(artifact)}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>打开目录</TooltipContent>
                </Tooltip>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>删除</TooltipContent>
                    </Tooltip>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除产物文件？</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除 {artifact.fileName} 吗？此操作不可恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void deleteArtifact(artifact)}
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  size="sm"
                  onClick={() => setActivePage('deployment')}
                >
                  <Rocket className="mr-1 h-3.5 w-3.5" />
                  部署
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}