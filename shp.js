// Shapefile parser, following the specification at
// http://www.esri.com/library/whitepapers/pdfs/shapefile.pdf
SHP = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5
};

SHP.getShapeName = function(id) {
  for (name in this) {
    if (id === this[name]) {
      return name;
    }
  }
};

SHPParser = function() {
};

SHPParser.load = function(src, callback, onerror) {
  var xhr = new XMLHttpRequest();
  xhr.responseType = 'arraybuffer';
  xhr.onload = function() {
    console.log(xhr.response);
    var d = new SHPParser().parse(xhr.response);
    callback(d);
  };
  xhr.onerror = onerror;
  xhr.open('GET', src);
  xhr.send(null);
};

SHPParser.prototype.parse = function(arrayBuffer) {
  var o = {};
  var dv = new DataView(arrayBuffer);
  var idx = 0;
  o.fileCode = dv.getInt32(idx, false);
  if (o.fileCode != 0x0000270a) {
    throw (new Error("Unknown file code: " + o.fileCode));
  }
  idx += 6*4;
  o.wordLength = dv.getInt32(idx, false);
  o.byteLength = o.wordLength * 2;
  idx += 4;
  o.version = dv.getInt32(idx, true);
  idx += 4;
  o.shapeType = dv.getInt32(idx, true);
  idx += 4;
  o.minX = dv.getFloat64(idx, true);
  o.minY = dv.getFloat64(idx+8, true);
  o.maxX = dv.getFloat64(idx+16, true);
  o.maxY = dv.getFloat64(idx+24, true);
  o.minZ = dv.getFloat64(idx+32, true);
  o.maxZ = dv.getFloat64(idx+40, true);
  o.minM = dv.getFloat64(idx+48, true);
  o.maxM = dv.getFloat64(idx+56, true);
  idx += 8*8;
  o.records = [];
  while (idx < o.byteLength) {
    var record = {};
    record.number = dv.getInt32(idx, false);
    idx += 4;
    record.length = dv.getInt32(idx, false);
    idx += 4;
    try {
      record.shape = this.parseShape(dv, idx, record.length);
    } catch(e) {
      console.log(e, record);
    }
    idx += record.length * 2;
    o.records.push(record);
  }
  return o;
};

SHPParser.prototype.parseShape = function(dv, idx, length) {
  var i=0, c=null;
  var shape = {};
  shape.type = dv.getInt32(idx, true);
  idx += 4;
  var byteLen = length * 2;
  switch (shape.type) {
    case SHP.NULL: // Null
      break;

    case SHP.POINT: // Point (x,y)
      shape.content = {
        x: dv.getFloat64(idx, true),
        y: dv.getFloat64(idx+8, true)
      };
      break;
    case SHP.POLYLINE: // Polyline (MBR, partCount, pointCount, parts, points)
    case SHP.POLYGON: // Polygon (MBR, partCount, pointCount, parts, points)
      c = shape.content = {
        minX: dv.getFloat64(idx, true),
        minY: dv.getFloat64(idx+8, true),
        maxX: dv.getFloat64(idx+16, true),
        maxY: dv.getFloat64(idx+24, true),
        parts: new Int32Array(dv.getInt32(idx+32, true)),
        points: new Float64Array(dv.getInt32(idx+36, true)*2)
      };
      idx += 40;
      for (i=0; i<c.parts.length; i++) {
        c.parts[i] = dv.getInt32(idx, true);
        idx += 4;
      }
      for (i=0; i<c.points.length; i++) {
        c.points[i] = dv.getFloat64(idx, true);
        idx += 8;
      }
      break;

    case 8: // MultiPoint (MBR, pointCount, points)
    case 11: // PointZ (X, Y, Z, M)
    case 13: // PolylineZ
    case 15: // PolygonZ
    case 18: // MultiPointZ
    case 21: // PointM (X, Y, M)
    case 23: // PolylineM
    case 25: // PolygonM
    case 28: // MultiPointM
    case 31: // MultiPatch
      throw new Error("Shape type not supported: "
                      + shape.type + ':' +
                      + SHP.getShapeName(shape.type));
    default:
      throw new Error("Unknown shape type at " + (idx-4) + ': ' + shape.type);
  }
  return shape;
};

THREE.SHPLoader = function() {};

var p = THREE.SHPLoader.prototype;

