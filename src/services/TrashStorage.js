class TrashStorage {
  constructor() {
    this.dbName = "bookmarksTrash"
    this.storeName = "trash"
    this.db = null
  }

  async init() {
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1)

        request.onerror = () =>
          reject(new Error("Failed to open trash database"))

        request.onupgradeneeded = (event) => {
          const db = event.target.result
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: "id" })
          }
        }

        request.onsuccess = (event) => {
          this.db = event.target.result
          resolve()
        }
      })
    } catch (error) {
      console.error("Error initializing trash storage:", error)
      throw error
    }
  }

  async moveToTrash(item, navigationStack = []) {
    try {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], "readwrite")
        const store = transaction.objectStore(this.storeName)

        // Сохраняем путь навигации и содержимое папки
        const itemToStore = {
          ...item,
          deletedAt: new Date().toISOString(),
          navigationPath: navigationStack,
          contents: item.contents || [], // Содержимое папки, если есть
        }

        const request = store.add(itemToStore)

        request.onsuccess = () => resolve()
        request.onerror = () =>
          reject(new Error("Failed to move item to trash"))
      })
    } catch (error) {
      console.error("Error moving item to trash:", error)
      throw error
    }
  }

  async restoreItem(id) {
    try {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], "readwrite")
        const store = transaction.objectStore(this.storeName)

        const getRequest = store.get(id)

        getRequest.onsuccess = () => {
          const item = getRequest.result
          if (!item) {
            reject(new Error("Item not found in trash"))
            return
          }

          const deleteRequest = store.delete(id)
          deleteRequest.onsuccess = () => resolve(item)
          deleteRequest.onerror = () =>
            reject(new Error("Failed to remove item from trash"))
        }

        getRequest.onerror = () =>
          reject(new Error("Failed to get item from trash"))
      })
    } catch (error) {
      console.error("Error restoring item from trash:", error)
      throw error
    }
  }

  async getTrashItems() {
    try {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], "readonly")
        const store = transaction.objectStore(this.storeName)
        const request = store.getAll()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error("Failed to get trash items"))
      })
    } catch (error) {
      console.error("Error getting trash items:", error)
      throw error
    }
  }

  async clearTrash() {
    try {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.storeName], "readwrite")
        const store = transaction.objectStore(this.storeName)
        const request = store.clear()

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error("Failed to clear trash"))
      })
    } catch (error) {
      console.error("Error clearing trash:", error)
      throw error
    }
  }

  async hasItems() {
    try {
      const items = await this.getTrashItems()
      return items.length > 0
    } catch (error) {
      console.error("Error checking trash items:", error)
      throw error
    }
  }
}

export const trashStorage = new TrashStorage()
