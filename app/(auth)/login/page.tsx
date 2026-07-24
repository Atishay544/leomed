'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

type Tab = 'password' | 'otp'

const TABS: { key: Tab; label: string }[] = [
  { key: 'password', label: 'Password' },
  { key: 'otp', label: 'Email OTP' },
  // { key: 'phone', label: 'Mobile OTP' },  // disabled
]

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('password')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // const [phone, setPhone] = useState('')  // disabled — mobile OTP
  const [password, setPassword] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [isSignUp, setIsSignUp] = useState(false)
  const [step, setStep] = useState<'input' | 'otp'>('input')
  // 'signup' = verifying new account, 'email' = passwordless login
  const [otpType, setOtpType] = useState<'signup' | 'email'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  const otp = otpDigits.join('')

  function switchTab(t: Tab) {
    setTab(t)
    setStep('input')
    setOtpType('email')
    setError('')
    setSuccess('')
    setIsSignUp(false)
    setName('')
    setOtpDigits(['', '', '', '', '', ''])
  }

  async function apiFetch(url: string, body: object): Promise<{ ok: boolean; data: any }> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      let data: any = {}
      try { data = await res.json() } catch { data = {} }
      return { ok: res.ok, data }
    } catch {
      return { ok: false, data: { error: 'Network error. Please check your connection.' } }
    }
  }

  // ── Password ──────────────────────────────────────────────────────────────
  async function handlePasswordAuth() {
    setLoading(true); setError('')
    if (isSignUp) {
      const { ok, data } = await apiFetch('/api/auth/signup', { email, password, fullName: name.trim() })
      setLoading(false)
      if (!ok) return setError(data.error ?? 'Sign-up failed. Please try again.')
      setOtpType('signup')
      setOtpDigits(['', '', '', '', '', ''])
      setStep('otp')
      setResendCountdown(60)
      setSuccess(`Verification code sent to ${email}`)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) return setError(error.message)
      router.push('/')
    }
  }

  // ── Email OTP — send (passwordless login, via Resend) ────────────────────
  async function handleSendEmailOtp() {
    if (!email.trim()) { setError('Enter your email address'); return }
    setLoading(true); setError('')
    const { ok, data } = await apiFetch('/api/auth/send-otp', { email })
    setLoading(false)
    if (!ok) return setError(data.error ?? 'Failed to send code. Please try again.')
    setOtpType('email')
    setStep('otp')
    setResendCountdown(60)
    setSuccess(`Code sent to ${email}`)
  }

  // ── OTP — verify (signup or passwordless login) ───────────────────────────
  async function handleVerifyOtp() {
    setLoading(true); setError('')

    if (otpType === 'signup') {
      const { ok, data } = await apiFetch('/api/auth/verify-signup-otp', { email, otp, password })
      if (!ok) { setLoading(false); return setError(data.error ?? 'Verification failed. Please try again.') }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (signInErr) return setError(signInErr.message)
    } else {
      const { ok, data } = await apiFetch('/api/auth/verify-email-otp', { email, otp })
      setLoading(false)
      if (!ok) return setError(data.error ?? 'Verification failed. Please try again.')
      window.location.href = data.redirectTo
      return
    }

    router.push('/account')
  }

  // ── Google (disabled) ─────────────────────────────────────────────────────
  // async function handleGoogle() {
  //   setLoading(true)
  //   await supabase.auth.signInWithOAuth({
  //     provider: 'google',
  //     options: { redirectTo: `${location.origin}/auth/callback` },
  //   })
  // }

  // ── Phone OTP — send (disabled) ───────────────────────────────────────────
  // async function handlePhoneOtp() {
  //   setLoading(true); setError('')
  //   const formatted = phone.startsWith('+') ? phone : `+91${phone}`
  //   const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
  //   setLoading(false)
  //   if (error) return setError(error.message)
  //   setStep('otp')
  //   setResendCountdown(60)
  //   setSuccess(`OTP sent to +91 ${phone}`)
  // }

  // ── Phone OTP — verify (disabled) ────────────────────────────────────────
  // async function handlePhoneVerify() {
  //   setLoading(true); setError('')
  //   const formatted = phone.startsWith('+') ? phone : `+91${phone}`
  //   const { error } = await supabase.auth.verifyOtp({ phone: formatted, token: otp, type: 'sms' })
  //   setLoading(false)
  //   if (error) return setError(error.message)
  //   router.push('/')
  // }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-12">

      {/* ── Animated background orbs ── */}
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
        {[
          ['15%', '10%', '50vw', 12, 0], ['75%', '65%', '45vw', 14, 4],
          ['80%', '8%', '38vw', 11, 2], ['8%', '72%', '42vw', 13, 6],
        ].map(([x, y, s, d, dl], i) => (
          <motion.div key={i} className="absolute rounded-full"
            style={{
              left: x as string, top: y as string, width: s as string, height: s as string,
              transform: 'translate(-50%,-50%)',
              background: i % 2 === 0
                ? 'radial-gradient(circle, hsl(250 84% 54% / 0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, hsl(270 84% 64% / 0.10) 0%, transparent 70%)',
            }}
            animate={{ x: ['0%', '8%', '-5%', '3%', '0%'], y: ['0%', '-6%', '8%', '-3%', '0%'] }}
            transition={{ duration: d as number, delay: dl as number, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        {/* ── Brand header ── */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <motion.h1
              className="text-3xl font-extrabold tracking-tight text-gray-900"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              Leomed Pharma
            </motion.h1>
          </Link>
          <p className="text-sm text-gray-500 mt-1.5">OTC Medicines &amp; Wellness Online</p>
        </div>

        {/* ── Card ── */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white shadow-2xl shadow-emerald-100/50 overflow-hidden">

          {/* Tab bar */}
          <div className="relative flex bg-gray-50/80 border-b border-gray-100 p-1.5 gap-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => switchTab(t.key)}
                className="relative flex-1 py-2 text-xs font-semibold rounded-xl transition-colors z-10"
                style={{ color: tab === t.key ? '#09090b' : '#9ca3af' }}>
                {tab === t.key && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 bg-white rounded-xl shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Card body — fixed min-height prevents card from resizing between tabs */}
          <div className="p-8 overflow-hidden min-h-[380px] flex flex-col">

            {/* Alerts */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
                  className="mb-4 overflow-hidden">
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-2xl border border-red-100 flex items-start gap-2">
                    <span className="mt-0.5">⚠</span>{error}
                  </div>
                </motion.div>
              )}
              {success && !error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
                  className="mb-4 overflow-hidden">
                  <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-2xl border border-green-100 flex items-center gap-2">
                    <span>✓</span>{success}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Heading + form in one crossfade block — no slide, instant direction, no lag */}
            <AnimatePresence mode="popLayout">
              <motion.div key={`${tab}-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col gap-5"
              >
                {/* Heading */}
                <div className="text-center">
                  <h2 className="text-xl font-bold text-gray-900">
                    {tab === 'password' && step === 'input' && (isSignUp ? 'Create account' : 'Welcome back')}
                    {tab === 'password' && step === 'otp' && 'Verify your email'}
                    {tab === 'otp' && step === 'input' && 'Sign in without password'}
                    {tab === 'otp' && step === 'otp' && 'Enter your code'}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {tab === 'password' && step === 'input' && (isSignUp ? 'Fill in your details below' : 'Sign in to your account')}
                    {tab === 'password' && step === 'otp' && `Enter the 6-digit code sent to ${email}`}
                    {tab === 'otp' && step === 'input' && "We'll email you a 6-digit code — no password needed"}
                    {tab === 'otp' && step === 'otp' && `6-digit code sent to ${email}`}
                  </p>
                </div>

                {/* ── Password: input ── */}
                {tab === 'password' && step === 'input' && (
                  <div className="space-y-3">
                    {isSignUp && (
                      <InputField type="text" placeholder="Full name" value={name} onChange={setName} />
                    )}
                    <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} />
                    <InputField type="password" placeholder="Password" value={password} onChange={setPassword} />
                    <PrimaryButton onClick={handlePasswordAuth} loading={loading} disabled={!email || !password || (isSignUp && !name.trim())}>
                      {isSignUp ? 'Create account' : 'Sign in'}
                    </PrimaryButton>
                    <div className="flex items-center justify-between pt-1">
                      <button onClick={() => { setIsSignUp(s => !s); setError('') }}
                        className="text-xs text-gray-500 hover:text-gray-800 transition">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                        <span className="font-semibold ml-1">{isSignUp ? 'Sign in' : 'Sign up'}</span>
                      </button>
                      {!isSignUp && (
                        <button onClick={() => { setTab('otp'); setStep('input'); setError('') }}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold transition">
                          Forgot password?
                        </button>
                      )}
                    </div>

                    {/* ── Google (disabled) ──
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 font-medium">or</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <motion.button onClick={handleGoogle} disabled={loading}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 rounded-2xl py-3.5 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50">
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Continue with Google
                    </motion.button>
                    ── end Google disabled ── */}

                  </div>
                )}

                {/* ── Password: OTP verify after signup ── */}
                {tab === 'password' && step === 'otp' && (
                  <div className="space-y-5">
                    <OtpBoxes digits={otpDigits} onChange={setOtpDigits} />
                    <PrimaryButton onClick={handleVerifyOtp} loading={loading} disabled={otp.length < 6}>
                      Verify &amp; Activate Account
                    </PrimaryButton>
                    <p className="text-xs text-red-500 font-medium text-center">
                      Can't find it? Check your <strong>spam / junk folder</strong>.
                    </p>
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setStep('input'); setOtpDigits(['', '', '', '', '', '']); setError(''); setPassword('') }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition">← Change email</button>
                      {resendCountdown > 0 ? (
                        <span className="text-xs text-gray-400">Resend in {resendCountdown}s</span>
                      ) : (
                        <button onClick={handlePasswordAuth} disabled={loading}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold transition disabled:opacity-40">
                          Resend code
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Email OTP: enter email ── */}
                {tab === 'otp' && step === 'input' && (
                  <div className="space-y-3">
                    <InputField type="email" placeholder="Email address" value={email} onChange={setEmail} />
                    <PrimaryButton onClick={handleSendEmailOtp} loading={loading} disabled={!email.trim()}>
                      Send OTP Code
                    </PrimaryButton>
                    <p className="text-center text-xs text-gray-400">
                      We'll email you a 6-digit code — no password needed
                    </p>
                  </div>
                )}

                {/* ── Email OTP: enter code ── */}
                {tab === 'otp' && step === 'otp' && (
                  <div className="space-y-5">
                    <OtpBoxes digits={otpDigits} onChange={setOtpDigits} />
                    <PrimaryButton onClick={handleVerifyOtp} loading={loading} disabled={otp.length < 6}>
                      Verify &amp; Sign in
                    </PrimaryButton>
                    <p className="text-xs text-red-500 font-medium text-center">
                      Can't find it? Check your <strong>spam / junk folder</strong>.
                    </p>
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setStep('input'); setOtpDigits(['', '', '', '', '', '']); setError('') }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition">← Change email</button>
                      {resendCountdown > 0 ? (
                        <span className="text-xs text-gray-400">Resend in {resendCountdown}s</span>
                      ) : (
                        <button onClick={handleSendEmailOtp} disabled={loading}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold transition disabled:opacity-40">
                          Didn't receive it? Resend
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Phone: enter number (disabled) ──
                {tab === 'phone' && step === 'input' && (
                  <div className="space-y-3">
                    <div className="flex border-2 border-gray-200 rounded-2xl overflow-hidden focus-within:border-emerald-400 transition-colors">
                      <span className="bg-gray-50 px-4 flex items-center text-gray-500 text-sm border-r-2 border-gray-200 font-medium shrink-0">+91</span>
                      <input type="tel" placeholder="10-digit number" value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="flex-1 px-4 py-3.5 text-sm bg-white outline-none text-gray-900 placeholder-gray-400"
                        maxLength={10} />
                    </div>
                    <PrimaryButton onClick={handlePhoneOtp} loading={loading} disabled={phone.length < 10}>
                      Send OTP
                    </PrimaryButton>
                  </div>
                )}
                ── end Phone enter number ── */}

                {/* ── Phone: enter code (disabled) ──
                {tab === 'phone' && step === 'otp' && (
                  <div className="space-y-5">
                    <OtpBoxes digits={otpDigits} onChange={setOtpDigits} />
                    <PrimaryButton onClick={handlePhoneVerify} loading={loading} disabled={otp.length < 6}>
                      Verify OTP
                    </PrimaryButton>
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setStep('input'); setOtpDigits(['', '', '', '', '', '']) }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition">← Change number</button>
                      {resendCountdown > 0 ? (
                        <span className="text-xs text-gray-400">Resend in {resendCountdown}s</span>
                      ) : (
                        <button onClick={handlePhoneOtp} disabled={loading}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold transition disabled:opacity-40">
                          Didn't receive it? Resend
                        </button>
                      )}
                    </div>
                  </div>
                )}
                ── end Phone enter code ── */}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">

          By signing in you agree to our{' '}
          <Link href="/terms" className="text-emerald-500 hover:underline">Terms</Link>
          {' '}&amp;{' '}
          <Link href="/privacy-policy" className="text-emerald-500 hover:underline">Privacy Policy</Link>
        </p>
      </motion.div>
    </div>
  )
}

// ── OTP 6-box input ───────────────────────────────────────────────────────────
function OtpBoxes({ digits, onChange }: { digits: string[]; onChange: (d: string[]) => void }) {
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus()
  }

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = digit
    onChange(next)
    if (digit && i < 5) refs[i + 1].current?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...digits]
    pasted.split('').forEach((c, i) => { next[i] = c })
    onChange(next)
    refs[Math.min(pasted.length, 5)].current?.focus()
  }

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          whileFocus={{ scale: 1.08, borderColor: '#6d28d9' }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="w-11 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl outline-none text-gray-900 focus:border-emerald-500 transition-colors bg-white"
        />
      ))}
    </div>
  )
}

// ── Reusable input ────────────────────────────────────────────────────────────
function InputField({ type, placeholder, value, onChange }: {
  type: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
  const [showPw, setShowPw] = useState(false)
  const isPassword = type === 'password'

  if (isPassword) {
    return (
      <div className="relative">
        <motion.input
          type={showPw ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          whileFocus={{ scale: 1.005 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 pr-12 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 transition-colors bg-white [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_white]"
        />
        <button
          type="button"
          onClick={() => setShowPw(v => !v)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
          tabIndex={-1}
          aria-label={showPw ? 'Hide password' : 'Show password'}
        >
          {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    )
  }

  return (
    <motion.input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      whileFocus={{ scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 transition-colors bg-white [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_white]"
    />
  )
}

// ── Primary button ────────────────────────────────────────────────────────────
function PrimaryButton({ onClick, loading, disabled, children }: {
  onClick: () => void; loading: boolean; disabled: boolean; children: React.ReactNode
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={loading || disabled}
      whileHover={(!loading && !disabled) ? { scale: 1.01 } : {}}
      whileTap={(!loading && !disabled) ? { scale: 0.98 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all bg-gray-900 text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
    >
      <AnimatePresence mode="wait">
        <motion.span key={loading ? 'loading' : 'idle'}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center gap-2">
          {loading ? (
            <>
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              Processing…
            </>
          ) : children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
