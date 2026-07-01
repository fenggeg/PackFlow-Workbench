const releaseApi = 'https://node-red.gyfwork.cc.cd/api/latest'
const fallbackReleaseUrl = 'https://github.com/fenggeg/PackFlow-Workbench/releases/latest'

const downloadLinks = document.querySelectorAll('[data-download-link]')
const releaseNote = document.querySelector('[data-release-note]')

function preferWindowsAsset(assets) {
  return assets.find((asset) => /\.exe$/i.test(asset.name))
    ?? assets.find((asset) => /setup|installer|nsis|windows|x64/i.test(asset.name))
    ?? assets.find((asset) => /\.(exe|zip|msi)$/i.test(asset.name))
    ?? assets[0]
}

async function hydrateLatestDownload() {
  try {
    const response = await fetch(releaseApi, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub release request failed: ${response.status}`)
    }

    const release = await response.json()
    const asset = preferWindowsAsset(release.assets ?? [])
    const downloadUrl = asset?.browser_download_url ?? release.html_url ?? fallbackReleaseUrl
    const releaseName = release.tag_name ? `下载 ${release.tag_name}` : '下载最新版本'

    downloadLinks.forEach((link) => {
      link.href = downloadUrl
      if (link.classList.contains('download-card-link')) {
        link.textContent = asset ? asset.name : '打开 GitHub 最新 Release'
      } else {
        link.textContent = releaseName
      }
    })

    if (releaseNote) {
      releaseNote.textContent = asset
        ? '下载地址来自 GitHub 最新 Release，会随发布版本自动更新。'
        : '当前 Release 未找到安装包资源，已指向 GitHub 最新 Release 页面。'
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
