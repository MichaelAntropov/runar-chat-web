import { createRouter, createWebHistory } from 'vue-router'
import LandingScreen from '@/components/LandingScreen.vue'
import LoginScreen from '@/components/LoginScreen.vue'
import ChatScreen from '@/components/ChatScreen.vue'
import { useUserStore } from './user/userStore'
import RegistrationScreen from './components/RegistrationScreen.vue'

const routes = [
  { name: 'LandingScreen', path: '/', component: LandingScreen },
  { name: 'LoginScreen', path: '/login', component: LoginScreen },
  { name: 'RegistrationScreen', path: '/register', component: RegistrationScreen },
  { name: 'ChatScreen', path: '/chat', component: ChatScreen, meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth === true && !userStore.isAuthenticated) {
    return { path: '/login' }
  }

  if (to.path === '/login' && userStore.isAuthenticated) {
    return { path: '/chat' }
  }

  if (to.path === '/register' && userStore.isAuthenticated) {
    return { path: '/chat' }
  }
})

export default router