p.createModel = function(shp, spherize) {
  var polys = [];
  var lines = [];
  for (var i=0; i<shp.records.length; i++) {
    var r = shp.records[i].shape;
    if (r.type === SHP.POLYLINE || r.type === SHP.POLYGON) {
      var points = r.content.points;
      var parts = r.content.parts;
      var poly = [];
      for (var k=0; k<parts.length; k++) {
        poly = [];
        for (var j=parts[k], last=parts[k+1]||(points.length/2); j<last; j++) {
          var x = points[j*2];
          var y = points[j*2+1];
          if (spherize) {
            var a = -x/180*Math.PI;
            var t = y/180*Math.PI;
            y = Math.sin(t) * 90;
            x = Math.cos(a) * 90 * Math.cos(t);
            var z = Math.sin(a) * 90 * Math.cos(t);
            poly.push(new THREE.Vector3(x, y, z));
          } else {
            poly.push(new THREE.Vector3(x, y, 0));
          }
        }
        if (false && r.type == SHP.POLYGON) {
          //console.log('new polygon', poly.length, points.length/2);
          polys.push(new THREE.ExtrudeGeometry(new THREE.Shape(poly), {amount: 0}));
        } else {
          //console.log('new polyline', poly.length, points.length/2);
          var geo = new THREE.Geometry();
          geo.vertices = poly;
          lines.push(geo);
        }
      }
    }
  }
  var model = new THREE.Object3D();
  for (var i=0; i<lines.length; i++) {
    model.add(new THREE.Line(
      lines[i],
      new THREE.LineBasicMaterial({color: 'black', lineWidth: 2}),
      THREE.LineStrip
    ));
  }
  for (var i=0; i<polys.length; i++) {
    model.add(new THREE.Mesh(
      polys[i],
      new THREE.MeshBasicMaterial({color: 0x88ff44, wireframe: true})
    ));
  }
  console.log('parsed', polys.length, lines.length);
  return model;
};

p.loadCompressed = function(deltaEncoded, spherize) {
  var compressed = this.deltaDecode6(deltaEncoded);
  var polys = [];
  var lines = [];
  var poly = [];
  for (var i=0; i<compressed.length; i++) {
    if (compressed[i] === -32768) {
      // var geo = new THREE.Geometry();
      // geo.vertices
      var shape = new THREE.Shape(poly);
      var geo = shape.extrude({amount: 0.001, bevelThickness: 0.001, bevelSize: 0.001, bevelEnabled: false, curveSegments: 1});
      if (false && spherize) {
        var k;
        var verts = [];
        var vs = geo.vertices;
        for (k=0; k<geo.faces.length; k++) {
          var f = geo.faces[k];
          verts.push(vs[f.a], vs[f.b], vs[f.c]);
        }
        geo = new THREE.Geometry();
        geo.vertices = verts;
        for (k=0; k<verts.length; k+=3) {
          geo.faces.push(new THREE.Face3(k, k+1, k+2));
        }
        for (k=0; k<geo.vertices.length; k++) {
          var v = geo.vertices[k];
          var a = -v.x/180*Math.PI;
          var t = v.y/180*Math.PI;
          v.y = Math.sin(t) * 90;
          v.x = Math.cos(a) * 90 * Math.cos(t);
          v.z = Math.sin(a) * 90 * Math.cos(t);
        }
      }
      polys.push(geo);
      poly = [];
      continue;
    }
    var x = compressed[i] * 180 / 32767;
    var y = compressed[i+1] * 180 / 32767;
    i++;
    poly.push(new THREE.Vector3(x, y, 0));
  }
  var model = new THREE.Object3D();
  for (var i=0; i<lines.length; i++) {
    model.add(new THREE.Line(
      lines[i],
      new THREE.LineBasicMaterial({color: 0xFF0000, lineWidth: 2}),
      THREE.LineStrip
    ));
  }
  for (var i=0; i<polys.length; i++) {
    model.add(new THREE.Mesh(
      polys[i],
      new THREE.MeshBasicMaterial({color: 0x88ff44})
    ));
  }
  console.log('parsed compressed', polys.length, lines.length);
  return model;
};

p.compress = function(shp) {
  var polys = [];
  for (var i=0; i<shp.records.length; i++) {
    var r = shp.records[i].shape;
    if (r.type === SHP.POLYGON) {
      var points = r.content.points;
      var parts = r.content.parts;
      for (var k=0; k<parts.length; k++) {
        for (var j=parts[k], last=parts[k+1]||(points.length/2); j<last; j++) {
          var x = points[j*2];
          var y = points[j*2+1];
          polys.push(x / 180 * 32767, y / 180 * 32767);
        }
        polys.push(-32768);
      }
    }
  }
  var i16a = new Int16Array(polys);
  console.log('16-bit quantized byteLength', i16a.buffer.byteLength);
  var denc = this.deltaEncode6(i16a);
  console.log('delta-encoded byteLength', denc.byteLength);
  return denc;
};

