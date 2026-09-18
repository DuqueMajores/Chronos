const START_SOUND = "aviso-inicio.mp3";
const END_SOUND = "aviso-fim.mp3";

const state = {
  viewDate: new Date(),
  selectedDate: toISODate(new Date()),
  tasks: JSON.parse(localStorage.getItem("chronos_tasks") || "[]"),
  notes: JSON.parse(localStorage.getItem("chronos_notes") || "[]"),
  alertedStart: JSON.parse(localStorage.getItem("chronos_alerted_start") || "{}"),
  alertedEnd: JSON.parse(localStorage.getItem("chronos_alerted_end") || "{}"),
  activeTimerTaskId: null,
  timerInterval: null,
  previewImage: null,
  taskImage: null,
  scheduledVideos: JSON.parse(localStorage.getItem("chronos_scheduled_videos") || "[]"),
  ytConnection: JSON.parse(localStorage.getItem("chronos_yt_connection") || "null")
};

const $ = id => document.getElementById(id);

function toISODate(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatLongDate(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long"
  });
}

function formatTime(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function saveState() {
  localStorage.setItem("chronos_tasks", JSON.stringify(state.tasks));
  localStorage.setItem("chronos_notes", JSON.stringify(state.notes));
  localStorage.setItem("chronos_alerted_start", JSON.stringify(state.alertedStart));
  localStorage.setItem("chronos_alerted_end", JSON.stringify(state.alertedEnd));
  localStorage.setItem("chronos_scheduled_videos", JSON.stringify(state.scheduledVideos));
}

function uid(prefix="id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}

function taskStartDate(task) {
  const [y,m,d] = task.date.split("-").map(Number);
  const [h,min] = task.time.split(":").map(Number);
  return new Date(y,m-1,d,h,min,0,0);
}

function taskEndDate(task) {
  return new Date(taskStartDate(task).getTime() + task.duration * 60000);
}

function renderCalendar() {
  const year = state.viewDate.getFullYear();
  const month = state.viewDate.getMonth();
  $("monthTitle").textContent = state.viewDate.toLocaleDateString("pt-BR", {month:"long", year:"numeric"});

  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i=0; i<42; i++) {
    const dayOffset = i - startOffset + 1;
    let date, outside = false;
    if (dayOffset <= 0) {
      date = new Date(year, month - 1, prevDays + dayOffset);
      outside = true;
    } else if (dayOffset > daysInMonth) {
      date = new Date(year, month + 1, dayOffset - daysInMonth);
      outside = true;
    } else {
      date = new Date(year, month, dayOffset);
    }

    const iso = toISODate(date);
    const dayTasks = state.tasks.filter(t => t.date === iso).sort((a,b) => a.time.localeCompare(b.time));
    const dayNotes = state.notes.filter(n => n.date === iso);
    const isToday = iso === toISODate(new Date());
    const selected = iso === state.selectedDate;

    const cell = document.createElement("div");
    cell.className = `day ${outside ? "outside" : ""} ${isToday ? "today" : ""} ${selected ? "selected" : ""}`;
    cell.dataset.date = iso;
    cell.innerHTML = `
      <div class="day-number">${date.getDate()}</div>
      <div class="day-items">
        ${dayTasks.slice(0,4).map(t => `
          <button class="calendar-task ${t.completed ? "done" : ""}" data-task="${t.id}">
            <span class="task-time">${t.time}</span>${escapeHtml(t.title)}
          </button>
        `).join("")}
        ${dayTasks.length > 4 ? `<div class="task-info">+${dayTasks.length-4} tarefas</div>` : ""}
        ${dayNotes.length ? `<div class="task-info">${dayNotes.length} nota${dayNotes.length > 1 ? "s" : ""}<span class="photo-dot"></span></div>` : ""}
      </div>
    `;

    cell.addEventListener("click", e => {
      if (e.target.closest(".calendar-task")) return;
      state.selectedDate = iso;
      renderAll();
    });

    cell.querySelectorAll(".calendar-task").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openTaskModal(state.tasks.find(t => t.id === btn.dataset.task));
      });
    });

    cells.push(cell);
  }

  $("calendarGrid").replaceChildren(...cells);

  const count = state.tasks.filter(t => {
    const d = taskStartDate(t);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;
  $("monthSummary").textContent = `${count} tarefa${count === 1 ? "" : "s"} neste mês`;
}

function renderSidebar() {
  $("selectedDateTitle").textContent = formatLongDate(state.selectedDate);

  const tasks = state.tasks
    .filter(t => t.date === state.selectedDate)
    .sort((a,b) => a.time.localeCompare(b.time));

  $("taskList").innerHTML = tasks.length ? tasks.map(t => `
    <div class="task-item">
      <button class="task-check ${t.completed ? "checked" : ""}" data-check="${t.id}" aria-label="Concluir"></button>
      <div>
        <div class="task-name">${escapeHtml(t.title)}</div>
        <div class="task-info">${t.time} • ${formatDuration(t.duration)}${t.details ? " • " + escapeHtml(t.details) : ""}</div>
      </div>
      ${t.image ? `<img class="task-photo" src="${t.image}" alt="Foto da tarefa">` : ""}
      <div class="task-actions">
        <button class="task-action" data-start="${t.id}" title="Iniciar cronômetro">▶</button>
        <button class="task-action" data-edit="${t.id}" title="Editar">✏️</button>
      </div>
    </div>
  `).join("") : `<div class="empty">Nenhuma tarefa para este dia.</div>`;

  $("taskList").querySelectorAll("[data-check]").forEach(btn => {
    btn.addEventListener("click", () => {
      const task = state.tasks.find(t => t.id === btn.dataset.check);
      task.completed = !task.completed;
      saveState(); renderAll();
    });
  });

  $("taskList").querySelectorAll("[data-start]").forEach(btn => {
    btn.addEventListener("click", () => startTimer(state.tasks.find(t => t.id === btn.dataset.start)));
  });

  $("taskList").querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openTaskModal(state.tasks.find(t => t.id === btn.dataset.edit)));
  });

  const notes = state.notes.filter(n => n.date === state.selectedDate);
  $("notesList").innerHTML = notes.length ? notes.map(n => `
    <article class="note">
      <button class="note-delete" data-note-delete="${n.id}" title="Excluir nota">✕</button>
      ${n.text ? `<p>${escapeHtml(n.text)}</p>` : ""}
      ${n.image ? `<img src="${n.image}" alt="Foto da anotação">` : ""}
    </article>
  `).join("") : `<div class="empty">Nenhuma anotação para este dia.</div>`;

  $("notesList").querySelectorAll("[data-note-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.notes = state.notes.filter(n => n.id !== btn.dataset.noteDelete);
      saveState(); renderAll();
    });
  });
}

