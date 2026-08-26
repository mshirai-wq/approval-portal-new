'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { FIELD_DEFINITIONS, FieldConfig, FieldDef, CustomFieldDefinitions, HiddenDefaults, getDefaultFieldConfig, mergeFieldConfig, mergeCustomFields, mergeHiddenDefaults, getDefaultCustomFields } from '@/lib/fieldConfig'
import { ArrowLeft, Save, Shield, AlertCircle, CheckCircle2, Plus, Trash2 } from 'lucide-react'

const FIELD_TYPES: { value: NonNullable<FieldDef['type']>; label: string }[] = [
  { value: 'text', label: 'テキスト' },
  { value: 'number', label: '数値' },
  { value: 'date', label: '日付' },
  { value: 'textarea', label: '複数行テキスト' },
  { value: 'file', label: 'ファイル' },
]

function generateKey(label: string): string {
  const base = label
    .normalize('NFKC')
    .replace(/[\s・／/\\()（）［］\[\]]+/g, '_')
    .replace(/[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '')
    .slice(0, 20)
  return base ? `custom_${base}_${Date.now().toString(36).slice(-4)}` : `custom_${Date.now().toString(36)}`
}

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
  const [customFields, setCustomFields] = useState<CustomFieldDefinitions>(getDefaultCustomFields())
  const [hiddenDefaults, setHiddenDefaults] = useState<HiddenDefaults>(mergeHiddenDefaults(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newFieldBySubType, setNewFieldBySubType] = useState<Record<string, { label: string; type: NonNullable<FieldDef['type']> }>>({})

  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      router.push('/dashboard')
    }
  }, [user, authLoading, isAdmin, router])

  useEffect(() => {
    if (authLoading || !user || !isAdmin) return
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'fieldConfig'))
        const data = snap.exists() ? snap.data() as { configs?: FieldConfig; customFields?: CustomFieldDefinitions; hiddenDefaults?: HiddenDefaults } : {}
        setConfig(mergeFieldConfig(data.configs))
        setCustomFields(mergeCustomFields(data.customFields))
        setHiddenDefaults(mergeHiddenDefaults(data.hiddenDefaults))
      } catch (err) {
        console.error('Error fetching field config:', err)
        setMessage({ type: 'error', text: '設定の読み込みに失敗しました。デフォルト値を表示しています。' })
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [authLoading, user, isAdmin])

  const toggleField = (subType: string, key: string) => {
    setConfig(prev => ({
      ...prev,
      [subType]: {
        ...prev[subType],
        [key]: !prev[subType][key]
      }
    }))
  }

  const deleteDefaultField = (subType: string, key: string) => {
    setHiddenDefaults(prev => {
      const keys = new Set(prev[subType] || [])
      keys.add(key)
      return { ...prev, [subType]: Array.from(keys) }
    })
  }

  const restoreDefaultField = (subType: string, key: string) => {
    setHiddenDefaults(prev => {
      const keys = (prev[subType] || []).filter(k => k !== key)
      return { ...prev, [subType]: keys }
    })
  }

  const addCustomField = (subType: string) => {
    const newField = newFieldBySubType[subType]
    if (!newField?.label.trim()) return
    const key = generateKey(newField.label)
    setCustomFields(prev => ({
      ...prev,
      [subType]: [
        ...(prev[subType] || []),
        { key, label: newField.label.trim(), default: false, type: newField.type, custom: true }
      ]
    }))
    setConfig(prev => ({
      ...prev,
      [subType]: {
        ...prev[subType],
        [key]: false
      }
    }))
    setNewFieldBySubType(prev => ({ ...prev, [subType]: { label: '', type: 'text' } }))
  }

  const removeCustomField = (subType: string, index: number) => {
    setCustomFields(prev => {
      const fields = [...(prev[subType] || [])]
      const removed = fields.splice(index, 1)[0]
      if (removed) {
        setConfig(cfg => {
          const sub = { ...cfg[subType] }
          delete sub[removed.key]
          return { ...cfg, [subType]: sub }
        })
      }
      return { ...prev, [subType]: fields }
    })
  }

  const updateCustomFieldLabel = (subType: string, index: number, label: string) => {
    setCustomFields(prev => {
      const fields = [...(prev[subType] || [])]
      if (fields[index]) fields[index] = { ...fields[index], label }
      return { ...prev, [subType]: fields }
    })
  }

  const updateCustomFieldType = (subType: string, index: number, type: NonNullable<FieldDef['type']>) => {
    setCustomFields(prev => {
      const fields = [...(prev[subType] || [])]
      if (fields[index]) fields[index] = { ...fields[index], type }
      return { ...prev, [subType]: fields }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await setDoc(doc(db, 'settings', 'fieldConfig'), {
        configs: config,
        customFields,
        hiddenDefaults,
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
          各申請種別ごとに、送信時に必須とする入力項目を ON/OFF で切り替えられます。元からある項目を削除すると作成画面に表示されなくなります。「追加項目」から自由に入力欄を追加・削除できます。保存すると作成画面に即時反映されます。
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {subTypeOrder.map(subType => {
            const hiddenKeys = new Set(hiddenDefaults[subType] || [])
            const defaultFields = (FIELD_DEFINITIONS[subType] || []).filter(f => !hiddenKeys.has(f.key))
            const restoredFields = (FIELD_DEFINITIONS[subType] || []).filter(f => hiddenKeys.has(f.key))
            const customList = customFields[subType] || []
            const newField = newFieldBySubType[subType] || { label: '', type: 'text' as NonNullable<FieldDef['type']> }

            return (
              <section key={subType} className="bg-slate-900/40 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="font-bold text-slate-100 text-sm">{subType}</h2>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {defaultFields.length + customList.length} 項目
                  </span>
                </div>
                <div className="divide-y divide-slate-800">
                  {defaultFields.map(field => (
                    <div key={field.key} className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/40 transition-colors">
                      <span className="text-sm text-slate-300">{field.label}</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => deleteDefaultField(subType, field.key)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!config[subType]?.[field.key]}
                            onChange={() => toggleField(subType, field.key)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-700 peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                        </label>
                      </div>
                    </div>
                  ))}
                  {customList.map((field, index) => (
                    <div key={field.key} className="px-5 py-3 hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateCustomFieldLabel(subType, index, e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                          placeholder="項目名"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomField(subType, index)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <select
                          value={field.type || 'text'}
                          onChange={(e) => updateCustomFieldType(subType, index, e.target.value as NonNullable<FieldDef['type']>)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                        >
                          {FIELD_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!config[subType]?.[field.key]}
                            onChange={() => toggleField(subType, field.key)}
                            className="rounded border-slate-600 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                          />
                          必須
                        </label>
                      </div>
                    </div>
                  ))}
                  {restoredFields.length > 0 && (
                    <div className="px-5 py-3 bg-slate-900/30 border-t border-dashed border-slate-800">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">削除済み（元に戻す）</p>
                      <div className="flex flex-wrap gap-2">
                        {restoredFields.map(field => (
                          <button
                            key={field.key}
                            type="button"
                            onClick={() => restoreDefaultField(subType, field.key)}
                            className="text-xs px-2 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            {field.label} を戻す
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="px-5 py-3 bg-slate-900/30">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={newField.label}
                        onChange={(e) => setNewFieldBySubType(prev => ({ ...prev, [subType]: { ...newField, label: e.target.value } }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(subType) } }}
                        placeholder="新しい項目名"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                      <select
                        value={newField.type}
                        onChange={(e) => setNewFieldBySubType(prev => ({ ...prev, [subType]: { ...newField, type: e.target.value as NonNullable<FieldDef['type']> } }))}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                      >
                        {FIELD_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => addCustomField(subType)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-indigo-400 border border-dashed border-indigo-500/30 rounded-lg hover:bg-indigo-500/10 transition-colors"
                    >
                      <Plus size={16} />
                      追加項目
                    </button>
                  </div>
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
