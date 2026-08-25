'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, getDoc, runTransaction } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Users, Search, Check, ArrowLeft, Paperclip, X, ChevronDown, Send, FileText, Share2, Gavel, Clock, Car, Eye } from 'lucide-react'

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
  <div className="border-b border-slate-700 last:border-0 overflow-hidden">
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
      <div className="p-4 bg-slate-950/40 border-t border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
        {children}
      </div>
    )}
  </div>
)

function FileUploadField({ label, file, onChange, required = false }: { label: string; file: File | null; onChange: (file: File | null) => void; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleBoxClick = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank')
    } else {
      inputRef.current?.click()
    }
  }

  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">{label} {required && <span className="text-rose-500">*</span>}</label>
      <button
        type="button"
        onClick={handleBoxClick}
        className={`group flex items-center justify-between w-full px-4 py-6 border rounded-xl transition-all text-left ${
          file
            ? 'bg-slate-900/60 border-indigo-500/30 hover:border-indigo-500/60 cursor-pointer'
            : 'bg-slate-950 border-slate-700 border-dashed hover:border-indigo-500/40 cursor-pointer'
        }`}
      >
        <span className={`text-sm truncate ${file ? 'text-slate-200' : 'text-slate-600'}`}>{file ? file.name : 'ファイルを選択'}</span>
        {file ? <Eye size={18} className="text-indigo-400 shrink-0" /> : <Paperclip size={18} className="text-slate-600 group-hover:text-indigo-400 shrink-0" />}
      </button>
      {file && (
        <div className="flex items-center gap-3 mt-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-indigo-400 hover:text-indigo-300">変更</button>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-rose-400 hover:text-rose-300">削除</button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onChange(e.target.files ? e.target.files[0] : null)}
      />
    </div>
  )
}

// ==========================================
// 2. 承認ルート計算ロジック（最新の業務フロー）
// ==========================================
function getRelatedGM(dept: string, generalManagers: any[]) {
  if (!dept) return null
  if (dept === '三保事業所' || dept === '九州支店') return generalManagers.find(m => m.dept === '営業管理本部')
  if (dept === '特掃部' || dept === '警備管理部' || dept === '施設管理部' || dept === 'グリーン管理部') return generalManagers.find(m => m.dept === '技術管理本部')
  return generalManagers.find(m => m.dept === dept)
}

