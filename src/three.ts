/**
 * THREE.js integration for the Shapefile parser
 * 
 * This module provides utilities to convert parsed shapefiles into THREE.js objects.
 * Requires three.js >= 0.150.0 as a peer dependency.
 */

import * as THREE from 'three';
import { ShapeType, type ShapefileData, type PolyContent } from './SHPParser';

export interface SHPLoaderOptions {
    /** Convert to spherical coordinates (for globe visualization) */
    spherize?: boolean;
    /** Inner radius for adaptive subdivision (triangles with centers closer than this get subdivided) */
    innerRadius?: number;
    /** Outer radius for the sphere (vertices are projected to this radius) */
    outerRadius?: number;
    /** Inner radius for line adaptive subdivision (edges with centers closer than this get subdivided) */
    linesInnerRadius?: number;
    /** Outer radius for line projection */
    linesOuterRadius?: number;
    /** Color for line materials */
    lineColor?: THREE.ColorRepresentation;
    lineOpacity?: number;
    /** Color for mesh materials */
    meshColor?: THREE.ColorRepresentation;
    meshOpacity?: number;
    /** Custom line material */
    lineMaterial?: any;
    /** Custom mesh material */
    meshMaterial?: any;
    /** Line width (note: limited WebGL support) */
    lineWidth?: number;
    /** Wireframe mode */
    wireframe?: boolean;
}

const defaultOptions: Required<SHPLoaderOptions> = {
    spherize: false,
    innerRadius: 88,
    outerRadius: 90,
    linesInnerRadius: 91,
    linesOuterRadius: 92,
    lineColor: 0x000000,
    lineOpacity: 1,
    meshColor: 0x88ff44,
    meshOpacity: 1,
    lineWidth: 1,
    wireframe: false,
    lineMaterial: undefined,
    meshMaterial: undefined,
};

interface Triangle {
    v0: THREE.Vector3;
    v1: THREE.Vector3;
    v2: THREE.Vector3;
}

/**
 * Convert lat/lon coordinates to spherical 3D coordinates
 */
function latLonToSphere(x: number, y: number, radius: number): THREE.Vector3 {
    const a = (-x / 180) * Math.PI;
    const t = (y / 180) * Math.PI;
    const sphereY = Math.sin(t) * radius;
    const sphereX = Math.cos(a) * radius * Math.cos(t);
    const sphereZ = Math.sin(a) * radius * Math.cos(t);
    return new THREE.Vector3(sphereX, sphereY, sphereZ);
}

/**
 * Project a 3D point onto the sphere surface at the given radius
 */
function projectToSphere(point: THREE.Vector3, radius: number): void {
    const length = point.length();
    if (length === 0) point.set(0, radius, 0);
    point.multiplyScalar(radius / length);
}

/**
 * Get the center of a triangle
 */
function getTriangleCenter(tri: Triangle): THREE.Vector3 {
    return new THREE.Vector3()
        .add(tri.v0)
        .add(tri.v1)
        .add(tri.v2)
        .divideScalar(3);
}

function subdivideEdges(
    points: THREE.Vector3[],
    innerRadius: number,
    outerRadius: number
): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];

        const edgeCenter = new THREE.Vector3()
            .add(p0)
            .add(p1)
            .divideScalar(2);
        const distanceToCenter = edgeCenter.length();

        if (distanceToCenter < innerRadius) {
            // Project edge center to the outer radius
            projectToSphere(edgeCenter, outerRadius);
            const subdivided = subdivideEdges([p0, edgeCenter, p1], innerRadius, outerRadius);
            result.push(...subdivided.slice(0, -1)); // Exclude last point to avoid duplicates
        } else {
            result.push(p0);
        }
    }

    // Add the last point
    result.push(points[points.length - 1]);

    return result;
}

/**
 * Recursively subdivide triangles that are too close to the sphere center.
 * Triangles whose centers are closer than innerRadius get split into 3 triangles
 * with a new vertex at the center, projected to outerRadius.
 */
