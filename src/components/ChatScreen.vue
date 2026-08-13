<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

import { useChatsStore } from '@/chat/chatStore'
import { useConnectionStore } from '@/connection/connectionStore'
import { useDbStore } from '@/db/dbStore'
import { useDeviceStore } from '@/device/deviceStore'
import { usePresenceStore } from '@/presence/presenceStore'

import ChatView from './ChatView.vue'
import DbEncryptionModal from './DbEncryptionModal.vue'
import LoadingOverlay from './LoadingOverlay.vue'
import SideBar from './SideBar.vue'

const chatStore = useChatsStore()
const deviceStore = useDeviceStore()
const dbStore = useDbStore()
useConnectionStore()
usePresenceStore()

onMounted(() => {
  checkScreen()
  window.addEventListener('resize', checkScreen)

  dbStore.init()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreen)
  stopResize()
  chatStore.closeCurrentChat()
})

const isMobile = ref(false)
const activeMobileView = ref<'sidebar' | 'chat'>('sidebar')

const checkScreen = () => {
  const nextIsMobile = window.innerWidth < 768

  if (nextIsMobile && !isMobile.value) {
    activeMobileView.value = chatStore.currentChat ? 'chat' : 'sidebar'
  }

  isMobile.value = nextIsMobile
}

function openChat() {
  activeMobileView.value = 'chat'
}

function backToSidebar() {
  activeMobileView.value = 'sidebar'
  chatStore.closeCurrentChat()
}

const sidebarWidth: Ref<number> = ref(460)
const isResizing: Ref<boolean> = ref(false)

function resizeSidebar(event: MouseEvent) {
  if (isResizing.value) {
    const newWidth = event.clientX
    if (newWidth > 250 && newWidth < 800) {
      sidebarWidth.value = newWidth
    }
  }
}

function startResize() {
  isResizing.value = true
  document.addEventListener('mousemove', resizeSidebar)
  document.addEventListener('mouseup', stopResize)
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', resizeSidebar)
  document.removeEventListener('mouseup', stopResize)
}

const showSidebar = computed(() => (isMobile.value ? activeMobileView.value === 'sidebar' : true))

const showChat = computed(() => (isMobile.value ? activeMobileView.value === 'chat' : true))

const transitionName = computed(() =>
  activeMobileView.value === 'chat' ? 'slide-left' : 'slide-right',
)

watch(
  () => chatStore.currentChat,
  (chat) => {
    if (isMobile.value && chat) {
      activeMobileView.value = 'chat'
    }
  },
)
</script>

<template>
  <LoadingOverlay v-if="!deviceStore.isRegistered || deviceStore.isLoading" />
  <DbEncryptionModal
    v-if="dbStore.dbStatus === 'setup-required' || dbStore.dbStatus === 'unlock-required'"
  />

  <div v-if="dbStore.dbStatus == 'ready'" class="d-flex vh-100 overflow-hidden">
    <div v-if="isMobile" class="w-100 h-100 position-relative overflow-hidden">
      <!-- Here goes mobile friendly logic -->
      <Transition :name="transitionName">
        <div class="w-100 h-100 position-absolute top-0 start-0" :key="activeMobileView">
          <component
            :is="activeMobileView === 'sidebar' ? SideBar : ChatView"
            :isMobile="true"
            @open-chat="openChat"
            @back="backToSidebar"
          />
        </div>
      </Transition>
    </div>
    <div v-else class="d-flex w-100 h-100">
      <div
        v-if="showSidebar"
        class="border-end position-relative"
        :style="!isMobile ? { width: sidebarWidth + 'px' } : { width: '100%' }"
      >
        <SideBar @open-chat="openChat" />
        <!-- Resize handle (desktop only) -->
        <div v-if="!isMobile" class="resizer" @mousedown.prevent="startResize"></div>
      </div>
      <div v-if="showChat" class="flex-grow-1">
        <ChatView :isMobile="isMobile" @back="backToSidebar" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: v-bind(sidebarWidth + 'px');
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  border-right: 1px solid;
}
.resizer {
  width: 5px;
  height: 100%;
  cursor: ew-resize;
  opacity: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 100;
}
.content {
  margin-left: v-bind(sidebarWidth + 'px');
}

/* 1. Single source of truth for transition settings */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  --slide-duration: 0.3s;
  --slide-easing: cubic-bezier(0.4, 0, 0.2, 1);

  position: absolute;
  width: 100%;
  height: 100%;
  transition: transform var(--slide-duration) var(--slide-easing);
}

/* 2. Resting states (Center screen) */
.slide-left-enter-to,
.slide-left-leave-from,
.slide-right-enter-to,
.slide-right-leave-from {
  transform: translateX(0%);
}

/* 3. Off-screen RIGHT (Entering forward, or Leaving backward) */
.slide-left-enter-from, /* Chat starts off-screen right */
.slide-right-leave-to {
  /* Chat goes back off-screen right */
  transform: translateX(100%);
}

/* 4. Off-screen LEFT (Leaving forward, or Entering backward) */
.slide-left-leave-to,     /* Sidebar pushed off-screen left */
.slide-right-enter-from {
  /* Sidebar pulled from off-screen left */
  transform: translateX(-100%); /* Changed from -30% to -100% for strict symmetry */
}
</style>