p.deltaEncode = function(arr) {
  var polys = [];
  var spans = [];
  var span = [];
  var x = 0, y = 0;
  var byteLen = 0;
  for (var i=0; i<arr.length; i++) {
    if (arr[i] == -32768) {
      spans.push(span);
      polys.push(spans);
      spans = [];
      span = [];
      byteLen += 3;
      continue;
    }
    if (span.length == 0) {
      x = arr[i], y = arr[i+1];
      span.push(x, y);
      byteLen += 4;
      i++;
    } else if (Math.abs(x - arr[i]) > 1023 || Math.abs(y - arr[i+1]) > 1023) {
      spans.push(span);
      byteLen += 1;
      span = [];
      x = arr[i], y = arr[i+1];
      span.push(x, y);
      byteLen += 4;
      i++;
    } else {
      span.push((arr[i] - x) / 8, (arr[i+1] - y) / 8);
      x += (((arr[i] - x) / 8) | 0) * 8;
      y += (((arr[i+1] - y) / 8) | 0) * 8;
      byteLen += 2;
      i++;
    }
  }
  return this.storeDeltas(byteLen, polys);
};

p.deltaEncode6 = function(arr) {
  var polys = [];
  var spans = [];
  var span = [];
  var x = 0, y = 0, i=0;
  var byteLen = 0;
  for (i=0; i<arr.length; i++) {
    arr[i] = 0 | (arr[i] / 16);
  }
  for (i=0; i<arr.length; i++) {
    if (arr[i] === -2048) {
      spans.push(span);
      polys.push(spans);
      spans = [];
      span = [];
      byteLen += 3;
      continue;
    }
    if (span.length == 0) {
      x = arr[i], y = arr[i+1];
      span.push(x, y);
      byteLen += 4;
      i++;
    } else if (Math.abs(x - arr[i]) > 31 || Math.abs(y - arr[i+1]) > 31) {
      spans.push(span);
      byteLen += 1;
      span = [];
      x = arr[i], y = arr[i+1];
      span.push(x, y);
      byteLen += 4;
      i++;
    } else {
      span.push((arr[i] - x), (arr[i+1] - y));
      x += (arr[i] - x);
      y += (arr[i+1] - y);
      byteLen += 2;
      i++;
    }
  }
  return this.storeDeltas6(byteLen, polys);
};

p.storeDeltas = function(byteLen, polys) { 
  var buf = new ArrayBuffer(byteLen);
  var dv = new DataView(buf);
  var idx = 0;
  for (var i=0; i<polys.length; i++) {
    var spans = polys[i];
    for (var j=0; j<spans.length; j++) {
      var span = spans[j];
      dv.setInt16(idx, span[0]);
      idx += 2;
      dv.setInt16(idx, span[1]);
      idx += 2;
      for (var k=2; k<span.length; k++) {
        dv.setInt8(idx++, span[k]);
      }
      dv.setInt8(idx, -128);
      idx += 1;
    }
    dv.setInt16(idx, -32768);
    idx += 2;
  }
  return buf;
};

p.deltaDecode = function(buf) {
  var dv = new DataView(buf);
  var idx = 0;
  var polys = [];
  while (idx < buf.byteLength) {
    var x = dv.getInt16(idx);
    idx += 2;
    if (x === -32768) {
      polys.push(-32768);
      continue;
    }
    var y = dv.getInt16(idx);
    idx += 2;
    polys.push(x, y);
    while (idx < buf.byteLength) {
      var dx = dv.getInt8(idx);
      idx++;
      if (dx == -128) {
        break;
      }
      var dy = dv.getInt8(idx);
      idx++;
      x += dx * 8;
      y += dy * 8;
      polys.push(x, y);
    }
  }
  return polys;
};


p.storeDeltas6 = function(byteLen, polys) { 
  var buf = new ArrayBuffer(Math.ceil(byteLen * 0.75)+4);
  var dv = new BitView(buf);
  var idx = 32;
  for (var i=0; i<polys.length; i++) {
    var spans = polys[i];
    for (var j=0; j<spans.length; j++) {
      var span = spans[j];
      dv.setInt12(idx, span[0]);
      idx += 12;
      dv.setInt12(idx, span[1]);
      idx += 12;
      for (var k=2; k<span.length; k++) {
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
};

p.deltaDecode6 = function(buf) {
  var bitLength = new DataView(buf).getUint32(0);
  var dv = new BitView(buf);
  var idx = 32;
  var polys = [];
  while (idx < bitLength) {
    var x = dv.getInt12(idx);
    idx += 12;
    if (x === -2048) {
      polys.push(-2048);
      continue;
    }
    var y = dv.getInt12(idx);
    idx += 12;
    polys.push(x, y);
    while (idx < bitLength) {
      var dx = dv.getInt6(idx);
      idx += 6;
      if (dx === -32) {
        break;
      }
      var dy = dv.getInt6(idx);
      idx += 6;
      x += dx;
      y += dy;
      polys.push(x, y);
    }
  }
  for (var i=0; i<polys.length; i++) {
    polys[i] *= 16;
  }
  return polys;
};
