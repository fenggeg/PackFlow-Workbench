import {useCallback, useEffect, useMemo, useState} from 'react'
import {App, Button, Modal, Progress, Space, Typography} from 'antd'
import ReactMarkdown from 'react-markdown'
import {
    type AppUpdateDownloadEvent,
    type AppUpdateInfo,
    checkForAppUpdate,
    downloadAppUpdate,
    getCurrentAppVersion,
    installCachedAppUpdate,
    isTauriRuntime,
} from '../../services/tauri-api'
import {getErrorMessage} from '../../utils/errors'

const { Text } = Typography

type DownloadProgress = {
  downloaded: number
  total?: number
  startedAt?: number
  speed?: number
  finished: boolean
}

type UpdatePhase = 'check' | 'download' | 'install'

const formatBytes = (bytes: number) => {
  if (bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const getRawUpdateNotes = (update: AppUpdateInfo) => {
  if (typeof update.body === 'string' && update.body.trim()) {
    return update.body
  }

  return ''
}

const formatUpdateNotes = (update: AppUpdateInfo) => {
  const notes = getRawUpdateNotes(update).trim()

  return notes || '本次更新未提供更新日志。'
}

const formatReleaseDate = (date: string) => {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleString()
}

const getFriendlyUpdateErrorMessage = (error: unknown, phase: UpdatePhase) => {
  const rawMessage = getErrorMessage(error).toLowerCase()
  const prefix =
    phase === 'check'
      ? '检查更新失败'
      : phase === 'download'
        ? '下载更新失败'
        : '安装更新失败'

  if (rawMessage.includes('timeout') || rawMessage.includes('timed out')) {
    return `${prefix}：连接更新服务超时，请稍后重试。`
  }

  if (
    rawMessage.includes('decode') ||
    rawMessage.includes('decoding') ||
    rawMessage.includes('body') ||
    rawMessage.includes('unexpected eof') ||
    rawMessage.includes('incomplete') ||
    rawMessage.includes('truncated')
  ) {
    return `${prefix}：更新包下载中断或内容不完整，请检查网络后重新下载。`
  }

  if (
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('dns') ||
    rawMessage.includes('resolve') ||
    rawMessage.includes('connection') ||
    rawMessage.includes('request') ||
    rawMessage.includes('response')
  ) {
    return `${prefix}：暂时无法连接更新服务，请检查网络后重试。`
  }

  if (
    rawMessage.includes('signature') ||
    rawMessage.includes('pubkey') ||
    rawMessage.includes('verify') ||
    rawMessage.includes('verification')
  ) {
    return `${prefix}：更新包校验未通过，请等待重新发布后再试。`
  }

  if (
    rawMessage.includes('404') ||
    rawMessage.includes('not found') ||
    rawMessage.includes('asset')
  ) {
    return `${prefix}：未找到适合当前安装方式的更新包，请稍后重试。`
  }

  if (
    rawMessage.includes('json') ||
    rawMessage.includes('parse') ||
    rawMessage.includes('format')
  ) {
    return `${prefix}：更新信息格式异常，请等待重新发布后再试。`
  }

  if (
    rawMessage.includes('permission') ||
    rawMessage.includes('access denied') ||
    rawMessage.includes('denied')
  ) {
    return `${prefix}：当前权限不足，请以管理员身份运行后重试。`
  }

  if (
    rawMessage.includes('install') ||
    rawMessage.includes('installer') ||
    rawMessage.includes('process') ||
    rawMessage.includes('exit')
  ) {
    return `${prefix}：安装程序没有正常完成，请关闭应用后重试。`
  }

  return `${prefix}：更新服务暂时不可用，请稍后重试。`
}

export function UpdateChecker() {
  const { message, modal } = App.useApp()
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [updatePhase, setUpdatePhase] = useState<Exclude<UpdatePhase, 'check'> | null>(null)
  const [currentVersion, setCurrentVersion] = useState(() =>
    isTauriRuntime() ? '' : '开发预览',
  )
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null)
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

  const downloadSpeedText = useMemo(() => {
    if (!progress.speed || progress.finished) {
      return ''
    }

    return `${formatBytes(progress.speed)}/s`
  }, [progress.finished, progress.speed])

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
            void message.success(
              currentVersion
                ? `当前已是最新版本：${currentVersion}`
                : '当前已是最新版本。',
            )
          }
          return
        }

        resetProgress()
        setUpdate(nextUpdate)
        if (!silent && nextUpdate.downloaded) {
          void message.info('安装包已下载，可直接安装更新。')
        }
      } catch (error) {
        if (!silent) {
          void message.error(getFriendlyUpdateErrorMessage(error, 'check'))
        }
      } finally {
        setChecking(false)
      }
    },
    [currentVersion, message],
  )

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    let disposed = false

    void getCurrentAppVersion()
      .then((version) => {
        if (!disposed) {
          setCurrentVersion(version)
        }
      })
      .catch(() => {
        if (!disposed) {
          setCurrentVersion('')
        }
      })

    return () => {
      disposed = true
    }
  }, [])

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
        startedAt: Date.now(),
        finished: false,
      })
      return
    }

    if (event.event === 'Progress') {
      setProgress((current) => {
        const startedAt = current.startedAt ?? Date.now()
        const downloaded = current.downloaded + event.data.chunkLength
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1)

        return {
          ...current,
          startedAt,
          downloaded,
          speed: downloaded / elapsedSeconds,
        }
      })
      return
    }

    setProgress((current) => ({
      ...current,
      finished: true,
    }))
  }

  const downloadUpdate = async () => {
    if (!update) {
      return
    }

    setInstalling(true)
    setUpdatePhase('download')
    try {
      await downloadAppUpdate(update, handleDownloadEvent, () => {
        setUpdate((current) => current ? { ...current, downloaded: true } : current)
      })
      setUpdate((current) => current ? { ...current, downloaded: true } : current)
      void message.success('安装包已下载，确认后即可安装。')
    } catch (error) {
      void message.error(getFriendlyUpdateErrorMessage(error, 'download'))
    } finally {
      setInstalling(false)
      setUpdatePhase(null)
    }
  }

  const confirmInstallUpdate = () => {
    if (!update) {
      return
    }

    modal.confirm({
      title: '安装更新',
      content: '安装会关闭当前应用，完成后将自动重新打开。',
      okText: '安装',
      cancelText: '取消',
      onOk: async () => {
        setInstalling(true)
        setUpdatePhase('install')
        try {
          await installCachedAppUpdate(update)
        } catch (error) {
          void message.error(getFriendlyUpdateErrorMessage(error, 'install'))
          setInstalling(false)
          setUpdatePhase(null)
        }
      },
    })
  }

  const handlePrimaryAction = () => {
    if (!update || installing) {
      return
    }

    if (update.downloaded) {
      confirmInstallUpdate()
      return
    }

    void downloadUpdate()
  }

  const closeModal = () => {
    if (installing) {
      return
    }

    setUpdate(null)
    setUpdatePhase(null)
    resetProgress()
  }

  return (
    <Space size={8} className="update-checker">
      {currentVersion && (
        <Text type="secondary" className="current-version">
          当前版本 {currentVersion}
        </Text>
      )}
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
            onClick={handlePrimaryAction}
          >
            {updatePhase === 'download'
              ? '下载中'
              : updatePhase === 'install'
                ? '安装中'
                : update?.downloaded
                  ? '安装更新'
                  : '下载更新'}
          </Button>,
        ]}
      >
        {update && (
          <Space direction="vertical" size={12} className="update-modal-content">
            <Text>
              当前版本 {update.currentVersion || currentVersion}，最新版本 {update.version}
            </Text>
            {update.downloaded && !installing && (
              <Text type="success">安装包已下载，点击“安装更新”完成安装。</Text>
            )}
            {update.date && (
              <Text type="secondary">发布时间：{formatReleaseDate(update.date)}</Text>
            )}
            <div className="update-notes">
              <ReactMarkdown
                components={{
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {formatUpdateNotes(update)}
              </ReactMarkdown>
            </div>
            {(installing || progress.downloaded > 0 || progress.finished) && (
              <div className="update-progress">
                <Progress
                  percent={progress.finished ? 100 : progressPercent}
                  status={progress.finished ? 'success' : 'active'}
                />
                <Text type="secondary">
                  {progress.finished
                    ? updatePhase === 'install'
                      ? '下载完成，正在安装'
                      : '下载完成，等待安装'
                    : progress.total
                      ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}${downloadSpeedText ? ` · ${downloadSpeedText}` : ''}`
                      : `${formatBytes(progress.downloaded)} 已下载${downloadSpeedText ? ` · ${downloadSpeedText}` : ''}`}
                </Text>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </Space>
  )
}
