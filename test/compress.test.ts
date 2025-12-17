
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { compress, decompress } from '../src/SHPCompress';
import { ShapeType, type ShapefileData, type PolyContent, SHPParser } from '../src/SHPParser';

function generateRandomShapefile(recordCount: number, type: typeof ShapeType.POLYGON | typeof ShapeType.POLYLINE): ShapefileData {
    const records = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < recordCount; i++) {
        const partCount = Math.floor(Math.random() * 3) + 1;
        const parts = [];
        const points = [];
        let currentIdx = 0;

        let recMinX = Infinity, recMinY = Infinity, recMaxX = -Infinity, recMaxY = -Infinity;

        for (let p = 0; p < partCount; p++) {
            parts.push(currentIdx);
            const pointCount = Math.floor(Math.random() * 1000) + 3;
            
            for (let pt = 0; pt < pointCount; pt++) {
                // Generate random lat/lon
                const x = (Math.random() * 360) - 180;
                const y = (Math.random() * 180) - 90;
                points.push(x, y);
                
                recMinX = Math.min(recMinX, x);
                recMinY = Math.min(recMinY, y);
                recMaxX = Math.max(recMaxX, x);
                recMaxY = Math.max(recMaxY, y);
                
                currentIdx++;
            }
        }

        minX = Math.min(minX, recMinX);
        minY = Math.min(minY, recMinY);
        maxX = Math.max(maxX, recMaxX);
        maxY = Math.max(maxY, recMaxY);

        records.push({
            number: i + 1,
            length: 0,
            shape: {
                type: type,
                content: {
                    minX: recMinX,
                    minY: recMinY,
                    maxX: recMaxX,
                    maxY: recMaxY,
                    parts: new Int32Array(parts),
                    points: new Float64Array(points)
                }
            }
        });
    }

    return {
        fileCode: 9994,
        wordLength: 0,
        byteLength: 0,
        version: 1000,
        shapeType: type,
        minX, minY, maxX, maxY,
        minZ: 0, maxZ: 0, minM: 0, maxM: 0,
        records
    };
}

