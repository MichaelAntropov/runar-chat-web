import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000,
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('HttpClient - API error:', error)
    throw error
  },
)
