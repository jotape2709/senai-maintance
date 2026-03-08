import http from 'node:http';
import { initDb, query, escapeValue, orderWithMachineQuery } from './db.js';

initDb();

const PORT = Number(process.env.PORT || 3001);

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') return json(res, 204, null);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });

  // ── Machines ──────────────────────────────────────────────────────────────

  if (req.method === 'GET' && url.pathname === '/machines') {
    return json(res, 200, query('SELECT * FROM machines ORDER BY id DESC;'));
  }

  if (req.method === 'GET' && /^\/machines\/\d+$/.test(url.pathname)) {
    const id = url.pathname.split('/')[2];
    const row = query(`SELECT * FROM machines WHERE id = ${Number(id)};`)[0];
    return row ? json(res, 200, row) : json(res, 404, { message: 'Machine not found' });
  }

  if (req.method === 'POST' && url.pathname === '/machines') {
    const body = await parseBody(req);
    if (!body.name || !body.sector || !body.status) return json(res, 400, { message: 'name, sector and status are required' });
    if (!['operational', 'maintenance', 'offline'].includes(body.status)) return json(res, 400, { message: 'Invalid status' });
    query(`INSERT INTO machines (name, sector, status) VALUES ('${escapeValue(body.name)}', '${escapeValue(body.sector)}', '${body.status}');`);
    const created = query('SELECT * FROM machines ORDER BY id DESC LIMIT 1;')[0];
    return json(res, 201, created);
  }

  if (req.method === 'PUT' && /^\/machines\/\d+$/.test(url.pathname)) {
    const id = Number(url.pathname.split('/')[2]);
    const body = await parseBody(req);
    const existing = query(`SELECT * FROM machines WHERE id = ${id};`)[0];
    if (!existing) return json(res, 404, { message: 'Machine not found' });
    const name = escapeValue(body.name || existing.name);
    const sector = escapeValue(body.sector || existing.sector);
    const status = body.status || existing.status;
    if (!['operational', 'maintenance', 'offline'].includes(status)) return json(res, 400, { message: 'Invalid status' });
    query(`UPDATE machines SET name='${name}', sector='${sector}', status='${status}' WHERE id=${id};`);
    return json(res, 200, query(`SELECT * FROM machines WHERE id=${id};`)[0]);
  }

  if (req.method === 'DELETE' && /^\/machines\/\d+$/.test(url.pathname)) {
    const id = Number(url.pathname.split('/')[2]);
    const exists = query(`SELECT id FROM machines WHERE id = ${id};`)[0];
    if (!exists) return json(res, 404, { message: 'Machine not found' });
    const activeOrders = query(`SELECT id FROM maintenance_orders WHERE machine_id = ${id} AND status IN ('open','in_progress');`);
    if (activeOrders.length > 0) return json(res, 409, { message: 'Máquina possui ordens ativas. Conclua ou exclua as ordens primeiro.' });
    query(`DELETE FROM machines WHERE id = ${id};`);
    return json(res, 204, null);
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  if (req.method === 'GET' && url.pathname === '/orders') {
    return json(res, 200, query(`SELECT mo.*, m.name as machine_name
      FROM maintenance_orders mo
      JOIN machines m ON m.id = mo.machine_id
      ORDER BY mo.created_at DESC;`));
  }

  if (req.method === 'POST' && url.pathname === '/orders') {
    const body = await parseBody(req);
    const status = body.status || 'open';
    const priority = body.priority || 'medium';
    if (!body.machine_id || !body.description) return json(res, 400, { message: 'machine_id and description are required' });
    if (!['open', 'in_progress', 'completed'].includes(status)) return json(res, 400, { message: 'Invalid order status' });
    if (!['low', 'medium', 'high', 'critical'].includes(priority)) return json(res, 400, { message: 'Invalid priority' });
    const machine = query(`SELECT * FROM machines WHERE id = ${Number(body.machine_id)};`)[0];
    if (!machine) return json(res, 404, { message: 'Machine not found' });
    query(`INSERT INTO maintenance_orders (machine_id, description, status, priority) VALUES (${Number(body.machine_id)}, '${escapeValue(body.description)}', '${status}', '${priority}');`);
    // Auto-set machine to 'maintenance' when a new active order is created
    if (machine.status === 'operational' && status !== 'completed') {
      query(`UPDATE machines SET status='maintenance' WHERE id=${Number(body.machine_id)};`);
    }
    return json(res, 201, query('SELECT * FROM maintenance_orders ORDER BY id DESC LIMIT 1;')[0]);
  }

  if (req.method === 'PUT' && /^\/orders\/\d+\/status$/.test(url.pathname)) {
    const id = Number(url.pathname.split('/')[2]);
    const body = await parseBody(req);
    if (!['open', 'in_progress', 'completed'].includes(body.status)) return json(res, 400, { message: 'Invalid order status' });
    const order = query(`SELECT * FROM maintenance_orders WHERE id = ${id};`)[0];
    if (!order) return json(res, 404, { message: 'Order not found' });
    query(`UPDATE maintenance_orders SET status = '${body.status}' WHERE id = ${id};`);
    if (body.status === 'completed') {
      // Restore machine to 'operational' when its last active order is completed
      const activeOrders = query(`SELECT id FROM maintenance_orders WHERE machine_id = ${order.machine_id} AND status IN ('open','in_progress') AND id != ${id};`);
      if (activeOrders.length === 0) {
        query(`UPDATE machines SET status='operational' WHERE id=${order.machine_id} AND status='maintenance';`);
      }
    } else {
      // Reopening or advancing to in_progress – ensure machine reflects active work
      query(`UPDATE machines SET status='maintenance' WHERE id=${order.machine_id} AND status='operational';`);
    }
    const updated = query(`SELECT id, status FROM maintenance_orders WHERE id = ${id};`)[0];
    return updated ? json(res, 200, updated) : json(res, 404, { message: 'Order not found' });
  }

  if (req.method === 'DELETE' && /^\/orders\/\d+$/.test(url.pathname)) {
    const id = Number(url.pathname.split('/')[2]);
    const exists = query(`SELECT id FROM maintenance_orders WHERE id = ${id};`)[0];
    if (!exists) return json(res, 404, { message: 'Order not found' });
    query(`DELETE FROM maintenance_orders WHERE id = ${id};`);
    return json(res, 204, null);
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  if (req.method === 'GET' && url.pathname === '/reports/orders-machines') {
    return json(res, 200, query(orderWithMachineQuery));
  }

  if (req.method === 'GET' && url.pathname === '/reports/summary') {
    const machines = query('SELECT status, COUNT(*) as count FROM machines GROUP BY status;');
    const orders = query('SELECT status, COUNT(*) as count FROM maintenance_orders GROUP BY status;');
    return json(res, 200, { machines, orders });
  }

  return json(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

export { server };
