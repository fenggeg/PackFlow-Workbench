import {Breadcrumb, Button, Card, Empty, Input, message, Modal, Popconfirm, Space, Table, Tag, Typography,} from 'antd'
import {
  ArrowUpOutlined,
  DeleteOutlined,
  FileOutlined,
  FolderOutlined,
  HomeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {api} from '../../../services/tauri-api'
import type {FavoritePath, RemoteFileEntry, ServerProfile} from '../../../types/domain'

const {Text} = Typography

interface RemoteFilesTabProps {
  server: ServerProfile
}

export function RemoteFilesTab({server}: RemoteFilesTabProps) {
  const [currentPath, setCurrentPath] = useState('/home')
  const [files, setFiles] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [favoritePaths, setFavoritePaths] = useState<FavoritePath[]>([])
  const [newDirModalOpen, setNewDirModalOpen] = useState(false)
  const [newDirName, setNewDirName] = useState('')

  const loadFiles = useCallback(
    async (path: string) => {
      setLoading(true)
      try {
        const data = await api.listRemoteFiles(server.id, path)
        setFiles(data)
        setCurrentPath(path)
      } catch (error) {
        message.error(`加载目录失败：${error}`)
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
      console.error('加载常用路径失败：', error)
    }
  }, [server.id])

  useEffect(() => {
    queueMicrotask(() => {
      void loadFiles(currentPath)
      void loadFavorites()
    })
  }, [loadFiles, loadFavorites, currentPath])

  const pathParts = useMemo(() => {
    return currentPath.split('/').filter(Boolean)
  }, [currentPath])

  const handleNavigate = (path: string) => {
    void loadFiles(path)
  }

  const handleGoUp = () => {
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
    void loadFiles(parentPath)
  }

  const handleRefresh = () => {
    void loadFiles(currentPath)
  }

  const handleDelete = async (path: string) => {
    try {
      await api.deleteRemoteFile(server.id, path)
      message.success('删除成功')
      await loadFiles(currentPath)
    } catch (error) {
      message.error(`删除失败：${error}`)
    }
  }

  const handleCreateDirectory = async () => {
    if (!newDirName.trim()) return
    const newPath = currentPath.endsWith('/')
      ? `${currentPath}${newDirName}`
      : `${currentPath}/${newDirName}`
    try {
      await api.createRemoteDirectory(server.id, newPath)
      message.success('创建成功')
      setNewDirModalOpen(false)
      setNewDirName('')
      await loadFiles(currentPath)
    } catch (error) {
      message.error(`创建失败：${error}`)
    }
  }

  const handleAddFavorite = async () => {
    const name = currentPath.split('/').filter(Boolean).pop() ?? currentPath
    try {
      await api.saveFavoritePath({
        id: '',
        serverId: server.id,
        name,
        path: currentPath,
        pathType: 'custom',
        isDefault: false,
      })
      message.success('收藏成功')
      await loadFavorites()
    } catch (error) {
      message.error(`收藏失败：${error}`)
    }
  }

  const isFavorited = favoritePaths.some((fp) => fp.path === currentPath)

  const columns = [
    {
      title: '文件名',
      key: 'name',
      render: (_: unknown, record: RemoteFileEntry) => (
        <Space>
          {record.isDirectory ? (
            <FolderOutlined style={{color: '#faad14'}} />
          ) : (
            <FileOutlined style={{color: '#1890ff'}} />
          )}
          <a
            onClick={() => {
              if (record.isDirectory) {
                handleNavigate(record.path)
              }
            }}
          >
            {record.name}
          </a>
        </Space>
      ),
    },
    {
      title: '大小',
      key: 'size',
      width: 100,
      render: (_: unknown, record: RemoteFileEntry) => {
        if (record.isDirectory) return '-'
        if (record.size < 1024) return `${record.size} B`
        if (record.size < 1024 * 1024) return `${(record.size / 1024).toFixed(1)} KB`
        if (record.size < 1024 * 1024 * 1024)
          return `${(record.size / (1024 * 1024)).toFixed(1)} MB`
        return `${(record.size / (1024 * 1024 * 1024)).toFixed(1)} GB`
      },
    },
    {
      title: '修改时间',
      dataIndex: 'modifiedAt',
      key: 'modifiedAt',
      width: 160,
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 120,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: RemoteFileEntry) => (
        <Space size="small">
          <Popconfirm
            title="确定删除？"
            onConfirm={() => void handleDelete(record.path)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={
        <Space>
          <FolderOutlined />
          <span>远程文件</span>
        </Space>
      }
      size="small"
      extra={
        <Space>
          <Button
            size="small"
            icon={isFavorited ? <StarFilled style={{color: '#faad14'}} /> : <StarOutlined />}
            onClick={() => void handleAddFavorite()}
          >
            {isFavorited ? '已收藏' : '收藏'}
          </Button>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setNewDirModalOpen(true)}>
            新建目录
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={8} style={{width: '100%'}}>
        <Space style={{width: '100%'}}>
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            onClick={handleGoUp}
            disabled={currentPath === '/'}
          >
            上级
          </Button>
          <Button
            size="small"
            icon={<HomeOutlined />}
            onClick={() => handleNavigate('/home')}
          >
            /home
          </Button>
          <Breadcrumb
            items={[
              {title: '/', onClick: () => handleNavigate('/')},
              ...pathParts.map((part, index) => ({
                title: part,
                onClick: () => {
                  const path = '/' + pathParts.slice(0, index + 1).join('/')
                  handleNavigate(path)
                },
              })),
            ]}
          />
        </Space>

        {favoritePaths.length > 0 && (
          <Space wrap size="small">
            <Text type="secondary">常用路径：</Text>
            {favoritePaths.map((fp) => (
              <Tag
                key={fp.id}
                style={{cursor: 'pointer'}}
                onClick={() => handleNavigate(fp.path)}
              >
                {fp.name}
              </Tag>
            ))}
          </Space>
        )}

        <Table
          dataSource={files}
          columns={columns}
          rowKey="path"
          loading={loading}
          size="small"
          pagination={false}
          locale={{
            emptyText: <Empty description="空目录" />,
          }}
        />
      </Space>

      <Modal
        title="新建目录"
        open={newDirModalOpen}
        onOk={() => void handleCreateDirectory()}
        onCancel={() => {
          setNewDirModalOpen(false)
          setNewDirName('')
        }}
      >
        <Input
          placeholder="目录名称"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          onPressEnter={() => void handleCreateDirectory()}
        />
      </Modal>
    </Card>
  )
}
