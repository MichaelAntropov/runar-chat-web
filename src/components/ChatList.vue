<script setup lang="ts">
import { computed } from 'vue'

import { useChatsStore } from '@/chat/chatStore'

import ChatListItem from './ChatListItem.vue'

const emit = defineEmits(['open-chat'])
const chatStore = useChatsStore()

const sortedChats = computed(() =>
  [...chatStore.chats].sort(
    (firstChat, secondChat) =>
      (secondChat.lastMessageTime ?? Number.NEGATIVE_INFINITY) -
      (firstChat.lastMessageTime ?? Number.NEGATIVE_INFINITY),
  ),
)
</script>

<template>
  <div class="list-group list-group-flush border-bottom overflow-y-auto">
    <template v-for="chat in sortedChats" :key="chat.id">
      <ChatListItem :chat="chat" @click="emit('open-chat')" />
    </template>
  </div>
</template>
