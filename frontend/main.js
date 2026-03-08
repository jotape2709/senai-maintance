const API = 'http://localhost:3001';
const content = document.getElementById('content');
const nav = document.getElementById('nav');

const statusLabels = { operational: 'Operacional', maintenance: 'Manutenção', offline: 'Parada' };
const orderLabels = { open: 'Aberta', in_progress: 'Em progresso', completed: 'Concluída' };
const priorityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };

const badge = (value, label) => `<span class="status ${value}">${label}</span>`;
const priorityBadge = (value) => `<span class="priority ${value}">${priorityLabels[value] || value}</span>`;

async function api(path, options) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Erro');
  if (res.status === 204) return null;
  return res.json();
}

async function dashboard() {
  const [machines, orders] = await Promise.all([api('/machines'), api('/orders')]);
  const byStatus = machines.reduce((acc, m) => { acc[m.status] = (acc[m.status] || 0) + 1; return acc; }, {});
  content.innerHTML = `
    <h2>Dashboard</h2>
    <div class="kpis">
      <div class="kpi"><p>Total de máquinas</p><strong>${machines.length}</strong></div>
      <div class="kpi"><p>Ordens abertas</p><strong>${orders.filter(o => o.status === 'open').length}</strong></div>
      <div class="kpi"><p>Em progresso</p><strong>${orders.filter(o => o.status === 'in_progress').length}</strong></div>
      <div class="kpi"><p>Concluídas</p><strong>${orders.filter(o => o.status === 'completed').length}</strong></div>
    </div>
    <h3>Status das máquinas</h3>
    <div class="kpis">
      <div class="kpi"><p>Operacionais</p><strong class="text-green">${byStatus.operational || 0}</strong></div>
      <div class="kpi"><p>Em manutenção</p><strong class="text-orange">${byStatus.maintenance || 0}</strong></div>
      <div class="kpi"><p>Paradas</p><strong class="text-red">${byStatus.offline || 0}</strong></div>
    </div>`;
}

