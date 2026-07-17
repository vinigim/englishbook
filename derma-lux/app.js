/* ============================================================
   Derma Lux — Agenda de aluguéis de laser
   ------------------------------------------------------------
   Dois modos de funcionamento, escolhidos automaticamente:

   • MODO NUVEM  — quando config.js tem as chaves do Supabase.
       Login por e-mail/senha, dados sincronizados em tempo real
       entre todos os aparelhos e usuários da empresa.

   • MODO LOCAL  — quando config.js está em branco.
       Dados salvos apenas neste navegador (localStorage), sem login.
   ============================================================ */

const DOW = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const FULL_MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const PALETTE = ["#8b7bff","#34d3c6","#ff8fb1","#ffb443","#6fb1ff","#3ddc97","#c78bff","#ff7a7a"];
const LOCAL_KEY = "dermalux_v1";

/* ---------- Modo (nuvem vs local) ---------- */
const CFG = window.DERMALUX_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey &&
                 !/SEU_|xxxx|<.*>/i.test(CFG.supabaseUrl));
let sb = null;
if (CLOUD) {
  if (!window.supabase || !window.supabase.createClient) {
    alert("Não foi possível carregar a biblioteca do Supabase (sem internet?). O app abrirá em modo local.");
  } else {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  }
}
const USE_CLOUD = CLOUD && !!sb;

/* ---------- Estado em memória (cache) ---------- */
let state = { equipment: [], rentals: [] };
let currentView = "agenda";

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ============================================================
   CAMADA DE DADOS
   ============================================================ */
function mapEquipRow(r){ return { id: r.id, name: r.name, use: r.use, color: r.color || "#8b7bff" }; }
function mapRentalRow(r){
  return {
    id: r.id, client: r.client, address: r.address, phone: r.phone,
    equipId: r.equip_id, date: r.date,
    start: (r.start_time || "").slice(0,5), end: (r.end_time || "").slice(0,5),
    price: r.price != null ? Number(r.price) : null, notes: r.notes,
  };
}
function rentalToRow(d){
  return {
    client: d.client, address: d.address, phone: d.phone || null,
    equip_id: d.equipId, date: d.date, start_time: d.start, end_time: d.end,
    price: d.price, notes: d.notes || null,
  };
}

function seedLocal(){
  return {
    equipment: [
      { id: uid(), name: "Laser CO2 Fracionado", use: "Rejuvenescimento", color: "#8b7bff" },
      { id: uid(), name: "Laser Depilação Diodo", use: "Depilação", color: "#34d3c6" },
    ],
    rentals: [],
  };
}
function persistLocal(){ localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); }

async function dbLoad(){
  if (USE_CLOUD){
    const [eqRes, rtRes] = await Promise.all([
      sb.from("equipment").select("*").order("created_at", { ascending: true }),
      sb.from("rentals").select("*"),
    ]);
    if (eqRes.error) throw eqRes.error;
    if (rtRes.error) throw rtRes.error;
    state.equipment = (eqRes.data || []).map(mapEquipRow);
    state.rentals = (rtRes.data || []).map(mapRentalRow);
  } else {
    let raw = localStorage.getItem(LOCAL_KEY);
    let s = raw ? JSON.parse(raw) : seedLocal();
    state.equipment = s.equipment || [];
    state.rentals = s.rentals || [];
    persistLocal();
  }
}

async function dbAddEquip(d){
  if (USE_CLOUD){ const { error } = await sb.from("equipment").insert(d); if (error) throw error; }
  else { state.equipment.push({ id: uid(), ...d }); persistLocal(); }
}
async function dbUpdateEquip(id, d){
  if (USE_CLOUD){ const { error } = await sb.from("equipment").update(d).eq("id", id); if (error) throw error; }
  else { Object.assign(equipById(id), d); persistLocal(); }
}
async function dbDeleteEquip(id){
  if (USE_CLOUD){ const { error } = await sb.from("equipment").delete().eq("id", id); if (error) throw error; }
  else { state.equipment = state.equipment.filter(e => e.id !== id);
         state.rentals = state.rentals.filter(r => r.equipId !== id); persistLocal(); }
}
async function dbAddRental(d){
  if (USE_CLOUD){ const { error } = await sb.from("rentals").insert(rentalToRow(d)); if (error) throw error; }
  else { state.rentals.push({ id: uid(), ...d }); persistLocal(); }
}
async function dbUpdateRental(id, d){
  if (USE_CLOUD){ const { error } = await sb.from("rentals").update(rentalToRow(d)).eq("id", id); if (error) throw error; }
  else { Object.assign(state.rentals.find(r => r.id === id), d); persistLocal(); }
}
async function dbDeleteRental(id){
  if (USE_CLOUD){ const { error } = await sb.from("rentals").delete().eq("id", id); if (error) throw error; }
  else { state.rentals = state.rentals.filter(r => r.id !== id); persistLocal(); }
}

