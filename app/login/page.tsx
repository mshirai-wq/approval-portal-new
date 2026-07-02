'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
// スマホエラーを回避するためにFirebase Authのポップアップ機能を直接インポート
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase' 
import { LogIn, UserPlus, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { signIn, signUp } = useAuth()
  const router = useRouter()

  // 【修正】スマホのストレージ制限に引っかからないポップアップ方式へ変更
  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    
    try {
      const provider = new GoogleAuthProvider()
      // リダイレクトではなく別窓（ポップアップ）で認証を通すため、sessionStorageエラーが起きません
      await signInWithPopup(auth, provider)
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Google Sign-In Error:', err)
      if (err.code === 'auth/popup-blocked') {
        setError('ポップアップがブロックされました。ブラウザの設定を許可してください。')
      } else {
        setError('Googleログインに失敗しました。もう一度お試しください。')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        await signIn(email, password)
      } else {
        await signUp(email, password, name, title, department)
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 antialiased flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm">
        
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 mb-3">
            {isLogin ? <LogIn size={28} /> : <UserPlus size={24} />}
          </div>
          <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            {isLogin ? 'ポータルにログイン' : '新規アカウント登録'}
          </h1>
          <p className="text-slate-500 text-xs mt-1">社内承認・回覧管理システム</p>
        </div>
        
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl mb-6 text-xs font-medium flex items-center gap-2 animate-in fade-in zoom-in duration-300">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-5">
          {/* Googleログインボタン（デザインをシックなダークトーンに統合） */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 py-3 px-4 rounded-xl hover:bg-slate-900 hover:border-slate-700 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleアカウントで続行
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-800/80"></div>
            <span className="flex-shrink mx-4 text-slate-600 text-xs uppercase tracking-widest font-bold">または</span>
            <div className="flex-grow border-t border-slate-800/80"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">氏名</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="山田 太郎"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">役職</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder="主任"
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">所属部門</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      required
                      placeholder="営業管理本部"
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder••••••••
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-950/50 transition-all duration-200 text-sm tracking-widest mt-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                isLogin ? 'ログインする' : 'アカウントを作成する'
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setError('')
              setIsLogin(!isLogin)
            }}
            className="text-xs font-semibold text-slate-400 hover:text-indigo-400 transition-colors"
          >
            {isLogin ? 'アカウントをお持ちでない方はこちら ➔' : '既にアカウントをお持ちの方はこちら ➔'}
          </button>
        </div>
      </div>
    </div>
  )
}