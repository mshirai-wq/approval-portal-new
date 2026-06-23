'use client'

import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface Application {
  id: string
  appName: string
  subType: string
  title: string
  applicantName: string
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
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    setDataLoading(true)

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

    // 承認待ち一覧（簡易版：全申請からフィルタリング）
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
      // ユーザーが承認者に含まれているものをフィルタ（簡易実装）
      const filtered = apps.filter(app => 
        app.workflow.currentStep === '部長' && user.title === '部長'
      )
      setPendingApprovals(filtered)
    }, (error) => {
      console.error('Error fetching pending approvals:', error)
    })

    // 回覧一覧
    const circulationQuery = query(
      collection(db, 'applications'),
      where('workflow.status', '==', '承認済み'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribeCirculation = onSnapshot(circulationQuery, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      // ユーザーが回覧先に含まれているものをフィルタ（簡易実装）
      const filtered = apps.filter(app => 
        (app.workflow as any).circulations?.includes(user.name)
      )
      setCirculations(filtered)
    }, (error) => {
      console.error('Error fetching circulations:', error)
    })

    setDataLoading(false)

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            {dataLoading ? (
              <div className="text-center py-8 text-gray-400">読み込み中...</div>
            ) : pendingApprovals.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                承認待ちの申請はありません
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.slice(0, 5).map(app => (
                  <div key={app.id} className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer">
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
            {dataLoading ? (
              <div className="text-center py-8 text-gray-400">読み込み中...</div>
            ) : circulations.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                回覧待ちの申請はありません
              </div>
            ) : (
              <div className="space-y-3">
                {circulations.slice(0, 5).map(app => (
                  <div key={app.id} className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer">
                    <div className="font-medium text-sm">{app.title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {app.applicantName} - {app.subType}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
          {dataLoading ? (
            <div className="text-center py-8 text-gray-400">読み込み中...</div>
          ) : myApplications.length === 0 ? (
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
    </div>
  )
}
