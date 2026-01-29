<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from './theme/useTheme'

const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <RouterView />
</template>
