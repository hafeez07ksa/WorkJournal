/* =============================================
   WORK JOURNAL — Abdul Hafeez
   =============================================
   VIEW MODE  → public (boss can read)
   WRITE MODE → password protected (only you)
   Password: reporter2024
   ============================================= */

const DEFAULT_PASSWORD = "reporter2024";
const SESSION_KEY      = "wr_write_session";
const PWD_KEY          = "wr_password_hash";
const SHEET_URL        = "https://script.google.com/macros/s/AKfycbwdhprxCSocI9pz2neFu3TJDFBGD7zgB-4Sl9MSLCW_gav--1jZiQqhWh8PlOwQxgXikw/exec";

let isWriteMode = false;
let _allReports = { daily: [], weekly: [], completed: [], ongoing: [] };

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i); h |= 0;
  }
  return h.toString(36);
}
function getPasswordHash() {
  return localStorage.getItem(PWD_KEY) || simpleHash(DEFAULT_PASSWORD);
}

/* =============================================
   GOOGLE SHEETS API
   ============================================= */
async function sheetGet(type) {
  const res  = await fetch(SHEET_URL + "?type=" + encodeURIComponent(type));
  let   text = await res.text();
  // Apps Script wraps response as: callback({...}) — strip the wrapper
  text = text.replace(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/, "").replace(/\);\s*$/, "").replace(/\)\s*$/, "");
  const json = JSON.parse(text);
  return json.success ? json.data : [];
}

async function sheetSave(payload) {
  try {
    await fetch(SHEET_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", ...payload }),
    });
  } catch(e) { console.warn("sheetSave:", e); }
  return { success: true };
}

async function sheetDelete(type, id) {
  try {
    await fetch(SHEET_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", type, id }),
    });
  } catch(e) { console.warn("sheetDelete:", e); }
  return { success: true };
}

/* =============================================
   BOOT
   ============================================= */
window.addEventListener("DOMContentLoaded", async () => {
  const today = new Date();
  document.getElementById("daily-date-picker").value  = toDateValue(today);
  document.getElementById("weekly-week-picker").value = toWeekValue(today);
  document.getElementById("current-date-display").textContent =
    today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  showLoading(true);
  await loadAllReports();
  showLoading(false);

  renderDailyLogs();
  renderWeeklyLogs();
  renderTasks("completed");
  renderTasks("ongoing");

  if (sessionStorage.getItem(SESSION_KEY) === "1") enterWriteMode();
});

