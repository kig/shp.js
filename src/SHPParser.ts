/**
 * Shape type constants from the Shapefile specification
 * http://www.esri.com/library/whitepapers/pdfs/shapefile.pdf
 */
export const ShapeType = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINTZ: 11,
  POLYLINEZ: 13,
  POLYGONZ: 15,
  MULTIPOINTZ: 18,
  POINTM: 21,
  POLYLINEM: 23,
  POLYGONM: 25,
  MULTIPOINTM: 28,
  MULTIPATCH: 31,
} as const;

export type ShapeTypeValue = (typeof ShapeType)[keyof typeof ShapeType];

/**
 * Get the name of a shape type from its ID
 */
export function getShapeName(id: ShapeTypeValue): string | undefined {
  for (const [name, value] of Object.entries(ShapeType)) {
    if (id === value) {
      return name;
    }
  }
  return undefined;
}

/**
 * Point shape content
 */
export interface PointContent {
  x: number;
  y: number;
  z?: number;
  m?: number;
}

/**
 * Polyline or Polygon shape content
 */
export interface PolyContent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  parts: Int32Array;
  points: Float64Array;
  z?: Float64Array;
  m?: Float64Array;
  minZ?: number;
  maxZ?: number;
  minM?: number;
  maxM?: number;
  partTypes?: Int32Array;
}

/**
 * Shape record
 */
export interface Shape {
  type: ShapeTypeValue;
  content?: PointContent | PolyContent;
}

/**
 * Record from a Shapefile
 */
export interface ShapeRecord {
  number: number;
  length: number;
  shape: Shape;
}

/**
 * Parsed Shapefile data
 */
export interface ShapefileData {
  fileCode: number;
  wordLength: number;
  byteLength: number;
  version: number;
  shapeType: ShapeTypeValue;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  minM: number;
  maxM: number;
  records: ShapeRecord[];
}

import { decompress } from './SHPCompress.js';

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Shapefile Parser
 * Parses ESRI Shapefiles according to the specification at
 * http://www.esri.com/library/whitepapers/pdfs/shapefile.pdf
 */