function subdivideTriangles(
    triangles: Triangle[],
    innerRadius: number,
    outerRadius: number
): Triangle[] {
    const result: Triangle[] = [];

    for (const tri of triangles) {
        // First, check the edge centers. If an edge center is within innerRadius, we tessellate.
        //
        //       A
        //       /\
        //      /  \
        //  AB /____\ AC
        //    /\    /\
        //   /  \  /  \
        //  /____\/____\
        // B     BC     C

        const abCenter = new THREE.Vector3()
            .add(tri.v0)
            .add(tri.v1)
            .divideScalar(2);
        const acCenter = new THREE.Vector3()
            .add(tri.v0)
            .add(tri.v2)
            .divideScalar(2);
        const bcCenter = new THREE.Vector3()
            .add(tri.v1)
            .add(tri.v2)
            .divideScalar(2);

        const distanceToAB = abCenter.length();
        const distanceToAC = acCenter.length();
        const distanceToBC = bcCenter.length();

        if (
            distanceToAB < innerRadius ||
            distanceToAC < innerRadius ||
            distanceToBC < innerRadius
        ) {
            // Project edge centers to the outer radius
            if (distanceToAB < innerRadius) projectToSphere(abCenter, outerRadius);
            if (distanceToAC < innerRadius) projectToSphere(acCenter, outerRadius);
            if (distanceToBC < innerRadius) projectToSphere(bcCenter, outerRadius);

            // Create 4 new triangles
            const newTri1: Triangle = { v0: tri.v0, v1: abCenter, v2: acCenter };
            const newTri2: Triangle = { v0: tri.v1, v1: bcCenter, v2: abCenter };
            const newTri3: Triangle = { v0: tri.v2, v1: acCenter, v2: bcCenter };
            const newTri4: Triangle = { v0: abCenter, v1: bcCenter, v2: acCenter };

            // Recursively subdivide the new triangles
            const subdivided = subdivideTriangles(
                [newTri1, newTri2, newTri3, newTri4],
                innerRadius,
                outerRadius
            );
            result.push(...subdivided);
            continue;
        }

        // Second, check the triangle center.
        //
        //        A
        //       /|\
        //      / | \
        //     /  |  \
        //    / . M . \
        //   /._______.\
        //  B           C
        const center = getTriangleCenter(tri);
        const distanceToCenter = center.length();

        if (distanceToCenter < innerRadius) {
            // Project the center vertex to the outer radius
            projectToSphere(center, outerRadius);

            // Create 3 new triangles
            const newTri1: Triangle = { v0: tri.v0, v1: tri.v1, v2: center };
            const newTri2: Triangle = { v0: tri.v1, v1: tri.v2, v2: center };
            const newTri3: Triangle = { v0: tri.v2, v1: tri.v0, v2: center };

            // Recursively subdivide the new triangles
            const subdivided = subdivideTriangles([newTri1, newTri2, newTri3], innerRadius, outerRadius);
            result.push(...subdivided);
        } else {
            // Triangle is fine, keep it
            result.push(tri);
        }
    }

    return result;
}

/**
 * Check if a point is inside a polygon
 */
