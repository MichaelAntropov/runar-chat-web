<script setup lang="ts">
import type { Chat } from '@/chat/interfaces/chat/Chat'
import { useChatsStore } from '@/chat/chatStore'
import { computed, type ComputedRef } from 'vue'

const props = defineProps<{
  chat: Chat
}>()

const chatStore = useChatsStore()

const isSelected: ComputedRef<boolean> = computed(() => {
  return chatStore.currentChat?.id === props.chat.id
})

function changeCurrentChat(chatId: string) {
  if (chatStore.currentChat?.id !== chatId) {
    chatStore.changeCurrentChat(chatId)
  }
}
</script>

<template>
  <a
    class="list-group-item list-group-item-action d-flex flex-row"
    :class="isSelected ? 'list-group-item-dark' : ''"
    @click="changeCurrentChat(chat.id)"
  >
    <div class="flex-shrink-0">
      <p
        v-bind:data-letters="props.chat.contact.username.charAt(0).toUpperCase()"
        class="m-0 me-1"
      ></p>
      <!-- <img
        class="img-thumbnail rounded-circle border-0 p-0 me-1"
        style="height: 3.5em"
        :alt="props.chat.contact.username.charAt(0).toUpperCase()"
        src="/src/assets/134d2f60-2cdc-48c8-8050-e8f7fc34f967.jpg"
      /> -->
    </div>
    <div class="ms-1 d-flex flex-grow-1 flex-column text-truncate align-self-center">
      <div class="d-flex justify-content-between">
        <p class="fw-bold text-truncate m-0 mb-1 text-capitalize">{{ chat.contact.username }}</p>
        <p class="small text-body-secondary m-0 mb-1 ms-2">{{ chat.lastMessageTime }}</p>
      </div>
      <div class="d-flex justify-content-between">
        <p v-if="chat.lastMessage" class="small text-truncate text-body-secondary m-0">
          {{ chat.lastMessage }}
        </p>
        <p
          v-if="!chat.lastMessage"
          class="small text-truncate text-body-secondary m-0 text-body-tertiary fst-italic"
        >
          {{ 'Start conversation...' }}
        </p>
        <!-- <p class="m-0 ms-2 badge text-bg-primary">{{ 25 }}</p> -->
      </div>
    </div>
  </a>
</template>

<style scoped>
[data-letters]:before {
  content: attr(data-letters);
  display: inline-block;
  font-size: 2rem;
  width: 3.5rem;
  height: 3.5rem;
  line-height: 3.5rem;
  font-weight: 500;
  text-align: center;
  border-radius: 50%;
  background: plum;
  vertical-align: middle;
  margin-right: 0;
  color: white;
}
</style>
