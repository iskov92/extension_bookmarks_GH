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
      showSimpleBookmarkModal(request.data.url, request.data.title)
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
 * Отображает модальное окно добавления закладки с выбором папки
 * @param {string} url - URL закладки
 * @param {string} title - Заголовок закладки
 */
function showSimpleBookmarkModal(url, title) {
  console.log("Отображаем модальное окно добавления закладки:", {
    url,
    title,
  })

  // Определяем тему из хранилища
  chrome.storage.sync.get("isDarkTheme", (data) => {
    const isDarkTheme = data.isDarkTheme === undefined ? true : data.isDarkTheme
    console.log("[Content] Текущая тема:", isDarkTheme ? "темная" : "светлая")

    // Цвета для темной и светлой темы
    const colors = isDarkTheme
      ? {
          bg: "rgba(0, 0, 0, 0.75)",
          modal: "#1e1e1e",
          text: "#e0e0e0",
          border: "#333",
          button: "#333",
          buttonText: "#e0e0e0",
          primaryButton: "#4f46e5",
          primaryButtonHover: "#3730a3",
          inputBg: "#252525",
          inputBorder: "#444",
          infoBox: "#252525",
          infoBorder: "#3730a3",
          dropdownBg: "#252525",
          dropdownItemHover: "#333",
        }
      : {
          bg: "rgba(0, 0, 0, 0.5)",
          modal: "white",
          text: "#333",
          border: "#ccc",
          button: "#f5f5f5",
          buttonText: "#333",
          primaryButton: "#4f46e5",
          primaryButtonHover: "#3730a3",
          inputBg: "white",
          inputBorder: "#ccc",
          infoBox: "#f8f9fa",
          infoBorder: "#4f46e5",
          dropdownBg: "white",
          dropdownItemHover: "#f5f5f5",
        }

    // Создаем модальное окно
    const modal = document.createElement("div")
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: ${colors.bg};
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      transition: opacity 0.2s ease;
      opacity: 0;
    `

    // Содержимое модального окна
    modal.innerHTML = `
      <div style="background-color: ${colors.modal}; color: ${
      colors.text
    }; padding: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.25); width: 400px; max-width: 90%;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
          <h2 style="margin: 0; font-size: 18px; color: ${
            colors.text
          };">Добавить в менеджер закладок GH</h2>
          <button class="close-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${
            colors.text
          };">&times;</button>
        </div>
        
        <div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: ${
              colors.text
            };">Название</label>
            <input type="text" class="title-input" value="${escapeHTML(
              title
            )}" style="width: 100%; padding: 8px; border: 1px solid ${
      colors.inputBorder
    }; border-radius: 4px; box-sizing: border-box; background-color: ${
      colors.inputBg
    }; color: ${colors.text};">
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: ${
              colors.text
            };">URL</label>
            <input type="text" class="url-input" value="${escapeHTML(
              url
            )}" style="width: 100%; padding: 8px; border: 1px solid ${
      colors.inputBorder
    }; border-radius: 4px; box-sizing: border-box; background-color: ${
      colors.inputBg
    }; color: ${colors.text};">
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: ${
              colors.text
            };">Папка</label>
            <div class="folder-select-container" style="position: relative;">
              <select class="folder-select" style="width: 100%; padding: 8px; border: 1px solid ${
                colors.inputBorder
              }; border-radius: 4px; box-sizing: border-box; background-color: ${
      colors.dropdownBg
    }; color: ${colors.text}; appearance: none; cursor: pointer;">
                <option value="loading" disabled selected>Загрузка папок...</option>
              </select>
              <div style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); pointer-events: none;">
                <svg width="12" height="6" viewBox="0 0 12 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L6 5L11 1" stroke="${
                    colors.text
                  }" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
            <div class="folder-loading-error" style="display: none; color: #ff5555; font-size: 12px; margin-top: 4px;">
              Ошибка загрузки папок. <a href="#" class="retry-folders-link" style="color: #4f46e5; text-decoration: underline;">Повторить</a>
            </div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: flex-end;">
          <button class="cancel-btn" style="margin-right: 10px; padding: 8px 16px; background-color: ${
            colors.button
          }; border: 1px solid ${
      colors.border
    }; border-radius: 4px; cursor: pointer; color: ${
      colors.buttonText
    };">Отмена</button>
          <button class="save-btn" style="padding: 8px 16px; background-color: ${
            colors.primaryButton
          }; color: white; border: none; border-radius: 4px; cursor: pointer;">Сохранить</button>
        </div>
      </div>
    `

    // Добавляем модальное окно на страницу
    document.body.appendChild(modal)

    // Анимация появления
    setTimeout(() => {
      modal.style.opacity = "1"
    }, 10)

    // Добавляем стили для ховера к кнопке сохранения
    const saveBtn = modal.querySelector(".save-btn")
    saveBtn.addEventListener("mouseenter", () => {
      saveBtn.style.backgroundColor = colors.primaryButtonHover
    })
    saveBtn.addEventListener("mouseleave", () => {
      saveBtn.style.backgroundColor = colors.primaryButton
    })

    // Загружаем список папок из хранилища
    loadFolderStructure(modal)

    // Повторная загрузка папок при клике на ссылку "Повторить"
    const retryLink = modal.querySelector(".retry-folders-link")
    retryLink.addEventListener("click", (e) => {
      e.preventDefault()
      loadFolderStructure(modal)
    })

    // Обработчики событий
    // Закрытие модального окна при клике на крестик
    const closeBtn = modal.querySelector(".close-btn")
    closeBtn.addEventListener("click", () => {
      closeModal()
    })

    // Закрытие модального окна при клике на фон
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal()
      }
    })

    // Отмена
    const cancelBtn = modal.querySelector(".cancel-btn")
    cancelBtn.addEventListener("click", () => {
      closeModal()
    })

    // Функция закрытия с анимацией
    function closeModal() {
      modal.style.opacity = "0"
      setTimeout(() => {
        document.body.removeChild(modal)
      }, 200)
    }

    // Сохранение закладки
    saveBtn.addEventListener("click", () => {
      // Получаем значения из полей
      const titleInput = modal.querySelector(".title-input")
      const urlInput = modal.querySelector(".url-input")
      const folderSelect = modal.querySelector(".folder-select")

      const bookmarkTitle = titleInput.value.trim()
      const bookmarkUrl = urlInput.value.trim()
      const selectedFolderId = folderSelect.value

      console.log("[Content] Пытаемся сохранить закладку:", {
        title: bookmarkTitle,
        url: bookmarkUrl,
        folderId: selectedFolderId,
      })

      // Выводим содержимое списка папок для отладки
      console.log("[Content] Список доступных папок:")
      for (let i = 0; i < folderSelect.options.length; i++) {
        console.log(
          `- Опция ${i}: ${folderSelect.options[i].text} (ID: ${folderSelect.options[i].value})`
        )
      }

      // Проверяем заполнение полей
      if (!bookmarkTitle) {
        alert("Пожалуйста, введите название закладки")
        return
      }

      if (!bookmarkUrl) {
        alert("Пожалуйста, введите URL закладки")
        return
      }

      if (selectedFolderId === "loading" || !selectedFolderId) {
        alert("Пожалуйста, выберите папку для сохранения")
        return
      }

      // Форматируем URL
      let validUrl = bookmarkUrl
      if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
        validUrl = "https://" + validUrl
      }

      // Показываем состояние загрузки
      saveBtn.textContent = "Сохранение..."
      saveBtn.disabled = true

      try {
        // Получаем иконку сайта
        const hostname = new URL(validUrl).hostname
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`

        // Создаем объект закладки
        const bookmark = {
          id:
            "bk_" +
            Date.now().toString(36) +
            Math.random().toString(36).substring(2, 5),
          title: bookmarkTitle,
          url: validUrl,
          type: "bookmark",
          favicon: faviconUrl || "/assets/icons/link.svg", // Используем иконку по умолчанию, если не удалось получить
          addedAt: new Date().toISOString(),
        }

        console.log("[Content] Создан объект закладки:", bookmark)

        // Получаем текущие данные из хранилища
        chrome.storage.local.get("gh_bookmarks", (data) => {
          console.log(
            "[Content] Получены данные из хранилища для сохранения:",
            data
          )

          // Проверяем наличие данных
          if (!data || !data.gh_bookmarks) {
            console.error("[Content] Данные закладок отсутствуют в хранилище")
            alert("Ошибка: данные закладок отсутствуют в хранилище")
            saveBtn.textContent = "Сохранить"
            saveBtn.disabled = false
            return
          }

          let bookmarks = data.gh_bookmarks
          let updated = false

          // Если корневая папка (значение "0")
          if (selectedFolderId === "0") {
            console.log("[Content] Сохраняем в корневую папку")

            // Проверяем формат данных (массив или объект)
            if (Array.isArray(bookmarks)) {
              // Добавляем закладку в корень (массив)
              bookmarks.push(bookmark)
              updated = true
            }
          } else {
            // Ищем выбранную папку и добавляем в неё закладку
            function addBookmarkToFolder(items) {
              if (!Array.isArray(items)) return false

              for (let i = 0; i < items.length; i++) {
                const item = items[i]

                // Проверяем, это нужная папка?
                if (item.type === "folder" && item.id === selectedFolderId) {
                  console.log(
                    `[Content] Найдена папка для сохранения: ${item.title} (ID: ${item.id})`
                  )

                  // Создаем массив children, если его нет
                  if (!item.children) {
                    item.children = []
                  }

                  // Добавляем закладку
                  item.children.push(bookmark)
                  console.log(
                    `[Content] Закладка добавлена в папку ${item.title}`
                  )
                  return true
                }

                // Если у элемента есть дети, рекурсивно ищем в них
                if (
                  item.type === "folder" &&
                  item.children &&
                  Array.isArray(item.children)
                ) {
                  if (addBookmarkToFolder(item.children)) {
                    return true
                  }
                }
              }

              return false
            }

            // Запускаем функцию добавления
            updated = addBookmarkToFolder(bookmarks)
          }

          // Если не удалось добавить закладку
          if (!updated) {
            console.error(
              "[Content] Не удалось найти указанную папку:",
              selectedFolderId
            )
            alert("Ошибка: не удалось найти указанную папку")
            saveBtn.textContent = "Сохранить"
            saveBtn.disabled = false
            return
          }

          // Сохраняем обновленные данные
          chrome.storage.local.set({ gh_bookmarks: bookmarks }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Content] Ошибка при сохранении:",
                chrome.runtime.lastError
              )
              alert("Ошибка: " + chrome.runtime.lastError.message)
              saveBtn.textContent = "Сохранить"
              saveBtn.disabled = false
              return
            }

            console.log("[Content] Закладка успешно сохранена")
            showNotification("Закладка успешно сохранена!", 2000)
            closeModal()
          })
        })
      } catch (error) {
        console.error("[Content] Ошибка при создании закладки:", error)
        saveBtn.textContent = "Сохранить"
        saveBtn.disabled = false
        alert("Ошибка: " + error.message)
      }
    })
  })
}