function normalizeRow(r) {
  if (r.id && r.id.length > 10 && (r.id.includes("GMT") || r.id.includes("00:00:00"))) {
    const d = new Date(r.id);
    if (!isNaN(d)) {
      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd   = String(d.getUTCDate()).padStart(2, "0");
      r.id    = yyyy + "-" + mm + "-" + dd;
      const local = new Date(r.id + "T00:00:00");
      r.label = local.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
  }
  return r;
}

async function loadAllReports() {
  try {
    const [daily, weekly, completed, ongoing] = await Promise.all([
      sheetGet("daily"), sheetGet("weekly"),
      sheetGet("completed"), sheetGet("ongoing"),
    ]);
    _allReports.daily     = daily.map(normalizeRow);
    _allReports.weekly    = weekly.map(normalizeRow);
    _allReports.completed = completed;
    _allReports.ongoing   = ongoing;
  } catch(e) {
    console.error("loadAllReports error:", e);
    showToast("Could not connect to Google Sheets.", true);
  }
}

function showLoading(on) {
  ["daily-logs-list","weekly-logs-list","completed-tiles","ongoing-tiles"].forEach(id => {
    const el = document.getElementById(id);
    if (el && on) el.innerHTML = '<p class="empty-state loading-state"><i class="fa fa-circle-notch fa-spin"></i> Loading…</p>';
  });
}

/* =============================================
   UNLOCK / LOCK
   ============================================= */
function openUnlockModal() {
  document.getElementById("unlock-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("unlock-password").focus(), 80);
  pushModalState();
}
function closeUnlockModal() {
  document.getElementById("unlock-modal").classList.add("hidden");
  document.getElementById("unlock-password").value = "";
  document.getElementById("unlock-error").classList.remove("show");
}
function unlock() {
  const input = document.getElementById("unlock-password").value;
  if (simpleHash(input) === getPasswordHash()) {
    sessionStorage.setItem(SESSION_KEY, "1");
    closeUnlockModal();
    enterWriteMode();
    showToast("Write mode enabled.");
  } else {
    document.getElementById("unlock-error").classList.add("show");
    document.getElementById("unlock-password").value = "";
  }
}
document.getElementById("unlock-password").addEventListener("keydown", e => {
  if (e.key === "Enter") unlock();
  if (e.key === "Escape") closeUnlockModal();
});
function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  isWriteMode = false;
  exitWriteMode();
  showToast("Locked.");
}

/* =============================================
   WRITE / VIEW MODE UI
   ============================================= */
function enterWriteMode() {
  isWriteMode = true;
  ["daily-editor-panel","weekly-editor-panel"].forEach(id =>
    document.getElementById(id).classList.remove("hidden"));
  ["daily-logs-panel","weekly-logs-panel"].forEach(id =>
    document.getElementById(id).classList.remove("full-width"));
  document.getElementById("unlock-btn").classList.add("hidden");
  document.getElementById("lock-btn").classList.remove("hidden");
  document.getElementById("write-badge").classList.remove("hidden");
  // Show task add buttons
  document.querySelectorAll(".task-add-btn").forEach(b => b.classList.remove("hidden"));
  renderDailyLogs(); renderWeeklyLogs();
  renderTasks("completed"); renderTasks("ongoing");
}
function exitWriteMode() {
  ["daily-editor-panel","weekly-editor-panel"].forEach(id =>
    document.getElementById(id).classList.add("hidden"));
  ["daily-logs-panel","weekly-logs-panel"].forEach(id =>
    document.getElementById(id).classList.add("full-width"));
  document.getElementById("unlock-btn").classList.remove("hidden");
  document.getElementById("lock-btn").classList.add("hidden");
  document.getElementById("write-badge").classList.add("hidden");
  document.querySelectorAll(".task-add-btn").forEach(b => b.classList.add("hidden"));
  renderDailyLogs(); renderWeeklyLogs();
  renderTasks("completed"); renderTasks("ongoing");
}

/* =============================================
   TAB SWITCHING
   ============================================= */
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.getElementById("view-" + tab).classList.add("active");
}

/* =============================================
   EDITOR COMMANDS
   ============================================= */
function execCmd(editorId, cmd, val = null) {
  document.getElementById(editorId).focus();
  document.execCommand(cmd, false, val);
}

/* =============================================
   DAILY REPORTS
   ============================================= */
async function saveDaily() {
  const content = document.getElementById("daily-editor").innerHTML.trim();
  if (!content || content === "<br>") { showToast("Nothing to save!", true); return; }
  const dateVal = document.getElementById("daily-date-picker").value;
  const dateObj = dateVal ? new Date(dateVal + "T00:00:00") : new Date();
  const existing = _allReports.daily.find(r => r.id === dateVal);
  if (existing && !confirm("A report for this date already exists. Overwrite it?")) return;
  const entry = { type:"daily", id:dateVal, label:formatDateLabel(dateObj), content, savedAt:new Date().toISOString() };
  showToast("Saving…");
  await sheetSave(entry);
  const idx = _allReports.daily.findIndex(r => r.id === dateVal);
  if (idx > -1) _allReports.daily[idx] = entry; else _allReports.daily.unshift(entry);
  document.getElementById("daily-editor").innerHTML = "";
  renderDailyLogs();
  showToast("Daily report saved.");
}

function renderDailyLogs() {
  const list = document.getElementById("daily-logs-list");
  const reports = [..._allReports.daily].sort((a,b) => b.id.localeCompare(a.id));
  document.getElementById("daily-count").textContent = reports.length + (reports.length===1?" entry":" entries");
  list.innerHTML = reports.length ? reports.map(r => dailyCard(r)).join("") : '<p class="empty-state">No reports yet.</p>';
}

function dailyCard(r) {
  const preview  = stripHtml(r.content).slice(0, 160);
  const time     = r.savedAt ? new Date(r.savedAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}) : "";
  const dateObj  = new Date(r.id + "T00:00:00");
  const dateLabel = dateObj.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const dayLabel  = dateObj.toLocaleDateString("en-US",{weekday:"long"});
  const actions = isWriteMode ? `<div class="log-card-actions">
    <button class="action-btn" title="Edit" onclick="event.stopPropagation();openEditModal('daily','${r.id}')"><i class="fa fa-pen"></i></button>
    <button class="action-btn delete" title="Delete" onclick="event.stopPropagation();deleteReport('daily','${r.id}')"><i class="fa fa-trash"></i></button>
  </div>` : "";
  return `<div class="log-card clickable" onclick="openReadModal('daily','${r.id}')" id="card-d-${r.id}">
    <div class="log-card-header"><div>
      <div class="log-card-date">${dateLabel}</div>
      <div class="log-card-week">${dayLabel}</div>
    </div>${actions}</div>
    <div class="log-card-preview">${preview||"(empty)"}</div>
    ${time?`<div class="log-card-time">Saved at ${time}</div>`:""}
  </div>`;
}

