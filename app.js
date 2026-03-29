const STORAGE_KEY = "foodloger.storage.v1";
const INITIAL_ITEM_COUNT = 3;
const MAX_ITEM_COUNT = 10;
const MAX_RECENT_COUNT = 5;
const MEAL_TYPES = ["朝食", "昼食", "夕食", "夜食", "間食/飲み物"];
const PLACE_TYPES = ["自炊", "外食", "スーパー/コンビニ", "テイクアウト", "その他"];

const form = document.getElementById("meal-form");
const recipientEmailInput = document.getElementById("recipient-email");
const datetimeInput = document.getElementById("datetime");
const mealTypeInput = document.getElementById("meal-type");
const placeTypeInput = document.getElementById("place-type");
const memoInput = document.getElementById("memo");
const itemsContainer = document.getElementById("items-container");
const addItemButton = document.getElementById("add-item-button");
const clearButton = document.getElementById("clear-button");
const formMessage = document.getElementById("form-message");
const recentList = document.getElementById("recent-list");
const recentEmpty = document.getElementById("recent-empty");

const store = loadStore();
let currentDraft = normalizeDraft(store.draft);
let recentEntries = normalizeRecentEntries(store.recent);
let initialized = false;

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch (error) {
    console.warn("Failed to parse localStorage:", error);
    return {};
  }
}

function saveStore() {
  const payload = {
    recipientEmail: recipientEmailInput.value.trim(),
    draft: currentDraft,
    recent: recentEntries
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function sanitizeString(value) {
  return typeof value === "string" ? value : "";
}

function isAllowedOption(value, options) {
  return options.includes(value);
}

function normalizeMealType(value) {
  if (value === "間食" || value === "飲み物") {
    return "間食/飲み物";
  }

  return isAllowedOption(value, MEAL_TYPES) ? value : "";
}

function normalizePlaceType(value) {
  if (value === "スーパー" || value === "コンビニ") {
    return "スーパー/コンビニ";
  }

  return isAllowedOption(value, PLACE_TYPES) ? value : "";
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function getNowInputValue() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function getJstParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function formatUpdatedAt(date = new Date()) {
  const parts = getJstParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function generateId(date = new Date()) {
  const parts = getJstParts(date);
  const suffix = Math.random().toString(36).slice(2, 5).padEnd(3, "0");
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-${suffix}`;
}

function formatMealDateTime(value) {
  return sanitizeString(value).replace("T", " ");
}

function normalizeItems(items) {
  const nextItems = Array.isArray(items)
    ? items.map((value) => sanitizeString(value).trim()).slice(0, MAX_ITEM_COUNT)
    : [];

  while (nextItems.length < INITIAL_ITEM_COUNT) {
    nextItems.push("");
  }

  return nextItems;
}

function normalizeDraft(draft, options = {}) {
  const nextDraft = draft ?? {};
  const hasDatetime = Object.prototype.hasOwnProperty.call(nextDraft, "datetime");
  const defaultDatetime = options.defaultDatetime ?? getNowInputValue();

  return {
    datetime: hasDatetime ? sanitizeString(nextDraft.datetime) : defaultDatetime,
    mealType: normalizeMealType(nextDraft.mealType),
    placeType: normalizePlaceType(nextDraft.placeType),
    items: normalizeItems(nextDraft.items),
    memo: sanitizeString(nextDraft.memo)
  };
}

function normalizeRecentEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .slice(0, MAX_RECENT_COUNT)
    .map((entry) => ({
      id: sanitizeString(entry.id),
      datetime: sanitizeString(entry.datetime),
      mealType: normalizeMealType(entry.mealType),
      placeType: normalizePlaceType(entry.placeType),
      items: normalizeItems(entry.items),
      memo: sanitizeString(entry.memo),
      updatedAt: sanitizeString(entry.updatedAt)
    }))
    .filter((entry) => entry.id && entry.datetime);
}

function escapeCsv(value) {
  return `"${sanitizeString(value).replaceAll('"', '""')}"`;
}

function buildCsvBody(record) {
  const header = "id,datetime,mealType,placeType,items,memo,updatedAt,deleted";
  const line = [
    record.id,
    record.datetime,
    record.mealType,
    record.placeType,
    escapeCsv(record.items.join("|")),
    escapeCsv(record.memo),
    record.updatedAt,
    "false"
  ].join(",");

  return `${header}\n${line}`;
}

function setFormMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.classList.remove("is-success", "is-error");

  if (type) {
    formMessage.classList.add(type);
  }
}

function collectDraftFromForm() {
  const itemInputs = [...itemsContainer.querySelectorAll("input[data-item-index]")];

  return {
    datetime: datetimeInput.value,
    mealType: mealTypeInput.value,
    placeType: placeTypeInput.value,
    items: normalizeItems(itemInputs.map((input) => input.value)),
    memo: memoInput.value.trim()
  };
}

function syncDraftFromForm() {
  currentDraft = collectDraftFromForm();
  saveStore();
}

function renderItemInputs() {
  itemsContainer.replaceChildren();

  currentDraft.items.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "item-row";

    const badge = document.createElement("span");
    badge.className = "item-index";
    badge.textContent = String(index + 1);

    const input = document.createElement("input");
    input.type = "text";
    input.dataset.itemIndex = String(index);
    input.placeholder = "食品名を入力";
    input.value = value;
    input.autocomplete = "off";
    input.addEventListener("input", (event) => {
      currentDraft.items[index] = event.currentTarget.value;
      saveStore();
    });

    row.append(badge, input);

    if (currentDraft.items.length > INITIAL_ITEM_COUNT) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "item-remove";
      removeButton.textContent = "削除";
      removeButton.addEventListener("click", () => {
        currentDraft.items.splice(index, 1);
        if (currentDraft.items.length < INITIAL_ITEM_COUNT) {
          currentDraft.items = normalizeItems(currentDraft.items);
        }
        renderItemInputs();
        saveStore();
      });
      row.append(removeButton);
    }

    itemsContainer.append(row);
  });

  addItemButton.disabled = currentDraft.items.length >= MAX_ITEM_COUNT;
}

