// Minimal real PDF files keep parsing/rendering tests independent of external services.
export function pdfFixture(pages: (string | null)[], encrypted = false): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (const text of pages) {
    const streamId = objects.length + 2
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
    )
    const stream =
      text === null
        ? 'q 400 0 0 400 50 300 cm BI /W 2 /H 2 /CS /RGB /BPC 8 /F /AHx ID FF000000FF000000FFFFFFFF> EI Q'
        : `BT /F1 14 Tf 40 760 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  }
  if (encrypted)
    objects.push(
      '<< /Filter /Standard /V 1 /R 2 /O <' + '00'.repeat(32) + '> /U <' + '00'.repeat(32) + '> /P -4 >>',
    )
  let result = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result))
    result += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(result)
  result += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  result += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  result += `trailer\n<< /Size ${offsets.length} /Root 1 0 R ${encrypted ? `/Encrypt ${objects.length} 0 R /ID [<01020304><01020304>]` : ''} >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(result)
}