function getApprovalRoute(subType: string, applicantDept: string, applicantTitle: string, employeeMaster: EmployeeMaster, generalManagers: any[], division: string = '', applicantName: string = '') {
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
  const isDeptHead = (applicantDeptHead && applicantDeptHead.name === applicantName) || (applicantTitle === '部長' && !applicantDeptHead)

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
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGeneralAffairs: [tanabe, kaneda],
      stepOrder: ['部長', '本部長', '総務管理本部'],
      ...(() => {
        // パート・アルバイト採用の最終決裁者マッピング
        if (division === '三保事業所' || division === '九州支店') {
          const gm = generalManagers.find(m => m.dept === '営業管理本部')
          return { decisionMaker: '営業管理本部長', defaultGM: gm ? [gm.name] : [] }
        } else if (division === '警備員') {
          const gm = generalManagers.find(m => m.dept === '技術管理本部')
          return { decisionMaker: '技術管理本部長', defaultGM: gm ? [gm.name] : [] }
        }
        // 清掃 / 受付 / その他 / 未選択：常駐管理本部
        return { decisionMaker: '常駐管理本部長', defaultGM: residentGM ? [residentGM.name] : [] }
      })()
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
    '車両リース決済': { 
      decisionMaker: '社長', 
      postDecisionCirculationLabel: '総務管理本部（回覧・確認）',
      defaultDeptHead: applicantDeptHead ? [applicantDeptHead.name] : [],
      defaultGM: generalAffairsGM ? [generalAffairsGM.name] : [], 
      defaultPostDecisionCirculation: [takahashi],
      stepOrder: ['部長', '本部長', '社長', '決裁後回覧']
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
  const route = routes[subType] || routes['通常申請']
  return {
    ...route,
    isDeptHead,
    defaultDeptHead: isDeptHead ? [] : (applicantDeptHead ? [applicantDeptHead.name] : []),
    effectiveStepOrder: isDeptHead ? route.stepOrder.filter((step: string) => step !== '部長') : route.stepOrder
  }
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
  const { user, firebaseUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const reuseId = searchParams.get('reuse')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [employeeMaster, setEmployeeMaster] = useState<EmployeeMaster>({})

  const [mode, setMode] = useState<'approval' | 'report'>('approval')
  const [departmentOverride, setDepartmentOverride] = useState<string | null>(null)
  const selectedDepartment = departmentOverride ?? user?.department ?? ''

  const userDepartments = useMemo(() => {
    const depts = new Set<string>()
    if (user?.department) depts.add(user.department)
    ;(user as any)?.departments?.forEach((d: string) => depts.add(d))
    return Array.from(depts)
  }, [user])

  const [selectedDeptHead, setSelectedDeptHead] = useState<string[]>([])
  const [selectedGM, setSelectedGM] = useState<string[]>([])
  const [selectedGMForCirculation, setSelectedGMForCirculation] = useState<string[]>([])
  const [selectedExec, setSelectedExec] = useState<string[]>([])
  const [selectedCirculation, setSelectedCirculation] = useState<string[]>([])
  const [selectedGeneralAffairs, setSelectedGeneralAffairs] = useState<string[]>([])
  const [selectedPostDecisionCirculation, setSelectedPostDecisionCirculation] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAccord, setActiveAccord] = useState('所属長')

  const [subType, setSubType] = useState<string>('通常申請')
  const [recruitmentDivision, setRecruitmentDivision] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [payee, setPayee] = useState('')

  // 求人稟議（パート・アルバイト採用）
  const [employmentType, setEmploymentType] = useState('')
  const [jobLocation, setJobLocation] = useState('')
  const [jobContent, setJobContent] = useState('')
  const [workHours, setWorkHours] = useState('')
  const [workDays, setWorkDays] = useState('')
  const [recruitmentUnitPrice, setRecruitmentUnitPrice] = useState('')
  const [postingDate, setPostingDate] = useState('')
  const [recruitmentMedia, setRecruitmentMedia] = useState('')
  const [postingFee, setPostingFee] = useState('')
  const [salesAmount, setSalesAmount] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costRate, setCostRate] = useState('')
  const [retireeName, setRetireeName] = useState('')
  const [retireeDate, setRetireeDate] = useState('')

  // 協力会社登録
  const [coCompanyName, setCoCompanyName] = useState('')
  const [coBackground, setCoBackground] = useState('')
  const [coStartDate, setCoStartDate] = useState('')
  const [coRegistrationFile, setCoRegistrationFile] = useState<File | null>(null)
  const [coFinancialStatements, setCoFinancialStatements] = useState<File | null>(null)
  const [coInsuranceFile, setCoInsuranceFile] = useState<File | null>(null)
  const [coAntiSocialFile, setCoAntiSocialFile] = useState<File | null>(null)
  const [coCompanyBrochure, setCoCompanyBrochure] = useState<File | null>(null)
  const [coLicenseFile, setCoLicenseFile] = useState<File | null>(null)

  // 車両リース決済
  const [leaseClassification, setLeaseClassification] = useState('')
  const [leaseVendor, setLeaseVendor] = useState('')
  const [leaseOtherVendor, setLeaseOtherVendor] = useState('')
  const [leaseCarNumber, setLeaseCarNumber] = useState('')
  const [leaseRequirements, setLeaseRequirements] = useState('')
  const [leaseCurrentAmount, setLeaseCurrentAmount] = useState('')
  const [leaseNewAmount, setLeaseNewAmount] = useState('')
  const [leaseTerm, setLeaseTerm] = useState('')
  const [leaseDeliveryDate, setLeaseDeliveryDate] = useState('')
  const [leaseExpiryDate, setLeaseExpiryDate] = useState('')
  const [leaseMileage, setLeaseMileage] = useState('')
  const [leaseEstimateFile, setLeaseEstimateFile] = useState<File | null>(null)

  // 給与情報変更申請
  const [salaryCustomerName, setSalaryCustomerName] = useState('')
  const [salarySiteName, setSalarySiteName] = useState('')
  const [salaryEmployeeNumber, setSalaryEmployeeNumber] = useState('')
  const [salaryEmployeeName, setSalaryEmployeeName] = useState('')
  const [salaryChangeDetails, setSalaryChangeDetails] = useState('')
  const [salaryStartDate, setSalaryStartDate] = useState('')
  const [salaryReason, setSalaryReason] = useState('')
  const [salaryLaborCostFile, setSalaryLaborCostFile] = useState<File | null>(null)

  // 回覧：退職者通知
  const [retirementName, setRetirementName] = useState('')
  const [retirementSite, setRetirementSite] = useState('')
  const [retirementJobType, setRetirementJobType] = useState('')
  const [retirementDate, setRetirementDate] = useState('')
  const [retirementReason, setRetirementReason] = useState('')
  const [retirementResignationFile, setRetirementResignationFile] = useState<File | null>(null)

  // 回覧：訃報連絡
  const [obituaryType, setObituaryType] = useState('')
  const [obituaryTargetName, setObituaryTargetName] = useState('')
  const [obituarySite, setObituarySite] = useState('')
  const [obituaryDeceasedName, setObituaryDeceasedName] = useState('')
  const [obituaryRelation, setObituaryRelation] = useState('')
  const [obituaryChiefMourner, setObituaryChiefMourner] = useState('')
  const [obituaryWakeDate, setObituaryWakeDate] = useState('')
  const [obituaryFuneralDate, setObituaryFuneralDate] = useState('')
  const [obituaryNoticeFile, setObituaryNoticeFile] = useState<File | null>(null)
  const [obituaryVenue, setObituaryVenue] = useState('')
  const [obituaryCondolencePostal, setObituaryCondolencePostal] = useState('')
  const [obituaryCondolenceAddress, setObituaryCondolenceAddress] = useState('')
  const [obituaryCondolenceVenueName, setObituaryCondolenceVenueName] = useState('')
  const [obituaryCondolencePhone, setObituaryCondolencePhone] = useState('')
  const [obituaryCondolenceAmount, setObituaryCondolenceAmount] = useState('')
  const [obituaryRequest, setObituaryRequest] = useState('')
  const [obituaryAttendees, setObituaryAttendees] = useState('')

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
    setRecruitmentDivision('')
    setEmploymentType('')
    setJobLocation('')
    setJobContent('')
    setWorkHours('')
    setWorkDays('')
    setRecruitmentUnitPrice('')
    setPostingDate('')
    setRecruitmentMedia('')
    setPostingFee('')
    setSalesAmount('')
    setCostAmount('')
    setCostRate('')
    setRetireeName('')
    setRetireeDate('')
    setCoCompanyName('')
    setCoBackground('')
    setCoStartDate('')
    setCoRegistrationFile(null)
    setCoFinancialStatements(null)
    setCoInsuranceFile(null)
    setCoAntiSocialFile(null)
    setCoCompanyBrochure(null)
    setCoLicenseFile(null)
    setSalaryCustomerName('')
    setSalarySiteName('')
    setSalaryEmployeeNumber('')
    setSalaryEmployeeName('')
    setSalaryChangeDetails('')
    setSalaryStartDate('')
    setSalaryReason('')
    setSalaryLaborCostFile(null)
    setRetirementName('')
    setRetirementSite('')
    setRetirementJobType('')
    setRetirementDate('')
    setRetirementReason('')
    setRetirementResignationFile(null)
    setObituaryType('')
    setObituaryTargetName('')
    setObituarySite('')
    setObituaryDeceasedName('')
    setObituaryRelation('')
    setObituaryChiefMourner('')
    setObituaryWakeDate('')
    setObituaryFuneralDate('')
    setObituaryNoticeFile(null)
    setObituaryVenue('')
    setObituaryCondolencePostal('')
    setObituaryCondolenceAddress('')
    setObituaryCondolenceVenueName('')
    setObituaryCondolencePhone('')
    setObituaryCondolenceAmount('')
    setObituaryRequest('')
    setObituaryAttendees('')
    setLeaseClassification('')
    setLeaseVendor('')
    setLeaseOtherVendor('')
    setLeaseCarNumber('')
    setLeaseRequirements('')
    setLeaseCurrentAmount('')
    setLeaseNewAmount('')
    setLeaseTerm('')
    setLeaseDeliveryDate('')
    setLeaseExpiryDate('')
    setLeaseMileage('')
    setLeaseEstimateFile(null)
    setFiles([])
    setActiveAccord(newMode === 'approval' ? (currentRoute.effectiveStepOrder?.[0] || '所属長') : '回覧先')
  }

  const generalManagers = useMemo(() => {
    const gmList: (Employee & { dept: string })[] = []
    Object.entries(employeeMaster).forEach(([dept, members]) => {
      members.forEach(m => { if (m.title === '本部長') gmList.push({ ...m, dept }) })
    })
    return gmList
  }, [employeeMaster])

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const currentRoute = useMemo(() => {
    return getApprovalRoute(subType, selectedDepartment || user?.department || '', user?.title || '', employeeMaster, generalManagers, recruitmentDivision, user?.name || '')
  }, [subType, selectedDepartment, user, employeeMaster, generalManagers, recruitmentDivision])

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
        setActiveAccord(data.appName === '回覧報告' ? '回覧先' : (currentRoute.effectiveStepOrder?.[0] || '所属長'))

        const fd = data.formDetails || {}
        if (fd.amount !== undefined) setAmount(String(fd.amount))
        if (fd.paymentDate !== undefined) setPaymentDate(fd.paymentDate)
        if (fd.payee !== undefined) setPayee(fd.payee)
        if (fd.recruitmentDivision !== undefined) setRecruitmentDivision(fd.recruitmentDivision)
        if (data.subType === '入札結果報告') {
          setBiddingDetails(prev => ({ ...prev, ...fd }))
        }

        const wf = data.workflow || {}
        const steps = wf.steps || {}
        const stepOrder = wf.stepOrder || []
        const route = getApprovalRoute(data.subType || '', data.applicantDept || selectedDepartment || user?.department || '', user?.title || '', employeeMaster, generalManagers, fd.recruitmentDivision || '', user?.name || '')

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
  }, [reuseId, user, selectedDepartment, employeeMaster, generalManagers, currentRoute])

  useEffect(() => {
    if (user && subType && Object.keys(employeeMaster).length > 0 && mode === 'approval' && !reuseId) {
      setSelectedDeptHead(currentRoute.isDeptHead ? [] : (currentRoute.defaultDeptHead || []))
      setSelectedGM(currentRoute.defaultGM || [])
      setSelectedGMForCirculation(currentRoute.defaultGMForCirculation || [])
      setSelectedGeneralAffairs(currentRoute.defaultGeneralAffairs || [])
      setSelectedPostDecisionCirculation(currentRoute.defaultPostDecisionCirculation || [])
      setActiveAccord(currentRoute.effectiveStepOrder?.[0] || '所属長')
    }
  }, [subType, user, employeeMaster, currentRoute, mode, reuseId])

  useEffect(() => {
    if (employeeMaster && Object.keys(employeeMaster).length > 0) {
      const presidentList: string[] = []
      Object.values(employeeMaster).forEach((members) => {
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
    if (mode === 'approval' && subType === '求人稟議（パート・アルバイト採用）' && !recruitmentDivision) {
      return setError('採用区分を選択してください')
    }
    if (mode === 'approval' && subType === '求人稟議（パート・アルバイト採用）' && !employmentType) {
      return setError('区分を選択してください')
    }
    setLoading(true)
    if (!firebaseUser) {
      setLoading(false)
      return setError('ログイン情報が取得できません。再度ログインしてください。')
    }
    let stage = '申請処理開始'

    try {
      stage = '添付ファイルアップロード'
      const uploadedAttachments: { name: string; url: string; type: string }[] = []
      let fileIndex = 0

      const addFile = (file: File | null) => file && allFiles.push(file)
      const allFiles: File[] = [...files]
      if (mode === 'approval' && subType === '協力会社登録') {
        addFile(coRegistrationFile)
        addFile(coFinancialStatements)
        addFile(coInsuranceFile)
        addFile(coAntiSocialFile)
        addFile(coCompanyBrochure)
        addFile(coLicenseFile)
      }
      if (mode === 'approval' && subType === '給与情報変更申請') {
        addFile(salaryLaborCostFile)
      }
      if (mode === 'report' && subType === '退職者通知') {
        addFile(retirementResignationFile)
      }
      if (mode === 'report' && subType === '訃報連絡') {
        addFile(obituaryNoticeFile)
      }
      if (mode === 'approval' && subType === '車両リース決済') {
        addFile(leaseEstimateFile)
      }

      for (const file of allFiles) {
        let targetFile = file
        const isPdf = file.name.toLowerCase().endsWith('.pdf')
        const isImage = file.type.startsWith('image/') || (/\.(jpg|jpeg|png|gif|webp|bmp)$/i).test(file.name)
        let contentType = file.type || (isPdf ? 'application/pdf' : isImage ? 'image/png' : 'application/octet-stream')
        if (isPdf) {
          contentType = 'application/pdf'
        } else if (file.type.startsWith('image/')) {
          targetFile = await compressImageFile(file, 1200, 0.8)
          contentType = targetFile.type || contentType
        }

        const storageRef = ref(storage, `applications/${fileIndex}_${targetFile.name}`)
        stage = `添付ファイルアップロード: ${targetFile.name} (type: ${contentType || 'unknown'})`
        await uploadBytes(storageRef, targetFile, { contentType })
        const downloadURL = await getDownloadURL(storageRef)
        uploadedAttachments.push({ name: targetFile.name, url: downloadURL, type: contentType || 'application/octet-stream' })
        fileIndex++
      }

      let formDetails: any = { description, remarks }
      if (mode === 'approval' && subType === '求人稟議（パート・アルバイト採用）') {
        formDetails = {
          ...formDetails,
          recruitmentDivision,
          employmentType,
          jobLocation,
          jobContent,
          workHours,
          workDays,
          recruitmentUnitPrice: recruitmentUnitPrice ? Number(recruitmentUnitPrice) : '',
          postingDate,
          recruitmentMedia,
          postingFee: postingFee ? Number(postingFee) : '',
          salesAmount: salesAmount ? Number(salesAmount) : '',
          costAmount: costAmount ? Number(costAmount) : '',
          costRate,
          retireeName,
          retireeDate
        }
      }
      if (mode === 'approval' && subType === '通常申請') {
        formDetails = { ...formDetails, amount: Number(amount) || 0, paymentDate, payee }
      }
      if (mode === 'approval' && subType === '代表者印捺印申請') {
        formDetails = { ...formDetails, amount: Number(amount) || 0 }
      }
      if (mode === 'approval' && subType === '出張旅費申請') {
        formDetails = { ...formDetails, tripDetails, transportTotal, accommodationTotal, dailyAllowanceTotal, tripTotal }
      }
      if (mode === 'approval' && subType === '協力会社登録') {
        formDetails = { ...formDetails, coCompanyName, coBackground, coStartDate }
      }
      if (mode === 'approval' && subType === '給与情報変更申請') {
        formDetails = {
          ...formDetails,
          salaryCustomerName,
          salarySiteName,
          salaryEmployeeNumber,
          salaryEmployeeName,
          salaryChangeDetails,
          salaryStartDate,
          salaryReason
        }
      }
      if (mode === 'approval' && subType === '車両リース決済') {
        formDetails = {
          ...formDetails,
          leaseClassification,
          leaseVendor,
          leaseOtherVendor,
          leaseCarNumber,
          leaseRequirements,
          leaseCurrentAmount: leaseCurrentAmount ? Number(leaseCurrentAmount) : '',
          leaseNewAmount: leaseNewAmount ? Number(leaseNewAmount) : '',
          leaseTerm,
          leaseDeliveryDate,
          leaseExpiryDate,
          leaseMileage
        }
      }
      if (mode === 'report' && subType === '入札結果報告') {
        formDetails = { ...formDetails, ...biddingDetails }
      }
      if (mode === 'report' && subType === '退職者通知') {
        formDetails = {
          ...formDetails,
          retirementName,
          retirementSite,
          retirementJobType,
          retirementDate,
          retirementReason
        }
      }
      if (mode === 'report' && subType === '訃報連絡') {
        formDetails = {
          ...formDetails,
          obituaryType,
          obituaryTargetName,
          obituarySite,
          obituaryDeceasedName,
          obituaryRelation,
          obituaryChiefMourner,
          obituaryWakeDate,
          obituaryFuneralDate,
          obituaryVenue,
          obituaryCondolencePostal,
          obituaryCondolenceAddress,
          obituaryCondolenceVenueName,
          obituaryCondolencePhone,
          obituaryCondolenceAmount: obituaryCondolenceAmount ? Number(obituaryCondolenceAmount) : '',
          obituaryRequest,
          obituaryAttendees
        }
      }
      
      const appName = mode === 'approval' ? '稟議' : '回覧報告'

      const stepsObj: any = {}
      const dbKeyFor = (stepKey: string) => {
        if (stepKey === '本部長') return currentRoute.decisionMaker === '社長' ? '本部長' : currentRoute.decisionMaker
        if (stepKey === '決裁後回覧') return currentRoute.postDecisionCirculationLabel
        return stepKey
      }
      let firstStepKey = mode === 'report' ? '回覧先' : dbKeyFor(currentRoute.effectiveStepOrder?.[0] || '')
      let initialApprovers: string[] = []

      if (mode === 'approval') {
        currentRoute.effectiveStepOrder.forEach((stepKey: string, index: number) => {
          let approvers: string[] = []
          const dbKey = dbKeyFor(stepKey)

          if (stepKey === '部長') approvers = selectedDeptHead
          else if (stepKey === '本部長') approvers = selectedGM
          else if (stepKey === '社長') approvers = selectedExec
          else if (stepKey === '総務管理本部') approvers = selectedGeneralAffairs
          else if (stepKey === '本部長回覧') approvers = selectedGMForCirculation
          else if (stepKey === '決裁後回覧') approvers = selectedPostDecisionCirculation

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
      } else if (mode === 'report') {
        firstStepKey = '回覧先'
        initialApprovers = selectedCirculation
        stepsObj['回覧先'] = {
          approvers: selectedCirculation,
          status: '回覧待ち',
          comments: [],
          approvedBy: []
        }
      }

      const allCirculators = Array.from(new Set([
        ...selectedCirculation,
        ...(mode === 'approval' ? selectedGeneralAffairs : []),
        ...(mode === 'approval' ? selectedGMForCirculation : []),
        ...(mode === 'approval' ? selectedPostDecisionCirculation : [])
      ]))
      
      stage = '申請データ登録'
      const applicationNo = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'counters', 'applications')
        const counterDoc = await transaction.get(counterRef)
        const nextNo = (counterDoc.exists() ? (counterDoc.data().nextNumber || 0) : 0) + 1
        transaction.set(counterRef, { nextNumber: nextNo })
        return nextNo
      })

      const applicationData = {
        appName, subType, title, description, remarks,
        applicantId: user?.id || user?.email || firebaseUser?.email || firebaseUser?.uid || '', applicantName: user?.name || '', applicantDept: selectedDepartment || user?.department || '', applicantTitle: user?.title || '',
        applicationNo,
        formDetails,
        workflow: {
          currentStep: firstStepKey,
          status: mode === 'report' ? '回覧待ち' : '承認待ち',
          currentApprovers: initialApprovers,
          allCirculators: allCirculators,
          decisionMaker: currentRoute.decisionMaker,
          stepOrder: mode === 'approval' ? currentRoute.effectiveStepOrder.map((k: string) => dbKeyFor(k)) : ['回覧先'],
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
    } catch (err: any) { setError(`${stage}で失敗しました: ${err.message} (code: ${err.code || 'unknown'})`) } finally { setLoading(false) }
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
            text: `「${applicationData.title}」の新規承認依頼が届きました。\n\n確認・承認をお願いします。\n\nダッシュボードから詳細を確認してください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #4f46e5;">新規承認依頼</h2>
                <p>「<strong>${applicationData.title}</strong>」の新規承認依頼が届きました。</p>
                <div style="background-color: #eef2ff; padding: 15px; margin: 15px 0; border-left: 4px solid #4f46e5; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">依頼内容:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">確認・承認をお願いします。</p>
                </div>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
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
            text: `「${applicationData.title}」の新しい回覧報告が共有されました。\n\n内容の確認をお願いします。\n\nダッシュボードから詳細を確認してください。`,
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2 style="color: #0ea5e9;">新規回覧報告</h2>
                <p>「<strong>${applicationData.title}</strong>」の新しい回覧報告が共有されました。</p>
                <div style="background-color: #f0f9ff; padding: 15px; margin: 15px 0; border-left: 4px solid #0ea5e9; border-radius: 4px;">
                  <p style="margin: 0; font-size: 12px; color: #666;">依頼内容:</p>
                  <p style="margin: 5px 0 0 0; font-weight: bold;">内容の確認をお願いします。</p>
                </div>
                <p><a href="${window.location.origin}/dashboard" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">ダッシュボードを開く</a></p>
              </div>
            `
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
                        : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/60'
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
            else if (filterType === '部長' && user) { if (dept !== selectedDepartment && dept !== user.department) return null; filtered = members.filter(m => m.title.includes('部長')) }
            else if (filterType === '本部長') filtered = members.filter(m => m.title.includes('本部長'))
            else if (filterType === '総務') { if (dept !== '総務管理本部') return null; filtered = searchQuery ? members.filter(m => m.name.includes(searchQuery)) : members }
            else if (filterType === '回覧') filtered = searchQuery ? members.filter(m => m.name.includes(searchQuery)) : members

            if (filtered.length === 0) return null
            return (
              <div key={dept} className="space-y-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block px-1">{dept}</span>
                <div className="grid grid-cols-1 gap-1.5">
                  {filtered.map((m) => (
                    <button key={m.name} type="button" onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)} className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${selectedList.includes(m.name) ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:bg-slate-800/60'}`}>
                      <span>{m.name}</span>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <header className="sticky top-0 bg-slate-900/70 backdrop-blur-md border-b border-slate-700/80 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button type="button" onClick={() => router.push('/dashboard')} className="p-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-50 rounded-xl border border-slate-700/50 transition-all"><ArrowLeft size={20} /></button>
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">新規申請・回覧作成</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex p-1.5 bg-slate-900/80 border border-slate-700 rounded-2xl mb-8 max-w-md mx-auto shadow-2xl">
          <button type="button" onClick={() => handleModeChange('approval')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'approval' ? 'bg-indigo-600 text-slate-50 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><FileText size={18}/> 稟議申請</button>
          <button type="button" onClick={() => handleModeChange('report')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'report' ? 'bg-indigo-600 text-slate-50 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Share2 size={18}/> 回覧報告</button>
        </div>

        <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          {error && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-5 py-4 rounded-xl mb-8 text-sm font-medium animate-in zoom-in duration-300">⚠️ {error}</div>}

          <form onSubmit={handleSubmit} className="space-y-10">
            <section className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">書類種別</label>
                  <div className="relative">
                    <select value={subType} onChange={(e) => setSubType(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
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
                          <option value="車両リース決済">車両リース決済</option>
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
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="件名を入力してください" className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 outline-none" />
                </div>
              </div>

              {userDepartments.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">申請者 <span className="text-rose-500">*</span></label>
                    <div className="w-full px-4 py-3 bg-slate-900/40 border border-slate-700 rounded-xl text-slate-200">{user?.name || '未設定'}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">所属 <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <select value={selectedDepartment} onChange={(e) => setDepartmentOverride(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                        {userDepartments.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'approval' && subType === '求人稟議（パート・アルバイト採用）' && (
                <div className="space-y-6 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <Users size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">求人詳細情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">採用区分 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={recruitmentDivision} onChange={(e) => setRecruitmentDivision(e.target.value)} required className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="三保事業所">三保事業所</option>
                          <option value="九州支店">九州支店</option>
                          <option value="警備員">警備員</option>
                          <option value="清掃">清掃</option>
                          <option value="受付">受付</option>
                          <option value="その他">その他</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">区分 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} required className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="新規雇用">新規雇用</option>
                          <option value="欠員補充">欠員補充</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">配属現場名</label>
                      <input type="text" value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} placeholder="配属現場名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">勤務内容</label>
                      <input type="text" value={jobContent} onChange={(e) => setJobContent(e.target.value)} placeholder="例：受付業務" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">勤務時間</label>
                      <input type="text" value={workHours} onChange={(e) => setWorkHours(e.target.value)} placeholder="例：9:00-18:00" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">勤務曜日</label>
                      <input type="text" value={workDays} onChange={(e) => setWorkDays(e.target.value)} placeholder="例：月〜金" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">募集単価</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={recruitmentUnitPrice} onChange={(e) => setRecruitmentUnitPrice(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">掲載希望日</label>
                      <input type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">募集媒体</label>
                      <div className="relative">
                        <select value={recruitmentMedia} onChange={(e) => setRecruitmentMedia(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="DOMO">DOMO</option>
                          <option value="インディードプラス">インディードプラス</option>
                          <option value="AIDEM">AIDEM</option>
                          <option value="静岡新聞">静岡新聞</option>
                          <option value="その他">その他</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">掲載費用</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={postingFee} onChange={(e) => setPostingFee(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">売上</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={salesAmount} onChange={(e) => setSalesAmount(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">原価</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">原価率（%）</label>
                      <input type="number" value={costRate} onChange={(e) => setCostRate(e.target.value)} placeholder="例：80" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">退職者氏名</label>
                      <input type="text" value={retireeName} onChange={(e) => setRetireeName(e.target.value)} placeholder="欠員補充の場合のみ" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">退職（予定）日</label>
                      <input type="date" value={retireeDate} onChange={(e) => setRetireeDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                  </div>
                </div>
              )}

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
                <div className="space-y-8 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <Gavel size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">入札詳細情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札執行場所</label>
                      <input type="text" value={biddingDetails.location} onChange={(e) => setBiddingDetails({...biddingDetails, location: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札執行日</label>
                      <input type="date" style={{ colorScheme: 'dark' }} value={biddingDetails.date} onChange={(e) => setBiddingDetails({...biddingDetails, date: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札時間</label>
                      <input type="text" value={biddingDetails.time} onChange={(e) => setBiddingDetails({...biddingDetails, time: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900/40 p-4 rounded-xl border border-indigo-500/20 shadow-lg">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-2">落札業者名</label>
                      <input type="text" value={biddingDetails.winnerName} onChange={(e) => setBiddingDetails({...biddingDetails, winnerName: e.target.value})} className="w-full bg-slate-950 border border-indigo-500/30 rounded-xl px-4 py-3 text-indigo-100 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第1回落札金額</label>
                      <input type="number" value={biddingDetails.winnerBid1} onChange={(e) => setBiddingDetails({...biddingDetails, winnerBid1: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第2回落札金額</label>
                      <input type="number" value={biddingDetails.winnerBid2} onChange={(e) => setBiddingDetails({...biddingDetails, winnerBid2: e.target.value})} className="w-full bg-slate-955 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
                    <div className="flex items-center text-sm font-bold text-emerald-400 px-2">ヤマダユニア株式会社</div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第1回入札金額</label>
                      <input type="number" value={biddingDetails.ourBid1} onChange={(e) => setBiddingDetails({...biddingDetails, ourBid1: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第2回入札金額</label>
                      <input type="number" value={biddingDetails.ourBid2} onChange={(e) => setBiddingDetails({...biddingDetails, ourBid2: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    {biddingDetails.participants.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 flex items-center justify-center bg-slate-800 rounded-full text-[10px] font-bold text-slate-400">{(idx + 1).toString()}</span>
                          <input type="text" value={p.name} onChange={(e) => {
                            const newP = [...biddingDetails.participants]; newP[idx] = {...newP[idx], name: e.target.value}; setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-300 outline-none" placeholder="参加業者名" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-bold uppercase">1回</span>
                          <input type="number" value={p.bid1} onChange={(e) => {
                            const newP = [...biddingDetails.participants]; newP[idx] = {...newP[idx], bid1: e.target.value}; setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none text-right" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-bold uppercase">2回</span>
                          <input type="number" value={p.bid2} onChange={(e) => {
                            const newP = [...biddingDetails.participants]; newP[idx] = {...newP[idx], bid2: e.target.value}; setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none text-right" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-amber-500/5 p-5 rounded-2xl border border-amber-500/20 mt-8">
                    <div className="md:col-span-2 flex items-center gap-2 mb-2"><Clock size={16} className="text-amber-400" /><h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest">前年度実績比較</h4></div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">前年度落札業者</label>
                      <input type="text" value={biddingDetails.prevWinnerName} onChange={(e) => setBiddingDetails({...biddingDetails, prevWinnerName: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">前年度落札金額</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-bold">¥</span>
                        <input type="number" value={biddingDetails.prevWinnerAmount} onChange={(e) => setBiddingDetails({...biddingDetails, prevWinnerAmount: e.target.value})} className="w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-lg font-bold text-amber-200 outline-none text-right" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {mode === 'approval' && subType === '協力会社登録' && (
                <div className="space-y-6 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <Users size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">協力会社登録情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">会社名 <span className="text-rose-500">*</span></label>
                      <input type="text" value={coCompanyName} onChange={(e) => setCoCompanyName(e.target.value)} required placeholder="会社名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">取引開始予定日</label>
                      <input type="date" value={coStartDate} onChange={(e) => setCoStartDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">知り得た経緯、発注予定の業務名</label>
                      <textarea value={coBackground} onChange={(e) => setCoBackground(e.target.value)} rows={3} placeholder="紹介先、発注予定業務など" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FileUploadField label="協力会社登録票" file={coRegistrationFile} onChange={setCoRegistrationFile} />
                    <FileUploadField label="決算書（直近2年分）" file={coFinancialStatements} onChange={setCoFinancialStatements} />
                    <FileUploadField label="賠償保険写し" file={coInsuranceFile} onChange={setCoInsuranceFile} />
                    <FileUploadField label="反社確約書" file={coAntiSocialFile} onChange={setCoAntiSocialFile} />
                    <FileUploadField label="会社案内" file={coCompanyBrochure} onChange={setCoCompanyBrochure} />
                    <FileUploadField label="許認可登録写し" file={coLicenseFile} onChange={setCoLicenseFile} />
                  </div>
                </div>
              )}

              {mode === 'approval' && subType === '給与情報変更申請' && (
                <div className="space-y-6 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <FileText size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">給与情報変更情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">顧客名</label>
                      <input type="text" value={salaryCustomerName} onChange={(e) => setSalaryCustomerName(e.target.value)} placeholder="顧客名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">現場名</label>
                      <input type="text" value={salarySiteName} onChange={(e) => setSalarySiteName(e.target.value)} placeholder="現場名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">対象者社員番号（4桁）</label>
                      <input type="text" value={salaryEmployeeNumber} onChange={(e) => setSalaryEmployeeNumber(e.target.value)} maxLength={4} placeholder="例：0123" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">対象者氏名</label>
                      <input type="text" value={salaryEmployeeName} onChange={(e) => setSalaryEmployeeName(e.target.value)} placeholder="対象者氏名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">変更詳細情報（現状と変更後）</label>
                      <textarea value={salaryChangeDetails} onChange={(e) => setSalaryChangeDetails(e.target.value)} rows={4} placeholder="現状：&#10;変更後：" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">勤務変更の開始日</label>
                      <input type="date" value={salaryStartDate} onChange={(e) => setSalaryStartDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <FileUploadField label="労務費積算表" file={salaryLaborCostFile} onChange={setSalaryLaborCostFile} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">事由及び変更後の状況</label>
                      <textarea value={salaryReason} onChange={(e) => setSalaryReason(e.target.value)} rows={3} placeholder="事由や変更後の状況を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'approval' && subType === '車両リース決済' && (
                <div className="space-y-6 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <Car size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">車両リース決済情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">分類 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={leaseClassification} onChange={(e) => setLeaseClassification(e.target.value)} required className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="新規">新規</option>
                          <option value="入れ替え">入れ替え</option>
                          <option value="再リース">再リース</option>
                          <option value="返却">返却</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">業者 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={leaseVendor} onChange={(e) => { setLeaseVendor(e.target.value); if (e.target.value !== 'その他') setLeaseOtherVendor('') }} required className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="清水リース＆カード">清水リース＆カード</option>
                          <option value="静銀リース">静銀リース</option>
                          <option value="その他">その他</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {leaseVendor === 'その他' && (
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">業者名（その他）</label>
                        <input type="text" value={leaseOtherVendor} onChange={(e) => setLeaseOtherVendor(e.target.value)} placeholder="業者名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">登録車番 <span className="text-rose-500">*</span></label>
                      <input type="text" value={leaseCarNumber} onChange={(e) => setLeaseCarNumber(e.target.value)} required placeholder="例：静岡500 あ 1234" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">用件 <span className="text-rose-500">*</span></label>
                      <textarea value={leaseRequirements} onChange={(e) => setLeaseRequirements(e.target.value)} required rows={3} placeholder="用件を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">現在リース金額（月額）</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={leaseCurrentAmount} onChange={(e) => setLeaseCurrentAmount(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">新リース金額（月額）</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={leaseNewAmount} onChange={(e) => setLeaseNewAmount(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">期間</label>
                      <div className="relative">
                        <select value={leaseTerm} onChange={(e) => setLeaseTerm(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="0">0</option>
                          <option value="12">12</option>
                          <option value="24">24</option>
                          <option value="36">36</option>
                          <option value="48">48</option>
                          <option value="60">60</option>
                          <option value="72">72</option>
                          <option value="84">84</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">納車希望日</label>
                      <input type="date" value={leaseDeliveryDate} onChange={(e) => setLeaseDeliveryDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">期間満了日</label>
                      <input type="date" value={leaseExpiryDate} onChange={(e) => setLeaseExpiryDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">走行距離</label>
                      <input type="text" value={leaseMileage} onChange={(e) => setLeaseMileage(e.target.value)} placeholder="例：50,000km" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <FileUploadField label="見積等" file={leaseEstimateFile} onChange={setLeaseEstimateFile} />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'report' && subType === '退職者通知' && (
                <div className="space-y-6 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <Users size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">退職者通知情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">退職者氏名 <span className="text-rose-500">*</span></label>
                      <input type="text" value={retirementName} onChange={(e) => setRetirementName(e.target.value)} required placeholder="退職者氏名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">退職者所属現場 <span className="text-rose-500">*</span></label>
                      <input type="text" value={retirementSite} onChange={(e) => setRetirementSite(e.target.value)} required placeholder="所属現場を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">職種 <span className="text-rose-500">*</span></label>
                      <input type="text" value={retirementJobType} onChange={(e) => setRetirementJobType(e.target.value)} required placeholder="職種を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">退職日 <span className="text-rose-500">*</span></label>
                      <input type="date" value={retirementDate} onChange={(e) => setRetirementDate(e.target.value)} required style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">退職理由 <span className="text-rose-500">*</span></label>
                      <textarea value={retirementReason} onChange={(e) => setRetirementReason(e.target.value)} required rows={3} placeholder="退職理由を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <FileUploadField label="退職願" file={retirementResignationFile} onChange={setRetirementResignationFile} />
                    </div>
                  </div>
                </div>
              )}

              {mode === 'report' && subType === '訃報連絡' && (
                <div className="space-y-6 bg-slate-950/30 p-6 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-700 pb-4 mb-6">
                    <Users size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">訃報連絡情報</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">申請区分 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={obituaryType} onChange={(e) => setObituaryType(e.target.value)} required className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="社員">社員</option>
                          <option value="社員家族">社員家族</option>
                          <option value="お取引先">お取引先</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">社員・お客様名 <span className="text-rose-500">*</span></label>
                      <input type="text" value={obituaryTargetName} onChange={(e) => setObituaryTargetName(e.target.value)} required placeholder="社員またはお客様名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    {obituaryType === '社員' && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">現場名</label>
                        <input type="text" value={obituarySite} onChange={(e) => setObituarySite(e.target.value)} placeholder="社員の場合のみ" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">故人名 <span className="text-rose-500">*</span></label>
                      <input type="text" value={obituaryDeceasedName} onChange={(e) => setObituaryDeceasedName(e.target.value)} required placeholder="故人名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">社員との関係 <span className="text-rose-500">*</span></label>
                      <input type="text" value={obituaryRelation} onChange={(e) => setObituaryRelation(e.target.value)} required placeholder="例：実父" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">喪主名</label>
                      <input type="text" value={obituaryChiefMourner} onChange={(e) => setObituaryChiefMourner(e.target.value)} placeholder="喪主名を入力" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">通夜日時</label>
                      <input type="datetime-local" value={obituaryWakeDate} onChange={(e) => setObituaryWakeDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">葬儀日時</label>
                      <input type="datetime-local" value={obituaryFuneralDate} onChange={(e) => setObituaryFuneralDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <FileUploadField label="訃報案内" file={obituaryNoticeFile} onChange={setObituaryNoticeFile} />
                      <p className="text-xs text-slate-500 mt-1">※訃報案内を添付した場合、下記①②は省略できます</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">① 通夜・葬儀会場</label>
                      <input type="text" value={obituaryVenue} onChange={(e) => setObituaryVenue(e.target.value)} placeholder="会場名・住所など" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">② 弔電送付先</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" value={obituaryCondolencePostal} onChange={(e) => setObituaryCondolencePostal(e.target.value)} placeholder="郵便番号" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                        <input type="text" value={obituaryCondolencePhone} onChange={(e) => setObituaryCondolencePhone(e.target.value)} placeholder="電話番号" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                        <input type="text" value={obituaryCondolenceVenueName} onChange={(e) => setObituaryCondolenceVenueName(e.target.value)} placeholder="会場名" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                        <input type="text" value={obituaryCondolenceAddress} onChange={(e) => setObituaryCondolenceAddress(e.target.value)} placeholder="住所" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">香典金額</label>
                      <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                        <input type="number" value={obituaryCondolenceAmount} onChange={(e) => setObituaryCondolenceAmount(e.target.value)} placeholder="0" className="w-full pl-9 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 outline-none text-right" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">依頼事項 <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <select value={obituaryRequest} onChange={(e) => setObituaryRequest(e.target.value)} required className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer pr-10">
                          <option value="">選択してください</option>
                          <option value="弔電依頼">弔電依頼</option>
                          <option value="弔電・生花依頼">弔電・生花依頼</option>
                          <option value="弔電・生花・香典依頼">弔電・生花・香典依頼</option>
                          <option value="生花・香典依頼">生花・香典依頼</option>
                          <option value="香典依頼">香典依頼</option>
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">当社参列者名</label>
                      <input type="text" value={obituaryAttendees} onChange={(e) => setObituaryAttendees(e.target.value)} placeholder="複数の場合はカンマ区切り" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">内容説明</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="内容を詳しく入力してください" className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:ring-2 focus:ring-indigo-500/50 outline-none leading-relaxed" />
              </div>
            </section>

            {mode === 'approval' && subType === '通常申請' && (
              <section className="bg-slate-950/40 border border-slate-700 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-300">
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">金額</label>
                  <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-cyan-400 outline-none"/>
                  </div>
                </div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">支払予定日</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={{ colorScheme: 'dark' }} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none"/>
                </div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">支払先</label>
                  <input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl outline-none"/>
                </div>
              </section>
            )}

            {mode === 'approval' && subType === '代表者印捺印申請' && (
              <section className='space-y-6 bg-slate-950/40 border border-slate-700 rounded-2xl p-6 animate-in slide-in-from-top-2 duration-300'>
                <div>
                  <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>金額</label>
                  <div className='relative'><span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                    <input type='number' value={amount} onChange={(e) => setAmount(e.target.value)} className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-cyan-400 outline-none' />
                  </div>
                </div>
              </section>
            )}

            {mode === 'approval' && subType === '出張旅費申請' && (
              <section className='space-y-8 bg-slate-950/40 border border-slate-700 rounded-2xl p-6 animate-in slide-in-from-top-2 duration-300'>
                <div className='flex items-center gap-3 border-b border-slate-700 pb-4 mb-2'>
                  <FileText size={22} className='text-cyan-400' />
                  <h3 className='text-lg font-bold text-slate-100'>出張旅費明細</h3>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>出張開始日</label>
                    <input type='date' value={tripDetails.startDate} onChange={(e) => setTripDetails({ ...tripDetails, startDate: e.target.value })} style={{ colorScheme: 'dark' }} className='w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>出張終了日</label>
                    <input type='date' value={tripDetails.endDate} onChange={(e) => setTripDetails({ ...tripDetails, endDate: e.target.value })} style={{ colorScheme: 'dark' }} className='w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none' />
                  </div>
                </div>

                <div className='space-y-4'>
                  <h4 className='text-sm font-bold text-slate-300 uppercase tracking-widest'>利用交通機関・料金</h4>
                  {tripDetails.transport.map((t, idx) => (
                    <div key={idx} className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                      <input type='text' value={t.method} onChange={(e) => { const nt = [...tripDetails.transport]; nt[idx] = { ...nt[idx], method: e.target.value }; setTripDetails({ ...tripDetails, transport: nt }) }} placeholder={`交通機関 ${idx + 1}`} className='w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none' />
                      <div className='relative'>
                        <span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                        <input type='number' value={t.amount} onChange={(e) => { const nt = [...tripDetails.transport]; nt[idx] = { ...nt[idx], amount: e.target.value }; setTripDetails({ ...tripDetails, transport: nt }) }} placeholder='金額' className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none text-right' />
                      </div>
                    </div>
                  ))}
                  <div className='flex justify-end items-center gap-3 border-t border-slate-700 pt-4'>
                    <span className='text-sm text-slate-400'>交通費合計</span>
                    <span className='text-2xl font-black text-cyan-400'>¥{transportTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>宿泊日数</label>
                    <input type='number' value={tripDetails.accommodationNights} onChange={(e) => setTripDetails({ ...tripDetails, accommodationNights: e.target.value })} className='w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none text-right' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>宿泊単価</label>
                    <div className='relative'>
                      <span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                      <input type='number' value={tripDetails.accommodationUnitPrice} onChange={(e) => setTripDetails({ ...tripDetails, accommodationUnitPrice: e.target.value })} className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none text-right' />
                    </div>
                  </div>
                  <div className='flex flex-col justify-end'>
                    <span className='text-[10px] text-slate-500 uppercase tracking-widest mb-1'>宿泊費合計</span>
                    <span className='text-xl font-black text-cyan-400'>¥{accommodationTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>業務対応時間</label>
                  <input type='text' value={tripDetails.businessHours} onChange={(e) => setTripDetails({ ...tripDetails, businessHours: e.target.value })} placeholder='例：8時間' className='w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none' />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>日当（日数）</label>
                    <input type='number' value={tripDetails.dailyAllowanceDays} onChange={(e) => setTripDetails({ ...tripDetails, dailyAllowanceDays: e.target.value })} className='w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none text-right' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2'>日当単価</label>
                    <div className='relative'>
                      <span className='absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold'>¥</span>
                      <input type='number' value={tripDetails.dailyAllowanceUnitPrice} onChange={(e) => setTripDetails({ ...tripDetails, dailyAllowanceUnitPrice: e.target.value })} className='w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 outline-none text-right' />
                    </div>
                  </div>
                  <div className='flex flex-col justify-end'>
                    <span className='text-[10px] text-slate-500 uppercase tracking-widest mb-1'>日当合計</span>
                    <span className='text-xl font-black text-cyan-400'>¥{dailyAllowanceTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className='flex justify-end items-center gap-4 border-t border-slate-700 pt-6'>
                  <span className='text-sm font-bold text-slate-300 uppercase tracking-widest'>旅費合計</span>
                  <span className='text-3xl font-black text-emerald-400'>¥{tripTotal.toLocaleString()}</span>
                </div>
              </section>
            )}

            <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">備考</label>
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">添付ファイル</label>
                <label className="group flex flex-col items-center justify-center w-full h-32 bg-slate-950/30 border-2 border-dashed border-slate-700 rounded-2xl hover:border-indigo-500/40 cursor-pointer transition-all">
                  <Paperclip size={24} className="text-slate-600 group-hover:text-indigo-400 mb-2" />
                  <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">選択してアップロード</span>
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                </label>
                <div className="mt-2 space-y-1">{files.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px] bg-slate-950/60 p-2 rounded-lg border border-slate-700">
                    <span className="truncate max-w-[200px]">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-rose-500 hover:text-rose-400"><X size={12}/></button>
                  </div>
                ))}</div>
              </div>
            </div>

            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-3 mb-6"><Users size={18} className="text-indigo-500" /> {mode === 'approval' ? '承認・回覧経路の設定' : '回覧先の選択'}</h3>
              <div className="bg-slate-950/40 border border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-800 shadow-lg">
                {mode === 'approval' ? (
                  <>
                    {currentRoute.effectiveStepOrder.map((stepKey: string) => {
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

            <div className="flex gap-4 pt-6 border-t border-slate-700/80">
              <button type="button" onClick={() => router.push('/dashboard')} className="flex-1 bg-slate-800/40 text-slate-400 font-bold py-3 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:text-slate-50 transition-all text-sm tracking-widest uppercase">キャンセル</button>
              <button type="submit" disabled={loading} className="flex-[2] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-50 font-black py-4 rounded-xl shadow-lg transition-all text-base tracking-[0.2em] flex items-center justify-center gap-3 uppercase disabled:opacity-50">
                {loading ? <div className="w-5 h-5 border-2 border-slate-50/20 border-t-slate-50 rounded-full animate-spin"></div> : <><Send size={18} /> {mode === 'approval' ? '申請を送信する' : '回覧を開始する'}</>}
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