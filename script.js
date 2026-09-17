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
  previewImage: null
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

if (localStorage.getItem("chronos_yt_client_id")) {
  $("ytClientId").value = localStorage.getItem("chronos_yt_client_id");
}

$("btnSaveClientId")?.addEventListener("click", () => {
  const val = $("ytClientId").value.trim();
  if (val) {
    localStorage.setItem("chronos_yt_client_id", val);
    toast("Client ID salvo com sucesso!");
  } else {
    toast("Informe um Client ID válido.");
  }
});

$("btnConnectYoutube")?.addEventListener("click", () => {
  const clientId = localStorage.getItem("chronos_yt_client_id") || $("ytClientId").value.trim();
  if (!clientId) {
    toast("Por favor, insira seu Client ID do Google Cloud.");
    return;
  }

  const client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    callback: (response) => {
      if (response.access_token) {
        ytAccessToken = response.access_token;
        $("ytAuthStatus").textContent = "Status: Conectado ao YouTube!";
        $("ytAuthStatus").style.color = "#10b981";
        toast("Autenticado no YouTube com sucesso!");
      }
    }
  });

  client.requestAccessToken();
});

$("ytUploadForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ytAccessToken) {
    toast("Conecte sua conta do YouTube primeiro.");
    return;
  }

  const file = $("ytFile").files[0];
  const title = $("ytTitle").value.trim();
  const description = $("ytDesc").value.trim();
  const tags = $("ytTags").value.split(",").map(t => t.trim()).filter(Boolean);
  const publishAtRaw = $("ytPublishAt").value;

  if (!file) {
    toast("Selecione um vídeo .mp4.");
    return;
  }

  const publishDateObj = new Date(publishAtRaw);
  const publishAtISO = publishDateObj.toISOString();
  const resultDiv = $("ytUploadResult");
  
  resultDiv.innerHTML = '<p style="color: var(--text); font-weight: 600;">Enviando vídeo para o YouTube...</p>';

  const metadata = {
    snippet: {
      title,
      description,
      tags,
      categoryId: "22"
    },
    status: {
      privacyStatus: "private",
      publishAt: publishAtISO,
      selfDeclaredMadeForKids: false
    }
  };

  try {
    const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ytAccessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": file.size,
        "X-Upload-Content-Type": file.type
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) throw new Error("Erro na conexão inicial com o YouTube API.");

    const uploadUrl = initRes.headers.get("Location");
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });

    const resData = await uploadRes.json();

    if (uploadRes.ok) {
      const formattedDate = publishDateObj.toLocaleDateString("pt-BR");
      const formattedTime = publishDateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const targetIsoDate = toISODate(publishDateObj);

      // Adiciona o agendamento nas Anotações do dia correspondente
      state.notes.push({
        id: uid("note"),
        date: targetIsoDate,
        text: `🎬 [YouTube Short Agendado]
Título: ${title}
Horário: ${formattedTime}
ID: ${resData.id}`,
        image: null
      });

      saveState();
      renderAll();

      resultDiv.innerHTML = `<div style="background: #ecfdf5; color: #065f46; padding: 14px; border-radius: 10px; font-size: 13px; border: 1px solid #a7f3d0;">
        <strong>✅ Short enviado e agendado!</strong><br>
        <strong>Vídeo:</strong> ${escapeHtml(title)}<br>
        <strong>Agendado para:</strong> ${formattedDate} às ${formattedTime}<br>
        <em>Nota registrada automaticamente nas anotações do dia!</em>
      </div>`;

      toast("Short agendado e nota registrada com sucesso!");
      $("ytUploadForm").reset();
    } else {
      throw new Error(resData.error?.message || "Erro durante o upload.");
    }
  } catch (err) {
    resultDiv.innerHTML = `<div style="background: #fef2f2; color: #991b1b; padding: 14px; border-radius: 10px; font-size: 13px; border: 1px solid #fecaca;">
      <strong>⚠️ Falha no upload:</strong> ${escapeHtml(err.message)}
    </div>`;
  }
});
