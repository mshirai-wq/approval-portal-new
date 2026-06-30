'use client'

import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, addDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface Application {
  id: string
  appName: string
  subType: string
  title: string
  description: string
  applicantName: string
  applicantDept: string
  applicantTitle: string
  workflow: {
    currentStep: string
    status: string
  }
  createdAt: any
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [pendingApprovals, setPendingApprovals] = useState<Application[]>([])
  const [circulations, setCirculations] = useState<Application[]>([])
  const [myApplications, setMyApplications] = useState<Application[]>([])
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    // 自分の申請一覧
    const myAppsQuery = query(
      collection(db, 'applications'),
      where('applicantId', '==', user.id),
      orderBy('createdAt', 'desc')
    )

    const unsubscribeMyApps = onSnapshot(myAppsQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      setMyApplications(apps)
    }, (error) => {
      console.error('Error fetching my applications:', error)
    })

    // 承認待ち一覧（経路選択対応）
    const allAppsQuery = query(
      collection(db, 'applications'),
      where('workflow.status', '==', '承認待ち'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribePending = onSnapshot(allAppsQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      // ユーザーが現在のステップの承認者に含まれているものをフィルタ
      const filtered = apps.filter(app => {
        const currentStep = app.workflow.currentStep
        const steps = (app.workflow as any).steps || {}
        const currentStepData = steps[currentStep]
        
        if (!currentStepData) return false
        
        // 現在のステップの承認者にユーザーが含まれているかチェック
        const approvers = currentStepData.approvers || []
        return approvers.includes(user.name)
      })
      setPendingApprovals(filtered)
    }, (error) => {
      console.error('Error fetching pending approvals:', error)
    })

    // 回覧一覧（経路選択対応）
    const circulationQuery = query(
      collection(db, 'applications'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribeCirculation = onSnapshot(circulationQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      // ユーザーが回覧先に含まれているものをフィルタ
      const filtered = apps.filter(app => {
        const steps = (app.workflow as any).steps || {}
        const circulations = (app.workflow as any).circulations || []
        
        // 各ステップの回覧待ちをチェック
        for (const [stepName, stepData] of Object.entries(steps)) {
          const step = stepData as any
          if (step.status === '回覧待ち' && step.approvers?.includes(user.name)) {
            return true
          }
        }
        
        // 回覧先に含まれているかチェック
        if (circulations.includes(user.name)) {
          // 既に確認済みかチェック（circulationsコレクションを確認）
          // 簡易実装のため、ここでは回覧先に含まれていれば表示
          return true
        }
        
        return false
      })
      setCirculations(filtered)
    }, (error) => {
      console.error('Error fetching circulations:', error)
    })

    return () => {
      unsubscribeMyApps()
      unsubscribePending()
      unsubscribeCirculation()
    }
  }, [user])

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleAdminUsers = () => {
    router.push('/admin/users')
  }

  const handleApplicationClick = (app: Application) => {
    setSelectedApplication(app)
    setShowDetailModal(true)
  }

  const handleApproval = async (action: 'approve' | 'reject', comment: string) => {
    if (!selectedApplication || !user) return

    try {
      const newStatus = action === 'approve' ? '承認済み' : '却下'
      await updateDoc(doc(db, 'applications', selectedApplication.id), {
        'workflow.status': newStatus,
        'workflow.currentStep': action === 'approve' ? '次のステップ' : '却下',
        updatedAt: serverTimestamp()
      })

      await addDoc(collection(db, 'approvals'), {
        applicationId: selectedApplication.id,
        stepName: selectedApplication.workflow.currentStep,
        approverId: user.id,
        approverName: user.name,
        action,
        comment,
        createdAt: serverTimestamp()
      })

      setShowDetailModal(false)
      setSelectedApplication(null)
    } catch (error) {
      console.error('Approval error:', error)
      alert('処理に失敗しました')
    }
  }

  const handleCirculation = async () => {
    if (!selectedApplication || !user) return

    try {
      await addDoc(collection(db, 'circulations'), {
        applicationId: selectedApplication.id,
        userId: user.id,
        userName: user.name,
        confirmedAt: serverTimestamp()
      })

      alert('回覧を確認しました')
      setShowDetailModal(false)
      setSelectedApplication(null)
    } catch (error) {
      console.error('Circulation error:', error)
      alert('処理に失敗しました')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">社内承認ポータル</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleAdminUsers}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              社員マスタ管理
            </button>
            <span className="text-sm text-gray-600">
              {user.name} ({user.department} - {user.title})
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 承認依頼一覧 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              承認依頼一覧
              <span className="ml-auto text-sm font-normal text-gray-500">
                {pendingApprovals.length}件
              </span>
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              自分が承認者として設定されている申請
            </p>
            {pendingApprovals.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                承認待ちの申請はありません
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.slice(0, 5).map(app => (
                  <div 
                    key={app.id} 
                    className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleApplicationClick(app)}
                  >
                    <div className="font-medium text-sm">{app.title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {app.applicantName} - {app.subType}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 回覧報告一覧 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              回覧報告一覧
              <span className="ml-auto text-sm font-normal text-gray-500">
                {circulations.length}件
              </span>
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              自分が回覧先に設定されている申請
            </p>
            {circulations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                回覧待ちの申請はありません
              </div>
            ) : (
              <div className="space-y-3">
                {circulations.slice(0, 5).map(app => (
                  <div 
                    key={app.id} 
                    className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleApplicationClick(app)}
                  >
                    <div className="font-medium text-sm">{app.title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {app.applicantName} - {app.subType}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 経費申請 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
              経費申請
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              AppSheet経費申請の承認・確認
            </p>
            <button
              onClick={() => router.push('/expenses')}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors"
            >
              経費申請一覧
            </button>
          </div>

          {/* 申請作成 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              新規申請
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              新しい申請を作成します
            </p>
            <button
              onClick={() => router.push('/create')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              申請を作成 (+)
            </button>
          </div>
        </div>

        {/* 自分の申請一覧 */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">自分の申請一覧</h2>
          {myApplications.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              申請はありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">件名</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">種別</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">ステータス</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">作成日</th>
                  </tr>
                </thead>
                <tbody>
                  {myApplications.map(app => (
                    <tr key={app.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm">{app.title}</td>
                      <td className="py-3 px-4 text-sm">{app.subType}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          app.workflow.status === '承認待ち' ? 'bg-yellow-100 text-yellow-800' :
                          app.workflow.status === '承認済み' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {app.workflow.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {app.createdAt ? new Date(app.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 申請詳細モーダル */}
      {showDetailModal && selectedApplication && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-md max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">{selectedApplication.title}</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{selectedApplication.appName}</span>
                  <span>•</span>
                  <span>{selectedApplication.subType}</span>
                  <span>•</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    selectedApplication.workflow.status === '承認待ち' ? 'bg-yellow-100 text-yellow-800' :
                    selectedApplication.workflow.status === '承認済み' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedApplication.workflow.status}
                  </span>
                </div>

                <div>
                  <h3 className="font-medium text-gray-700 mb-2">申請者情報</h3>
                  <div className="text-sm text-gray-600">
                    <p>氏名: {selectedApplication.applicantName}</p>
                    <p>所属: {selectedApplication.applicantDept}</p>
                    <p>役職: {selectedApplication.applicantTitle}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-gray-700 mb-2">詳細説明</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedApplication.description}</p>
                </div>

                {(selectedApplication as any).formDetails && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">詳細情報</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      {(selectedApplication as any).formDetails.amount && (
                        <p>金額: ¥{(selectedApplication as any).formDetails.amount.toLocaleString()}</p>
                      )}
                      {(selectedApplication as any).formDetails.paymentDate && (
                        <p>支払日: {(selectedApplication as any).formDetails.paymentDate}</p>
                      )}
                      {(selectedApplication as any).formDetails.payee && (
                        <p>支払先: {(selectedApplication as any).formDetails.payee}</p>
                      )}
                    </div>
                  </div>
                )}

                {(selectedApplication as any).remarks && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">備考</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{(selectedApplication as any).remarks}</p>
                  </div>
                )}

                <div className="text-sm text-gray-500">
                  作成日: {selectedApplication.createdAt ? new Date(selectedApplication.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
                </div>

                {selectedApplication.workflow.status === '承認待ち' && (
                  <div className="border-t pt-4">
                    <ApplicationApprovalForm
                      application={selectedApplication}
                      onApprove={handleApproval}
                      onClose={() => setShowDetailModal(false)}
                    />
                  </div>
                )}

                {selectedApplication.workflow.status !== '承認待ち' && (
                  <div className="border-t pt-4">
                    <button
                      onClick={handleCirculation}
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      回覧を確認
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ApplicationApprovalForm({ 
  application, 
  onApprove, 
  onClose 
}: { 
  application: Application
  onApprove: (action: 'approve' | 'reject', comment: string) => void
  onClose: () => void
}) {
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  const handleAction = async (action: 'approve' | 'reject') => {
    setProcessing(true)
    await onApprove(action, comment)
    setProcessing(false)
  }

  return (
    <div>
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
            {processing ? '処理中...' : '承認'}
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={processing}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? '処理中...' : '却下'}
          </button>
        </div>
      </div>
    </div>
  )
}
