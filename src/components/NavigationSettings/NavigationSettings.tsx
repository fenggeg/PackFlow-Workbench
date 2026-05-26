import {useState} from 'react'
import {Button, Modal, Select, Space, Switch, Typography} from 'antd'
import {ArrowDownOutlined, ArrowUpOutlined, SettingOutlined,} from '@ant-design/icons'
import {type AppPage} from '../../store/navigationStore'
import {type NavigationItemConfig, useNavigationConfigStore} from '../../store/useNavigationConfigStore'

const { Text } = Typography

interface NavigationSettingsProps {
  open: boolean
  onClose: () => void
}

export function NavigationSettings({ open, onClose }: NavigationSettingsProps) {
  const { items, defaultPage, toggleVisibility, moveItem, setDefaultPage, resetToDefault } = useNavigationConfigStore()
  const [localItems, setLocalItems] = useState<NavigationItemConfig[]>(items)

  const handleToggleVisibility = (key: AppPage) => {
    toggleVisibility(key)
    setLocalItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, visible: !item.visible } : item
      )
    )
  }

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      moveItem(index, index - 1)
      setLocalItems((prev) => {
        const newItems = [...prev]
        ;[newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]]
        return newItems
      })
    }
  }

  const handleMoveDown = (index: number) => {
    if (index < items.length - 1) {
      moveItem(index, index + 1)
      setLocalItems((prev) => {
        const newItems = [...prev]
        ;[newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]]
        return newItems
      })
    }
  }

  const handleReset = () => {
    resetToDefault()
    setLocalItems(items)
  }

  return (
    <Modal
      title="导航栏设置"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="reset" onClick={handleReset}>
          恢复默认
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          完成
        </Button>,
      ]}
      width={400}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            启动时默认打开页面
          </Text>
          <Select
            value={defaultPage}
            onChange={(value) => setDefaultPage(value as AppPage)}
            style={{ width: '100%' }}
            options={items.map((item) => ({
              value: item.key,
              label: item.label,
              disabled: !item.visible,
            }))}
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            拖拽排序或使用箭头调整导航栏顺序，开关控制是否在主页显示
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {localItems.map((item, index) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                border: '1px solid #f0f0f0',
                borderRadius: '6px',
                backgroundColor: item.visible ? '#fafafa' : '#f5f5f5',
              }}
            >
              <Space>
                <Text strong={item.visible} delete={!item.visible}>
                  {item.label}
                </Text>
              </Space>
              <Space>
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0}
                  onClick={() => handleMoveUp(index)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={index === items.length - 1}
                  onClick={() => handleMoveDown(index)}
                />
                <Switch
                  size="small"
                  checked={item.visible}
                  onChange={() => handleToggleVisibility(item.key)}
                />
              </Space>
            </div>
          ))}
          </div>
        </div>
      </Space>
    </Modal>
  )
}

export function NavigationSettingsButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="text"
        icon={<SettingOutlined />}
        onClick={() => setOpen(true)}
        title="导航栏设置"
      />
      <NavigationSettings open={open} onClose={() => setOpen(false)} />
    </>
  )
}