// ═══════════════════════════════════════════════════════════
//  MiniUnzip — ZIP decompression via DecompressionStream API
// ═══════════════════════════════════════════════════════════

function inflate(data) {
  return new Promise((resolve, reject) => {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      const chunks = [];
      reader.read().then(function process({ done, value }) {
        if (done) { resolve(concatUint8(chunks)); return; }
        chunks.push(value);
        reader.read().then(process);
      });
      writer.write(data);
      writer.close();
    } catch (e) { reject(e); }
  });
}

function concatUint8(arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function readUint16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function readUint32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }

export async function unzip(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const files = {};
  let pos = 0;
  while (pos + 30 <= buf.length) {
    const sig = readUint32(buf, pos);
    if (sig !== 0x04034b50) break;
    const method = readUint16(buf, pos + 8);
    const compSize = readUint32(buf, pos + 18);
    const nameLen = readUint16(buf, pos + 26);
    const extraLen = readUint16(buf, pos + 28);
    const name = new TextDecoder().decode(buf.slice(pos + 30, pos + 30 + nameLen));
    const dataStart = pos + 30 + nameLen + extraLen;
    const compData = buf.slice(dataStart, dataStart + compSize);
    if (method === 0) files[name] = compData;
    else if (method === 8) files[name] = await inflate(compData);
    pos = dataStart + compSize;
  }
  return files;
}
