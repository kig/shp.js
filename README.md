# shp-js

A JavaScript/TypeScript library for parsing ESRI Shapefiles with optional THREE.js integration for 3D visualization.

## Installation

```bash
npm install shp-js
```

For THREE.js integration, also install three:

```bash
npm install shp-js three
```

## Usage

### Basic Shapefile Parsing

```typescript
import { SHPParser } from 'shp-js';

// Load from URL (async)
const shapeData = await SHPParser.load('/path/to/file.shp');

console.log('Shape type:', shapeData.shapeType);
console.log('Number of records:', shapeData.records.length);

// Access individual records
for (const record of shapeData.records) {
  console.log('Shape:', record.shape);
}
```

### Parse from ArrayBuffer

```typescript
import { SHPParser } from 'shp-js';

const response = await fetch('/path/to/file.shp');
const buffer = await response.arrayBuffer();

const parser = new SHPParser();
const shapeData = parser.parse(buffer);
```

### THREE.js Integration

```typescript
import { SHPParser } from 'shp-js';
import { SHPLoader } from 'shp-js/three';
import * as THREE from 'three';

// Parse shapefile
const shapeData = await SHPParser.load('/path/to/file.shp');

// Create THREE.js model
const loader = new SHPLoader();
const model = loader.createModel(shapeData, {
  spherize: true,      // Project onto sphere (for globe visualization)
  lineColor: 0x000000, // Line color
  meshColor: 0x88ff44, // Mesh color
});

// Add to scene
scene.add(model);
```

### Globe Visualization Example

```typescript
import { SHPParser } from 'shp-js';
import { SHPLoader } from 'shp-js/three';
import * as THREE from 'three';

// Setup scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
camera.position.z = 500;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add sphere for the globe
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(88, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x0000ff, opacity: 0.3, transparent: true })
);
scene.add(sphere);

// Load and display shapefile
const shapeData = await SHPParser.load('/110m_land.shp');
const loader = new SHPLoader();
const landModel = loader.createModel(shapeData, { spherize: true });
landModel.scale.set(1.01, 1.01, 1.01);
scene.add(landModel);

// Animate
function animate() {
  requestAnimationFrame(animate);
  landModel.rotation.y += 0.001;
  renderer.render(scene, camera);
}
animate();
```

## API Reference

### `SHPParser`

Static class for parsing ESRI Shapefiles.

#### `SHPParser.load(url: string): Promise<ShapefileData>`

Load and parse a shapefile from a URL.

#### `new SHPParser().parse(buffer: ArrayBuffer): ShapefileData`

Parse a shapefile from an ArrayBuffer.

### `SHPLoader` (THREE.js)

Class for creating THREE.js objects from parsed shapefiles.

#### `createModel(shp: ShapefileData, options?: SHPLoaderOptions): THREE.Group`

Create a THREE.js Group from parsed shapefile data.

**Options:**
- `spherize` (boolean): Project coordinates onto a sphere for globe visualization
- `lineColor` (ColorRepresentation): Color for lines (default: black)
- `meshColor` (ColorRepresentation): Color for meshes (default: 0x88ff44)
- `lineWidth` (number): Width of lines (limited WebGL support)

#### `loadCompressed(buffer: ArrayBuffer, options?: SHPLoaderOptions): THREE.Group`

Load a compressed delta-encoded shapefile.

#### `compress(shp: ShapefileData): ArrayBuffer`

Compress a shapefile for more efficient storage.

### Types

```typescript
interface ShapefileData {
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

interface ShapeRecord {
  number: number;
  length: number;
  shape: Shape;
}

interface Shape {
  type: ShapeTypeValue;
  content?: PointContent | PolyContent;
}
```

### Shape Types

The following shape types are supported:

- `ShapeType.NULL` (0)
- `ShapeType.POINT` (1)
- `ShapeType.POLYLINE` (3)
- `ShapeType.POLYGON` (5)

The following shape types are recognized but not yet fully supported:

- `ShapeType.MULTIPOINT` (8)
- `ShapeType.POINTZ` (11)
- `ShapeType.POLYLINEZ` (13)
- `ShapeType.POLYGONZ` (15)
- `ShapeType.MULTIPOINTZ` (18)
- `ShapeType.POINTM` (21)
- `ShapeType.POLYLINEM` (23)
- `ShapeType.POLYGONM` (25)
- `ShapeType.MULTIPOINTM` (28)
- `ShapeType.MULTIPATCH` (31)

## Browser Usage (UMD)

For direct browser usage without a bundler, you can use the ESM build:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
    "shp-js": "./dist/index.esm.js",
    "shp-js/three": "./dist/three.esm.js"
  }
}
</script>
<script type="module">
  import { SHPParser } from 'shp-js';
  import { SHPLoader } from 'shp-js/three';
  import * as THREE from 'three';
  
  // Your code here
</script>
```

## Migrating from the Original Library

If you're migrating from the original `shp.js`:

```javascript
// Old API
SHPParser.load('file.shp', function(result) {
  var loader = new THREE.SHPLoader();
  var model = loader.createModel(result, true);
});

// New API
import { SHPParser } from 'shp-js';
import { SHPLoader } from 'shp-js/three';

const result = await SHPParser.load('file.shp');
const loader = new SHPLoader();
const model = loader.createModel(result, { spherize: true });
```

## THREE.js Compatibility

This library requires THREE.js version 0.150.0 or higher. Key changes from older THREE.js versions:

- Uses `BufferGeometry` instead of deprecated `Geometry`
- Uses `THREE.Group` instead of `THREE.Object3D` for model containers
- Line mode constants have been removed (lines are now always continuous)

## License

Apache-2.0
