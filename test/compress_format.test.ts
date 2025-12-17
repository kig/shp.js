import { describe, it, expect } from 'vitest';
import { compress, decompress } from '../src/SHPCompress';
import { ShapeType, type ShapefileData, type PolyContent } from '../src/SHPParser';

describe('SHPCompress format', () => {
  it('produces version 2 for Z/M shapes and round-trips', () => {
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
            points: new Float64Array([0,0, 10,0, 10,10, 0,10, 0,0]),
            minZ: 0, maxZ: 10,
            z: new Float64Array([0,5,10,5,0]),
            minM: 0, maxM: 10,
            m: new Float64Array([0,2.5,5,7.5,10])
          } as PolyContent
        }
      }]
    };

    const buf = compress(original);
    const dv = new DataView(buf);
    // first byte is version; for Z/M it should be 2
    expect(dv.getUint8(0)).toBe(2);

    const dec = decompress(buf);
    expect(dec.shapeType).toBe(ShapeType.POLYGONZ);
    expect(dec.records.length).toBe(1);
    const content = dec.records[0].shape.content as PolyContent;
    expect(content.z).toBeDefined();
    expect(content.m).toBeDefined();
    expect(content.z!.length).toBe(5);
    expect(content.m!.length).toBe(5);
  });

  it('produces version 1 for shapes without Z/M', () => {
    const original: ShapefileData = {
      fileCode: 9994,
      wordLength: 100,
      byteLength: 200,
      version: 1000,
      shapeType: ShapeType.POLYGON,
      minX: 0, minY: 0, maxX: 10, maxY: 10,
      minZ: 0, maxZ: 0,
      minM: 0, maxM: 0,
      records: [{
        number: 1,
        length: 40,
        shape: {
          type: ShapeType.POLYGON,
          content: {
            minX: 0, minY: 0, maxX: 10, maxY: 10,
            parts: new Int32Array([0]),
            points: new Float64Array([0,0, 10,0, 10,10, 0,10, 0,0])
          } as PolyContent
        }
      }]
    };

    const buf = compress(original);
    const dv = new DataView(buf);
    expect(dv.getUint8(0)).toBe(1);

    const dec = decompress(buf);
    expect(dec.shapeType).toBe(ShapeType.POLYGON);
    expect(dec.records.length).toBe(1);
    const content = dec.records[0].shape.content as PolyContent;
    expect(content.z).toBeUndefined();
    expect(content.m).toBeUndefined();
    expect(content.points.length).toBe(10);
  });
});
