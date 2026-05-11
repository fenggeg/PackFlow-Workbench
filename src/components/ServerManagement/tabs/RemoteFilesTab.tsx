import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Input} from "@/components/ui/input"
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table"
import {Badge} from "@/components/ui/badge"
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
} from "@/components/ui/alert-dialog"
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from "@/components/ui/dialog"
import {ArrowUp, File, Folder, Home, Plus, RefreshCw, Star, Trash2,} from "lucide-react"
import {useCallback, useEffect, useMemo, useState} from "react"
import {api} from "../../../services/tauri-api"
import type {FavoritePath, RemoteFileEntry, ServerProfile} from "../../../types/domain"

interface RemoteFilesTabProps {
  server: ServerProfile
}

export function RemoteFilesTab({ server }: RemoteFilesTabProps) {
  const [currentPath, setCurrentPath] = useState("/home")
  const [files, setFiles] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [favoritePaths, setFavoritePaths] = useState<FavoritePath[]>([])
  const [newDirModalOpen, setNewDirModalOpen] = useState(false)
  const [newDirName, setNewDirName] = useState("")

  const loadFiles = useCallback(
    async (path: string) => {
      setLoading(true)
      try {
        const data = await api.listRemoteFiles(server.id, path)
        setFiles(data)
        setCurrentPath(path)
      } catch (error) {
        console.error(`加载目录失败：${error}`)
      } finally {
        setLoading(false)
      }
    },
    [server.id]
  )

  const loadFavorites = useCallback(async () => {
    try {
      const data = await api.listFavoritePaths(server.id)
      setFavoritePaths(data)
    } catch (error) {
      console.error("加载常用路径失败：", error)
    }
  }, [server.id])

  useEffect(() => {
    queueMicrotask(() => {
      void loadFiles(currentPath)
      void loadFavorites()
    })
  }, [loadFiles, loadFavorites, currentPath])

  const pathParts = useMemo(() => {
    return currentPath.split("/").filter(Boolean)
  }, [currentPath])

  const handleNavigate = (path: string) => {
    void loadFiles(path)
  }

  const handleGoUp = () => {
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/"
    void loadFiles(parentPath)
  }

  const handleRefresh = () => {
    void loadFiles(currentPath)
  }

  const handleDelete = async (path: string) => {
    try {
      await api.deleteRemoteFile(server.id, path)
      console.log("删除成功")
      await loadFiles(currentPath)
    } catch (error) {
      console.error(`删除失败：${error}`)
    }
  }

  const handleCreateDirectory = async () => {
    if (!newDirName.trim()) return
    const newPath = currentPath.endsWith("/")
      ? `${currentPath}${newDirName}`
      : `${currentPath}/${newDirName}`
    try {
      await api.createRemoteDirectory(server.id, newPath)
      console.log("创建成功")
      setNewDirModalOpen(false)
      setNewDirName("")
      await loadFiles(currentPath)
    } catch (error) {
      console.error(`创建失败：${error}`)
    }
  }

  const handleAddFavorite = async () => {
    const name = currentPath.split("/").filter(Boolean).pop() ?? currentPath
    try {
      await api.saveFavoritePath({
        id: "",
        serverId: server.id,
        name,
        path: currentPath,
        pathType: "custom",
        isDefault: false,
      })
      console.log("收藏成功")
      await loadFavorites()
    } catch (error) {
      console.error(`收藏失败：${error}`)
    }
  }

  const isFavorited = favoritePaths.some((fp) => fp.path === currentPath)

  const formatFileSize = (size: number, isDirectory: boolean) => {
    if (isDirectory) return "-"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          <CardTitle className="text-lg">远程文件</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAddFavorite()}
          >
            <Star className={`mr-1 h-4 w-4 ${isFavorited ? "fill-yellow-400 text-yellow-400" : ""}`} />
            {isFavorited ? "已收藏" : "收藏"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewDirModalOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建目录
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoUp}
              disabled={currentPath === "/"}
            >
              <ArrowUp className="mr-1 h-4 w-4" />
              上级
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNavigate("/home")}
            >
              <Home className="mr-1 h-4 w-4" />
              /home
            </Button>
            <nav className="flex items-center text-sm">
              <ol className="flex items-center gap-1">
                <li>
                  <button
                    className="text-primary hover:underline"
                    onClick={() => handleNavigate("/")}
                  >
                    /
                  </button>
                </li>
                {pathParts.map((part, index) => (
                  <li key={index} className="flex items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      className="text-primary hover:underline"
                      onClick={() => {
                        const path = "/" + pathParts.slice(0, index + 1).join("/")
                        handleNavigate(path)
                      }}
                    >
                      {part}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          {favoritePaths.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-sm text-muted-foreground">常用路径：</span>
              {favoritePaths.map((fp) => (
                <Badge
                  key={fp.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleNavigate(fp.path)}
                >
                  {fp.name}
                </Badge>
              ))}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件名</TableHead>
                <TableHead className="w-[100px]">大小</TableHead>
                <TableHead className="w-[160px]">修改时间</TableHead>
                <TableHead className="w-[120px]">权限</TableHead>
                <TableHead className="w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : files.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    空目录
                  </TableCell>
                </TableRow>
              ) : (
                files.map((record) => (
                  <TableRow key={record.path}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {record.isDirectory ? (
                          <Folder className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <File className="h-4 w-4 text-blue-500" />
                        )}
                        {record.isDirectory ? (
                          <a
                            className="text-primary hover:underline cursor-pointer"
                            onClick={() => handleNavigate(record.path)}
                          >
                            {record.name}
                          </a>
                        ) : (
                          <span>{record.name}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatFileSize(record.size, record.isDirectory)}</TableCell>
                    <TableCell>{record.modifiedAt}</TableCell>
                    <TableCell>{record.permissions}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>确定删除？</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleDelete(record.path)}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={newDirModalOpen} onOpenChange={(open) => {
        setNewDirModalOpen(open)
        if (!open) setNewDirName("")
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建目录</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="目录名称"
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateDirectory()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewDirModalOpen(false); setNewDirName("") }}>
              取消
            </Button>
            <Button onClick={() => void handleCreateDirectory()}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}