import {useEffect} from 'react'
import {Card, List, Tag, Space, Button, Popconfirm, Empty, Typography} from 'antd'
import {DeleteOutlined, ReloadOutlined} from '@ant-design/icons'
import {useCommandStore} from '../../store/useCommandStore'
import type {CommandExecution} from '../../types/domain'

const {Text} = Typography

export function ExecutionHistory() {
  const {
    executions,
    executionsLoading,
    loadExecutions,
    deleteExecution,
  } = useCommandStore()

  useEffect(() => {
    loadExecutions()
  }, [loadExecutions])

  const statusTag = (status: string) => {
    const config: Record<string, {color: string; text: string}> = {
      running: {color: 'processing', text: '执行中'},
      success: {color: 'success', text: '成功'},
      failed: {color: 'error', text: '失败'},
      cancelled: {color: 'warning', text: '已取消'},
    }
    const {color, text} = config[status] || {color: 'default', text: status}
    return <Tag color={color}>{text}</Tag>
  }

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr)
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return timeStr
    }
  }

  return (
    <Card
      title={
        <Space>
          <span>执行历史</span>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadExecutions}
          />
        </Space>
      }
      size="small"
      style={{height: '100%', display: 'flex', flexDirection: 'column'}}
      styles={{body: {flex: 1, overflow: 'auto', padding: '8px 12px'}}}
    >
      {executions.length === 0 ? (
        <Empty description="暂无执行记录" style={{margin: 'auto'}} />
      ) : (
        <List
          dataSource={executions}
          loading={executionsLoading}
          renderItem={(execution: CommandExecution) => (
            <List.Item
              style={{padding: '8px 0'}}
              actions={[
                <Popconfirm
                  key="delete"
                  title="确定删除此记录？"
                  onConfirm={() => deleteExecution(execution.id)}
                >
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{execution.templateName}</Text>
                    {statusTag(execution.status)}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{fontSize: 12}}>
                      {execution.serverName || execution.serverId}
                    </Text>
                    <Text type="secondary" style={{fontSize: 12}}>
                      {formatTime(execution.startedAt)}
                      {execution.finishedAt && ` - ${formatTime(execution.finishedAt)}`}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}
