export function initTheme() {
  const themeToggle = document.getElementById("themeToggle")

  // Загружаем сохраненную тему
  chrome.storage.sync.get(["isDarkTheme"], function (result) {
    const isDarkTheme = result.isDarkTheme ?? true // true = темная тема по умолчанию

    // Если текущая тема не соответствует сохраненной, меняем её
    const currentTheme = document.body.getAttribute("data-theme")
    if (
      (currentTheme === "dark" && !isDarkTheme) ||
      (currentTheme === "light" && isDarkTheme)
    ) {
      setTheme(isDarkTheme)
    }

    themeToggle.checked = isDarkTheme

    // Добавляем анимацию для будущих переключений
    document.body.style.transition =
      "background-color var(--transition-speed), color var(--transition-speed)"
  })

  // Обработчик переключения темы
  themeToggle.addEventListener("change", function () {
    setTheme(this.checked)
  })
}

function setTheme(isDark) {
  const themeStylesheet = document.getElementById("theme-stylesheet")
  themeStylesheet.href = `./styles/${isDark ? "dark" : "light"}-theme.css`

  // Сохраняем выбор темы
  chrome.storage.sync.set({ isDarkTheme: isDark })

  // Устанавливаем атрибут темы
  document.body.setAttribute("data-theme", isDark ? "dark" : "light")
}
