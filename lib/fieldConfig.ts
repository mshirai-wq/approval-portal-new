export interface FieldDef {
  key: string
  label: string
  default: boolean
}

export type FieldConfig = Record<string, Record<string, boolean>>

// 各申請種別で管理者が「必須/任意」を変更できる入力項目
export const FIELD_DEFINITIONS: Record<string, FieldDef[]> = {
  '通常申請': [
    { key: 'amount', label: '金額', default: false },
    { key: 'paymentDate', label: '支払予定日', default: false },
    { key: 'payee', label: '支払先', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '求人稟議（パート・アルバイト採用）': [
    { key: 'recruitmentDivision', label: '採用区分', default: true },
    { key: 'employmentType', label: '区分', default: true },
    { key: 'jobLocation', label: '配属現場名', default: false },
    { key: 'jobContent', label: '勤務内容', default: false },
    { key: 'workHours', label: '勤務時間', default: false },
    { key: 'workDays', label: '勤務曜日', default: false },
    { key: 'recruitmentUnitPrice', label: '募集単価', default: false },
    { key: 'postingDate', label: '掲載希望日', default: false },
    { key: 'recruitmentMedia', label: '募集媒体', default: false },
    { key: 'postingFee', label: '掲載費用', default: false },
    { key: 'salesAmount', label: '売上', default: false },
    { key: 'costAmount', label: '原価', default: false },
    { key: 'costRate', label: '原価率', default: false },
    { key: 'retireeName', label: '退職者氏名', default: false },
    { key: 'retireeDate', label: '退職（予定）日', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '求人稟議（キャリア・新卒採用）': [
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '代表者印捺印申請': [
    { key: 'amount', label: '金額', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '営業統轄本部長決裁見積申請（300万円未満）': [
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '社長決裁見積書申請（300万円以上）': [
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '協力会社登録': [
    { key: 'coCompanyName', label: '会社名', default: true },
    { key: 'coStartDate', label: '取引開始予定日', default: false },
    { key: 'coBackground', label: '知り得た経緯、発注予定の業務名', default: false },
    { key: 'coRegistrationFile', label: '協力会社登録票', default: false },
    { key: 'coFinancialStatements', label: '決算書（直近2年分）', default: false },
    { key: 'coInsuranceFile', label: '賠償保険写し', default: false },
    { key: 'coAntiSocialFile', label: '反社確約書', default: false },
    { key: 'coCompanyBrochure', label: '会社案内', default: false },
    { key: 'coLicenseFile', label: '許認可登録写し', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '出張旅費申請': [
    { key: 'tripStartDate', label: '出張開始日', default: false },
    { key: 'tripEndDate', label: '出張終了日', default: false },
    { key: 'transport', label: '利用交通機関（1行以上）', default: false },
    { key: 'accommodationNights', label: '宿泊日数', default: false },
    { key: 'accommodationUnitPrice', label: '宿泊単価', default: false },
    { key: 'businessHours', label: '業務対応時間', default: false },
    { key: 'dailyAllowanceDays', label: '日当（日数）', default: false },
    { key: 'dailyAllowanceUnitPrice', label: '日当単価', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '車両リース決済': [
    { key: 'leaseClassification', label: '分類', default: true },
    { key: 'leaseVendor', label: '業者', default: true },
    { key: 'leaseOtherVendor', label: '業者名（その他）', default: false },
    { key: 'leaseCarNumber', label: '登録車番', default: true },
    { key: 'leaseRequirements', label: '用件', default: true },
    { key: 'leaseCurrentAmount', label: '現在リース金額（月額）', default: false },
    { key: 'leaseNewAmount', label: '新リース金額（月額）', default: false },
    { key: 'leaseTerm', label: '期間', default: false },
    { key: 'leaseDeliveryDate', label: '納車希望日', default: false },
    { key: 'leaseExpiryDate', label: '期間満了日', default: false },
    { key: 'leaseMileage', label: '走行距離', default: false },
    { key: 'leaseEstimateFile', label: '見積等', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '給与情報変更申請': [
    { key: 'salaryCustomerName', label: '顧客名', default: false },
    { key: 'salarySiteName', label: '現場名', default: false },
    { key: 'salaryEmployeeNumber', label: '対象者社員番号（4桁）', default: false },
    { key: 'salaryEmployeeName', label: '対象者氏名', default: false },
    { key: 'salaryChangeDetails', label: '変更詳細情報（現状と変更後）', default: false },
    { key: 'salaryStartDate', label: '勤務変更の開始日', default: false },
    { key: 'salaryReason', label: '事由及び変更後の状況', default: false },
    { key: 'salaryLaborCostFile', label: '労務費積算表', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '退職者通知': [
    { key: 'retirementName', label: '退職者氏名', default: true },
    { key: 'retirementSite', label: '退職者所属現場', default: true },
    { key: 'retirementJobType', label: '職種', default: true },
    { key: 'retirementDate', label: '退職日', default: true },
    { key: 'retirementReason', label: '退職理由', default: true },
    { key: 'retirementResignationFile', label: '退職願', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '訃報連絡': [
    { key: 'obituaryType', label: '申請区分', default: true },
    { key: 'obituaryTargetName', label: '社員・お客様名', default: true },
    { key: 'obituarySite', label: '現場名', default: false },
    { key: 'obituaryDeceasedName', label: '故人名', default: true },
    { key: 'obituaryRelation', label: '社員との関係', default: true },
    { key: 'obituaryChiefMourner', label: '喪主名', default: false },
    { key: 'obituaryWakeDate', label: '通夜日時', default: false },
    { key: 'obituaryFuneralDate', label: '葬儀日時', default: false },
    { key: 'obituaryNoticeFile', label: '訃報案内', default: false },
    { key: 'obituaryVenue', label: '通夜・葬儀会場', default: false },
    { key: 'obituaryCondolencePostal', label: '弔電送付先 郵便番号', default: false },
    { key: 'obituaryCondolencePhone', label: '弔電送付先 電話番号', default: false },
    { key: 'obituaryCondolenceVenueName', label: '弔電送付先 会場名', default: false },
    { key: 'obituaryCondolenceAddress', label: '弔電送付先 住所', default: false },
    { key: 'obituaryCondolenceAmount', label: '香典金額', default: false },
    { key: 'obituaryRequest', label: '依頼事項', default: true },
    { key: 'obituaryAttendees', label: '当社参列者名', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
  '入札結果報告': [
    { key: 'biddingLocation', label: '入札執行場所', default: false },
    { key: 'biddingDate', label: '入札執行日', default: false },
    { key: 'biddingTime', label: '入札時間', default: false },
    { key: 'winnerName', label: '落札業者名', default: false },
    { key: 'winnerBid1', label: '第1回落札金額', default: false },
    { key: 'winnerBid2', label: '第2回落札金額', default: false },
    { key: 'ourBid1', label: '第1回入札金額（自社）', default: false },
    { key: 'ourBid2', label: '第2回入札金額（自社）', default: false },
    { key: 'participants', label: '参加業者（1社以上）', default: false },
    { key: 'prevWinnerName', label: '前年度落札業者', default: false },
    { key: 'prevWinnerAmount', label: '前年度落札金額', default: false },
    { key: 'description', label: '内容説明', default: false },
    { key: 'remarks', label: '備考', default: false },
    { key: 'attachments', label: '添付ファイル', default: false },
  ],
}

export function getDefaultFieldConfig(): FieldConfig {
  const config: FieldConfig = {}
  for (const [subType, fields] of Object.entries(FIELD_DEFINITIONS)) {
    config[subType] = {}
    for (const field of fields) {
      config[subType][field.key] = field.default
    }
  }
  return config
}

export function mergeFieldConfig(saved: FieldConfig | null | undefined): FieldConfig {
  const config = getDefaultFieldConfig()
  if (!saved) return config
  for (const [subType, subConfig] of Object.entries(saved)) {
    if (config[subType]) {
      for (const [key, value] of Object.entries(subConfig)) {
        if (config[subType][key] !== undefined) {
          config[subType][key] = !!value
        }
      }
    }
  }
  return config
}

export function isFieldRequired(
  config: FieldConfig | null | undefined,
  subType: string,
  key: string
): boolean {
  const defs = FIELD_DEFINITIONS[subType]
  const def = defs?.find(f => f.key === key)
  if (!def) return false
  const subConfig = config?.[subType]
  if (subConfig && key in subConfig) return !!subConfig[key]
  return def.default
}

export function getFieldLabel(subType: string, key: string): string {
  return FIELD_DEFINITIONS[subType]?.find(f => f.key === key)?.label || key
}
