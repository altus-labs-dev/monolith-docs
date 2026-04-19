const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = path.join(require('os').tmpdir(), 'docx-build');

// Clean and create structure
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, '_rels'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'word', '_rels'), { recursive: true });

fs.writeFileSync(path.join(tmp, '[Content_Types].xml'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

fs.writeFileSync(path.join(tmp, '_rels', '.rels'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

fs.writeFileSync(path.join(tmp, 'word', '_rels', 'document.xml.rels'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

fs.writeFileSync(path.join(tmp, 'word', 'document.xml'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello from Monolith Docs!</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Edit this template to get started. Try typing merge fields like {{account.name}} or {{invoice.total}}.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`);

const out = path.join(__dirname, 'sample.docx');
const zipOut = out + '.zip';

try { fs.unlinkSync(zipOut); } catch {}
try { fs.unlinkSync(out); } catch {}

const psScript = `Compress-Archive -Path '${tmp.replace(/'/g, "''")}\\*' -DestinationPath '${zipOut.replace(/'/g, "''")}' -Force`;
execFileSync('powershell', ['-Command', psScript], { stdio: 'inherit' });
fs.renameSync(zipOut, out);

console.log('Created:', out);
console.log('Size:', fs.statSync(out).size, 'bytes');
