import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { validateApiKey } from '@/api/admin'
import { mapApiError } from '@/api/client'

export const useAdminAuth = create(
  persist(
    (set) => ({
      apiKey: '',
      isAuthenticated: false,
      loading: false,

      login: async (key) => {
        const trimmed = key.trim()
        if (!trimmed) throw new Error('Admin API key is required.')
        set({ loading: true })
        try {
          await validateApiKey(trimmed)
          set({ apiKey: trimmed, isAuthenticated: true, loading: false })
        } catch (error) {
          set({ loading: false })
          throw new Error(mapApiError(error))
        }
      },

      logout: () => {
        set({ apiKey: '', isAuthenticated: false })
      },
    }),
    {
      name: 'admin-auth',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
