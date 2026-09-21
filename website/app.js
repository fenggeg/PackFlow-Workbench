// 同源路径：由官网托管层反代到 Node-RED，避免跨域。
// 响应与应用内更新使用同一份官方 Tauri latest.json 格式：
// { version, notes, pub_date, platforms: { "windows-x86_64": { signature, url } } }
const releaseApi = '/api/latest'
const fallbackReleaseUrl = 'https://github.com/fenggeg/PackFlow-Workbench/releases/latest'

const downloadLinks = document.querySelectorAll('[data-download-link]')
const releaseNote = document.querySelector('[data-release-note]')

async function hydrateLatestDownload() {
  try {
    const response = await fetch(releaseApi)

    if (!response.ok) {
      throw new Error(`Release request failed: ${response.status}`)
    }

    const release = await response.json()
    const downloadUrl = release.platforms?.['windows-x86_64']?.url ?? fallbackReleaseUrl
    const version = typeof release.version === 'string' ? release.version.trim().replace(/^v/, '') : ''
    const fileName = downloadUrl.split('/').pop() || ''
    const releaseName = version ? `下载 v${version}` : '下载最新版本'

    downloadLinks.forEach((link) => {
      link.href = downloadUrl
      if (link.classList.contains('download-card-link')) {
        link.textContent = fileName || '打开 GitHub 最新 Release'
      } else {
        link.textContent = releaseName
      }
    })

    if (releaseNote) {
      releaseNote.textContent = version
        ? '下载地址来自最新发布版本，会随版本发布自动更新。'
        : '当前未读取到安装包下载地址，已指向 GitHub 最新 Release 页面。'
    }
  } catch {
    downloadLinks.forEach((link) => {
      link.href = fallbackReleaseUrl
    })

    if (releaseNote) {
      releaseNote.textContent = '暂时无法自动读取最新安装包，点击可打开 GitHub 最新 Release 页面。'
    }
  }
}

void hydrateLatestDownload()
