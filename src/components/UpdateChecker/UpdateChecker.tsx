import {useCallback, useEffect, useMemo, useState} from 'react'
import {App, Button, Modal, Progress, Space, Typography} from 'antd'
import type {Update} from '@tauri-apps/plugin-updater'
import {
  type AppUpdateDownloadEvent,
  checkForAppUpdate,
  installAppUpdate,
  isTauriRuntime,
} from '../../services/tauri-api'

const { Paragraph, Text } = Typography

type DownloadProgress = {
  downloaded: number
  total?: number
  finished: boolean
}

const formatBytes = (bytes: number) => {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export function UpdateChecker() {
  const { message } = App.useApp()
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [update, setUpdate] = useState<Update | null>(null)
  const [progress, setProgress] = useState<DownloadProgress>({
    downloaded: 0,
    finished: false,
  })

  const progressPercent = useMemo(() => {
    if (!progress.total) {
      return 0
    }

    return Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
  }, [progress.downloaded, progress.total])

  const resetProgress = () => {
    setProgress({ downloaded: 0, finished: false })
  }

  const checkUpdate = useCallback(
    async (silent = false) => {
      if (!isTauriRuntime()) {
        if (!silent) {
          void message.info('请在桌面应用中检查更新。')
        }
        return
      }

      setChecking(true)
      try {
        const nextUpdate = await checkForAppUpdate()
        if (!nextUpdate) {
          if (!silent) {
            void message.success('当前已是最新版本。')
          }
          return
        }

        resetProgress()
        setUpdate(nextUpdate)
      } catch (error) {
        if (!silent) {
          void message.error(`检查更新失败：${getErrorMessage(error)}`)
        }
      } finally {
        setChecking(false)
      }
    },
    [message],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkUpdate(true)
    }, 3500)

    return () => window.clearTimeout(timer)
  }, [checkUpdate])

  const handleDownloadEvent = (event: AppUpdateDownloadEvent) => {
    if (event.event === 'Started') {
      setProgress({
        downloaded: 0,
        total: event.data.contentLength,
        finished: false,
      })
      return
    }

    if (event.event === 'Progress') {
      setProgress((current) => ({
        ...current,
        downloaded: current.downloaded + event.data.chunkLength,
      }))
      return
    }

    setProgress((current) => ({
      ...current,
      finished: true,
    }))
  }

  const installUpdate = async () => {
    if (!update) {
      return
    }

    setInstalling(true)
    try {
      await installAppUpdate(update, handleDownloadEvent)
      void message.success('更新已安装，正在重启应用。')
    } catch (error) {
      void message.error(`安装更新失败：${getErrorMessage(error)}`)
      setInstalling(false)
    }
  }

  const closeModal = () => {
    if (installing) {
      return
    }

    setUpdate(null)
    resetProgress()
  }

  return (
    <>
      <Button loading={checking} onClick={() => void checkUpdate(false)}>
        检查更新
      </Button>
      <Modal
        title="发现新版本"
        open={Boolean(update)}
        onCancel={closeModal}
        closable={!installing}
        maskClosable={!installing}
        footer={[
          <Button key="later" disabled={installing} onClick={closeModal}>
            稍后
          </Button>,
          <Button
            key="install"
            type="primary"
            loading={installing}
            onClick={() => void installUpdate()}
          >
            立即更新
          </Button>,
        ]}
      >
        {update && (
          <Space direction="vertical" size={12} className="update-modal-content">
            <Text>
              当前版本 {update.currentVersion}，最新版本 {update.version}
            </Text>
            {update.date && <Text type="secondary">发布时间：{update.date}</Text>}
            {update.body && (
              <Paragraph className="update-notes" ellipsis={{ rows: 5, expandable: true }}>
                {update.body}
              </Paragraph>
            )}
            {installing && (
              <div className="update-progress">
                <Progress
                  percent={progress.finished ? 100 : progressPercent}
                  status={progress.finished ? 'success' : 'active'}
                />
                <Text type="secondary">
                  {progress.total
                    ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
                    : `${formatBytes(progress.downloaded)} 已下载`}
                </Text>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}