/* =============================================
   WEEKLY REPORTS
   ============================================= */
async function saveWeekly() {
  const content = document.getElementById("weekly-editor").innerHTML.trim();
  if (!content || content === "<br>") { showToast("Nothing to save!", true); return; }
  const weekVal = document.getElementById("weekly-week-picker").value;
  if (!weekVal) { showToast("Please pick a week.", true); return; }
  const existing = _allReports.weekly.find(r => r.id === weekVal);
  if (existing && !confirm("A report for this week already exists. Overwrite it?")) return;
  const entry = { type:"weekly", id:weekVal, label:formatWeekLabel(weekVal), content, savedAt:new Date().toISOString() };
  showToast("Saving…");
  await sheetSave(entry);
  const idx = _allReports.weekly.findIndex(r => r.id === weekVal);
  if (idx > -1) _allReports.weekly[idx] = entry; else _allReports.weekly.unshift(entry);
  document.getElementById("weekly-editor").innerHTML = "";
  renderWeeklyLogs();
  showToast("Weekly report saved.");
}

function renderWeeklyLogs() {
  const list = document.getElementById("weekly-logs-list");
  const reports = [..._allReports.weekly].sort((a,b) => b.id.localeCompare(a.id));
  document.getElementById("weekly-count").textContent = reports.length + (reports.length===1?" entry":" entries");
  list.innerHTML = reports.length ? reports.map(r => weeklyCard(r)).join("") : '<p class="empty-state">No weekly reports yet.</p>';
}

function weeklyCard(r) {
  const preview = stripHtml(r.content).slice(0, 160);
  const actions = isWriteMode ? `<div class="log-card-actions">
    <button class="action-btn" title="Edit" onclick="event.stopPropagation();openEditModal('weekly','${r.id}')"><i class="fa fa-pen"></i></button>
    <button class="action-btn delete" title="Delete" onclick="event.stopPropagation();deleteReport('weekly','${r.id}')"><i class="fa fa-trash"></i></button>
  </div>` : "";
  return `<div class="log-card clickable" onclick="openReadModal('weekly','${r.id}')">
    <div class="log-card-header"><div>
      <div class="log-card-date">${r.label}</div>
      <div class="log-card-week">${weekRange(r.id)}</div>
    </div>${actions}</div>
    <div class="log-card-preview">${preview||"(empty)"}</div>
  </div>`;
}

/* =============================================
   TASKS — COMPLETED & ONGOING
   ============================================= */
let _taskModal = { type: null, id: null, mode: null }; // mode: 'read'|'edit'|'add'

function renderTasks(type) {
  const container = document.getElementById(type + "-tiles");
  if (!container) return;
  const tasks = _allReports[type] || [];
  document.getElementById(type + "-count").textContent = tasks.length + (tasks.length===1?" task":" tasks");
  if (!tasks.length) {
    container.innerHTML = '<p class="empty-state">No tasks yet.</p>';
    return;
  }
  container.innerHTML = tasks.map(t => taskTile(t, type)).join("");
}

function taskTile(t, type) {
  const preview = stripHtml(t.content || "").slice(0, 100);
  const actions = isWriteMode ? `<div class="tile-actions">
    <button class="action-btn" title="Edit" onclick="event.stopPropagation();openTaskEdit('${type}','${t.id}')"><i class="fa fa-pen"></i></button>
    <button class="action-btn delete" title="Delete" onclick="event.stopPropagation();deleteTask('${type}','${t.id}')"><i class="fa fa-trash"></i></button>
  </div>` : "";
  const icon = type === "completed"
    ? `<div class="tile-icon completed-icon"><i class="fa fa-check"></i></div>`
    : `<div class="tile-icon ongoing-icon"><i class="fa fa-spinner"></i></div>`;
  return `<div class="task-tile clickable" onclick="openTaskRead('${type}','${t.id}')">
    ${icon}
    <div class="tile-body">
      <div class="tile-title">${escapeHtml(t.label||"Untitled")}</div>
      <div class="tile-preview">${preview||"Tap to view"}</div>
    </div>
    ${actions}
  </div>`;
}

