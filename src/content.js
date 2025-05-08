// content.js - Скрипт для взаимодействия с DOM страницы

// Сообщаем background script, что content script загрузился
chrome.runtime.sendMessage(
  { action: "contentScriptLoaded", url: window.location.href },
  (response) => {
    console.log("Ответ на сообщение о загрузке content script:", response)
  }
)

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script получил сообщение:", request)

  // Обработка ping для проверки, загружен ли content script
  if (request.action === "ping") {
    sendResponse({ status: "content_script_active" })
    return true
  }

  // Обработка запроса на получение текста ссылки
  if (request.action === "getLinkText") {
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
      "Получен запрос на отображение модального окна добавления закладки:",
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

  // Создаем модальное окно
  const modal = document.createElement("div")
  modal.className = "gh-bookmark-modal"

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
            <h3>Выберите папку</h3>
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
}

/**
 * Добавляет стили для модального окна
 */
function addModalStyles() {
  // Проверяем, есть ли уже стили
  if (document.getElementById("gh-bookmark-modal-styles")) {
    return
  }

  // Создаем элемент стилей
  const style = document.createElement("style")
  style.id = "gh-bookmark-modal-styles"

  // Добавляем CSS
  style.textContent = `
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
      z-index: 10000000;
      font-family: Arial, sans-serif;
    }
    
    .gh-bookmark-modal-content {
      background-color: #fff;
      border-radius: 8px;
      width: 450px;
      max-width: 90%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      overflow: hidden;
    }
    
    .gh-bookmark-modal-header {
      padding: 15px 20px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .gh-bookmark-modal-header h2 {
      margin: 0;
      font-size: 18px;
      color: #333;
    }
    
    .gh-bookmark-modal-close {
      font-size: 24px;
      font-weight: bold;
      cursor: pointer;
      color: #777;
    }
    
    .gh-bookmark-modal-body {
      padding: 20px;
      overflow-y: auto;
      max-height: 60vh;
    }
    
    .gh-bookmark-form {
      margin-bottom: 20px;
    }
    
    .gh-bookmark-input-group {
      margin-bottom: 15px;
    }
    
    .gh-bookmark-input-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
      color: #333;
    }
    
    .gh-bookmark-input-group input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .gh-bookmark-folder-section h3 {
      font-size: 16px;
      margin: 0 0 10px 0;
      color: #333;
    }
    
    .gh-bookmark-folder-structure {
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 10px;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .gh-bookmark-loading {
      text-align: center;
      padding: 15px;
      color: #777;
    }
    
    .gh-bookmark-folder-item {
      padding: 8px 10px;
      border-radius: 4px;
      margin-bottom: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
      position: relative;
    }
    
    .gh-bookmark-folder-item:hover {
      background-color: #f5f5f5;
    }
    
    .gh-bookmark-folder-icon {
      width: 20px;
      height: 20px;
      margin-right: 8px;
    }
    
    .gh-bookmark-folder-name {
      flex-grow: 1;
    }
    
    .gh-bookmark-folder-arrow {
      width: 8px;
      height: 12px;
      margin-left: 5px;
    }
    
    .gh-bookmark-subfolder-container {
      margin-left: 20px;
      border-left: 1px solid #e0e0e0;
      padding-left: 10px;
    }
    
    .gh-bookmark-folder-selected {
      background-color: #e8f0fe;
      color: #1a73e8;
    }
    
    .gh-bookmark-folder-empty {
      padding: 15px;
      text-align: center;
      color: #777;
    }
    
    .gh-bookmark-modal-footer {
      padding: 15px 20px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    
    .gh-bookmark-cancel-btn {
      padding: 8px 16px;
      border: 1px solid #ccc;
      background-color: #f5f5f5;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      color: #333;
    }
    
    .gh-bookmark-save-btn {
      padding: 8px 16px;
      background-color: #1a73e8;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .gh-bookmark-cancel-btn:hover {
      background-color: #e9e9e9;
    }
    
    .gh-bookmark-save-btn:hover {
      background-color: #1765cc;
    }
    
    @media (prefers-color-scheme: dark) {
      .gh-bookmark-modal-content {
        background-color: #292a2d;
        color: #e8eaed;
      }
      
      .gh-bookmark-modal-header {
        border-bottom: 1px solid #3c4043;
      }
      
      .gh-bookmark-modal-header h2 {
        color: #e8eaed;
      }
      
      .gh-bookmark-modal-close {
        color: #9aa0a6;
      }
      
      .gh-bookmark-input-group label {
        color: #e8eaed;
      }
      
      .gh-bookmark-input-group input {
        background-color: #202124;
        border: 1px solid #5f6368;
        color: #e8eaed;
      }
      
      .gh-bookmark-folder-section h3 {
        color: #e8eaed;
      }
      
      .gh-bookmark-folder-structure {
        border: 1px solid #3c4043;
        background-color: #202124;
      }
      
      .gh-bookmark-loading {
        color: #9aa0a6;
      }
      
      .gh-bookmark-folder-item:hover {
        background-color: #35363a;
      }
      
      .gh-bookmark-folder-selected {
        background-color: #174ea6;
        color: #e8eaed;
      }
      
      .gh-bookmark-folder-empty {
        color: #9aa0a6;
      }
      
      .gh-bookmark-modal-footer {
        border-top: 1px solid #3c4043;
      }
      
      .gh-bookmark-cancel-btn {
        background-color: #3c4043;
        border: 1px solid #5f6368;
        color: #e8eaed;
      }
      
      .gh-bookmark-save-btn {
        background-color: #8ab4f8;
        color: #202124;
      }
      
      .gh-bookmark-cancel-btn:hover {
        background-color: #494c50;
      }
      
      .gh-bookmark-save-btn:hover {
        background-color: #78a9f7;
      }
    }
  `

  // Добавляем стили в документ
  document.head.appendChild(style)
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

    // Отправляем сообщение в background script для сохранения закладки
    chrome.runtime.sendMessage(
      {
        action: "saveBookmark",
        data: {
          parentId: selectedFolderId,
          title: bookmarkTitle,
          url: bookmarkUrl,
        },
      },
      (response) => {
        if (response && response.success) {
          alert("Закладка успешно сохранена!")
          document.body.removeChild(modal)
        } else {
          alert(
            "Ошибка при сохранении закладки: " +
              (response ? response.error : "Неизвестная ошибка")
          )
        }
      }
    )
  })

  // Делегируем обработку кликов по папкам
  modal.addEventListener("click", (e) => {
    const folderItem = e.target.closest(".gh-bookmark-folder-item")
    if (folderItem) {
      // Сохраняем ID выбранной папки
      selectedFolderId = folderItem.dataset.folderId

      // Снимаем выделение со всех папок
      modal.querySelectorAll(".gh-bookmark-folder-item").forEach((item) => {
        item.classList.remove("gh-bookmark-folder-selected")
      })

      // Выделяем выбранную папку
      folderItem.classList.add("gh-bookmark-folder-selected")
    }
  })
}

