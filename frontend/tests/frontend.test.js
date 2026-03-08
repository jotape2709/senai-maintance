import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('index possui navegação com páginas principais', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  assert.match(html, /data-page="dashboard"/);
  assert.match(html, /data-page="machines"/);
  assert.match(html, /data-page="new-order"/);
  assert.match(html, /data-page="history"/);
});

test('css possui media query de responsividade', () => {
  const css = fs.readFileSync('frontend/styles.css', 'utf8');
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.nav \{ grid-template-columns: repeat\(2, 1fr\); \}/);
});

test('css possui estilos de prioridade', () => {
  const css = fs.readFileSync('frontend/styles.css', 'utf8');
  assert.match(css, /\.priority/);
  assert.match(css, /\.priority\.critical/);
  assert.match(css, /\.priority\.high/);
});

test('css possui barra de filtros', () => {
  const css = fs.readFileSync('frontend/styles.css', 'utf8');
  assert.match(css, /\.filter-bar/);
  assert.match(css, /\.filter-btn/);
});

test('css possui estilos de page-header e form-row', () => {
  const css = fs.readFileSync('frontend/styles.css', 'utf8');
  assert.match(css, /\.page-header/);
  assert.match(css, /\.form-row/);
});
