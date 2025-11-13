import { useUserStore } from '@/user/UserStorage'
import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000,
})

http.interceptors.request.use(
  async (config) => {
    const userStore = useUserStore()
    const token = await userStore.getAccessToken()

    if (token) {
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