function renderAll() {
  renderCalendar();
  renderSidebar();
  updateLiveClock();
}

function updateLiveClock() {
  const now = new Date();
  $("liveDate").textContent = now.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long"
  });
  $("liveClock").textContent = formatTime(now);
  checkAlerts(now);
  updateActiveTimer(now);
}

function openTaskModal(task=null) {
  $("taskModalTitle").textContent = task ? "Editar tarefa" : "Nova tarefa";
  $("taskId").value = task?.id || "";
  $("taskTitle").value = task?.title || "";
  $("taskDate").value = task?.date || state.selectedDate;
  $("taskTime").value = task?.time || formatTime(new Date()).slice(0,5);
  $("taskDuration").value = task?.duration || 30;
  $("taskReminder").value = task?.reminder ?? 5;
  $("taskDetails").value = task?.details || "";
  state.taskImage = task?.image || null;
  $("taskImage").value = "";
  $("taskImagePreview").classList.toggle("hidden", !state.taskImage);
  $("taskImagePreview").innerHTML = state.taskImage ? `<img src="${state.taskImage}" alt="Pré-visualização da tarefa">` : "";
  $("deleteTaskBtn").classList.toggle("hidden", !task);
  showModal("taskModal");
}

function openNoteModal() {
  $("noteText").value = "";
  $("noteImage").value = "";
  state.previewImage = null;
  $("imagePreview").classList.add("hidden");
  $("imagePreview").innerHTML = "";
  showModal("noteModal");
}

