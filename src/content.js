// content.js - Скрипт для взаимодействия с DOM страницы

// Сообщаем background script, что content script загрузился
console.log("[Content] Загрузка content script, сообщаем в background...")
chrome.runtime.sendMessage(
  { action: "contentScriptLoaded", url: window.location.href },
  (response) => {
    console.log(
      "[Content] Ответ на сообщение о загрузке content script:",
      response
    )
  }
)

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Content] Получено сообщение:", request)

  // Обработка ping для проверки, загружен ли content script
  if (request.action === "ping") {
    console.log("[Content] Получен ping запрос, отвечаем...")
    sendResponse({ status: "content_script_active" })
    return true
  }

  // Обработка запроса на получение текста ссылки
  if (request.action === "getLinkText") {
    console.log("[Content] Получен запрос на текст ссылки:", request.linkUrl)
    try {
      // Находим все ссылки на странице
      const links = document.querySelectorAll("a")
      const targetUrl = request.linkUrl

      let linkText = ""

      // Ищем ссылку с нужным URL
      for (const link of links) {
        if (link.href === targetUrl) {
          linkText = link.textContent.trim()
          break
        }
      }

      console.log("Найден текст ссылки:", linkText)
      sendResponse({ success: true, linkText })
    } catch (error) {
      console.error("Ошибка при получении текста ссылки:", error)
      sendResponse({ success: false, error: error.message })
    }
    return true
  }

  // Обработка запроса на отображение модального окна добавления закладки
  if (request.action === "showAddBookmarkModal") {
    console.log(
      "[Content] Получен запрос на отображение модального окна:",
      request.data
    )
    try {
      showAddBookmarkModal(request.data.url, request.data.title)
      sendResponse({ success: true, message: "Модальное окно отображено" })
    } catch (error) {
      console.error("Ошибка при отображении модального окна:", error)
      sendResponse({ success: false, error: error.message })
    }
    return true
  }

  // Возвращаем true, чтобы показать, что будем отвечать асинхронно
  return true
})

/**
 * Отображает модальное окно добавления закладки
 * @param {string} url - URL закладки
 * @param {string} title - Заголовок закладки
 */
function showAddBookmarkModal(url, title) {
  console.log("Отображаем модальное окно добавления закладки")

  // Получаем текущую тему из хранилища Chrome
  chrome.storage.sync.get("isDarkTheme", (data) => {
    const isDarkTheme = data.isDarkTheme !== undefined ? data.isDarkTheme : true
    console.log("Текущая тема:", isDarkTheme ? "темная" : "светлая")

    // Создаем модальное окно
    const modal = document.createElement("div")
    modal.className = "gh-bookmark-modal"
    if (isDarkTheme) {
      modal.classList.add("gh-bookmark-dark-theme")
    }

    // Создаем HTML содержимое модального окна
    modal.innerHTML = `
      <div class="gh-bookmark-modal-overlay">
        <div class="gh-bookmark-modal-content">
          <div class="gh-bookmark-modal-header">
            <h2>Добавить в менеджер закладок GH</h2>
            <span class="gh-bookmark-modal-close">&times;</span>
          </div>
          <div class="gh-bookmark-modal-body">
            <div class="gh-bookmark-form">
              <div class="gh-bookmark-input-group">
                <label for="gh-bookmark-title">Название</label>
                <input type="text" id="gh-bookmark-title" value="${escapeHtml(
                  title
                )}">
              </div>
              <div class="gh-bookmark-input-group">
                <label for="gh-bookmark-url">URL</label>
                <input type="text" id="gh-bookmark-url" value="${escapeHtml(
                  url
                )}">
              </div>
            </div>
            <div class="gh-bookmark-folder-section">
              <h3>
                Выберите папку 
                <button class="gh-bookmark-refresh-btn" title="Обновить список папок">&#x21bb;</button>
                <button class="gh-bookmark-add-folder-btn" title="Создать новую папку">+</button>
                <button class="gh-bookmark-debug-btn" title="Отладка" style="font-size: 12px; background: #ff5722; color: white; border: none; border-radius: 4px; padding: 2px 6px; margin-left: 8px; cursor: pointer;">DEBUG</button>
              </h3>
              <div class="gh-bookmark-folder-structure">
                <div class="gh-bookmark-loading">Загрузка структуры папок...</div>
              </div>
            </div>
          </div>
          <div class="gh-bookmark-modal-footer">
            <button class="gh-bookmark-cancel-btn">Отмена</button>
            <button class="gh-bookmark-save-btn">Сохранить</button>
          </div>
        </div>
      </div>
    `

    // Добавляем стили
    addModalStyles()

    // Добавляем модальное окно в DOM
    document.body.appendChild(modal)

    // Настраиваем обработчики событий
    setupModalEventListeners(modal, url, title)

    // Загружаем структуру папок
    loadFolderStructure(modal)
  })
}

/**
 * Добавляет стили для модального окна
 */
