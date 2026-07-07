'use client'

import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, addDoc, doc, serverTimestamp, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// 型定義の拡張（申請画面の attachments 構造に完全準拠）
interface Application {
  id: string
  appName: string
  subType: string
  title: string
  description: string
  applicantName: string
  applicantDept: string
  applicantTitle: string
  remarks?: string
  // 申請画面の保存データ構造に一致させる
  attachments?: {
    name: string
    url: string
    type: string
  }[]
  imageUrl?: string       
  imageUrls?: string[]    
  formDetails?: {
    amount?: number
    paymentDate?: string
    payee?: string
    imageUrl?: string     
    imageUrls?: string[]  
  }
  workflow: {
    currentStep: string
    status: string
    currentApprovers?: string[]
    allCirculators?: string[]
    steps?: Record<string, any>
    circulations?: string[]
  }
  createdAt: any
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  
  const [view, setView] = useState<'top' | 'approvals'>('top')

  const [pendingApprovals, setPendingApprovals] = useState<Application[]>([])
  const [rawCirculations, setRawCirculations] = useState<Application[]>([])
  const [confirmedAppIds, setConfirmedAppIds] = useState<string[]>([])
  
  const [myApplications, setMyApplications] = useState<Application[]>([])
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [modalSource, setModalSource] = useState<'pending' | 'circulation' | 'sent' | null>(null)
  const [approvalHistory, setApprovalHistory] = useState<any[]>([])

