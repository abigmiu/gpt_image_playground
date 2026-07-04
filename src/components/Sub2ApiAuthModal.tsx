import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  getSub2ApiPublicSettings,
  loginSub2Api,
  loginSub2Api2FA,
  requestSub2ApiCurrentUserRefresh,
  registerSub2Api,
  sendSub2ApiVerifyCode,
  setSub2ApiAuthSession,
  type Sub2ApiPublicSettings,
} from '../lib/sub2apiAuth'

interface Sub2ApiAuthModalProps {
  onClose: () => void
}

type AuthMode = 'login' | 'register' | '2fa'

function isAuthPayloadWithAccessToken(payload: Record<string, unknown> | null | undefined): payload is {
  access_token: string
  refresh_token?: string
} {
  return Boolean(payload && typeof payload.access_token === 'string')
}

export default function Sub2ApiAuthModal({ onClose }: Sub2ApiAuthModalProps) {
  const showToast = useStore((s) => s.showToast)
  const modalRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<AuthMode>('login')
  const [settings, setSettings] = useState<Sub2ApiPublicSettings | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  useEffect(() => {
    let cancelled = false

    void getSub2ApiPublicSettings()
      .then((publicSettings) => {
        if (cancelled) return
        setSettings(publicSettings)
        if (!publicSettings.registration_enabled) setMode('login')
      })
      .catch((err) => {
        if (cancelled) return
        showToast(err instanceof Error ? err.message : String(err), 'error')
      })

    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => {
      setCountdown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const finishAuth = (payload: Record<string, unknown> | null | undefined) => {
    if (!isAuthPayloadWithAccessToken(payload)) throw new Error('登录结果缺少访问令牌')
    setSub2ApiAuthSession({
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : '',
    })
    requestSub2ApiCurrentUserRefresh()
    onClose()
    showToast('登录成功', 'success')
  }

  const handleSendCode = async () => {
    if (!email.trim()) {
      showToast('请输入邮箱', 'error')
      return
    }
    setSendingCode(true)
    try {
      const result = await sendSub2ApiVerifyCode({ email: email.trim() })
      setCountdown(result.countdown)
      showToast('验证码已发送', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = async () => {
    if (mode === '2fa') {
      if (!totpCode.trim()) {
        showToast('请输入验证码', 'error')
        return
      }
      setLoading(true)
      try {
        const payload = await loginSub2Api2FA({
          tempToken,
          totpCode: totpCode.trim(),
        })
        finishAuth(payload as Record<string, unknown>)
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!email.trim() || !password.trim()) {
      showToast('请输入邮箱和密码', 'error')
      return
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        const payload = await registerSub2Api({
          email: email.trim(),
          password,
          verifyCode: verifyCode.trim(),
          invitationCode: invitationCode.trim(),
          promoCode: promoCode.trim(),
        })
        finishAuth(payload as Record<string, unknown>)
        return
      }

      const payload = await loginSub2Api({
        email: email.trim(),
        password,
      })
      if (payload.requires_2fa && typeof payload.temp_token === 'string') {
        setTempToken(payload.temp_token)
        setTotpCode('')
        setMode('2fa')
        return
      }
      finishAuth(payload as Record<string, unknown>)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {mode !== '2fa' ? (
          <div className="mb-4 flex rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-100/70 dark:bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 px-4 py-1.5 rounded-lg text-sm transition-colors ${mode === 'login' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              登录
            </button>
            {settings?.registration_enabled !== false ? (
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`flex-1 px-4 py-1.5 rounded-lg text-sm transition-colors ${mode === 'register' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                注册
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {mode === '2fa' ? (
            <>
              <input
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                placeholder="6位验证码"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '处理中' : '确认'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setTempToken('')
                  setTotpCode('')
                }}
                className="w-full rounded-xl border border-gray-200 dark:border-white/[0.08] py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
              >
                返回
              </button>
            </>
          ) : (
            <>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="邮箱"
                autoComplete="email"
                className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="密码"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
              />
              {mode === 'register' && settings?.email_verify_enabled ? (
                <div className="flex gap-2">
                  <input
                    value={verifyCode}
                    onChange={(event) => setVerifyCode(event.target.value)}
                    placeholder="验证码"
                    className="min-w-0 flex-1 rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendingCode || countdown > 0}
                    className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {countdown > 0 ? `${countdown}s` : '发送'}
                  </button>
                </div>
              ) : null}
              {mode === 'register' && settings?.invitation_code_enabled ? (
                <input
                  value={invitationCode}
                  onChange={(event) => setInvitationCode(event.target.value)}
                  placeholder="邀请码"
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
              ) : null}
              {mode === 'register' && settings?.promo_code_enabled ? (
                <input
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value)}
                  placeholder="优惠码"
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
              ) : null}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '处理中' : mode === 'register' ? '注册' : '登录'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