/**
 * Загружает структуру папок из хранилища и заполняет выпадающий список
 * @param {HTMLElement} modal - Элемент модального окна
 */
function loadFolderStructure(modal) {
  console.log(
    "[Content] Загружаем структуру папок напрямую из chrome.storage.local"
  )

  const folderSelect = modal.querySelector(".folder-select")
  const errorElement = modal.querySelector(".folder-loading-error")

  // Отображаем состояние загрузки
  folderSelect.innerHTML =
    '<option value="loading" disabled selected>Загрузка папок...</option>'
  errorElement.style.display = "none"

  // Получаем данные напрямую из хранилища
  chrome.storage.local.get(null, (data) => {
    console.log("[Content] Получены данные из хранилища:", data)

    // Всегда добавляем корневую папку
    folderSelect.innerHTML = '<option value="0">Корневая папка</option>'

    // Проверяем, есть ли данные
    if (!data || !data.gh_bookmarks) {
      console.error("[Content] Данные закладок отсутствуют в хранилище")
      errorElement.style.display = "block"
      return
    }

    const bookmarks = data.gh_bookmarks

    // Проверяем, является ли gh_bookmarks массивом (новый формат) или объектом со свойством children (старый формат)
    if (Array.isArray(bookmarks)) {
      console.log(
        "[Content] Обнаружена структура в формате массива, обрабатываем..."
      )

      // Находим все папки в массиве
      const folders = bookmarks.filter((item) => item && item.type === "folder")
      console.log(
        "[Content] Найдены папки верхнего уровня:",
        folders.map((f) => `${f.title} (ID: ${f.id})`).join(", ")
      )

      if (folders.length === 0) {
        console.log("[Content] Папки не найдены в массиве закладок")
        return
      }

      // Рекурсивно добавляем папки в селект
      function addFoldersToSelect(folders, indent = "") {
        folders.forEach((folder) => {
          const option = document.createElement("option")
          option.value = folder.id
          option.textContent = indent + folder.title
          folderSelect.appendChild(option)
          console.log(
            `[Content] Добавлена папка в выпадающий список: ${
              indent + folder.title
            } (ID: ${folder.id})`
          )

          // Рекурсивно добавляем подпапки, если они есть
          if (folder.children && Array.isArray(folder.children)) {
            // Фильтруем только папки из детей
            const subfolders = folder.children.filter(
              (item) => item && item.type === "folder"
            )
            if (subfolders.length > 0) {
              console.log(
                `[Content] У папки ${folder.title} найдены подпапки: ${subfolders.length}`
              )
              addFoldersToSelect(subfolders, indent + "— ")
            }
          }
        })
      }

      // Добавляем все папки в select
      addFoldersToSelect(folders)
    } else if (bookmarks && typeof bookmarks === "object") {
      // Старый формат (объект с children)
      console.log("[Content] Обнаружена структура в формате объекта с children")
      if (!bookmarks.children || !Array.isArray(bookmarks.children)) {
        console.error(
          "[Content] Структура закладок повреждена, отсутствует массив children"
        )
        errorElement.style.display = "block"
        return
      }

      // Находим все папки в children
      const folders = bookmarks.children.filter(
        (item) => item && item.type === "folder"
      )
      console.log(
        "[Content] Найдены папки:",
        folders.map((f) => `${f.title} (ID: ${f.id})`).join(", ")
      )

      if (folders.length === 0) {
        console.log("[Content] Папки не найдены")
        return
      }

      // Рекурсивно добавляем папки в селект
      function addFoldersToSelect(folders, indent = "") {
        folders.forEach((folder) => {
          const option = document.createElement("option")
          option.value = folder.id
          option.textContent = indent + folder.title
          folderSelect.appendChild(option)
          console.log(
            `[Content] Добавлена папка в выпадающий список: ${
              indent + folder.title
            } (ID: ${folder.id})`
          )

          // Рекурсивно добавляем подпапки
          if (folder.children && folder.children.length > 0) {
            const subfolders = folder.children.filter(
              (item) => item && item.type === "folder"
            )
            if (subfolders.length > 0) {
              console.log(
                `[Content] У папки ${folder.title} найдены подпапки: ${subfolders.length}`
              )
              addFoldersToSelect(subfolders, indent + "— ")
            }
          }
        })
      }

      // Добавляем все папки в select
      addFoldersToSelect(folders)
    } else {
      console.error(
        "[Content] Неизвестный формат данных в хранилище:",
        bookmarks
      )
      errorElement.style.display = "block"
    }

    console.log(
      "[Content] Структура папок загружена, всего опций в выпадающем списке:",
      folderSelect.options.length
    )
  })
}

