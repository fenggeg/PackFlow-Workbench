import {
  Button,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  CheckOutlined,
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {selectLocalDirectory} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'

const {Text} = Typography

interface JdkRegistryPanelProps {
  /** 选择 JDK 后的回调，传入 JDK path（不传则为纯管理面板） */
  onSelect?: (jdkPath: string) => void
}

export function JdkRegistryPanel({onSelect}: JdkRegistryPanelProps) {
  const environment = useAppStore((state) => state.environment)
  const jdkRegistry = useAppStore((state) => state.jdkRegistry)
  const scanSystemJdks = useAppStore((state) => state.scanSystemJdks)
  const addJdkToRegistry = useAppStore((state) => state.addJdkToRegistry)
  const removeJdkFromRegistry = useAppStore((state) => state.removeJdkFromRegistry)

  const currentJdkPath = environment?.javaHome

  const handleAddJdk = async () => {
    const selected = await selectLocalDirectory('选择 JDK 安装目录')
    if (selected) {
      await addJdkToRegistry(selected)
    }
  }

  return (
    <div className="jdk-popover-content">
      {/* JDK 列表 */}
      {jdkRegistry.length > 0 ? (
        <div className="jdk-popover-list">
          {jdkRegistry.map((entry) => {
            const isCurrent = currentJdkPath?.toLowerCase() === entry.path.toLowerCase()
            return (
              <div
                key={entry.id}
                className={`jdk-popover-item ${isCurrent ? 'jdk-popover-item-active' : ''}`}
                onClick={() => onSelect?.(entry.path)}
              >
                <div className="jdk-popover-item-info">
                  <Text strong style={{fontSize: 13}}>{entry.name}</Text>
                  {entry.isDefault && <Tag color="gold" style={{marginLeft: 4, fontSize: 11}}>默认</Tag>}
                  {isCurrent && <CheckOutlined style={{color: '#16a34a', marginLeft: 4}} />}
                </div>
                <div className="jdk-popover-item-actions">
                  <Text type="secondary" style={{fontSize: 11}} title={entry.path}>
                    {entry.path}
                  </Text>
                  <Popconfirm
                    title="移除此 JDK？"
                    okText="移除"
                    cancelText="取消"
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      void removeJdkFromRegistry(entry.id)
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Text type="secondary" style={{display: 'block', textAlign: 'center', padding: '12px 0'}}>
          暂无已注册 JDK，请先扫描或手动添加
        </Text>
      )}

      {/* 操作按钮 */}
      <Space style={{marginTop: 8}}>
        <Button
          size="small"
          icon={<SearchOutlined />}
          onClick={() => void scanSystemJdks()}
        >
          扫描系统 JDK
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => void handleAddJdk()}
        >
          添加 JDK
        </Button>
      </Space>
    </div>
  )
}