export class SHPParser {
  /**
   * Load a shapefile from a URL
   */
  static async load(src: string): Promise<ShapefileData> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load shapefile: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new SHPParser().parse(arrayBuffer);
  }

  /** 
   * Load a compressed shapefile from a URL
   */
  static async loadCompressed(src: string): Promise<ShapefileData> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load compressed shapefile: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return decompress(arrayBuffer);
  }

  /**
   * Load a shapefile from a URL with callbacks (legacy API)
   */
  static loadWithCallback(
    src: string,
    callback: (data: ShapefileData) => void,
    onerror?: (error: Event) => void
  ): void {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      const d = new SHPParser().parse(xhr.response as ArrayBuffer);
      callback(d);
    };
    xhr.onerror = onerror || (() => {});
    xhr.open('GET', src);
    xhr.send(null);
  }

  /**
   * Parse a shapefile from an ArrayBuffer
   */
  parse(arrayBuffer: ArrayBuffer): ShapefileData {
    const o: ShapefileData = {} as ShapefileData;
    const dv = new DataView(arrayBuffer);
    let idx = 0;

    o.fileCode = dv.getInt32(idx, false);
    if (o.fileCode !== 0x0000270a) {
      throw new Error('Unknown file code: ' + o.fileCode);
    }

    idx += 6 * 4;
    o.wordLength = dv.getInt32(idx, false);
    o.byteLength = o.wordLength * 2;
    idx += 4;
    o.version = dv.getInt32(idx, true);
    idx += 4;
    o.shapeType = dv.getInt32(idx, true) as ShapeTypeValue;
    idx += 4;
    o.minX = dv.getFloat64(idx, true);
    o.minY = dv.getFloat64(idx + 8, true);
    o.maxX = dv.getFloat64(idx + 16, true);
    o.maxY = dv.getFloat64(idx + 24, true);
    o.minZ = dv.getFloat64(idx + 32, true);
    o.maxZ = dv.getFloat64(idx + 40, true);
    o.minM = dv.getFloat64(idx + 48, true);
    o.maxM = dv.getFloat64(idx + 56, true);
    idx += 8 * 8;

    o.records = [];
    while (idx < o.byteLength) {
      const record: ShapeRecord = {} as ShapeRecord;
      record.number = dv.getInt32(idx, false);
      idx += 4;
      record.length = dv.getInt32(idx, false);
      idx += 4;
      try {
        record.shape = this.parseShape(dv, idx, record.length);
      } catch (e) {
        console.warn('Error parsing shape:', e, record);
        record.shape = { type: ShapeType.NULL };
      }
      idx += record.length * 2;
      o.records.push(record);
    }

    return o;
  }

  /**
   * Parse an individual shape from the shapefile
   */
  private parseShape(dv: DataView, idx: number, length: number): Shape {
    const shape: Shape = {} as Shape;
    shape.type = dv.getInt32(idx, true) as ShapeTypeValue;
    idx += 4;

    switch (shape.type) {
      case ShapeType.NULL:
        break;

      case ShapeType.POINT: {
        const content: PointContent = {
          x: clamp(dv.getFloat64(idx, true), -180, 180),
          y: clamp(dv.getFloat64(idx + 8, true), -90, 90),
        };
        shape.content = content;
        break;
      }

      case ShapeType.POINTZ: {
        const content: PointContent = {
          x: clamp(dv.getFloat64(idx, true), -180, 180),
          y: clamp(dv.getFloat64(idx + 8, true), -90, 90),
          z: dv.getFloat64(idx + 16, true),
          m: dv.getFloat64(idx + 24, true),
        };
        shape.content = content;
        break;
      }

      case ShapeType.POINTM: {
        const content: PointContent = {
          x: clamp(dv.getFloat64(idx, true), -180, 180),
          y: clamp(dv.getFloat64(idx + 8, true), -90, 90),
          m: dv.getFloat64(idx + 16, true),
        };
        shape.content = content;
        break;
      }

      case ShapeType.POLYLINE:
      case ShapeType.POLYGON:
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYGONZ:
      case ShapeType.POLYLINEM:
      case ShapeType.POLYGONM:
      case ShapeType.MULTIPATCH: {
        const partCount = dv.getInt32(idx + 32, true);
        const pointCount = dv.getInt32(idx + 36, true);
        const content: PolyContent = {
          minX: clamp(dv.getFloat64(idx, true), -180, 180),
          minY: clamp(dv.getFloat64(idx + 8, true), -90, 90),
          maxX: clamp(dv.getFloat64(idx + 16, true), -180, 180),
          maxY: clamp(dv.getFloat64(idx + 24, true), -90, 90),
          parts: new Int32Array(partCount),
          points: new Float64Array(pointCount * 2),
        };
        idx += 40;

        for (let i = 0; i < content.parts.length; i++) {
          content.parts[i] = dv.getInt32(idx, true);
          idx += 4;
        }

        if (shape.type === ShapeType.MULTIPATCH) {
          content.partTypes = new Int32Array(partCount);
          for (let i = 0; i < content.partTypes.length; i++) {
            content.partTypes[i] = dv.getInt32(idx, true);
            idx += 4;
          }
        }

        for (let i = 0; i < content.points.length; i += 2) {
          content.points[i] = clamp(dv.getFloat64(idx, true), -180, 180);
          content.points[i + 1] = clamp(dv.getFloat64(idx + 8, true), -90, 90);
          idx += 16;
        }

        if (
          shape.type === ShapeType.POLYLINEZ ||
          shape.type === ShapeType.POLYGONZ ||
          shape.type === ShapeType.MULTIPATCH
        ) {
          content.minZ = dv.getFloat64(idx, true);
          content.maxZ = dv.getFloat64(idx + 8, true);
          idx += 16;
          content.z = new Float64Array(pointCount);
          for (let i = 0; i < pointCount; i++) {
            content.z[i] = dv.getFloat64(idx, true);
            idx += 8;
          }
        }

        if (
          shape.type === ShapeType.POLYLINEZ ||
          shape.type === ShapeType.POLYGONZ ||
          shape.type === ShapeType.POLYLINEM ||
          shape.type === ShapeType.POLYGONM ||
          shape.type === ShapeType.MULTIPATCH
        ) {
          content.minM = dv.getFloat64(idx, true);
          content.maxM = dv.getFloat64(idx + 8, true);
          idx += 16;
          content.m = new Float64Array(pointCount);
          for (let i = 0; i < pointCount; i++) {
            content.m[i] = dv.getFloat64(idx, true);
            idx += 8;
          }
        }

        shape.content = content;
        break;
      }

      case ShapeType.MULTIPOINT:
      case ShapeType.MULTIPOINTZ:
      case ShapeType.MULTIPOINTM: {
        const pointCount = dv.getInt32(idx + 32, true);
        const content: PolyContent = {
          minX: clamp(dv.getFloat64(idx, true), -180, 180),
          minY: clamp(dv.getFloat64(idx + 8, true), -90, 90),
          maxX: clamp(dv.getFloat64(idx + 16, true), -180, 180),
          maxY: clamp(dv.getFloat64(idx + 24, true), -90, 90),
          parts: new Int32Array(0),
          points: new Float64Array(pointCount * 2),
        };
        idx += 36;

        for (let i = 0; i < content.points.length; i += 2) {
          content.points[i] = clamp(dv.getFloat64(idx, true), -180, 180);
          content.points[i + 1] = clamp(dv.getFloat64(idx + 8, true), -90, 90);
          idx += 16;
        }

        if (shape.type === ShapeType.MULTIPOINTZ) {
          content.minZ = dv.getFloat64(idx, true);
          content.maxZ = dv.getFloat64(idx + 8, true);
          idx += 16;
          content.z = new Float64Array(pointCount);
          for (let i = 0; i < pointCount; i++) {
            content.z[i] = dv.getFloat64(idx, true);
            idx += 8;
          }
        }

        if (
          shape.type === ShapeType.MULTIPOINTZ ||
          shape.type === ShapeType.MULTIPOINTM
        ) {
          content.minM = dv.getFloat64(idx, true);
          content.maxM = dv.getFloat64(idx + 8, true);
          idx += 16;
          content.m = new Float64Array(pointCount);
          for (let i = 0; i < pointCount; i++) {
            content.m[i] = dv.getFloat64(idx, true);
            idx += 8;
          }
        }

        shape.content = content;
        break;
      }

      default:
        throw new Error(`Unknown shape type at ${idx - 4}: ${shape.type}`);
    }

    return shape;
  }
}
