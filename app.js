const CATEGORIA_LABELS = {
  eletricidade: "Eletricidade",
  canalizacao: "Canalização",
  climatizacao: "Climatização",
  construcao_civil: "Construção civil",
  carpintaria: "Carpintaria",
  pintura: "Pintura",
  serralharia: "Serralharia",
  informatica: "Informática",
  equipamentos: "Equipamentos",
  limpeza_especializada: "Limpeza especializada",
  espacos_exteriores: "Espaços exteriores",
  seguranca: "Segurança",
  outro: "Outro",
};

const PRIORIDADE_LABELS = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

const STATUS_LABELS = {
  pendente: "Pendente",
  em_execucao: "Em execução",
  concluida: "Concluída",
  fechada: "Fechada",
  rejeitada: "Rejeitada",
};

// Transições válidas a partir de cada estado (espelha o CASE em
// manutencaoja_mudar_estado, db/manutencaoja_setup.sql) — controla que
// botões de ação aparecem em cada pedido, no painel do Admin.
const TRANSICOES = {
  pendente: [
    { estado: "em_execucao", label: "Aceitar", variant: "btn-primary" },
    { estado: "rejeitada", label: "Rejeitar", variant: "btn-secondary" },
  ],
  em_execucao: [
    { estado: "concluida", label: "Marcar concluída", variant: "btn-primary" },
    { estado: "rejeitada", label: "Rejeitar", variant: "btn-secondary" },
  ],
  concluida: [
    { estado: "fechada", label: "Validar e fechar", variant: "btn-primary" },
    { estado: "em_execucao", label: "Reabrir", variant: "btn-secondary" },
  ],
};

const PAGE_TITLES = {
  dashboard: "Dashboard",
  pedido: "Novo pedido",
  "meus-pedidos": "Os meus pedidos",
  admin: "Gestão de pedidos",
};

let currentUser;
let currentProfessor;
let currentPage;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type = "error") {
  const element = document.getElementById("pageMessage");
  if (!element) return;
  element.textContent = message;
  element.className = `notice notice-${type}`;
  element.hidden = !message;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function priorityBadge(prioridade) {
  return `<span class="status-badge status-prioridade-${escapeHtml(prioridade)}">${escapeHtml(PRIORIDADE_LABELS[prioridade] || prioridade)}</span>`;
}

function setActiveNavigation() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === currentPage);
  });
  document.querySelectorAll(".page-title").forEach((heading) => {
    heading.textContent = PAGE_TITLES[currentPage] || "ManutençãoJá";
  });
  // manutencaoja_admin é próprio da ManutençãoJá (ver db/manutencaoja_setup.sql)
  // — não usa professores.role nem salaja_admin, que têm outro significado
  // nas restantes apps da Comunidade CSJ.
  document.querySelectorAll("[data-admin-nav]").forEach((link) => {
    link.hidden = currentProfessor?.manutencaoja_admin !== true;
  });
}

async function loadEspacos() {
  const { data, error } = await window.supabase
    .from("salaja_espacos")
    .select("id,nome")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data || [];
}

