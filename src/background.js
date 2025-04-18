// Обработка установки расширения
chrome.runtime.onInstalled.addListener(() => {
  // Инициализация настроек по умолчанию
  chrome.storage.sync.set({
    isDarkTheme: true, // Темная тема по умолчанию
  })
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
