import { BitView } from './BitView.js';
import { ShapeType, type ShapefileData, type PolyContent, type ShapeRecord, ShapeTypeValue } from './SHPParser.js';

/**
 * Decompress shapefile data
 */
export function decompress(buffer: ArrayBuffer): ShapefileData {
    const view = new DataView(buffer);
    let offset = 0;

    const version = view.getUint8(offset++);
    if (version !== 1 && version !== 2) {
        throw new Error('Unsupported compressed format version: ' + version);
    }

    const shapeType = view.getUint8(offset++);
    const recordCount = view.getUint32(offset, true);
    offset += 4;
    const fileCode = view.getInt32(offset, true);
    offset += 4;
    const shpVersion = view.getInt32(offset, true);
    offset += 4;

    const records: ShapeRecord[] = [];
    const recordParts: number[][] = []; // Store part lengths for each record
    let totalPoints = 0;

    for (let i = 0; i < recordCount; i++) {
        const partCount = view.getUint16(offset, true);
        offset += 2;
        const parts: number[] = [];
        for (let j = 0; j < partCount; j++) {
            const len = view.getUint32(offset, true);
            parts.push(len);
            totalPoints += len;
            offset += 4;
        }
        recordParts.push(parts);
    }

    // The rest is compressed points
    const compressedPointsBuffer = buffer.slice(offset);
    const flatPoints = deltaDecode6(compressedPointsBuffer);

    // Calculate the size of compressed points in bytes to advance offset
    const bitLength = new DataView(compressedPointsBuffer).getUint32(0);
    const byteLength = Math.ceil(bitLength / 8);
    offset += byteLength;

    // Read Z and M if version 2
    let zs: Float32Array | null = null;
    let ms: Float32Array | null = null;

    if (version === 2) {
        const isZ =
            shapeType === ShapeType.POLYGONZ || shapeType === ShapeType.POLYLINEZ;
        const isM =
            isZ ||
            shapeType === ShapeType.POLYGONM ||
            shapeType === ShapeType.POLYLINEM;

        if (isZ) {
            zs = new Float32Array(buffer.slice(offset, offset + totalPoints * 4));
            offset += totalPoints * 4;
        }

        if (isM) {
            ms = new Float32Array(buffer.slice(offset, offset + totalPoints * 4));
            offset += totalPoints * 4;
        }
    }

    // Reconstruct records
    let pointIndex = 0;
    let globalPointIndex = 0;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    let minZ = Infinity,
        minM = Infinity,
        maxZ = -Infinity,
        maxM = -Infinity;
    let totalRecordsBytes = 0;

    for (let i = 0; i < recordCount; i++) {
        const partLengths = recordParts[i];
        if (partLengths.length === 0) {
            records.push({
                number: i + 1,
                length: 2, // Null shape length is 2 words (4 bytes)
                shape: { type: ShapeType.NULL },
            });
            totalRecordsBytes += 8 + 4; // Header + Content
            continue;
        }

        const parts: number[] = [];
        const points: number[] = [];
        const zValues: number[] = [];
        const mValues: number[] = [];

        let recMinX = Infinity,
            recMinY = Infinity,
            recMaxX = -Infinity,
            recMaxY = -Infinity;
        let recMinZ = Infinity,
            recMinM = Infinity,
            recMaxZ = -Infinity,
            recMaxM = -Infinity;
        let currentPartStart = 0;

        for (const len of partLengths) {
            parts.push(currentPartStart);
            for (let k = 0; k < len; k++) {
                if (pointIndex + 1 >= flatPoints.length) {
                    throw new Error('Unexpected end of point data');
                }
                // Convert back from 16-bit range to degrees
                // x = (val / 32767) * 180
                const x = (flatPoints[pointIndex] / 32767) * 180;
                const y = (flatPoints[pointIndex + 1] / 32767) * 180;
                pointIndex += 2;

                points.push(x, y);

                recMinX = Math.min(recMinX, x);
                recMinY = Math.min(recMinY, y);
                recMaxX = Math.max(recMaxX, x);
                recMaxY = Math.max(recMaxY, y);

                if (zs) {
                    const z = zs[globalPointIndex];
                    zValues.push(z);
                    recMinZ = Math.min(recMinZ, z);
                    recMaxZ = Math.max(recMaxZ, z);
                }
                if (ms) {
                    const m = ms[globalPointIndex];
                    mValues.push(m);
                    recMinM = Math.min(recMinM, m);
                    recMaxM = Math.max(recMaxM, m);
                }
                globalPointIndex++;
            }
            currentPartStart += len;
        }

        minX = Math.min(minX, recMinX);
        minY = Math.min(minY, recMinY);
        maxX = Math.max(maxX, recMaxX);
        maxY = Math.max(maxY, recMaxY);

        if (zs) {
            minZ = Math.min(minZ, recMinZ);
            maxZ = Math.max(maxZ, recMaxZ);
        }
        if (ms) {
            minM = Math.min(minM, recMinM);
            maxM = Math.max(maxM, recMaxM);
        }

        // Calculate record content length in 16-bit words
        // ShapeType (4) + Box (32) + NumParts (4) + NumPoints (4) + Parts (4*n) + Points (16*m)
        // Note: points array here is flat [x,y,x,y], so length is 2*m.
        // Size in bytes is points.length * 8.
        let contentBytes = 44 + parts.length * 4 + points.length * 8;
        if (zs) contentBytes += 16 + zValues.length * 8; // Range + Array
        if (ms) contentBytes += 16 + mValues.length * 8; // Range + Array

        const contentWords = contentBytes / 2;

        const content: PolyContent = {
            minX: recMinX,
            minY: recMinY,
            maxX: recMaxX,
            maxY: recMaxY,
            parts: new Int32Array(parts),
            points: new Float64Array(points),
        };

        if (zs) {
            content.minZ = recMinZ;
            content.maxZ = recMaxZ;
            content.z = new Float64Array(zValues);
        }

        if (ms) {
            content.minM = recMinM;
            content.maxM = recMaxM;
            content.m = new Float64Array(mValues);
        }

        records.push({
            number: i + 1,
            length: contentWords,
            shape: {
                type: shapeType as ShapeTypeValue,
                content: content,
            },
        });

        totalRecordsBytes += 8 + contentBytes;
    }

    // If no records, min/max should be 0
    if (minX === Infinity) {
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
    }
    if (minZ === Infinity) {
        minZ = 0;
        maxZ = 0;
    }
    if (minM === Infinity) {
        minM = 0;
        maxM = 0;
    }

    const fileLengthBytes = 100 + totalRecordsBytes;

    return {
        fileCode: fileCode,
        wordLength: fileLengthBytes / 2,
        byteLength: fileLengthBytes,
        version: shpVersion,
        shapeType: shapeType as ShapeTypeValue,
        minX,
        minY,
        maxX,
        maxY,
        minZ,
        maxZ,
        minM,
        maxM,
        records,
    };
}

