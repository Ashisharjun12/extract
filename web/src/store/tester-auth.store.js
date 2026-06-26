import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { testerCheckSession, testerLogin, testerLogout } from '@/api/test-backend'
import { mapApiError } from '@/api/client'

export const useTesterAuth = create(
  persist(
    (set, get) => ({
      token: '',
      isAuthenticated: false,
      loading: false,

      login: async (password) => {
        const trimmed = password.trim()
        if (!trimmed) throw new Error('Password is required.')
        set({ loading: true })
        try {
          const payload = await testerLogin(trimmed)
          const token = payload?.token ?? ''
          if (!token) throw new Error('No token received from server.')
          set({ token, isAuthenticated: true, loading: false })
        } catch (error) {
          set({ loading: false })
          throw new Error(error.message ?? mapApiError(error))
        }
      },

      logout: async () => {
        try {
          await testerLogout()
        } finally {
          set({ token: '', isAuthenticated: false })
        }
      },

      checkSession: async () => {
        const { token } = get()
        if (!token) { set({ isAuthenticated: false }); return false }
        try {
          await testerCheckSession()
          set({ isAuthenticated: true })
          return true
        } catch {
          set({ token: '', isAuthenticated: false })
          return false
        }
      },
    }),
    {
      name: 'tester-auth',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
