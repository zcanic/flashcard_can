import { useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'flashcard.installBannerDismissedAt'
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7

function isIosDevice() {
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as { standalone?: boolean }).standalone)
}

export default function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (raw) {
      const timestamp = Number(raw)
      if (!Number.isNaN(timestamp) && Date.now() - timestamp < DISMISS_TTL_MS) {
        setDismissed(true)
      }
    }
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }

    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const standalone = useMemo(() => isStandaloneMode(), [])
  const ios = useMemo(() => isIosDevice(), [])

  if (standalone || installed || dismissed) return null
  if (!ios && !promptEvent) return null

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  const triggerInstall = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') {
      setInstalled(true)
    }
    setPromptEvent(null)
  }

  return (
    <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-3 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-wide text-stone-700">安装到主屏幕</div>
          <p className="text-[11px] leading-relaxed text-stone-600">
            {ios
              ? 'iPhone: 点击 Safari 分享按钮，再选择“添加到主屏幕”，可获得接近原生 App 的启动体验。'
              : '安装后可获得更快启动速度、离线访问和全屏沉浸式学习体验。'}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[10px] text-stone-500"
        >
          关闭
        </button>
      </div>
      {promptEvent ? (
        <button
          onClick={() => {
            void triggerInstall()
          }}
          className="mt-3 h-9 rounded-lg border border-rose-200 bg-rose-100 px-3 text-xs font-medium text-stone-700"
        >
          立即安装
        </button>
      ) : null}
    </section>
  )
}