/**
 * Загружает структуру папок из хранилища
 * @param {HTMLElement} modal - Элемент модального окна
 */
function loadFolderStructure(modal) {
  const folderContainer = modal.querySelector(".gh-bookmark-folder-structure")

  // Отправляем запрос в background script для получения структуры папок
  chrome.runtime.sendMessage({ action: "getFolderStructure" }, (response) => {
    console.log("Получен ответ с структурой папок:", response)

    if (response && response.success && response.folders) {
      // Рендерим структуру папок
      renderFolderStructure(response.folders, folderContainer)
    } else {
      // Показываем сообщение об ошибке
      folderContainer.innerHTML = `
        <div class="gh-bookmark-folder-empty">
          Не удалось загрузить структуру папок. Пожалуйста, попробуйте снова.
        </div>
      `
    }
  })
}

/**
 * Отображает структуру папок в модальном окне
 * @param {Array} folders - Массив папок
 * @param {HTMLElement} container - Контейнер для отображения
 */
function renderFolderStructure(folders, container) {
  console.log("Отображаем структуру папок:", folders)

  // Очищаем контейнер
  container.innerHTML = ""

  if (!folders || folders.length === 0) {
    container.innerHTML = `
      <div class="gh-bookmark-folder-empty">
        Папки не найдены. Добавьте папки в менеджере закладок.
      </div>
    `
    return
  }

  // Добавляем корневую папку
  const rootFolder = document.createElement("div")
  rootFolder.className = "gh-bookmark-folder-item gh-bookmark-folder-selected"
  rootFolder.dataset.folderId = "0"
  rootFolder.innerHTML = `
    <img src="${chrome.runtime.getURL(
      "assets/icons/folder.svg"
    )}" class="gh-bookmark-folder-icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 20 20\"><path d=\"M18 5H12L10 3H2C0.9 3 0 3.9 0 5V17C0 18.1 0.9 19 2 19H18C19.1 19 20 18.1 20 17V7C20 5.9 19.1 5 18 5ZM18 17H2V7H18V17Z\" fill=\"%23FFA000\"/></svg>'">
    <span class="gh-bookmark-folder-name">Корневая папка</span>
  `
  container.appendChild(rootFolder)

  // Добавляем остальные папки
  folders.forEach((folder) => {
    container.appendChild(renderFolder(folder))
  })

  // Настраиваем обработчики событий для вложенных папок
  setupFolderEventListeners(container)
}

