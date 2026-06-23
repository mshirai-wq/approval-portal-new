'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function CreatePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [subType, setSubType] = useState('通常申請')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  
  // 通常申請
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [payee, setPayee] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) {
      setError('件名を入力してください')
      return
    }

    setLoading(true)
    setError('')

    try {
      let formDetails: any = { description, remarks }

      if (subType === '通常申請') {
        formDetails = {
          ...formDetails,
          amount: Number(amount) || 0,
          paymentDate,
          payee
        }
      }

      const applicationData = {
        appName: '稟議',
        subType,
        title,
        description,
        remarks,
        applicantId: user?.id || '',
        applicantName: user?.name || '',
        applicantDept: user?.department || '',
        applicantTitle: user?.title || '',
        formDetails,
        workflow: {
          currentStep: '部長',
          status: '承認待ち',
          decisionMaker: '社長',
          steps: {
            '部長': {
              approvers: [],
              status: '承認待ち',
              comments: []
            },
            '本部長': {
              approvers: [],
              status: '承認待ち',
              comments: []
            },
            '社長': {
              approvers: [],
              status: '承認待ち',
              comments: []
            },
            '総務管理本部': {
              approvers: [],
              status: '回覧待ち',
              comments: []
            }
          },
          circulations: [],
          confirmedBy: []
        },
        attachments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'applications'), applicationData)
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Error creating application:', err)
      setError('申請の作成に失敗しました: ' + (err.message || '不明なエラー'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← ダッシュボードに戻る
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold mb-6">新規申請作成</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 申請種別 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                申請種別
              </label>
              <select
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="通常申請">通常申請</option>
                <option value="求人稟議（パート・アルバイト採用）">求人稟議（パート・アルバイト採用）</option>
                <option value="求人稟議（キャリア・新卒採用）">求人稟議（キャリア・新卒採用）</option>
                <option value="代表者印捺印申請">代表者印捺印申請</option>
                <option value="営業統括本部長決裁見積申請（300万円未満）">営業統括本部長決裁見積申請（300万円未満）</option>
                <option value="社長決裁見積書申請（300万円以上）">社長決裁見積書申請（300万円以上）</option>
                <option value="協力会社登録">協力会社登録</option>
                <option value="出張旅費申請">出張旅費申請</option>
                <option value="車両リース決裁">車両リース決裁</option>
                <option value="給与情報変更申請">給与情報変更申請</option>
              </select>
            </div>

            {/* 件名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                件名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 詳細説明 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                詳細説明
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 通常申請の項目 */}
            {subType === '通常申請' && (
              <div className="bg-gray-50 p-4 rounded-md space-y-4">
                <h3 className="font-medium text-gray-700">通常申請の詳細</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    金額
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    支払日
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    支払先
                  </label>
                  <input
                    type="text"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* 備考 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                備考
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* ボタン */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '送信中...' : '申請する'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