function openTaskAdd(type) {
  _taskModal = { type, id: null, mode: "add" };
  document.getElementById("task-modal-title").textContent = type === "completed" ? "Add Completed Task" : "Add Ongoing Task";
  document.getElementById("task-title-input").value = "";
  document.getElementById("task-modal-editor").innerHTML = "";
  document.getElementById("task-modal").classList.remove("hidden");
  pushModalState();
  setTimeout(() => document.getElementById("task-title-input").focus(), 80);
}

function openTaskEdit(type, id) {
  if (!isWriteMode) return;
  const task = (_allReports[type]||[]).find(t => t.id === id);
  if (!task) return;
  _taskModal = { type, id, mode: "edit" };
  document.getElementById("task-modal-title").textContent = "Edit Task";
  document.getElementById("task-title-input").value = task.label || "";
  document.getElementById("task-modal-editor").innerHTML = task.content || "";
  document.getElementById("task-modal").classList.remove("hidden");
  pushModalState();
}

function openTaskRead(type, id) {
  const task = (_allReports[type]||[]).find(t => t.id === id);
  if (!task) return;
  _taskModal = { type, id, mode: "read" };
  document.getElementById("read-modal-title").textContent = task.label || "Untitled";
  document.getElementById("read-modal-sub").textContent   = type === "completed" ? "Completed Task" : "Ongoing Task";
  document.getElementById("read-modal-body").innerHTML    = task.content || "";
  document.getElementById("read-modal-footer").textContent = task.savedAt
    ? "Last updated: " + new Date(task.savedAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}) : "";
  const editBtn = document.getElementById("read-edit-btn");
  isWriteMode ? editBtn.classList.remove("hidden") : editBtn.classList.add("hidden");
  document.getElementById("read-modal").classList.remove("hidden");
  pushModalState();
}

function closeTaskModal() {
  document.getElementById("task-modal").classList.add("hidden");
  _taskModal = { type:null, id:null, mode:null };
}

async function saveTask() {
  const { type, id, mode } = _taskModal;
  const label   = document.getElementById("task-title-input").value.trim();
  const content = document.getElementById("task-modal-editor").innerHTML.trim();
  if (!label) { showToast("Please enter a task title.", true); return; }

  const taskId  = mode === "edit" ? id : "task-" + Date.now();
  const entry   = { type, id:taskId, label, content, savedAt:new Date().toISOString() };

  showToast("Saving…");
  await sheetSave(entry);

  const arr = _allReports[type] || [];
  const idx = arr.findIndex(t => t.id === taskId);
  if (idx > -1) arr[idx] = entry; else arr.push(entry);
  _allReports[type] = arr;

  closeTaskModal();
  renderTasks(type);
  showToast("Task saved.");
}

async function deleteTask(type, id) {
  if (!isWriteMode) return;
  if (!confirm("Delete this task?")) return;
  showToast("Deleting…");
  await sheetDelete(type, id);
  _allReports[type] = (_allReports[type]||[]).filter(t => t.id !== id);
  renderTasks(type);
  showToast("Task deleted.");
}

document.getElementById("task-modal").addEventListener("click", function(e) {
  if (e.target === this) closeTaskModal();
});

/* =============================================
   READ MODAL
   ============================================= */
let _readType = null, _readId = null;

function openReadModal(type, id) {
  const reports = _allReports[type] || [];
  const report  = reports.find(r => r.id === id);
  if (!report) return;
  _readType = type; _readId = id;
  let titleLabel, subLabel;
  if (type === "daily") {
    const d = new Date(id + "T00:00:00");
    titleLabel = d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    subLabel   = d.toLocaleDateString("en-US",{weekday:"long"});
  } else {
    titleLabel = formatWeekLabel(id);
    subLabel   = weekRange(id);
  }
  document.getElementById("read-modal-title").textContent = titleLabel;
  document.getElementById("read-modal-sub").textContent   = subLabel;
  document.getElementById("read-modal-body").innerHTML    = report.content;
  const time = report.savedAt
    ? new Date(report.savedAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}) : "";
  document.getElementById("read-modal-footer").textContent = time ? "Last saved: " + time : "";
  const editBtn = document.getElementById("read-edit-btn");
  isWriteMode ? editBtn.classList.remove("hidden") : editBtn.classList.add("hidden");
  document.getElementById("read-modal").classList.remove("hidden");
  pushModalState();
}
function closeReadModal() {
  document.getElementById("read-modal").classList.add("hidden");
  _readType = null; _readId = null;
  _taskModal = { type:null, id:null, mode:null };
}
function openEditFromRead() {
  if (_taskModal.type) {
    // It was a task read modal
    const { type, id } = _taskModal;
    closeReadModal();
    openTaskEdit(type, id);
  } else {
    const type = _readType, id = _readId;
    closeReadModal();
    openEditModal(type, id);
  }
}
document.getElementById("read-modal").addEventListener("click", function(e) {
  if (e.target === this) closeReadModal();
});

