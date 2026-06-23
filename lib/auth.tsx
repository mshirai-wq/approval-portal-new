'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

interface User {
  id: string
  name: string
  email: string
  title: string
  department: string
}

interface AuthContextType {
  user: User | null
  firebaseUser: FirebaseUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signUp: (email: string, password: string, name: string, title: string, department: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser)
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.email!))
          if (userDoc.exists()) {
            setUser(userDoc.data() as User)
          } else {
            setUser(null)
          }
        } catch (error) {
          console.error('Error fetching user data:', error)
          setUser(null)
        }
      } else {
        setUser(null)
      }
      
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error: any) {
      console.error('Sign in error:', error)
      throw new Error(error.message || 'ログインに失敗しました')
    }
  }

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', result.user.email!))
      if (!userDoc.exists()) {
        // User not in employee master, sign out
        await firebaseSignOut(auth)
        throw new Error('社員マスタに登録されていません。管理者にお問い合わせください。')
      }
      
      // User exists, authentication successful
    } catch (error: any) {
      console.error('Google sign in error:', error)
      throw new Error(error.message || 'Googleログインに失敗しました')
    }
  }

  const signUp = async (email: string, password: string, name: string, title: string, department: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password)
      
      // Create user document in Firestore
      await setDoc(doc(db, 'users', email), {
        id: email,
        name,
        email,
        title,
        department,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    } catch (error: any) {
      console.error('Sign up error:', error)
      throw new Error(error.message || 'アカウント作成に失敗しました')
    }
  }

  const signOut = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (error: any) {
      console.error('Sign out error:', error)
      throw new Error(error.message || 'ログアウトに失敗しました')
    }
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signInWithGoogle, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
