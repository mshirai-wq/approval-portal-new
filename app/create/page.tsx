'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Users, Search, Check, Clock, ArrowLeft, Paperclip, X, ChevronDown, Send } from 'lucide-react'

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
// 2. 承認ルート計算ロジック
// ==========================================
function getRelatedGM(dept: string, generalManagers: any[]) {
  if (!dept) return null
  if (dept === '三保事業所' || dept === '九州支店') {
    return generalManagers.find(m => m.dept === '営業管理本部')
  }
  if (dept === '特掃部' || dept === '警備管理部' || dept === '施設管理部' || dept === 'グリーン管理部') {
    return generalManagers.find(m => m.dept === '技術管理本部')
  }
  return generalManagers.find(m => m.dept === dept)
}

function getApprovalRoute(subType: string, applicantDept: string, applicantTitle: string, employeeMaster: EmployeeMaster, generalManagers: any[]) {
  const isDeptHead = applicantTitle === '部長'
  const relatedGM = getRelatedGM(applicantDept, generalManagers)
  
  const generalAffairsDept = employeeMaster['総務管理本部'] || []
  const kaneda = generalAffairsDept.find(m => m.name.includes('金田'))?.name || '金田麻里江'
  const tanabe = generalAffairsDept.find(m => m.name.includes('田邉'))?.name || '田邉洋'
  const mori = generalAffairsDept.find(m => m.name.includes('森'))?.name || '森雅代'
  const tsuboi = generalAffairsDept.find(m => m.name.includes('坪井'))?.name || '坪井美須夫'
  const takahashi = generalAffairsDept.find(m => m.name.includes('高橋'))?.name || '高橋広道'
  const miura = generalAffairsDept.find(m => m.name.includes('三浦'))?.name || '三浦暢子'
  const asakura = generalAffairsDept.find(m => m.name.includes('朝倉'))?.name || '朝倉千晶'
  const kawakami = generalAffairsDept.find(m => m.name.includes('川上'))?.name || '川上沙織'
  
  const residentGM = generalManagers.find(m => m.dept === '常駐管理本部')
  const salesGM = generalManagers.find(m => m.dept === '営業管理本部')
  const generalAffairsGM = generalManagers.find(m => m.dept === '総務管理本部')
  
  const routes: any = {
    '通常申請': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: true, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: relatedGM ? [relatedGM.name] : [],
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (relatedGM?.name)).map(m => m.name),
      defaultExec: [], defaultGeneralAffairs: [tanabe, kaneda], defaultCirculation: []
    },
    '求人稟議（パート・アルバイト採用）': {
      showDeptHead: false, showGM: true, showGMForCirculation: false, showExec: false, showGeneralAffairs: true,
      decisionMaker: '常駐管理本部長', defaultDeptHead: [],
      defaultGM: residentGM ? [residentGM.name] : [],
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: [kaneda], defaultCirculation: []
    },
    '求人稟議（キャリア・新卒採用）': {
      showDeptHead: false, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: generalManagers.map(m => m.name),
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: [tanabe, kaneda], defaultCirculation: []
    },
    '代表者印捺印申請': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: true, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: salesGM ? [salesGM.name, generalAffairsGM?.name, mori].filter(Boolean) : [],
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (salesGM?.name) && m.name !== (generalAffairsGM?.name) && !m.name.includes('森')).map(m => m.name),
      defaultExec: [], defaultGeneralAffairs: generalAffairsGM ? [generalAffairsGM.name] : [], defaultCirculation: []
    },
    '営業統括本部長決裁見積申請（300万円未満）': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: false, showGeneralAffairs: true,
      decisionMaker: '営業管理本部長', defaultDeptHead: [],
      defaultGM: salesGM ? [salesGM.name] : [],
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: [mori], defaultCirculation: []
    },
    '社長決裁見積書申請（300万円以上）': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: salesGM ? [salesGM.name] : [],
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: generalAffairsGM ? [generalAffairsGM.name, mori] : [mori], defaultCirculation: []
    },
    '協力会社登録': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: generalManagers.map(m => m.name),
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: [tanabe, tsuboi, takahashi], defaultCirculation: []
    },
    '出張旅費申請': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: generalManagers.map(m => m.name),
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: [tanabe, kaneda], defaultCirculation: []
    },
    '車両リース決裁': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: true, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: relatedGM ? [relatedGM.name] : [],
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (relatedGM?.name)).map(m => m.name),
      defaultExec: [], defaultGeneralAffairs: [tanabe], defaultCirculation: []
    },
    '給与情報変更申請': {
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true,
      decisionMaker: '社長', defaultDeptHead: [],
      defaultGM: generalManagers.map(m => m.name),
      defaultGMForCirculation: [], defaultExec: [], defaultGeneralAffairs: [miura, asakura, kawakami], defaultCirculation: []
    }
  }
  return routes[subType] || routes['通常申請']
}