/* ============================================================
   HELPERS
   ============================================================ */
function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fmtDateLong(iso){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return { day: `${d} de ${MONTHS[m-1]}`, dow: DOW[dt.getDay()] };
}
function minutes(t){ const [h,m] = t.split(":").map(Number); return h*60+m; }
function fmtMin(m){ return String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0"); }
function toBRL(v){
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/\./g,"").replace(",","."));
  return isNaN(n) ? null : n;
}
function fmtBRL(n){ return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function equipById(id){ return state.equipment.find(e => e.id === id); }
function overlaps(aS,aE,bS,bE){ return aS < bE && bS < aE; }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

let toastTimer;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function showError(e){ console.error(e); toast("Erro: " + (e && e.message ? e.message : e)); }

/* ============================================================
   NAVEGAÇÃO
   ============================================================ */
document.getElementById("tabs").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  currentView = btn.dataset.view;
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + currentView).classList.add("active");
  renderCurrent();
});
function renderCurrent(){
  if (currentView === "agenda") renderAgenda();
  else if (currentView === "disponibilidade") renderAvailability();
  else if (currentView === "equipamentos") renderEquip();
}

/* ---------- Modais ---------- */
function closeModal(id){ document.getElementById(id).classList.remove("open"); }
document.querySelectorAll(".overlay").forEach(o => {
  o.addEventListener("click", e => { if (e.target === o) o.classList.remove("open"); });
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".overlay.open").forEach(o => o.classList.remove("open"));
});

/* ============================================================
   AUTENTICAÇÃO (modo nuvem)
   ============================================================ */
async function initAuth(){
  updateModeBanner();
  if (!USE_CLOUD){ await startApp(); return; }

  const { data: { session } } = await sb.auth.getSession();
  if (session) await onSignedIn(session);
  else showAuthScreen();

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) onSignedIn(session);
    else showAuthScreen();
  });
}
function showAuthScreen(){
  document.getElementById("authScreen").classList.add("show");
  document.getElementById("userArea").style.display = "none";
}
async function onSignedIn(session){
  document.getElementById("authScreen").classList.remove("show");
  const ua = document.getElementById("userArea");
  ua.style.display = "flex";
  document.getElementById("userEmail").textContent = session.user.email || "";
  await startApp();
  setupRealtime();
}
async function doLogin(ev){
  ev.preventDefault();
  const btn = document.getElementById("authBtn");
  const errEl = document.getElementById("authError");
  errEl.textContent = "";
  btn.disabled = true; btn.textContent = "Entrando...";
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error){
    errEl.textContent = error.message === "Invalid login credentials"
      ? "E-mail ou senha incorretos." : error.message;
  }
  // sucesso -> onAuthStateChange cuida do resto
}
async function doLogout(){
  if (channel){ sb.removeChannel(channel); channel = null; }
  await sb.auth.signOut();
}

