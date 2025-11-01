import { defineStore } from 'pinia'
import type { Contact } from './Contact'
import { ref, type Ref } from 'vue'

export const useContactsStore = defineStore(
  'contacts',
  () => {
    const contacts: Ref<Array<Contact>> = ref([])

    function addNewContact(contact: Contact) {
      const existingContact = contacts.value.find((v) => v.userId === contact.userId)
      if (existingContact) {
        existingContact.username = contact.username
        return
      }
      contacts.value.push(contact)
    }

    return {
      contacts,
      addNewContact,
    }
  },
  {
    persist: {
      storage: localStorage,
    },
  },
)