// ==========================================
// 3. メインコンポーネント
// ==========================================
export default function CreatePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [employeeMaster, setEmployeeMaster] = useState<EmployeeMaster>({})

  // Workflow selection
  const [selectedDeptHead, setSelectedDeptHead] = useState<string[]>([])
  const [selectedGM, setSelectedGM] = useState<string[]>([])
  const [selectedGMForCirculation, setSelectedGMForCirculation] = useState<string[]>([])
  const [selectedExec, setSelectedExec] = useState<string[]>([])
  const [selectedCirculation, setSelectedCirculation] = useState<string[]>([])
  const [selectedGeneralAffairs, setSelectedGeneralAffairs] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAccord, setActiveAccord] = useState('所属長')

  // Form state
  const [subType, setSubType] = useState('通常申請')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  
  // 通常申請
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [payee, setPayee] = useState('')

  const fetchEmployeeMaster = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'))
      const master: EmployeeMaster = {}
      querySnapshot.docs.forEach(doc => {
        const data = doc.data()
        if (!master[data.department]) {
          master[data.department] = []
        }
        master[data.department].push({
          name: data.name,
          email: data.email,
          title: data.title,
          dept: data.department
        })
      })
      setEmployeeMaster(master)
    } catch (error) {
      console.error('Error fetching employee master:', error)
    }
  }

  useEffect(() => {
    fetchEmployeeMaster()
  }, [])

  const generalManagers = useMemo(() => {
    if (!employeeMaster) return []
    const gmList: (Employee & { dept: string })[] = []
    Object.entries(employeeMaster).forEach(([dept, members]) => {
      members.forEach(m => {
        if (m.title === '本部長') {
          gmList.push({ ...m, dept })
        }
      })
    })
    return gmList
  }, [employeeMaster])

  const currentRoute = useMemo(() => {
    return getApprovalRoute(subType, user?.department || '', user?.title || '', employeeMaster, generalManagers)
  }, [subType, user, employeeMaster, generalManagers])

  useEffect(() => {
    if (user && subType && Object.keys(employeeMaster).length > 0) {
      setSelectedDeptHead(currentRoute.defaultDeptHead)
      setSelectedGM(currentRoute.defaultGM)
      setSelectedGMForCirculation(currentRoute.defaultGMForCirculation)
      setSelectedGeneralAffairs(currentRoute.defaultGeneralAffairs)
      setSelectedCirculation(currentRoute.defaultCirculation)
    }
  }, [subType, user, employeeMaster, currentRoute])

  useEffect(() => {
    if (employeeMaster && Object.keys(employeeMaster).length > 0) {
      const presidentList: string[] = []
      Object.entries(employeeMaster).forEach(([dept, members]) => {
        members.forEach(m => {
          if (m.title === '社長') { presidentList.push(m.name) }
        })
      })
      if (presidentList.length > 0) { setSelectedExec(presidentList) }
    }
  }, [employeeMaster])

  const toggleMemberSelection = (member: string, list: string[], setList: (list: string[]) => void) => {
    if (list.includes(member)) {
      setList(list.filter(m => m !== member))
    } else {
      setList([...list, member])
    }
  }

  const removeFile = (indexToRemove: number) => {
    setFiles(files.filter((_, index) => index !== indexToRemove))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) {
      setError('件名を入力してください')
      return
    }

    setLoading(true)
    setError('')

    try {
      const uploadedAttachments: { name: string; url: string; type: string }[] = []
      if (files.length > 0) {
        for (const file of files) {
          const timestamp = Date.now()
          const storageRef = ref(storage, `applications/${timestamp}_${file.name}`)
          await uploadBytes(storageRef, file)
          const downloadURL = await getDownloadURL(storageRef)
          uploadedAttachments.push({
            name: file.name,
            url: downloadURL,
            type: file.type
          })
        }
      }

      let formDetails: any = { description, remarks }
      if (subType === '通常申請') {
        formDetails = { ...formDetails, amount: Number(amount) || 0, paymentDate, payee }
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
          currentStep: currentRoute.showDeptHead ? '部長' : (currentRoute.showGM ? '本部長' : (currentRoute.showExec ? '社長' : '総務管理本部')),
          status: '承認待ち',
          decisionMaker: currentRoute.decisionMaker,
          steps: {
            ...(currentRoute.showDeptHead && { '部長': { approvers: selectedDeptHead, status: '承認待ち', comments: [] } }),
            ...(currentRoute.showGM && { '本部長': { approvers: selectedGM, status: '承認待ち', comments: [] } }),
            ...(currentRoute.showGMForCirculation && { '本部長回覧': { approvers: selectedGMForCirculation, status: '回覧待ち', comments: [] } }),
            ...(currentRoute.showExec && { '社長': { approvers: selectedExec, status: '承認待ち', comments: [] } }),
            ...(currentRoute.showGeneralAffairs && { '総務管理本部': { approvers: selectedGeneralAffairs, status: '回覧待ち', comments: [] } })
          },
          circulations: selectedCirculation,
          confirmedBy: []
        },
        attachments: uploadedAttachments,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'applications'), applicationData)
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      console.error('Error creating application:', err)
      setError('申請の作成に失敗しました: ' + (err.message || '不明なエラー'))
    } finally {
      setLoading(false)
    }
  }

  const renderGeneralAffairsSelector = (selectedList: string[], setSelectedList: (list: string[]) => void) => {
    const generalAffairsDept = employeeMaster['総務管理本部'] || []
    const filteredMembers = searchQuery
      ? generalAffairsDept.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : generalAffairsDept

    return (
      <div className="space-y-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="総務管理本部の社員を検索..."
            className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700/60 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
          {filteredMembers.map((m) => {
            const isSelected = selectedList.includes(m.name)
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                  isSelected 
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]' 
                    : 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col items-start text-left">
                  <span>{m.name}</span>
                  <span className="text-[10px] text-slate-500 font-normal">{m.title}</span>
                </div>
                {isSelected && <div className="bg-indigo-500 p-0.5 rounded-full"><Check size={10} className="text-white" /></div>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderMemberSelector = (selectedList: string[], setSelectedList: (list: string[]) => void, filterType: string) => {
    return (
      <div className="space-y-4">
        {filterType === '回覧' && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="社員を検索..."
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700/60 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>
        )}
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
          {Object.entries(employeeMaster).map(([dept, members]) => {
            let filteredMembers: Employee[] = []
            
            if (filterType === '社長') {
              filteredMembers = members.filter(m => m.title.includes('社長'))
            } else if (filterType === '部長' && user) {
              if (dept !== user.department) return null
              filteredMembers = members.filter(m => m.title.includes('部長'))
            } else if (filterType === '本部長') {
              filteredMembers = members.filter(m => m.title.includes('本部長'))
            } else if (filterType === '回覧') {
              filteredMembers = searchQuery
                ? members.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
                : members
            }

            if (filteredMembers.length === 0) return null
            
            return (
              <div key={dept} className="space-y-2">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block px-1">{dept}</span>
                <div className="space-y-1.5">
                  {filteredMembers.map((m) => {
                    const isSelected = selectedList.includes(m.name)
                    return (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                          isSelected 
                            ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]' 
                            : 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:bg-slate-800/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span>{m.name}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{m.title}</span>
                        </div>
                        {isSelected && <div className="bg-indigo-500 p-0.5 rounded-full"><Check size={10} className="text-white" /></div>}
                      </button>
                    )
                  })}
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
      {/* 共通ヘッダー */}
      <header className="sticky top-0 bg-[#111827]/70 backdrop-blur-md border-b border-slate-800/80 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700/50 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            新規申請作成
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
              <Paperclip size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-100">ワークフロー申請</h1>
              <p className="text-slate-500 text-sm">必要な情報を入力して、承認ルートを選択してください</p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-5 py-4 rounded-xl mb-8 text-sm font-medium animate-in fade-in zoom-in duration-300">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-10">
            
            {/* 基本情報セクション */}
            <section className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 申請種別 (矢印アイコンをクッキリ配置) */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">申請種別</label>
                  <div className="relative">
                    <select
                      value={subType}
                      onChange={(e) => setSubType(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all appearance-none cursor-pointer pr-10"
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
                    {/* 右端にカスタム矢印を絶対配置 */}
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-slate-200 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">
                    件名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="例: パソコン購入の稟議"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">詳細説明</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="申請の具体的な内容や理由を入力してください"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all leading-relaxed"
                />
              </div>
            </section>

            {/* 通常申請の拡張項目 */}
            {subType === '通常申請' && (
              <section className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">通常申請の詳細情報</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">金額</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400 font-bold">¥</span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xl font-black text-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all"
                      />
                    </div>
                  </div>

                  {/* 支払予定日 (カレンダーボタンをクッキリ白に強制最適化) */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">支払予定日</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{ colorScheme: 'dark' }} // ブラウザ標準のカレンダーアイコンを白色＆ピッカーをダーク対応にする魔法
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">支払先</label>
                    <input
                      type="text"
                      value={payee}
                      onChange={(e) => setPayee(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* 備考とファイル添付 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">備考</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">添付ファイル (画像・PDF)</label>
                <div className="space-y-4">
                  <label className="group flex flex-col items-center justify-center w-full h-32 bg-slate-950/30 border-2 border-dashed border-slate-800 rounded-2xl hover:border-indigo-500/40 hover:bg-slate-900/40 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Paperclip size={24} className="text-slate-600 group-hover:text-indigo-400 mb-2 transition-colors" />
                      <p className="text-xs font-bold text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-widest">ファイルをドラッグ or 選択</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          setFiles(prev => [...prev, ...Array.from(e.target.files!)])
                        }
                      }}
                    />
                  </label>

                  {files.length > 0 && (
                    <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 group">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-[10px] text-slate-400 truncate font-mono">{file.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="text-rose-500/50 hover:text-rose-500 p-1 bg-rose-500/5 hover:bg-rose-500/10 rounded-lg transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 経路選択セクション */}
            <section className="space-y-4">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-3 mb-6">
                <Users size={18} className="text-indigo-500" />
                承認・回覧経路の設定
              </h3>
              
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800 shadow-lg">
                {currentRoute.showDeptHead && (
                  <AccordItem
                    title="所属長 (部長承認)"
                    count={selectedDeptHead.length}
                    isActive={activeAccord === '所属長'}
                    onClick={() => setActiveAccord(activeAccord === '所属長' ? '' : '所属長')}
                  >
                    {renderMemberSelector(selectedDeptHead, setSelectedDeptHead, '部長')}
                  </AccordItem>
                )}
                {currentRoute.showGM && (
                  <AccordItem
                    title="本部長 (承認)"
                    count={selectedGM.length}
                    isActive={activeAccord === '本部長（承認）'}
                    onClick={() => setActiveAccord(activeAccord === '本部長（承認）' ? '' : '本部長（承認）')}
                  >
                    {renderMemberSelector(selectedGM, setSelectedGM, '本部長')}
                  </AccordItem>
                )}
                {currentRoute.showExec && (
                  <AccordItem
                    title="社長 (最終決裁)"
                    count={selectedExec.length}
                    isActive={activeAccord === '社長'}
                    onClick={() => setActiveAccord(activeAccord === '社長' ? '' : '社長')}
                  >
                    {renderMemberSelector(selectedExec, setSelectedExec, '社長')}
                  </AccordItem>
                )}
                {currentRoute.showGeneralAffairs && (
                  <AccordItem
                    title="総務管理本部"
                    count={selectedGeneralAffairs.length}
                    isActive={activeAccord === '総務管理本部'}
                    onClick={() => setActiveAccord(activeAccord === '総務管理本部' ? '' : '総務管理本部')}
                  >
                    {renderGeneralAffairsSelector(selectedGeneralAffairs, setSelectedGeneralAffairs)}
                  </AccordItem>
                )}
                {currentRoute.showGMForCirculation && (
                  <AccordItem
                    title="本部長 (回覧)"
                    count={selectedGMForCirculation.length}
                    isActive={activeAccord === '本部長（回覧）'}
                    onClick={() => setActiveAccord(activeAccord === '本部長（回覧）' ? '' : '本部長（回覧）')}
                  >
                    {renderMemberSelector(selectedGMForCirculation, setSelectedGMForCirculation, '本部長')}
                  </AccordItem>
                )}
                <AccordItem
                  title="回覧先 (全社員から選択)"
                  count={selectedCirculation.length}
                  isActive={activeAccord === '回覧先'}
                  onClick={() => setActiveAccord(activeAccord === '回覧先' ? '' : '回覧先')}
                >
                  {renderMemberSelector(selectedCirculation, setSelectedCirculation, '回覧')}
                </AccordItem>
              </div>
            </section>

            {/* 送信ボタン */}
            <div className="flex gap-4 pt-6 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-slate-800/40 text-slate-400 font-bold py-3 px-6 rounded-xl border border-slate-700/50 hover:bg-slate-800 hover:text-white transition-all text-sm tracking-widest"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 px-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base tracking-[0.2em] flex items-center justify-center gap-3 uppercase"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    処理中...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    申請を送信する
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  )
}