import * as XLSX from "xlsx";
const wb = XLSX.readFile("C:/Users/ASUS/Downloads/דוח צלמים 07.07 קרינה (1).xlsx");
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false });
  console.log(`\n[${name}] rows=${rows.length}`);
  for (let i = 0; i < Math.min(2, rows.length); i++) console.log(`  r${i}:`, JSON.stringify(rows[i]));
}