/**
 * Рендерит отдельную папку
 * @param {Object} folder - Объект папки
 * @returns {HTMLElement} - DOM элемент папки
 */
function renderFolder(folder) {
  const folderElement = document.createElement("div")
  folderElement.className = "gh-bookmark-folder-item"
  folderElement.dataset.folderId = folder.id

  const hasChildren = folder.children && folder.children.length > 0

  folderElement.innerHTML = `
    <img src="${chrome.runtime.getURL(
      "assets/icons/folder.svg"
    )}" class="gh-bookmark-folder-icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\" viewBox=\"0 0 20 20\"><path d=\"M18 5H12L10 3H2C0.9 3 0 3.9 0 5V17C0 18.1 0.9 19 2 19H18C19.1 19 20 18.1 20 17V7C20 5.9 19.1 5 18 5ZM18 17H2V7H18V17Z\" fill=\"%23FFA000\"/></svg>'">
    <span class="gh-bookmark-folder-name">${escapeHtml(folder.title)}</span>
    ${
      hasChildren
        ? `<img src="${chrome.runtime.getURL(
            "assets/icons/arrow_right.svg"
          )}" class="gh-bookmark-folder-arrow" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"12\" viewBox=\"0 0 8 12\"><path d=\"M1.5 0L0 1.5L4.5 6L0 10.5L1.5 12L7.5 6L1.5 0Z\" fill=\"%23888888\"/></svg>'>`
        : ""
    }
  `

  // Если есть дочерние папки, создаем для них контейнер (скрытый по умолчанию)
  if (hasChildren) {
    const subfolderContainer = document.createElement("div")
    subfolderContainer.className = "gh-bookmark-subfolder-container"
    subfolderContainer.style.display = "none" // Скрыт по умолчанию

    // Добавляем дочерние папки в контейнер
    folder.children.forEach((childFolder) => {
      subfolderContainer.appendChild(renderFolder(childFolder))
    })

    folderElement.appendChild(subfolderContainer)
  }

  return folderElement
}

/**
 * Настраивает обработчики событий для вложенных папок
 * @param {HTMLElement} container - Контейнер с папками
 */
function setupFolderEventListeners(container) {
  // Находим все папки с дочерними элементами
  const foldersWithChildren = container.querySelectorAll(
    ".gh-bookmark-folder-item img.gh-bookmark-folder-arrow"
  )

  // Добавляем обработчики для отображения/скрытия вложенных папок
  foldersWithChildren.forEach((arrow) => {
    arrow.addEventListener("click", (e) => {
      e.stopPropagation() // Предотвращаем всплытие, чтобы не выбирать родительскую папку

      const folderItem = arrow.closest(".gh-bookmark-folder-item")
      const subfoldersContainer = folderItem.querySelector(
        ".gh-bookmark-subfolder-container"
      )

      if (subfoldersContainer) {
        // Переключаем видимость
        if (subfoldersContainer.style.display === "none") {
          subfoldersContainer.style.display = "block"
          // Поворачиваем стрелку
          arrow.style.transform = "rotate(90deg)"
        } else {
          subfoldersContainer.style.display = "none"
          // Возвращаем стрелку в исходное положение
          arrow.style.transform = "rotate(0)"
        }
      }
    })
  })
}
