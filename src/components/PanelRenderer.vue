<script setup lang="ts">
import { computed } from 'vue'
import SettingsPanel from './settings/SettingsPanel.vue'
import ChatsPanel from './ChatsPanel.vue'
import MyProfilePanel from './MyProfilePanel.vue'
import ThemeSettingsPanel from './settings/ThemeSettingsPanel.vue'
import LanguageSettingsPanel from './settings/LanguageSettingsPanel.vue'
import DevicesSettingsPanel from './settings/DevicesSettingsPanel.vue'
import PrivacyAndSecurityPanel from './settings/PrivacyAndSecurityPanel.vue'

const props = defineProps<{
  stack: string[]
}>()

const emit = defineEmits(['navigate', 'open-chat'])

const activeIndex = computed(() => props.stack.length - 1)

const resolveComponent = (panel: string) => {
  switch (panel) {
    case 'chats':
      return ChatsPanel
    case 'my-profile':
      return MyProfilePanel
    case 'settings':
      return SettingsPanel
    case 'devices':
      return DevicesSettingsPanel
    case 'theme':
      return ThemeSettingsPanel
    case 'language':
      return LanguageSettingsPanel
    case 'privacy-and-security':
      return PrivacyAndSecurityPanel
  }
}
</script>

<template>
  <div class="h-100 overflow-hidden position-relative">
    <!-- Sliding track -->
    <div
      class="d-flex"
      :style="{
        transform: `translateX(-${activeIndex * 100}%)`,
        transition: 'transform 0.3s ease',
      }"
    >
      <component
        v-for="(panel, index) in stack"
        :key="index"
        :is="resolveComponent(panel)"
        class="w-100 flex-shrink-0"
        @navigate="emit('navigate', $event)"
        @open-chat="emit('open-chat')"
      />
    </div>
  </div>
</template>
