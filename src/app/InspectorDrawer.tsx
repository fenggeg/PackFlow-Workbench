import {CopyOutlined, FullscreenOutlined, MenuUnfoldOutlined} from '@ant-design/icons'
import {Button, Card, Drawer, Empty, List, Modal, Space, Tabs, Tag, Typography} from 'antd'
import {useEffect, useMemo, useState} from 'react'
import {BuildLogPanel} from '../components/BuildLogPanel/BuildLogPanel'
import {useAppStore} from '../store/useAppStore'
import {type InspectorTab, useNavigationStore} from '../store/navigationStore'
import {
    diagnosisCategoryText,
} from '../utils/format'

const {Text} = Typography

export function InspectorDrawer() {
  const inspectorOpen = useNavigationStore((state) => state.inspectorOpen)
  const inspectorTab = useNavigationStore((state) => state.inspectorTab)
  const setInspectorOpen = useNavigationStore((state) => state.setInspectorOpen)
  const setInspectorTab = useNavigationStore((state) => state.setInspectorTab)
  const setInspectorLogSource = useNavigationStore((state) => state.setInspectorLogSource)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const logs = useAppStore((state) => state.logs)
  const artifacts = useAppStore((state) => state.artifacts)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (buildStatus === 'RUNNING') {
      setInspectorOpen(true)
      setInspectorTab('logs')
      setInspectorLogSource('build')
    }
    if (buildStatus === 'FAILED') {
      setInspectorOpen(true)
      setInspectorTab('diagnosis')
      setInspectorLogSource('build')
    }
  }, [buildStatus, setInspectorOpen, setInspectorTab, setInspectorLogSource])

  const logContent = useMemo(() => {
    return <BuildLogPanel />
  }, [])

  const diagnosisText = useMemo(() => {
    if (!diagnosis) {
      return ''
    }
    return [
      `错误类型：${diagnosisCategoryText[diagnosis.category]}`,
      `摘要：${diagnosis.summary}`,
      '',
      '可能原因：',
      ...diagnosis.possibleCauses.map((item) => `- ${item}`),
      '',
      '建议动作：',
      ...diagnosis.suggestedActions.map((item) => `- ${item}`),
      '',
      '关键日志：',
      ...diagnosis.keywordLines.map((line) => `> ${line}`),
    ].join('\n')
  }, [diagnosis])

  const diagnosisContent = useMemo(() => {
    return (
      <Card
        title="构建诊断"
        className="panel-card"
        size="small"
        extra={(
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={!diagnosis}
            onClick={() => void navigator.clipboard?.writeText(diagnosisText)}
          >
            复制
          </Button>
        )}
      >
        {diagnosis ? (
          <Space direction="vertical" size={10} style={{width: '100%'}}>
            <Space size={8} wrap>
              <Tag color="error">{diagnosisCategoryText[diagnosis.category]}</Tag>
              <Text strong>{diagnosis.summary}</Text>
            </Space>
            <Text strong>建议动作</Text>
            <List
              size="small"
              dataSource={diagnosis.suggestedActions}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="构建失败后自动生成诊断" />
        )}
      </Card>
    )
  }, [diagnosis, diagnosisText])

  const detailsContent = useMemo(() => {
    return (
      <Card title="构建上下文" className="panel-card" size="small">
        <Space direction="vertical" size={8} style={{width: '100%'}}>
          <Text type="secondary">构建状态：{buildStatus}</Text>
          <Text type="secondary">日志行数：{logs.length}</Text>
          <Text type="secondary">选中模块：{selectedModules.length || '全部项目'}</Text>
          <Text type="secondary">当前产物：{artifacts.length}</Text>
        </Space>
      </Card>
    )
  }, [buildStatus, logs.length, selectedModules.length, artifacts.length])

  return (
    <>
      {!inspectorOpen && (
        <Button
          className="inspector-floating-toggle"
          type="default"
          icon={<MenuUnfoldOutlined />}
          aria-label="展开详情面板"
          onClick={() => setInspectorOpen(true)}
        />
      )}
      <Drawer
        title="检查器"
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        width={520}
        styles={{
          body: {
            padding: '16px',
          },
        }}
        extra={
          <Button
            size="small"
            type="text"
            icon={<FullscreenOutlined />}
            aria-label="全屏查看"
            onClick={() => setExpanded(true)}
          />
        }
      >
        <Tabs
          className="inspector-tabs"
          activeKey={inspectorTab}
          onChange={(key) => setInspectorTab(key as InspectorTab)}
          items={[
            {
              key: 'logs',
              label: '日志',
              children: logContent,
            },
            {
              key: 'diagnosis',
              label: '构建诊断',
              children: diagnosisContent,
            },
            {
              key: 'details',
              label: '构建详情',
              children: detailsContent,
            },
          ]}
        />
      </Drawer>
      <Modal
        title="检查器"
        open={expanded}
        footer={null}
        width="90vw"
        onCancel={() => setExpanded(false)}
      >
        {logContent}
      </Modal>
    </>
  )
}