/* ---------- Realtime ---------- */
let channel = null;
let remoteTimer;
function setupRealtime(){
  if (!USE_CLOUD || channel) return;
  channel = sb.channel("dermalux-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "rentals" }, onRemoteChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "equipment" }, onRemoteChange)
    .subscribe();
}
function onRemoteChange(){
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(async () => {
    try { await dbLoad(); renderCurrent(); } catch(e){ console.error(e); }
  }, 300);
}

/* ---------- Banner de modo ---------- */
function updateModeBanner(){
  const el = document.getElementById("modeBanner");
  if (USE_CLOUD){
    el.innerHTML = `<span class="chip cloud">☁️ Nuvem</span> Sincronizado entre todos os aparelhos e usuários.`;
  } else {
    el.innerHTML = `<span class="chip local">💾 Local</span> Os dados ficam só neste navegador. Configure o Supabase (README) para acessar de vários dispositivos.`;
  }
}

/* ---------- Boot dos dados ---------- */
async function startApp(){
  try {
    await dbLoad();
  } catch(e){ showError(e); }
  renderCurrent();
}

/* ============================================================
   ALUGUEL — modal + CRUD
   ============================================================ */
function fillEquipSelect(sel, includeAll){
  const prev = sel.value;
  sel.innerHTML = "";
  if (includeAll){ const o = document.createElement("option"); o.value=""; o.textContent="Todos os equipamentos"; sel.appendChild(o); }
  state.equipment.forEach(e => {
    const o = document.createElement("option"); o.value = e.id; o.textContent = e.name; sel.appendChild(o);
  });
  if (prev && state.equipment.some(e => e.id === prev)) sel.value = prev;
}

function openRentalModal(prefill){
  if (state.equipment.length === 0){
    toast("Cadastre um equipamento primeiro.");
    document.querySelector('[data-view="equipamentos"]').click();
    return;
  }
  document.getElementById("rentalForm").reset();
  document.getElementById("rentalId").value = "";
  document.getElementById("conflictWarn").style.display = "none";
  document.getElementById("rentalModalTitle").textContent = "Novo aluguel";
  fillEquipSelect(document.getElementById("rEquip"), false);
  document.getElementById("rDate").value = (prefill && prefill.date) || todayStr();
  if (prefill){
    if (prefill.equipId) document.getElementById("rEquip").value = prefill.equipId;
    if (prefill.start) document.getElementById("rStart").value = prefill.start;
    if (prefill.end) document.getElementById("rEnd").value = prefill.end;
  }
  document.getElementById("rentalOverlay").classList.add("open");
  setTimeout(() => document.getElementById("rClient").focus(), 50);
}

function editRental(id){
  const r = state.rentals.find(x => x.id === id);
  if (!r) return;
  fillEquipSelect(document.getElementById("rEquip"), false);
  document.getElementById("rentalId").value = r.id;
  document.getElementById("rClient").value = r.client;
  document.getElementById("rAddress").value = r.address;
  document.getElementById("rPhone").value = r.phone || "";
  document.getElementById("rEquip").value = r.equipId;
  document.getElementById("rDate").value = r.date;
  document.getElementById("rStart").value = r.start;
  document.getElementById("rEnd").value = r.end;
  document.getElementById("rPrice").value = r.price != null ? String(r.price).replace(".", ",") : "";
  document.getElementById("rNotes").value = r.notes || "";
  document.getElementById("conflictWarn").style.display = "none";
  document.getElementById("rentalModalTitle").textContent = "Editar aluguel";
  document.getElementById("rentalOverlay").classList.add("open");
}

function checkConflict(equipId, date, start, end, ignoreId){
  const s = minutes(start), e = minutes(end);
  return state.rentals.some(r => r.id !== ignoreId && r.equipId === equipId && r.date === date &&
    overlaps(s, e, minutes(r.start), minutes(r.end)));
}

// aviso ao vivo de conflito
["rEquip","rDate","rStart","rEnd"].forEach(id => {
  const el = document.getElementById(id);
  const handler = () => {
    const eq = document.getElementById("rEquip").value;
    const d = document.getElementById("rDate").value;
    const s = document.getElementById("rStart").value;
    const e = document.getElementById("rEnd").value;
    if (eq && d && s && e && minutes(e) > minutes(s)){
      document.getElementById("conflictWarn").style.display =
        checkConflict(eq, d, s, e, document.getElementById("rentalId").value) ? "block" : "none";
    } else {
      document.getElementById("conflictWarn").style.display = "none";
    }
  };
  el.addEventListener("input", handler);
  el.addEventListener("change", handler);
});

async function saveRental(ev){
  ev.preventDefault();
  const id = document.getElementById("rentalId").value;
  const start = document.getElementById("rStart").value;
  const end = document.getElementById("rEnd").value;
  if (minutes(end) <= minutes(start)){ toast("O horário de término deve ser depois do início."); return; }

  const data = {
    client: document.getElementById("rClient").value.trim(),
    address: document.getElementById("rAddress").value.trim(),
    phone: document.getElementById("rPhone").value.trim(),
    equipId: document.getElementById("rEquip").value,
    date: document.getElementById("rDate").value,
    start, end,
    price: toBRL(document.getElementById("rPrice").value),
    notes: document.getElementById("rNotes").value.trim(),
  };

  if (checkConflict(data.equipId, data.date, start, end, id)){
    if (!confirm("Este horário conflita com outro aluguel do mesmo equipamento. Deseja salvar mesmo assim?")) return;
  }

  try {
    if (id) { await dbUpdateRental(id, data); toast("Aluguel atualizado."); }
    else    { await dbAddRental(data);        toast("Aluguel agendado!"); }
    if (!USE_CLOUD) { /* estado já atualizado */ } else { await dbLoad(); }
    closeModal("rentalOverlay");
    renderCurrent();
  } catch(e){ showError(e); }
}

async function deleteRental(id){
  const r = state.rentals.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Remover o aluguel de "${r.client}"?`)) return;
  try {
    await dbDeleteRental(id);
    if (USE_CLOUD) await dbLoad();
    renderCurrent();
    toast("Aluguel removido.");
  } catch(e){ showError(e); }
}

/* ============================================================
   RENDER — AGENDA
   ============================================================ */
function renderStats(){
  const el = document.getElementById("stats");
  const today = todayStr();
  const upcoming = state.rentals.filter(r => r.date >= today);
  const todays = state.rentals.filter(r => r.date === today);
  const revenue = upcoming.reduce((s,r) => s + (r.price || 0), 0);
  el.innerHTML = `
    <div class="stat"><div class="k">Aluguéis hoje</div><div class="v">${todays.length}</div></div>
    <div class="stat"><div class="k">Próximos aluguéis</div><div class="v">${upcoming.length}</div></div>
    <div class="stat"><div class="k">Equipamentos</div><div class="v">${state.equipment.length}</div></div>
    <div class="stat"><div class="k">A receber (futuro)</div><div class="v"><small>${revenue ? fmtBRL(revenue) : "—"}</small></div></div>
  `;
}

function renderAgenda(){
  renderStats();
  fillEquipSelect(document.getElementById("filterEquip"), true);
  const list = document.getElementById("agendaList");
  const q = (document.getElementById("searchInput").value || "").toLowerCase().trim();
  const fEquip = document.getElementById("filterEquip").value;
  const showPast = document.getElementById("showPast").checked;
  const today = todayStr();

  let items = state.rentals.slice();
  if (!showPast) items = items.filter(r => r.date >= today);
  if (fEquip) items = items.filter(r => r.equipId === fEquip);
  if (q) items = items.filter(r => {
    const eq = equipById(r.equipId);
    return [r.client, r.address, r.notes, r.phone, eq && eq.name].join(" ").toLowerCase().includes(q);
  });

  items.sort((a,b) => a.date === b.date ? minutes(a.start) - minutes(b.start) : a.date.localeCompare(b.date));

  if (items.length === 0){
    list.innerHTML = `<div class="empty"><div class="big">📅</div><h3>Nenhum aluguel ${showPast ? "" : "futuro "}encontrado</h3>
      <p>Clique em <b>Novo aluguel</b> para agendar o uso de um laser.</p></div>`;
    return;
  }

  const groups = {};
  items.forEach(r => { (groups[r.date] = groups[r.date] || []).push(r); });

  let html = "";
  Object.keys(groups).sort().forEach(date => {
    const info = fmtDateLong(date);
    const isToday = date === today;
    const isPastDay = date < today;
    html += `<div class="day-group"><div class="day-head">
      <span class="d">${info.day}</span>
      <span class="dow">${info.dow}</span>
      ${isToday ? '<span class="badge-today">HOJE</span>' : ""}
      <span class="cnt">${groups[date].length} aluguel(éis)</span>
    </div>`;
    groups[date].forEach(r => {
      const eq = equipById(r.equipId) || { name: "—", color: "#888" };
      html += `<div class="rental ${isPastDay ? "past" : ""}">
        <div class="time">${r.start}<small>até ${r.end}</small></div>
        <div class="info">
          <div class="client">${esc(r.client)}</div>
          <div class="meta">
            <span>📍 ${esc(r.address)}</span>
            ${r.phone ? `<span>📞 ${esc(r.phone)}</span>` : ""}
            ${r.price != null ? `<span>💰 ${fmtBRL(r.price)}</span>` : ""}
            ${r.notes ? `<span>📝 ${esc(r.notes)}</span>` : ""}
          </div>
        </div>
        <span class="equip-pill" style="background:${eq.color}">${esc(eq.name)}</span>
        <div class="actions">
          <button class="icon-btn" title="Editar" onclick="editRental('${r.id}')">✏️</button>
          <button class="icon-btn del" title="Remover" onclick="deleteRental('${r.id}')">🗑️</button>
        </div>
      </div>`;
    });
    html += "</div>";
  });
  list.innerHTML = html;
}

/* ============================================================
   RENDER — DISPONIBILIDADE
   ============================================================ */
function renderAvailability(){
  const equipSel = document.getElementById("availEquip");
  fillEquipSelect(equipSel, false);
  if (!document.getElementById("availDate").value) document.getElementById("availDate").value = todayStr();

  const grid = document.getElementById("availGrid");
  if (state.equipment.length === 0){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🔬</div><h3>Nenhum equipamento cadastrado</h3><p>Cadastre um laser na aba Equipamentos.</p></div>`;
    return;
  }

  const equipId = equipSel.value;
  const date = document.getElementById("availDate").value;
  const step = parseInt(document.getElementById("availStep").value, 10);
  const open = minutes(document.getElementById("availOpen").value || "08:00");
  const close = minutes(document.getElementById("availClose").value || "20:00");
  const dayRentals = state.rentals.filter(r => r.equipId === equipId && r.date === date);

  let html = "";
  for (let t = open; t + step <= close; t += step){
    const slotEnd = t + step;
    const conflict = dayRentals.find(r => overlaps(t, slotEnd, minutes(r.start), minutes(r.end)));
    const label = fmtMin(t) + "–" + fmtMin(slotEnd);
    if (conflict){
      html += `<div class="slot busy" title="Ocupado: ${esc(conflict.client)}">${fmtMin(t)}<span class="who">${esc(conflict.client)}</span></div>`;
    } else {
      const pf = JSON.stringify({ date, equipId, start: fmtMin(t), end: fmtMin(slotEnd) }).replace(/'/g, "&#39;");
      html += `<div class="slot free" title="Livre — clique para agendar ${label}" onclick='openRentalModal(${pf})'>${fmtMin(t)}<span class="who">livre</span></div>`;
    }
  }
  grid.innerHTML = html || `<div class="empty" style="grid-column:1/-1"><p>Ajuste os horários de abertura/fechamento.</p></div>`;
}

/* ============================================================
   RENDER — EQUIPAMENTOS
   ============================================================ */
function openEquipModal(){
  document.getElementById("equipForm").reset();
  document.getElementById("equipId").value = "";
  document.getElementById("eColor").value = PALETTE[state.equipment.length % PALETTE.length];
  document.getElementById("equipModalTitle").textContent = "Novo equipamento";
  document.getElementById("equipOverlay").classList.add("open");
  setTimeout(() => document.getElementById("eName").focus(), 50);
}
function editEquip(id){
  const e = equipById(id); if (!e) return;
  document.getElementById("equipId").value = e.id;
  document.getElementById("eName").value = e.name;
  document.getElementById("eUse").value = e.use || "";
  document.getElementById("eColor").value = e.color;
  document.getElementById("equipModalTitle").textContent = "Editar equipamento";
  document.getElementById("equipOverlay").classList.add("open");
}
async function saveEquip(ev){
  ev.preventDefault();
  const id = document.getElementById("equipId").value;
  const data = {
    name: document.getElementById("eName").value.trim(),
    use: document.getElementById("eUse").value.trim(),
    color: document.getElementById("eColor").value,
  };
  try {
    if (id) { await dbUpdateEquip(id, data); toast("Equipamento atualizado."); }
    else    { await dbAddEquip(data);        toast("Equipamento cadastrado."); }
    if (USE_CLOUD) await dbLoad();
    closeModal("equipOverlay");
    renderCurrent();
  } catch(e){ showError(e); }
}
async function deleteEquip(id){
  const e = equipById(id); if (!e) return;
  const count = state.rentals.filter(r => r.equipId === id).length;
  const msg = count > 0
    ? `O laser "${e.name}" tem ${count} aluguel(éis) agendado(s). Remover o equipamento também removerá esses aluguéis. Continuar?`
    : `Remover o equipamento "${e.name}"?`;
  if (!confirm(msg)) return;
  try {
    await dbDeleteEquip(id);
    if (USE_CLOUD) await dbLoad();
    renderCurrent();
    toast("Equipamento removido.");
  } catch(err){ showError(err); }
}
function renderEquip(){
  const el = document.getElementById("equipList");
  if (state.equipment.length === 0){
    el.innerHTML = `<div class="empty"><div class="big">🔬</div><h3>Nenhum equipamento cadastrado</h3><p>Clique em <b>Novo equipamento</b> para começar.</p></div>`;
    return;
  }
  const today = todayStr();
  el.innerHTML = state.equipment.map(e => {
    const count = state.rentals.filter(r => r.equipId === e.id && r.date >= today).length;
    return `<div class="equip-card">
      <div class="swatch" style="background:${e.color}"></div>
      <div>
        <div class="name">${esc(e.name)}</div>
        ${e.use ? `<div class="use">${esc(e.use)}</div>` : ""}
      </div>
      <div style="flex:1"></div>
      <span class="tag">${count} próximos</span>
      <button class="icon-btn" title="Editar" onclick="editEquip('${e.id}')">✏️</button>
      <button class="icon-btn del" title="Remover" onclick="deleteEquip('${e.id}')">🗑️</button>
    </div>`;
  }).join("");
}

/* ============================================================
   INIT
   ============================================================ */
initAuth();