function showModal(id) { $(id).classList.remove("hidden"); }
function hideModal(id) { $(id).classList.add("hidden"); }

$("taskForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("taskId").value;
  const data = {
    id: id || uid("task"),
    title: $("taskTitle").value.trim(),
    date: $("taskDate").value,
    time: $("taskTime").value,
    duration: Number($("taskDuration").value),
    reminder: Number($("taskReminder").value),
    details: $("taskDetails").value.trim(),
    image: state.taskImage || null,
    completed: false
  };

  if (!data.title || !data.date || !data.time) return;

  if (id) {
    const index = state.tasks.findIndex(t => t.id === id);
    data.completed = state.tasks[index]?.completed || false;
    state.tasks[index] = data;
  } else {
    state.tasks.push(data);
  }

  state.selectedDate = data.date;
  state.viewDate = new Date(`${data.date}T12:00:00`);
  saveState(); hideModal("taskModal"); renderAll();
  toast(id ? "Tarefa atualizada." : "Tarefa criada.");
});

$("deleteTaskBtn").addEventListener("click", () => {
  const id = $("taskId").value;
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.activeTimerTaskId === id) stopTimer();
  saveState(); hideModal("taskModal"); renderAll();
  toast("Tarefa excluída.");
});

$("noteForm").addEventListener("submit", e => {
  e.preventDefault();
  const text = $("noteText").value.trim();
  if (!text && !state.previewImage) {
    toast("Escreva algo ou escolha uma foto.");
    return;
  }
  state.notes.push({
    id: uid("note"),
    date: state.selectedDate,
    text,
    image: state.previewImage
  });
  saveState(); hideModal("noteModal"); renderAll();
  toast("Anotação adicionada.");
});

$("noteImage").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.previewImage = reader.result;
    $("imagePreview").classList.remove("hidden");
    $("imagePreview").innerHTML = `<img src="${reader.result}" alt="Pré-visualização">`;
  };
  reader.readAsDataURL(file);
});

$("taskImage").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.taskImage = reader.result;
    $("taskImagePreview").classList.remove("hidden");
    $("taskImagePreview").innerHTML = `<img src="${reader.result}" alt="Pré-visualização da tarefa">`;
  };
  reader.readAsDataURL(file);
});

$("newTaskBtn").addEventListener("click", () => openTaskModal());
$("addNoteBtn").addEventListener("click", openNoteModal);

$("prevMonth").addEventListener("click", () => {
  state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth()-1, 1);
  renderCalendar();
});
$("nextMonth").addEventListener("click", () => {
  state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth()+1, 1);
  renderCalendar();
});
$("todayBtn").addEventListener("click", () => {
  const today = new Date();
  state.viewDate = today;
  state.selectedDate = toISODate(today);
  renderAll();
});

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => hideModal(btn.dataset.close));
});

["taskModal","noteModal","timerModal"].forEach(id => {
  $(id).addEventListener("click", e => {
    if (e.target === $(id)) hideModal(id);
  });
});

$("timerCloseBtn").addEventListener("click", () => hideModal("timerModal"));

function startTimer(task) {
  if (!task) return;
  state.activeTimerTaskId = task.id;
  $("timerTaskTitle").textContent = task.title;
  $("timerEndText").textContent = `Fim previsto às ${formatTime(taskEndDate(task))}`;
  showModal("timerModal");
  updateActiveTimer(new Date());
  toast(`Cronômetro iniciado: ${task.title}`);
}

