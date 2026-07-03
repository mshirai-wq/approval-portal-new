'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter, useParams } from 'next/navigation'
import { getExpense, approveExpense, rejectExpense } from '@/lib/appsheet'
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, AlertCircle, ShieldAlert, FileText, Gavel, Check, ExternalLink } from 'lucide-react'

// AppSheetの型にGAS拡張用のdriveFileIdを内包
interface ExtendedExpense {
  申請ID: string
  日付: string
  申請者: string
  メールアドレス: string
  使用部署: string
  拠点: string
  内容: string
  実行金額: number
  '支払先・注文先'?: string
  支払方法?: string
  経費区分?: string
  事前申請?: string
  備考?: string
  添付資料?: string
  承認ステータス: string
  承認者?: string
  承認者メールアドレス?: string
  承認日時?: string
  承認コメント?: string
  driveFileId?: string // GAS側から送られてくるドライブのファイルID
}

export default function ExpenseDetailPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [expense, setExpense] = useState<ExtendedExpense | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [comment, setComment] = useState('')

  const fetchExpense = async () => {
    try {
      setLoading(true)
      const data = await getExpense(id)
      setExpense(data as ExtendedExpense)
    } catch (err: any) {
      console.error('Error fetching expense:', err)
      setError('経費申請データの取得に失敗しました: ' + (err.message || '不明なエラー'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExpense()
  }, [id])

  // Google DriveのプレビューURL生成ロジック
  const driveUrls = useMemo(() => {
    if (!expense) return null

    if (expense.driveFileId && typeof expense.driveFileId === 'string' && expense.driveFileId.trim() !== '') {
      return {
        preview: `https://drive.google.com/file/d/${expense.driveFileId}/preview`,
        view: `https://drive.google.com/file/d/${expense.driveFileId}/view`
      }
    }
    
    if (expense.添付資料 && expense.添付資料.startsWith('http')) {
      const match = expense.添付資料.match(/\/d\/([a-zA-Z0-9-_]+)/)
      const fileId = match ? match[1] : null
      if (fileId) {
        return {
          preview: `https://drive.google.com/file/d/${fileId}/preview`,
          view: `https://drive.google.com/file/d/${fileId}/view`
        }
      }
    }
    
    return null
  }, [expense])

  const handleApprove = async () => {
    if (!user) return

    try {
      setSubmitting(true)
      // 💡 user.name が undefined だった場合を想定してフォールバックを追加
      await approveExpense(id, user.name || '', comment)
      await fetchExpense()
      setComment('')
    } catch (err: any) {
      console.error('Error approving expense:', err)
      setError('承認に失敗しました: ' + (err.message || '不明なエラー'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!user) return

    try {
      setSubmitting(true)
      // 💡 user.name が undefined だった場合を想定してフォールバックを追加
      await rejectExpense(id, user.name || '', comment)
      await fetchExpense()
      setComment('')
    } catch (err: any) {
      console.error('Error rejecting expense:', err)
      setError('却下に失敗しました: ' + (err.message || '不明なエラー'))
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '承認済み':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full tracking-wide">
            <CheckCircle size={14} />
            承認済み
          </span>
        )
      case '却下':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full tracking-wide">
            <XCircle size={14} />
            却下
          </span>
        )
      case '承認待ち':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full tracking-wide">
            <Clock size={14} />
            {status || '承認待ち'}
          </span>
        )
    }
  }

  // 💡【修正】引数を dateStr?: string に変更し、undefined も受け取れるように型拡張
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('ja-JP')
    } catch {
      return dateStr
    }
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(amount)
  }

  const myEmail = user?.email?.trim().toLowerCase()
  const approverEmail = (expense?.承認者メールアドレス || '').trim().toLowerCase()
  const isMeApprover = myEmail && approverEmail.includes(myEmail)
  
  const canApprove = expense?.承認ステータス === '承認待ち' && isMeApprover

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-sm font-medium animate-pulse">データを読み込み中...</p>
      </div>
    )
  }

  if (error && !expense) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center p-4">
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-2xl max-w-md w-full shadow-2xl">
          <div className="flex items-center gap-3 border-b border-rose-500/10 pb-3 mb-4">
            <AlertCircle size={22} />
            <span className="font-extrabold text-base tracking-wide">通信エラーが発生しました</span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/expenses')}
            className="mt-6 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl border border-slate-700/50 transition-all text-sm tracking-widest"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 antialiased">
      {/* 共通ヘッダー */}
      <header className="sticky top-0 bg-[#111827]/70 backdrop-blur-md border-b border-slate-800/80 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/expenses')}
            className="p-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700/50 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            経費申請詳細
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-5 py-4 rounded-xl mb-6 text-sm font-medium flex items-center gap-2 animate-in fade-in zoom-in duration-300">
            <ShieldAlert size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {expense && (
          <div className="space-y-8">
            
            {/* 1. 基本情報カード */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                <div className="flex items-center gap-2.5">
                  <FileText size={18} className="text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-200 uppercase tracking-wider">基本情報</h2>
                </div>
                {getStatusBadge(expense.承認ステータス)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">申請ID</label>
                  <p className="text-sm font-mono font-semibold text-slate-200 bg-slate-950/40 border border-slate-800/50 px-3 py-2 rounded-xl">{expense.申請ID}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">申請日</label>
                  <p className="text-sm font-semibold text-slate-300 bg-slate-950/40 border border-slate-800/50 px-3 py-2 rounded-xl">{formatDate(expense.日付)}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">申請者氏名</label>
                  <p className="text-sm font-semibold text-slate-200">{expense.申請者}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">メールアドレス</label>
                  <p className="text-sm font-mono text-slate-400 truncate">{expense.メールアドレス}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">使用部署</label>
                  <p className="text-sm font-semibold text-slate-300">{expense.使用部署}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-0.5">所属拠点</label>
                  <p className="text-sm font-semibold text-slate-300">{expense.拠点}</p>
                </div>
              </div>
            </div>

            {/* 2. 経費詳細カード */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4 mb-6">
                <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                <h2 className="text-base font-bold text-slate-200 uppercase tracking-wider">精算内容詳細</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">用途・内容</label>
                  <p className="text-sm text-slate-200 bg-slate-950/20 border border-slate-800/40 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">{expense.内容}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">実行金額</label>
                  <p className="text-3xl font-black text-cyan-400 font-mono tracking-tight">{formatAmount(expense.実行金額)}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">支払先・注文先</label>
                  <p className="text-sm font-semibold text-slate-200 bg-slate-950/40 border border-slate-800/50 px-3 py-2.5 rounded-xl">{expense['支払先・注文先'] || '-'}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">支払方法</label>
                  <p className="text-sm font-semibold text-slate-300">{expense.支払方法 || '-'}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">経費区分</label>
                  <p className="text-sm font-semibold text-slate-300">{expense.経費区分 || '-'}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">事前申請の有無</label>
                  <p className="text-sm font-semibold text-slate-300">{expense.事前申請 || '-'}</p>
                </div>
              </div>

              {expense.備考 && (
                <div className="mt-6 pt-4 border-t border-slate-800/60">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">備考</label>
                  <p className="text-sm text-slate-400 bg-slate-950/20 border border-slate-800/40 p-4 rounded-xl whitespace-pre-wrap">{expense.備考}</p>
                </div>
              )}

              {/* 添付資料プレビューセクション */}
              {expense.添付資料 && (
                <div className="mt-6 pt-4 border-t border-slate-800/60">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">添付資料・証憑プレビュー</label>
                  
                  {driveUrls ? (
                    <div className="space-y-3">
                      <div className="w-full h-[550px] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner relative">
                        <iframe 
                          src={driveUrls.preview}
                          className="w-full h-full border-0"
                          allow="autoplay"
                          title="file-preview"
                        />
                      </div>
                      <div className="text-right">
                        <a 
                          href={driveUrls.view} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 underline group"
                        >
                          Googleドライブで大きく開く
                          <ExternalLink size={12} className="group-hover:translate-x-0.5 transition-transform" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-500 mb-2">⚠️ 現在プレビュー生成用データを準備中です（GAS連携の反映待ち）。登録されているファイル名：</p>
                      <p className="text-sm text-indigo-400 font-medium break-all font-mono">
                        {expense.添付資料}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. 承認情報履歴カード */}
            {(expense.承認ステータス === '承認済み' || expense.承認ステータス === '却下') && (
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4 mb-6">
                  <Gavel size={18} className="text-slate-400" />
                  <h2 className="text-base font-bold text-slate-200 uppercase tracking-wider">最終判定情報</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">最終承認者</label>
                    <p className="text-sm font-semibold text-slate-200">{expense.承認者 || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">処理完了日時</label>
                    <p className="text-sm font-semibold text-slate-300 font-mono">{formatDate(expense.承認日時)}</p>
                  </div>
                </div>

                {expense.承認コメント && (
                  <div className="mt-6 pt-4 border-t border-slate-800/60">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">判定者コメント</label>
                    <p className="text-sm text-slate-300 bg-slate-950/30 border border-slate-800/60 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">
                      {expense.承認コメント}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 4. 承認・却下実行フォーム */}
            {canApprove && (
              <div className="bg-slate-900/60 border border-indigo-500/20 rounded-2xl p-6 shadow-[0_0_30px_rgba(99,102,241,0.1)] animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4 mb-6">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></div>
                  <h2 className="text-base font-bold text-slate-200 uppercase tracking-wider">承認・却下アクション</h2>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-0.5">
                      コメント（オプション）
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      placeholder="承認、または却下の理由や伝達事項を記入してください..."
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm leading-relaxed"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={submitting}
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-950/20 hover:shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-widest flex items-center justify-center gap-2 uppercase"
                    >
                      {submitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      承認する
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={submitting}
                      className="flex-1 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black py-3.5 px-4 rounded-xl shadow-lg shadow-rose-950/20 hover:shadow-rose-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-widest flex items-center justify-center gap-2 uppercase"
                    >
                      {submitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <XCircle size={16} />
                      )}
                      却下する
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}