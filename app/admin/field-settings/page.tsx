'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { FIELD_DEFINITIONS, FieldConfig, getDefaultFieldConfig, mergeFieldConfig } from '@/lib/fieldConfig'
import { ArrowLeft, Save, Shield, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function FieldSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const isAdmin = user?.email === 'm.shirai@yunia.co.jp'

  const subTypeOrder = useMemo(() => [
    '通常申請',
    '求人稟議（パート・アルバイト採用）',
    '求人稟議（キャリア・新卒採用）',
    '代表者印捺印申請',
    '営業統轄本部長決裁見積申請（300万円未満）',
    '社長決裁見積書申請（300万円以上）',
    '協力会社登録',
    '出張旅費申請',
    '車両リース決済',
    '給与情報変更申請',
    '退職者通知',
    '訃報連絡',
    '入札結果報告',
  ], [])

  const [config, setConfig] = useState<FieldConfig>(getDefaultFieldConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      router.push('/dashboard')
    }
  }, [user, authLoading, isAdmin, router])

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'fieldConfig'))
        const saved = snap.exists() ? (snap.data() as { configs?: FieldConfig }).configs : null
        setConfig(mergeFieldConfig(saved))
      } catch (err) {
        console.error('Error fetching field config:', err)
        setMessage({ type: 'error', text: '設定の読み込みに失敗しました。デフォルト値を表示しています。' })
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const toggleField = (subType: string, key: string) => {
    setConfig(prev => ({
      ...prev,
      [subType]: {
        ...prev[subType],
        [key]: !prev[subType][key]
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await setDoc(doc(db, 'settings', 'fieldConfig'), {
        configs: config,
        updatedAt: serverTimestamp()
      })
      setMessage({ type: 'success', text: '必須項目設定を保存しました' })
    } catch (err) {
      console.error('Error saving field config:', err)
      setMessage({ type: 'error', text: '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft size={20} className="text-slate-400" />
            </button>
            <h1 className="text-lg font-black tracking-widest uppercase flex items-center gap-2">
              <Shield size={20} className="text-indigo-500" />
              必須項目設定
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-50 font-bold px-5 py-2 rounded-xl flex items-center gap-2 text-sm transition-all"
          >
            {saving ? <div className="w-4 h-4 border-2 border-slate-50/20 border-t-slate-50 rounded-full animate-spin" /> : <Save size={16} />}
            保存
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {message && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
            {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        )}

        <p className="text-sm text-slate-400">
          各申請種別ごとに、送信時に必須とする入力項目を ON/OFF で切り替えられます。保存すると作成画面に即時反映されます。
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {subTypeOrder.map(subType => {
            const fields = FIELD_DEFINITIONS[subType] || []
            return (
              <section key={subType} className="bg-slate-900/40 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="font-bold text-slate-100 text-sm">{subType}</h2>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {fields.length} 項目
                  </span>
                </div>
                <div className="divide-y divide-slate-800">
                  {fields.map(field => (
                    <label key={field.key} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer">
                      <span className="text-sm text-slate-300">{field.label}</span>
                      <div className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={!!config[subType]?.[field.key]}
                          onChange={() => toggleField(subType, field.key)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-50 font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all"
          >
            {saving ? <div className="w-4 h-4 border-2 border-slate-50/20 border-t-slate-50 rounded-full animate-spin" /> : <Save size={18} />}
            保存する
          </button>
        </div>
      </main>
    </div>
  )
}
