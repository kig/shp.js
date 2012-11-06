// Three.js extensions for SHP parser.
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
          poly.pop();
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
      var p = [];
      for (var h=1; h<poly.length; h++) {
        if (!(poly[h-1].x == poly[h].x && poly[h-1].y == poly[h].y)) {
          p.push(poly[h]);
        }
      }
      var shape = new THREE.Shape(p);
      var geo = shape.extrude({amount: 0.001, bevelThickness: 0.001, bevelSize: 0.001, bevelEnabled: false, curveSegments: 1});
      if (spherize) {
        var k;
        /*
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
        */
        for (k=0; k<geo.vertices.length; k++) {
          var v = geo.vertices[k];
          var a = -v.x/180*Math.PI;
          var t = v.y/180*Math.PI;
          v.y = Math.sin(t);
          v.x = Math.cos(a) * Math.cos(t);
          v.z = Math.sin(a) * Math.cos(t);
        }
        for (k=0; k<geo.vertices.length; k++) {
          geo.vertices[k].setLength(90);
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
