import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { toCsv, toXlsx } from '../src/lib/exports.js';

const columns = [
  { key: 'name', header: 'Name', value: (row) => row.name },
  { key: 'note', header: 'Note', value: (row) => row.note },
  { key: 'count', header: 'Count', value: (row) => row.count },
];

test('U12: CSV quotes commas, quotes and newlines (RFC 4180)', () => {
  const csv = toCsv(columns, [
    { name: 'Obi, Ada', note: 'said "present"', count: 3 },
    { name: 'Plain', note: 'line1\nline2', count: 0 },
  ]);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'Name,Note,Count');
  assert.equal(lines[1], '"Obi, Ada","said ""present""",3');
  assert.equal(lines[2], 'Plain,"line1\nline2",0');
});

test('U13: an empty export still contains the header row', () => {
  const csv = toCsv(columns, []);
  assert.equal(csv, 'Name,Note,Count\r\n');
});

test('U19: XLSX export writes a real workbook with a header row', async () => {
  const buffer = await toXlsx(columns, [{ name: 'Ada Obi', note: null, count: 1 }]);
  assert.ok(buffer.length > 1000);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Attendance');
  assert.equal(sheet.getRow(1).getCell(1).value, 'Name');
  assert.equal(sheet.getRow(2).getCell(1).value, 'Ada Obi');
  assert.equal(sheet.getRow(2).getCell(2).value, '');
});

test('U20: booleans render as Yes/No in exports', () => {
  const csv = toCsv(
    [{ key: 'ok', header: 'Location ok', value: (row) => row.ok }],
    [{ ok: true }, { ok: false }],
  );
  assert.equal(csv.trimEnd().split('\r\n')[1], 'Yes');
  assert.equal(csv.trimEnd().split('\r\n')[2], 'No');
});
