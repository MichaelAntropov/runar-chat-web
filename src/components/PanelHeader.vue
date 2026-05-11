<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  panel: string
  canGoBack: boolean
}>()

const emit = defineEmits(['back'])
const { t } = useI18n()
</script>

<template>
  <div class="p-3 d-flex align-items-center">
    <button
      v-if="canGoBack"
      class="btn link-body-emphasis me-2 btn-back"
      aria-label="Go back"
      type="button"
      @click="emit('back')"
    >
      <i class="bi bi-arrow-left btn-back__icon"></i>
    </button>
    <strong class="text-capitalize">{{ t('sidebar.panel-header.' + panel) }}</strong>
  </div>
</template>

<style scoped>
.btn-back {
  padding: 0.375rem 0.5rem;
  line-height: 1;
}

.btn-back__icon {
  font-size: 1.4rem;
  line-height: 1;
}

.btn-back:hover {
  background-color: var(--bs-secondary-bg);
}
</style>
