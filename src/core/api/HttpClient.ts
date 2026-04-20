import { useUserStore } from '@/user/userStore'
import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000,
})

http.interceptors.request.use(
  async (config) => {
    const userStore = useUserStore()

    if (userStore.authStatus === 'pre-upgrade') {
      const token = userStore.authUpgradeToken
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }

    if (userStore.authStatus === 'upgraded') {
      const token = await userStore.getAccessToken()
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error),
)

http.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('HttpClient - API error:', error)
    throw error
  },
)