function updateActiveTimer(now) {
  if (!state.activeTimerTaskId) return;
  const task = state.tasks.find(t => t.id === state.activeTimerTaskId);
  if (!task) return stopTimer();

  const start = taskStartDate(task);
  const end = taskEndDate(task);
  const total = end - start;
  const remaining = end - now;
  const elapsed = Math.min(Math.max(now - start, 0), total);
  const progress = total > 0 ? (elapsed / total) * 100 : 100;

  if (remaining <= 0) {
    $("timerDisplay").textContent = "00:00:00";
    $("timerProgress").style.width = "100%";
    playSound(END_SOUND);
    toast(`Tarefa encerrada: ${task.title}`);
    state.activeTimerTaskId = null;
    return;
  }

  const seconds = Math.floor(remaining / 1000);
  $("timerDisplay").textContent = formatHMS(seconds);
  $("timerProgress").style.width = `${progress}%`;
}

function stopTimer() {
  state.activeTimerTaskId = null;
  hideModal("timerModal");
}

function checkAlerts(now) {
  for (const task of state.tasks) {
    const start = taskStartDate(task);
    const end = taskEndDate(task);
    const reminderAt = new Date(start.getTime() - task.reminder * 60000);

    if (now >= reminderAt && now < start && !state.alertedStart[task.id]) {
      state.alertedStart[task.id] = Date.now();
      saveState();
      playSound(START_SOUND);
      toast(`Em breve: ${task.title} às ${task.time}`);
    }

    if (now >= end && now < new Date(end.getTime() + 1000) && !state.alertedEnd[task.id]) {
      state.alertedEnd[task.id] = Date.now();
      saveState();
      playSound(END_SOUND);
      toast(`Fim da tarefa: ${task.title}`);
    }
  }
}

function playSound(src) {
  const audio = new Audio(src);
  audio.volume = 0.8;
  audio.play().catch(() => {
    toast("O navegador bloqueou o som. Interaja com a página para habilitar os alertas.");
  });
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function formatDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min/60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h,m,s].map(v => String(v).padStart(2,"0")).join(":");
}

function escapeHtml(value="") {
  return value.replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

renderAll();
setInterval(updateLiveClock, 1000);

setInterval(() => {
  const now = Date.now();
  const maxAge = 1000 * 60 * 60 * 24 * 30;
  for (const id of Object.keys(state.alertedStart)) {
    if (now - state.alertedStart[id] > maxAge) delete state.alertedStart[id];
  }
  for (const id of Object.keys(state.alertedEnd)) {
    if (now - state.alertedEnd[id] > maxAge) delete state.alertedEnd[id];
  }
  saveState();
}, 1000 * 60 * 60);

// --- GERENCIAMENTO DE ABAS E YOUTUBE SHORTS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    
    const targetTab = e.target.getAttribute('data-tab');
    e.target.classList.add('active');
    $(targetTab).classList.remove('hidden');
  });
});

let ytAccessToken = null;
let editingScheduledId = null;

function persistConnection(token, expiresIn) {
  const connection = { connected: true, token, expiresAt: Date.now() + (Number(expiresIn || 3600) * 1000) };
  state.ytConnection = connection;
  ytAccessToken = token;
  localStorage.setItem("chronos_yt_connection", JSON.stringify(connection));
  updateYoutubeConnectionStatus();
}

function updateYoutubeConnectionStatus() {
  const saved = state.ytConnection;
  const valid = saved && saved.connected && saved.token && saved.expiresAt > Date.now();
  if (valid) {
    ytAccessToken = saved.token;
    $("ytAuthStatus").textContent = "Status: Conectado (sessão salva)";
    $("ytAuthStatus").style.color = "#10b981";
  } else {
    $("ytAuthStatus").textContent = "Status: Não conectado";
    $("ytAuthStatus").style.color = "var(--danger)";
  }
}

if (localStorage.getItem("chronos_yt_client_id")) $("ytClientId").value = localStorage.getItem("chronos_yt_client_id");
updateYoutubeConnectionStatus();

$("btnSaveClientId")?.addEventListener("click", () => {
  const val = $("ytClientId").value.trim();
  if (val) { localStorage.setItem("chronos_yt_client_id", val); toast("Client ID salvo com sucesso!"); }
  else toast("Informe um Client ID válido.");
});

