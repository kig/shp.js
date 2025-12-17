
import { describe, it, expect } from 'vitest';
import { SHPParser, ShapeType } from '../src/SHPParser';

describe('SHPParser', () => {
    it('should parse POINTZ', () => {
        // Create a buffer for a POINTZ shape
        // Header (100 bytes) + Record Header (8 bytes) + Shape (variable)
        const buffer = new ArrayBuffer(100 + 8 + 4 + 8 + 8 + 8 + 8);
        const dv = new DataView(buffer);

        // File Header
        dv.setInt32(0, 9994, false); // File Code
        dv.setInt32(24, 72, false); // File Length (in 16-bit words) - 144 bytes
        dv.setInt32(28, 1000, true); // Version
        dv.setInt32(32, ShapeType.POINTZ, true); // Shape Type

        // Record Header
        let idx = 100;
        dv.setInt32(idx, 1, false); // Record Number
        dv.setInt32(idx + 4, 18, false); // Content Length (in 16-bit words) - 4 (type) + 8(x) + 8(y) + 8(z) + 8(m) = 36 bytes = 18 words
        idx += 8;

        // Shape
        dv.setInt32(idx, ShapeType.POINTZ, true); // Shape Type
        idx += 4;
        dv.setFloat64(idx, 10.0, true); // X
        idx += 8;
        dv.setFloat64(idx, 20.0, true); // Y
        idx += 8;
        dv.setFloat64(idx, 30.0, true); // Z
        idx += 8;
        dv.setFloat64(idx, 40.0, true); // M

        const parser = new SHPParser();
        const data = parser.parse(buffer);

        expect(data.records.length).toBe(1);
        expect(data.records[0].shape.type).toBe(ShapeType.POINTZ);
        expect(data.records[0].shape.content).toEqual({
            x: 10.0,
            y: 20.0,
            z: 30.0,
            m: 40.0
        });
    });

    it('should parse POLYGONZ', () => {
        // Create a buffer for a POLYGONZ shape
        // Header (100 bytes) + Record Header (8 bytes) + Shape (variable)
        // Shape: Type(4) + Box(32) + NumParts(4) + NumPoints(4) + Parts(4) + Points(16) + ZRange(16) + ZArray(8) + MRange(16) + MArray(8)
        // Total Shape = 4 + 32 + 4 + 4 + 4 + 16 + 16 + 8 + 16 + 8 = 112 bytes
        // Record Length = 56 words
        // File Length = 100 + 8 + 112 = 220 bytes = 110 words

        const buffer = new ArrayBuffer(220);
        const dv = new DataView(buffer);

        // File Header
        dv.setInt32(0, 9994, false);
        dv.setInt32(24, 110, false);
        dv.setInt32(28, 1000, true);
        dv.setInt32(32, ShapeType.POLYGONZ, true);

        // Record Header
        let idx = 100;
        dv.setInt32(idx, 1, false);
        dv.setInt32(idx + 4, 56, false);
        idx += 8;

        // Shape
        dv.setInt32(idx, ShapeType.POLYGONZ, true);
        idx += 4;
        // Box
        dv.setFloat64(idx, 0, true); // MinX
        dv.setFloat64(idx + 8, 0, true); // MinY
        dv.setFloat64(idx + 16, 10, true); // MaxX
        dv.setFloat64(idx + 24, 10, true); // MaxY
        idx += 32;
        // NumParts
        dv.setInt32(idx, 1, true);
        idx += 4;
        // NumPoints
        dv.setInt32(idx, 1, true);
        idx += 4;
        // Parts
        dv.setInt32(idx, 0, true);
        idx += 4;
        // Points
        dv.setFloat64(idx, 5, true); // X
        dv.setFloat64(idx + 8, 5, true); // Y
        idx += 16;
        // Z Range
        dv.setFloat64(idx, 0, true); // MinZ
        dv.setFloat64(idx + 8, 10, true); // MaxZ
        idx += 16;
        // Z Array
        dv.setFloat64(idx, 5, true); // Z
        idx += 8;
        // M Range
        dv.setFloat64(idx, 0, true); // MinM
        dv.setFloat64(idx + 8, 10, true); // MaxM
        idx += 16;
        // M Array
        dv.setFloat64(idx, 5, true); // M
        idx += 8;

        const parser = new SHPParser();
        const data = parser.parse(buffer);

        expect(data.records.length).toBe(1);
        expect(data.records[0].shape.type).toBe(ShapeType.POLYGONZ);
        const content = data.records[0].shape.content as any;
        expect(content.points[0]).toBe(5);
        expect(content.points[1]).toBe(5);
        expect(content.z[0]).toBe(5);
        expect(content.m[0]).toBe(5);
    });
});
