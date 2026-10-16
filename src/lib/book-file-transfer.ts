/**
 * Book catalog file interchange, designed to run in the admin's browser.
 * CSV, Excel 2003 XML (.xls), and Word-compatible HTML tables (.doc)
 * require no remote converters or new dependencies.
 */
import { supabase } from "@/integrations/supabase/client";
import { bookSchema, createBook, type BookFormValues } from "@/lib/inventory";

export const COLUMNS = [
  "title", "author", "isbn", "barcode", "description", "category",
  "purchase_cost", "selling_price", "quantity", "minimum_stock_level",
  "shelf_location", "status"
] as const;
export type CatalogRow = Record<(typeof COLUMNS)[number], string>;

const escHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escXml = (value: string) => escHtml(value).replace(/'/g, "&apos;");
const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");
const LIMIT = 500;

function csvCell(value: string) {
  // Prevent Excel/Sheets from executing cell formulas when opening a CSV.
  const safe = /^[\s]*[=+@\t\r]/.test(value) || /^[\s]*-[^0-9]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function csvRows(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); if (row.some((v) => v.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted cell.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function excelXmlRows(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid Excel XML document.");
  const sheets = Array.from(doc.getElementsByTagName("*")).filter((e) => e.localName === "Worksheet");
  if (!sheets.length) throw new Error("Expected an Excel XML worksheet. Modern .xlsx files need to be saved as CSV first.");
  const sheet = sheets[0];
  const rows = Array.from(sheet.getElementsByTagName("*")).filter((e) => e.localName === "Row");
  return rows.map((r) => {
    const cells = Array.from(r.children).filter((e) => e.localName === "Cell");
    const fields: string[] = [];
    cells.forEach((cell) => {
      const index = Array.from(cell.attributes).find((a) => a.localName === "Index");
      const position = index ? Number(index.value) - 1 : fields.length;
      if (position < 0 || position > 100) throw new Error("Invalid Excel column index.");
      while (fields.length < position) fields.push("");
      const data = Array.from(cell.children).find((e) => e.localName === "Data");
      fields[position] = data?.textContent ?? "";
    });
    return fields;
  }).filter((r) => r.some((s) => s.trim()));
}
function wordRows(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) throw new Error("The Word document must contain a table with catalog headers.");
  return Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).filter((cell) => /^(TD|TH)$/.test(cell.tagName))
      .map((cell) => cell.textContent?.trim() ?? "")
  ).filter((r) => r.some((s) => s.trim()));
}
function matrixToCatalog(matrix: string[][]): CatalogRow[] {
  if (matrix.length < 2) throw new Error("The file must contain a header row and at least one book.");
  const header = matrix[0].map(normalize);
  const missing = ["title", "author", "selling_price"].filter((key) => !header.includes(normalize(key)));
  if (missing.length) throw new Error("Missing required columns: " + missing.join(", "));
  if (matrix.length - 1 > LIMIT) throw new Error("Import up to " + LIMIT + " books at a time.");
  return matrix.slice(1).map((values) => {
    const row = {} as CatalogRow;
    for (const key of COLUMNS) {
      const col = header.indexOf(normalize(key));
      row[key] = col >= 0 ? (values[col] ?? "").trim() : "";
    }
    return row;
  });
}
export async function readCatalogFile(file: File): Promise<CatalogRow[]> {
  if (file.size > 3 * 1024 * 1024) throw new Error("Choose a file smaller than 3 MB.");
  const name = file.name.toLowerCase();
  const text = await file.text();
  if (name.endsWith(".csv")) return matrixToCatalog(parseCsv(text));
  if (name.endsWith(".xls") || name.endsWith(".xml")) return matrixToCatalog(excelXmlRows(text));
  if (name.endsWith(".doc") || name.endsWith(".html") || name.endsWith(".htm")) return matrixToCatalog(wordRows(text));
  if (name.endsWith(".xlsx") || name.endsWith(".docx"))
    throw new Error("For .xlsx or .docx, use Save As → CSV (Excel) or HTML/Web Page (Word), then import that file.");
  throw new Error("Supported imports: CSV, Excel XML (.xls/.xml), and Word HTML (.doc/.html).");
}
export async function loadCatalogExport(): Promise<CatalogRow[]> {
  const result: CatalogRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("books")
      .select("title,author,isbn,barcode,description,purchase_cost,selling_price,status,category_id,inventory(quantity,minimum_stock_level,shelf_location),categories(name)")
      .order("title").range(offset, offset + 499);
    if (error) throw error;
    for (const book of data ?? []) {
      const inv = Array.isArray(book.inventory) ? book.inventory[0] : book.inventory;
      const cat = Array.isArray(book.categories) ? book.categories[0] : book.categories;
      result.push({
        title: book.title ?? "", author: book.author ?? "",
        isbn: book.isbn ?? "", barcode: book.barcode ?? "",
        description: book.description ?? "", category: cat?.name ?? "",
        purchase_cost: String(book.purchase_cost ?? 0),
        selling_price: String(book.selling_price ?? 0),
        quantity: String(inv?.quantity ?? 0),
        minimum_stock_level: String(inv?.minimum_stock_level ?? 0),
        shelf_location: inv?.shelf_location ?? "",
        status: book.status ?? "active",
      });
    }
    if ((data ?? []).length < 500) break;
    if (offset > 100000) throw new Error("Catalog export is too large.");
  }
  return result;
}
export function downloadCatalog(rows: CatalogRow[], format: "csv" | "excel" | "word") {
  const matrix = [Array.from(COLUMNS), ...rows.map((r) => COLUMNS.map((key) => r[key] ?? ""))];
  let content: string, mime: string, ext: string;
  if (format === "csv") {
    content = "\uFEFF" + csvRows(matrix); mime = "text/csv;charset=utf-8"; ext = "csv";
  } else if (format === "excel") {
    const xmlRows = matrix.map((row) => "<Row>" + row.map((value) => "<Cell><Data ss:Type=\"String\">" + escXml(value) + "</Data></Cell>").join("") + "</Row>").join("\n");
    content = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Books"><Table>' + xmlRows + "</Table></Worksheet></Workbook>";
    mime = "application/vnd.ms-excel"; ext = "xls";
  } else {
    const htmlRows = matrix.map((row, index) => "<tr>" + row.map((value) => (index === 0 ? "<th>" : "<td>") + escHtml(value) + (index === 0 ? "</th>" : "</td>")).join("") + "</tr>").join("");
    content = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mindthrills Books</title></head><body><h1>Mindthrills Resources — Books</h1><table border="1" cellpadding="6" cellspacing="0">' + htmlRows + "</table></body></html>";
    mime = "application/msword"; ext = "doc";
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url; link.download = "mindthrills-books-" + new Date().toISOString().slice(0, 10) + "." + ext;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function nonNegativeNumber(text: string, field: string, fallback: number) {
  if (!text) return fallback;
  const n = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(field + " must be a non-negative number.");
  return n;
}
export function validateCatalog(rows: CatalogRow[], categories: { id: string; name: string }[]) {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    try {
      const category = row.category ? categories.find((c) => normalize(c.name) === normalize(row.category)) : null;
      if (row.category && !category) throw new Error("Unknown category: " + row.category);
      const key = row.isbn ? "isbn:" + normalize(row.isbn) : "book:" + normalize(row.title + "|" + row.author);
      if (seen.has(key)) throw new Error("Duplicate book in file.");
      seen.add(key);
      const values: BookFormValues = bookSchema.parse({
        title: row.title,
        author: row.author,
        isbn: row.isbn, barcode: row.barcode,
        category_id: category?.id ?? "", supplier_id: "",
        purchase_cost: nonNegativeNumber(row.purchase_cost, "Purchase cost", 0),
        selling_price: nonNegativeNumber(row.selling_price, "Selling price", 0),
        quantity: nonNegativeNumber(row.quantity, "Quantity", 0),
        minimum_stock_level: nonNegativeNumber(row.minimum_stock_level, "Minimum stock", 0),
        shelf_location: row.shelf_location,
        status: row.status || "active",
        cover_url: "", rentable: false, rental_category: null, rental_fee: null, one_at_a_time: false,
      });
      return { index: index + 2, row, values };
    } catch (error) {
      return { index: index + 2, row, error: error instanceof Error ? error.message : "Invalid row" };
    }
  });
}
export async function importCatalog(rows: CatalogRow[], categories: { id: string; name: string }[], onProgress: (done: number, total: number) => void) {
  const prepared = validateCatalog(rows, categories);
  const invalid = prepared.filter((item) => item.error);
  if (invalid.length) throw new Error("Fix invalid rows before importing.");
  // Never silently overwrite existing books or stock.
  const existing = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("books").select("title,author,isbn").range(offset, offset + 499);
    if (error) throw error;
    for (const book of data ?? []) {
      if (book.isbn) existing.add("isbn:" + normalize(book.isbn));
      existing.add("book:" + normalize((book.title ?? "") + "|" + (book.author ?? "")));
    }
    if ((data ?? []).length < 500) break;
  }
  let created = 0, skipped = 0;
  const failures: string[] = [];
  for (const item of prepared) {
    const values = item.values!;
    const isbnKey = values.isbn ? "isbn:" + normalize(values.isbn) : "";
    const nameKey = "book:" + normalize(values.title + "|" + values.author);
    if ((isbnKey && existing.has(isbnKey)) || existing.has(nameKey)) skipped++;
    else {
      try {
        const id = await createBook(values);
        if (item.row.description) {
          const { error: descriptionError } = await supabase.from("books")
            .update({ description: item.row.description }).eq("id", id);
          if (descriptionError) throw new Error("Book created, but description could not be saved: " + descriptionError.message);
        }
        created++;
        existing.add(nameKey); if (isbnKey) existing.add(isbnKey);
      } catch (error) {
        failures.push("Row " + item.index + ": " + (error instanceof Error ? error.message : String(error)));
      }
    }
    onProgress(created + skipped + failures.length, prepared.length);
  }
  return { created, skipped, failures };
}
