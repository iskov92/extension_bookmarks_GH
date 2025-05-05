/**
 * Утилиты для работы с изображениями
 */

/**
 * Оптимизирует изображение для использования в качестве иконки
 * @param {File} file - Файл изображения
 * @returns {Promise<Blob>} - Оптимизированное изображение
 */
export async function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = () => {
        try {
          // Создаем canvas и масштабируем изображение
          const canvas = document.createElement("canvas")
          const MAX_SIZE = 64 // Максимальный размер иконки

          let width = img.width
          let height = img.height

          // Масштабируем, сохраняя пропорции
          if (width > height && width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width)
            width = MAX_SIZE
          } else if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height)
            height = MAX_SIZE
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext("2d")
          ctx.drawImage(img, 0, 0, width, height)

          // Конвертируем в Blob с меньшим качеством
          canvas.toBlob((blob) => {
            resolve(blob)
          }, "image/png")
        } catch (err) {
          reject(err)
        }
      }

      img.onerror = () => {
        reject(new Error("Не удалось загрузить изображение"))
      }

      img.src = event.target.result
    }

    reader.onerror = () => {
      reject(reader.error)
    }

    reader.readAsDataURL(file)
  })
}
