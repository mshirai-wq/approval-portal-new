'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { getExpenses, Expense } from '@/lib/appsheet'
import { ArrowLeft, Search, Filter, Clock, CheckCircle, XCircle, Eye } from 'lucide-react'

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
      // 確実を期すため、GAS側からは一旦「全件」を取得し、フィルターはブラウザ側で処理します
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
  }, []) // 初回のみ全件取得

  // ==========================================
  // ブラウザ側で「承認待ち」かつ「自分宛て」を確実に仕分ける
  // ==========================================
  const filteredExpenses = expenses.filter(expense => {
    // 1. ステータスフィルターのチェック（選択が 'all' でない場合は、R列のステータスと一致するか）
    if (filterStatus !== 'all') {
      const currentStatus = (expense.承認ステータス || '').trim()
      if (currentStatus !== filterStatus) {
        return false
      }
    }

    // 2. 承認者メールアドレス（S列）のチェック
    const myEmail = user?.email?.trim().toLowerCase()
    const approverEmail = (expense.承認者メールアドレス || '').trim().toLowerCase()

    if (!myEmail || !approverEmail.includes(myEmail)) {
      return false // 自分宛てではないデータを除外
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
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded">
            <CheckCircle size={12} />
            承認済み
          </span>
        )
      case '却下':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded">
            <XCircle size={12} />
            却下
          </span>
        )
      case '承認待ち':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded">
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold">経費申請一覧</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* フィルターと検索 */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-500" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">すべてのステータス</option>
                <option value="承認待ち">承認待ち</option>
                <option value="承認済み">承認済み</option>
                <option value="却下">却下</option>
              </select>
            </div>

            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="申請者、部署、用途、IDで検索..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 経費申請一覧 */}
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">読み込み中...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-500">現在、あなた宛ての「{filterStatus}」の経費申請はありません</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日付</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請者</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">使用部署</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内容</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">実行金額</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.申請ID} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{expense.申請ID}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(expense.日付)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{expense.申請者}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expense.使用部署}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{expense.内容}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatAmount(expense.実行金額)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(expense.承認ステータス)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => router.push(`/expenses/${expense.申請ID}`)}
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Eye size={16} />
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
      </main>
    </div>
  )
}