import {useEffect, useState} from 'react'
import {Card, List, Tag, Space, Button, Popconfirm, Empty, Typography} from 'antd'
import {DeleteOutlined, ReloadOutlined} from '@ant-design/icons'
import {useCommandStore} from '../../store/useCommandStore'
import type {CommandExecution} from '../../types/domain'

const {Text} = Typography

const PAGE_SIZE = 10

export function ExecutionHistory() {
  const {
    executions,
    executionsLoading,
    loadExecutions,
    deleteExecution,
  } = useCommandStore()

  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    loadExecutions()
  }, [loadExecutions])

  // 当数据变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [executions.length])

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

  const totalPages = Math.ceil(executions.length / PAGE_SIZE)
  const paginatedExecutions = executions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  return (
    <Card
      title={
        <Space>
          <span>执行历史</span>
          <Tag>{executions.length} 条</Tag>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadExecutions}
          />
        </Space>
      }
      size="small"
      style={{height: '100%', display: 'flex', flexDirection: 'column'}}
      styles={{body: {flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}}
    >
      {executions.length === 0 ? (
        <Empty
          description="暂无执行记录"
          style={{margin: 'auto'}}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          <List
            style={{flex: 1, overflow: 'auto', minHeight: 0}}
            dataSource={paginatedExecutions}
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
                      <Text strong style={{fontSize: 13}}>{execution.templateName}</Text>
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
          {totalPages > 1 && (
            <div style={{display: 'flex', justifyContent: 'center', padding: '8px 0', borderTop: '1px solid #f0f0f0', flexShrink: 0}}>
              <Space>
                <Button
                  size="small"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  上一页
                </Button>
                <Text type="secondary" style={{fontSize: 12}}>
                  {currentPage} / {totalPages}
                </Text>
                <Button
                  size="small"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  下一页
                </Button>
              </Space>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
