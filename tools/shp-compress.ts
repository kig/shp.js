#!/usr/bin/env node
// Node.js compressor utility (TypeScript). Run with `npx shp-compress <input> [output]`

import * as fs from 'fs';
import * as path from 'path';
import { SHPParser, type ShapefileData, ShapeType } from '../src/SHPParser.js';
import { compress, decompress } from '../src/SHPCompress.js';

function usage() {
  console.error('Usage: npx ts-node tools/shp-compress.ts <input.(shp|shpz)> [output]');
  process.exit(2);
}

if (process.argv.length < 3) {
  usage();
}

const input = process.argv[2];
let output = process.argv[3];

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function writeShp(shp: ShapefileData): ArrayBuffer {
  // Use the provided byteLength when available, otherwise compute an estimate
  const totalBytes = shp.byteLength || 100;
  const records = shp.records;

  // If byteLength wasn't provided, compute a size by summing record lengths
  let fileBytes = shp.byteLength || 100;
  if (!shp.byteLength) {
    for (const r of records) {
      fileBytes += 8 + (r.length * 2);
    }
  } else {
    fileBytes = shp.byteLength;
  }

  const buf = new ArrayBuffer(fileBytes);
  const dv = new DataView(buf);

  // Header
  dv.setInt32(0, shp.fileCode || 9994, false); // big-endian
  // bytes 4..23 are unused (set to 0)
  dv.setInt32(24, shp.wordLength || (fileBytes / 2), false); // file length in 16-bit words big-endian
  dv.setInt32(28, shp.version || 1000, true); // little-endian
  dv.setInt32(32, shp.shapeType || ShapeType.NULL, true);

  // bounding boxes
  dv.setFloat64(36, shp.minX || 0, true);
  dv.setFloat64(44, shp.minY || 0, true);
  dv.setFloat64(52, shp.maxX || 0, true);
  dv.setFloat64(60, shp.maxY || 0, true);
  dv.setFloat64(68, shp.minZ || 0, true);
  dv.setFloat64(76, shp.maxZ || 0, true);
  dv.setFloat64(84, shp.minM || 0, true);
  dv.setFloat64(92, shp.maxM || 0, true);

  let offset = 100;

  for (const record of records) {
    const shape = record.shape;
    // Record header: number and length (16-bit words), big-endian
    dv.setInt32(offset, record.number, false);
    dv.setInt32(offset + 4, record.length, false);
    offset += 8;

    // Content depends on type
    switch (shape.type) {
      case ShapeType.NULL:
        // nothing to write
        break;

      case ShapeType.POINT: {
        const content = shape.content as any;
        dv.setInt32(offset, ShapeType.POINT, true);
        dv.setFloat64(offset + 4, content.x, true);
        dv.setFloat64(offset + 12, content.y, true);
        offset += 4 + 16;
        break;
      }

      case ShapeType.POINTZ: {
        const content = shape.content as any;
        dv.setInt32(offset, ShapeType.POINTZ, true);
        dv.setFloat64(offset + 4, content.x, true);
        dv.setFloat64(offset + 12, content.y, true);
        dv.setFloat64(offset + 20, content.z ?? 0, true);
        dv.setFloat64(offset + 28, content.m ?? 0, true);
        offset += 4 + 32;
        break;
      }

      case ShapeType.POLYLINE:
      case ShapeType.POLYGON:
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYGONZ:
      case ShapeType.POLYLINEM:
      case ShapeType.POLYGONM: {
        const content = shape.content as any;
        dv.setInt32(offset, shape.type, true);
        dv.setFloat64(offset + 4, content.minX, true);
        dv.setFloat64(offset + 12, content.minY, true);
        dv.setFloat64(offset + 20, content.maxX, true);
        dv.setFloat64(offset + 28, content.maxY, true);
        dv.setInt32(offset + 36, content.parts.length, true);
        dv.setInt32(offset + 40, content.points.length / 2, true);
        offset += 44;

        // parts
        for (let i = 0; i < content.parts.length; i++) {
          dv.setInt32(offset, content.parts[i], true);
          offset += 4;
        }

        // points
        for (let i = 0; i < content.points.length; i++) {
          dv.setFloat64(offset, content.points[i], true);
          offset += 8;
        }

        // Z
        if (content.z) {
          dv.setFloat64(offset, content.minZ ?? 0, true);
          dv.setFloat64(offset + 8, content.maxZ ?? 0, true);
          offset += 16;
          for (let i = 0; i < content.z.length; i++) {
            dv.setFloat64(offset, content.z[i], true);
            offset += 8;
          }
        }

        // M
        if (content.m) {
          dv.setFloat64(offset, content.minM ?? 0, true);
          dv.setFloat64(offset + 8, content.maxM ?? 0, true);
          offset += 16;
          for (let i = 0; i < content.m.length; i++) {
            dv.setFloat64(offset, content.m[i], true);
            offset += 8;
          }
        }

        break;
      }

      default:
        throw new Error('Unsupported shape type for writer: ' + shape.type);
    }
  }

  return buf;
}

try {
  const ext = path.extname(input).toLowerCase();
  if (!output) {
    if (ext === '.shp') output = input.replace(/\.shp$/i, '.shpz');
    else if (ext === '.shpz') output = input + '.shp';
    else usage();
}

  if (ext === '.shp') {
    const raw = fs.readFileSync(input);
    const arrayBuffer = bufferToArrayBuffer(raw);
    const shp = new SHPParser().parse(arrayBuffer);
    const buf = compress(shp);
    fs.writeFileSync(output, Buffer.from(buf));
    console.log(`Compressed ${input} (${raw.byteLength} bytes) -> ${output} (${buf.byteLength} bytes, ${(buf.byteLength / raw.byteLength * 100).toFixed(1)}%)`);
  } else if (ext === '.shpz') {
    const raw = fs.readFileSync(input);
    const arrayBuffer = bufferToArrayBuffer(raw);
    const shp = decompress(arrayBuffer);
    const outShp = writeShp(shp);
    fs.writeFileSync(output, Buffer.from(outShp));
    console.log(`Decompressed ${input} (${raw.byteLength} bytes) -> ${output} (${outShp.byteLength} bytes)`);
  } else {
    usage();
  }
} catch (e) {
  console.error('Error:', e);
  process.exit(1);
}