async function machinesPage() {
  const machines = await api('/machines');
  content.innerHTML = `
    <div class="page-header">
      <h2>Lista de máquinas</h2>
      <button class="primary" id="toggle-form">+ Cadastrar máquina</button>
    </div>
    <div id="machine-form-wrap" class="form-wrap" style="display:none">
      <form id="machine-form">
        <div class="form-row">
          <label>Nome<input name="name" required placeholder="Ex: Prensa A2" /></label>
          <label>Setor<input name="sector" required placeholder="Ex: Estamparia" /></label>
          <label>Status
            <select name="status">
              <option value="operational">Operacional</option>
              <option value="maintenance">Manutenção</option>
              <option value="offline">Parada</option>
            </select>
          </label>
        </div>
        <button class="primary" type="submit" style="margin-top:8px">Cadastrar</button>
        <p id="machine-feedback"></p>
      </form>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Setor</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>
        ${machines.map(m => `<tr>
          <td>${m.name}</td>
          <td>${m.sector}</td>
          <td>
            <select class="status-select" data-machineid="${m.id}">
              <option value="operational" ${m.status === 'operational' ? 'selected' : ''}>Operacional</option>
              <option value="maintenance" ${m.status === 'maintenance' ? 'selected' : ''}>Manutenção</option>
              <option value="offline" ${m.status === 'offline' ? 'selected' : ''}>Parada</option>
            </select>
          </td>
          <td><button class="danger" data-delmachine="${m.id}">Excluir</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

  document.getElementById('toggle-form').addEventListener('click', () => {
    const wrap = document.getElementById('machine-form-wrap');
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('machine-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fb = document.getElementById('machine-feedback');
    try {
      await api('/machines', {
        method: 'POST',
        body: JSON.stringify({ name: fd.get('name'), sector: fd.get('sector'), status: fd.get('status') })
      });
      fb.style.color = '#198754';
      fb.textContent = 'Máquina cadastrada com sucesso!';
      e.target.reset();
      setTimeout(() => machinesPage(), 900);
    } catch (err) {
      fb.style.color = '#dc2626';
      fb.textContent = `Erro: ${err.message}`;
    }
  });

  content.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/machines/${sel.dataset.machineid}`, {
          method: 'PUT',
          body: JSON.stringify({ status: sel.value })
        });
      } catch (err) {
        alert(`Erro ao atualizar: ${err.message}`);
        machinesPage();
      }
    });
  });

  content.querySelectorAll('[data-delmachine]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta máquina? Esta ação não pode ser desfeita.')) return;
      try {
        await api(`/machines/${btn.dataset.delmachine}`, { method: 'DELETE' });
        machinesPage();
      } catch (err) {
        alert(`Não foi possível excluir: ${err.message}`);
      }
    });
  });
}

async function newOrderPage() {
  const machines = await api('/machines');
  content.innerHTML = `<h2>Criar ordem de manutenção</h2>
    <form id="order-form">
      <label>Máquina
      <select name="machine_id" required><option value="">Selecione</option>${machines.map(m => `<option value="${m.id}">${m.name} — ${badge(m.status, statusLabels[m.status])}</option>`)}</select>
      </label>
      <label>Descrição<textarea name="description" required></textarea></label>
      <label>Prioridade
      <select name="priority">
        <option value="low">Baixa</option>
        <option value="medium" selected>Média</option>
        <option value="high">Alta</option>
        <option value="critical">Crítica</option>
      </select>
      </label>
      <label>Status
      <select name="status"><option value="open">Aberta</option><option value="in_progress">Em progresso</option><option value="completed">Concluída</option></select>
      </label>
      <button class="primary" type="submit">Salvar ordem</button>
      <p id="feedback"></p>
    </form>`;

  document.getElementById('order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fb = document.getElementById('feedback');
    try {
      await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          machine_id: Number(fd.get('machine_id')),
          description: fd.get('description'),
          priority: fd.get('priority'),
          status: fd.get('status')
        })
      });
      fb.style.color = '#198754';
      fb.textContent = 'Ordem criada com sucesso!';
      e.target.reset();
    } catch (err) {
      fb.style.color = '#dc2626';
      fb.textContent = `Erro: ${err.message}`;
    }
  });
}

async function historyPage(filter = 'all') {
  const orders = await api('/orders');
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const filters = [
    { key: 'all', label: 'Todas' },
    { key: 'open', label: 'Abertas' },
    { key: 'in_progress', label: 'Em progresso' },
    { key: 'completed', label: 'Concluídas' }
  ];
  content.innerHTML = `
    <h2>Histórico de manutenção</h2>
    <div class="filter-bar">
      ${filters.map(f => `<button class="filter-btn${f.key === filter ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Máquina</th><th>Descrição</th><th>Prioridade</th><th>Status</th><th>Criado em</th><th>Ações</th></tr></thead>
      <tbody>
        ${filtered.map(o => `<tr>
          <td>${o.machine_name}</td>
          <td>${o.description}</td>
          <td>${priorityBadge(o.priority)}</td>
          <td>${badge(o.status, orderLabels[o.status])}</td>
          <td>${new Date(o.created_at).toLocaleString('pt-BR')}</td>
          <td><div class="actions">
            ${o.status !== 'completed' ? `<button class="primary" data-next="${o.id}|${o.status}">Avançar</button>` : ''}
            <button class="danger" data-del="${o.id}">Excluir</button>
          </div></td>
        </tr>`).join('')}
        ${filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#6b7280">Nenhuma ordem encontrada.</td></tr>' : ''}
      </tbody>
    </table></div>`;

  content.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => historyPage(btn.dataset.filter));
  });

  content.querySelectorAll('[data-next]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [id, status] = btn.dataset.next.split('|');
      const next = { open: 'in_progress', in_progress: 'completed', completed: 'completed' }[status];
      await api(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: next }) });
      historyPage(filter);
    });
  });

  content.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta ordem de manutenção?')) return;
      await api(`/orders/${btn.dataset.del}`, { method: 'DELETE' });
      historyPage(filter);
    });
  });
}

const pages = { dashboard, machines: machinesPage, 'new-order': newOrderPage, history: historyPage };

function setActive(page) {
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
}

async function render(page) {
  setActive(page);
  try {
    await pages[page]();
  } catch (err) {
    content.innerHTML = `<div class="error-card">
      <p class="error-msg">⚠ ${err.message || 'Ocorreu um erro inesperado.'}</p>
      <p style="color:#6b7280">Verifique se o servidor está em execução em <code>http://localhost:3001</code>.</p>
      <button class="primary" id="retry-btn">Tentar novamente</button>
    </div>`;
    document.getElementById('retry-btn').addEventListener('click', () => render(page));
  }
}

nav.addEventListener('click', (e) => {
  if (e.target.matches('button[data-page]')) render(e.target.dataset.page);
});

render('dashboard');