describe('SHP Compression', () => {

    it('should compress and decompress Polygons correctly', () => {
        const original = generateRandomShapefile(10, ShapeType.POLYGON);
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed.shapeType).toBe(ShapeType.POLYGON);
        expect(decompressed.records.length).toBe(original.records.length);

        for (let i = 0; i < original.records.length; i++) {
            const origRec = original.records[i];
            const decRec = decompressed.records[i];

            expect(decRec.shape.type).toBe(ShapeType.POLYGON);
            
            const origContent = origRec.shape.content as PolyContent;
            const decContent = decRec.shape.content as PolyContent;

            expect(decContent.parts.length).toBe(origContent.parts.length);
            expect(decContent.points.length).toBe(origContent.points.length);

            // Check points with tolerance
            // Quantization error is roughly 180 / 2048 = 0.088 degrees
            const tolerance = 0.1; 

            for (let j = 0; j < origContent.points.length; j++) {
                expect(decContent.points[j]).toBeCloseTo(origContent.points[j], 0); // 0 decimal places is 1.0, but we check manually
                // Let's be more precise manually
                expect(Math.abs(decContent.points[j] - origContent.points[j])).toBeLessThan(tolerance);
            }
        }
    });

    it('should compress and decompress Polylines correctly', () => {
        const original = generateRandomShapefile(10, ShapeType.POLYLINE);
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed.shapeType).toBe(ShapeType.POLYLINE);
        expect(decompressed.records.length).toBe(original.records.length);

        for (let i = 0; i < original.records.length; i++) {
            const origRec = original.records[i];
            const decRec = decompressed.records[i];

            expect(decRec.shape.type).toBe(ShapeType.POLYLINE);
            
            const origContent = origRec.shape.content as PolyContent;
            const decContent = decRec.shape.content as PolyContent;

            expect(decContent.parts.length).toBe(origContent.parts.length);
            expect(decContent.points.length).toBe(origContent.points.length);

            const tolerance = 0.1; 

            for (let j = 0; j < origContent.points.length; j++) {
                expect(Math.abs(decContent.points[j] - origContent.points[j])).toBeLessThan(tolerance);
            }
        }
    });

    it('should handle empty records', () => {
        // Manually create a shapefile with empty records
        const original: ShapefileData = {
            fileCode: 9994,
            wordLength: 0,
            byteLength: 0,
            version: 1000,
            shapeType: ShapeType.POLYGON,
            minX: 0, minY: 0, maxX: 0, maxY: 0,
            minZ: 0, maxZ: 0, minM: 0, maxM: 0,
            records: [
                {
                    number: 1,
                    length: 0,
                    shape: { type: ShapeType.NULL }
                },
                {
                    number: 2,
                    length: 0,
                    shape: {
                        type: ShapeType.POLYGON,
                        content: {
                            minX: 0, minY: 0, maxX: 10, maxY: 10,
                            parts: new Int32Array([0]),
                            points: new Float64Array([0,0, 10,0, 10,10, 0,10, 0,0])
                        }
                    }
                }
            ]
        };

        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed.records.length).toBe(2);
        expect(decompressed.records[0].shape.type).toBe(ShapeType.NULL);
        expect(decompressed.records[1].shape.type).toBe(ShapeType.POLYGON);
        
        const content = decompressed.records[1].shape.content as PolyContent;
        expect(content.points.length).toBe(10);
    });

    it('should compress and decompress 110m_land.shp correctly', () => {
        const shpPath = path.join(__dirname, '../public/110m_land.shp');
        const buffer = fs.readFileSync(shpPath);
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        
        const parser = new SHPParser();
        const original = parser.parse(arrayBuffer);
        
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        const tolerance = 0.7;

        const traverseCompare = (orig: ShapefileData, dec: ShapefileData) => {
            expect(Object.keys(dec).length).toBe(Object.keys(orig).length);
            for (const key in orig) {
                const oVal = (orig as any)[key];
                const dVal = (dec as any)[key];
                if (typeof oVal === 'number' && parseInt(oVal as any) === oVal) {
                    expect(dVal).toBeCloseTo(oVal, tolerance);
                } else if (ArrayBuffer.isView(oVal)) {
                    expect(dVal.length).toBe(oVal.length);
                    for (let i = 0; i < oVal.length; i++) {
                        expect(dVal[i]).toBeCloseTo(oVal[i], tolerance);
                    }
                } else if (Array.isArray(oVal)) {
                    expect(dVal.length).toBe(oVal.length);
                    for (let i = 0; i < oVal.length; i++) {
                        traverseCompare(oVal[i], dVal[i]);
                    }
                } else if (typeof oVal === 'object' && oVal !== null) {
                    traverseCompare(oVal, dVal);
                } else if (typeof oVal === 'number' && parseInt(oVal as any) !== oVal) {
                    expect(dVal).toBeCloseTo(oVal, tolerance);
                } else {
                    expect(dVal).toBe(oVal);
                }
            }
        };
        traverseCompare(original, decompressed);
       
        expect(decompressed.fileCode).toBe(original.fileCode);
        expect(decompressed.wordLength).toBe(original.wordLength);
        expect(decompressed.byteLength).toBe(original.byteLength);
        expect(decompressed.version).toBe(original.version);
        expect(decompressed.shapeType).toBe(original.shapeType);

        expect(decompressed.minX).toBeCloseTo(original.minX, tolerance);
        expect(decompressed.minY).toBeCloseTo(original.minY, tolerance);
        expect(decompressed.maxX).toBeCloseTo(original.maxX, tolerance);
        expect(decompressed.maxY).toBeCloseTo(original.maxY, tolerance);
        expect(decompressed.minZ).toBeCloseTo(original.minZ, tolerance);
        expect(decompressed.maxZ).toBeCloseTo(original.maxZ, tolerance);
        expect(decompressed.minM).toBeCloseTo(original.minM, tolerance);
        expect(decompressed.maxM).toBeCloseTo(original.maxM, tolerance);

        expect(decompressed.records.length).toBe(original.records.length);

        for (let i = 0; i < original.records.length; i++) {
            const origRec = original.records[i];
            const decRec = decompressed.records[i];

            expect(decRec.shape.type).toBe(origRec.shape.type);
            expect(decRec.number).toBe(origRec.number);
            expect(decRec.length).toBe(origRec.length);
            
            if (origRec.shape.type === ShapeType.NULL) continue;

            const origContent = origRec.shape.content as PolyContent;
            const decContent = decRec.shape.content as PolyContent;

            expect(Object.keys(decContent).length).toBe(Object.keys(origContent).length);

            expect(decContent.parts.length).toBe(origContent.parts.length);
            expect(decContent.points.length).toBe(origContent.points.length);

            expect(decContent.minX).toBeCloseTo(origContent.minX, tolerance);
            expect(decContent.minY).toBeCloseTo(origContent.minY, tolerance);
            expect(decContent.maxX).toBeCloseTo(origContent.maxX, tolerance);
            expect(decContent.maxY).toBeCloseTo(origContent.maxY, tolerance);

            for (let j = 0; j < origContent.parts.length; j++) {
                expect(decContent.parts[j]).toBe(origContent.parts[j]);
            }
            
            for (let j = 0; j < origContent.points.length; j++) {
                expect(decContent.points[j]).toBeCloseTo(origContent.points[j], tolerance);
            }

            // Assert that X and Y values are within bounds
            for (let j = 0; j < origContent.points.length; j += 2) {
                {
                    const x = decContent.points[j];
                    expect(x).toBeGreaterThanOrEqual(-180);
                    expect(x).toBeLessThanOrEqual(180);
                    const y = decContent.points[j+1];
                    expect(y).toBeGreaterThanOrEqual(-90);
                    expect(y).toBeLessThanOrEqual(90);
                }
                {
                    const x = origContent.points[j];
                    expect(x).toBeGreaterThanOrEqual(-180);
                    expect(x).toBeLessThanOrEqual(180);
                    const y = origContent.points[j+1];
                    expect(y).toBeGreaterThanOrEqual(-90);
                    expect(y).toBeLessThanOrEqual(90);
                }
            }

        }
    });
});
