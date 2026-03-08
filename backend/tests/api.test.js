import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

let proc;
const base = 'http://localhost:3001';
const testDb = '/tmp/senai-test.db';

before(async () => {
  try { fs.unlinkSync(testDb); } catch {}

  proc = spawn('node', ['backend/src/server.js'], {
    stdio: 'ignore',
    env: { ...process.env, DB_FILE: testDb }
  });

  await new Promise((r) => setTimeout(r, 800));
});

after(() => {
  proc.kill('SIGTERM');
  try { fs.unlinkSync(testDb); } catch {}
});

test('GET /machines', async () => {
  const res = await fetch(`${base}/machines`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json));
  assert.ok(json.length > 0);
});

test('POST /machines and GET /machines/:id', async () => {
  const createdRes = await fetch(`${base}/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Fresa E5', sector: 'Usinagem', status: 'operational' })
  });
  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();

  const getRes = await fetch(`${base}/machines/${created.id}`);
  assert.equal(getRes.status, 200);
  const found = await getRes.json();
  assert.equal(found.name, 'Fresa E5');
});

test('PUT /machines/:id atualiza campos da máquina', async () => {
  const machines = await (await fetch(`${base}/machines`)).json();
  const machine = machines[0];
  const res = await fetch(`${base}/machines/${machine.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'offline' })
  });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, 'offline');
});

test('DELETE /machines/:id remove máquina sem ordens ativas', async () => {
  const createdRes = await fetch(`${base}/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Máquina Temporária', sector: 'Teste', status: 'offline' })
  });
  const created = await createdRes.json();

  const delRes = await fetch(`${base}/machines/${created.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 204);

  const getRes = await fetch(`${base}/machines/${created.id}`);
  assert.equal(getRes.status, 404);
});

test('DELETE /machines/:id bloqueado quando há ordens ativas', async () => {
  const machine = await (await fetch(`${base}/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Máquina Bloqueada', sector: 'Teste', status: 'operational' })
  })).json();

  await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: machine.id, description: 'Ordem ativa' })
  });

  const delRes = await fetch(`${base}/machines/${machine.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 409);
});

test('ordem criada com prioridade', async () => {
  const machines = await (await fetch(`${base}/machines`)).json();
  const res = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: machines[0].id, description: 'Teste prioridade', priority: 'critical' })
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.priority, 'critical');
});

test('criação de ordem muda status da máquina para manutenção', async () => {
  const machine = await (await fetch(`${base}/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Máquina Sincronismo', sector: 'Teste', status: 'operational' })
  })).json();

  await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: machine.id, description: 'Inspecionar rolamento', priority: 'high' })
  });

  const updated = await (await fetch(`${base}/machines/${machine.id}`)).json();
  assert.equal(updated.status, 'maintenance');
});

test('orders lifecycle', async () => {
  const machines = await (await fetch(`${base}/machines`)).json();
  const machineId = machines[0].id;

  const createOrder = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machine_id: machineId, description: 'Teste de vibração' })
  });
  assert.equal(createOrder.status, 201);
  const order = await createOrder.json();

  const update = await fetch(`${base}/orders/${order.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(update.status, 200);

  const del = await fetch(`${base}/orders/${order.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

test('GET /reports/summary retorna contagens por status', async () => {
  const res = await fetch(`${base}/reports/summary`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.machines));
  assert.ok(Array.isArray(body.orders));
});

