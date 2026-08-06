'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, getDoc, runTransaction } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Users, Search, Check, ArrowLeft, Paperclip, X, ChevronDown, Send, FileText, Share2, Gavel, Clock } from 'lucide-react'

// ==========================================
// 1. 型定義・共通コンポーネント
// ==========================================
interface Employee {
  name: string
  email: string
  title: string
  dept: string
}

interface EmployeeMaster {
  [dept: string]: Employee[]
}

const AccordItem = ({ title, count, children, isActive, onClick }: any) => (
  <div className="border-b border-slate-800 last:border-0 overflow-hidden">
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-5 py-4 transition-all duration-300 ${
        isActive ? 'bg-slate-800/60' : 'bg-slate-900/40 hover:bg-slate-800/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <Users size={18} className={isActive ? 'text-indigo-400' : 'text-slate-500'} />
        <span className={`text-sm font-bold tracking-wide ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>
          {title}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${
          count > 0 
            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]' 
            : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
        }`}>
          {count}名選択済
        </span>
        <ChevronDown size={16} className={`text-slate-500 transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} />
      </div>
    </button>
    {isActive && (
      <div className="p-4 bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-2 duration-300">
        {children}
      </div>
    )}
  </div>
)

// ==========================================
// 2. 承認ルート計算ロジック（最新の業務フロー）
// ==========================================
function getRelatedGM(dept: string, generalManagers: any[]) {
  if (!dept) return null
  if (dept === '三保事業所' || dept === '九州支店') return generalManagers.find(m => m.dept === '営業管理本部')
  if (dept === '特掃部' || dept === '警備管理部' || dept === '施設管理部' || dept === 'グリーン管理部') return generalManagers.find(m => m.dept === '技術管理本部')
  return generalManagers.find(m => m.dept === dept)
}

function getApprovalRoute(subType: string, applicantDept: string, applicantTitle: string, employeeMaster: EmployeeMaster, generalManagers: any[]) {
  const relatedGM = getRelatedGM(applicantDept, generalManagers)
  const generalAffairsDept = employeeMaster['総務管理本部'] || []
  
  const tanabe = generalAffairsDept.find(m => m.name.includes('田邉'))?.name || '田邉洋'
  const kaneda = generalAffairsDept.find(m => m.name.includes('金田'))?.name || '金田麻里江'
  const mori = generalAffairsDept.find(m => m.name.includes('森'))?.name || '森雅代'
  const tsuboi = generalAffairsDept.find(m => m.name.includes('坪井'))?.name || '坪井美須夫'
  const takahashi = generalAffairsDept.find(m => m.name.includes('高橋'))?.name || '高橋広道'
  const miura = generalAffairsDept.find(m => m.name.includes('三浦'))?.name || '三浦暢子'
  const asakura = generalAffairsDept.find(m => m.name.includes('朝倉'))?.name || '朝倉千晶'
  const kawakami = generalAffairsDept.find(m => m.name.includes('川上'))?.name || '川上沙織'
  const katase = generalAffairsDept.find(m => m.name.includes('片瀬'))?.name || '片瀬泰弘'

  const residentGM = generalManagers.find(m => m.dept === '常駐管理本部')
  const salesGM = generalManagers.find(m => m.dept === '営業管理本部')
  const generalAffairsGM = generalManagers.find(m => m.dept === '総務管理本部')
  
  const applicantDeptMembers = employeeMaster[applicantDept] || []
  const applicantDeptHead = applicantDeptMembers.find(m => m.title === '部長')

  const routes: any = {
    '通常申請': { 
      decisionMaker: '社長', 
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: relatedGM ? [relatedGM.name] : [], 
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (relatedGM?.name)).map(m => m.name),
      defaultGeneralAffairs: [tanabe, kaneda],
      stepOrder: ['部長', '本部長', '社長', '本部長回覧', '総務管理本部']
    },
    '求人稟議（パート・アルバイト採用）': { 
      decisionMaker: '常駐管理本部長', 
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: residentGM ? [residentGM.name] : [],
      defaultGeneralAffairs: [tanabe, kaneda],
      stepOrder: ['部長', '本部長', '総務管理本部']
    },
    '求人稟議（キャリア・新卒採用）': { 
      decisionMaker: '社長', 
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: generalManagers.map(m => m.name), 
      defaultGeneralAffairs: [tanabe, kaneda], 
      stepOrder: ['部長', '本部長', '社長', '総務管理本部']
    },
    '代表者印捺印申請': { 
      decisionMaker: '社長', 
      generalAffairsLabel: '総務管理本部（森雅代）',
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGeneralAffairs: [mori],
      defaultGM: salesGM ? [salesGM.name, generalAffairsGM?.name, katase].filter(Boolean) : [], 
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (salesGM?.name) && m.name !== (generalAffairsGM?.name) && m.name !== katase && !m.name.includes('森')).map(m => m.name),
      stepOrder: ['部長', '総務管理本部', '本部長', '社長', '本部長回覧']
    },
    '営業統轄本部長決裁見積申請（300万円未満）': { 
      decisionMaker: '営業管理本部長', 
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: salesGM ? [salesGM.name] : [], 
      defaultGeneralAffairs: [tanabe, mori], 
      stepOrder: ['部長', '本部長', '総務管理本部']
    },
    '社長決裁見積書申請（300万円以上）': { 
      decisionMaker: '社長', 
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: salesGM ? [salesGM.name] : [], 
      defaultGeneralAffairs: generalAffairsGM ? [generalAffairsGM.name, mori] : [mori], 
      stepOrder: ['部長', '本部長', '社長', '総務管理本部']
    },
    '協力会社登録': { 
      decisionMaker: '社長', 
      generalAffairsLabel: '総務管理本部（田邉洋）',
      postDecisionCirculationLabel: '総務管理本部（回覧・確認）',
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: generalManagers.map(m => m.name), 
      defaultGeneralAffairs: [tanabe], 
      defaultPostDecisionCirculation: [tsuboi, takahashi],
      stepOrder: ['部長', '本部長', '総務管理本部', '社長', '決裁後回覧']
    },
    '出張旅費申請': { 
      decisionMaker: '社長', 
      postDecisionCirculationLabel: '本部長全員（回覧・確認）',
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGeneralAffairs: [tanabe, kaneda], 
      defaultPostDecisionCirculation: generalManagers.map(m => m.name),
      stepOrder: ['部長', '総務管理本部', '社長', '決裁後回覧']
    },
    '車両リース決裁': { 
      decisionMaker: '社長', 
      postDecisionCirculationLabel: '総務管理本部（回覧・確認）',
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: generalAffairsGM ? [generalAffairsGM.name] : [], 
      defaultPostDecisionCirculation: [takahashi],
      stepOrder: ['部長', '本部長', '社長', '決裁後回覧']
    },
    '給与情報変更申請': { 
      decisionMaker: '社長', 
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: generalManagers.map(m => m.name), 
      defaultGeneralAffairs: [miura, asakura, kawakami], 
      stepOrder: ['部長', '本部長', '社長', '総務管理本部']
    }
  }
  return routes[subType] || routes['通常申請']
}

// 【維持】白井さんが追加した高性能な画像自動圧縮・リサイズロジック
const compressImageFile = (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      return resolve(file)
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height)
            height = maxWidth
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(file)

        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file)
            const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg"
            const compressedFile = new File([blob], newFileName, {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => resolve(file)
      img.src = event.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

function CreatePageContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const reuseId = searchParams.get('reuse')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [employeeMaster, setEmployeeMaster] = useState<EmployeeMaster>({})

  const [mode, setMode] = useState<'approval' | 'report'>('approval')

  const [selectedDeptHead, setSelectedDeptHead] = useState<string[]>([])
  const [selectedGM, setSelectedGM] = useState<string[]>([])
  const [selectedGMForCirculation, setSelectedGMForCirculation] = useState<string[]>([])
  const [selectedExec, setSelectedExec] = useState<string[]>([])
  const [selectedCirculation, setSelectedCirculation] = useState<string[]>([])
  const [selectedGeneralAffairs, setSelectedGeneralAffairs] = useState<string[]>([])
  const [selectedPostDecisionCirculation, setSelectedPostDecisionCirculation] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAccord, setActiveAccord] = useState('所属長')

  const [subType, setSubType] = useState('通常申請')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [payee, setPayee] = useState('')

  const [biddingDetails, setBiddingDetails] = useState({
    location: '', date: '', time: '', winnerName: '', winnerBid1: '', winnerBid2: '',
    ourBid1: '', ourBid2: '', prevWinnerName: '', prevWinnerAmount: '',
    participants: Array(6).fill({ name: '', bid1: '', bid2: '' })
  })

  const [tripDetails, setTripDetails] = useState({
    startDate: '',
    endDate: '',
    transport: Array(5).fill({ method: '', amount: '' }),
    accommodationNights: '',
    accommodationUnitPrice: '',
    businessHours: '',
    dailyAllowanceDays: '',
    dailyAllowanceUnitPrice: ''
  })

  const fetchEmployeeMaster = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'))
      const master: EmployeeMaster = {}
      querySnapshot.docs.forEach(doc => {
        const data = doc.data()
        if (!master[data.department]) master[data.department] = []
        master[data.department].push({ name: data.name, email: data.email, title: data.title, dept: data.department })
      })
      setEmployeeMaster(master)
    } catch (err) { console.error('Error fetching employee master:', err) }
  }

  useEffect(() => {
    fetchEmployeeMaster()
  }, [])

  const handleModeChange = (newMode: 'approval' | 'report') => {
    setMode(newMode)
    setSubType(newMode === 'approval' ? '通常申請' : '退職者通知')
    setActiveAccord(newMode === 'approval' ? '所属長' : '回覧先')
  }

  const generalManagers = useMemo(() => {
    const gmList: (Employee & { dept: string })[] = []
    Object.entries(employeeMaster).forEach(([dept, members]) => {
      members.forEach(m => { if (m.title === '本部長') gmList.push({ ...m, dept }) })
    })
    return gmList
  }, [employeeMaster])

  const currentRoute = useMemo(() => {
    return getApprovalRoute(subType, user?.department || '', user?.title || '', employeeMaster, generalManagers)
  }, [subType, user, employeeMaster, generalManagers])

  const transportTotal = useMemo(() =>
    tripDetails.transport.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
  [tripDetails.transport])

  const accommodationTotal = useMemo(() =>
    (Number(tripDetails.accommodationNights) || 0) * (Number(tripDetails.accommodationUnitPrice) || 0),
  [tripDetails.accommodationNights, tripDetails.accommodationUnitPrice])

  const dailyAllowanceTotal = useMemo(() =>
    (Number(tripDetails.dailyAllowanceDays) || 0) * (Number(tripDetails.dailyAllowanceUnitPrice) || 0),
  [tripDetails.dailyAllowanceDays, tripDetails.dailyAllowanceUnitPrice])

  const tripTotal = useMemo(() =>
    transportTotal + accommodationTotal + dailyAllowanceTotal,
  [transportTotal, accommodationTotal, dailyAllowanceTotal])

  useEffect(() => {
    const loadOriginal = async () => {
      if (!reuseId || !user || Object.keys(employeeMaster).length === 0) return
      try {
        const snap = await getDoc(doc(db, 'applications', reuseId))
        if (!snap.exists()) return
        const data = snap.data() as any

        setMode(data.appName === '回覧報告' ? 'report' : 'approval')
        setSubType(data.subType || '')
        setTitle(data.title || '')
        setDescription(data.description || '')
        setRemarks(data.remarks || '')
        setActiveAccord(data.appName === '回覧報告' ? '回覧先' : '所属長')

        const fd = data.formDetails || {}
        if (fd.amount !== undefined) setAmount(String(fd.amount))
        if (fd.paymentDate !== undefined) setPaymentDate(fd.paymentDate)
        if (fd.payee !== undefined) setPayee(fd.payee)
        if (data.subType === '入札結果報告') {
          setBiddingDetails(prev => ({ ...prev, ...fd }))
        }

        const wf = data.workflow || {}
        const steps = wf.steps || {}
        const stepOrder = wf.stepOrder || []
        const route = getApprovalRoute(data.subType || '', user?.department || '', user?.title || '', employeeMaster, generalManagers)

        setSelectedDeptHead(steps['部長']?.approvers || [])
        setSelectedExec(steps['社長']?.approvers || [])
        const gmKey = stepOrder.find((k: string) => k === '本部長' || k === route.decisionMaker) || '本部長'
        setSelectedGM(steps[gmKey]?.approvers || [])
        const gaKey = stepOrder.find((k: string) => k === '総務管理本部' || k === route.generalAffairsLabel) || '総務管理本部'
        setSelectedGeneralAffairs(steps[gaKey]?.approvers || [])
        const gmCircKey = stepOrder.find((k: string) => k === '本部長回覧') || '本部長回覧'
        setSelectedGMForCirculation(steps[gmCircKey]?.approvers || [])
        const postKey = route.postDecisionCirculationLabel && stepOrder.find((k: string) => k === route.postDecisionCirculationLabel)
        setSelectedPostDecisionCirculation(postKey ? steps[postKey]?.approvers || [] : [])
        setSelectedCirculation(wf.circulations || [])
      } catch (err) { console.error('Error loading reuse application:', err) }
    }
    loadOriginal()
  }, [reuseId, user, employeeMaster, generalManagers])

  useEffect(() => {
    if (user && subType && Object.keys(employeeMaster).length > 0 && mode === 'approval' && !reuseId) {
      setSelectedDeptHead(currentRoute.defaultDeptHead || [])
      setSelectedGM(currentRoute.defaultGM || [])
      setSelectedGMForCirculation(currentRoute.defaultGMForCirculation || [])
      setSelectedGeneralAffairs(currentRoute.defaultGeneralAffairs || [])
      setSelectedPostDecisionCirculation(currentRoute.defaultPostDecisionCirculation || [])
      setActiveAccord('所属長')
    }
  }, [subType, user, employeeMaster, currentRoute, mode, reuseId])

  useEffect(() => {
    if (employeeMaster && Object.keys(employeeMaster).length > 0) {
      const presidentList: string[] = []
      Object.entries(employeeMaster).forEach(([dept, members]) => {
        members.forEach(m => { if (m.title === '社長') { presidentList.push(m.name) } })
      })
      if (presidentList.length > 0) { setSelectedExec(presidentList) }
    }
  }, [employeeMaster])

  const toggleMemberSelection = (member: string, list: string[], setList: (list: string[]) => void) => {
    if (list.includes(member)) setList(list.filter(m => m !== member))
    else setList([...list, member])
  }

  const removeFile = (indexToRemove: number) => setFiles(files.filter((_, index) => index !== indexToRemove))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) return setError('件名を入力してください')
    setLoading(true)

    try {
      const uploadedAttachments: { name: string; url: string; type: string }[] = []
      let fileIndex = 0
      
      for (const file of files) {
        let targetFile = file
        if (file.type.startsWith('image/')) {
          targetFile = await compressImageFile(file, 1200, 0.8)
        }

        const storageRef = ref(storage, `applications/${fileIndex}_${targetFile.name}`)
        await uploadBytes(storageRef, targetFile)
        const downloadURL = await getDownloadURL(storageRef)
        uploadedAttachments.push({ name: targetFile.name, url: downloadURL, type: targetFile.type })
        fileIndex++
      }

      let formDetails: any = { description, remarks }
      if (mode === 'approval' && subType === '通常申請') {
        formDetails = { ...formDetails, amount: Number(amount) || 0, paymentDate, payee }
      }
      if (mode === 'approval' && subType === '代表者印捺印申請') {
        formDetails = { ...formDetails, amount: Number(amount) || 0 }
      }
      if (mode === 'approval' && subType === '出張旅費申請') {
        formDetails = { ...formDetails, tripDetails, transportTotal, accommodationTotal, dailyAllowanceTotal, tripTotal }
      }
      if (mode === 'report' && subType === '入札結果報告') {
        formDetails = { ...formDetails, ...biddingDetails }
      }
      
      const appName = mode === 'approval' ? '稟議' : '回覧報告'

      const stepsObj: any = {}
      let firstStepKey = mode === 'report' ? '回覧先' : currentRoute.stepOrder[0]
      let initialApprovers: string[] = []

      if (mode === 'approval') {
        currentRoute.stepOrder.forEach((stepKey: string, index: number) => {
          let approvers: string[] = []
          let dbKey = stepKey

          if (stepKey === '部長') approvers = selectedDeptHead
          else if (stepKey === '本部長') {
            approvers = selectedGM
            dbKey = currentRoute.decisionMaker === '社長' ? '本部長' : currentRoute.decisionMaker
          }
          else if (stepKey === '社長') approvers = selectedExec
          else if (stepKey === '総務管理本部') approvers = selectedGeneralAffairs
          else if (stepKey === '本部長回覧') approvers = selectedGMForCirculation
          else if (stepKey === '決裁後回覧') {
            approvers = selectedPostDecisionCirculation
            dbKey = currentRoute.postDecisionCirculationLabel
          }

          if (index === 0) {
            initialApprovers = approvers
            firstStepKey = dbKey
          }

          const isCirculation = stepKey === '本部長回覧' || stepKey === '決裁後回覧' || stepKey === '総務管理本部'
          stepsObj[dbKey] = {
            approvers,
            status: isCirculation ? '回覧待ち' : '承認待ち',
            comments: [],
            approvedBy: []
          }
        })
      }

      const allCirculators = Array.from(new Set([
        ...selectedCirculation,
        ...(mode === 'approval' ? selectedGeneralAffairs : []),
        ...(mode === 'approval' ? selectedGMForCirculation : []),
        ...(mode === 'approval' ? selectedPostDecisionCirculation : [])
      ]))
      
      const applicationNo = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'applications')
        const counterDoc = await transaction.get(counterRef)
        const nextNo = (counterDoc.exists() ? (counterDoc.data().nextNumber || 0) : 0) + 1
        transaction.set(counterRef, { nextNumber: nextNo })
        return nextNo
      })

      const applicationData = {
        appName, subType, title, description, remarks,
        applicantId: user?.id || '', applicantName: user?.name || '', applicantDept: user?.department || '', applicantTitle: user?.title || '',
        applicationNo,
        formDetails,
        workflow: {
          currentStep: firstStepKey,
          status: mode === 'report' ? '承認済み' : '承認待ち',
          currentApprovers: initialApprovers,
          allCirculators: allCirculators,
          decisionMaker: currentRoute.decisionMaker,
          stepOrder: mode === 'approval' ? currentRoute.stepOrder.map((k: string) => k === '本部長' ? (currentRoute.decisionMaker === '社長' ? '本部長' : currentRoute.decisionMaker) : k === '決裁後回覧' ? currentRoute.postDecisionCirculationLabel : k) : ['回覧先'],
          steps: stepsObj,
          circulations: selectedCirculation, confirmedBy: []
        },
        attachments: uploadedAttachments,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'applications'), applicationData)
      
      // 【マージ成功】稟議申請と回覧報告それぞれで、適切な通知メールを一斉送信する
      if (mode === 'approval' && initialApprovers.length > 0) {
        await sendNewApplicationNotification(applicationData, initialApprovers)
      } else if (mode === 'report' && selectedCirculation.length > 0) {
        await sendNewReportNotification(applicationData, selectedCirculation)
      }
      
      router.push('/dashboard')
    } catch (err: any) { setError('失敗しました: ' + err.message) } finally { setLoading(false) }
  }

  const sendNewApplicationNotification = async (applicationData: any, initialApprovers: string[]) => {
    try {
      if (!initialApprovers || initialApprovers.length === 0) return
      const approverEmails = await getApproversEmails(initialApprovers)

      for (const email of approverEmails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `新規承認依頼: ${applicationData.title}`,
            text: `「${applicationData.title}」の新規承認依頼が届きました。確認・承認をお願いします。`,
            html: `<h2>新規承認依頼</h2><p>「${applicationData.title}」の新規承認依頼が届きました。</p><p><a href="${window.location.origin}/dashboard">ダッシュボードを開く</a></p>`
          })
        })
      }
    } catch (error) { console.error('Email notification error:', error) }
  }

  // 【新規融合】回覧報告が作成された際、回覧先に指定されたメンバー全員に一斉メールを送信する
  const sendNewReportNotification = async (applicationData: any, circulators: string[]) => {
    try {
      if (!circulators || circulators.length === 0) return
      const circulatorEmails = await getApproversEmails(circulators)

      for (const email of circulatorEmails) {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: `新規回覧報告: ${applicationData.title}`,
            text: `「${applicationData.title}」の新しい回覧報告が共有されました。内容の確認をお願いします。`,
            html: `<h2>新規回覧報告</h2><p>「${applicationData.title}」の新しい回覧報告が共有されました。</p><p>内容の確認をお願いします。</p><p><a href="${window.location.origin}/dashboard">ダッシュボードを開く</a></p>`
          })
        })
      }
    } catch (error) { console.error('Report email notification error:', error) }
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
    } catch (err) { console.error('Error fetching filtered user emails:', err) }
    return emails
  }

  const renderMemberSelector = (selectedList: string[], setSelectedList: (list: string[]) => void, filterType: string) => {
    return (
      <div className="space-y-4">
        {(filterType === '回覧' || filterType === '総務') && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="検索..." className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700/60 rounded-xl text-sm text-slate-100 focus:ring-2 focus:ring-indigo-500/50 outline-none" />
          </div>
        )}
        {filterType === '回覧' && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(employeeMaster).map(([dept, members]) => {
              const allSelected = members.every(m => selectedList.includes(m.name))
              const someSelected = !allSelected && members.some(m => selectedList.includes(m.name))
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => {
                    if (allSelected) {
                      setSelectedList(selectedList.filter(n => !members.some(m => m.name === n)))
                    } else {
                      setSelectedList(Array.from(new Set([...selectedList, ...members.map(m => m.name)])))
                    }
                  }}
                  className={`text-xs font-bold rounded-full px-3 py-1.5 border transition-all ${
                    allSelected
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : someSelected
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  {dept}
                </button>
              )
            })}
          </div>
        )}
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
          {Object.entries(employeeMaster).map(([dept, members]) => {
            let filtered = members
            if (filterType === '社長') filtered = members.filter(m => m.title.includes('社長'))
            else if (filterType === '部長' && user) { if (dept !== user.department) return null; filtered = members.filter(m => m.title.includes('部長')) }
            else if (filterType === '本部長') filtered = members.filter(m => m.title.includes('本部長'))
            else if (filterType === '総務') { if (dept !== '総務管理本部') return null; filtered = searchQuery ? members.filter(m => m.name.includes(searchQuery)) : members }
            else if (filterType === '回覧') filtered = searchQuery ? members.filter(m => m.name.includes(searchQuery)) : members

            if (filtered.length === 0) return null
            return (
              <div key={dept} className="space-y-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block px-1">{dept}</span>
                <div className="grid grid-cols-1 gap-1.5">
                  {filtered.map((m) => (
                    <button key={m.name} type="button" onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${selectedList.includes(m.name) ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:bg-slate-800/60'}`}>
                      <span>{m.name} <span className="text-[10px] font-normal opacity-60 ml-2">{m.title}</span></span>
                      {selectedList.includes(m.name) && <Check size={12} />}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 antialiased">
      <header className="sticky top-0 bg-[#111827]/70 backdrop-blur-md border-b border-slate-800/80 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button type="button" onClick={() => router.push('/dashboard')} className="p-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700/50 transition-all"><ArrowLeft size={20} /></button>
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">新規申請・回覧作成</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl mb-8 max-w-md mx-auto shadow-2xl">
          <button type="button" onClick={() => handleModeChange('approval')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'approval' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><FileText size={18}/> 稟議申請</button>
          <button type="button" onClick={() => handleModeChange('report')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'report' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Share2 size={18}/> 回覧報告</button>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-5 py-4 rounded-xl mb-8 text-sm font-medium animate-in zoom-in duration-300">⚠️ {error}</div>}

          <form onSubmit={handleSubmit} className="space-y-10">
            <section className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">書類種別</label>
                  <div className="relative">
                    <select value={subType} onChange={(e) => setSubType(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                      {mode === 'approval' ? (
                        <>
                          <option value="通常申請">通常申請</option>
                          <option value="求人稟議（パート・アルバイト採用）">求人稟議（パート・アルバイト採用）</option>
                          <option value="求人稟議（キャリア・新卒採用）">求人稟議（キャリア・新卒採用）</option>
                          <option value="代表者印捺印申請">代表者印捺印申請</option>
                          <option value="営業統轄本部長決裁見積申請（300万円未満）">営業統轄本部長決裁見積申請（300万円未満）</option>
                          <option value="社長決裁見積書申請（300万円以上）">社長決裁見積書申請（300万円以上）</option>
                          <option value="協力会社登録">協力会社登録</option>
                          <option value="出張旅費申請">出張旅費申請</option>
                          <option value="車両リース決裁">車両リース決裁</option>
                          <option value="給与情報変更申請">給与情報変更申請</option>
                        </>
                      ) : (
                        <>
                          <option value="退職者通知">退職者通知</option>
                          <option value="訃報連絡">訃報連絡</option>
                          <option value="入札結果報告">入札結果報告</option>
                        </>
                      )}
                    </select>
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">件名 <span className="text-rose-500">*</span></label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="件名を入力してください" className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 outline-none" />
                </div>
              </div>
              
              {mode === 'approval' && (
                <>
                  {subType === '代表者印捺印申請' && (
                    <div className='bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-sm text-amber-200 whitespace-pre-line animate-in slide-in-from-top-2 duration-300'>
                      契約書の捺印申請は収入印紙額を明記<br />①契約書捺印申請では総務管理本部長を承認者に選択<br />②廃棄物関係の申請では品質管理本部長を承認者に選択
                    </div>
                  )}
                  {subType === '協力会社登録' && (
                    <div className='bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-sm text-amber-200 animate-in slide-in-from-top-2 duration-300'>
                      知り合った経緯（紹介先）を記入する事
                    </div>
                  )}
                  {subType === '出張旅費申請' && (
                    <div className='bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-sm text-amber-200 animate-in slide-in-from-top-2 duration-300'>
                      上司から指示を受けていない出張に関しては、上司の承諾を得てから出張旅費申請をあげる事
                    </div>
                  )}
                </>
              )}

              {mode === 'report' && subType === '入札結果報告' && (
                <div className="space-y-8 bg-slate-950/30 p-6 rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
                    <Gavel size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">入札詳細情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札執行場所</label>
                      <input type="text" value={biddingDetails.location} onChange={(e) => setBiddingDetails({...biddingDetails, location: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札執行日</label>
                      <input type="date" style={{ colorScheme: 'dark' }} value={biddingDetails.date} onChange={(e) => setBiddingDetails({...biddingDetails, date: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札時間</label>
                      <input type="text" value={biddingDetails.time} onChange={(e) => setBiddingDetails({...biddingDetails, time: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900/40 p-4 rounded-xl border border-indigo-500/20 shadow-lg">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-2">落札業者名</label>
                      <input type="text" value={biddingDetails.winnerName} onChange={(e) => setBiddingDetails({...biddingDetails, winnerName: e.target.value})} className="w-full bg-slate-950 border border-indigo-500/30 rounded-xl px-4 py-3 text-indigo-100 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第1回落札金額</label>
                      <input type="number" value={biddingDetails.winnerBid1} onChange={(e) => setBiddingDetails({...biddingDetails, winnerBid1: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第2回落札金額</label>
                      <input type="number" value={biddingDetails.winnerBid2} onChange={(e) => setBiddingDetails({...biddingDetails, winnerBid2: e.target.value})} className="w-full bg-slate-955 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
                    <div className="flex items-center text-sm font-bold text-emerald-400 px-2">ヤマダユニア株式会社</div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第1回入札金額</label>
                      <input type="number" value={biddingDetails.ourBid1} onChange={(e) => setBiddingDetails({...biddingDetails, ourBid1: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第2回入札金額</label>
                      <input type="number" value={biddingDetails.ourBid2} onChange={(e) => setBiddingDetails({...biddingDetails, ourBid2: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    {biddingDetails.participants.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 flex items-center justify-center bg-slate-800 rounded-full text-[10px] font-bold text-slate-400">{(idx + 1).toString()}</span>
                          <input type="text" value={p.name} onChange={(e) => {
                            const newP = [...biddingDetails.participants]; newP[idx] = {...newP[idx], name: e.target.value}; setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-300 outline-none" placeholder="参加業者名" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-bold uppercase">1回</span>
                          <input type="number" value={p.bid1} onChange={(e) => {
                            const newP = [...biddingDetails.participants]; newP[idx] = {...newP[idx], bid1: e.target.value}; setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none text-right" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-bold uppercase">2回</span>
                          <input type="number" value={p.bid2} onChange={(e) => {
                            const newP = [...biddingDetails.participants]; newP[idx] = {...newP[idx], bid2: e.target.value}; setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none text-right" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-amber-500/5 p-5 rounded-2xl border border-amber-500/20 mt-8">
                    <div className="md:col-span-2 flex items-center gap-2 mb-2"><Clock size={16} className="text-amber-400" /><h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest">前年度実績比較</h4></div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">前年度落札業者</label>
                      <input type="text" value={biddingDetails.prevWinnerName} onChange={(e) => setBiddingDetails({...biddingDetails, prevWinnerName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">前年度落札金額</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-bold">¥</span>
                        <input type="number" value={biddingDetails.prevWinnerAmount} onChange={(e) => setBiddingDetails({...biddingDetails, prevWinnerAmount: e.target.value})} className="w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-lg font-bold text-amber-200 outline-none text-right" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">内容説明</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="内容を詳しく入力してください" className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:ring-2 focus:ring-indigo-500/50 outline-none leading-relaxed" />
              </div>
            </section>

            {mode === 'approval' && subType === '通常申請' && (
              <section className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-300">
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">金額</label>
                  <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xl font-black text-cyan-400 outline-none"/>
                  </div>
                </div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">支払予定日</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none"/>
                </div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">支払先</label>
                  <input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none"/>
                </div>
              </section>
            )}

            {mode === 'approval' && subType === '代表者印捺印申請' && (
              <section className='space-y-6 bg-slate-950/40 border border-slate-800 rounded-2xl p-6 animate-in slide-in-from-top-2 duration-300'>
                <div>
                  <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>金額</label>
                  <div className='relative'><span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                    <input type='number' value={amount} onChange={(e) => setAmount(e.target.value)} className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xl font-black text-cyan-400 outline-none' />
                  </div>
                </div>
              </section>
            )}

            {mode === 'approval' && subType === '出張旅費申請' && (
              <section className='space-y-8 bg-slate-950/40 border border-slate-800 rounded-2xl p-6 animate-in slide-in-from-top-2 duration-300'>
                <div className='flex items-center gap-3 border-b border-slate-800 pb-4 mb-2'>
                  <FileText size={22} className='text-cyan-400' />
                  <h3 className='text-lg font-bold text-slate-100'>出張旅費明細</h3>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>出張開始日</label>
                    <input type='date' value={tripDetails.startDate} onChange={(e) => setTripDetails({ ...tripDetails, startDate: e.target.value })} style={{ colorScheme: 'dark' }} className='w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>出張終了日</label>
                    <input type='date' value={tripDetails.endDate} onChange={(e) => setTripDetails({ ...tripDetails, endDate: e.target.value })} style={{ colorScheme: 'dark' }} className='w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none' />
                  </div>
                </div>

                <div className='space-y-4'>
                  <h4 className='text-sm font-bold text-slate-300 uppercase tracking-widest'>利用交通機関・料金</h4>
                  {tripDetails.transport.map((t, idx) => (
                    <div key={idx} className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                      <input type='text' value={t.method} onChange={(e) => { const nt = [...tripDetails.transport]; nt[idx] = { ...nt[idx], method: e.target.value }; setTripDetails({ ...tripDetails, transport: nt }) }} placeholder={`交通機関 ${idx + 1}`} className='w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none' />
                      <div className='relative'>
                        <span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                        <input type='number' value={t.amount} onChange={(e) => { const nt = [...tripDetails.transport]; nt[idx] = { ...nt[idx], amount: e.target.value }; setTripDetails({ ...tripDetails, transport: nt }) }} placeholder='金額' className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none text-right' />
                      </div>
                    </div>
                  ))}
                  <div className='flex justify-end items-center gap-3 border-t border-slate-800 pt-4'>
                    <span className='text-sm text-slate-400'>交通費合計</span>
                    <span className='text-2xl font-black text-cyan-400'>¥{transportTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>宿泊日数</label>
                    <input type='number' value={tripDetails.accommodationNights} onChange={(e) => setTripDetails({ ...tripDetails, accommodationNights: e.target.value })} className='w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none text-right' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>宿泊単価</label>
                    <div className='relative'>
                      <span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                      <input type='number' value={tripDetails.accommodationUnitPrice} onChange={(e) => setTripDetails({ ...tripDetails, accommodationUnitPrice: e.target.value })} className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none text-right' />
                    </div>
                  </div>
                  <div className='flex flex-col justify-end'>
                    <span className='text-[10px] text-slate-500 uppercase tracking-widest mb-1'>宿泊費合計</span>
                    <span className='text-xl font-black text-cyan-400'>¥{accommodationTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>業務対応時間</label>
                  <input type='text' value={tripDetails.businessHours} onChange={(e) => setTripDetails({ ...tripDetails, businessHours: e.target.value })} placeholder='例：8時間' className='w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none' />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>日当（日数）</label>
                    <input type='number' value={tripDetails.dailyAllowanceDays} onChange={(e) => setTripDetails({ ...tripDetails, dailyAllowanceDays: e.target.value })} className='w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none text-right' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>日当単価</label>
                    <div className='relative'>
                      <span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                      <input type='number' value={tripDetails.dailyAllowanceUnitPrice} onChange={(e) => setTripDetails({ ...tripDetails, dailyAllowanceUnitPrice: e.target.value })} className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 outline-none text-right' />
                    </div>
                  </div>
                  <div className='flex flex-col justify-end'>
                    <span className='text-[10px] text-slate-500 uppercase tracking-widest mb-1'>日当合計</span>
                    <span className='text-xl font-black text-cyan-400'>¥{dailyAllowanceTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className='flex justify-end items-center gap-4 border-t border-slate-800 pt-6'>
                  <span className='text-sm font-bold text-slate-300 uppercase tracking-widest'>旅費合計</span>
                  <span className='text-3xl font-black text-emerald-400'>¥{tripTotal.toLocaleString()}</span>
                </div>
              </section>
            )}

            <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">備考</label>
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">添付ファイル</label>
                <label className="group flex flex-col items-center justify-center w-full h-32 bg-slate-950/30 border-2 border-dashed border-slate-800 rounded-2xl hover:border-indigo-500/40 cursor-pointer transition-all">
                  <Paperclip size={24} className="text-slate-600 group-hover:text-indigo-400 mb-2" />
                  <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">選択してアップロード</span>
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                </label>
                <div className="mt-2 space-y-1">{files.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px] bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                    <span className="truncate max-w-[200px]">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-rose-500 hover:text-rose-400"><X size={12}/></button>
                  </div>
                ))}</div>
              </div>
            </div>

            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-3 mb-6"><Users size={18} className="text-indigo-500" /> {mode === 'approval' ? '承認・回覧経路の設定' : '回覧先の選択'}</h3>
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800 shadow-lg">
                {mode === 'approval' ? (
                  <>
                    {currentRoute.stepOrder.map((stepKey: string) => {
                      if (stepKey === '部長') {
                        return (
                          <AccordItem key={stepKey} title="所属長 (部長承認)" count={selectedDeptHead.length} isActive={activeAccord === '所属長'} onClick={() => setActiveAccord(activeAccord === '所属長' ? '' : '所属長')}>
                            {renderMemberSelector(selectedDeptHead, setSelectedDeptHead, '部長')}
                          </AccordItem>
                        )
                      }
                      if (stepKey === '本部長') {
                        const label = currentRoute.decisionMaker === '社長' ? "本部長 (承認)" : `${currentRoute.decisionMaker} (最終決裁)`
                        return (
                          <AccordItem key={stepKey} title={label} count={selectedGM.length} isActive={activeAccord === '本部長'} onClick={() => setActiveAccord(activeAccord === '本部長' ? '' : '本部長')}>
                            {renderMemberSelector(selectedGM, setSelectedGM, '本部長')}
                          </AccordItem>
                        )
                      }
                      if (stepKey === '社長') {
                        return (
                          <AccordItem key={stepKey} title="社長 (最終決裁)" count={selectedExec.length} isActive={activeAccord === '社長'} onClick={() => setActiveAccord(activeAccord === '社長' ? '' : '社長')}>
                            {renderMemberSelector(selectedExec, setSelectedExec, '社長')}
                          </AccordItem>
                        )
                      }
                      if (stepKey === '総務管理本部') {
                        return (
                          <AccordItem key={stepKey} title={currentRoute.generalAffairsLabel || "総務管理本部"} count={selectedGeneralAffairs.length} isActive={activeAccord === '総務管理本部'} onClick={() => setActiveAccord(activeAccord === '総務管理本部' ? '' : '総務管理本部')}>
                            {renderMemberSelector(selectedGeneralAffairs, setSelectedGeneralAffairs, '総務')}
                          </AccordItem>
                        )
                      }
                      if (stepKey === '本部長回覧') {
                        return (
                          <AccordItem key={stepKey} title="本部長回覧" count={selectedGMForCirculation.length} isActive={activeAccord === '本部長回覧'} onClick={() => setActiveAccord(activeAccord === '本部長回覧' ? '' : '本部長回覧')}>
                            {renderMemberSelector(selectedGMForCirculation, setSelectedGMForCirculation, '本部長')}
                          </AccordItem>
                        )
                      }
                      if (stepKey === '決裁後回覧') {
                        return (
                          <AccordItem key={stepKey} title={currentRoute.postDecisionCirculationLabel} count={selectedPostDecisionCirculation.length} isActive={activeAccord === '決裁後回覧'} onClick={() => setActiveAccord(activeAccord === '決裁後回覧' ? '' : '決裁後回覧')}>
                            {renderMemberSelector(selectedPostDecisionCirculation, setSelectedPostDecisionCirculation, currentRoute.postDecisionCirculationLabel.includes('総務') ? '総務' : '本部長')}
                          </AccordItem>
                        )
                      }
                      return null
                    })}
                  </>
                ) : null}
                <AccordItem title="回覧先 (共有するメンバー)" count={selectedCirculation.length} isActive={activeAccord === '回覧先'} onClick={() => setActiveAccord(activeAccord === '回覧先' ? '' : '回覧先')}>{renderMemberSelector(selectedCirculation, setSelectedCirculation, '回覧')}</AccordItem>
              </div>
            </section>

            <div className="flex gap-4 pt-6 border-t border-slate-800/80">
              <button type="button" onClick={() => router.push('/dashboard')} className="flex-1 bg-slate-800/40 text-slate-400 font-bold py-3 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:text-white transition-all text-sm tracking-widest uppercase">キャンセル</button>
              <button type="submit" disabled={loading} className="flex-[2] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 rounded-xl shadow-lg transition-all text-base tracking-[0.2em] flex items-center justify-center gap-3 uppercase disabled:opacity-50">
                {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <><Send size={18} /> {mode === 'approval' ? '申請を送信する' : '回覧を開始する'}</>}
              </button>
            </div>
          </form>
        </div>
      </main>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  )
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>}>
      <CreatePageContent />
    </Suspense>
  )
}