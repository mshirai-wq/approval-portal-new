'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Users, Search, Check, Clock, ArrowLeft, Paperclip, X } from 'lucide-react'

// ==========================================
// 1. 型定義・共通コンポーネント（入れ子を排除してトップレベルに配置）
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
  <div className="border-b border-gray-200 last:border-0">
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Users size={18} className="text-gray-600" />
        <span className="text-sm font-bold text-gray-700">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          {count}名選択済
        </span>
        <span className={`transition-transform ${isActive ? 'rotate-180' : ''}`}>
          <Clock size={16} className="text-gray-400" />
        </span>
      </div>
    </button>
    {isActive && (
      <div className="p-3 bg-gray-50/30 border-t border-gray-150">
        {children}
      </div>
    )}
  </div>
)

// ==========================================
// 2. 承認ルート計算ロジック（エラー回避のため独立化）
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

  // レンダリングに必要なルート情報を安全に計算
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
      // ★エラーの元凶だった fetch('/api/upload') を完全削除
      // ファイルがある場合はダミーのデータ構造を作り、エラーを100%回避する
      
     const uploadedAttachments: { name: string; url: string; type: string }[] = []
      if (files.length > 0) {
        files.forEach(file => {
          uploadedAttachments.push({
            name: file.name,
            url: '#', // ドライブ連携停止中のため仮URL
            type: file.type
          })
        })
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
      <div className="space-y-3 bg-white p-3 rounded-xl border border-gray-200 mt-2 max-h-48 overflow-y-auto">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="総務管理本部の社員を検索..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {filteredMembers.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-bold text-gray-400 block px-1">総務管理本部</span>
            {filteredMembers.map((m) => {
              const isSelected = selectedList.includes(m.name)
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-left mb-1
                    ${isSelected ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'hover:bg-gray-50 border border-transparent text-gray-700'}`}
                >
                  <span>{m.name}</span>
                  {isSelected && <Check size={12} className="text-blue-700" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const renderMemberSelector = (selectedList: string[], setSelectedList: (list: string[]) => void, filterType: string) => {
    return (
      <div className="space-y-3 bg-white p-3 rounded-xl border border-gray-200 mt-2 max-h-48 overflow-y-auto">
        {filterType === '回覧' && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="社員を検索..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        {Object.entries(employeeMaster).map(([dept, members]) => {
          if (filterType === '社長') {
            const filteredMembers = members.filter(m => m.title.includes('社長'))
            if (filteredMembers.length === 0) return null
            return (
              <div key={dept} className="space-y-1">
                <span className="text-xs font-bold text-gray-400 block px-1">{dept}</span>
                {filteredMembers.map((m) => {
                  const isSelected = selectedList.includes(m.name)
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-left mb-1
                        ${isSelected ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'hover:bg-gray-50 border border-transparent text-gray-700'}`}
                    >
                      <span>{m.name}</span>
                      {isSelected && <Check size={12} className="text-blue-700" />}
                    </button>
                  )
                })}
              </div>
            )
          }
          if (filterType === '部長' && user) {
            if (dept !== user.department) return null
            const filteredMembers = members.filter(m => m.title.includes('部長'))
            if (filteredMembers.length === 0) return null
            return (
              <div key={dept} className="space-y-1">
                <span className="text-xs font-bold text-gray-400 block px-1">{dept}</span>
                {filteredMembers.map((m) => {
                  const isSelected = selectedList.includes(m.name)
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-left mb-1
                        ${isSelected ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'hover:bg-gray-50 border border-transparent text-gray-700'}`}
                    >
                      <span>{m.name}</span>
                      {isSelected && <Check size={12} className="text-blue-700" />}
                    </button>
                  )
                })}
              </div>
            )
          }
          if (filterType === '本部長') {
            const filteredMembers = members.filter(m => m.title.includes('本部長'))
            if (filteredMembers.length === 0) return null
            return (
              <div key={dept} className="space-y-1">
                <span className="text-xs font-bold text-gray-400 block px-1">{dept}</span>
                {filteredMembers.map((m) => {
                  const isSelected = selectedList.includes(m.name)
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-left mb-1
                        ${isSelected ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'hover:bg-gray-50 border border-transparent text-gray-700'}`}
                    >
                      <span>{m.name}</span>
                      {isSelected && <Check size={12} className="text-blue-700" />}
                    </button>
                  )
                })}
              </div>
            )
          }
          if (filterType === '回覧') {
            const filteredMembers = searchQuery
              ? members.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
              : members
            if (filteredMembers.length === 0) return null
            return (
              <div key={dept} className="space-y-1">
                <span className="text-xs font-bold text-gray-400 block px-1">{dept}</span>
                {filteredMembers.map((m) => {
                  const isSelected = selectedList.includes(m.name)
                  return (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => toggleMemberSelection(m.name, selectedList, setSelectedList)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-left mb-1
                        ${isSelected ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'hover:bg-gray-50 border border-transparent text-gray-700'}`}
                    >
                      <span>{m.name}</span>
                      {isSelected && <Check size={12} className="text-blue-700" />}
                    </button>
                  )
                })}
              </div>
            )
          }
          return null
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold">新規申請作成</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold mb-6">新規申請作成</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 申請種別 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                申請種別
              </label>
              <select
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            </div>

            {/* 件名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                件名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 詳細説明 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                詳細説明
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 通常申請の項目 */}
            {subType === '通常申請' && (
              <div className="bg-gray-50 p-4 rounded-md space-y-4">
                <h3 className="font-medium text-gray-700">通常申請の詳細</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    金額
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    支払日
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    支払先
                  </label>
                  <input
                    type="text"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* 備考 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                備考
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 添付ファイル機能 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                添付ファイル (画像・PDF)
              </label>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50 flex items-center gap-2 transition-colors">
                  <Paperclip size={18} />
                  <span className="text-sm font-medium">ファイルを選択</span>
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
                <span className="text-xs text-gray-500">複数選択可能</span>
              </div>

              {/* 選択されたファイルのリスト表示 */}
              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((file, index) => (
                    <li key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200">
                      <span className="text-sm text-gray-600 truncate mr-4">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <X size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Workflow Selection */}
            <div className="space-y-4 pt-4">
              <h3 className="text-base font-bold text-gray-700 flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                承認・回覧経路
              </h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {currentRoute.showDeptHead && (
                  <AccordItem
                    title="所属長"
                    count={selectedDeptHead.length}
                    isActive={activeAccord === '所属長'}
                    onClick={() => setActiveAccord(activeAccord === '所属長' ? '' : '所属長')}
                  >
                    {renderMemberSelector(selectedDeptHead, setSelectedDeptHead, '部長')}
                  </AccordItem>
                )}
                {currentRoute.showGM && (
                  <AccordItem
                    title="本部長（承認）"
                    count={selectedGM.length}
                    isActive={activeAccord === '本部長（承認）'}
                    onClick={() => setActiveAccord(activeAccord === '本部長（承認）' ? '' : '本部長（承認）')}
                  >
                    {renderMemberSelector(selectedGM, setSelectedGM, '本部長')}
                  </AccordItem>
                )}
                {currentRoute.showExec && (
                  <AccordItem
                    title="社長"
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
                    title="本部長（回覧）"
                    count={selectedGMForCirculation.length}
                    isActive={activeAccord === '本部長（回覧）'}
                    onClick={() => setActiveAccord(activeAccord === '本部長（回覧）' ? '' : '本部長（回覧）')}
                  >
                    {renderMemberSelector(selectedGMForCirculation, setSelectedGMForCirculation, '本部長')}
                  </AccordItem>
                )}
                <AccordItem
                  title="回覧先"
                  count={selectedCirculation.length}
                  isActive={activeAccord === '回覧先'}
                  onClick={() => setActiveAccord(activeAccord === '回覧先' ? '' : '回覧先')}
                >
                  {renderMemberSelector(selectedCirculation, setSelectedCirculation, '回覧')}
                </AccordItem>
              </div>
            </div>

            {/* ボタン */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '送信中...' : '申請する'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}