'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter, useParams } from 'next/navigation'
import { getExpense, approveExpense, rejectExpense, Expense } from '@/lib/appsheet'
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react'

export default function ExpenseDetailPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [expense, setExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [comment, setComment] = useState('')

  const fetchExpense = async () => {
    try {
      setLoading(true)
      const data = await getExpense(id)
      setExpense(data)
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

  const handleApprove = async () => {
    if (!user) return

    try {
      setSubmitting(true)
      await approveExpense(id, user.name, comment)
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
      await rejectExpense(id, user.name, comment)
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
          <span className="inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold bg-green-100 text-green-800 rounded-full">
            <CheckCircle size={16} />
            承認済み
          </span>
        )
      case '却下':
        return (
          <span className="inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold bg-red-100 text-red-800 rounded-full">
            <XCircle size={16} />
            却下
          </span>
        )
      case '承認待ち':
      default:
        return (
          <span className="inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold bg-yellow-100 text-yellow-800 rounded-full">
            <Clock size={16} />
            {status || '承認待ち'}
          </span>
        )
    }
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

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(amount)
  }

  // ==========================================
  // 【修正】ステータスが「承認待ち」かつ「自分が承認者」の時だけボタンを出す
  // ==========================================
  const myEmail = user?.email?.trim().toLowerCase()
  const approverEmail = (expense?.承認者メールアドレス || '').trim().toLowerCase()
  const isMeApprover = myEmail && approverEmail.includes(myEmail)
  
  const canApprove = expense?.承認ステータス === '承認待ち' && isMeApprover

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="inline-block animate-spin text-blue-600" size={32} />
          <p className="mt-2 text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error && !expense) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-md">
          <div className="flex items-center gap-2">
            <AlertCircle size={20} />
            <span className="font-medium">エラー</span>
          </div>
          <p className="mt-2">{error}</p>
          <button
            onClick={() => router.push('/expenses')}
            className="mt-4 text-red-600 hover:text-red-800 underline"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/expenses')}
              className="text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold">経費申請詳細</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {expense && (
          <div className="space-y-6">
            {/* 基本情報カード */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">基本情報</h2>
                {getStatusBadge(expense.承認ステータス)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">申請ID</label>
                  <p className="text-gray-900 font-medium">{expense.申請ID}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">日付</label>
                  <p className="text-gray-900">{formatDate(expense.日付)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">申請者</label>
                  <p className="text-gray-900">{expense.申請者}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">メールアドレス</label>
                  <p className="text-gray-900">{expense.メールアドレス}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">使用部署</label>
                  <p className="text-gray-900">{expense.使用部署}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">拠点</label>
                  <p className="text-gray-900">{expense.拠点}</p>
                </div>
              </div>
            </div>

            {/* 経費詳細カード */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold mb-4">経費詳細</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">内容</label>
                  <p className="text-gray-900">{expense.内容}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">実行金額</label>
                  <p className="text-2xl font-bold text-gray-900">{formatAmount(expense.実行金額)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">支払先・注文先</label>
                  <p className="text-gray-900">{expense['支払先・注文先']}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">支払方法</label>
                  <p className="text-gray-900">{expense.支払方法}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">経費区分</label>
                  <p className="text-gray-900">{expense.経費区分}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">事前申請</label>
                  <p className="text-gray-900">{expense.事前申請}</p>
                </div>
              </div>

              {expense.備考 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-500 mb-1">備考</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded">{expense.備考}</p>
                </div>
              )}

              {expense.添付資料 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-500 mb-1">添付資料</label>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded">{expense.添付資料}</p>
                </div>
              )}
            </div>

            {/* 承認情報カード */}
            {(expense.承認ステータス === '承認済み' || expense.承認ステータス === '却下') && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold mb-4">承認情報</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">承認者</label>
                    <p className="text-gray-900">{expense.承認者}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">承認日時</label>
                    <p className="text-gray-900">{formatDate(expense.承認日時)}</p>
                  </div>
                </div>

                {expense.承認コメント && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      承認コメント
                    </label>
                    <p className="text-gray-900 bg-gray-50 p-3 rounded">
                      {expense.承認コメント}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 承認・却下フォーム */}
            {canApprove && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold mb-4">承認・却下</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      コメント（オプション）
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      placeholder="承認・却下の理由を入力してください..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleApprove}
                      disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <CheckCircle size={18} />
                      )}
                      承認する
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <XCircle size={18} />
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