$("btnConnectYoutube")?.addEventListener("click", () => {
  const clientId = localStorage.getItem("chronos_yt_client_id") || $("ytClientId").value.trim();
  if (!clientId) return toast("Por favor, insira seu Client ID do Google Cloud.");
  if (!window.google?.accounts?.oauth2) return toast("A autenticação do Google ainda está carregando. Tente novamente.");
  const client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    callback: response => { if (response.access_token) { persistConnection(response.access_token, response.expires_in); toast("Autenticado no YouTube com sucesso!"); } }
  });
  client.requestAccessToken();
});

function renderScheduledVideos() {
  const list = $("scheduledVideosList");
  if (!list) return;
  const items = [...state.scheduledVideos].sort((a,b) => new Date(a.publishAt) - new Date(b.publishAt));
  list.innerHTML = items.length ? items.map(v => {
    const date = new Date(v.publishAt);
    const label = date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    return `<article class="scheduled-card">
      ${v.thumbnail ? `<img class="scheduled-thumb" src="${v.thumbnail}" alt="Capa de ${escapeHtml(v.title)}">` : `<div class="scheduled-thumb scheduled-placeholder">▶</div>`}
      <div><div class="scheduled-title">${escapeHtml(v.title)}</div><div class="scheduled-meta">${v.status === "scheduled" ? "Agendado" : "Publicado"} • ${label}<br>${v.madeForKids ? "Conteúdo para crianças" : "Não definido como conteúdo infantil"}</div></div>
      <div class="scheduled-actions"><button class="task-action" data-scheduled-edit="${v.id}" title="Editar">✏️</button><button class="task-action" data-scheduled-delete="${v.id}" title="Excluir registro">🗑️</button></div>
    </article>`;
  }).join("") : `<div class="empty">Nenhum vídeo programado ainda. Envie um Short pela aba YouTube Shorts.</div>`;
  $("scheduledSummary").innerHTML = `<strong>${items.length}</strong> vídeo${items.length === 1 ? "" : "s"} registrado${items.length === 1 ? "" : "s"} localmente.<br>Os arquivos de vídeo não ficam armazenados no navegador após o upload.`;
  list.querySelectorAll("[data-scheduled-edit]").forEach(btn => btn.addEventListener("click", () => openScheduledEditor(btn.dataset.scheduledEdit)));
  list.querySelectorAll("[data-scheduled-delete]").forEach(btn => btn.addEventListener("click", () => { state.scheduledVideos = state.scheduledVideos.filter(v => v.id !== btn.dataset.scheduledDelete); saveState(); renderScheduledVideos(); toast("Registro do vídeo excluído."); }));
}

function openScheduledEditor(id) {
  const video = state.scheduledVideos.find(v => v.id === id); if (!video) return;
  editingScheduledId = id;
  $("ytTitle").value = video.title; $("ytDesc").value = video.description || ""; $("ytTags").value = (video.tags || []).join(", ");
  $("ytPublishAt").value = new Date(video.publishAt.getTime ? video.publishAt : new Date(video.publishAt)).toISOString().slice(0,16);
  $("ytMadeForKids").checked = !!video.madeForKids;
  document.querySelector('[data-tab="tab-youtube"]').click();
  toast("Dados carregados. Salve novamente para atualizar o registro.");
}

$("openYoutubeFromScheduled")?.addEventListener("click", () => document.querySelector('[data-tab="tab-youtube"]').click());

