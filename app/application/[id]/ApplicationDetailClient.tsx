'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter, useParams } from 'next/navigation'
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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
  const [approvalHistory, setApprovalHistory] = useState<any[]>([])

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

  useEffect(() => {
    const approvalsQuery = query(
      collection(db, 'approvals'),
      where('applicationId', '==', id),
      orderBy('createdAt', 'asc')
    )

    const unsubscribe = onSnapshot(approvalsQuery, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setApprovalHistory(history)
    }, (error) => {
      console.error('Error fetching approval history:', error)
    })

    return () => unsubscribe()
  }, [id])

  const handleAction = async (actionType: 'approve' | 'reject') => {
    if (!application || !user) return

    setAction(actionType)
    setProcessing(true)

    try {
      // Update application status
      const newStatus = actionType === 'approve' ? '承認済み' : '差し戻し'
      await updateDoc(doc(db, 'applications', application.id), {
        'workflow.status': newStatus,
        'workflow.currentStep': actionType === 'approve' ? '次のステップ' : '差し戻し',
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">読み込み中...</div>
      </div>
    )
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">申請が見つかりません</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-slate-400 hover:text-slate-200"
          >
            ← ダッシュボードに戻る
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-900 rounded-lg shadow-md p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">{application.title}</h1>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>{application.appName}</span>
              <span>•</span>
              <span>{application.subType}</span>
              <span>•</span>
              <span className={`px-2 py-1 rounded text-xs ${
                application.workflow.status === '承認待ち' ? 'bg-amber-500/10 text-amber-400' :
                application.workflow.status === '承認済み' ? 'bg-green-500/10 text-green-400' :
                application.workflow.status === '差し戻し' ? 'bg-orange-500/10 text-orange-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {application.workflow.status}
              </span>
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div>
              <h3 className="font-medium text-slate-300 mb-2">申請者情報</h3>
              <div className="text-sm text-slate-400">
                <p>氏名: {application.applicantName}</p>
                <p>所属: {application.applicantDept}</p>
                <p>役職: {application.applicantTitle}</p>
              </div>
            </div>

            <div>
              <h3 className="font-medium text-slate-300 mb-2">詳細説明</h3>
              <p className="text-sm text-slate-400 whitespace-pre-wrap">{application.description}</p>
            </div>

            {application.formDetails && (
              <div>
                <h3 className="font-medium text-slate-300 mb-2">詳細情報</h3>
                <div className="text-sm text-slate-400 space-y-1">
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
                <h3 className="font-medium text-slate-300 mb-2">備考</h3>
                <p className="text-sm text-slate-400 whitespace-pre-wrap">{application.remarks}</p>
              </div>
            )}

            <div className="text-sm text-slate-500">
              作成日: {application.createdAt ? new Date(application.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
            </div>

            {approvalHistory.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-300 mb-3">承認進捗状況</h3>
                <div className="space-y-3">
                  {approvalHistory.map((history, index) => (
                    <div key={history.id} className="bg-slate-950 border border-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-300">
                          {history.stepName}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          history.action === 'approve' ? 'bg-green-500/10 text-green-400' :
                          history.action === 'reject' ? 'bg-orange-500/10 text-orange-400' :
                          'bg-slate-800 text-slate-200'
                        }`}>
                          {history.action === 'approve' ? '承認' : '差し戻し'}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">
                        <p>承認者: {history.approverName}</p>
                        {history.comment && (
                          <p className="mt-1 text-slate-500">コメント: {history.comment}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          {history.createdAt ? new Date(history.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {application.workflow.status === '承認待ち' && (
            <div className="border-t pt-6 mt-6">
              <h3 className="font-medium text-slate-300 mb-4">承認処理</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    コメント
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="承認/差し戻しのコメントを入力してください"
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleAction('approve')}
                    disabled={processing}
                    className="flex-1 bg-green-600 text-slate-50 py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing && action === 'approve' ? '処理中...' : '承認'}
                  </button>
                  <button
                    onClick={() => handleAction('reject')}
                    disabled={processing}
                    className="flex-1 bg-orange-600 text-slate-50 py-2 px-4 rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing && action === 'reject' ? '処理中...' : '差し戻し'}
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
