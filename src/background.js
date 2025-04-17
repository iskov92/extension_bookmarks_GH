// Обработка установки расширения
chrome.runtime.onInstalled.addListener(() => {
  // Инициализация настроек по умолчанию
  chrome.storage.sync.set({
    isDarkTheme: false,
  })
})

// Обработка сообщений от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXPORT_BOOKMARKS") {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      sendResponse({ bookmarks: bookmarkTreeNodes[0].children })
    })
    return true // Для асинхронного ответа
  }
})
