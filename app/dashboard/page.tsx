'use client'

import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, addDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// 型定義を正しく拡張（TypeScriptのエラーを根本から解決）
interface Application {
  id: string
  appName: string
  subType: string
  title: string
  description: string
  applicantName: string
  applicantDept: string
  applicantTitle: string
  remarks?: string          // 任意プロパティとして追加
  formDetails?: {           // 任意プロパティとして追加
    amount?: number
    paymentDate?: string
    payee?: string
  }
  workflow: {
    currentStep: string
    status: string
    steps?: Record<string, any>
    circulations?: string[]
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
        const steps = app.workflow.steps || {}
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
        const steps = app.workflow.steps || {}
        const circulations = app.workflow.circulations || []
        
        // 各ステップの回覧待ちをチェック
        for (const [stepName, stepData] of Object.entries(steps)) {
          const step = stepData as any
          if (step.status === '回覧待ち' && step.approvers?.includes(user.name)) {
            return true
          }
        }
        
        // 回覧先に含まれているかチェック
        if (circulations.includes(user.name)) {
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
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
        <div className="text-slate-400 animate-pulse flex items-center gap-2 font-medium">
          <svg className="animate-spin h-5 w-5 text-purple-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          データを読み込み中...
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 antialiased">
      {/* 高級感のあるすりガラス風ヘッダー */}
      <header className="sticky top-0 bg-[#111827]/70 backdrop-blur-md border-b border-slate-800/80 z-40 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
            社内承認ポータル
          </h1>
          <div className="flex items-center gap-6">
            <button
              onClick={handleAdminUsers}
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors duration-200 border border-cyan-500/20 px-3 py-1.5 rounded-lg bg-cyan-500/5 hover:bg-cyan-500/10"
            >
              社員マスタ管理
            </button>
            <span className="text-sm text-slate-300 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 mr-1">ユーザー:</span>
              <strong className="text-slate-200 font-semibold">{user.name}</strong> 
              <span className="text-slate-500 mx-1.5">|</span>
              <span className="text-xs text-slate-400">{user.department} - {user.title}</span>
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm font-medium text-rose-400 hover:text-rose-300 transition-colors duration-200"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* 承認依頼一覧 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]"></span>
                承認依頼一覧
                <span className="ml-auto text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                  {pendingApprovals.length}件
                </span>
              </h2>
              <p className="text-slate-400 text-xs mb-4">
                自分が承認者として設定されている申請
              </p>
              {pendingApprovals.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                  承認待ちの申請はありません
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingApprovals.slice(0, 5).map(app => (
                    <div 
                      key={app.id} 
                      className="p-3 bg-slate-800/40 border border-slate-800/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                      onClick={() => handleApplicationClick(app)}
                    >
                      <div className="font-semibold text-sm text-slate-200 group-hover:text-white transition-colors">{app.title}</div>
                      <div className="text-xs text-slate-400 mt-1 flex justify-between">
                        <span>{app.applicantName}</span>
                        <span className="text-slate-500">{app.subType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 回覧報告一覧 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
                回覧報告一覧
                <span className="ml-auto text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  {circulations.length}件
                </span>
              </h2>
              <p className="text-slate-400 text-xs mb-4">
                自分が回覧先に設定されている申請
              </p>
              {circulations.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                  回覧待ちの申請はありません
                </div>
              ) : (
                <div className="space-y-2.5">
                  {circulations.slice(0, 5).map(app => (
                    <div 
                      key={app.id} 
                      className="p-3 bg-slate-800/40 border border-slate-800/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                      onClick={() => handleApplicationClick(app)}
                    >
                      <div className="font-semibold text-sm text-slate-200 group-hover:text-white transition-colors">{app.title}</div>
                      <div className="text-xs text-slate-400 mt-1 flex justify-between">
                        <span>{app.applicantName}</span>
                        <span className="text-slate-500">{app.subType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 経費申請 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"></span>
                経費申請
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                AppSheet経費申請の承認・確認
              </p>
            </div>
            <button
              onClick={() => router.push('/expenses')}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-[0_0_15px_rgba(147,51,234,0.3)] hover:shadow-[0_0_20px_rgba(147,51,234,0.5)] transition-all duration-200 text-sm tracking-wide"
            >
              経費申請一覧
            </button>
          </div>

          {/* 申請作成 */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]"></span>
                新規申請
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                新しい申請を作成します
              </p>
            </div>
            <button
              onClick={() => router.push('/create')}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-all duration-200 text-sm tracking-wide"
            >
              申請を作成 (+)
            </button>
          </div>
        </div>

        {/* 自分の申請一覧 */}
        <div className="mt-8 bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          <h2 className="text-base font-bold text-slate-200 mb-4 tracking-wide">自分の申請一覧</h2>
          {myApplications.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
              申請はありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 tracking-wider uppercase">件名</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 tracking-wider uppercase">種別</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 tracking-wider uppercase">ステータス</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 tracking-wider uppercase">作成日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {myApplications.map(app => (
                    <tr key={app.id} className="hover:bg-slate-800/30 transition-colors duration-150">
                      <td className="py-3.5 px-4 text-sm font-medium text-slate-200">{app.title}</td>
                      <td className="py-3.5 px-4 text-sm text-slate-400">{app.subType}</td>
                      <td className="py-3.5 px-4 text-sm">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${
                          app.workflow.status === '承認待ち' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          app.workflow.status === '承認済み' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {app.workflow.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-slate-400">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6 border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-slate-100">{selectedApplication.title}</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-slate-400 hover:text-white bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-800/60 w-fit">
                  <span>{selectedApplication.appName}</span>
                  <span className="text-slate-700">•</span>
                  <span>{selectedApplication.subType}</span>
                  <span className="text-slate-700">•</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] tracking-wider uppercase border ${
                    selectedApplication.workflow.status === '承認待ち' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    selectedApplication.workflow.status === '承認済み' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {selectedApplication.workflow.status}
                  </span>
                </div>

                <div className="bg-slate-950/30 border border-slate-800/80 p-4 rounded-xl">
                  <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">申請者情報</h3>
                  <div className="text-sm text-slate-400 space-y-1.5">
                    <p><span className="text-slate-500 mr-2">氏名:</span>{selectedApplication.applicantName}</p>
                    <p><span className="text-slate-500 mr-2">所属:</span>{selectedApplication.applicantDept}</p>
                    <p><span className="text-slate-500 mr-2">役職:</span>{selectedApplication.applicantTitle}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">詳細説明</h3>
                  <p className="text-sm text-slate-400 bg-slate-950/20 border border-slate-800/40 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">{selectedApplication.description}</p>
                </div>

                {selectedApplication.formDetails && (
                  <div className="bg-slate-950/30 border border-slate-800/80 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">詳細情報</h3>
                    <div className="text-sm text-slate-400 space-y-2">
                      {selectedApplication.formDetails.amount && (
                        <p className="flex items-baseline"><span className="text-slate-500 mr-2 w-16">金額:</span><span className="text-xl font-bold text-cyan-400">¥{selectedApplication.formDetails.amount.toLocaleString()}</span></p>
                      )}
                      {selectedApplication.formDetails.paymentDate && (
                        <p><span className="text-slate-500 mr-2 w-16 inline-block">支払日:</span>{selectedApplication.formDetails.paymentDate}</p>
                      )}
                      {selectedApplication.formDetails.payee && (
                        <p><span className="text-slate-500 mr-2 w-16 inline-block">支払先:</span>{selectedApplication.formDetails.payee}</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedApplication.remarks && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">備考</h3>
                    <p className="text-sm text-slate-400 bg-slate-950/20 border border-slate-800/40 p-4 rounded-xl whitespace-pre-wrap">{selectedApplication.remarks}</p>
                  </div>
                )}

                <div className="text-xs text-slate-500 text-right border-t border-slate-800 pt-4">
                  作成日: {selectedApplication.createdAt ? new Date(selectedApplication.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
                </div>

                {selectedApplication.workflow.status === '承認待ち' && (
                  <div className="border-t border-slate-800 pt-4">
                    <ApplicationApprovalForm
                      application={selectedApplication}
                      onApprove={handleApproval}
                      onClose={() => setShowDetailModal(false)}
                    />
                  </div>
                )}

                {selectedApplication.workflow.status !== '承認待ち' && (
                  <div className="border-t border-slate-800 pt-4">
                    <button
                      onClick={handleCirculation}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all duration-200 text-sm tracking-wide"
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
    <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
      <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">承認処理</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
            コメント
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700/60 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 text-sm transition-all"
            placeholder="承認/却下のコメントを入力してください"
          />
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => handleAction('approve')}
            disabled={processing}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {processing ? '処理中...' : '承認'}
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={processing}
            className="flex-1 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-rose-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {processing ? '処理中...' : '却下'}
          </button>
        </div>
      </div>
    </div>
  )
}