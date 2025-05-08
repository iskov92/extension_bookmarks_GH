document.addEventListener("DOMContentLoaded", function () {
  // Кнопки и результаты
  const checkButton = document.getElementById("check-structure")
  const resetButton = document.getElementById("reset-structure")
  const fixButton = document.getElementById("fix-structure")

  const checkResult = document.getElementById("check-result")
  const resetResult = document.getElementById("reset-result")
  const fixResult = document.getElementById("fix-result")

  // Функция для проверки структуры
  checkButton.addEventListener("click", function () {
    chrome.storage.local.get("gh_bookmarks", function (data) {
      let resultHtml = ""

      if (!data || !data.gh_bookmarks) {
        resultHtml =
          '<span class="error">Ошибка: структура закладок отсутствует в хранилище</span>'
      } else {
        const bookmarks = data.gh_bookmarks

        // Начальная информация
        resultHtml += "<h3>Базовая информация:</h3>"
        resultHtml += `<p>ID корневого элемента: ${
          bookmarks.id || '<span class="error">отсутствует</span>'
        }</p>`
        resultHtml += `<p>Тип корневого элемента: ${
          bookmarks.type || '<span class="error">отсутствует</span>'
        }</p>`
        resultHtml += `<p>Заголовок корневого элемента: ${
          bookmarks.title || '<span class="error">отсутствует</span>'
        }</p>`

        // Проверка children
        if (!bookmarks.children) {
          resultHtml +=
            '<p><span class="error">Ошибка: отсутствует массив children</span></p>'
        } else if (!Array.isArray(bookmarks.children)) {
          resultHtml +=
            '<p><span class="error">Ошибка: children не является массивом</span></p>'
        } else {
          resultHtml += `<p>Количество элементов в children: ${bookmarks.children.length}</p>`

          // Проверка папок верхнего уровня
          if (bookmarks.children.length > 0) {
            resultHtml += "<h3>Папки верхнего уровня:</h3>"
            resultHtml += "<ul>"

            bookmarks.children.forEach((item, index) => {
              if (!item) {
                resultHtml += `<li>Элемент #${index}: <span class="error">пустой элемент (null или undefined)</span></li>`
                return
              }

              const itemType =
                item.type ||
                (item.url ? "bookmark" : item.children ? "folder" : "unknown")
              const typeClass =
                itemType === "folder"
                  ? "success"
                  : itemType === "bookmark"
                  ? ""
                  : "error"

              resultHtml += `<li>Элемент #${index}: ID=${
                item.id || '<span class="error">отсутствует</span>'
              }, 
                Тип=<span class="${typeClass}">${itemType}</span>, 
                Название=${
                  item.title || '<span class="error">отсутствует</span>'
                }`

              if (itemType === "folder") {
                if (!item.children || !Array.isArray(item.children)) {
                  resultHtml += `, <span class="error">children отсутствует или не является массивом</span>`
                } else {
                  resultHtml += `, Дочерних элементов: ${item.children.length}`
                }
              }

              resultHtml += "</li>"
            })

            resultHtml += "</ul>"
          }
        }

        // Полная структура
        resultHtml += "<h3>Полная структура:</h3>"
        resultHtml += `<pre>${JSON.stringify(bookmarks, null, 2)}</pre>`
      }

      checkResult.innerHTML = resultHtml
      checkResult.style.display = "block"
    })
  })

  // Функция для сброса структуры
  resetButton.addEventListener("click", function () {
    if (
      confirm(
        "Вы уверены? Это действие полностью удалит существующую структуру закладок и создаст новую."
      )
    ) {
      resetResult.innerHTML = "Выполняется сброс структуры..."
      resetResult.style.display = "block"

      // 1. Удаляем текущую структуру
      chrome.storage.local.remove("gh_bookmarks", function () {
        resetResult.innerHTML += "<br>✓ Текущая структура удалена"

        // 2. Создаем новую структуру
        const defaultBookmarks = {
          id: "0",
          title: "root",
          type: "folder",
          children: [
            createDefaultFolder("Избранное"),
            createDefaultFolder("Работа"),
            createDefaultFolder("Личное"),
          ],
        }

        // 3. Сохраняем новую структуру
        chrome.storage.local.set(
          { gh_bookmarks: defaultBookmarks },
          function () {
            resetResult.innerHTML += "<br>✓ Создана и сохранена новая структура"

            // 4. Проверяем, что структура сохранилась
            chrome.storage.local.get("gh_bookmarks", function (data) {
              if (data && data.gh_bookmarks && data.gh_bookmarks.children) {
                resetResult.innerHTML += "<br>✓ Проверка успешна"
                resetResult.innerHTML +=
                  '<br><br><span class="success">Структура закладок успешно сброшена!</span>'
                resetResult.innerHTML += "<br><br>Новая структура:"
                resetResult.innerHTML += `<pre>${JSON.stringify(
                  data.gh_bookmarks,
                  null,
                  2
                )}</pre>`
              } else {
                resetResult.innerHTML +=
                  '<br><span class="error">❌ Ошибка: структура не сохранилась корректно</span>'
              }
            })
          }
        )
      })
    }
  })

  // Функция для исправления структуры
  fixButton.addEventListener("click", function () {
    fixResult.innerHTML = "Выполняется исправление структуры..."
    fixResult.style.display = "block"

    // Отправляем сообщение фоновому скрипту
    chrome.runtime.sendMessage(
      { action: "fixBookmarksStructure" },
      function (response) {
        if (response && response.success) {
          fixResult.innerHTML += "<br>✓ Исправление структуры выполнено"

          // Проверяем результат
          chrome.storage.local.get("gh_bookmarks", function (data) {
            if (data && data.gh_bookmarks && data.gh_bookmarks.children) {
              fixResult.innerHTML += "<br>✓ Проверка успешна"
              fixResult.innerHTML +=
                '<br><br><span class="success">Структура закладок успешно исправлена!</span>'
              fixResult.innerHTML += "<br><br>Исправленная структура:"
              fixResult.innerHTML += `<pre>${JSON.stringify(
                data.gh_bookmarks,
                null,
                2
              )}</pre>`
            } else {
              fixResult.innerHTML +=
                '<br><span class="error">❌ Ошибка: структура не исправлена корректно</span>'

              // Предлагаем сброс как альтернативу
              fixResult.innerHTML +=
                "<br><br>Рекомендуется выполнить полный сброс структуры."
            }
          })
        } else {
          fixResult.innerHTML +=
            '<br><span class="error">❌ Ошибка при исправлении: ' +
            (response
              ? response.error || "неизвестная ошибка"
              : "нет ответа от фонового скрипта") +
            "</span>"
        }
      }
    )
  })
})

// Функция для создания папки по умолчанию
function createDefaultFolder(title) {
  return {
    id:
      "folder_" +
      Date.now().toString(36) +
      Math.random().toString(36).substr(2),
    title: title,
    type: "folder",
    children: [],
  }
}