function addModalStyles() {
  // Проверяем, не добавлены ли уже стили
  if (document.getElementById("gh-bookmark-modal-styles")) {
    return
  }

  const styleSheet = document.createElement("style")
  styleSheet.id = "gh-bookmark-modal-styles"
  styleSheet.textContent = `
    .gh-bookmark-modal {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
    }
    
    .gh-bookmark-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    
    .gh-bookmark-modal-content {
      background-color: #fff;
      border-radius: 8px;
      width: 480px;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    }
    
    .gh-bookmark-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #eee;
    }
    
    .gh-bookmark-modal-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    
    .gh-bookmark-modal-close {
      font-size: 24px;
      font-weight: 600;
      cursor: pointer;
      color: #999;
    }
    
    .gh-bookmark-modal-close:hover {
      color: #333;
    }
    
    .gh-bookmark-modal-body {
      padding: 16px;
      overflow-y: auto;
      max-height: 70vh;
    }
    
    .gh-bookmark-form {
      margin-bottom: 24px;
    }
    
    .gh-bookmark-input-group {
      margin-bottom: 16px;
    }
    
    .gh-bookmark-input-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
    }
    
    .gh-bookmark-input-group input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .gh-bookmark-folder-section {
      margin-top: 16px;
    }
    
    .gh-bookmark-folder-section h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 500;
    }
    
    .gh-bookmark-folder-structure {
      max-height: 250px;
      overflow-y: auto;
      border: 1px solid #eee;
      border-radius: 4px;
      padding: 8px;
      background-color: #f9f9f9;
    }
    
    .gh-bookmark-folder-item {
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      margin-bottom: 2px;
    }
    
    .gh-bookmark-folder-item:hover {
      background-color: #f0f0f0;
    }
    
    .gh-bookmark-folder-selected {
      background-color: #e0e7ff;
    }
    
    .gh-bookmark-folder-selected:hover {
      background-color: #d0d7f7;
    }
    
    .gh-bookmark-folder-icon {
      width: 16px;
      height: 16px;
      margin-right: 8px;
    }
    
    .gh-bookmark-folder-arrow {
      width: 8px;
      height: 12px;
      margin-left: auto;
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    
    .gh-bookmark-folder-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .gh-bookmark-subfolder-container {
      margin-left: 24px;
      margin-top: 4px;
    }
    
    .gh-bookmark-loading {
      padding: 12px;
      text-align: center;
      color: #666;
    }
    
    .gh-bookmark-folder-empty {
      padding: 12px;
      text-align: center;
      color: #666;
      font-style: italic;
    }
    
    .gh-bookmark-folder-notice {
      padding: 12px;
      text-align: center;
      color: #666;
      font-style: italic;
      margin-top: 8px;
      border-top: 1px solid #eee;
    }
    
    .gh-bookmark-modal-footer {
      display: flex;
      justify-content: flex-end;
      padding: 16px;
      border-top: 1px solid #eee;
    }
    
    .gh-bookmark-modal-footer button {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .gh-bookmark-cancel-btn {
      background-color: #f5f5f5;
      border: 1px solid #ddd;
      margin-right: 8px;
    }
    
    .gh-bookmark-cancel-btn:hover {
      background-color: #eee;
    }
    
    .gh-bookmark-save-btn {
      background-color: #4f46e5;
      color: #fff;
      border: none;
    }
    
    .gh-bookmark-save-btn:hover {
      background-color: #4338ca;
    }
    
    /* Стили для темной темы */
    .gh-bookmark-dark-theme .gh-bookmark-modal-content {
      background-color: #202124;
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-modal-header {
      border-bottom: 1px solid #3c4043;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-modal-header h2 {
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-modal-close {
      color: #9aa0a6;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-modal-close:hover {
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-input-group label {
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-input-group input {
      background-color: #292a2d;
      border: 1px solid #5f6368;
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-section h3 {
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-structure {
      background-color: #292a2d;
      border: 1px solid #3c4043;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-item:hover {
      background-color: #35363a;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-selected {
      background-color: #174ea6;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-selected:hover {
      background-color: #1a5fbe;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-empty,
    .gh-bookmark-dark-theme .gh-bookmark-folder-notice,
    .gh-bookmark-dark-theme .gh-bookmark-loading {
      color: #9aa0a6;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-modal-footer {
      border-top: 1px solid #3c4043;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-cancel-btn {
      background-color: #3c4043;
      border: 1px solid #5f6368;
      color: #e8eaed;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-cancel-btn:hover {
      background-color: #4a4d51;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-save-btn {
      background-color: #8ab4f8;
      color: #202124;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-save-btn:hover {
      background-color: #6ba2f7;
    }
    
    .gh-bookmark-refresh-btn {
      background: none;
      border: none;
      font-size: 16px;
      color: #999;
      cursor: pointer;
      padding: 0 4px;
      margin-left: 8px;
      border-radius: 50%;
      transition: all 0.2s ease;
      vertical-align: middle;
    }
    
    .gh-bookmark-refresh-btn:hover {
      color: #333;
      background-color: #f0f0f0;
      transform: rotate(30deg);
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-refresh-btn {
      color: #9aa0a6;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-refresh-btn:hover {
      color: #e8eaed;
      background-color: #35363a;
    }
    
    /* Добавляем стили для кнопки добавления папки */
    .gh-bookmark-add-folder-btn {
      background: none;
      border: none;
      font-size: 18px;
      font-weight: bold;
      color: #4f46e5;
      cursor: pointer;
      padding: 0 4px;
      margin-left: 8px;
      border-radius: 50%;
      transition: all 0.2s ease;
      vertical-align: middle;
    }
    
    .gh-bookmark-add-folder-btn:hover {
      background-color: #f0f0f0;
      transform: scale(1.1);
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-add-folder-btn {
      color: #8ab4f8;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-add-folder-btn:hover {
      background-color: #35363a;
    }
    
    .gh-bookmark-folder-create {
      margin-top: 12px;
      padding: 12px;
      background-color: #f9f9f9;
      border-radius: 4px;
      display: none;
    }
    
    .gh-bookmark-dark-theme .gh-bookmark-folder-create {
      background-color: #292a2d;
    }
    
    .gh-bookmark-folder-create.active {
      display: block;
      animation: fadeIn 0.3s;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `

  document.head.appendChild(styleSheet)
}

