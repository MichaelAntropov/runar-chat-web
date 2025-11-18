import { createApp } from 'vue'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap'
import 'bootstrap-icons/font/bootstrap-icons.css'
import router from './router'
import { useUserStore } from './user/userStore'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createPinia } from 'pinia'

const app = createApp(App)
app.use(router)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

const userStore = useUserStore()

userStore.$subscribe((mutation, state) => {
  if (state.isAuthenticated === false) {
    router.push('/login')
  }
})

app.mount('#app')
