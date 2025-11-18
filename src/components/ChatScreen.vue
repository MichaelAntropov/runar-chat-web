<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import SideBarContent from './SideBarContent.vue'
import ChatView from './ChatView.vue'
import LoadingOverlay from './LoadingOverlay.vue'
import { useDeviceStore } from '@/device/deviceStore'
import { useConnectionStore } from '@/connection/connectionStore'

const deviceStore = useDeviceStore()
useConnectionStore()

const sidebarWidth: Ref<number> = ref(400)
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
</script>

<template>
  <div class="">
    <div ref="sidebar" class="sidebar">
      <SideBarContent />
      <div class="resizer" @mousedown.prevent="startResize"></div>
    </div>

    <!-- Main Content Area -->
    <div class="content flex-grow-1 p-0 vh-100">
      <div class="d-flex align-items-start flex-column mb-3 h-100">
        <ChatView />
      </div>
    </div>
  </div>

  <LoadingOverlay v-if="!deviceStore.isRegistered || deviceStore.isLoading" />
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
</style>
