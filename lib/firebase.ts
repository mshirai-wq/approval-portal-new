import { initializeApp, getApps } from 'firebase/app'
import {
  Auth,
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

function getOrInitializeAuth(): Auth {
  // SSR では indexedDB が使えないため、メモリ内永続化にフォールバックする
  const isSSR = typeof window === 'undefined'
  const persistence = isSSR
    ? inMemoryPersistence
    : [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence]

  try {
    return initializeAuth(app, {
      persistence,
      popupRedirectResolver: isSSR ? undefined : browserPopupRedirectResolver,
    })
  } catch {
    return getAuth(app)
  }
}

export const auth = getOrInitializeAuth()
export const db = getFirestore(app)
export const storage = getStorage(app)
