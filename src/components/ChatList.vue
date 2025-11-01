<script setup lang="ts">
import { useChatsStore } from '@/chat/ChatStorage'
import ChatListItem from './ChatListItem.vue'

const chatStore = useChatsStore()
</script>

<template>
  <div class="list-group list-group-flush border-bottom overflow-y-auto">
    <template v-for="chat in chatStore.chats" :key="chat.id">
      <ChatListItem :chat="chat" />
    </template>
  </div>
</template>
