import {DeleteOutlined} from '@ant-design/icons'
import {Button, Empty, List, Popconfirm, Tag, Tooltip, Typography} from 'antd'
import type {ServiceOperationHistory} from '../../../types/domain'
import {useServiceOperationStore} from '../stores/serviceOperationStore'

const {Text} = Typography

const operationLabel = (type: ServiceOperationHistory['operationType']) => {
  switch (type) {
    case 'restart': return '重启'
    case 'view_log': return '查看日志'
    case 'health_check': return '健康检查'
    case 'start': return '启动'
    case 'stop': return '停止'
    case 'status_check': return '状态检查'
    default: return type
  }
}

export function ServiceOperationHistoryList({items}: {items: ServiceOperationHistory[]}) {
  const deleteHistory = useServiceOperationStore((state) => state.deleteHistory)

  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无服务操作历史" />
  }

  return (
    <List
      size="small"
      dataSource={items.slice(0, 8)}
      renderItem={(item) => (
        <List.Item
          actions={[
            <Popconfirm
              key="delete"
              title="确认删除"
              description="删除后无法恢复，确认删除此操作记录？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void deleteHistory(item.id)}
            >
              <Tooltip title="删除">
                <Button icon={<DeleteOutlined />} size="small" danger type="text" />
              </Tooltip>
            </Popconfirm>,
          ]}
        >
          <List.Item.Meta
            title={(
              <>
                <Tag color={item.result === 'success' ? 'green' : 'red'}>{operationLabel(item.operationType)}</Tag>
                <Text strong>{item.serviceName}</Text>
              </>
            )}
            description={`${item.environmentName} · ${item.serverHost} · ${new Date(item.startedAt).toLocaleString()}`}
          />
          {item.errorMessage ? <Text type="danger" ellipsis={{tooltip: item.errorMessage}}>{item.errorMessage}</Text> : null}
        </List.Item>
      )}
    />
  )
}