  const circulations = useMemo(() => {
    return rawCirculations.filter(app => !confirmedAppIds.includes(app.id))
  }, [rawCirculations, confirmedAppIds])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // 承認履歴を取得
  useEffect(() => {
    if (!selectedApplication) {
      setApprovalHistory([])
      return
    }

    const approvalsQuery = query(
      collection(db, 'approvals'),
      where('applicationId', '==', selectedApplication.id),
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
  }, [selectedApplication])

  useEffect(() => {
    if (!user) return

    // 1. 自分の申請一覧
    const myAppsQuery = query(
      collection(db, 'applications'),
      where('applicantId', '==', user.id),
      orderBy('createdAt', 'desc'),
      limit(30)
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

    // 2. 承認待ち一覧
    const allAppsQuery = query(
      collection(db, 'applications'),
      where('workflow.status', '==', '承認待ち'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsubscribePending = onSnapshot(allAppsQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      
      const filtered = apps.filter(app => {
        if (app.workflow.currentApprovers && app.workflow.currentApprovers.length > 0) {
          return app.workflow.currentApprovers.includes(user.name)
        }
        const currentStep = app.workflow.currentStep
        const steps = app.workflow.steps || {}
        const currentStepData = steps[currentStep]
        if (!currentStepData) return false
        const approvers = currentStepData.approvers || []
        return approvers.includes(user.name)
      })
      setPendingApprovals(filtered)
    }, (error) => {
      console.error('Error fetching pending approvals:', error)
    })

    // 3. 回覧一覧
    const circulationQuery = query(
      collection(db, 'applications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsubscribeCirculation = onSnapshot(circulationQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))

      const filtered = apps.filter(app => {
        if (app.workflow.allCirculators && app.workflow.allCirculators.length > 0) {
          return app.workflow.allCirculators.includes(user.name)
        }
        const steps = app.workflow.steps || {}
        const circulationsList = app.workflow.circulations || []
        for (const [stepName, stepData] of Object.entries(steps)) {
          const step = stepData as any
          if (step.status === '回覧待ち' && step.approvers?.includes(user.name)) {
            return true
          }
        }
        if (circulationsList.includes(user.name)) {
          return true
        }
        return false
      })
      setRawCirculations(filtered)
    }, (error) => {
      console.error('Error fetching circulations:', error)
    })

    // 4. 自分が確認済みの回覧レコード
    const confirmedQuery = query(
      collection(db, 'circulations'),
      where('userId', '==', user.id)
    )

    const unsubscribeConfirmed = onSnapshot(confirmedQuery, (snapshot) => {
      const ids = snapshot.docs.map(doc => doc.data().applicationId as string)
      setConfirmedAppIds(ids)
    }, (error) => {
      console.error('Error fetching confirmed circulation IDs:', error)
    })

    return () => {
      unsubscribeMyApps()
      unsubscribePending()
      unsubscribeCirculation()
      unsubscribeConfirmed()
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

  const handleApplicationClick = (app: Application, source: 'pending' | 'circulation' | 'sent') => {
    setSelectedApplication(app)
    setShowDetailModal(true)
    setModalSource(source)
  }

  const handleApproval = async (action: 'approve' | 'reject', comment: string) => {
    if (!selectedApplication || !user) return
    try {
      const workflow = selectedApplication.workflow
      const steps = workflow.steps || {}
      const stepNames = Object.keys(steps)
      const currentIndex = stepNames.indexOf(workflow.currentStep)

      let nextStepName = ''
      let nextApprovers: string[] = []
      let nextStatus = workflow.status

      if (action === 'approve') {
        if (currentIndex !== -1 && currentIndex < stepNames.length - 1) {
          nextStepName = stepNames[currentIndex + 1]
          nextApprovers = steps[nextStepName]?.approvers || []
          nextStatus = steps[nextStepName]?.status === '回覧待ち' ? '回覧待ち' : '承認待ち'
        } else {
          nextStepName = '完了'
          nextStatus = '承認済み'
          nextApprovers = []
        }
      } else {
        nextStepName = '差し戻し'
        nextStatus = '差し戻し'
        nextApprovers = []
      }

      const updateData: any = {
        'workflow.status': nextStatus,
        'workflow.currentStep': nextStepName,
        'workflow.currentApprovers': nextApprovers,
        updatedAt: serverTimestamp()
      }

      if (workflow.currentStep && steps[workflow.currentStep]) {
        updateData[`workflow.steps.${workflow.currentStep}.status`] = action === 'approve' ? '承認済み' : '差し戻し'
      }

      await updateDoc(doc(db, 'applications', selectedApplication.id), updateData)
      
      await addDoc(collection(db, 'approvals'), {
        applicationId: selectedApplication.id,
        stepName: selectedApplication.workflow.currentStep,
        approverId: user.id,
        approverName: user.name,
        action,
        comment,
        createdAt: serverTimestamp()
      })

      if (action === 'approve' && nextApprovers.length > 0) {
        await sendApprovalNotification(selectedApplication, user.name, nextApprovers)
      }

      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)
    } catch (error) {
      console.error('Approval error:', error)
      alert('処理に失敗しました')
    }
  }

  const sendApprovalNotification = async (application: any, approverName: string, nextApprovers: string[]) => {
    try {
      if (!nextApprovers || nextApprovers.length === 0) return
      const approverEmails = await getApproversEmails(nextApprovers)

      for (const email of approverEmails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `承認依頼: ${application.title}`,
            text: `${approverName}さんが「${application.title}」を承認しました。あなたの確認・承認をお願いします。`,
            html: `
              <h2>承認依頼</h2>
              <p>${approverName}さんが「${application.title}」を承認しました。</p>
              <p>あなたの確認・承認をお願いします。</p>
              <p><a href="${window.location.origin}/dashboard">ダッシュボードを開く</a></p>
            `
          })
        })
      }
    } catch (error) {
      console.error('Email notification error:', error)
    }
  }

  const getApproversEmails = async (approverNames: string[]) => {
    if (!approverNames || approverNames.length === 0) return []
    const emails: string[] = []
    try {
      const usersQuery = query(collection(db, 'users'), where('name', 'in', approverNames))
      const usersSnapshot = await getDocs(usersQuery)
      usersSnapshot.docs.forEach((doc: any) => {
        const userData = doc.data()
        if (userData.email) emails.push(userData.email)
      })
    } catch (err) {
      console.error('Error fetching filtered user emails:', err)
    }
    return emails
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
      setModalSource(null)
    } catch (error) {
      console.error('Circulation error:', error)
      alert('処理に失敗しました')
    }
  }

