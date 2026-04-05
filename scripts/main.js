class SpeakerQueue {
  static ID = "speaker-queue";
  static socket; // Здесь будем хранить переменную сокета

  static init() {
    console.log(`${this.ID} | Initializing...`);

    this.registerSettings();

    // Регистрация хоткея
    game.keybindings.register(this.ID, "toggleKey", {
      name: "Встать в очередь / Выйти",
      editable: [{ key: "KeyI" }],
      onDown: () => this.requestToggle(),
      restricted: false,
    });
  }

  static registerSettings() {
    // Форма: круг или квадрат
    game.settings.register(this.ID, "shape", {
      name: "Форма элементов",
      scope: "world",
      config: true,
      type: String,
      choices: { circle: "Круг", square: "Квадрат" },
      default: "circle",
      onChange: () => this.render(),
    });

    // Приоритет выбора изображения
    game.settings.register(this.ID, "imagePriority", {
      name: "Приоритет изображения",
      scope: "world",
      config: true,
      type: String,
      choices: {
        avatarFirst: "Сначала Аватар, затем Токен",
        tokenFirst: "Сначала Токен, затем Аватар",
      },
      default: "avatarFirst",
      onChange: () => this.render(),
    });

    // Сама очередь (скрыта из меню)
    game.settings.register(this.ID, "queue", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
      onChange: () => this.render(),
    });
  }

  // Функция, которая будет реально изменять настройки (выполняется ТОЛЬКО на стороне GM)
  static async updateQueue(uid) {
    let queue = [...(game.settings.get(this.ID, "queue") || [])];

    if (queue.includes(uid)) {
      queue = queue.filter((id) => id !== uid);
    } else {
      queue.push(uid);
      queue.sort((a, b) => {
        const userA = game.users.get(a);
        const userB = game.users.get(b);

        // Считаем роль 1 (Player) и 2 (Trusted) как одинаковую (значение 1)
        // Роли ГМа (3 и 4) остаются выше
        const roleA = userA?.role <= 2 ? 1 : userA?.role || 0;
        const roleB = userB?.role <= 2 ? 1 : userB?.role || 0;

        return roleB - roleA;
      });
    }

    return await game.settings.set(this.ID, "queue", queue);
  }

  static requestToggle() {
    const uid = game.user.id;
    // Используем socketlib для вызова функции на стороне ГМа
    // executeAsGM гарантирует, что функция выполнится от имени первого активного ГМа
    this.socket.executeAsGM("updateQueue", uid);
  }

  static render() {
    if (!game.ready) return;

    const hotbar = document.getElementById("hotbar");
    if (!hotbar) return;

    let container = document.getElementById("speaker-queue-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "speaker-queue-container";
      // Вставляем ВНУТРЬ хотбара, чтобы позиционировать относительно него
      hotbar.appendChild(container);
    }

    const queue = game.settings.get(this.ID, "queue") || [];
    if (queue.length === 0) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    const shape = game.settings.get(this.ID, "shape");
    const priority = game.settings.get(this.ID, "imagePriority");

    container.innerHTML = queue
      .map((userId, index) => {
        const user = game.users.get(userId);
        if (!user) return "";

        const avatar = user.avatar;
        const token =
          user.character?.prototypeToken?.texture?.src || user.character?.img;
        const fallback = "icons/svg/citizen.svg";

        // Логика приоритета
        let imgSrc;
        if (priority === "avatarFirst") {
          imgSrc = avatar || token || fallback;
        } else {
          imgSrc = token || avatar || fallback;
        }

        const isFirst = index === 0;
        const size = isFirst ? 80 : 50;
        const borderRadius = shape === "circle" ? "50%" : "4px";
        const userColor = user.color || "#ffffff";

        return `
        <div class="speaker-item ${isFirst ? "first-speaker" : ""}" 
             style="
                --user-color: ${userColor};
                width: ${size}px; 
                height: ${size}px; 
                border: 2px solid ${userColor}; 
                border-radius: ${borderRadius}; 
          background-image: url('${imgSrc}');
             ">
        </div>`;
      })
      .join("");
  }
}

// РЕГИСТРАЦИЯ SOCKETLIB
Hooks.once("socketlib.ready", () => {
  // Регистрируем наш модуль в socketlib
  SpeakerQueue.socket = socketlib.registerModule(SpeakerQueue.ID);

  // Регистрируем функцию, которую разрешаем вызывать удаленно
  SpeakerQueue.socket.register(
    "updateQueue",
    SpeakerQueue.updateQueue.bind(SpeakerQueue),
  );
});

Hooks.once("init", () => SpeakerQueue.init());
Hooks.once("ready", () => SpeakerQueue.render());

// Перерисовываем при изменении размера окна
window.addEventListener("resize", () => {
  if (game.ready) SpeakerQueue.render();
});

// Перерисовываем при скрытии/раскрытии боковой панели (sidebar),
// так как это двигает хотбар в Foundry
Hooks.on("collapseSidebar", () => {
  setTimeout(() => SpeakerQueue.render(), 200); // Небольшая задержка для завершения анимации
});

Hooks.on("updateSetting", (setting) => {
  if (setting.key.includes(SpeakerQueue.ID)) SpeakerQueue.render();
});
