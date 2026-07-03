'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { getExpenses, Expense } from '@/lib/appsheet'
import { ArrowLeft, Search, Filter, Clock, CheckCircle, XCircle, Eye, ChevronDown, ShieldAlert } from 'lucide-react'

export default function ExpensesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // 初期フィルターを「承認待ち」に設定
  const [filterStatus, setFilterStatus] = useState<string>('承認待ち')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchExpenses = async () => {
    try {
      setLoading(true)
      const data = await getExpenses(undefined)
      setExpenses(data)
    } catch (err: any) {
      console.error('Error fetching expenses:', err)
      setError('経費申請データの取得に失敗しました: ' + (err.message || '不明なエラー'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

  // ==========================================
  // ブラウザ側での仕分け処理
  // ==========================================
  const filteredExpenses = expenses.filter(expense => {
    // 1. ステータスフィルターのチェック
    if (filterStatus !== 'all') {
      const currentStatus = (expense.承認ステータス || '').trim()
      if (currentStatus !== filterStatus) {
        return false
      }
    }

    // 2. 承認者メールアドレスのチェック
    const myEmail = user?.email?.trim().toLowerCase()
    const approverEmail = (expense.承認者メールアドレス || '').trim().toLowerCase()

    if (!myEmail || !approverEmail.includes(myEmail)) {
      return false
    }

    // 3. 検索キーワードのチェック
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        expense.申請者?.toLowerCase().includes(query) ||
        expense.使用部署?.toLowerCase().includes(query) ||
        expense.内容?.toLowerCase().includes(query) ||
        expense.申請ID?.toLowerCase().includes(query)
      )
    }
    return true
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '承認済み':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full tracking-wide">
            <CheckCircle size={12} />
            承認済み
          </span>
        )
      case '却下':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full tracking-wide">
            <XCircle size={12} />
            却下
          </span>
        )
      case '承認待ち':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full tracking-wide">
            <Clock size={12} />
            {status || '承認待ち'}
          </span>
        )
    }
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('ja-JP')
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 antialiased">
      {/* 共通ヘッダー */}
      <header className="sticky top-0 bg-[#111827]/70 backdrop-blur-md border-b border-slate-800/80 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="p-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700/50 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            経費申請一覧
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-5 py-4 rounded-xl mb-6 text-sm font-medium flex items-center gap-2 animate-in fade-in zoom-in duration-300">
            <ShieldAlert size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* フィルターと検索セクション */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* クッキリ見えるドロップダウン対策 */}
            <div className="relative flex items-center min-w-[200px]">
              <Filter size={16} className="absolute left-4 text-slate-500 pointer-events-none" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all appearance-none cursor-pointer text-sm"
              >
                <option value="all">すべてのステータス</option>
                <option value="承認待ち">承認待ち</option>
                <option value="承認済み">承認済み</option>
                <option value="却下">却下</option>
              </select>
              <ChevronDown size={16} className="absolute right-4 text-slate-400 pointer-events-none" />
            </div>

            {/* 検索入力ボックス */}
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="申請者、使用部門、件名でサクッと検索..."
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* ローディング表示 */}
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse flex items-center justify-center gap-2 font-medium">
            データを読み込み中...
          </div>
        ) : circulations.length === 0 ? (
          /* データ空時のコンテナー */
          <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
            表示条件に一致する経費申請はありません
          </div>
        ) : (
          /* メインデータテーブル */
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4 text-left font-mono">申請ID</th>
                    <th className="px-6 py-4 text-left">日付</th>
                    <th className="px-6 py-4 text-left">申請者</th>
                    <th className="px-6 py-4 text-left">使用部署</th>
                    <th className="px-6 py-4 text-left">内容</th>
                    <th className="px-6 py-4 text-right">実行金額</th>
                    <th className="px-6 py-4 text-center">ステータス</th>
                    <th className="px-6 py-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.申請ID} className="hover:bg-slate-800/40 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-300 font-mono">{expense.申請ID}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 font-mono">{formatDate(expense.日付)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{expense.申請者}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{expense.使用部署}</td>
                      <td className="px-6 py-4 text-sm text-slate-300 max-w-xs truncate">{expense.内容}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-cyan-400 text-right font-mono">{formatAmount(expense.実行金額)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">{getStatusBadge(expense.承認ステータス)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <button
                          type="button"
                          onClick={() => router.push(`/expenses/${expense.申請ID}`)}
                          className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-500/5 hover:bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 transition-all text-xs"
                        >
                          <Eye size={14} />
                          詳細
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 🛠️ データが0件の時だけ表示される、お揃いの近未来風デバッグ調査パネル */}
        {!loading && filteredExpenses.length === 0 && (
          <div className="mt-8 text-left bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl text-xs font-mono max-w-3xl mx-auto space-y-3 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-indigo-400 text-sm border-b border-slate-800 pb-2">
              <span>🔍</span>
              <span>データ不一致の原因調査パネル</span>
            </div>
            <div className="text-slate-400 space-y-1.5">
              <p>・ログイン中のユーザー氏名: <span className="font-bold text-slate-200">{user?.name || '取得不可'}</span></p>
              <p>・ログイン中のユーザーEmail: <span className="font-bold text-rose-400">{user?.email || '⚠️ 空っぽです（これが原因で弾かれています）'}</span></p>
              <p>・AppSheetから読み込めた全社総件数: <span className="font-bold text-cyan-400">{expenses.length} 件</span></p>
            </div>
            
            {expenses.length > 0 && (
              <div className="mt-4 pt-2 border-t border-slate-900">
                <p className="font-bold text-slate-400 mb-2">▼ AppSheet側にある「最初の1件」の生データ状態：</p>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-400 overflow-x-auto text-[11px] leading-relaxed">
                  {JSON.stringify({
                    申請ID: expenses[0]['申請ID'],
                    申請者: expenses[0]['申請者'],
                    承認ステータス: expenses[0]['承認ステータス'],
                    承認者メールアドレス: expenses[0]['承認者メールアドレス']
                  }, null, 2)}
                </pre>
                <p className="text-slate-500 mt-2 text-[11px]">※ここの「承認ステータス」や「承認者メールアドレス」の表記が、ログイン中の情報と完全に一致している必要があります。</p>
              </div>
            )}
          </div>
        )}
      </main>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  )
}