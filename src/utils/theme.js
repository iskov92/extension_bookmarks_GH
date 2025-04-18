export function initTheme() {
  const themeToggle = document.getElementById("themeToggle")
  const themeStylesheet = document.getElementById("theme-stylesheet")

  // Загружаем сохраненную тему или используем темную по умолчанию
  chrome.storage.sync.get(["isDarkTheme"], function (result) {
    const isDarkTheme = result.isDarkTheme ?? true // true = темная тема по умолчанию

    // Устанавливаем тему сразу при загрузке
    document.body.setAttribute("data-theme", isDarkTheme ? "dark" : "light")
    themeStylesheet.href = `./styles/${
      isDarkTheme ? "dark" : "light"
    }-theme.css`
    themeToggle.checked = isDarkTheme

    // Добавляем анимацию только после установки начальной темы
    setTimeout(() => {
      document.body.style.transition =
        "background-color var(--transition-speed), color var(--transition-speed)"
    }, 100)
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
