'use client'

import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, addDoc, doc, getDoc, serverTimestamp, limit, getDocs, startAfter } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getInformations, confirmInformation, getExpenses, Information as AppSheetInformation, Expense } from '@/lib/appsheet'
import { Search, Printer, FileText } from 'lucide-react'

// 型定義の拡張
interface Application {
  id: string
  applicationNo?: number
  appName: string
  subType: string
  title: string
  description: string
  applicantId: string
  applicantName: string
  applicantDept: string
  applicantTitle: string
  remarks?: string
  attachments?: {
    name: string
    url: string
    type: string
  }[]
  imageUrl?: string       
  imageUrls?: string[]    
  formDetails?: Record<string, any>
  workflow: {
    currentStep: string
    status: string
    currentApprovers?: string[]
    allCirculators?: string[]
    steps?: Record<string, any>
    circulations?: string[]
    confirmedBy?: string[]
    stepOrder?: string[]
    decisionMaker?: string
  }
  createdAt: any
}

function isApplication(app: Application | AppSheetInformation | null): app is Application {
  return app !== null && 'workflow' in app;
}

function getEffectiveStatus(app: Application): string {
  const status = app.workflow.status
  if (status === '下書き' || status === '取り消し') return status
  if (app.appName !== '回覧報告') return status
  const members: string[] =
    (app.workflow.circulations?.length ? app.workflow.circulations : undefined) ||
    (app.workflow.allCirculators?.length ? app.workflow.allCirculators : undefined) ||
    app.workflow.steps?.['回覧先']?.approvers || []
  if (members.length === 0) {
    if (status === '承認済み') return '回覧待ち'
    return status
  }
  const confirmed = new Set<string>([
    ...(app.workflow.confirmedBy || []),
    ...(app.workflow.steps?.['回覧先']?.approvedBy || [])
  ])
  return members.every(m => confirmed.has(m)) ? '回覧済み' : '回覧待ち'
}

const EXCLUDED_FORM_KEYS = new Set(['description', 'remarks', 'imageUrl', 'imageUrls'])

const FORM_DETAIL_LABELS: Record<string, string> = {
  amount: '金額',
  paymentDate: '支払日',
  payee: '支払先',
  recruitmentDivision: '採用区分',
  employmentType: '区分',
  jobLocation: '配属現場名',
  jobContent: '勤務内容',
  workHours: '勤務時間',
  workDays: '勤務曜日',
  recruitmentUnitPrice: '募集単価',
  postingDate: '掲載希望日',
  recruitmentMedia: '募集媒体',
  postingFee: '掲載費用',
  salesAmount: '売上',
  costAmount: '原価',
  costRate: '原価率',
  retireeName: '退職者氏名',
  retireeDate: '退職（予定）日',
  coCompanyName: '会社名',
  coBackground: '知り得た経緯、発注予定の業務名',
  coStartDate: '取引開始予定日',
  salaryCustomerName: '顧客名',
  salarySiteName: '現場名',
  salaryEmployeeNumber: '対象者社員番号',
  salaryEmployeeName: '対象者氏名',
  salaryChangeDetails: '変更詳細情報',
  salaryStartDate: '勤務変更の開始日',
  salaryReason: '事由及び変更後の状況',
  retirementName: '退職者氏名',
  retirementSite: '退職者所属現場',
  retirementJobType: '職種',
  retirementDate: '退職日',
  retirementReason: '退職理由',
  obituaryType: '申請区分',
  obituaryTargetName: '社員・お客様名',
  obituarySite: '現場名',
  obituaryDeceasedName: '故人名',
  obituaryRelation: '社員との関係',
  obituaryChiefMourner: '喪主名',
  obituaryWakeDate: '通夜日時',
  obituaryFuneralDate: '葬儀日時',
  obituaryVenue: '① 通夜・葬儀会場',
  obituaryCondolencePostal: '郵便番号',
  obituaryCondolenceAddress: '住所',
  obituaryCondolenceVenueName: '会場名',
  obituaryCondolencePhone: '電話番号',
  obituaryCondolenceAmount: '香典金額',
  obituaryRequest: '依頼事項',
  obituaryAttendees: '当社参列者名',
  location: '入札執行場所',
  date: '入札執行日',
  time: '入札時間',
  winnerName: '落札業者名',
  winnerBid1: '第1回落札金額',
  winnerBid2: '第2回落札金額',
  ourBid1: '第1回入札金額',
  ourBid2: '第2回入札金額',
  prevWinnerName: '前年度落札業者',
  prevWinnerAmount: '前年度落札金額',
  transportTotal: '交通費合計',
  accommodationTotal: '宿泊費合計',
  dailyAllowanceTotal: '日当合計',
  tripTotal: '出張旅費合計',
  leaseClassification: '分類',
  leaseVendor: '業者',
  leaseOtherVendor: '業者名（その他）',
  leaseCarNumber: '登録車番',
  leaseRequirements: '用件',
  leaseCurrentAmount: '現在リース金額（月額）',
  leaseNewAmount: '新リース金額（月額）',
  leaseTerm: '期間',
  leaseDeliveryDate: '納車希望日',
  leaseExpiryDate: '期間満了日',
  leaseMileage: '走行距離',
  name: '業者名',
  bid1: '第1回入札金額',
  bid2: '第2回入札金額'
}

function isCurrencyField(key: string): boolean {
  return /(?:amount|fee|price|bid|total)$/i.test(key)
}

function formatFormValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    if (typeof value[0] === 'string' || typeof value[0] === 'number') return value.join(', ')
    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
      const lines = value.map((item, i) => {
        const parts = Object.entries(item)
          .filter(([_, v]) => v !== '' && v !== null && v !== undefined)
          .map(([k, v]) => `${FORM_DETAIL_LABELS[k] || k}: ${formatFormValue(k, v)}`)
          .join(', ')
        return parts ? `(${i + 1}) ${parts}` : ''
      }).filter(line => line !== '')
      return lines.length > 0 ? lines.join('\n') : ''
    }
    return value.map((item, i) => `(${i + 1}) ${JSON.stringify(item)}`).join('\n')
  }
  if (typeof value === 'object') return ''
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value))) {
    if (isCurrencyField(key) && key !== 'costRate') {
      const num = Number(value)
      return `¥${num.toLocaleString()}`
    }
    if (key === 'costRate') return `${value}%`
    return String(value)
  }
  return String(value)
}

function FormDetailsDisplay({ details }: { details: Record<string, any> }) {
  const entries = Object.entries(details).filter(([key, value]) => {
    if (EXCLUDED_FORM_KEYS.has(key)) return false
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return false
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false
    return true
  })

  return (
    <div className="text-sm text-slate-400 space-y-2">
      {entries.map(([key, value]) => {
        const label = FORM_DETAIL_LABELS[key] || key
        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          return (
            <div key={key} className="border border-slate-700/50 rounded-lg p-3">
              <span className="text-slate-500 mr-2">{label}:</span>
              <div className="mt-1 space-y-1 pl-2">
                {Object.entries(value).map(([subKey, subValue]) => {
                  if (subValue === null || subValue === undefined || subValue === '' || (Array.isArray(subValue) && subValue.length === 0)) return null
                  const subLabel = FORM_DETAIL_LABELS[subKey] || subKey
                  const formatted = formatFormValue(subKey, subValue)
                  return formatted ? (
                    <p key={subKey}><span className="text-slate-600 mr-2">{subLabel}:</span>{formatted}</p>
                  ) : null
                })}
              </div>
            </div>
          )
        }
        const formatted = formatFormValue(key, value)
        return formatted ? (
          <p key={key} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-slate-500 min-w-[8rem]">{label}:</span>
            <span className="text-slate-200 whitespace-pre-wrap">{formatted}</span>
          </p>
        ) : null
      })}
    </div>
  )
}

