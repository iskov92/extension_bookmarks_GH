// Обработка установки расширения
chrome.runtime.onInstalled.addListener(async () => {
  // Инициализация настроек по умолчанию
  chrome.storage.sync.set({
    isDarkTheme: true, // Темная тема по умолчанию
  })

  // Проверяем, есть ли уже закладки
  const data = await chrome.storage.local.get("gh_bookmarks")
  if (!data.gh_bookmarks) {
    // Создаем базовую структуру папок
    const defaultBookmarks = {
      id: "0",
      title: "root",
      children: [
        {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: "Избранное",
          type: "folder",
          children: [],
        },
        {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: "Работа",
          type: "folder",
          children: [],
        },
        {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: "Личное",
          type: "folder",
          children: [],
        },
      ],
    }

    await chrome.storage.local.set({ gh_bookmarks: defaultBookmarks })
  }
})

// Обработка сообщений от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXPORT_BOOKMARKS") {
    chrome.storage.local.get("gh_bookmarks", (data) => {
      sendResponse({ bookmarks: data.gh_bookmarks?.children || [] })
    })
    return true // Для асинхронного ответа
  }
})
