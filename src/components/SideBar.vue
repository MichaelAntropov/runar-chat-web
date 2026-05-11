<script setup lang="ts">
import { ref, computed } from 'vue'
import PanelHeader from './PanelHeader.vue'
import PanelRenderer from './PanelRenderer.vue'

const emit = defineEmits(['open-chat'])

// stack supports deep navigation
const stack = ref<string[]>(['chats'])

const currentPanelIsChats = computed(() => stack.value.length === 1 && stack.value[0] === 'chats')
const currentPanel = computed(() => stack.value[stack.value.length - 1])
const canGoBack = computed(() => stack.value.length > 1)

const navigate = (panel: string) => {
  stack.value.push(panel)
}

const goBack = () => {
  if (canGoBack.value) stack.value.pop()
}
</script>

<template>
  <div class="d-flex flex-column h-100">
    <PanelHeader
      v-if="!currentPanelIsChats"
      :panel="currentPanel"
      :canGoBack="canGoBack"
      @back="goBack"
    />

    <PanelRenderer :stack="stack" @navigate="navigate" @open-chat="emit('open-chat')" />
  </div>
</template>
