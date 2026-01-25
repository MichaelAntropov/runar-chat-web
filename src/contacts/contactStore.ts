import { defineStore } from 'pinia'
import type { Contact } from './types/Contact'
import { ref, watch, type Ref } from 'vue'
import { debounce } from 'lodash'
import { useDbStore } from '@/db/dbStore'
import { CONTACTS_STORE, CONTACTS_STORE_KEY } from '@/db/veilDB'

export const useContactsStore = defineStore('contacts', () => {
  const dbStore = useDbStore()

  const contacts: Ref<Array<Contact>> = ref([])

  function addNewContact(contact: Contact) {
    const existingContact = contacts.value.find((v) => v.userId === contact.userId)
    if (existingContact) {
      existingContact.username = contact.username
      return
    }
    contacts.value.push(contact)
  }

  const isHydrated = ref(false)

  async function hydrate() {
    if (!dbStore.db) return

    try {
      console.log('[contactsStore] Hydrating from DB...')

      const record = await dbStore.db.table(CONTACTS_STORE).get(CONTACTS_STORE_KEY)

      if (record) {
        const restoredContacts: Contact[] = record.contacts || []
        contacts.value = restoredContacts
      }
    } catch (e) {
      console.error('[contactsStore] Hydration failed:', e)
    } finally {
      isHydrated.value = true
    }
  }

  const saveState = debounce(async () => {
    if (!isHydrated.value || dbStore.dbStatus !== 'ready' || !dbStore.db) return

    try {
      const stateToSave = {
        contacts: JSON.parse(JSON.stringify(contacts.value)),
      }

      await dbStore.db.table(CONTACTS_STORE).put(stateToSave, CONTACTS_STORE_KEY)
    } catch (e) {
      console.error('[contactsStore] Persist failed:', e)
    }
  }, 1000)

  // Trigger hydration when DB is unlocked/ready
  watch(
    () => dbStore.dbStatus,
    (status) => {
      if (status === 'ready') {
        hydrate()
      } else {
        // If DB locks or resets, mark as not hydrated to stop saving
        isHydrated.value = false
        contacts.value = []
      }
    },
    { immediate: true },
  )

  watch(
    [contacts],
    () => {
      if (isHydrated.value) {
        saveState()
      }
    },
    { deep: true },
  )

  return {
    contacts,
    addNewContact,
  }
})