function isPointInPolygon(p: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Triangulate a polygon using a robust method that handles complex shapes (non-convex with holes).
 */
function triangulatePolygon(contour: THREE.Vector2[], holes: THREE.Vector2[][] = []): Triangle[] {
    if (contour.length < 3) return [];

    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const triangles: Triangle[] = [];

    const allPoints = [...contour];
    for (const hole of holes) {
        allPoints.push(...hole);
    }

    for (const face of faces) {
        triangles.push({
            v0: new THREE.Vector3(allPoints[face[0]].x, allPoints[face[0]].y, 0),
            v1: new THREE.Vector3(allPoints[face[1]].x, allPoints[face[1]].y, 0),
            v2: new THREE.Vector3(allPoints[face[2]].x, allPoints[face[2]].y, 0),
        });
    }

    return triangles;
}

/**
 * Convert triangles to a THREE.BufferGeometry
 */
function trianglesToGeometry(triangles: Triangle[]): THREE.BufferGeometry {
    const positions: number[] = [];

    for (const tri of triangles) {
        positions.push(tri.v0.x, tri.v0.y, tri.v0.z);
        positions.push(tri.v1.x, tri.v1.y, tri.v1.z);
        positions.push(tri.v2.x, tri.v2.y, tri.v2.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Loader for creating THREE.js models from parsed Shapefiles
 */
export class SHPLoader {
    /**
     * Create a THREE.js model from parsed shapefile data
     * 
     * @param shp - Parsed shapefile data
     * @param options - Loader options
     * @returns THREE.js Group containing the shapefile geometry
     */
    createModel(shp: ShapefileData, options: SHPLoaderOptions = {}): THREE.Group {
        const opts = { ...defaultOptions, ...options };
        const polys: THREE.BufferGeometry[] = [];
        const lines: THREE.BufferGeometry[] = [];

        for (let i = 0; i < shp.records.length; i++) {
            const r = shp.records[i].shape;
            if (r.type === ShapeType.POLYLINE || r.type === ShapeType.POLYGON) {
                const content = r.content as PolyContent;
                const points = content.points;
                const parts = content.parts;

                // Collect all rings for this record
                const rings: { points: THREE.Vector2[], isHole: boolean }[] = [];

                for (let k = 0; k < parts.length; k++) {
                    const start = parts[k];
                    const end = parts[k + 1] ?? points.length / 2;
                    const ringPoints: THREE.Vector2[] = [];
                    let linePoints: THREE.Vector3[] = [];

                    for (let j = start; j < end; j++) {
                        const x = points[j * 2];
                        const y = points[j * 2 + 1];
                        ringPoints.push(new THREE.Vector2(x, y));

                        if (opts.spherize) {
                            linePoints.push(latLonToSphere(x, y, opts.linesOuterRadius));
                        } else {
                            linePoints.push(new THREE.Vector3(x, y, 0));
                        }
                    }
                    if (opts.spherize && linePoints.length > 0) {
                        linePoints = subdivideEdges(linePoints, opts.linesInnerRadius, opts.linesOuterRadius);
                    }

                    // Create line geometry using BufferGeometry (modern THREE.js)
                    const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
                    lines.push(geo);

                    if (r.type === ShapeType.POLYGON) {
                        // Shapefile spec: Outer rings are CW, Inner rings (holes) are CCW.
                        // THREE.ShapeUtils.area(): Positive for CCW, Negative for CW.
                        // So Area > 0 means CCW (Hole), Area < 0 means CW (Outer).
                        const area = THREE.ShapeUtils.area(ringPoints);
                        rings.push({ points: ringPoints, isHole: area > 0 });
                    }
                }

                // For polygons with spherize, create subdivided mesh geometry handling holes
                if (r.type === ShapeType.POLYGON && opts.spherize && rings.length > 0) {
                    const outerRings = rings.filter(r => !r.isHole);
                    const holes = rings.filter(r => r.isHole);

                    for (const outer of outerRings) {
                        const myHoles: THREE.Vector2[][] = [];

                        // Find holes belonging to this outer ring
                        for (const hole of holes) {
                            // Check if the first point of the hole is inside the outer ring
                            if (hole.points.length > 0 && isPointInPolygon(hole.points[0], outer.points)) {
                                myHoles.push(hole.points);
                            }
                        }

                        // Triangulate the polygon with holes
                        let triangles = triangulatePolygon(outer.points, myHoles);

                        // Map vertices to sphere
                        triangles = triangles.map(t => ({
                            v0: latLonToSphere(t.v0.x, t.v0.y, opts.outerRadius),
                            v1: latLonToSphere(t.v1.x, t.v1.y, opts.outerRadius),
                            v2: latLonToSphere(t.v2.x, t.v2.y, opts.outerRadius),
                        }));

                        // Recursively subdivide triangles that are too close to sphere center
                        triangles = subdivideTriangles(triangles, opts.innerRadius, opts.outerRadius);

                        // Convert to buffer geometry
                        const meshGeo = trianglesToGeometry(triangles);
                        polys.push(meshGeo);
                    }
                }
            }
        }

        const model = new THREE.Group();

        // Create line material
        const lineMaterial = opts.lineMaterial || new THREE.LineBasicMaterial({
            color: opts.lineColor,
            opacity: opts.lineOpacity,
            transparent: opts.lineOpacity < 1,
            linewidth: opts.lineWidth,
        });

        for (const lineGeo of lines) {
            model.add(new THREE.Line(lineGeo, lineMaterial));
        }

        // Create mesh material for polygons
        const meshMaterial = opts.meshMaterial || new THREE.MeshBasicMaterial({
            color: opts.meshColor,
            opacity: opts.meshOpacity,
            transparent: opts.meshOpacity < 1,
            side: THREE.DoubleSide,
            wireframe: opts.wireframe,
        });

        for (const polyGeo of polys) {
            model.add(new THREE.Mesh(polyGeo, meshMaterial));
        }

        return model;
    }
}

// Re-export everything from the main module for convenience
export * from './index';
