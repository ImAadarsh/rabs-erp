/** Parse CSV text (RFC-style quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      if (c === '\r') i++;
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

export function csvRowsToObjects<T extends Record<string, string>>(
  rows: string[][]
): T[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: T[] = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {} as T;
    headers.forEach((h, j) => {
      (obj as Record<string, string>)[h] = rows[i][j]?.trim() ?? '';
    });
    out.push(obj);
  }
  return out;
}
