<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

// Props so that parent is required to specify length and its only one way data flow
const props = defineProps<{
  length: number
}>()

// Model so that data flows both ways
const modelValue = defineModel<string>()
const focusReady = defineModel<boolean>('focusReady')

// Custom event
const emit = defineEmits<{
  complete: [fullPin: string]
}>()

const inputRefs = ref<HTMLInputElement[]>([])
const pinArray = reactive<Array<string>>(Array(props.length).fill(''))
const pinGroups = computed(() => {
  const groupSize = Math.ceil(props.length / 2)

  return Array.from({ length: 2 }, (_, groupIndex) => {
    const startIndex = groupIndex * groupSize
    const groupLength = Math.max(Math.min(groupSize, props.length - startIndex), 0)

    return Array.from({ length: groupLength }, (_, index) => startIndex + index)
  }).filter((group) => group.length > 0)
})

watch(
  () => pinArray,
  (newVal) => {
    modelValue.value = newVal.join('')
    if (newVal.every((char) => char !== '')) {
      emit('complete', newVal.join(''))
    }
  },
  { deep: true },
)

const handleInput = (e: Event, index: number) => {
  const target = e.target as HTMLInputElement
  const val = target.value.slice(-1)

  if (val.match(/[A-Za-z0-9]/)) {
    pinArray[index] = val
    if (index < props.length - 1) {
      inputRefs.value[index + 1].focus()
    }
  } else {
    pinArray[index] = ''
  }
}

const handleKeyDown = (e: KeyboardEvent, index: number) => {
  if (e.key === 'Backspace') {
    if (pinArray[index] === '' && index > 0) {
      inputRefs.value[index - 1].focus()
      pinArray[index - 1] = ''
    } else {
      pinArray[index] = ''
    }
  }
}

const passwordVisible = ref(false)
function togglePasswordVisibility() {
  passwordVisible.value = !passwordVisible.value
}

onMounted(() => {
  inputRefs.value[0].focus()
})

// Needed in case of modals, as due to animation the focus might be
// attempted after component is mounted but before the input
// is actually visible & focusable
watch(focusReady, (newVal) => {
  if (newVal) {
    inputRefs.value[0].focus()
  }
})
</script>

<template>
  <div class="pin-input">
    <div class="pin-fields">
      <div v-for="(group, groupIndex) in pinGroups" :key="groupIndex" class="pin-group">
        <input
          v-for="i in group"
          :key="i"
          :id="`pin-input-${i}`"
          ref="inputRefs"
          :type="passwordVisible ? 'text' : 'password'"
          class="form-control pin-box"
          maxlength="1"
          v-model="pinArray[i]"
          @input="handleInput($event, i)"
          @keydown="handleKeyDown($event, i)"
        />
      </div>
    </div>
    <button
      type="button"
      class="btn btn-outline-secondary w-100 eye-box"
      @click="togglePasswordVisibility()"
    >
      <i v-if="passwordVisible" class="bi bi-eye-slash"></i>
      <i v-else class="bi bi-eye"></i>
    </button>
  </div>
</template>

<style scoped>
.pin-box {
  flex: 1 1 0;
  min-width: 0;
  width: 45px;
  max-width: 45px;
  height: 55px;
  padding-left: 0;
  padding-right: 0;
  text-align: center;
  font-size: clamp(1.1rem, 6vw, 1.5rem);
  font-weight: bold;
}

.pin-input {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  gap: clamp(0.125rem, 1vw, 0.5rem);
}

.pin-fields,
.pin-group {
  display: flex;
  align-items: center;
}

.pin-fields {
  gap: clamp(0.125rem, 1vw, 0.5rem);
}

.pin-group {
  gap: clamp(0.125rem, 1vw, 0.5rem);
}

@media (min-width: 576px) {
  .eye-box {
    flex: 0 0 clamp(36px, 12vw, 45px);
    width: clamp(36px, 12vw, 45px);
    min-width: 0;
    height: 55px;
    padding: 0;
    font-size: clamp(1.1rem, 6vw, 1.5rem);
  }
}

@media (max-width: 575.98px) {
  .pin-input {
    flex-direction: column;
    gap: 0.75rem;
  }

  .pin-fields {
    flex-direction: column;
    width: 100%;
    justify-content: center;
    gap: 0.75rem;
  }

  .pin-group {
    flex: 0 1 auto;
    min-width: 0;
    width: 100%;
    justify-content: center;
    gap: clamp(0.5rem, 1.5vw, 0.5rem);
  }

  .pin-box {
    width: 100%;
    max-width: 55px;
    height: 50px;
  }

  .eye-box {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
  }
}
</style>