function PaginationControls({
  page,
  hasNext,
  loading,
  onPrev,
  onNext,
  onRefresh
}: {
  page: number
  hasNext: boolean
  loading: boolean
  onPrev: () => void
  onNext: () => void
  onRefresh: () => void
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-700">
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-sm font-medium text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        🔄 最新情報に更新
      </button>
      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          disabled={page <= 1 || loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          前へ
        </button>
        <span className="text-sm text-slate-400 min-w-[70px] text-center">Page {page}</span>
        <button
          onClick={onNext}
          disabled={!hasNext || loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          次へ
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const classes =
    status === '承認待ち' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    status === '承認済み' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    status === '回覧待ち' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
    status === '回覧済み' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
    status === '差し戻し' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
    status === '取り消し' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
    status === '未確認' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    status === '下書き' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border whitespace-nowrap shrink-0 ${classes} ${className}`}>
      {status}
    </span>
  )
}

function ApplicationList({
  applications,
  onItemClick,
  showApplicant = false,
}: {
  applications: Application[]
  onItemClick: (app: Application) => void
  showApplicant?: boolean
}) {
  return (
    <div className="space-y-3">
      {applications.map(app => (
        <div
          key={app.id}
          onClick={() => onItemClick(app)}
          className="bg-slate-950/30 border border-slate-700/60 rounded-xl p-4 cursor-pointer hover:bg-slate-800/50 hover:border-slate-700 transition-all"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-200 break-words leading-snug flex-1 min-w-0">{app.title}</h3>
              <span className="text-xs text-slate-500 font-mono shrink-0 whitespace-nowrap">#{app.applicationNo ?? '-'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-400 mt-1">
              {showApplicant && <span className="break-words max-w-full text-slate-300">{app.applicantName}</span>}
              <span className="break-words">{app.subType}</span>
              <StatusBadge status={getEffectiveStatus(app)} />
              <span className="ml-auto whitespace-nowrap text-slate-500">{app.createdAt ? new Date(app.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ApplicationAccordion({
  title,
  subtitle,
  isOpen,
  onToggle,
  loading,
  applications,
  onItemClick,
  emptyMessage,
  showCount = false
}: {
  title: string
  subtitle?: string
  isOpen: boolean
  onToggle: () => void
  loading: boolean
  applications: Application[]
  onItemClick: (app: Application) => void
  emptyMessage: string
  showCount?: boolean
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex justify-between items-center group"
        aria-expanded={isOpen}
      >
        <h2 className="text-lg font-bold text-slate-200 tracking-wide flex items-center gap-2">
          {title}
          {showCount && (
            <span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-slate-700 text-slate-300 rounded-full">
              {loading ? '...' : `${applications.length}件`}
            </span>
          )}
          {subtitle && <span className="text-sm font-normal text-slate-500">{subtitle}</span>}
        </h2>
        <span className={`text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40 animate-pulse">
              読み込み中...
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40">
              {emptyMessage}
            </div>
          ) : (
            <ApplicationList applications={applications} onItemClick={onItemClick} />
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  
  const [view, setView] = useState<'top' | 'approvals'>('top')
  const [sendHistoryOpen, setSendHistoryOpen] = useState(false)
  const [myApplications, setMyApplications] = useState<Application[]>([])
  const [myAppsPage, setMyAppsPage] = useState(1)
  const [loadingMyApps, setLoadingMyApps] = useState(false)
  const [myAppsHasNext, setMyAppsHasNext] = useState(false)
  const myAppsCursorsRef = useRef<any[]>([])

  const [allApplications, setAllApplications] = useState<Application[]>([])
  const [allAppsOpen, setAllAppsOpen] = useState(false)
  const [allAppsPage, setAllAppsPage] = useState(1)
  const [loadingAllApps, setLoadingAllApps] = useState(false)
  const [allAppsHasNext, setAllAppsHasNext] = useState(false)
  const [allAppsSearchQuery, setAllAppsSearchQuery] = useState('')
  const allAppsCursorsRef = useRef<any[]>([])

  const [pendingApprovals, setPendingApprovals] = useState<Application[]>([])
  const [rawCirculations, setRawCirculations] = useState<Application[]>([])
  const [rejectedApplications, setRejectedApplications] = useState<Application[]>([])
  const [rejectedAppsOpen, setRejectedAppsOpen] = useState(false)
  const [loadingRejectedApps, setLoadingRejectedApps] = useState(false)
  const [completedApplications, setCompletedApplications] = useState<Application[]>([])
  const [completedAppsOpen, setCompletedAppsOpen] = useState(false)
  const [loadingCompletedApps, setLoadingCompletedApps] = useState(false)
  const [draftApplications, setDraftApplications] = useState<Application[]>([])
  const [draftAppsOpen, setDraftAppsOpen] = useState(false)
  const [loadingDraftApps, setLoadingDraftApps] = useState(false)
  const [confirmedAppIds, setConfirmedAppIds] = useState<string[]>([])
  const [informations, setInformations] = useState<AppSheetInformation[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  
  const [selectedApplication, setSelectedApplication] = useState<Application | AppSheetInformation | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [modalSource, setModalSource] = useState<'pending' | 'circulation' | 'sent' | 'processed' | 'information' | null>(null)
  const [approvalHistory, setApprovalHistory] = useState<any[]>([])
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  const [approvalTab, setApprovalTab] = useState<'pending' | 'circulation'>('pending')

  const [processedAppsOpen, setProcessedAppsOpen] = useState(false)
  const [processedTab, setProcessedTab] = useState<'approval' | 'circulation'>('approval')
  const [processedApprovals, setProcessedApprovals] = useState<Application[]>([])
  const [processedCirculations, setProcessedCirculations] = useState<Application[]>([])
  const [loadingProcessedApprovals, setLoadingProcessedApprovals] = useState(false)
  const [loadingProcessedCirculations, setLoadingProcessedCirculations] = useState(false)

  const circulations = useMemo(() => {
    return rawCirculations.filter(app => !confirmedAppIds.includes(app.id))
  }, [rawCirculations, confirmedAppIds])

  // 💡 【修正】必須だった「自分宛てかどうかのフィルター」を復活させました！
  const loadInformations = useCallback(async () => {
    if (!user?.name) return
    try {
      const infos = await getInformations(user.name)
      const filtered = infos.filter(info => {
        if (!info || info.ステータス !== '未確認') return false
        if (!info.確認担当者) return false
        // 🚨 削ってはいけない必須フィルターを復活
        return info.確認担当者.includes(user.name)
      })
      setInformations(filtered)
    } catch (error) {
      console.error('Error fetching informations:', error)
    }
  }, [user])

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
        const currentStep = app.workflow.currentStep
        const steps = app.workflow.steps || {}
        const currentStepData = steps[currentStep]
        if (!currentStepData) return false
        const approvedBy = currentStepData.approvedBy || []
        // 自分が既にこのステップを承認済みなら承認待ち一覧に出さない
        if (approvedBy.includes(user.name)) return false

        const approvers = currentStepData.approvers || []
        if (approvers.includes(user.name)) return true

        if (app.workflow.currentApprovers && app.workflow.currentApprovers.length > 0) {
          return app.workflow.currentApprovers.includes(user.name)
        }
        return false
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
        const status = getEffectiveStatus(app)

        // 承認段階（承認待ち）の申請は回覧一覧に出さない
        // 自分が承認者の場合は承認待ち一覧で表示される
        if (status === '承認待ち') return false

        // 回覧段階：自分がその回覧対象になっている場合
        if (status === '回覧待ち') {
          const members =
            (app.workflow.circulations?.length ? app.workflow.circulations : undefined) ||
            (app.workflow.allCirculators?.length ? app.workflow.allCirculators : undefined) ||
            app.workflow.steps?.['回覧先']?.approvers || []
          return members.includes(user.name)
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

    // 5. 情報収集データ（GAS経由で取得）
    loadInformations()

    // 6. 経費申請データ（GAS経由で取得）
    const loadExpenses = async () => {
      if (!user?.email) return
      try {
        // 経費一覧ページと同じ条件で取得（承認待ち＆自分宛て）
        const exps = await getExpenses('承認待ち', user.email)
        // フロントエンドで承認待ちかつ自分宛てのデータをフィルタリング
        const filtered = exps.filter(exp => {
          const status = (exp.承認ステータス || '').trim()
          const approverEmail = (exp.承認者メールアドレス || '').trim().toLowerCase()
          const myEmail = user.email.trim().toLowerCase()
          return status === '承認待ち' && approverEmail.includes(myEmail)
        })
        setExpenses(filtered)
      } catch (error) {
        console.error('Error fetching expenses:', error)
      }
    }

    loadExpenses()

    return () => {
      unsubscribePending()
      unsubscribeCirculation()
      unsubscribeConfirmed()
    }
  }, [user, loadInformations])

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

  const handleApplicationClick = (app: Application, source: 'pending' | 'circulation' | 'sent' | 'processed') => {
    setSelectedApplication(app)
    setShowDetailModal(true)
    setModalSource(source)
  }

  const fetchMyApplications = useCallback(async (page: number) => {
    if (!user) return
    setLoadingMyApps(true)
    try {
      const cursor = page > 1 ? myAppsCursorsRef.current[page - 2] : undefined
      let q
      if (cursor) {
        q = query(
          collection(db, 'applications'),
          where('applicantId', '==', user?.id || user?.email),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(31)
        )
      } else {
        q = query(
          collection(db, 'applications'),
          where('applicantId', '==', user?.id || user?.email),
          orderBy('createdAt', 'desc'),
          limit(31)
        )
      }
      const snapshot = await getDocs(q)
      const docs = snapshot.docs
      const apps = docs.slice(0, 30).map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      setMyApplications(apps.filter(app => app.workflow.status !== '下書き'))
      if (docs.length >= 30) {
        myAppsCursorsRef.current[page - 1] = docs[29]
      }
      setMyAppsHasNext(docs.length > 30)
    } catch (error) {
      console.error('Error fetching my applications:', error)
    } finally {
      setLoadingMyApps(false)
    }
  }, [user])

  const fetchDraftApplications = useCallback(async () => {
    if (!user) return
    setLoadingDraftApps(true)
    try {
      const q = query(
        collection(db, 'applications'),
        where('applicantId', '==', user?.id || user?.email),
        orderBy('createdAt', 'desc'),
        limit(31)
      )
      const snapshot = await getDocs(q)
      const docs = snapshot.docs
      const apps = docs.slice(0, 30).map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      setDraftApplications(apps.filter(app => app.workflow.status === '下書き'))
    } catch (error) {
      console.error('Error fetching draft applications:', error)
    } finally {
      setLoadingDraftApps(false)
    }
  }, [user])

  const fetchAllApplications = useCallback(async (page: number, silent: boolean = false) => {
    if (!user || !user.canViewAllApplications) return
    if (!silent) setLoadingAllApps(true)
    try {
      const cursor = page > 1 ? allAppsCursorsRef.current[page - 2] : undefined
      let q
      if (cursor) {
        q = query(
          collection(db, 'applications'),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(31)
        )
      } else {
        q = query(
          collection(db, 'applications'),
          orderBy('createdAt', 'desc'),
          limit(31)
        )
      }
      const snapshot = await getDocs(q)
      const docs = snapshot.docs
      const apps = docs.slice(0, 30).map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      setAllApplications(apps)
      if (docs.length >= 30) {
        allAppsCursorsRef.current[page - 1] = docs[29]
      }
      setAllAppsHasNext(docs.length > 30)
    } catch (error) {
      console.error('Error fetching all applications:', error)
    } finally {
      if (!silent) setLoadingAllApps(false)
    }
  }, [user])

  const visibleAllApplications = useMemo(() => {
    if (!user) return []
    const q = allAppsSearchQuery.trim()
    const nonDraft = allApplications.filter(app => app.workflow.status !== '下書き')
    if (!q) return nonDraft
    const lowerQ = q.toLowerCase()
    return nonDraft.filter(app => {
      const idMatch = app.applicationNo ? String(app.applicationNo).includes(q) : false
      return (
        idMatch ||
        app.title.toLowerCase().includes(lowerQ) ||
        app.applicantName.toLowerCase().includes(lowerQ) ||
        app.subType.toLowerCase().includes(lowerQ)
      )
    })
  }, [allApplications, user, allAppsSearchQuery])

  const fetchRejectedApplications = useCallback(async () => {
    if (!user) return
    setLoadingRejectedApps(true)
    try {
      const q = query(
        collection(db, 'applications'),
        where('applicantId', '==', user?.id || user?.email),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
      const snapshot = await getDocs(q)
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      setRejectedApplications(apps.filter(app => app.workflow.status === '差し戻し'))
    } catch (error) {
      console.error('Error fetching rejected applications:', error)
    } finally {
      setLoadingRejectedApps(false)
    }
  }, [user])

  const fetchCompletedApplications = useCallback(async () => {
    if (!user) return
    setLoadingCompletedApps(true)
    try {
      const q = query(
        collection(db, 'applications'),
        where('applicantId', '==', user?.id || user?.email),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
      const snapshot = await getDocs(q)
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Application))
      setCompletedApplications(apps.filter(app => ['承認済み', '回覧済み'].includes(getEffectiveStatus(app))))
    } catch (error) {
      console.error('Error fetching completed applications:', error)
    } finally {
      setLoadingCompletedApps(false)
    }
  }, [user])

  const getTimestampMs = useCallback((value: any): number => {
    if (!value) return 0
    if (typeof value.toDate === 'function') return value.toDate().getTime()
    if (value instanceof Date) return value.getTime()
    return new Date(value).getTime() || 0
  }, [])

  const fetchProcessedApplications = useCallback(async () => {
    if (!user) return
    setLoadingProcessedApprovals(true)
    try {
      const q = query(
        collection(db, 'approvals'),
        where('approverId', '==', user.id),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
      const snapshot = await getDocs(q)
      const appIds = Array.from(new Set(snapshot.docs.map(d => d.data().applicationId).filter((id): id is string => typeof id === 'string' && id.length > 0)))
      const apps = await Promise.all(appIds.map(async (id) => {
        const snap = await getDoc(doc(db, 'applications', id))
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as Application) : null
      }))
      const appMap = new Map<string, Application>()
      apps.filter((a): a is Application => a !== null).forEach(app => appMap.set(app.id, app))

      // 古い申請では approvals コレクション未作成の場合があるため、ステップの approvedBy からも補完する
      const allAppsQuery = query(
        collection(db, 'applications'),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
      const allAppsSnap = await getDocs(allAppsQuery)
      allAppsSnap.docs.forEach(docSnap => {
        const app = { id: docSnap.id, ...docSnap.data() } as Application
        if (app.appName === '回覧報告') return
        if (appMap.has(app.id)) return
        const steps = app.workflow.steps || {}
        const acted = Object.values(steps).some((step: any) =>
          (step?.approvedBy || []).includes(user.name) || (step?.approvedBy || []).includes(user.id)
        )
        if (acted) appMap.set(app.id, app)
      })

      setProcessedApprovals(Array.from(appMap.values()).sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt)))
    } catch (error) {
      console.error('Error fetching processed approvals:', error)
    } finally {
      setLoadingProcessedApprovals(false)
    }
  }, [user, getTimestampMs])

  const fetchProcessedCirculations = useCallback(async () => {
    if (!user) return
    setLoadingProcessedCirculations(true)
    try {
      const q = query(
        collection(db, 'circulations'),
        where('userId', '==', user.id),
        orderBy('confirmedAt', 'desc'),
        limit(50)
      )
      const snapshot = await getDocs(q)
      const appIds = Array.from(new Set(snapshot.docs.map(d => d.data().applicationId).filter((id): id is string => typeof id === 'string' && id.length > 0)))
      const apps = await Promise.all(appIds.map(async (id) => {
        const snap = await getDoc(doc(db, 'applications', id))
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as Application) : null
      }))
      const appMap = new Map<string, Application>()
      apps.filter((a): a is Application => a !== null).forEach(app => appMap.set(app.id, app))

      // 古い回覧報告で circulations コレクション未作成の場合を補完する
      const allAppsQuery = query(
        collection(db, 'applications'),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
      const allAppsSnap = await getDocs(allAppsQuery)
      allAppsSnap.docs.forEach(docSnap => {
        const app = { id: docSnap.id, ...docSnap.data() } as Application
        if (app.appName !== '回覧報告') return
        if (appMap.has(app.id)) return
        const confirmed = new Set([
          ...(app.workflow.confirmedBy || []),
          ...(app.workflow.steps?.['回覧先']?.approvedBy || [])
        ])
        if (confirmed.has(user.name) || confirmed.has(user.id)) appMap.set(app.id, app)
      })

      setProcessedCirculations(Array.from(appMap.values()).sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt)))
    } catch (error) {
      console.error('Error fetching processed circulations:', error)
    } finally {
      setLoadingProcessedCirculations(false)
    }
  }, [user, getTimestampMs])

  // 送信一覧の遅延読み込み
  useEffect(() => {
    if (!sendHistoryOpen) return
    fetchMyApplications(myAppsPage)
  }, [sendHistoryOpen, myAppsPage, fetchMyApplications])

  // 下書き一覧の遅延読み込み
  useEffect(() => {
    if (!draftAppsOpen) return
    fetchDraftApplications()
  }, [draftAppsOpen, fetchDraftApplications])

  // 全社員申請一覧の遅延読み込み + 30秒おきの自動更新
  useEffect(() => {
    if (!allAppsOpen) return
    fetchAllApplications(allAppsPage, false)
    const interval = setInterval(() => {
      fetchAllApplications(allAppsPage, true)
    }, 30000)
    return () => clearInterval(interval)
  }, [allAppsOpen, allAppsPage, fetchAllApplications])

  // 差し戻し申請の件数も開く前に取得する
  useEffect(() => {
    fetchRejectedApplications()
  }, [fetchRejectedApplications])

  // 完了済み申請の遅延読み込み
  useEffect(() => {
    if (!completedAppsOpen) return
    fetchCompletedApplications()
  }, [completedAppsOpen, fetchCompletedApplications])

  // 自分が承認・回覧を完了した申請の遅延読み込み
  useEffect(() => {
    if (!processedAppsOpen) return
    fetchProcessedApplications()
    fetchProcessedCirculations()
  }, [processedAppsOpen, fetchProcessedApplications, fetchProcessedCirculations])

  const handleInformationClick = (info: AppSheetInformation) => {
    setSelectedApplication(info)
    setShowDetailModal(true)
    setModalSource('information')
  }

  const handleApproval = async (action: 'approve' | 'reject', comment: string) => {
    if (!selectedApplication || !isApplication(selectedApplication) || !user) return
    try {
      const workflow = selectedApplication.workflow
      const steps = workflow.steps || {}
      const stepNames = workflow.stepOrder || Object.keys(steps)

      const currentStepName = workflow.currentStep
      const currentStepData = steps[currentStepName] || {}
      const currentApprovers: string[] = currentStepData.approvers || []
      const alreadyApprovedBy: string[] = currentStepData.approvedBy || []

      const newApprovedBy = Array.from(new Set([...alreadyApprovedBy, user.name]))
      const allCurrentApproved = currentApprovers.length > 0 && currentApprovers.every(name => newApprovedBy.includes(name))

      let nextStepName = currentStepName
      let nextApprovers: string[] = currentApprovers
      let nextStatus = workflow.status
      let didAdvance = false
      const skippedSteps: string[] = []

      if (action === 'approve' && allCurrentApproved) {
        didAdvance = true
        let currentIndex = stepNames.indexOf(currentStepName)

        const applicantName = selectedApplication.applicantName || ''
        while (currentIndex !== -1 && currentIndex < stepNames.length - 1) {
          currentIndex++
          const candidateStep = stepNames[currentIndex]
          const candidateApprovers = steps[candidateStep]?.approvers || []
          const shouldSkip = candidateApprovers.length === 0 || candidateApprovers.every((a: string) => a === applicantName)

          if (!shouldSkip) {
            nextStepName = candidateStep
            nextApprovers = candidateApprovers
            nextStatus = steps[candidateStep]?.status === '回覧待ち' ? '回覧待ち' : '承認待ち'
            break
          } else {
            skippedSteps.push(candidateStep)
          }
        }

        if (nextStepName === currentStepName) {
          nextStepName = '完了'
          nextStatus = '承認済み'
          nextApprovers = []
        }
      } else if (action === 'reject') {
        nextStepName = currentStepName
        nextStatus = '差し戻し'
        nextApprovers = []
      }

      const updateData: any = {
        'workflow.status': nextStatus,
        'workflow.currentStep': nextStepName,
        'workflow.currentApprovers': nextApprovers,
        updatedAt: serverTimestamp()
      }

      if (currentStepName && steps[currentStepName]) {
        updateData[`workflow.steps.${currentStepName}.approvedBy`] = newApprovedBy
        if (action === 'approve' && allCurrentApproved) {
          updateData[`workflow.steps.${currentStepName}.status`] = '承認済み'
        } else if (action === 'reject') {
          updateData[`workflow.steps.${currentStepName}.status`] = '差し戻し'
        }
      }

      if (action === 'approve' && allCurrentApproved && skippedSteps.length > 0) {
        skippedSteps.forEach(step => {
          updateData[`workflow.steps.${step}.status`] = '承認済み(スキップ)'
        })
      }

      await updateDoc(doc(db, 'applications', selectedApplication.id), updateData)

      await addDoc(collection(db, 'approvals'), {
        applicationId: selectedApplication.id,
        stepName: currentStepName,
        approverId: user.id,
        approverName: user.name,
        action,
        comment,
        createdAt: serverTimestamp()
      })

      if (action === 'approve' && didAdvance) {
        if (currentStepName === workflow.decisionMaker) {
          await sendFinalDecisionNotification(selectedApplication)
        }
        if (nextApprovers.length > 0) {
          await sendApprovalNotification(selectedApplication, user.name, nextApprovers)
        } else if (nextStatus === '承認済み') {
          await sendFinalApprovalNotification(selectedApplication)
        }
      } else if (action === 'reject') {
        await sendRejectNotification(selectedApplication, user.name, comment)
      }

      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)
      window.location.reload()
    } catch (error) {
      console.error('Approval error:', error)
      alert('処理に失敗しました')
    }
  }

  const handleSkip = async (comment: string) => {
    if (!selectedApplication || !isApplication(selectedApplication) || !user) return
    try {
      const workflow = selectedApplication.workflow
      const steps = workflow.steps || {}
      const stepNames = workflow.stepOrder || Object.keys(steps)
      const currentStepName = workflow.currentStep
      const currentIndex = stepNames.indexOf(currentStepName)
      if (currentIndex === -1) throw new Error('current step not found')

      let nextStepName = currentStepName
      let nextApprovers: string[] = []
      let nextStatus = workflow.status
      let didAdvance = false
      const skippedSteps: string[] = [currentStepName]

      const applicantName = selectedApplication.applicantName || ''
      for (let i = currentIndex + 1; i < stepNames.length; i++) {
        const candidateStep = stepNames[i]
        const candidateApprovers = steps[candidateStep]?.approvers || []
        const shouldSkip = candidateApprovers.length === 0 || candidateApprovers.every((a: string) => a === applicantName)
        if (!shouldSkip) {
          nextStepName = candidateStep
          nextApprovers = candidateApprovers
          nextStatus = steps[candidateStep]?.status === '回覧待ち' ? '回覧待ち' : '承認待ち'
          didAdvance = true
          break
        } else {
          skippedSteps.push(candidateStep)
        }
      }

      if (!didAdvance) {
        nextStepName = '完了'
        nextStatus = '承認済み'
        nextApprovers = []
      }

      const updateData: any = {
        'workflow.status': nextStatus,
        'workflow.currentStep': nextStepName,
        'workflow.currentApprovers': nextApprovers,
        updatedAt: serverTimestamp()
      }

      skippedSteps.forEach(step => {
        updateData[`workflow.steps.${step}.status`] = '承認済み(スキップ)'
      })

      await updateDoc(doc(db, 'applications', selectedApplication.id), updateData)

      await addDoc(collection(db, 'approvals'), {
        applicationId: selectedApplication.id,
        stepName: currentStepName,
        approverId: user.id,
        approverName: user.name,
        action: 'skip',
        comment,
        createdAt: serverTimestamp()
      })

      if (nextApprovers.length > 0) {
        await sendApprovalNotification(selectedApplication, user.name, nextApprovers)
      } else if (nextStatus === '承認済み') {
        await sendFinalApprovalNotification(selectedApplication)
      }

      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)
      window.location.reload()
    } catch (error) {
      console.error('Skip error:', error)
      alert('スキップに失敗しました')
    }
  }

  const handleResubmit = async (newDescription: string, newAmount: number, newPaymentDate: string, newPayee: string, newRemarks: string) => {
    if (!selectedApplication || !isApplication(selectedApplication) || !user) return
    try {
      const workflow = selectedApplication.workflow
      const currentStep = workflow.currentStep
      const steps = workflow.steps || {}
      const originalApprovers = steps[currentStep]?.approvers || []
      const isDeptHeadResubmit = currentStep === '部長' && user?.title === '部長' && selectedApplication.applicantTitle === '部長'

      let nextStep = currentStep
      let nextApprovers = originalApprovers
      let nextStatus = '承認待ち'
      const skippedSteps: string[] = []

      if (isDeptHeadResubmit) {
        const stepNames = workflow.stepOrder || Object.keys(steps)
        const currentIndex = stepNames.indexOf(currentStep)
        if (currentIndex !== -1) {
          for (let i = currentIndex + 1; i < stepNames.length; i++) {
            const candidateStep = stepNames[i]
            const candidateApprovers = steps[candidateStep]?.approvers || []
            if (candidateApprovers.length > 0) {
              nextStep = candidateStep
              nextApprovers = candidateApprovers
              nextStatus = steps[candidateStep]?.status === '回覧待ち' ? '回覧待ち' : '承認待ち'
              break
            } else {
              skippedSteps.push(candidateStep)
            }
          }
          if (nextStep === currentStep) {
            nextStep = '完了'
            nextStatus = '承認済み'
            nextApprovers = []
          }
        }
      }

      const updateData: any = {
        'workflow.status': nextStatus,
        'workflow.currentStep': nextStep,
        'workflow.currentApprovers': nextApprovers,
        [`workflow.steps.${currentStep}.status`]: isDeptHeadResubmit ? '承認済み(スキップ)' : '承認待ち',
        [`workflow.steps.${currentStep}.approvedBy`]: [],
        'description': newDescription,
        'remarks': newRemarks,
        updatedAt: serverTimestamp()
      }

      if (isDeptHeadResubmit && skippedSteps.length > 0) {
        skippedSteps.forEach(step => {
          updateData[`workflow.steps.${step}.status`] = '承認済み(スキップ)'
        })
      }

      if (selectedApplication.formDetails) {
        updateData['formDetails.amount'] = newAmount
        updateData['formDetails.paymentDate'] = newPaymentDate
        updateData['formDetails.payee'] = newPayee
      }

      await updateDoc(doc(db, 'applications', selectedApplication.id), updateData)

      await addDoc(collection(db, 'approvals'), {
        applicationId: selectedApplication.id,
        stepName: `${currentStep}(再申請)`,
        approverId: user.id,
        approverName: user.name,
        action: 'approve', 
        comment: '内容を修正して再申請しました（前段の承認は維持）。',
        createdAt: serverTimestamp()
      })

      if (nextApprovers.length > 0) {
        await sendResubmitNotification(selectedApplication, user.name, nextApprovers)
      } else if (nextStatus === '承認済み') {
        await sendFinalApprovalNotification(selectedApplication)
      }

      alert('修正して再申請しました。差し戻し元から処理を再開します。')
      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)
      window.location.reload()
    } catch (error) {
      console.error('Resubmit error:', error)
      alert('再申請に失敗しました')
    }
  }

  const sendFinalApprovalNotification = async (application: any) => {
    try {
      const applicantEmails = await getApproversEmails([application.applicantName])

      for (const email of applicantEmails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `【承認完了】${application.title}`,
            text: `「${application.title}」の承認が完了しました。\n\nすべての承認プロセスが終了し、最終決裁が下りました。\n\nダッシュボードから詳細を確認してください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #10b981;">承認完了のお知らせ</h2>
                <p>「<strong>${application.title}</strong>」の承認が完了しました。</p>
                <div style="background-color: #f0fdf4; padding: 15px; margin: 15px 0; border-left: 4px solid #10b981; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">状況:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">すべての承認プロセスが終了し、最終決裁が下りました。</p>
                </div>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
          })
        })
      }
    } catch (error) {
      console.error('Final approval notification error:', error)
    }
  }

  const sendFinalDecisionNotification = async (application: any) => {
    try {
      const applicantEmails = await getApproversEmails([application.applicantName])

      for (const email of applicantEmails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `【決裁完了】${application.title}`,
            text: `「${application.title}」の申請が決裁されました。\n\n最終決裁者の承認により、決裁が完了しました。\n\nダッシュボードから詳細を確認してください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #10b981;">決裁完了のお知らせ</h2>
                <p>「<strong>${application.title}</strong>」の申請が決裁されました。</p>
                <div style="background-color: #f0fdf4; padding: 15px; margin: 15px 0; border-left: 4px solid #10b981; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">状況:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">最終決裁者の承認により、決裁が完了しました。</p>
                </div>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
          })
        })
      }
    } catch (error) {
      console.error('Final decision notification error:', error)
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
            text: `${approverName}さんが「${application.title}」を承認しました。\n\n次の承認者として、あなたの確認・承認をお願いします。\n\nダッシュボードから詳細を確認してください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #4f46e5;">承認依頼</h2>
                <p><strong>${approverName}</strong>さんが「<strong>${application.title}</strong>」を承認しました。</p>
                <div style="background-color: #eef2ff; padding: 15px; margin: 15px 0; border-left: 4px solid #4f46e5; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">依頼内容:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">次の承認者として、確認・承認をお願いします。</p>
                </div>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
          })
        })
      }
    } catch (error) {
      console.error('Email notification error:', error)
    }
  }

  const sendResubmitNotification = async (application: any, resubmitterName: string, approvers: string[]) => {
    try {
      if (!approvers || approvers.length === 0) return
      const approverEmails = await getApproversEmails(approvers)

      for (const email of approverEmails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `【再申請】承認依頼: ${application.title}`,
            text: `${resubmitterName}さんが「${application.title}」を修正し、再申請しました。\n\n前段の承認は維持されています。確認・承認をお願いします。\n\nダッシュボードから詳細を確認してください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #4f46e5;">再申請の承認依頼</h2>
                <p><strong>${resubmitterName}</strong>さんが「<strong>${application.title}</strong>」を修正し、再申請しました。</p>
                <div style="background-color: #eef2ff; padding: 15px; margin: 15px 0; border-left: 4px solid #4f46e5; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">依頼内容:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">前段の承認は維持されています。確認・承認をお願いします。</p>
                </div>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
          })
        })
      }
    } catch (error) {
      console.error('Resubmit email notification error:', error)
    }
  }

  const getPreviousApprovers = (application: any) => {
    const steps = application.workflow?.steps || {}
    const names = new Set<string>()
    Object.values(steps).forEach((step: any) => {
      const approvedBy = step?.approvedBy || []
      approvedBy.forEach((name: string) => {
        if (name) names.add(name)
      })
    })
    return Array.from(names)
  }

  const sendRejectNotification = async (application: any, rejectorName: string, comment: string) => {
    try {
      // 申請者と前の承認者に通知
      const previousApprovers = getPreviousApprovers(application)
      const notifyNames = Array.from(new Set([application.applicantName, ...previousApprovers]))
      const emails = await getApproversEmails(notifyNames)

      for (const email of emails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `【要対応】差し戻しのお知らせ: ${application.title}`,
            text: `${rejectorName}さんが「${application.title}」を差し戻しました。\n\nコメント: ${comment || 'なし'}\n\nダッシュボードの送信一覧から確認し、修正・再申請を行ってください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #e63946;">差し戻しのお知らせ</h2>
                <p><strong>${rejectorName}</strong>さんが「<strong>${application.title}</strong>」を差し戻しました。</p>
                <div style="background-color: #fff3f3; padding: 15px; margin: 15px 0; border-left: 4px solid #e63946; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">差し戻し理由（コメント）:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">${comment ? comment.replace(/\n/g, '<br/>') : 'コメントなし'}</p>
                </div>
                <p>ダッシュボードの「送信一覧」から詳細を開き、内容を修正してその場で再申請してください。</p>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
          })
        })
      }
    } catch (error) {
      console.error('Reject email notification error:', error)
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
    if (!selectedApplication || !isApplication(selectedApplication) || !user) return
    try {
      const isReport = selectedApplication.appName === '回覧報告'
      const workflow = selectedApplication.workflow
      const currentStep = workflow.currentStep || '回覧先'
      const steps = workflow.steps || {}
      const circulationsList = workflow.circulations || []
      const allCirculatorsList = workflow.allCirculators || []
      const confirmedByList = workflow.confirmedBy || []
      const currentApproversList = workflow.currentApprovers || []
      const stepData = steps[currentStep] || { approvers: circulationsList, approvedBy: confirmedByList, status: '' }
      const allApprovers: string[] = stepData.approvers?.length
        ? stepData.approvers
        : circulationsList.length
        ? circulationsList
        : allCirculatorsList.length
        ? allCirculatorsList
        : currentApproversList.length
        ? currentApproversList
        : []
      const approvedBy: string[] = stepData.approvedBy?.length ? stepData.approvedBy : confirmedByList

      if (approvedBy.includes(user.name)) {
        alert('既に回覧を確認済みです')
        return
      }

      const newApprovedBy = Array.from(new Set([...approvedBy, user.name]))
      const allApproved = allApprovers.length > 0 && allApprovers.every(name => newApprovedBy.includes(name))
      const completedStatus = isReport ? '回覧済み' : '承認済み'
      const nextStatus = allApproved ? completedStatus : (isReport ? '回覧待ち' : workflow.status)
      const nextStepName = allApproved ? '完了' : currentStep
      const nextApprovers = allApproved ? [] : allApprovers.filter(name => !newApprovedBy.includes(name))
      const nextStepStatus = allApproved ? completedStatus : '回覧待ち'

      const updateData: any = {
        'workflow.status': nextStatus,
        'workflow.currentStep': nextStepName,
        'workflow.currentApprovers': nextApprovers,
        'workflow.confirmedBy': newApprovedBy,
        updatedAt: serverTimestamp()
      }
      if (currentStep && steps[currentStep]) {
        updateData[`workflow.steps.${currentStep}.approvedBy`] = newApprovedBy
        updateData[`workflow.steps.${currentStep}.status`] = nextStepStatus
      }

      await updateDoc(doc(db, 'applications', selectedApplication.id), updateData)

      await addDoc(collection(db, 'circulations'), {
        applicationId: selectedApplication.id,
        userId: user.id,
        userName: user.name,
        confirmedAt: serverTimestamp()
      })

      alert(allApproved ? (isReport ? '全員の回覧が完了しました' : '承認が完了しました') : '回覧を確認しました')
      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)
      window.location.reload()
    } catch (error) {
      console.error('Circulation error:', error)
      alert('処理に失敗しました')
    }
  }

  const handleInformationConfirm = async () => {
    if (!selectedApplication || !user) return
    try {
      await confirmInformation(selectedApplication.id, user.name)

      alert('内容を確認しました')
      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)

      window.location.reload()
    } catch (error) {
      console.error('Information confirm error:', error)
      alert('処理に失敗しました')
    }
  }

  const handleDeleteApplication = async () => {
    if (!selectedApplication || !isApplication(selectedApplication) || !user) return
    if (selectedApplication.applicantId !== user.id) {
      alert('申請者のみ取消できます')
      return
    }
    if (selectedApplication.workflow.status === '取り消し') {
      alert('既に取り消し済みです')
      return
    }
    if (selectedApplication.appName !== '回覧報告' && ['承認済み', '回覧済み'].includes(selectedApplication.workflow.status)) {
      alert('完了済みの申請は取消できません')
      return
    }
    if (!window.confirm('この申請を取り消しますか？')) return

    try {
      const cancelledStatus = '取り消し'
      await updateDoc(doc(db, 'applications', selectedApplication.id), {
        'workflow.status': cancelledStatus,
        'workflow.currentApprovers': [],
        updatedAt: serverTimestamp()
      })

      const updateApp = (app: Application): Application => ({
        ...app,
        workflow: { ...app.workflow, status: cancelledStatus, currentApprovers: [] }
      })

      setMyApplications(prev => prev.map(app => app.id === selectedApplication.id ? updateApp(app) : app))
      setAllApplications(prev => prev.map(app => app.id === selectedApplication.id ? updateApp(app) : app))
      setRejectedApplications(prev => prev.filter(app => app.id !== selectedApplication.id))
      setCompletedApplications(prev => prev.filter(app => app.id !== selectedApplication.id))
      setShowDetailModal(false)
      setSelectedApplication(null)
      setModalSource(null)
      alert('申請を取り消しました')
      window.location.reload()
    } catch (error) {
      console.error('Delete application error:', error)
      alert('取消に失敗しました')
    }
  }

  const attachedImages = useMemo(() => {
    if (!selectedApplication) return []
    const urls: string[] = []
    
    if (isApplication(selectedApplication)) {
      if (Array.isArray(selectedApplication.attachments)) {
        selectedApplication.attachments.forEach(file => {
          if (file.url) {
            const isImageMime = file.type && file.type.startsWith('image/')
            const isImageExt = file.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
            if (isImageMime || isImageExt) {
              urls.push(file.url)
            }
          }
        })
      }
      
      if (selectedApplication.imageUrl) urls.push(selectedApplication.imageUrl)
      if (Array.isArray(selectedApplication.imageUrls)) urls.push(...selectedApplication.imageUrls)
      if (selectedApplication.formDetails?.imageUrl) urls.push(selectedApplication.formDetails.imageUrl)
      if (Array.isArray(selectedApplication.formDetails?.imageUrls)) urls.push(...selectedApplication.formDetails.imageUrls)
    }
    
    return Array.from(new Set(urls.filter(url => typeof url === 'string' && url.trim() !== '')))
  }, [selectedApplication])

  const attachedPdfs = useMemo(() => {
    if (!selectedApplication) return []
    const pdfs: { url: string; name: string }[] = []
    if (isApplication(selectedApplication) && Array.isArray(selectedApplication.attachments)) {
      selectedApplication.attachments.forEach(file => {
        if (file.url) {
          const isPdfMime = file.type && file.type === 'application/pdf'
          const isPdfExt = file.name && file.name.toLowerCase().endsWith('.pdf')
          if (isPdfMime || isPdfExt) {
            pdfs.push({ url: file.url, name: file.name })
          }
        }
      })
    }
    return pdfs
  }, [selectedApplication])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse flex items-center gap-2 font-medium">
          データを読み込み中...
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <header className="sticky top-0 bg-slate-900/70 backdrop-blur-md border-b border-slate-700/80 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 
            className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent cursor-pointer"
            onClick={() => setView('top')}
          >
            社内承認ポータル
          </h1>
          <div className="flex items-center gap-6">
            {user?.email === 'm.shirai@yunia.co.jp' && (
              <button
                onClick={handleAdminUsers}
                className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-500/20 px-3 py-1.5 rounded-lg bg-cyan-500/5 hover:bg-cyan-500/10"
              >
                社員マスタ管理
              </button>
            )}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 print:hidden">
        {view === 'top' && (
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div 
                onClick={() => setView('approvals')}
                className="relative group overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-700 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)] hover:border-indigo-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-56"
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
                  <p className="text-slate-400 text-sm max-w-full leading-relaxed">
                    あなた宛てに届いている承認依頼の確認や、回覧報告、その他経費申請の一覧ページへ移動します。
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-2 text-xs font-semibold flex-wrap">
                    <span className="bg-red-500/10 text-red-400 px-2.5 py-1 rounded-md border border-red-500/20">承認待ち: {pendingApprovals.length}件</span>
                    <span className="bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-md border border-blue-500/20">回覧待ち: {circulations.length}件</span>
                    <span className="bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-md border border-purple-500/20">情報収集: {informations.length}件</span>
                    <span className="bg-green-500/10 text-green-400 px-2.5 py-1 rounded-md border border-green-500/20">経費申請: {expenses.length}件</span>
                  </div>
                  <span className="text-indigo-400 group-hover:translate-x-1.5 transition-transform font-bold text-lg">→</span>
                </div>
              </div>

              <div 
                onClick={() => router.push('/create')}
                className="relative group overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border border-slate-700 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)] hover:border-emerald-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-56"
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
                  <p className="text-slate-400 text-sm max-w-full leading-relaxed">
                    画像付き各種ワークフローの起票、稟議書、新規の回覧・報告書類を新しく作成して送信します。
                  </p>
                </div>
                <div className="text-right mt-4">
                  <span className="text-emerald-400 group-hover:translate-x-1.5 transition-transform font-bold text-lg inline-block">GO →</span>
                </div>
              </div>
            </div>

            <ApplicationAccordion
              title="下書き"
              subtitle="（保存中の申請・回覧報告）"
              isOpen={draftAppsOpen}
              onToggle={() => setDraftAppsOpen(prev => !prev)}
              loading={loadingDraftApps}
              applications={draftApplications}
              onItemClick={(app) => router.push('/create?draft=' + app.id)}
              emptyMessage="下書きはありません"
              showCount
            />

            <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
              <button
                type="button"
                onClick={() => setSendHistoryOpen(prev => !prev)}
                className="w-full flex justify-between items-center group"
                aria-expanded={sendHistoryOpen}
              >
                <h2 className="text-lg font-bold text-slate-200 tracking-wide flex items-center gap-2">
                  <span>📋</span> 送信一覧 <span className="text-sm font-normal text-slate-500">（自分の申請履歴）</span>
                </h2>
                <span className={`text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${sendHistoryOpen ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {sendHistoryOpen && (
                <div className="mt-4">
                  {loadingMyApps ? (
                    <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40 animate-pulse">
                      読み込み中...
                    </div>
                  ) : myApplications.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40">
                      あなたが送信した申請はまだありません
                    </div>
                  ) : (
                    <div>
                      <ApplicationList applications={myApplications} onItemClick={(app) => handleApplicationClick(app, 'sent')} />
                      <PaginationControls
                        page={myAppsPage}
                        hasNext={myAppsHasNext}
                        loading={loadingMyApps}
                        onPrev={() => setMyAppsPage(p => p - 1)}
                        onNext={() => setMyAppsPage(p => p + 1)}
                        onRefresh={() => fetchMyApplications(myAppsPage)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {user?.canViewAllApplications && (
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                <button
                  type="button"
                  onClick={() => setAllAppsOpen(prev => !prev)}
                  className="w-full flex justify-between items-center group"
                  aria-expanded={allAppsOpen}
                >
                  <h2 className="text-lg font-bold text-slate-200 tracking-wide flex items-center gap-2">
                    <span>🌐</span> 全社員の申請一覧 <span className="text-sm font-normal text-slate-500">（指定ユーザー専用）</span>
                  </h2>
                  <span className={`text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${allAppsOpen ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
                {allAppsOpen && (
                  <div className="mt-4">
                    <div className="relative mb-4">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={allAppsSearchQuery}
                        onChange={(e) => setAllAppsSearchQuery(e.target.value)}
                        placeholder="件名・申請者・種別・申請番号で検索"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                    {loadingAllApps ? (
                      <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40 animate-pulse">
                        読み込み中...
                      </div>
                    ) : visibleAllApplications.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40">
                        申請はまだありません
                      </div>
                    ) : (
                      <div>
                        <ApplicationList applications={visibleAllApplications} onItemClick={(app) => handleApplicationClick(app, 'sent')} showApplicant />
                        <PaginationControls
                          page={allAppsPage}
                          hasNext={allAppsHasNext}
                          loading={loadingAllApps}
                          onPrev={() => setAllAppsPage(p => p - 1)}
                          onNext={() => setAllAppsPage(p => p + 1)}
                          onRefresh={() => {
                            allAppsCursorsRef.current = []
                            setAllAppsPage(1)
                            fetchAllApplications(1, false)
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <ApplicationAccordion
              title="差し戻しされた申請"
              subtitle="（再申請が必要な自分の申請）"
              isOpen={rejectedAppsOpen}
              onToggle={() => setRejectedAppsOpen(prev => !prev)}
              loading={loadingRejectedApps}
              applications={rejectedApplications}
              onItemClick={(app) => handleApplicationClick(app, 'sent')}
              emptyMessage="差し戻しされた申請はありません"
              showCount={true}
            />

            <ApplicationAccordion
              title="承認完了した申請"
              subtitle="（すべての段階で承認済みの自分の申請）"
              isOpen={completedAppsOpen}
              onToggle={() => setCompletedAppsOpen(prev => !prev)}
              loading={loadingCompletedApps}
              applications={completedApplications}
              onItemClick={(app) => handleApplicationClick(app, 'sent')}
              emptyMessage="承認完了した申請はありません"
            />

            <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
              <button
                type="button"
                onClick={() => setProcessedAppsOpen(prev => !prev)}
                className="w-full flex justify-between items-center group"
                aria-expanded={processedAppsOpen}
              >
                <h2 className="text-lg font-bold text-slate-200 tracking-wide flex items-center gap-2">
                  <span>✅</span> 承認・回覧済みの申請 <span className="text-sm font-normal text-slate-500">（自分が承認または回覧を確認した申請）</span>
                </h2>
                <span className={`text-slate-400 group-hover:text-slate-200 transition-transform duration-200 ${processedAppsOpen ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {processedAppsOpen && (
                <div className="mt-4 space-y-4">
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700/80 text-xs font-semibold w-fit">
                    <button
                      onClick={() => setProcessedTab('approval')}
                      className={`px-3 py-1.5 rounded-md transition-all ${
                        processedTab === 'approval'
                          ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      承認 ({processedApprovals.length})
                    </button>
                    <button
                      onClick={() => setProcessedTab('circulation')}
                      className={`px-3 py-1.5 rounded-md transition-all ${
                        processedTab === 'circulation'
                          ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      回覧 ({processedCirculations.length})
                    </button>
                  </div>
                  {(() => {
                    const loading = processedTab === 'approval' ? loadingProcessedApprovals : loadingProcessedCirculations
                    const apps = processedTab === 'approval' ? processedApprovals : processedCirculations
                    const empty = processedTab === 'approval' ? '承認した申請はありません' : '回覧を確認した申請はありません'
                    if (loading) {
                      return (
                        <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40 animate-pulse">
                          読み込み中...
                        </div>
                      )
                    }
                    if (apps.length === 0) {
                      return (
                        <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40">
                          {empty}
                        </div>
                      )
                    }
                    return <ApplicationList applications={apps} onItemClick={(app) => handleApplicationClick(app, 'processed')} showApplicant />
                  })()}
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
                className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5 group bg-slate-900 px-4 py-2 rounded-xl border border-slate-700"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> トップページへ戻る
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* カード1：社内用ポータル申請（承認待ち ＆ 回覧報告） */}
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between min-h-[420px]">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/80 pb-4 mb-4">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      📥 ポータル申請タスク
                    </h2>
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700/80 text-xs font-semibold">
                      <button
                        onClick={() => setApprovalTab('pending')}
                        className={`px-3 py-1.5 rounded-md transition-all ${
                          approvalTab === 'pending'
                            ? 'bg-red-500/20 text-red-400 shadow-sm border border-red-500/30'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        承認待ち ({pendingApprovals.length})
                      </button>
                      <button
                        onClick={() => setApprovalTab('circulation')}
                        className={`px-3 py-1.5 rounded-md transition-all ${
                          approvalTab === 'circulation'
                            ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        回覧報告 ({circulations.length})
                      </button>
                    </div>
                  </div>

                  {approvalTab === 'pending' ? (
                    <div>
                      <p className="text-slate-400 text-xs mb-4">自分が承認者として設定されている申請</p>
                      {pendingApprovals.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40">
                          承認待ちの申請はありません
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                          {pendingApprovals.map(app => (
                            <div 
                              key={app.id} 
                              className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                              onClick={() => handleApplicationClick(app, 'pending')}
                            >
                              <div className="font-semibold text-sm text-slate-200 group-hover:text-slate-50 transition-colors">{app.title}</div>
                              <div className="text-xs text-slate-400 mt-1 flex justify-between">
                                <span>{app.applicantName}</span>
                                <span className="text-slate-500">{app.subType}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-slate-400 text-xs mb-4">自分が回覧先に設定されている未確認の申請</p>
                      {circulations.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40">
                          未確認の回覧はありません
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                          {circulations.map(app => (
                            <div 
                              key={app.id} 
                              className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                              onClick={() => handleApplicationClick(app, 'circulation')}
                            >
                              <div className="font-semibold text-sm text-slate-200 group-hover:text-slate-50 transition-colors">{app.title}</div>
                              <div className="text-xs text-slate-400 mt-1 flex justify-between">
                                <span>{app.applicantName}</span>
                                <span className="text-slate-500">{app.subType}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* カード2：AppSheet連携（情報収集 ＆ 経費申請） */}
              <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex flex-col justify-between min-h-[420px]">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
                    <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      📊 AppSheet連携
                    </h2>
                    <div className="flex gap-2">
                      <span className="text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-full">
                        情報収集: {informations.length}件
                      </span>
                      <span className="text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-full">
                        経費申請: {expenses.length}件
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-400 text-xs mb-4">自分が確認担当者に設定されている未確認の情報</p>
                  
                  {informations.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg bg-slate-950/40 mb-6">
                      未確認の情報はありません
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 mb-6">
                      {informations.map(info => (
                        <div 
                          key={info.id} 
                          className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg hover:bg-slate-800/90 hover:border-slate-700 transition-all cursor-pointer group"
                          onClick={() => handleInformationClick(info)}
                        >
                          <div className="font-semibold text-sm text-slate-200 group-hover:text-slate-50 transition-colors">{info.title}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            確認担当者: {(info.reviewers || []).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-700/80 pt-6 mt-auto">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500">経費精算の承認・確認はこちら</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/expenses')}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-slate-50 font-semibold py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(147,51,234,0.25)] hover:shadow-[0_0_20px_rgba(147,51,234,0.35)] transition-all text-sm tracking-wide flex items-center justify-center gap-2"
                  >
                    <span>💸</span> AppSheet経費申請一覧を開く
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {showDetailModal && selectedApplication && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity print:static print:block print:h-auto print:max-h-none print:overflow-visible print:p-0 print:bg-transparent">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:w-full print:rounded-none print:shadow-none print:border-0 print:min-h-0">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-xl font-bold text-slate-100">{selectedApplication.title}</h2>
                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="印刷"
                    className="text-slate-400 hover:text-slate-50 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all text-sm"
                  >
                    <Printer size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      setModalSource(null)
                    }}
                    className="text-slate-400 hover:text-slate-50 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {modalSource === 'information' ? (
                  <>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-700/60 w-fit">
                      <span>情報収集データ</span>
                      <span className="text-slate-700">•</span>
                      <StatusBadge status={(selectedApplication as AppSheetInformation).ステータス} />
                    </div>

                    <div className="bg-slate-950/30 border border-slate-700/80 p-4 rounded-xl">
                      <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">確認担当者</h3>
                      <div className="text-sm text-slate-400">
                        <p>{((selectedApplication as AppSheetInformation).確認担当者 || []).join(', ') || (selectedApplication as AppSheetInformation).reviewers?.join?.(', ') || '未設定'}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">内容</h3>
                      <p className="text-sm text-slate-400 bg-slate-950/20 border border-slate-700/40 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">{(selectedApplication as AppSheetInformation).内容}</p>
                    </div>

                    <div className="text-xs text-slate-500 text-right border-t border-slate-700 pt-4">
                      作成日: {(selectedApplication as AppSheetInformation).作成日時 ? new Date((selectedApplication as AppSheetInformation).作成日時).toLocaleString('ja-JP') : '-'}
                    </div>

                    <div className="border-t border-slate-700 pt-4">
                      <InformationConfirmForm
                        information={selectedApplication as AppSheetInformation}
                        onConfirm={handleInformationConfirm}
                      />
                    </div>
                  </>
                ) : isApplication(selectedApplication) ? (
                  <>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-700/60 w-fit">
                      <span className="text-slate-300 font-mono">No. {selectedApplication.applicationNo ?? '-'}</span>
                      <span className="text-slate-700">•</span>
                      <span>{selectedApplication.appName}</span>
                      <span className="text-slate-700">•</span>
                      <span>{selectedApplication.subType}</span>
                      <span className="text-slate-700">•</span>
                      <StatusBadge status={getEffectiveStatus(selectedApplication)} />
                    </div>

                    {(() => {
                      const lastComment = [...approvalHistory].reverse().find((h: any) => h.comment)
                      return lastComment ? (
                        <div className={`p-4 rounded-xl border ${
                          lastComment.action === 'reject'
                            ? 'bg-orange-500/10 border-orange-500/30'
                            : 'bg-emerald-500/10 border-emerald-500/30'
                        }`}>
                          <h3 className={`text-sm font-bold mb-2 uppercase tracking-wider ${
                            lastComment.action === 'reject' ? 'text-orange-300' : 'text-emerald-300'
                          }`}>
                            {lastComment.action === 'reject' ? '差し戻しコメント' : '承認者コメント'}
                          </h3>
                          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{lastComment.comment}</p>
                          <p className="text-xs text-slate-500 mt-2">
                            {lastComment.action === 'reject' ? '差し戻し者' : '承認者'}: {lastComment.approverName} | {lastComment.createdAt ? new Date(lastComment.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
                          </p>
                        </div>
                      ) : null
                    })()}

                    <div className="bg-slate-950/30 border border-slate-700/80 p-4 rounded-xl">
                      <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">申請者情報</h3>
                      <div className="text-sm text-slate-400 space-y-1.5">
                        <p><span className="text-slate-500 mr-2">氏名:</span>{selectedApplication.applicantName}</p>
                        <p><span className="text-slate-500 mr-2">所属:</span>{selectedApplication.applicantDept}</p>
                        <p><span className="text-slate-500 mr-2">役職:</span>{selectedApplication.applicantTitle}</p>
                      </div>
                    </div>

                    {selectedApplication.appName === '回覧報告' ? (
                      <div className="bg-slate-950/30 border border-slate-700/80 p-4 rounded-xl">
                        <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">回覧状況</h3>
                        {(() => {
                          const members = selectedApplication.workflow.circulations || selectedApplication.workflow.allCirculators || selectedApplication.workflow.steps?.['回覧先']?.approvers || []
                          const confirmed = new Set<string>([
                            ...(selectedApplication.workflow.confirmedBy || []),
                            ...(selectedApplication.workflow.steps?.['回覧先']?.approvedBy || [])
                          ])
                          const total = members.length
                          const done = members.filter((m: string) => confirmed.has(m)).length
                          if (total === 0) {
                            return <p className="text-sm text-slate-500">回覧先メンバーは指定されていません</p>
                          }
                          return (
                            <div className="space-y-2">
                              <p className="text-xs text-slate-500 mb-2">{done}/{total} 名が回覧済み</p>
                              {members.map((member: string) => {
                                const isConfirmed = confirmed.has(member)
                                return (
                                  <div key={member} className="flex items-center justify-between text-sm border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                                    <span className="text-slate-200">{member}</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${isConfirmed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                      {isConfirmed ? '回覧済み' : '回覧待ち'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <div className="bg-slate-950/30 border border-slate-700/80 p-4 rounded-xl">
                        <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">現在の承認ルート進捗状況</h3>
                        <div className="relative border-l border-slate-700 ml-2 pl-6 space-y-4 my-2">
                          {(selectedApplication.workflow.stepOrder || Object.keys(selectedApplication.workflow.steps || {})).map((stepKey: string) => {
                            const stepData = selectedApplication.workflow.steps?.[stepKey]
                            const approverNames = stepData?.approvers || []
                            const stepStatus = stepData?.status || '未着手'

                            return (
                              <div key={stepKey} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                                <div className={`absolute -left-[31px] w-3 h-3 rounded-full border-2 bg-slate-900 ${
                                  stepStatus === '承認済み' ? 'border-emerald-500 shadow-[0_0_8px_#10b981]' :
                                  stepStatus === '承認済み(スキップ)' ? 'border-slate-600' :
                                  stepStatus === '承認待ち' || stepStatus === '回覧待ち' ? 'border-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]' :
                                  stepStatus === '差し戻し' ? 'border-orange-500 shadow-[0_0_8px_#f97316]' :
                                  'border-slate-700'
                                }`} />

                                <div>
                                  <span className="font-bold text-slate-200">{stepKey}</span>
                                  <span className="text-xs text-slate-500 ml-2">メンバー:</span>
                                  <span className="text-slate-400 font-semibold ml-1">
                                    {Array.isArray(approverNames) ? approverNames.join(', ') : '（指定なし）'}
                                  </span>
                                </div>

                                <div className="sm:text-right">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                                    stepStatus === '承認済み' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                    stepStatus === '承認済み(スキップ)' ? 'bg-slate-800/50 text-slate-500 border-slate-700/30' :
                                    stepStatus === '承認待ち' || stepStatus === '回覧待ち' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                    stepStatus === '差し戻し' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                    'bg-slate-900 text-slate-600 border-slate-700/50'
                                  }`}>
                                    {stepStatus}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">詳細説明</h3>
                      <p className="text-sm text-slate-400 bg-slate-950/20 border border-slate-700/40 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">{selectedApplication.description}</p>
                    </div>

                    {selectedApplication.formDetails && (
                      <div className="bg-slate-950/30 border border-slate-700/80 p-4 rounded-xl">
                        <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">詳細情報</h3>
                        <FormDetailsDisplay details={selectedApplication.formDetails} />
                      </div>
                    )}

                    {attachedImages.length > 0 && (
                      <div className="print:hidden">
                        <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">添付写真</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/30 border border-slate-700 rounded-xl p-4">
                          {attachedImages.map((url, index) => (
                            <div 
                              key={index} 
                              onClick={() => setPreviewImageUrl(url)}
                              className="group relative rounded-lg overflow-hidden border border-slate-700/50 bg-slate-950 flex items-center justify-center p-2 min-h-[160px] cursor-pointer hover:border-indigo-500/50 transition-all duration-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={url} 
                                alt={`添付画像-${index + 1}`} 
                                className="max-w-full max-h-48 object-contain rounded transition-transform duration-200 group-hover:scale-[1.02]"
                                loading="lazy"
                              />
                              <div className="absolute bottom-1 right-2 bg-black/60 text-[10px] text-slate-400 px-1.5 py-0.5 rounded">
                                画像 {index + 1} (拡大可)
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {attachedPdfs.length > 0 && (
                      <div className="print:hidden">
                        <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">添付書類（PDF）</h3>
                        <div className="space-y-3 bg-slate-950/30 border border-slate-700 rounded-xl p-4">
                          {attachedPdfs.map((pdf, index) => (
                            <a
                              key={index}
                              href={pdf.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-center justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-950 px-4 py-3 hover:border-indigo-500/40 transition-all"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText size={18} className="text-slate-400 shrink-0" />
                                <span className="text-sm text-slate-300 truncate">{pdf.name}</span>
                              </div>
                              <span className="text-sm text-cyan-400 whitespace-nowrap">開く</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedApplication.remarks && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">備考</h3>
                        <p className="text-sm text-slate-400 bg-slate-950/20 border border-slate-700/40 p-4 rounded-xl whitespace-pre-wrap">{selectedApplication.remarks}</p>
                      </div>
                    )}

                    <div className="text-xs text-slate-500 text-right border-t border-slate-700 pt-4">
                      作成日: {selectedApplication.createdAt ? new Date(selectedApplication.createdAt.toDate()).toLocaleString('ja-JP') : '-'}
                    </div>

                    {approvalHistory.length > 0 && (
                      <div className="border-t border-slate-700 pt-4">
                        <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">承認アクション履歴</h3>
                        <div className="space-y-3">
                          {approvalHistory.map((history) => (
                            <div key={history.id} className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
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
                                <p>担当者: {history.approverName}</p>
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

                    {selectedApplication.workflow.status === '差し戻し' && selectedApplication.applicantId === user.id && (
                      <div className="border-t border-slate-700 pt-4">
                        <ApplicationResubmitForm
                          application={selectedApplication}
                          onResubmit={handleResubmit}
                        />
                      </div>
                    )}

                    {modalSource !== 'sent' && modalSource !== 'processed' && selectedApplication.workflow.status === '承認待ち' && (
                      <div className="border-t border-slate-700 pt-4">
                        <ApplicationApprovalForm
                          application={selectedApplication}
                          user={user}
                          onApprove={handleApproval}
                          onSkip={handleSkip}
                        />
                      </div>
                    )}

                    {modalSource !== 'sent' && modalSource !== 'processed' && (
                      (selectedApplication.appName === '回覧報告' && getEffectiveStatus(selectedApplication) === '回覧待ち') ||
                      (selectedApplication.appName !== '回覧報告' && selectedApplication.workflow.status === '承認済み')
                    ) && (
                      <div className="border-t border-slate-700 pt-4">
                        <button
                          onClick={handleCirculation}
                          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-slate-50 font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all duration-200 text-sm tracking-wide"
                        >
                          回覧を確認
                        </button>
                      </div>
                    )}

                    {selectedApplication.applicantId === user.id &&
                      selectedApplication.workflow.status !== '取り消し' &&
                      (selectedApplication.appName === '回覧報告' || (selectedApplication.workflow.status !== '承認済み' && selectedApplication.workflow.status !== '回覧済み')) && (
                      <div className="border-t border-slate-700 pt-4">
                        <button
                          onClick={handleDeleteApplication}
                          className="w-full bg-rose-950/30 border border-rose-500/30 hover:bg-rose-900/40 text-rose-400 font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 text-sm tracking-wide"
                        >
                          申請を取り消す
                        </button>
                      </div>
                    )}

                    {modalSource === 'sent' && isApplication(selectedApplication) && (
                      <div className="border-t border-slate-700 pt-4">
                        <button
                          onClick={() => {
                            setShowDetailModal(false)
                            setModalSource(null)
                            router.push(`/create?reuse=${selectedApplication.id}`)
                          }}
                          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-50 font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all duration-200 text-sm tracking-wide"
                        >
                          再利用
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[60] animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-6 right-6 text-slate-400 hover:text-slate-50 bg-slate-900/80 p-2.5 rounded-full border border-slate-700 hover:border-slate-600 transition-all text-sm z-10 font-bold shadow-2xl"
          >
            ✕ 閉じる
          </button>
          <div className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={previewImageUrl} 
              alt="拡大プレビュー" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()} 
            />
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
  onSkip,
}: { 
  application: Application
  user: any
  onApprove: (action: 'approve' | 'reject', comment: string) => void
  onSkip?: (comment: string) => void
  onClose?: () => void
}) {
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  const isCurrentApprover = useMemo(() => {
    if (!application || !user) return false
    
    const currentApprovers = application.workflow.currentApprovers || []
    const currentStep = application.workflow.currentStep
    const steps = application.workflow.steps || {}
    const currentStepData = steps[currentStep]
    const stepApprovers = currentStepData?.approvers || []
    
    return currentApprovers.includes(user.name) || stepApprovers.includes(user.name)
  }, [application, user])

  const isSkipAllowed = useMemo(() => {
    if (!application || !user) return false
    const currentStep = application.workflow.currentStep
    const currentApprovers = application.workflow.currentApprovers || []
    const isRankStep = ['部長', '本部長'].some(t => currentStep.includes(t))
    const isApplicantRank = ['部長', '本部長'].includes(application.applicantTitle || '')
    return isRankStep &&
      isApplicantRank &&
      application.applicantId === user.id &&
      (currentApprovers.length === 0 || currentApprovers.every(a => a === user.name))
  }, [application, user])

  const handleAction = async (action: 'approve' | 'reject' | 'skip') => {
    setProcessing(true)
    if (action === 'skip' && onSkip) {
      await onSkip(comment)
    } else {
      await onApprove(action as 'approve' | 'reject', comment)
    }
    setProcessing(false)
  }

  if (isSkipAllowed) {
    return (
      <div className="bg-slate-950/40 border border-slate-700 p-4 rounded-xl">
        <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">承認処理</h3>
        <p className="text-sm text-slate-400 mb-4">
          あなたは部長/本部長クラスです。自身の承認ステップをスキップして次のステップへ進めます。
        </p>
        <button
          type="button"
          onClick={() => handleAction('skip')}
          disabled={processing}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-slate-50 font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {processing ? '処理中...' : '承認ステップをスキップして進む'}
        </button>
      </div>
    )
  }

  if (!isCurrentApprover) {
    return (
      <div className="bg-slate-950/40 border border-slate-700 p-4 rounded-xl">
        <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">承認処理</h3>
        <div className="text-sm text-slate-400 text-center py-4">
          あなたはこの申請の承認者ではありません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-950/40 border border-slate-700 p-4 rounded-xl">
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
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-50 font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {processing ? '処理中...' : '承認'}
          </button>
          <button
            type="button"
            onClick={() => handleAction('reject')}
            disabled={processing}
            className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-amber-500 hover:to-orange-500 text-slate-50 font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {processing ? '処理中...' : '差し戻し'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ApplicationResubmitForm({
  application,
  onResubmit,
}: {
  application: Application
  onResubmit: (description: string, amount: number, paymentDate: string, payee: string, remarks: string) => Promise<void>
}) {
  const [description, setDescription] = useState(application.description || '')
  const [remarks, setRemarks] = useState(application.remarks || '')
  const [amount, setAmount] = useState(application.formDetails?.amount?.toString() || '')
  const [paymentDate, setPaymentDate] = useState(application.formDetails?.paymentDate || '')
  const [payee, setPayee] = useState(application.formDetails?.payee || '')
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    await onResubmit(description, Number(amount) || 0, paymentDate, payee, remarks)
    setProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-950/50 border border-amber-500/20 p-4 rounded-xl space-y-4 shadow-xl">
      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider mb-2">
        <span>⚠️</span> 差し戻し箇所の修正・再申請フォーム（前段の承認は維持されます）
      </div>
      
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 mb-1">内容説明の修正</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700/60 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      {application.formDetails && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">金額 (¥)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700/50 rounded text-sm text-cyan-400 font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">支払日</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700/50 rounded text-sm text-slate-200"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 mb-1">支払先</label>
            <input
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700/50 rounded text-sm text-slate-200"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-semibold text-slate-400 mb-1">備考の追加</label>
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700/60 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      <button
        type="submit"
        disabled={processing}
        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-slate-50 font-bold py-2.5 px-4 rounded-lg shadow-lg text-sm tracking-wide transition-all disabled:opacity-50"
      >
        {processing ? '再申請処理中...' : '修正を完了して、差し戻し位置から再申請する'}
      </button>
    </form>
  )
}

function InformationConfirmForm({
  information,
  onConfirm,
}: {
  information: AppSheetInformation
  onConfirm: () => void
}) {
  const [processing, setProcessing] = useState(false)

  const handleConfirm = async () => {
    setProcessing(true)
    await onConfirm()
    setProcessing(false)
  }

  return (
    <div className="bg-slate-950/40 border border-slate-700 p-4 rounded-xl">
      <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">確認処理</h3>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          この情報の内容を確認しました。確認すると、スプレッドシートのステータスも「確認完了」に更新されます。
        </p>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing}
          className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-slate-50 font-semibold py-2.5 px-4 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {processing ? '処理中...' : '内容を確認しました'}
        </button>
      </div>
    </div>
  )
}