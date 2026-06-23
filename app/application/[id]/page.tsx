// app/application/[id]/page.tsx
import ApplicationDetailClient from './ApplicationDetailClient'

// ここにCloudflare用のEdge設定を書きます！
export const runtime = 'edge';

export default function Page() {
  // 子供のコンポーネントを呼び出すだけ
  return <ApplicationDetailClient />
}