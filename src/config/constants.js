// Пути к иконкам
export const ICONS = {
  FOLDER: {
    LIGHT: "/assets/icons/folder_white.svg",
    DARK: "/assets/icons/folder_black.svg",
    DEFAULT_DARK: "/assets/icons/folder_black.svg",
  },
  LINK: "/assets/icons/link.svg",
  NOTE: {
    LIGHT: "/assets/icons/note_white.svg",
    DARK: "/assets/icons/note_black.svg",
  },
  EDIT: {
    LIGHT: "/assets/icons/edit_white.svg",
    DARK: "/assets/icons/edit_black.svg",
  },
  DELETE: {
    LIGHT: "/assets/icons/delete_white.svg",
    DARK: "/assets/icons/delete_black.svg",
  },
  MOVE: {
    LIGHT: "/assets/icons/move_white.svg",
    DARK: "/assets/icons/move_black.svg",
  },
}

// Тексты интерфейса
export const UI_TEXTS = {
  MODALS: {
    CREATE_FOLDER: "Создать папку",
    ADD_BOOKMARK: "Добавить закладку",
    CREATE_NOTE: "Создать заметку",
    EDIT_BOOKMARK: "Изменить закладку",
    EDIT_FOLDER: "Изменить папку",
    EDIT_NOTE: "Редактировать заметку",
    SELECT_TYPE: "Выберите тип",
  },
  BUTTONS: {
    CREATE_FOLDER: "Создать папку",
    ADD_BOOKMARK: "Добавить закладку",
    CREATE_NOTE: "Создать заметку",
    EDIT: "Изменить",
    DELETE: "Удалить",
    COPY: "Копировать",
    CANCEL: "Отмена",
    SAVE: "Сохранить",
  },
  LABELS: {
    FOLDER_NAME: "Название папки",
    BOOKMARK_NAME: "Название закладки",
    BOOKMARK_URL: "URL закладки",
    NOTE_TITLE: "Название заметки",
    NOTE_CONTENT: "Содержимое заметки",
    UPLOAD_ICON: "Загрузить иконку",
  },
  CONFIRMATIONS: {
    DELETE: "Вы уверены, что хотите удалить этот элемент?",
  },
  VALIDATIONS: {
    EMPTY_FOLDER_NAME: "Название папки не может быть пустым",
    EMPTY_BOOKMARK_NAME: "Название закладки не может быть пустым",
    EMPTY_NOTE_TITLE: "Название заметки не может быть пустым",
    INVALID_IMAGE: "Пожалуйста, выберите изображение",
  },
}

// Конфигурация контекстного меню
export const CONTEXT_MENU_CONFIG = {
  FOLDER: [
    {
      text: UI_TEXTS.BUTTONS.EDIT,
      icon: ICONS.EDIT.LIGHT,
      iconDark: ICONS.EDIT.DARK,
      action: "edit",
    },
    {
      text: UI_TEXTS.BUTTONS.DELETE,
      icon: ICONS.DELETE.LIGHT,
      iconDark: ICONS.DELETE.DARK,
      action: "delete",
    },
    {
      text: UI_TEXTS.BUTTONS.COPY,
      icon: ICONS.MOVE.LIGHT,
      iconDark: ICONS.MOVE.DARK,
      action: "copy",
    },
  ],
  BOOKMARK: [
    {
      text: UI_TEXTS.BUTTONS.EDIT,
      icon: ICONS.EDIT.LIGHT,
      iconDark: ICONS.EDIT.DARK,
      action: "edit",
    },
    {
      text: UI_TEXTS.BUTTONS.DELETE,
      icon: ICONS.DELETE.LIGHT,
      iconDark: ICONS.DELETE.DARK,
      action: "delete",
    },
    {
      text: UI_TEXTS.BUTTONS.COPY,
      icon: ICONS.MOVE.LIGHT,
      iconDark: ICONS.MOVE.DARK,
      action: "copy",
    },
  ],
  NOTE: [
    {
      text: UI_TEXTS.BUTTONS.EDIT,
      icon: ICONS.EDIT.LIGHT,
      iconDark: ICONS.EDIT.DARK,
      action: "edit",
    },
    {
      text: UI_TEXTS.BUTTONS.DELETE,
      icon: ICONS.DELETE.LIGHT,
      iconDark: ICONS.DELETE.DARK,
      action: "delete",
    },
    {
      text: UI_TEXTS.BUTTONS.COPY,
      icon: ICONS.MOVE.LIGHT,
      iconDark: ICONS.MOVE.DARK,
      action: "copy",
    },
  ],
}

// Конфигурация кнопок добавления
export const ADD_BUTTONS_CONFIG = [
  {
    type: "folder",
    action: "addFolder",
    text: UI_TEXTS.BUTTONS.CREATE_FOLDER,
    icon: ICONS.FOLDER.LIGHT,
    iconDark: ICONS.FOLDER.DARK,
  },
  {
    type: "link",
    action: "addBookmark",
    text: UI_TEXTS.BUTTONS.ADD_BOOKMARK,
    icon: ICONS.LINK,
    iconDark: ICONS.LINK,
  },
  {
    type: "note",
    action: "addNote",
    text: UI_TEXTS.BUTTONS.CREATE_NOTE,
    icon: ICONS.NOTE.LIGHT,
    iconDark: ICONS.NOTE.DARK,
  },
]

// Ключи для хранилища
export const STORAGE_KEYS = {
  THEME: "theme",
  FOLDER_ICON: (folderId) => `folder_icon_${folderId}`,
  NAVIGATION: "navigation",
}

// HTML элементы
export const DOM_IDS = {
  MAIN_CONTENT: "mainContent",
  BACK_BUTTON: "backButton",
  ADD_BUTTON: "addButton",
  SETTINGS_BUTTON: "settingsButton",
  TRASH_BUTTON: "trashButton",
  CURRENT_FOLDER: "currentFolder",
  THEME_TOGGLE: "themeToggle",
}

// CSS классы
export const CSS_CLASSES = {
  BOOKMARK_ITEM: "bookmark-item",
  FOLDER: "folder",
  NOTE: "note",
  BOOKMARK_TITLE: "bookmark-title",
  NESTED_VIEW: "nested-view",
  DARK_THEME: "dark-theme",
}
