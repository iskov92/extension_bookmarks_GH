export function initTheme() {
  // Получаем предпочтительную тему из хранилища
  chrome.storage.local.get(["isDarkTheme"], function (result) {
    // Проверяем сохраненную тему или используем системные настройки
    const prefersDark =
      result.isDarkTheme !== undefined
        ? result.isDarkTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches

    // Применяем темную тему, если она предпочтительна
    document.body.classList.toggle("dark-theme", prefersDark)
    document.body.setAttribute("data-theme", prefersDark ? "dark" : "light")

    // Обновляем переключатель темы, если он есть на странице
    const themeToggle = document.getElementById("themeToggle")
    if (themeToggle) {
      themeToggle.checked = prefersDark
    }
  })

  // Отслеживаем изменения системной темы
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      const prefersDark = e.matches
      setTheme(prefersDark)
    })
}

// Функция для установки темы
export async function setTheme(isDark) {
  document.body.classList.toggle("dark-theme", isDark)
  document.body.setAttribute("data-theme", isDark ? "dark" : "light")

  // Обновляем переключатель темы
  const themeToggle = document.getElementById("themeToggle")
  if (themeToggle) {
    themeToggle.checked = isDark
  }

  // Сохраняем настройку в хранилище
  await chrome.storage.local.set({ isDarkTheme: isDark })
}
