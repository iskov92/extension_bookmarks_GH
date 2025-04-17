export function initTheme() {
  const themeToggle = document.getElementById("themeToggle")
  const themeStylesheet = document.getElementById("theme-stylesheet")

  // Загружаем сохраненную тему
  chrome.storage.sync.get(["isDarkTheme"], function (result) {
    const isDarkTheme = result.isDarkTheme ?? false
    setTheme(isDarkTheme)
    themeToggle.checked = isDarkTheme
  })

  // Обработчик переключения темы
  themeToggle.addEventListener("change", function () {
    setTheme(this.checked)
  })
}

function setTheme(isDark) {
  const themeStylesheet = document.getElementById("theme-stylesheet")
  themeStylesheet.href = `styles/${isDark ? "dark" : "light"}-theme.css`

  // Сохраняем выбор темы
  chrome.storage.sync.set({ isDarkTheme: isDark })

  // Добавляем класс для анимации
  document.body.style.transition =
    "background-color var(--transition-speed), color var(--transition-speed)"
}