/**
 * Compress shapefile data for more efficient storage
 */
export function compress(shp: ShapefileData): ArrayBuffer {
    const polys: number[] = [];
    const zs: number[] = [];
    const ms: number[] = [];
    const recordMetadata: { parts: number[] }[] = [];
    let shapeType = shp.shapeType;

    // If shapeType is not set or unknown, try to infer from first record
    if (!shapeType && shp.records.length > 0) {
        shapeType = shp.records[0].shape.type;
    }

    const isZ = shapeType === ShapeType.POLYGONZ || shapeType === ShapeType.POLYLINEZ;
    const isM = isZ || shapeType === ShapeType.POLYGONM || shapeType === ShapeType.POLYLINEM;

    for (let i = 0; i < shp.records.length; i++) {
        const r = shp.records[i].shape;
        // Support both Polygon and Polyline and their Z/M variants
        if (
            r.type === ShapeType.POLYGON ||
            r.type === ShapeType.POLYLINE ||
            r.type === ShapeType.POLYGONZ ||
            r.type === ShapeType.POLYLINEZ ||
            r.type === ShapeType.POLYGONM ||
            r.type === ShapeType.POLYLINEM
        ) {
            const content = r.content as PolyContent;
            const points = content.points;
            const parts = content.parts;
            const partLengths: number[] = [];

            for (let k = 0; k < parts.length; k++) {
                const start = parts[k];
                const end = parts[k + 1] ?? points.length / 2;
                const pointCount = end - start;
                partLengths.push(pointCount);

                for (let j = start; j < end; j++) {
                    const x = points[j * 2];
                    const y = points[j * 2 + 1];
                    // Quantize to 16-bit signed integer range [-32767, 32767]
                    // Mapping [-180, 180] to [-32767, 32767]
                    polys.push((x / 180) * 32767, (y / 180) * 32767);

                    if (isZ && content.z) {
                        zs.push(content.z[j]);
                    }
                    if (isM && content.m) {
                        ms.push(content.m[j]);
                    }
                }
            }
            recordMetadata.push({ parts: partLengths });
        } else {
            // For other types, we skip or handle differently. 
            recordMetadata.push({ parts: [] });
        }
    }

    // Add a terminator to ensure the last span is flushed by deltaEncode6
    polys.push(-32768);

    const i16a = new Int16Array(polys);
    const compressedPoints = deltaEncode6(i16a);

    // Calculate header size
    // Version (1) + ShapeType (1) + RecordCount (4) + FileCode (4) + SHPVersion (4) = 14 bytes
    let headerSize = 14;
    // Metadata:
    // For each record: PartCount (2) + PartLengths (PartCount * 4)
    for (const rec of recordMetadata) {
        headerSize += 2 + rec.parts.length * 4;
    }

    let totalSize = headerSize + compressedPoints.byteLength;
    if (isZ) totalSize += zs.length * 4; // Float32
    if (isM) totalSize += ms.length * 4; // Float32

    const result = new Uint8Array(totalSize);
    const view = new DataView(result.buffer);
    let offset = 0;

    // Header
    view.setUint8(offset++, isZ || isM ? 2 : 1); // Version
    view.setUint8(offset++, shapeType);
    view.setUint32(offset, recordMetadata.length, true); // Little Endian
    offset += 4;
    view.setInt32(offset, shp.fileCode || 9994, true);
    offset += 4;
    view.setInt32(offset, shp.version || 1000, true);
    offset += 4;

    // Metadata
    for (const rec of recordMetadata) {
        view.setUint16(offset, rec.parts.length, true);
        offset += 2;
        for (const len of rec.parts) {
            view.setUint32(offset, len, true);
            offset += 4;
        }
    }

    // Compressed Data
    result.set(new Uint8Array(compressedPoints), offset);
    offset += compressedPoints.byteLength;

    // Z Data
    if (isZ) {
        const f32 = new Float32Array(zs);
        result.set(new Uint8Array(f32.buffer), offset);
        offset += f32.byteLength;
    }

    // M Data
    if (isM) {
        const f32 = new Float32Array(ms);
        result.set(new Uint8Array(f32.buffer), offset);
        offset += f32.byteLength;
    }

    return result.buffer;
}