$("ytUploadForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!ytAccessToken || !state.ytConnection || state.ytConnection.expiresAt <= Date.now()) { toast("Conecte sua conta do YouTube primeiro."); updateYoutubeConnectionStatus(); return; }
  const file = $("ytFile").files[0]; const thumbnailFile = $("ytThumbnail").files[0];
  const title = $("ytTitle").value.trim(); const description = $("ytDesc").value.trim();
  const existingVideo = editingScheduledId ? state.scheduledVideos.find(v => v.id === editingScheduledId) : null;
  const tags = $("ytTags").value.split(",").map(t => t.trim()).filter(Boolean); const publishAtRaw = $("ytPublishAt").value;
  if (!file && !existingVideo) return toast("Selecione um vídeo .mp4 ou .webm.");
  if (file && !(/^(video\/mp4|video\/webm)$/i.test(file.type) || /\.(mp4|webm)$/i.test(file.name))) return toast("Selecione um vídeo .mp4 ou .webm.");
  const isScheduled = Boolean(publishAtRaw); const publishDateObj = isScheduled ? new Date(publishAtRaw) : new Date();
  const publishAtISO = isScheduled ? publishDateObj.toISOString() : undefined; const privacyStatus = isScheduled ? "private" : "public";
  const resultDiv = $("ytUploadResult"); resultDiv.innerHTML = '<p style="color: var(--text); font-weight: 600;">Enviando vídeo para o YouTube...</p>';
  const metadata = { snippet: { title, description, tags, categoryId: "22" }, status: { privacyStatus, ...(publishAtISO && { publishAt: publishAtISO }), selfDeclaredMadeForKids: $("ytMadeForKids").checked } };
  try {
    let resData;
    if (existingVideo && !file) {
      const updateRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status`, { method:"PUT", headers:{ Authorization:`Bearer ${ytAccessToken}`, "Content-Type":"application/json; charset=UTF-8" }, body:JSON.stringify({ id: existingVideo.youtubeId, ...metadata }) });
      resData = await updateRes.json(); if (!updateRes.ok) throw new Error(resData.error?.message || "Erro ao atualizar o Short.");
    } else {
      const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method:"POST", headers:{ Authorization:`Bearer ${ytAccessToken}`, "Content-Type":"application/json; charset=UTF-8", "X-Upload-Content-Length":file.size, "X-Upload-Content-Type":file.type }, body:JSON.stringify(metadata) });
      if (!initRes.ok) throw new Error("Erro na conexão inicial com o YouTube API.");
      const uploadRes = await fetch(initRes.headers.get("Location"), { method:"PUT", headers:{"Content-Type":file.type}, body:file }); resData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(resData.error?.message || "Erro durante o upload.");
    }
    let thumbnail = existingVideo?.thumbnail || null;
    if (thumbnailFile) {
      thumbnail = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(thumbnailFile); });
      const thumbRes = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(resData.id || existingVideo.youtubeId)}`, { method:"POST", headers:{ Authorization:`Bearer ${ytAccessToken}`, "Content-Type":thumbnailFile.type }, body:thumbnailFile });
      if (!thumbRes.ok) throw new Error("Short atualizado, mas não foi possível enviar a capa.");
    }
    const record = { id: editingScheduledId || uid("scheduled"), youtubeId: resData.id || existingVideo?.youtubeId, title, description, tags, publishAt: publishDateObj.toISOString(), madeForKids: $("ytMadeForKids").checked, thumbnail, status: isScheduled ? "scheduled" : "published", updatedAt: Date.now() };
    if (editingScheduledId) { const index = state.scheduledVideos.findIndex(v => v.id === editingScheduledId); state.scheduledVideos[index] = record; } else state.scheduledVideos.push(record);
    editingScheduledId = null; saveState(); renderScheduledVideos();
    const formatted = publishDateObj.toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" });
    resultDiv.innerHTML = `<div style="background:#ecfdf5;color:#065f46;padding:14px;border-radius:10px;font-size:13px;border:1px solid #a7f3d0;"><strong>✅ Short ${isScheduled ? "enviado e agendado" : "publicado"}!</strong><br><strong>Vídeo:</strong> ${escapeHtml(title)}<br><strong>Data:</strong> ${formatted}<br><em>Também disponível na aba Programados.</em></div>`;
    toast(`Short ${isScheduled ? "agendado" : "publicado"} com sucesso!`); $("ytUploadForm").reset();
  } catch (err) { resultDiv.innerHTML = `<div style="background:#fef2f2;color:#991b1b;padding:14px;border-radius:10px;font-size:13px;border:1px solid #fecaca;"><strong>⚠️ Falha no upload:</strong> ${escapeHtml(err.message)}</div>`; }
});

renderScheduledVideos();