/**
 * Показывает уведомление
 * @param {string} message - Сообщение
 * @param {number} duration - Длительность в мс
 */
function showNotification(message, duration = 3000) {
  const notification = document.createElement("div")
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #4f46e5;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    opacity: 0;
    transition: opacity 0.3s ease;
  `
  notification.textContent = message
  document.body.appendChild(notification)

  setTimeout(() => {
    notification.style.opacity = "1"
  }, 10)

  setTimeout(() => {
    notification.style.opacity = "0"
    setTimeout(() => {
      document.body.removeChild(notification)
    }, 300)
  }, duration)
}

/**
 * Экранирует HTML-символы
 * @param {string} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
function escapeHTML(text) {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

/**
 * Тестирует данные в локальном хранилище Chrome
 */
function testStorage() {
  console.log("[Content] Тестирование данных в хранилище")

  // Запрашиваем данные из хранилища для отладки
  chrome.storage.local.get(null, (data) => {
    console.log("[Content] Все данные в локальном хранилище:", data)

    if (data && data.gh_bookmarks) {
      console.log("[Content] Данные gh_bookmarks:")
      console.log("ID:", data.gh_bookmarks.id)
      console.log("Тип:", data.gh_bookmarks.type)
      console.log("Название:", data.gh_bookmarks.title)

      if (data.gh_bookmarks.children) {
        console.log("Количество детей:", data.gh_bookmarks.children.length)

        // Выводим все папки верхнего уровня
        const folders = data.gh_bookmarks.children.filter(
          (item) => item && item.type === "folder"
        )
        console.log(
          "Папки верхнего уровня:",
          folders.map((f) => f.title).join(", ")
        )

        // Выводим все закладки верхнего уровня
        const bookmarks = data.gh_bookmarks.children.filter(
          (item) => item && item.type === "bookmark"
        )
        console.log(
          "Закладки верхнего уровня:",
          bookmarks.map((b) => b.title).join(", ")
        )
      } else {
        console.log("Дети отсутствуют")
      }
    } else {
      console.log("[Content] Данные gh_bookmarks отсутствуют")
    }
  })
}

// Вызываем функцию тестирования при загрузке скрипта
testStorage()