// Delta encoding helpers
function deltaEncode6(arr: Int16Array): ArrayBuffer {
    const polys: number[][][] = [];
    let spans: number[][] = [];
    let span: number[] = [];
    let x = 0,
        y = 0;
    let byteLen = 0;

    // First pass: quantize to 12-bit range
    const quantized = new Int16Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        quantized[i] = (arr[i] / 16) | 0;
    }

    for (let i = 0; i < quantized.length; i++) {
        if (quantized[i] === -2048) {
            spans.push(span);
            polys.push(spans);
            spans = [];
            span = [];
            byteLen += 3;
            continue;
        }

        if (span.length === 0) {
            x = quantized[i];
            y = quantized[i + 1];
            span.push(x, y);
            byteLen += 4;
            i++;
        } else if (Math.abs(x - quantized[i]) > 31 || Math.abs(y - quantized[i + 1]) > 31) {
            spans.push(span);
            byteLen += 1;
            span = [];
            x = quantized[i];
            y = quantized[i + 1];
            span.push(x, y);
            byteLen += 4;
            i++;
        } else {
            span.push(quantized[i] - x, quantized[i + 1] - y);
            x += quantized[i] - x;
            y += quantized[i + 1] - y;
            byteLen += 2;
            i++;
        }
    }

    return storeDeltas6(byteLen, polys);
}

function storeDeltas6(byteLen: number, polys: number[][][]): ArrayBuffer {
    const buf = new ArrayBuffer(Math.ceil(byteLen * 0.75) + 4);
    const dv = new BitView(buf);
    let idx = 32;

    for (let i = 0; i < polys.length; i++) {
        const spans = polys[i];
        for (let j = 0; j < spans.length; j++) {
            const span = spans[j];
            dv.setInt12(idx, span[0]);
            idx += 12;
            dv.setInt12(idx, span[1]);
            idx += 12;

            for (let k = 2; k < span.length; k++) {
                dv.setInt6(idx, span[k]);
                idx += 6;
            }

            dv.setInt6(idx, -32);
            idx += 6;
        }

        dv.setInt12(idx, -2048);
        idx += 12;
    }

    new DataView(buf).setUint32(0, idx);
    return buf;
}

function deltaDecode6(buf: ArrayBuffer): number[] {
    const bitLength = new DataView(buf).getUint32(0);
    const dv = new BitView(buf);
    let idx = 32;
    const polys: number[] = [];

    while (idx < bitLength) {
        let x = dv.getInt12(idx);
        idx += 12;

        if (x === -2048) {
            polys.push(-2048);
            continue;
        }

        let y = dv.getInt12(idx);
        idx += 12;
        polys.push(x, y);

        while (idx < bitLength) {
            const dx = dv.getInt6(idx);
            idx += 6;

            if (dx === -32) {
                break;
            }

            const dy = dv.getInt6(idx);
            idx += 6;
            x += dx;
            y += dy;
            polys.push(x, y);
        }
    }

    // Convert back to 16-bit range
    for (let i = 0; i < polys.length; i++) {
        polys[i] *= 16;
    }

    return polys;
}
