'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore'
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
// 2. 承認ルート計算ロジック
// ==========================================
function getRelatedGM(dept: string, generalManagers: any[]) {
  if (!dept) return null
  if (dept === '三保事業所' || dept === '九州支店') return generalManagers.find(m => m.dept === '営業管理本部')
  if (dept === '特掃部' || dept === '警備管理部' || dept === '施設管理部' || dept === 'グリーン管理部') return generalManagers.find(m => m.dept === '技術管理本部')
  return generalManagers.find(m => m.dept === dept)
}

function getApprovalRoute(subType: string, applicantDept: string, applicantTitle: string, employeeMaster: EmployeeMaster, generalManagers: any[]) {
  const isDeptHead = applicantTitle === '部長'
  const relatedGM = getRelatedGM(applicantDept, generalManagers)
  const generalAffairsDept = employeeMaster['総務管理本部'] || []
  const kaneda = generalAffairsDept.find(m => m.name.includes('金田'))?.name || '金田麻里江'
  const tanabe = generalAffairsDept.find(m => m.name.includes('田邉'))?.name || '田邉洋'
  const mori = generalAffairsDept.find(m => m.name.includes('森'))?.name || '森雅代'
  const residentGM = generalManagers.find(m => m.dept === '常駐管理本部')
  const salesGM = generalManagers.find(m => m.dept === '営業管理本部')
  const generalAffairsGM = generalManagers.find(m => m.dept === '総務管理本部')
  
  const routes: any = {
    '通常申請': { 
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: true, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', 
      defaultGM: relatedGM ? [relatedGM.name] : [], 
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (relatedGM?.name)).map(m => m.name),
      defaultGeneralAffairs: [tanabe, kaneda] 
    },
    '求人稟議（パート・アルバイト採用）': { showDeptHead: false, showGM: true, showGMForCirculation: false, showExec: false, showGeneralAffairs: true, decisionMaker: '常駐管理本部長', defaultGM: residentGM ? [residentGM.name] : [], defaultGeneralAffairs: [kaneda], defaultGMForCirculation: [] },
    '求人稟議（キャリア・新卒採用）': { showDeptHead: false, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', defaultGM: generalManagers.map(m => m.name), defaultGeneralAffairs: [tanabe, kaneda], defaultGMForCirculation: [] },
    '代表者印捺印申請': { 
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: true, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', 
      defaultGM: salesGM ? [salesGM.name, generalAffairsGM?.name, mori].filter(Boolean) : [], 
      defaultGeneralAffairs: generalAffairsGM ? [generalAffairsGM.name] : [],
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (salesGM?.name) && m.name !== (generalAffairsGM?.name) && !m.name.includes('森')).map(m => m.name)
    },
    '営業統括本部長決裁見積申請（300万円未満）': { showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: false, showGeneralAffairs: true, decisionMaker: '営業管理本部長', defaultGM: salesGM ? [salesGM.name] : [], defaultGeneralAffairs: [mori], defaultGMForCirculation: [] },
    '社長決裁見積書申請（300万円以上）': { showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', defaultGM: salesGM ? [salesGM.name] : [], defaultGeneralAffairs: generalAffairsGM ? [generalAffairsGM.name, mori] : [mori], defaultGMForCirculation: [] },
    '協力会社登録': { showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', defaultGM: generalManagers.map(m => m.name), defaultGeneralAffairs: [tanabe], defaultGMForCirculation: [] },
    '出張旅費申請': { showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', defaultGM: generalManagers.map(m => m.name), defaultGeneralAffairs: [tanabe, kaneda], defaultGMForCirculation: [] },
    '車両リース決裁': { 
      showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: true, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', 
      defaultGM: relatedGM ? [relatedGM.name] : [], 
      defaultGeneralAffairs: [tanabe],
      defaultGMForCirculation: generalManagers.filter(m => m.name !== (relatedGM?.name)).map(m => m.name)
    },
    '給与情報変更申請': { showDeptHead: !isDeptHead, showGM: true, showGMForCirculation: false, showExec: true, showGeneralAffairs: true, decisionMaker: '社長', defaultGM: generalManagers.map(m => m.name), defaultGeneralAffairs: [tanabe], defaultGMForCirculation: [] }
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

  // モード切り替え ('approval' = 稟議, 'report' = 回覧報告)
  const [mode, setMode] = useState<'approval' | 'report'>('approval')

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
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [payee, setPayee] = useState('')

  // 入札結果報告専用のState
  const [biddingDetails, setBiddingDetails] = useState({
    location: '',
    date: '',
    time: '',
    winnerName: '',
    winnerBid1: '',
    winnerBid2: '',
    ourBid1: '',
    ourBid2: '',
    prevWinnerName: '',
    prevWinnerAmount: '',
    participants: Array(6).fill({ name: '', bid1: '', bid2: '' })
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

  useEffect(() => {
    if (user && subType && Object.keys(employeeMaster).length > 0 && mode === 'approval') {
      setSelectedDeptHead(currentRoute.defaultDeptHead || [])
      setSelectedGM(currentRoute.defaultGM || [])
      setSelectedGMForCirculation(currentRoute.defaultGMForCirculation || [])
      setSelectedGeneralAffairs(currentRoute.defaultGeneralAffairs || [])
    }
  }, [subType, user, employeeMaster, currentRoute, mode])

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
      for (const file of files) {
        const storageRef = ref(storage, `applications/${Date.now()}_${file.name}`)
        await uploadBytes(storageRef, file)
        const downloadURL = await getDownloadURL(storageRef)
        uploadedAttachments.push({ name: file.name, url: downloadURL, type: file.type })
      }

      let formDetails: any = { description, remarks }
      if (mode === 'approval' && subType === '通常申請') {
        formDetails = { ...formDetails, amount: Number(amount) || 0, paymentDate, payee }
      }
      
      if (mode === 'report' && subType === '入札結果報告') {
        formDetails = { ...formDetails, ...biddingDetails }
      }
      
      const appName = mode === 'approval' ? '稟議' : '回覧報告'

      const initialApprovers = mode === 'report' ? [] : (
        currentRoute.showDeptHead ? selectedDeptHead :
        currentRoute.showGM ? selectedGM :
        currentRoute.showExec ? selectedExec : selectedGeneralAffairs
      );

      const allCirculators = Array.from(new Set([
        ...selectedCirculation,
        ...(mode === 'approval' ? selectedGeneralAffairs : []),
        ...(mode === 'approval' ? selectedGMForCirculation : [])
      ]));
      
      const applicationData = {
        appName, subType, title, description, remarks,
        applicantId: user?.id || '', applicantName: user?.name || '', applicantDept: user?.department || '', applicantTitle: user?.title || '',
        formDetails,
        workflow: {
          currentStep: mode === 'report' ? '回覧先' : (currentRoute.showDeptHead ? '部長' : (currentRoute.showGM ? '本部長' : '社長')),
          status: mode === 'report' ? '承認済み' : '承認待ち',
          currentApprovers: initialApprovers, 
          allCirculators: allCirculators,     
          steps: mode === 'approval' ? {
            ...(currentRoute.showDeptHead && { '部長': { approvers: selectedDeptHead, status: '承認待ち', comments: [] } }),
            ...(currentRoute.showGM && { '本部長': { approvers: selectedGM, status: '承認待ち', comments: [] } }),
            ...(currentRoute.showGMForCirculation && { '本部長回覧': { approvers: selectedGMForCirculation, status: '回覧待ち', comments: [] } }),
            ...(currentRoute.showExec && { '社長': { approvers: selectedExec, status: '承認待ち', comments: [] } }),
            ...(currentRoute.showGeneralAffairs && { '総務管理本部': { approvers: selectedGeneralAffairs, status: '回覧待ち', comments: [] } })
          } : {},
          circulations: selectedCirculation, confirmedBy: []
        },
        attachments: uploadedAttachments,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'applications'), applicationData)
      router.push('/dashboard')
    } catch (err: any) { setError('失敗しました: ' + err.message) } finally { setLoading(false) }
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
          {/* 💡【修正】タイトルを「新規申請・回覧作成」へ確実に変更 */}
          <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">新規申請・回覧作成</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* モード切り替えタブ */}
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
                          <option value="営業統括本部長決裁見積申請（300万円未満）">営業統括本部長決裁見積申請（300万円未満）</option>
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
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="例: 入札結果報告（〇〇案件）" className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 outline-none" />
                </div>
              </div>
              
              {/* 入札結果報告 専用フォーム */}
              {mode === 'report' && subType === '入札結果報告' && (
                <div className="space-y-8 bg-slate-950/30 p-6 rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
                    <Gavel size={22} className="text-cyan-400" />
                    <h3 className="text-lg font-bold text-slate-100">入札詳細情報</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札執行場所</label>
                      <input type="text" value={biddingDetails.location} onChange={(e) => setBiddingDetails({...biddingDetails, location: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" placeholder="支店名等を入力してください" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札執行日</label>
                      <input type="date" style={{ colorScheme: 'dark' }} value={biddingDetails.date} onChange={(e) => setBiddingDetails({...biddingDetails, date: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">入札時間</label>
                      <input type="text" value={biddingDetails.time} onChange={(e) => setBiddingDetails({...biddingDetails, time: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" placeholder="入札時間を記入" />
                    </div>
                  </div>

                  {/* 落札業者セクション */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900/40 p-4 rounded-xl border border-indigo-500/20 shadow-lg">
                    <div className="md:col-span-1">
                      <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-2">落札業者名</label>
                      <input type="text" value={biddingDetails.winnerName} onChange={(e) => setBiddingDetails({...biddingDetails, winnerName: e.target.value})} className="w-full bg-slate-950 border border-indigo-500/30 rounded-xl px-4 py-3 text-indigo-100 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第1回落札金額</label>
                      <input type="number" value={biddingDetails.winnerBid1} onChange={(e) => setBiddingDetails({...biddingDetails, winnerBid1: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">第2回落札金額</label>
                      <input type="number" value={biddingDetails.winnerBid2} onChange={(e) => setBiddingDetails({...biddingDetails, winnerBid2: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none text-right" />
                    </div>
                  </div>

                  {/* 自社（ヤマダユニア）セクション */}
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

                  {/* 参加業者リスト */}
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">入札参加業者（①〜⑥）</label>
                    {biddingDetails.participants.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 flex items-center justify-center bg-slate-800 rounded-full text-[10px] font-bold text-slate-400">{(idx + 1).toString()}</span>
                          <input type="text" value={p.name} onChange={(e) => {
                            const newP = [...biddingDetails.participants];
                            newP[idx] = {...newP[idx], name: e.target.value};
                            setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-300 outline-none" placeholder="参加業者名" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-bold uppercase">1回</span>
                          <input type="number" value={p.bid1} onChange={(e) => {
                            const newP = [...biddingDetails.participants];
                            newP[idx] = {...newP[idx], bid1: e.target.value};
                            setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none text-right" placeholder="0" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 whitespace-nowrap font-bold uppercase">2回</span>
                          <input type="number" value={p.bid2} onChange={(e) => {
                            const newP = [...biddingDetails.participants];
                            newP[idx] = {...newP[idx], bid2: e.target.value};
                            setBiddingDetails({...biddingDetails, participants: newP});
                          }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none text-right" placeholder="0" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 前年度実績セクション */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-amber-500/5 p-5 rounded-2xl border border-amber-500/20 mt-8">
                    <div className="md:col-span-2 flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-amber-400" />
                      <h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest">前年度実績比較</h4>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">前年度落札業者</label>
                      <input type="text" value={biddingDetails.prevWinnerName} onChange={(e) => setBiddingDetails({...biddingDetails, prevWinnerName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 outline-none" placeholder="前年度の落札業者名" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">前年度落札金額</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-bold">¥</span>
                        <input type="number" value={biddingDetails.prevWinnerAmount} onChange={(e) => setBiddingDetails({...biddingDetails, prevWinnerAmount: e.target.value})} className="w-full pl-9 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-lg font-bold text-amber-200 outline-none text-right" placeholder="0" />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">備考</label>
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 px-1">添付ファイル</label>
                <label className="group flex flex-col items-center justify-center w-full h-32 bg-slate-950/30 border-2 border-dashed border-slate-800 rounded-2xl hover:border-indigo-500/40 cursor-pointer transition-all">
                  <Paperclip size={24} className="text-slate-600 group-hover:text-indigo-400 mb-2" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">選択してアップロード</span>
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
                {mode === 'approval' && (
                  <>
                    {currentRoute.showDeptHead && <AccordItem title="所属長 (部長承認)" count={selectedDeptHead.length} isActive={activeAccord === '所属長'} onClick={() => setActiveAccord(activeAccord === '所属長' ? '' : '所属長')}>{renderMemberSelector(selectedDeptHead, setSelectedDeptHead, '部長')}</AccordItem>}
                    {currentRoute.showGM && <AccordItem title="本部長 (承認)" count={selectedGM.length} isActive={activeAccord === '本部長（承認）'} onClick={() => setActiveAccord(activeAccord === '本部長（承認）' ? '' : '本部長（承認）')}>{renderMemberSelector(selectedGM, setSelectedGM, '本部長')}</AccordItem>}
                    {currentRoute.showExec && <AccordItem title="社長 (最終決裁)" count={selectedExec.length} isActive={activeAccord === '社長'} onClick={() => setActiveAccord(activeAccord === '社長' ? '' : '社長')}>{renderMemberSelector(selectedExec, setSelectedExec, '社長')}</AccordItem>}
                    {currentRoute.showGeneralAffairs && <AccordItem title="総務管理本部" count={selectedGeneralAffairs.length} isActive={activeAccord === '総務管理本部'} onClick={() => setActiveAccord(activeAccord === '総務管理本部' ? '' : '総務管理本部')}>{renderMemberSelector(selectedGeneralAffairs, setSelectedGeneralAffairs, '総務')}</AccordItem>}
                  </>
                )}
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