  // 【最重要修正】申請画面の `attachments` 配列構造から、画像ファイルを完璧に抽出
  const attachedImages = useMemo(() => {
    if (!selectedApplication) return []
    const urls: string[] = []
    
    // 1. attachments配列から画像URLを抽出する（申請画面のデータに完全対応）
    if (Array.isArray(selectedApplication.attachments)) {
      selectedApplication.attachments.forEach(file => {
        if (file.url) {
          // typeが "image/" で始まっている、またはファイル名が画像拡張子の場合に抽出
          const isImageMime = file.type && file.type.startsWith('image/')
          const isImageExt = file.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
          if (isImageMime || isImageExt) {
            urls.push(file.url)
          }
        }
      })
    }
    
    // 2. 過去のデータ構造やその他のフォールバック処理も維持（念のための安全策）
    if (selectedApplication.imageUrl) urls.push(selectedApplication.imageUrl)
    if (Array.isArray(selectedApplication.imageUrls)) urls.push(...selectedApplication.imageUrls)
    if (selectedApplication.formDetails?.imageUrl) urls.push(selectedApplication.formDetails.imageUrl)
    if (Array.isArray(selectedApplication.formDetails?.imageUrls)) urls.push(...selectedApplication.formDetails.imageUrls)
    
    return Array.from(new Set(urls.filter(url => typeof url === 'string' && url.trim() !== '')))
  }, [selectedApplication])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
        <div className="text-slate-400 animate-pulse flex items-center gap-2 font-medium">
          データを読み込み中...
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 antialiased">
      <header className="sticky top-0 bg-[#111827]/70 backdrop-blur-md border-b border-slate-800/80 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 
            className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent cursor-pointer"
            onClick={() => setView('top')}
          >
            社内承認ポータル
          </h1>
          <div className="flex items-center gap-6">
            <button
              onClick={handleAdminUsers}
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-500/20 px-3 py-1.5 rounded-lg bg-cyan-500/5 hover:bg-cyan-500/10"
            >
              社員マスタ管理
            </button>
            <span className="text-sm text-slate-300 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/50">
              <strong className="text-slate-200 font-semibold">{user.name}</strong> 
              <span className="text-slate-500 mx-1.5">|</span>
              <span className="text-xs text-slate-400">{user.department} - {user.title}</span>
            </span>
            <button onClick={handleSignOut} className="text-sm font-medium text-rose-400 hover:text-rose-300 transition-colors">
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {view === 'top' && (
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div 
                onClick={() => setView('approvals')}
                className="relative group overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)] hover:border-indigo-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between h-56"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all"></div>
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform">
                      📥
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-100 tracking-wide group-hover:text-indigo-400 transition-colors">
                      承認・回覧
                    </h2>
                  </div>
                  <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                    あなた宛てに届いている承認依頼の確認や、回覧報告、その他経費申請の一覧ページへ移動します。
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-4 text-xs font-semibold">
                    <span className="bg-red-500/10 text-red-400 px-2.5 py-1 rounded-md border border-red-500/20">承認待ち: {pendingApprovals.length}件</span>
                    <span className="bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-md border border-blue-500/20">回覧待ち: {circulations.length}件</span>
                  </div>
                  <span className="text-indigo-400 group-hover:translate-x-1.5 transition-transform font-bold text-lg">→</span>
                </div>
              </div>

              <div 
                onClick={() => router.push('/create')}
                className="relative group overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border border-slate-800 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)] hover:border-emerald-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between h-56"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 group-hover:scale-110 transition-transform">
                      ✍️
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-100 tracking-wide group-hover:text-emerald-400 transition-colors">
                      新規申請・回覧報告の作成
                    </h2>
                  </div>
                  <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                    画像付き各種ワークフローの起票、稟議書、新規の回覧・報告書類を新しく作成して送信します。
                  </p>
                </div>
                <div className="text-right mt-4">
                  <span className="text-emerald-400 group-hover:translate-x-1.5 transition-transform font-bold text-lg inline-block">GO →</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-200 tracking-wide flex items-center gap-2">
                  <span>📋</span> 送信一覧 <span className="text-sm font-normal text-slate-500">（自分の申請履歴）</span>
                </h2>
              </div>
              {myApplications.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                  あなたが送信した申請はまだありません
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
                        <tr 
                          key={app.id} 
                          className="hover:bg-slate-800/40 transition-colors duration-150 cursor-pointer"
                          onClick={() => handleApplicationClick(app, 'sent')}
                        >
                          <td className="py-3.5 px-4 text-sm font-medium text-slate-200">{app.title}</td>
                          <td className="py-3.5 px-4 text-sm text-slate-400">{app.subType}</td>
                          <td className="py-3.5 px-4 text-sm">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${
                              app.workflow.status === '承認待ち' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                              app.workflow.status === '承認済み' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              app.workflow.status === '差し戻し' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
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
          </div>
        )}

        {view === 'approvals' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center">
              <button 
                onClick={() => setView('top')}
                className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5 group bg-slate-900 px-4 py-2 rounded-xl border border-slate-800"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> トップページへ戻る
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]"></span>
                    承認依頼一覧
                    <span className="ml-auto text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                      {pendingApprovals.length}件
                    </span>
                  </h2>
                  <p className="text-slate-400 text-xs mb-4">自分が承認者として設定されている申請</p>
                  {pendingApprovals.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                      承認待ちの申請はありません
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {pendingApprovals.map(app => (
                        <div 
                          key={app.id} 
                          className="p-3 bg-slate-800/40 border border-slate-800/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                          onClick={() => handleApplicationClick(app, 'pending')}
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

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
                    回覧報告一覧
                    <span className="ml-auto text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                      {circulations.length}件
                    </span>
                  </h2>
                  <p className="text-slate-400 text-xs mb-4">自分が回覧先に設定されている未確認の申請</p>
                  {circulations.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                      未確認の回覧はありません
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {circulations.map(app => (
                        <div 
                          key={app.id} 
                          className="p-3 bg-slate-800/40 border border-slate-800/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                          onClick={() => handleApplicationClick(app, 'circulation')}
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

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-slate-700/60 transition-all duration-300 flex flex-col justify-between h-fit">
                <div>
                  <h2 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"></span>
                    経費申請
                  </h2>
                  <p className="text-slate-400 text-xs mb-6">AppSheet経費申請の承認・確認</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/expenses')}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg shadow-[0_0_15px_rgba(147,51,234,0.3)] transition-all text-sm tracking-wide"
                >
                  経費申請一覧
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

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
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${
                    selectedApplication.workflow.status === '承認待ち' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    selectedApplication.workflow.status === '承認済み' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    selectedApplication.workflow.status === '差し戻し' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
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

                {/* 添付写真表示エリア（attachments に完全連動して綺麗にグリッド表示） */}
                {attachedImages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">添付写真</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/30 border border-slate-800 rounded-xl p-4">
                      {attachedImages.map((url, index) => (
                        <div key={index} className="group relative rounded-lg overflow-hidden border border-slate-700/50 bg-slate-950 flex items-center justify-center p-2 min-h-[160px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={url} 
                            alt={`添付画像-${index + 1}`} 
                            className="max-w-full max-h-48 object-contain rounded transition-transform duration-200 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                          <div className="absolute bottom-1 right-2 bg-black/60 text-[10px] text-slate-400 px-1.5 py-0.5 rounded">
                            画像 {index + 1}
                          </div>
                        </div>
                      ))}
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

                {approvalHistory.length > 0 && (
                  <div className="border-t border-slate-800 pt-4">
                    <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">承認進捗状況</h3>
                    <div className="space-y-3">
                      {approvalHistory.map((history) => (
                        <div key={history.id} className="bg-slate-950/40 border border-slate-800/60 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-200">
                              {history.stepName}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded ${
                              history.action === 'approve' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              history.action === 'reject' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                              'bg-slate-800 text-slate-400 border-slate-700'
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

                {modalSource !== 'sent' && selectedApplication.workflow.status === '承認待ち' && (
                  <div className="border-t border-slate-800 pt-4">
                    <ApplicationApprovalForm
                      application={selectedApplication}
                      user={user}
                      onApprove={handleApproval}
                    />
                  </div>
                )}

                {modalSource !== 'sent' && selectedApplication.workflow.status !== '承認待ち' && (
                  <div className="border-t border-slate-800 pt-4">
                    <button
                      onClick={handleCirculation}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all duration-200 text-sm tracking-wide"
                    >
                      回覧を確認
                    </button>
                  </div>
                )}

                {modalSource === 'sent' && (
                  <div className="border-t border-slate-800 pt-4">
                    <div className="text-sm text-slate-400 text-center py-4">
                      送信一覧からは承認・回覧の操作ができません
                    </div>
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
  user,
  onApprove, 
}: { 
  application: Application
  user: any
  onApprove: (action: 'approve' | 'reject', comment: string) => void
  onClose?: () => void
}) {
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  // 現在のユーザーが承認経路に含まれているかチェック
  const isCurrentApprover = useMemo(() => {
    if (!application || !user) return false
    
    const currentApprovers = application.workflow.currentApprovers || []
    const currentStep = application.workflow.currentStep
    const steps = application.workflow.steps || {}
    const currentStepData = steps[currentStep]
    const stepApprovers = currentStepData?.approvers || []
    
    return currentApprovers.includes(user.name) || stepApprovers.includes(user.name)
  }, [application, user])

  const handleAction = async (action: 'approve' | 'reject') => {
    setProcessing(true)
    await onApprove(action, comment)
    setProcessing(false)
  }

  if (!isCurrentApprover) {
    return (
      <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
        <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">承認処理</h3>
        <div className="text-sm text-slate-400 text-center py-4">
          あなたはこの申請の承認者ではありません
        </div>
      </div>
    )
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
            placeholder="承認/差し戻しのコメントを入力してください"
          />
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={processing}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {processing ? '処理中...' : '承認'}
          </button>
          <button
            type="button"
            onClick={() => handleAction('reject')}
            disabled={processing}
            className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {processing ? '処理中...' : '差し戻し'}
          </button>
        </div>
      </div>
    </div>
  )
}