(() => {
  "use strict";

  const CYCLE_DAYS = 5;
  const DAY_END = "17:30";
  const NIGHT_START = "17:30";
  const NIGHT_END = "08:00";
  const WEEKEND_END = "12:00";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STORAGE_KEY = "luna.settings.v1";

  const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];
  const TYPE_LABELS = {
    day: "白班",
    night: "夜班",
    post: "下夜班",
    rest: "休息"
  };
  const TYPE_SHORT = {
    day: "白",
    night: "夜",
    post: "下",
    rest: "休"
  };

  const $ = (id) => document.getElementById(id);

  const dom = {
    calendarView: $("calendarView"),
    settingsView: $("settingsView"),
    firstRunBanner: $("firstRunBanner"),
    todayButton: $("todayButton"),
    settingsButton: $("settingsButton"),
    bannerSettingsButton: $("bannerSettingsButton"),
    prevMonthButton: $("prevMonthButton"),
    nextMonthButton: $("nextMonthButton"),
    monthTitle: $("monthTitle"),
    weekdays: $("weekdays"),
    calendarGrid: $("calendarGrid"),
    legend: $("legend"),
    todayCard: $("todayCard"),
    statsCard: $("statsCard"),
    settingsBackButton: $("settingsBackButton"),
    anchorInput: $("anchorInput"),
    dayStartInput: $("dayStartInput"),
    nightTimeValue: $("nightTimeValue"),
    weekendToggle: $("weekendToggle"),
    todayCycleText: $("todayCycleText"),
    calibrateChips: $("calibrateChips"),
    themeChips: $("themeChips"),
    detailBackdrop: $("detailBackdrop"),
    detailSheet: $("detailSheet"),
    detailTitle: $("detailTitle"),
    detailSubtitle: $("detailSubtitle"),
    detailCloseButton: $("detailCloseButton"),
    detailBody: $("detailBody"),
    toast: $("toast")
  };

  let today = utcToday();
  let currentMonth = startOfMonth(today);
  let selectedDate = null;
  let toastTimer = null;
  let settings = loadSettings();

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function utcToday() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function parseDateKey(key) {
    const parts = key.split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  function dateKey(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * DAY_MS);
  }

  function startOfMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  function addMonths(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  }

  function sameMonth(a, b) {
    return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  }

  function isWeekend(date) {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  function formatMonth(date) {
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
  }

  function formatShortDate(date) {
    return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  }

  function weekdayLabel(date) {
    return WEEKDAY_NAMES[date.getUTCDay()];
  }

  function timeToMinutes(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const parts = value.split(":").map(Number);
    const hours = parts[0];
    const minutes = parts[1];
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function minutesToTime(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
  }

  function clampDayStart(value) {
    const minutes = timeToMinutes(value);
    if (minutes === null) return "07:30";
    return minutesToTime(Math.min(Math.max(minutes, 0), 17 * 60 + 29));
  }

  function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return null;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
  }

  function defaultSettings() {
    return {
      anchorDate: dateKey(utcToday()),
      dayStart: "07:30",
      weekendExtension: true,
      theme: "system",
      configured: false
    };
  }

  function loadSettings() {
    const defaults = defaultSettings();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaults;

      let anchorDate = defaults.anchorDate;
      if (typeof parsed.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.anchorDate)) {
        const candidate = parseDateKey(parsed.anchorDate);
        if (dateKey(candidate) === parsed.anchorDate) anchorDate = parsed.anchorDate;
      }

      const dayStart = typeof parsed.dayStart === "string"
        ? clampDayStart(parsed.dayStart)
        : defaults.dayStart;
      const weekendExtension = parsed.weekendExtension !== false;
      const theme = ["system", "light", "dark"].includes(parsed.theme)
        ? parsed.theme
        : "system";
      const configured = parsed.configured === true;

      return { anchorDate, dayStart, weekendExtension, theme, configured };
    } catch (error) {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      showToast("设置保存失败，请检查浏览器存储权限");
    }
  }

  function anchorDate() {
    return parseDateKey(settings.anchorDate);
  }

  function cycleDayFor(date) {
    const offset = Math.round((date.getTime() - anchorDate().getTime()) / DAY_MS);
    return ((offset % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS + 1;
  }

  function scheduleFor(date) {
    const cycleDay = cycleDayFor(date);

    if (cycleDay === 1) {
      return {
        date,
        cycleDay,
        type: "day",
        start: settings.dayStart,
        end: DAY_END,
        extended: false
      };
    }

    if (cycleDay === 2) {
      return { date, cycleDay, type: "rest", extended: false };
    }

    if (cycleDay === 3) {
      const nextDate = addDays(date, 1);
      const extended = settings.weekendExtension && isWeekend(nextDate);
      return {
        date,
        cycleDay,
        type: "night",
        start: NIGHT_START,
        end: extended ? WEEKEND_END : NIGHT_END,
        extended
      };
    }

    if (cycleDay === 4) {
      const extended = settings.weekendExtension && isWeekend(date);
      return {
        date,
        cycleDay,
        type: "post",
        end: extended ? WEEKEND_END : NIGHT_END,
        extended
      };
    }

    return { date, cycleDay, type: "rest", extended: false };
  }

  function timeRangeText(schedule) {
    switch (schedule.type) {
      case "day":
        return `${schedule.start} – ${schedule.end}`;
      case "night":
        return `${schedule.start} – 次日 ${schedule.end}${schedule.extended ? "（周末延长）" : ""}`;
      case "post":
        return `${schedule.end} 下班${schedule.extended ? "（周末延长）" : ""}`;
      default:
        return "当天休息";
    }
  }

  function timeSummaryText(schedule) {
    switch (schedule.type) {
      case "day":
        return `${schedule.start} – ${schedule.end}`;
      case "night":
        return `${schedule.start} – 次日 ${schedule.end}`;
      case "post":
        return `${schedule.end} 下班${schedule.extended ? "（延长）" : ""}`;
      default:
        return "今天休息";
    }
  }

  function durationText(schedule) {
    if (schedule.type === "day") {
      const start = timeToMinutes(schedule.start);
      const end = timeToMinutes(schedule.end);
      if (start === null || end === null) return null;
      return formatDuration(end - start);
    }

    if (schedule.type === "night") {
      const start = timeToMinutes(schedule.start);
      const end = timeToMinutes(schedule.end);
      if (start === null || end === null) return null;
      return formatDuration(1440 - start + end);
    }

    return null;
  }

  function nextNightSchedule(from) {
    for (let offset = 0; offset <= CYCLE_DAYS; offset += 1) {
      const schedule = scheduleFor(addDays(from, offset));
      if (schedule.type === "night") return { schedule, offset };
    }
    return null;
  }

  function nextNightLabel(offset) {
    if (offset === 0) return "今晚夜班";
    if (offset === 1) return "明晚夜班";
    return `${offset} 天后夜班`;
  }

  function detailHint(schedule) {
    switch (schedule.type) {
      case "night":
        return "夜班跨天，次日下班后注意休息。";
      case "post":
        return schedule.extended
          ? "周末延长到 12:00，08:00–12:00 按白班计算。"
          : "夜班后休息，好好补觉。";
      case "rest":
        return "这一天没有班次，安心休息。";
      default:
        return `白班 ${timeRangeText(schedule)}，夜班从 ${NIGHT_START} 开始。`;
    }
  }

  function renderWeekdays() {
    dom.weekdays.innerHTML = WEEKDAY_HEADERS
      .map((label, index) => `<span class="${index >= 5 ? "weekend" : ""}">${label}</span>`)
      .join("");
  }

  function renderLegend() {
    const items = [
      ["day", "白班"],
      ["night", "夜班"],
      ["post", "下夜班"],
      ["rest", "休息"]
    ];
    dom.legend.innerHTML = items
      .map(([type, label]) => `<span class="legend-item"><span class="legend-dot ${type}"></span>${label}</span>`)
      .join("");
  }

  function renderCalendar() {
    dom.monthTitle.textContent = formatMonth(currentMonth);

    const firstDay = currentMonth;
    const leadingDays = (firstDay.getUTCDay() + 6) % 7;
    const gridStart = addDays(firstDay, -leadingDays);
    const todayKey = dateKey(today);
    const selectedKey = selectedDate ? dateKey(selectedDate) : null;

    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = addDays(gridStart, index);
      const schedule = scheduleFor(date);
      const outside = !sameMonth(date, currentMonth);
      const classes = ["day-cell"];

      if (outside) classes.push("outside");
      if (dateKey(date) === todayKey) classes.push("today");
      if (selectedKey === dateKey(date)) classes.push("selected");
      if (schedule.type === "night" && schedule.extended) classes.push("extended-night");

      const isExtendedPost = schedule.type === "post" && schedule.extended;
      const description = `${formatShortDate(date)} ${TYPE_LABELS[schedule.type]}${isExtendedPost ? "延长到12点" : ""}`;

      let inner = `<span class="day-number">${date.getUTCDate()}</span><span class="pills">`;
      if (isExtendedPost) {
        inner += '<span class="pill post">下</span><span class="pill extension">延</span>';
      } else {
        inner += `<span class="pill">${TYPE_SHORT[schedule.type]}</span>`;
      }
      inner += "</span>";

      if (schedule.type === "night" && schedule.extended) {
        inner += '<span class="time-small">12:00</span>';
      } else if (isExtendedPost) {
        inner += '<span class="time-small extension-time">12:00</span>';
      }

      cells.push(
        `<button type="button" class="${classes.join(" ")}" data-date="${dateKey(date)}" data-type="${schedule.type}" aria-label="${description}">${inner}</button>`
      );
    }

    dom.calendarGrid.innerHTML = cells.join("");
  }

  function renderTodayCard() {
    const schedule = scheduleFor(today);
    const next = nextNightSchedule(today);
    const isExtendedPost = schedule.type === "post" && schedule.extended;

    let html = `<div class="today-head"><span>今天</span><span class="today-date">${formatShortDate(today)} ${weekdayLabel(today)}</span></div>`;
    html += '<div class="today-main">';
    html += `<span class="badge ${schedule.type}">${TYPE_LABELS[schedule.type]}</span>`;
    if (isExtendedPost) html += '<span class="badge extension">延</span>';
    html += `<div class="today-info"><div class="today-type">${TYPE_LABELS[schedule.type]}</div><div class="today-time">${timeSummaryText(schedule)}</div></div>`;
    html += "</div>";

    if (next) {
      html += `<div class="next-night"><span class="dot night"></span><span>${nextNightLabel(next.offset)} · ${formatShortDate(next.schedule.date)} ${weekdayLabel(next.schedule.date)} ${NIGHT_START}</span></div>`;
    }

    dom.todayCard.innerHTML = html;
  }

  function renderStats() {
    const firstDay = startOfMonth(currentMonth);
    const daysInMonth = new Date(
      Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)
    ).getUTCDate();

    let dayCount = 0;
    let nightCount = 0;
    let postCount = 0;
    let restCount = 0;
    let extensionCount = 0;

    for (let index = 0; index < daysInMonth; index += 1) {
      const schedule = scheduleFor(addDays(firstDay, index));
      if (schedule.type === "day") {
        dayCount += 1;
      } else if (schedule.type === "night") {
        nightCount += 1;
      } else if (schedule.type === "post") {
        postCount += 1;
        if (schedule.extended) extensionCount += 1;
      } else {
        restCount += 1;
      }
    }

    const whiteCount = dayCount + extensionCount;

    dom.statsCard.innerHTML = `
      <h3 class="section-title">本月统计</h3>
      <div class="stats-grid">
        <div class="stat-item"><div class="stat-value day">${whiteCount}</div><div class="stat-label">白班</div></div>
        <div class="stat-item"><div class="stat-value night">${nightCount}</div><div class="stat-label">夜班</div></div>
        <div class="stat-item"><div class="stat-value post">${postCount}</div><div class="stat-label">下夜班</div></div>
        <div class="stat-item"><div class="stat-value rest">${restCount}</div><div class="stat-label">休息</div></div>
      </div>
    `;
  }

  function renderFirstRunBanner() {
    dom.firstRunBanner.classList.toggle("hidden", settings.configured);
  }

  function renderAll() {
    renderFirstRunBanner();
    renderCalendar();
    renderTodayCard();
    renderStats();
  }

  function renderSettings() {
    dom.anchorInput.value = settings.anchorDate;
    dom.dayStartInput.value = settings.dayStart;
    dom.weekendToggle.checked = settings.weekendExtension;
    dom.nightTimeValue.textContent = `${NIGHT_START} – 次日 ${NIGHT_END}`;

    const currentCycle = cycleDayFor(today);
    dom.todayCycleText.textContent = `按当前设置，今天是周期第 ${currentCycle} 天。`;

    dom.calibrateChips.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("selected", Number(chip.dataset.cycle) === currentCycle);
    });
    dom.themeChips.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("selected", chip.dataset.theme === settings.theme);
    });
  }

  function openSettings() {
    dom.calendarView.classList.add("hidden");
    dom.settingsView.classList.remove("hidden");
    renderSettings();
    window.scrollTo(0, 0);
  }

  function closeSettings() {
    dom.settingsView.classList.add("hidden");
    dom.calendarView.classList.remove("hidden");
    renderAll();
    window.scrollTo(0, 0);
  }

  function openDetail(date) {
    const schedule = scheduleFor(date);
    const isExtendedPost = schedule.type === "post" && schedule.extended;

    dom.detailTitle.textContent = `${formatShortDate(date)} ${weekdayLabel(date)}`;
    dom.detailSubtitle.textContent = `5 天循环 · 第 ${schedule.cycleDay} 天`;

    let html = '<div class="detail-status">';
    html += `<span class="detail-dot ${schedule.type}"></span>`;
    html += `<span class="detail-type">${TYPE_LABELS[schedule.type]}</span>`;
    if (isExtendedPost) html += '<span class="badge extension">延</span>';
    html += "</div>";
    html += `<div class="detail-time">${timeRangeText(schedule)}</div>`;

    const duration = durationText(schedule);
    if (duration) {
      html += `<div class="detail-duration">时长 ${duration}</div>`;
    }

    html += `<div class="detail-hint">${detailHint(schedule)}</div>`;
    dom.detailBody.innerHTML = html;

    dom.detailBackdrop.classList.remove("hidden");
    dom.detailSheet.classList.remove("hidden");
    document.body.classList.add("sheet-open");
  }

  function closeDetail() {
    dom.detailBackdrop.classList.add("hidden");
    dom.detailSheet.classList.add("hidden");
    document.body.classList.remove("sheet-open");
    selectedDate = null;
    renderCalendar();
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.remove("hidden");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.add("hidden");
    }, 2200);
  }

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.dataset.theme = settings.theme;
    }
    syncThemeColor();
  }

  function syncThemeColor() {
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg")
      .trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && background) meta.setAttribute("content", background);
  }

  function setAnchorDate(date) {
    settings.anchorDate = dateKey(date);
    settings.configured = true;
    saveSettings();
    renderAll();
    renderSettings();
  }

  function handleAnchorChange() {
    if (!dom.anchorInput.value) return;
    const candidate = parseDateKey(dom.anchorInput.value);
    if (dateKey(candidate) !== dom.anchorInput.value) return;
    setAnchorDate(candidate);
    showToast("周期起点已更新");
  }

  function handleDayStartChange() {
    const clamped = clampDayStart(dom.dayStartInput.value || settings.dayStart);
    settings.dayStart = clamped;
    settings.configured = true;
    dom.dayStartInput.value = clamped;
    saveSettings();
    renderAll();
    renderSettings();
    showToast("白班开始时间已更新");
  }

  function handleWeekendChange() {
    settings.weekendExtension = dom.weekendToggle.checked;
    settings.configured = true;
    saveSettings();
    renderAll();
    renderSettings();
  }

  function handleThemeChange(theme) {
    if (!["system", "light", "dark"].includes(theme)) return;
    settings.theme = theme;
    saveSettings();
    applyTheme();
    renderSettings();
  }

  function handleCalibrate(cycleDay) {
    const safeDay = Math.min(Math.max(cycleDay, 1), CYCLE_DAYS);
    const anchor = addDays(today, -(safeDay - 1));
    settings.anchorDate = dateKey(anchor);
    settings.configured = true;
    saveSettings();
    selectedDate = null;
    currentMonth = startOfMonth(today);
    renderAll();
    renderSettings();
    showToast(`已把今天设为周期第 ${safeDay} 天`);
  }

  function bindEvents() {
    dom.todayButton.addEventListener("click", () => {
      today = utcToday();
      currentMonth = startOfMonth(today);
      selectedDate = null;
      renderAll();
      window.scrollTo(0, 0);
    });

    dom.settingsButton.addEventListener("click", openSettings);
    dom.bannerSettingsButton.addEventListener("click", openSettings);
    dom.settingsBackButton.addEventListener("click", closeSettings);

    dom.prevMonthButton.addEventListener("click", () => {
      currentMonth = addMonths(currentMonth, -1);
      selectedDate = null;
      renderCalendar();
      renderStats();
    });

    dom.nextMonthButton.addEventListener("click", () => {
      currentMonth = addMonths(currentMonth, 1);
      selectedDate = null;
      renderCalendar();
      renderStats();
    });

    dom.calendarGrid.addEventListener("click", (event) => {
      const cell = event.target.closest(".day-cell");
      if (!cell) return;
      const date = parseDateKey(cell.dataset.date);
      selectedDate = date;
      if (!sameMonth(date, currentMonth)) {
        currentMonth = startOfMonth(date);
        renderStats();
      }
      renderCalendar();
      openDetail(date);
    });

    dom.anchorInput.addEventListener("change", handleAnchorChange);
    dom.dayStartInput.addEventListener("change", handleDayStartChange);
    dom.weekendToggle.addEventListener("change", handleWeekendChange);

    dom.calibrateChips.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      handleCalibrate(Number(chip.dataset.cycle));
    });

    dom.themeChips.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      handleThemeChange(chip.dataset.theme);
    });

    dom.detailCloseButton.addEventListener("click", closeDetail);
    dom.detailBackdrop.addEventListener("click", closeDetail);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!dom.detailSheet.classList.contains("hidden")) {
        closeDetail();
      } else if (!dom.settingsView.classList.contains("hidden")) {
        closeSettings();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      const newToday = utcToday();
      if (dateKey(newToday) === dateKey(today)) return;
      const wasShowingCurrentMonth = sameMonth(currentMonth, today);
      today = newToday;
      if (wasShowingCurrentMonth) currentMonth = startOfMonth(today);
      renderAll();
      if (!dom.settingsView.classList.contains("hidden")) renderSettings();
    });

    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    if (colorScheme.addEventListener) {
      colorScheme.addEventListener("change", syncThemeColor);
    } else if (colorScheme.addListener) {
      colorScheme.addListener(syncThemeColor);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // 离线缓存失败不影响正常使用。
      });
    });
  }

  function init() {
    applyTheme();
    renderWeekdays();
    renderLegend();
    renderAll();
    bindEvents();
    registerServiceWorker();
  }

  init();
})();