/**
 * Экранирует HTML специальные символы
 * @param {string} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
function escapeHtml(text) {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

/**
 * Настраивает обработчики событий для модального окна
 * @param {HTMLElement} modal - Элемент модального окна
 * @param {string} url - URL закладки
 * @param {string} title - Заголовок закладки
 */
function setupModalEventListeners(modal, url, title) {
  // Выбранная папка
  let selectedFolderId = "0" // По умолчанию - корневая папка

  // Обработчик закрытия
  const closeBtn = modal.querySelector(".gh-bookmark-modal-close")
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(modal)
  })

  // Обработчик клика вне модального окна
  const overlay = modal.querySelector(".gh-bookmark-modal-overlay")
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(modal)
    }
  })

  // Обработчик кнопки Отмена
  const cancelBtn = modal.querySelector(".gh-bookmark-cancel-btn")
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(modal)
  })

  // Обработчик кнопки обновления списка папок
  const refreshBtn = modal.querySelector(".gh-bookmark-refresh-btn")
  if (refreshBtn) {
    refreshBtn.addEventListener("click", (e) => {
      e.preventDefault()
      console.log("Обновление списка папок")

      // Запрашиваем background script обновить структуру закладок
      chrome.runtime.sendMessage({ action: "fixBookmarksStructure" }, () => {
        // После обновления структуры перезагружаем список папок
        loadFolderStructure(modal)
      })
    })
  }

  // Обработчик кнопки отладки
  const debugBtn = modal.querySelector(".gh-bookmark-debug-btn")
  if (debugBtn) {
    debugBtn.addEventListener("click", (e) => {
      e.preventDefault()
      console.log("Нажата кнопка отладки")

      // Выводим диалоговое окно с опциями отладки
      const debugActions = [
        "Вывести в консоль текущую структуру закладок",
        "Полностью сбросить и пересоздать структуру закладок",
        "Проверить доступность фонового скрипта",
        "Использовать плоское отображение папок",
      ]

      const actionIndex = window.prompt(
        "Выберите действие отладки (введите номер):\n" +
          debugActions
            .map((action, index) => `${index + 1}. ${action}`)
            .join("\n"),
        "1"
      )

      if (!actionIndex) return

      const selectedAction = parseInt(actionIndex)

      // Оборачиваем обработку действий в try-catch для перехвата ошибок инвалидации контекста
      try {
        switch (selectedAction) {
          case 1: // Вывести текущую структуру
            chrome.storage.local.get("gh_bookmarks", (data) => {
              try {
                console.log(
                  "[Debug] Текущая структура закладок:",
                  data && data.gh_bookmarks
                    ? JSON.stringify(data.gh_bookmarks).substring(0, 1000) +
                        "..."
                    : "Структура отсутствует"
                )
                alert("Структура закладок выведена в консоль")
              } catch (err) {
                console.error("[Debug] Ошибка при выводе структуры:", err)
                alert("Ошибка при выводе структуры: " + err.message)
              }
            })
            break

          case 2: // Полностью сбросить структуру
            if (
              confirm(
                "Вы уверены? Это действие удалит все закладки и папки и создаст базовую структуру."
              )
            ) {
              try {
                chrome.runtime.sendMessage(
                  { action: "resetBookmarksStructure" },
                  (response) => {
                    try {
                      console.log(
                        "[Debug] Результат сброса структуры:",
                        response
                      )

                      if (response && response.success) {
                        alert(
                          "Структура закладок успешно сброшена! Перезагружаем..."
                        )
                        // Перезагружаем список папок
                        loadFolderStructure(modal)
                      } else {
                        alert(
                          "Ошибка при сбросе структуры: " +
                            (response ? response.error : "Неизвестная ошибка")
                        )
                      }
                    } catch (err) {
                      console.error("[Debug] Ошибка при обработке ответа:", err)
                      alert("Ошибка при обработке ответа: " + err.message)
                    }
                  }
                )
              } catch (err) {
                console.error("[Debug] Ошибка при отправке запроса:", err)
                alert("Ошибка при отправке запроса: " + err.message)

                // Перезагружаем модальное окно как запасной вариант
                document.body.removeChild(modal)
                setTimeout(() => {
                  showAddBookmarkModal(
                    document.querySelector("#gh-bookmark-url").value,
                    document.querySelector("#gh-bookmark-title").value
                  )
                }, 500)
              }
            }
            break

          case 3: // Проверить доступность фонового скрипта
            try {
              chrome.runtime.sendMessage(
                { action: "testConnection", data: { timestamp: Date.now() } },
                (response) => {
                  try {
                    console.log(
                      "[Debug] Результат проверки соединения:",
                      response
                    )

                    if (response && response.success) {
                      alert("Соединение с фоновым скриптом работает нормально!")
                    } else {
                      alert(
                        "Проблема соединения с фоновым скриптом: " +
                          (chrome.runtime.lastError
                            ? chrome.runtime.lastError.message
                            : "Нет ответа")
                      )
                    }
                  } catch (err) {
                    console.error(
                      "[Debug] Ошибка при обработке ответа проверки соединения:",
                      err
                    )
                    alert("Ошибка при обработке ответа: " + err.message)
                  }
                }
              )
            } catch (err) {
              console.error("[Debug] Ошибка при проверке соединения:", err)
              alert("Ошибка при проверке соединения: " + err.message)
            }
            break

          case 4: // Использовать плоское отображение папок
            try {
              renderFlatFolderStructure(modal)
            } catch (err) {
              console.error("[Debug] Ошибка при плоском отображении:", err)
              alert("Ошибка при плоском отображении: " + err.message)

              // Отображаем упрощенную структуру как запасной вариант
              const folderContainer = modal.querySelector(
                ".gh-bookmark-folder-structure"
              )
              folderContainer.innerHTML = `
                <div class="gh-bookmark-folder-item gh-bookmark-folder-selected" data-folder-id="0">
                  <img src="${chrome.runtime.getURL(
                    "assets/icons/folder.svg"
                  )}" class="gh-bookmark-folder-icon">
                  <span class="gh-bookmark-folder-name">Корневая папка</span>
                </div>
                <div class="gh-bookmark-folder-notice">
                  Используется запасной вариант отображения из-за ошибки: ${
                    err.message
                  }
                </div>
              `
            }
            break

          default:
            alert("Выбрано некорректное действие")
        }
      } catch (error) {
        console.error("[Debug] Критическая ошибка в отладчике:", error)
        alert(
          "Произошла критическая ошибка: " +
            error.message +
            "\n\nПопробуйте закрыть и открыть расширение заново"
        )

        // Пытаемся закрыть модальное окно чтобы избежать дальнейших проблем
        try {
          document.body.removeChild(modal)
        } catch (err) {
          // Игнорируем ошибки при закрытии
        }
      }
    })
  }

  // Обработчик кнопки Сохранить
  const saveBtn = modal.querySelector(".gh-bookmark-save-btn")
  saveBtn.addEventListener("click", () => {
    // Получаем значения из полей ввода
    const titleInput = modal.querySelector("#gh-bookmark-title")
    const urlInput = modal.querySelector("#gh-bookmark-url")

    const bookmarkTitle = titleInput.value.trim()
    const bookmarkUrl = urlInput.value.trim()

    // Валидация
    if (!bookmarkTitle) {
      alert("Пожалуйста, введите название закладки")
      return
    }

    if (!bookmarkUrl) {
      alert("Пожалуйста, введите URL закладки")
      return
    }

    // Проверяем URL (базовая проверка)
    let validUrl = bookmarkUrl
    if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
      validUrl = "https://" + validUrl
    }

    console.log(`Сохранение закладки в папку с ID: ${selectedFolderId}`)

    // Получаем favicon через Google Favicon Service
    const hostname = new URL(validUrl).hostname
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`

    // Сохраняем закладку напрямую в storage, чтобы избежать потери данных
    try {
      chrome.storage.local.get("gh_bookmarks", (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Content] Ошибка при получении структуры закладок:",
            chrome.runtime.lastError
          )
          alert(
            "Ошибка при сохранении закладки: " +
              chrome.runtime.lastError.message
          )
          return
        }

        if (!data || !data.gh_bookmarks) {
          console.error("[Content] Структура закладок не найдена в хранилище")
          alert(
            "Структура закладок не найдена. Пожалуйста, перезапустите расширение."
          )
          return
        }

        // Создаем новую закладку
        const newBookmark = {
          id:
            "bk_" +
            Date.now().toString(36) +
            Math.random().toString(36).substr(2),
          title: bookmarkTitle,
          url: validUrl,
          type: "bookmark",
          icon: faviconUrl,
          addedAt: new Date().toISOString(),
        }

        let bookmarks = data.gh_bookmarks

        // Определяем, является ли папка корневой
        if (selectedFolderId === "0") {
          // Добавляем в корневую папку
          if (!bookmarks.children) {
            bookmarks.children = []
          }
          bookmarks.children.push(newBookmark)

          // Сохраняем обновленную структуру
          chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Content] Ошибка при сохранении закладки:",
                chrome.runtime.lastError
              )
              alert(
                "Ошибка при сохранении закладки: " +
                  chrome.runtime.lastError.message
              )
              return
            }

            alert("Закладка успешно сохранена!")
            document.body.removeChild(modal)
          })
        } else {
          // Добавляем во вложенную папку
          // Ищем папку по ID
          let folderFound = false

          // Функция для поиска и добавления закладки в папку
          function addToFolder(items) {
            if (!items || !Array.isArray(items)) return false

            for (let i = 0; i < items.length; i++) {
              const item = items[i]

              // Проверяем, является ли текущий элемент нужной папкой
              if (item && item.id === selectedFolderId) {
                // Нашли нужную папку
                if (!item.children) {
                  item.children = []
                }

                // Добавляем закладку в папку
                item.children.push(newBookmark)
                folderFound = true
                return true
              }

              // Если у элемента есть дочерние элементы, рекурсивно ищем в них
              if (item && item.children && Array.isArray(item.children)) {
                if (addToFolder(item.children)) {
                  return true
                }
              }
            }

            return false
          }

          // Запускаем поиск папки и добавление закладки
          addToFolder(bookmarks.children)

          if (!folderFound) {
            console.error(
              "[Content] Папка с ID " + selectedFolderId + " не найдена"
            )
            alert(
              "Папка не найдена. Закладка будет добавлена в корневую папку."
            )

            // Добавляем в корневую папку
            if (!bookmarks.children) {
              bookmarks.children = []
            }
            bookmarks.children.push(newBookmark)
          }

          // Сохраняем обновленную структуру
          chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Content] Ошибка при сохранении закладки:",
                chrome.runtime.lastError
              )
              alert(
                "Ошибка при сохранении закладки: " +
                  chrome.runtime.lastError.message
              )
              return
            }

            alert("Закладка успешно сохранена!")
            document.body.removeChild(modal)
          })
        }
      })
    } catch (error) {
      console.error(
        "[Content] Критическая ошибка при сохранении закладки:",
        error
      )
      alert("Критическая ошибка при сохранении закладки: " + error.message)
    }
  })

  // Делегируем обработку кликов по папкам
  modal.addEventListener("click", (e) => {
    const folderItem = e.target.closest(".gh-bookmark-folder-item")
    if (folderItem) {
      // Сохраняем ID выбранной папки
      selectedFolderId = folderItem.dataset.folderId
      console.log(`Выбрана папка с ID: ${selectedFolderId}`)

      // Снимаем выделение со всех папок
      modal.querySelectorAll(".gh-bookmark-folder-item").forEach((item) => {
        item.classList.remove("gh-bookmark-folder-selected")
      })

      // Выделяем выбранную папку
      folderItem.classList.add("gh-bookmark-folder-selected")
    }
  })

  // Обработчик кнопки создания новой папки
  const addFolderBtn = modal.querySelector(".gh-bookmark-add-folder-btn")
  if (addFolderBtn) {
    addFolderBtn.addEventListener("click", (e) => {
      e.preventDefault()
      console.log("Создание новой папки")

      // Проверяем, есть ли уже форма создания папки
      let folderCreateForm = modal.querySelector(".gh-bookmark-folder-create")
      if (folderCreateForm) {
        // Переключаем видимость формы
        folderCreateForm.classList.toggle("active")
        return
      }

      // Создаем форму для добавления новой папки
      folderCreateForm = document.createElement("div")
      folderCreateForm.className = "gh-bookmark-folder-create active"
      folderCreateForm.innerHTML = `
        <div class="gh-bookmark-input-group">
          <label for="gh-folder-title">Название новой папки</label>
          <input type="text" id="gh-folder-title" placeholder="Введите название папки">
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
          <button class="gh-bookmark-cancel-folder-btn" style="margin-right: 8px;">Отмена</button>
          <button class="gh-bookmark-create-folder-btn">Создать</button>
        </div>
      `

      // Добавляем форму в модальное окно после списка папок
      const folderSection = modal.querySelector(".gh-bookmark-folder-section")
      folderSection.appendChild(folderCreateForm)

      // Фокус на поле ввода
      setTimeout(() => {
        const input = folderCreateForm.querySelector("#gh-folder-title")
        if (input) input.focus()
      }, 100)

      // Обработчик кнопки Отмена
      const cancelFolderBtn = folderCreateForm.querySelector(
        ".gh-bookmark-cancel-folder-btn"
      )
      cancelFolderBtn.addEventListener("click", () => {
        folderCreateForm.classList.remove("active")
      })

      // Обработчик кнопки Создать
      const createFolderBtn = folderCreateForm.querySelector(
        ".gh-bookmark-create-folder-btn"
      )
      createFolderBtn.addEventListener("click", () => {
        const folderTitleInput =
          folderCreateForm.querySelector("#gh-folder-title")
        const folderTitle = folderTitleInput.value.trim()

        if (!folderTitle) {
          alert("Пожалуйста, введите название папки")
          return
        }

        // Отправляем сообщение в background script для создания папки
        chrome.runtime.sendMessage(
          {
            action: "createFolder",
            data: {
              parentId: "0", // Создаем в корневой папке
              title: folderTitle,
            },
          },
          (response) => {
            if (response && response.success) {
              alert(`Папка "${folderTitle}" успешно создана!`)
              folderCreateForm.classList.remove("active")

              // Перезагружаем структуру папок
              loadFolderStructure(modal)
            } else {
              alert(
                "Ошибка при создании папки: " +
                  (response ? response.error : "Неизвестная ошибка")
              )
            }
          }
        )
      })
    })
  }
}

/**
 * Загружает структуру папок из хранилища
 * @param {HTMLElement} modal - Элемент модального окна
 */
function loadFolderStructure(modal) {
  const folderContainer = modal.querySelector(".gh-bookmark-folder-structure")

  // Показываем индикатор загрузки
  folderContainer.innerHTML = `
    <div class="gh-bookmark-loading">Загрузка структуры папок...</div>
  `

  console.log("[Content] Отправляем запрос на получение структуры папок")

  // Отправляем запрос в background script
  try {
    // Сначала получаем структуру папок напрямую из хранилища
    chrome.storage.local.get("gh_bookmarks", (storageData) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Content] Ошибка при доступе к хранилищу:",
          chrome.runtime.lastError
        )
        showFolderError(
          folderContainer,
          "Ошибка доступа к хранилищу: " + chrome.runtime.lastError.message
        )
        return
      }

      if (!storageData || !storageData.gh_bookmarks) {
        console.log(
          "[Content] Структура закладок не найдена в хранилище, запрашиваем исправление"
        )

        // Запрашиваем исправление структуры только если её нет
        chrome.runtime.sendMessage(
          { action: "fixBookmarksStructure" },
          (fixResponse) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Content] Ошибка при исправлении структуры:",
                chrome.runtime.lastError
              )
              showFolderError(
                folderContainer,
                "Ошибка при исправлении структуры: " +
                  chrome.runtime.lastError.message
              )
              return
            }

            // После исправления запрашиваем структуру папок
            requestFolderStructure(folderContainer)
          }
        )
      } else {
        // У нас уже есть структура закладок, извлекаем папки локально
        try {
          console.log(
            "[Content] Структура закладок найдена в хранилище, извлекаем папки локально"
          )
          const bookmarks = storageData.gh_bookmarks

          // Проверяем наличие и корректность children
          if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
            console.error(
              "[Content] Некорректный массив children в структуре закладок"
            )
            showFolderError(folderContainer, "Некорректная структура закладок")
            return
          }

          // Извлекаем только папки
          const folders = []
          bookmarks.children.forEach((item) => {
            if (item && typeof item === "object" && item.type === "folder") {
              folders.push({
                id: item.id,
                title: item.title,
                type: "folder",
                children: [], // Упрощаем структуру для отображения
              })
            }
          })

          console.log("[Content] Извлечено папок:", folders.length)

          if (folders.length > 0) {
            renderFolderStructure(folders, folderContainer)
          } else {
            // Если не нашли папок локально, запрашиваем структуру с сервера
            console.log(
              "[Content] Папки не найдены локально, запрашиваем с сервера"
            )
            requestFolderStructure(folderContainer)
          }
        } catch (error) {
          console.error(
            "[Content] Ошибка при извлечении папок из хранилища:",
            error
          )
          showFolderError(
            folderContainer,
            "Ошибка при извлечении папок: " + error.message
          )
        }
      }
    })
  } catch (error) {
    console.error(
      "[Content] Критическая ошибка при доступе к хранилищу:",
      error
    )
    showFolderError(folderContainer, "Критическая ошибка: " + error.message)
  }
}

/**
 * Отображает сообщение об ошибке в контейнере папок
 * @param {HTMLElement} container - Контейнер папок
 * @param {string} message - Сообщение об ошибке
 */
function showFolderError(container, message) {
  container.innerHTML = `
    <div class="gh-bookmark-folder-empty">
      Ошибка: ${message}
    </div>
    <div class="gh-bookmark-folder-item gh-bookmark-folder-selected" data-folder-id="0">
      <img src="${chrome.runtime.getURL(
        "assets/icons/folder.svg"
      )}" class="gh-bookmark-folder-icon">
      <span class="gh-bookmark-folder-name">Корневая папка (запасной вариант)</span>
    </div>
  `
}

/**
 * Запрашивает структуру папок из background script
 * @param {HTMLElement} container - Контейнер для отображения папок
 */
function requestFolderStructure(container) {
  console.log("[Content] Запрашиваем структуру папок из background script")
  chrome.runtime.sendMessage({ action: "getFolderStructure" }, (response) => {
    // Проверяем наличие ошибок chrome.runtime
    const lastError = chrome.runtime.lastError
    if (lastError) {
      console.error("[Content] Ошибка при запросе структуры папок:", lastError)
      showFolderError(
        container,
        lastError.message || "Не удалось связаться с расширением"
      )
      return
    }

    // Проверяем наличие ответа
    if (!response) {
      console.error("[Content] Получен пустой ответ на getFolderStructure")
      showFolderError(container, "Не получен ответ от расширения")
      return
    }

    console.log(
      "[Content] Получен ответ на запрос структуры папок:",
      JSON.stringify(response).substring(0, 500) + "..."
    )

    // Проверяем успешность запроса
    if (response.success) {
      console.log(
        "[Content] Успешный ответ, папки:",
        response.folders
          ? `Количество: ${response.folders.length}, Данные: ${JSON.stringify(
              response.folders
            ).substring(0, 300)}...`
          : "отсутствуют"
      )

      // Проверяем наличие папок в ответе
      if (!response.folders || !Array.isArray(response.folders)) {
        console.error(
          "[Content] Массив папок отсутствует или не является массивом"
        )
        showFolderError(container, "Некорректный формат данных папок")
        return
      }

      try {
        // Отображаем структуру папок
        renderFolderStructure(response.folders, container)
      } catch (error) {
        console.error("[Content] Ошибка при отрисовке структуры папок:", error)
        showFolderError(container, "Ошибка отрисовки: " + error.message)
      }
    } else {
      console.error(
        "[Content] Ошибка при получении структуры папок:",
        response.error
      )
      showFolderError(container, response.error || "Неизвестная ошибка")
    }
  })
}

/**
 * Отображает структуру папок в модальном окне
 * @param {Array} folders - Массив папок
 * @param {HTMLElement} container - Контейнер для отображения
 */
function renderFolderStructure(folders, container) {
  console.log(
    "Отображаем структуру папок:",
    folders ? folders.length : 0,
    "папок"
  )

  console.log(
    "Структура папок для отображения:",
    JSON.stringify(folders).substring(0, 500) + "..."
  )

  // Очищаем контейнер
  container.innerHTML = ""

  // Добавляем корневую папку
  const rootFolder = document.createElement("div")
  rootFolder.className = "gh-bookmark-folder-item gh-bookmark-folder-selected"
  rootFolder.dataset.folderId = "0"
  rootFolder.innerHTML = `
    <img src="${chrome.runtime.getURL(
      "assets/icons/folder.svg"
    )}" class="gh-bookmark-folder-icon">
    <span class="gh-bookmark-folder-name">Корневая папка</span>
  `
  container.appendChild(rootFolder)

  // Проверяем валидность массива папок
  if (!folders || !Array.isArray(folders) || folders.length === 0) {
    console.log("Нет дополнительных папок для отображения")

    // Добавляем сообщение о пустой структуре
    const emptyNotice = document.createElement("div")
    emptyNotice.className = "gh-bookmark-folder-notice"
    emptyNotice.textContent =
      "Нет дополнительных папок. Вы можете добавить папки в менеджере закладок."
    container.appendChild(emptyNotice)
    return
  }

  // Рекурсивно отображаем папки
  const renderFolders = (foldersList, parentElement, level = 0) => {
    console.log(
      `Рендеринг папок уровня ${level}, количество: ${foldersList.length}`
    )

    foldersList.forEach((folder, index) => {
      if (!folder || !folder.id || !folder.title) {
        console.warn("Пропускаем некорректную папку:", folder)
        return
      }

      console.log(
        `Рендеринг папки ${index}: ID=${folder.id}, title=${folder.title}, level=${level}`
      )

      // Создаем элемент папки
      const folderElement = document.createElement("div")
      folderElement.className = "gh-bookmark-folder-item"
      folderElement.dataset.folderId = folder.id
      folderElement.style.paddingLeft = level * 10 + "px"

      // Содержимое папки
      folderElement.innerHTML = `
        <img src="${chrome.runtime.getURL(
          "assets/icons/folder.svg"
        )}" class="gh-bookmark-folder-icon">
        <span class="gh-bookmark-folder-name">${escapeHtml(folder.title)}</span>
      `

      parentElement.appendChild(folderElement)

      // Если есть дочерние папки, отображаем их
      if (
        folder.children &&
        Array.isArray(folder.children) &&
        folder.children.length > 0
      ) {
        console.log(
          `Папка ${folder.title} имеет ${folder.children.length} дочерних элементов`
        )

        // Фильтруем только элементы типа folder
        const childFolders = folder.children.filter(
          (child) => child && child.type === "folder"
        )

        if (childFolders.length > 0) {
          console.log(
            `Найдено ${childFolders.length} дочерних папок для ${folder.title}`
          )

          // Создаем контейнер для дочерних папок
          const childContainer = document.createElement("div")
          childContainer.className = "gh-bookmark-subfolder-container"

          // Рекурсивно добавляем дочерние папки
          renderFolders(childFolders, childContainer, level + 1)

          parentElement.appendChild(childContainer)
        } else {
          console.log(`Нет дочерних папок типа folder для ${folder.title}`)
        }
      } else {
        console.log(
          `Папка ${folder.title} не имеет дочерних элементов или они некорректны`
        )
      }
    })
  }

  // Запускаем рекурсивное отображение
  renderFolders(folders, container)

  // Настраиваем обработчики для папок
  setupFolderEventListeners(container)
}

/**
 * Настраивает обработчики событий для вложенных папок
 * @param {HTMLElement} container - Контейнер с папками
 */
function setupFolderEventListeners(container) {
  // Обработчики для показа/скрытия вложенных папок можно добавить здесь
}

/**
 * Простое плоское отображение всех папок для отладки
 * @param {HTMLElement} modal - Элемент модального окна
 */
function renderFlatFolderStructure(modal) {
  console.log("[Debug] Запуск плоского отображения папок")

  const folderContainer = modal.querySelector(".gh-bookmark-folder-structure")
  folderContainer.innerHTML = `<div class="gh-bookmark-loading">Загрузка плоской структуры папок...</div>`

  try {
    // Получаем всю структуру закладок - оборачиваем в try-catch
    chrome.storage.local.get("gh_bookmarks", (data) => {
      try {
        if (!data || !data.gh_bookmarks) {
          folderContainer.innerHTML = `<div class="gh-bookmark-folder-empty">Структура закладок не найдена</div>`
          return
        }

        console.log(
          "[Debug] Получена структура для плоского отображения:",
          data.gh_bookmarks
            ? `id: ${data.gh_bookmarks.id}, дети: ${
                data.gh_bookmarks.children
                  ? data.gh_bookmarks.children.length
                  : "отсутствуют"
              }`
            : "структура отсутствует"
        )

        // Очищаем контейнер
        folderContainer.innerHTML = ""

        // Добавляем корневую папку
        const rootFolder = document.createElement("div")
        rootFolder.className =
          "gh-bookmark-folder-item gh-bookmark-folder-selected"
        rootFolder.dataset.folderId = "0"
        rootFolder.innerHTML = `
          <img src="${chrome.runtime.getURL(
            "assets/icons/folder.svg"
          )}" class="gh-bookmark-folder-icon">
          <span class="gh-bookmark-folder-name">Корневая папка [${
            data.gh_bookmarks.id || "без id"
          }]</span>
        `
        folderContainer.appendChild(rootFolder)

        // Проверяем наличие children
        if (
          !data.gh_bookmarks.children ||
          !Array.isArray(data.gh_bookmarks.children)
        ) {
          const emptyNotice = document.createElement("div")
          emptyNotice.className = "gh-bookmark-folder-notice"
          emptyNotice.textContent =
            "Свойство children отсутствует или не является массивом"
          folderContainer.appendChild(emptyNotice)
          return
        }

        // Проверяем, не пуст ли массив children
        if (data.gh_bookmarks.children.length === 0) {
          const emptyNotice = document.createElement("div")
          emptyNotice.className = "gh-bookmark-folder-notice"
          emptyNotice.textContent = "Массив children пуст"
          folderContainer.appendChild(emptyNotice)
          return
        }

        // Функция для плоского обхода всех папок - упрощенная версия
        const flatFolders = []

        // Напрямую добавляем папки верхнего уровня
        data.gh_bookmarks.children.forEach((item, index) => {
          if (
            item &&
            (item.type === "folder" || (!item.url && item.children))
          ) {
            flatFolders.push({
              id: item.id || `noId_${index}`,
              title: item.title || "Без названия",
              type: item.type || "неизвестно",
              level: 0,
            })
          }
        })

        console.log("[Debug] Плоский список папок:", flatFolders)

        if (flatFolders.length === 0) {
          const emptyNotice = document.createElement("div")
          emptyNotice.className = "gh-bookmark-folder-notice"
          emptyNotice.textContent =
            "Папки не найдены, но массив children не пуст"
          folderContainer.appendChild(emptyNotice)

          // Выводим информацию о первых 3 элементах для диагностики
          const infoNotice = document.createElement("div")
          infoNotice.className = "gh-bookmark-folder-notice"
          infoNotice.style.whiteSpace = "pre-wrap"
          infoNotice.style.textAlign = "left"
          infoNotice.style.fontSize = "12px"

          let infoText = "Информация о первых элементах массива children:\n"
          data.gh_bookmarks.children.slice(0, 3).forEach((item, index) => {
            infoText += `\nЭлемент ${index}:\n`
            infoText += `  id: ${item && item.id ? item.id : "отсутствует"}\n`
            infoText += `  title: ${
              item && item.title ? item.title : "отсутствует"
            }\n`
            infoText += `  type: ${
              item && item.type ? item.type : "отсутствует"
            }\n`
            infoText += `  url: ${item && item.url ? "есть" : "отсутствует"}\n`
            infoText += `  children: ${
              item && item.children
                ? Array.isArray(item.children)
                  ? `массив[${item.children.length}]`
                  : "не массив"
                : "отсутствует"
            }\n`
          })

          infoNotice.textContent = infoText
          folderContainer.appendChild(infoNotice)
          return
        }

        // Отображаем все папки
        flatFolders.forEach((folder) => {
          const folderElement = document.createElement("div")
          folderElement.className = "gh-bookmark-folder-item"
          folderElement.dataset.folderId = folder.id
          folderElement.style.paddingLeft = folder.level * 20 + 8 + "px"

          folderElement.innerHTML = `
            <img src="${chrome.runtime.getURL(
              "assets/icons/folder.svg"
            )}" class="gh-bookmark-folder-icon">
            <span class="gh-bookmark-folder-name">${escapeHtml(
              folder.title
            )} [ID: ${folder.id}]</span>
          `

          folderElement.addEventListener("click", () => {
            // Снимаем выделение со всех папок
            modal
              .querySelectorAll(".gh-bookmark-folder-item")
              .forEach((item) => {
                item.classList.remove("gh-bookmark-folder-selected")
              })

            // Выделяем выбранную папку
            folderElement.classList.add("gh-bookmark-folder-selected")

            console.log(`Выбрана папка: ${folder.title} [ID: ${folder.id}]`)
          })

          folderContainer.appendChild(folderElement)
        })
      } catch (error) {
        console.error("[Debug] Ошибка при плоском отображении папок:", error)
        folderContainer.innerHTML = `
          <div class="gh-bookmark-folder-item gh-bookmark-folder-selected" data-folder-id="0">
            <img src="${chrome.runtime.getURL(
              "assets/icons/folder.svg"
            )}" class="gh-bookmark-folder-icon">
            <span class="gh-bookmark-folder-name">Корневая папка</span>
          </div>
          <div class="gh-bookmark-folder-notice">
            Ошибка при отображении: ${error.message}
          </div>
        `
      }
    })
  } catch (error) {
    console.error("[Debug] Критическая ошибка при плоском отображении:", error)
    folderContainer.innerHTML = `
      <div class="gh-bookmark-folder-item gh-bookmark-folder-selected" data-folder-id="0">
        <img src="${chrome.runtime.getURL(
          "assets/icons/folder.svg"
        )}" class="gh-bookmark-folder-icon">
        <span class="gh-bookmark-folder-name">Корневая папка</span>
      </div>
      <div class="gh-bookmark-folder-notice">
        Критическая ошибка: ${error.message}
      </div>
    `
  }
}
