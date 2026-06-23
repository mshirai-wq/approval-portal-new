'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter, useParams } from 'next/navigation'
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const runtime = 'edge'

interface Application {
  id: string
  appName: string
  subType: string
  title: string
  description: string
  remarks: string
  applicantName: string
  applicantDept: string
  applicantTitle: string
  formDetails: any
  workflow: {
    currentStep: string
    status: string
    steps: any
  }
  createdAt: any
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id || ''
  const { user } = useAuth()
  const router = useRouter()
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const docRef = doc(db, 'applications', id)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setApplication({ id: docSnap.id, ...docSnap.data() } as Application)
        }
      } catch (error) {
        console.error('Error fetching application:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchApplication()
  }, [id])

  const handleAction = async (actionType: 'approve' | 'reject') => {
    if (!application || !user) return

    setAction(actionType)
    setProcessing(true)

    try {
      // Update application status
      const newStatus = actionType === 'approve' ? '承認済み' : '却下'
      await updateDoc(doc(db, 'applications', application.id), {
        'workflow.status': newStatus,
        'workflow.currentStep': actionType === 'approve' ? '次のステップ' : '却下',
        updatedAt: serverTimestamp()
      })

      // Add approval history
      await addDoc(collection(db, 'approvals'), {
        applicationId: application.id,
        stepName: application.workflow.currentStep,
        approverId: user.id,
        approverName: user.name,
        action: actionType,
        comment,
        createdAt: serverTimestamp()
      })

      router.push('/dashboard')
    } catch (error) {
      console.error('Error processing approval:', error)
      alert('処理に失敗しました')
    } finally {
      setProcessing(false)
      setAction(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    )
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">申請が見つかりません</div>
      </div>
    )
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">{application.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{application.appName}</span>
              <span>•</span>
              <span>{application.subType}</span>
              <span>•</span>
              <span className={`px-2 py-1 rounded text-xs ${
                application.workflow.status === '承認待ち' ? 'bg-yellow-100 text-yellow-800' :
                application.workflow.status === '承認済み' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {application.workflow.status}
              </span>
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div>
              <h3 className="font-medium text-gray-700 mb-2">申請者情報</h3>
              <div className="text-sm text-gray-600">
                <p>氏名: {application.applicantName}</p>
                <p>所属: {application.applicantDept}</p>
                <p>役職: {application.applicantTitle}</p>
              </div>
            </div>

            <div>
              <h3 className="font-medium text-gray-700 mb-2">詳細説明</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{application.description}</p>
            </div>

            {application.formDetails && (
              <div>
                <h3 className="font-medium text-gray-700 mb-2">詳細情報</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  {application.formDetails.amount && (
                    <p>金額: ¥{application.formDetails.amount.toLocaleString()}</p>
                  )}
                  {application.formDetails.paymentDate && (
                    <p>支払日: {application.formDetails.paymentDate}</p>
                  )}
                  {application.formDetails.payee && (
                    <p>支払先: {application.formDetails.payee}</p>
                  )}
                </div>
              </div>
            )}

            {application.remarks && (
              <div>
                <h3 className="font-medium text-gray-700 mb-2">備考</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{application.remarks}</p>
              </div>
            )}

            <div className="text-sm text-gray-500">
              作成日: {application.createdAt ? new Date(application.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
            </div>
          </div>

          {application.workflow.status === '承認待ち' && (
            <div className="border-t pt-6 mt-6">
              <h3 className="font-medium text-gray-700 mb-4">承認処理</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    コメント
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="承認/却下のコメントを入力してください"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleAction('approve')}
                    disabled={processing}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing && action === 'approve' ? '処理中...' : '承認'}
                  </button>
                  <button
                    onClick={() => handleAction('reject')}
                    disabled={processing}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing && action === 'reject' ? '処理中...' : '却下'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
