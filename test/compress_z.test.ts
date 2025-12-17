
import { describe, it, expect } from 'vitest';
import { SHPLoader } from '../src/three';
import { ShapeType, type ShapefileData, type PolyContent } from '../src/SHPParser';
import { compress, decompress } from '../src/SHPCompress';

describe('Compression with Z/M', () => {
    it('should compress and decompress POLYGONZ', () => {
        
        const original: ShapefileData = {
            fileCode: 9994,
            wordLength: 100,
            byteLength: 200,
            version: 1000,
            shapeType: ShapeType.POLYGONZ,
            minX: 0, minY: 0, maxX: 10, maxY: 10,
            minZ: 0, maxZ: 10,
            minM: 0, maxM: 10,
            records: [{
                number: 1,
                length: 50,
                shape: {
                    type: ShapeType.POLYGONZ,
                    content: {
                        minX: 0, minY: 0, maxX: 10, maxY: 10,
                        parts: new Int32Array([0]),
                        points: new Float64Array([0, 0, 10, 0, 10, 10, 0, 10, 0, 0]),
                        minZ: 0, maxZ: 10,
                        z: new Float64Array([0, 5, 10, 5, 0]),
                        minM: 0, maxM: 10,
                        m: new Float64Array([0, 2.5, 5, 7.5, 10])
                    } as PolyContent
                }
            }]
        };

        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed.shapeType).toBe(ShapeType.POLYGONZ);
        expect(decompressed.records.length).toBe(1);
        
        const content = decompressed.records[0].shape.content as PolyContent;
        expect(content.points.length).toBe(10);
        
        // Check Z values
        expect(content.z).toBeDefined();
        expect(content.z!.length).toBe(5);
        expect(content.z![0]).toBeCloseTo(0);
        expect(content.z![1]).toBeCloseTo(5);
        expect(content.z![2]).toBeCloseTo(10);
        
        // Check M values
        expect(content.m).toBeDefined();
        expect(content.m!.length).toBe(5);
        expect(content.m![0]).toBeCloseTo(0);
        expect(content.m![1]).toBeCloseTo(2.5);
        expect(content.m![4]).toBeCloseTo(10);
    });
});
