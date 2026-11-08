import ExcelJS from 'exceljs';

const cellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

/** RFC 4180 CSV: quote when the value contains a comma, quote or newline. */
export function toCsv(columns, rows) {
  const escape = (value) => {
    const text = cellValue(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((column) => escape(column.header)).join(',')];
  for (const row of rows) lines.push(columns.map((column) => escape(column.value(row))).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export async function toXlsx(columns, rows, { sheetName = 'Attendance' } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CampusCheck';
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key || column.header,
    width: column.width || Math.max(12, Math.min(40, column.header.length + 6)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((column) => [column.key || column.header, cellValue(column.value(row))])));
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const ATTENDANCE_COLUMNS = [
  { key: 'date', header: 'Date', width: 12, value: (r) => r.date },
  { key: 'course_code', header: 'Course', width: 14, value: (r) => r.course_code },
  { key: 'course_title', header: 'Course title', width: 32, value: (r) => r.course_title },
  { key: 'department', header: 'Department', width: 24, value: (r) => r.department },
  { key: 'lecturer', header: 'Lecturer', width: 24, value: (r) => r.lecturer },
  { key: 'student', header: 'Student', width: 26, value: (r) => r.student },
  { key: 'matric_number', header: 'Matric no.', width: 18, value: (r) => r.matric_number },
  { key: 'status', header: 'Status', width: 10, value: (r) => r.status },
  { key: 'checked_in_at', header: 'Checked in', width: 20, value: (r) => r.checked_in_at },
  { key: 'check_in_method', header: 'Method', width: 10, value: (r) => r.check_in_method },
  { key: 'location_verified', header: 'Location ok', width: 12, value: (r) => r.location_verified },
  { key: 'location_distance_m', header: 'Distance (m)', width: 13, value: (r) => r.location_distance_m },
  { key: 'flag_reason', header: 'Flag', width: 16, value: (r) => r.flag_reason },
  { key: 'override_reason', header: 'Correction reason', width: 32, value: (r) => r.override_reason },
  { key: 'recorded_by', header: 'Recorded by', width: 22, value: (r) => r.recorded_by },
];