/* =============================================
   EDIT MODAL (daily/weekly)
   ============================================= */
let _editType = null, _editId = null;
function openEditModal(type, id) {
  if (!isWriteMode) return;
  _editType = type; _editId = id;
  const reports = _allReports[type] || [];
  const report  = reports.find(r => r.id === id);
  if (!report) return;
  document.getElementById("modal-title").textContent = "Edit — " + report.label;
  document.getElementById("modal-editor").innerHTML  = report.content;
  document.getElementById("edit-modal").classList.remove("hidden");
  pushModalState();
}
function closeModal() {
  document.getElementById("edit-modal").classList.add("hidden");
  _editType = null; _editId = null;
}
async function saveEdit() {
  if (!_editType || !_editId) return;
  const content = document.getElementById("modal-editor").innerHTML.trim();
  const reports = _allReports[_editType] || [];
  const idx     = reports.findIndex(r => r.id === _editId);
  if (idx < 0) return;
  const updated = { ...reports[idx], content, savedAt:new Date().toISOString() };
  showToast("Saving…");
  await sheetSave({ ...updated, type:_editType });
  reports[idx] = updated;
  if (_editType==="daily") renderDailyLogs(); else renderWeeklyLogs();
  closeModal();
  showToast("Changes saved.");
}
document.getElementById("edit-modal").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});
document.getElementById("unlock-modal").addEventListener("click", function(e) {
  if (e.target === this) closeUnlockModal();
});

/* =============================================
   MOBILE BACK BUTTON
   ============================================= */
function pushModalState() {
  history.pushState({ modal: true }, "");
}
function closeAnyOpenModal() {
  if (!document.getElementById("read-modal").classList.contains("hidden"))   { closeReadModal();   return true; }
  if (!document.getElementById("task-modal").classList.contains("hidden"))   { closeTaskModal();   return true; }
  if (!document.getElementById("edit-modal").classList.contains("hidden"))   { closeModal();       return true; }
  if (!document.getElementById("unlock-modal").classList.contains("hidden")) { closeUnlockModal(); return true; }
  return false;
}
window.addEventListener("popstate", () => { closeAnyOpenModal(); });

/* =============================================
   DELETE (daily/weekly)
   ============================================= */
async function deleteReport(type, id) {
  if (!isWriteMode) return;
  if (!confirm("Delete this report?")) return;
  showToast("Deleting…");
  await sheetDelete(type, id);
  _allReports[type] = (_allReports[type]||[]).filter(r => r.id !== id);
  if (type==="daily") renderDailyLogs(); else renderWeeklyLogs();
  showToast("Report deleted.");
}

/* =============================================
   TOAST
   ============================================= */
let _toastTimer = null;
function showToast(msg, warn = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.background = warn ? "#b45309" : "";
  t.classList.remove("hidden");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

/* =============================================
   DATE UTILS
   ============================================= */
function toDateValue(d) { return d.toISOString().slice(0,10); }
function toWeekValue(d) {
  const jan4 = new Date(d.getFullYear(),0,4);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(),0,0))/86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay())/7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2,"0")}`;
}
function formatDateLabel(d) {
  return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}
function formatWeekLabel(weekStr) {
  const [year,wPart] = weekStr.split("-W");
  return `Week ${parseInt(wPart)}, ${year}`;
}
function weekRange(weekStr) {
  const [year,wPart] = weekStr.split("-W");
  const week  = parseInt(wPart);
  const jan4  = new Date(parseInt(year),0,4);
  const start = new Date(jan4.setDate(jan4.getDate()-jan4.getDay()+1+(week-1)*7));
  const end   = new Date(start); end.setDate(start.getDate()+6);
  const fmt   = d => d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  return `${fmt(start)} – ${fmt(end)}`;
}
function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}
function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
