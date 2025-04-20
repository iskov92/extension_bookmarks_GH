class IconStorage {
  constructor() {
    this.DB_NAME = "bookmarks_db"
    this.DB_VERSION = 1
    this.ICONS_STORE = "folder_icons"
    this.db = null
  }

  async init() {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => {
        reject(new Error("Failed to open database"))
      }

      request.onsuccess = (event) => {
        this.db = event.target.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(this.ICONS_STORE)) {
          db.createObjectStore(this.ICONS_STORE, { keyPath: "folderId" })
        }
      }
    })
  }

  async saveIcon(folderId, iconBlob) {
    try {
      await this.init()
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.ICONS_STORE], "readwrite")
        const store = transaction.objectStore(this.ICONS_STORE)

        const request = store.put({
          folderId,
          iconBlob,
          updatedAt: new Date(),
        })

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error("Failed to save icon"))
      })
    } catch (error) {
      console.error("Error saving icon:", error)
      throw error
    }
  }

  async getIcon(folderId) {
    try {
      await this.init()
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.ICONS_STORE], "readonly")
        const store = transaction.objectStore(this.ICONS_STORE)
        const request = store.get(folderId)

        request.onsuccess = () => {
          resolve(request.result?.iconBlob || null)
        }
        request.onerror = () => reject(new Error("Failed to get icon"))
      })
    } catch (error) {
      console.error("Error getting icon:", error)
      throw error
    }
  }

  async deleteIcon(folderId) {
    try {
      await this.init()
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([this.ICONS_STORE], "readwrite")
        const store = transaction.objectStore(this.ICONS_STORE)
        const request = store.delete(folderId)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error("Failed to delete icon"))
      })
    } catch (error) {
      console.error("Error deleting icon:", error)
      throw error
    }
  }

  async migrateFromStorage() {
    try {
      const result = await chrome.storage.local.get(null)
      const iconEntries = Object.entries(result).filter(([key]) =>
        key.startsWith("folderIcon_")
      )

      for (const [key, iconData] of iconEntries) {
        const folderId = key.replace("folderIcon_", "")
        // Конвертируем base64 в Blob
        const response = await fetch(iconData)
        const blob = await response.blob()
        await this.saveIcon(folderId, blob)
        // Удаляем старую запись из storage
        await chrome.storage.local.remove(key)
      }

      console.log("Migration completed successfully")
    } catch (error) {
      console.error("Migration failed:", error)
      throw error
    }
  }
}

// Экспортируем singleton
export const iconStorage = new IconStorage()
