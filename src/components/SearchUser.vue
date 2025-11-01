<script setup lang="ts">
import { useChatsStore } from '@/chat/ChatStorage'
import type { Contact } from '@/contacts/Contact'
import { useContactsStore } from '@/contacts/ContactsStorage'
import { useUserStore } from '@/user/UserStorage'
import type { FindUserResponse, FoundUser } from '@/contacts/FindUserResponse'
import { ref, watch, type Ref } from 'vue'

const userStore = useUserStore()

const searchInput = ref('')
const foundUsers: Ref<Array<FoundUser>> = ref([])
const contactsStorage = useContactsStore()
const chatsStorage = useChatsStore()

function addFoundUserAsContact(foundUser: FoundUser) {
  const newContact: Contact = { userId: foundUser.id, username: foundUser.username }
  contactsStorage.addNewContact(newContact)
  const chat = chatsStorage.createNewChatFromContact(newContact)
  chatsStorage.changeCurrentChat(chat.id)
}

watch(searchInput, async () => {
  let searchValue = searchInput.value
  searchValue = searchValue.replace('@', '')

  if (searchValue && searchValue.length > 2) {
    try {
      const params = new URLSearchParams()
      params.append('username', searchValue)

      const response = await fetch(`/api/v1/contacts/find?${params}`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + (await userStore.getAccessToken()),
        },
      })

      if (!response.ok) {
        const errorBody = await response.text() // Try to get more error details
        console.error('User search API error body:', errorBody)
        throw new Error(`HTTP error! Status: ${response.status}`)
      }

      const parsed: FindUserResponse = await response.json()
      foundUsers.value = parsed.foundUsers
    } catch (error: unknown) {
      console.error('User search failed:', error)
    }
  } else {
    if (foundUsers.value) {
      foundUsers.value = []
    }
  }
})
</script>

<template>
  <form class="d-flex w-100" role="search">
    <div class="flex-grow-1">
      <div class="search-box">
        <input
          type="text"
          class="form-control"
          v-model="searchInput"
          placeholder="Search user..."
        />
        <i class="bi bi-search search-icon"></i>

        <div class="suggestions">
          <div
            v-for="foundUser in foundUsers"
            v-bind:key="foundUser.id"
            class="suggestion-item"
            @click="addFoundUserAsContact(foundUser)"
          >
            @{{ foundUser.username }}
          </div>
        </div>
      </div>
    </div>
  </form>
</template>

<style scoped>
.search-wrapper {
  max-width: 600px;
  margin: 0 auto;
}

.search-box {
  position: relative;
  background: var(--bs-secondary-bg);
  border-radius: 30px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.search-box:focus-within {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.search-icon {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
  transition: all 0.3s ease;
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bs-secondary-bg);
  border-radius: 15px;
  margin-top: 10px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all 0.3s ease;
  z-index: 1000;
}

.search-box:focus-within .suggestions {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.suggestion-item {
  padding: 12px 20px;
  cursor: pointer;
}

.suggestion-item:hover {
  background: var(--bs-tertiary-color);
  border-radius: 15px;
}
</style>