function renderRecentEntries() {
  recentList.replaceChildren();
  recentEmpty.hidden = recentEntries.length > 0;

  recentEntries.forEach((entry) => {
    const listItem = document.createElement("li");
    listItem.className = "recent-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-button";
    button.addEventListener("click", () => {
      loadDraftFromRecent(entry);
      setFormMessage("履歴をフォームへ反映しました。必要なら内容を調整して送信してください。", "is-success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const head = document.createElement("div");
    head.className = "recent-head";

    const title = document.createElement("p");
    title.className = "recent-title";
    title.textContent = entry.datetime;

    const time = document.createElement("span");
    time.className = "recent-chip";
    time.textContent = entry.updatedAt;

    head.append(title, time);

    const chipRow = document.createElement("div");
    chipRow.className = "recent-chip-row";

    [entry.mealType, entry.placeType].filter(Boolean).forEach((label) => {
      const chip = document.createElement("span");
      chip.className = "recent-chip";
      chip.textContent = label;
      chipRow.append(chip);
    });

    const items = document.createElement("p");
    items.className = "recent-items";
    items.textContent = entry.items.filter(Boolean).join(" / ");

    button.append(head, chipRow, items);

    if (entry.memo) {
      const memo = document.createElement("p");
      memo.className = "recent-memo";
      memo.textContent = entry.memo;
      button.append(memo);
    }

    listItem.append(button);
    recentList.append(listItem);
  });

}

function applyDraftToForm() {
  datetimeInput.value = currentDraft.datetime;
  mealTypeInput.value = currentDraft.mealType;
  placeTypeInput.value = currentDraft.placeType;
  memoInput.value = currentDraft.memo;
  renderItemInputs();
}

function loadDraftFromRecent(entry) {
  currentDraft = normalizeDraft(entry);
  applyDraftToForm();
  saveStore();
}

function resetDraft() {
  currentDraft = normalizeDraft({
    datetime: getNowInputValue(),
    mealType: "",
    placeType: "",
    items: [],
    memo: ""
  });
  applyDraftToForm();
  saveStore();
}

function clearDraftAfterMailCompose() {
  currentDraft = normalizeDraft({
    datetime: "",
    mealType: "",
    placeType: "",
    items: currentDraft.items.map(() => ""),
    memo: currentDraft.memo
  });
  applyDraftToForm();
  saveStore();
}

function buildMailtoUrl(recipient, record) {
  const subject = "meal-log-export";
  const body = buildCsvBody(record);
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function validateForm() {
  if (!form.reportValidity()) {
    setFormMessage("入力必須の項目があります。内容を確認してください。", "is-error");
    return false;
  }

  const filledItems = currentDraft.items.map((item) => item.trim()).filter(Boolean);

  if (filledItems.length === 0) {
    setFormMessage("食品を1件以上入力してください。", "is-error");
    return false;
  }

  return true;
}

function createRecordForMail() {
  const now = new Date();
  const filledItems = currentDraft.items.map((item) => item.trim()).filter(Boolean);

  return {
    id: generateId(now),
    datetime: formatMealDateTime(currentDraft.datetime),
    mealType: currentDraft.mealType,
    placeType: currentDraft.placeType,
    items: filledItems,
    memo: currentDraft.memo,
    updatedAt: formatUpdatedAt(now)
  };
}

function registerRecentEntry(record) {
  recentEntries = [record, ...recentEntries].slice(0, MAX_RECENT_COUNT);
  renderRecentEntries();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.error("Service Worker registration failed:", error);
  }
}

async function initializeApp() {
  if (initialized) {
    return;
  }

  initialized = true;
  currentDraft = normalizeDraft(currentDraft);
  recipientEmailInput.value = sanitizeString(store.recipientEmail);
  applyDraftToForm();
  renderRecentEntries();
  await registerServiceWorker();
}

addItemButton.addEventListener("click", () => {
  if (currentDraft.items.length >= MAX_ITEM_COUNT) {
    return;
  }

  currentDraft.items.push("");
  renderItemInputs();
  saveStore();
});

clearButton.addEventListener("click", () => {
  resetDraft();
  setFormMessage("宛先を残して入力内容をクリアしました。", "is-success");
});

recipientEmailInput.addEventListener("input", saveStore);
datetimeInput.addEventListener("input", syncDraftFromForm);
mealTypeInput.addEventListener("change", syncDraftFromForm);
placeTypeInput.addEventListener("change", syncDraftFromForm);
memoInput.addEventListener("input", syncDraftFromForm);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  syncDraftFromForm();

  if (!validateForm()) {
    return;
  }

  const record = createRecordForMail();
  registerRecentEntry(record);

  const mailtoUrl = buildMailtoUrl(recipientEmailInput.value.trim(), record);
  clearDraftAfterMailCompose();
  window.location.href = mailtoUrl;
  setFormMessage("メール作成画面を開きました。内容を確認して送信してください。", "is-success");
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initializeApp();
  }, { once: true });
} else {
  void initializeApp();
}
