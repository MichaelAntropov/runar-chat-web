<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'

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
  <div class="d-flex justify-content-center gap-2">
    <input
      v-for="(_, i) in length"
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
    <button class="btn btn-outline-secondary eye-box" @click="togglePasswordVisibility()">
      <i v-if="passwordVisible" class="bi bi-eye-slash"></i>
      <i v-else class="bi bi-eye"></i>
    </button>
  </div>
</template>

<style scoped>
.pin-box {
  width: 45px;
  height: 55px;
  text-align: center;
  font-size: 1.5rem;
  font-weight: bold;
}
.eye-box {
  min-width: 45px;
  height: 55px;
  font-size: 1.5rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
</style>