async function getPedidos({ all = false, limit } = {}) {
  let query = window.supabase
    .from("manutencaoja_pedidos")
    .select("id,codigo,email_utilizador,categoria,titulo,descricao,prioridade,estado,nota_admin,created_at,espaco:salaja_espacos(nome)")
    .order("created_at", { ascending: false });
  if (!all) query = query.eq("user_id", currentUser.id);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function renderPedidoRows(pedidos, showActions = false) {
  if (!pedidos.length) {
    return '<div class="empty-state">Ainda não existem pedidos de manutenção.</div>';
  }
  return `<div class="reservation-list">${pedidos.map((pedido) => `
    <article class="reservation-row">
      <div class="reservation-main">
        <div class="reservation-heading">
          <h3>${escapeHtml(pedido.codigo)} — ${escapeHtml(pedido.espaco?.nome || "Espaço")}</h3>
          ${statusBadge(pedido.estado)}
          ${priorityBadge(pedido.prioridade)}
        </div>
        <p><strong>${escapeHtml(pedido.titulo)}</strong> · ${escapeHtml(CATEGORIA_LABELS[pedido.categoria] || pedido.categoria)}</p>
        <p>${escapeHtml(pedido.descricao)}</p>
        <p class="text-muted">Registado em ${escapeHtml(formatDate(pedido.created_at))}${showActions ? ` por ${escapeHtml(pedido.email_utilizador)}` : ""}</p>
        ${pedido.nota_admin ? `<p class="admin-note"><strong>Nota do Admin:</strong> ${escapeHtml(pedido.nota_admin)}</p>` : ""}
      </div>
      ${showActions && TRANSICOES[pedido.estado] ? `
        <div class="reservation-actions">
          ${TRANSICOES[pedido.estado].map((t) => `<button class="btn ${t.variant}" type="button" data-pedido="${escapeHtml(pedido.id)}" data-novo-estado="${t.estado}">${escapeHtml(t.label)}</button>`).join("")}
        </div>` : ""}
    </article>`).join("")}</div>`;
}

async function handleEstadoClick(event) {
  const button = event.target.closest("[data-pedido]");
  if (!button || button.disabled) return;
  const { pedido: pedidoId, novoEstado } = button.dataset;
  const note = novoEstado === "rejeitada"
    ? window.prompt("Nota para o requerente (opcional):")
    : null;
  if (novoEstado === "rejeitada" && note === null) return;
  button.disabled = true;
  try {
    const { error } = await window.supabase.rpc("manutencaoja_mudar_estado", {
      p_pedido_id: pedidoId,
      p_novo_estado: novoEstado,
      p_nota: note?.trim() || null,
    });
    if (error) throw error;
    showMessage("Estado do pedido atualizado.", "success");
    if (currentPage === "admin") await renderAdminPage();
    else await renderDashboardPage();
  } catch (error) {
    showMessage(error.message || "Não foi possível atualizar o pedido.");
    button.disabled = false;
  }
}

async function renderDashboardPage() {
  const isAdmin = currentProfessor?.manutencaoja_admin === true;
  const pedidos = await getPedidos({ all: isAdmin });
  const counts = {
    pendente: pedidos.filter((item) => item.estado === "pendente").length,
    em_execucao: pedidos.filter((item) => item.estado === "em_execucao").length,
    concluida: pedidos.filter((item) => item.estado === "concluida").length,
    fechada: pedidos.filter((item) => item.estado === "fechada").length,
  };
  const stats = document.getElementById("dashboardStats");
  stats.innerHTML = Object.entries(counts).map(([status, count]) => `
    <article class="stat-card">
      <span>${escapeHtml(STATUS_LABELS[status])}</span>
      <strong>${count}</strong>
    </article>`).join("");
  const list = document.getElementById("dashboardPedidos");
  const recentes = pedidos
    .filter((item) => item.estado !== "fechada" && item.estado !== "rejeitada")
    .slice(0, 5);
  list.innerHTML = renderPedidoRows(recentes, isAdmin);
  if (isAdmin) list.onclick = handleEstadoClick;
}

async function renderMeusPedidosPage() {
  const list = document.getElementById("pedidosList");
  list.innerHTML = '<p class="text-muted">A carregar pedidos…</p>';
  const pedidos = await getPedidos();
  list.innerHTML = renderPedidoRows(pedidos);
}

async function renderAdminPage() {
  const list = document.getElementById("adminPedidos");
  list.innerHTML = '<p class="text-muted">A carregar pedidos…</p>';
  const pedidos = await getPedidos({ all: true });
  const porTratar = pedidos.filter((item) => item.estado !== "fechada" && item.estado !== "rejeitada");
  const historico = pedidos.filter((item) => item.estado === "fechada" || item.estado === "rejeitada");
  document.getElementById("adminPendingCount").textContent = String(
    pedidos.filter((item) => item.estado === "pendente").length,
  );
  list.innerHTML = [
    '<h2>Por tratar</h2>',
    renderPedidoRows(porTratar, true),
    '<h2 class="mt-4">Fechados / recusados</h2>',
    renderPedidoRows(historico, true),
  ].join("");
  list.onclick = handleEstadoClick;
}

async function renderPedidoFormPage() {
  const espacos = await loadEspacos();
  const select = document.getElementById("espacoId");
  select.innerHTML = '<option value="">Selecionar espaço</option>' +
    espacos.map((espaco) => `<option value="${escapeHtml(espaco.id)}">${escapeHtml(espaco.nome)}</option>`).join("");

  const categoriaSelect = document.getElementById("categoria");
  categoriaSelect.innerHTML = Object.entries(CATEGORIA_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");

  document.getElementById("pedidoForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const payload = {
      user_id: currentUser.id,
      email_utilizador: currentUser.email.toLowerCase(),
      espaco_id: select.value,
      categoria: categoriaSelect.value,
      titulo: document.getElementById("titulo").value.trim(),
      descricao: document.getElementById("descricao").value.trim(),
      prioridade: document.getElementById("prioridade").value,
    };
    submit.disabled = true;
    submit.textContent = "A enviar…";
    try {
      const { error } = await window.supabase.from("manutencaoja_pedidos").insert(payload);
      if (error) throw error;
      window.location.href = "meus-pedidos.html?enviado=1";
    } catch (error) {
      showMessage(error.message || "Não foi possível enviar o pedido.");
      submit.disabled = false;
      submit.textContent = "Enviar pedido";
    }
  });
}

function setupSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const close = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
  };
  document.getElementById("openSidebar")?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("open");
  });
  document.getElementById("closeSidebar")?.addEventListener("click", close);
  overlay?.addEventListener("click", close);
  document.querySelectorAll("[data-signout]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await signOut();
    });
  });
}

async function initializeApp() {
  currentPage = document.body.dataset.page;
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("ManutençãoJá service worker registration failed", error);
    });
  }
  if (window.supabaseReady) await window.supabaseReady;
  if (!window.supabase || typeof getCurrentSession !== "function") {
    throw new Error("Não foi possível iniciar a ligação segura ao Supabase.");
  }
  const session = await getCurrentSession();
  if (!session) {
    const returnPage = {
      dashboard: "dashboard.html",
      pedido: "pedido.html",
      "meus-pedidos": "meus-pedidos.html",
      admin: "admin.html",
    }[currentPage] || "dashboard.html";
    window.location.replace(`login.html?returnTo=${encodeURIComponent(returnPage)}`);
    return;
  }
  currentUser = session.user;
  currentProfessor = await getCurrentProfessor();
  if (!currentProfessor) {
    throw new Error("Não foi possível carregar o perfil. Confirme se a sua conta está registada na escola.");
  }
  if (currentProfessor.deve_mudar_password) {
    window.location.replace("https://antoniorappleton.github.io/direcao-turma/mudar-password.html");
    return;
  }
  if (currentPage === "admin" && currentProfessor.manutencaoja_admin !== true) {
    window.location.replace("dashboard.html?semPermissao=1");
    return;
  }

  setActiveNavigation();
  setupSidebar();
  if (new URLSearchParams(window.location.search).has("enviado")) {
    showMessage("Pedido enviado para validação do Admin.", "success");
  } else if (new URLSearchParams(window.location.search).has("semPermissao")) {
    showMessage("Só um Admin pode gerir pedidos.");
  }

  if (currentPage === "dashboard") await renderDashboardPage();
  if (currentPage === "pedido") await renderPedidoFormPage();
  if (currentPage === "meus-pedidos") await renderMeusPedidosPage();
  if (currentPage === "admin") await renderAdminPage();
  window.lucide?.createIcons();
}

document.addEventListener("DOMContentLoaded", () => {
  initializeApp().catch((error) => {
    console.error("ManutençãoJá initialization failed", error);
    showMessage(error.message || "Erro ao iniciar a ManutençãoJá.");
  });
});
