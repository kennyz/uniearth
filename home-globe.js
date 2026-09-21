/* Accurate rotating homepage globe: Natural Earth 50m boundaries on a WebGL sphere. */
(function () {
  'use strict';

  var canvas = document.querySelector('.planet-globe');
  if (!canvas || !window.fetch) return;

  var gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: true
  });
  if (!gl) return;

  var VERTEX_SHADER = [
    'attribute vec3 a_position;',
    'attribute vec2 a_uv;',
    'uniform float u_rotation;',
    'uniform float u_tilt;',
    'varying vec2 v_uv;',
    'varying float v_light;',
    'void main() {',
    '  float cr = cos(u_rotation), sr = sin(u_rotation);',
    '  vec3 spun = vec3(cr * a_position.x + sr * a_position.z, a_position.y, -sr * a_position.x + cr * a_position.z);',
    '  float ct = cos(u_tilt), st = sin(u_tilt);',
    '  vec3 p = vec3(ct * spun.x - st * spun.y, st * spun.x + ct * spun.y, spun.z);',
    '  vec3 lightDirection = normalize(vec3(-0.45, 0.62, 1.0));',
    '  v_light = 0.55 + 0.45 * max(dot(normalize(p), lightDirection), 0.0);',
    '  v_uv = a_uv;',
    '  gl_Position = vec4(p.x * 0.75, p.y * 0.75, -p.z * 0.48, 1.0);',
    '}'
  ].join('\n');

  var FRAGMENT_SHADER = [
    'precision mediump float;',
    'uniform sampler2D u_map;',
    'varying vec2 v_uv;',
    'varying float v_light;',
    'void main() {',
    '  vec4 mapColor = texture2D(u_map, v_uv);',
    '  vec3 lit = mapColor.rgb * v_light;',
    '  gl_FragColor = vec4(lit, mapColor.a);',
    '}'
  ].join('\n');

  function shader(type, source) {
    var value = gl.createShader(type);
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      console.warn('UniEarth globe shader:', gl.getShaderInfoLog(value));
      gl.deleteShader(value);
      return null;
    }
    return value;
  }

  function program() {
    var vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
    var fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) return null;
    var value = gl.createProgram();
    gl.attachShader(value, vertex);
    gl.attachShader(value, fragment);
    gl.linkProgram(value);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      console.warn('UniEarth globe program:', gl.getProgramInfoLog(value));
      return null;
    }
    return value;
  }

  function decodeTopology(topology) {
    var transform = topology.transform;
    var arcs = topology.arcs.map(function (arc) {
      var x = 0, y = 0;
      return arc.map(function (point) {
        x += point[0];
        y += point[1];
        return [
          x * transform.scale[0] + transform.translate[0],
          y * transform.scale[1] + transform.translate[1]
        ];
      });
    });

    function ring(indices) {
      var output = [];
      indices.forEach(function (index) {
        var source = index >= 0 ? arcs[index] : arcs[~index].slice().reverse();
        output = output.concat(output.length ? source.slice(1) : source);
      });
      return output;
    }

    var polygons = [];
    topology.objects.countries.geometries.forEach(function (geometry) {
      var source = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
      source.forEach(function (polygon) {
        polygons.push(polygon.map(ring));
      });
    });
    return polygons;
  }

  function unwrap(points) {
    if (!points.length) return points;
    var result = [[points[0][0], points[0][1]]];
    var previous = points[0][0];
    for (var i = 1; i < points.length; i += 1) {
      var longitude = points[i][0];
      while (longitude - previous > 180) longitude -= 360;
      while (longitude - previous < -180) longitude += 360;
      result.push([longitude, points[i][1]]);
      previous = longitude;
    }
    return result;
  }

  function traceRing(context, ring, shift, width, height) {
    var points = unwrap(ring);
    if (!points.length) return;
    context.moveTo((points[0][0] + shift + 180) / 360 * width, (90 - points[0][1]) / 180 * height);
    for (var i = 1; i < points.length; i += 1) {
      context.lineTo((points[i][0] + shift + 180) / 360 * width, (90 - points[i][1]) / 180 * height);
    }
    context.closePath();
  }

  function makeTexture(polygons) {
    var textureCanvas = document.createElement('canvas');
    textureCanvas.width = 2048;
    textureCanvas.height = 1024;
    var context = textureCanvas.getContext('2d');
    var width = textureCanvas.width, height = textureCanvas.height;

    var ocean = context.createLinearGradient(0, 0, width, height);
    ocean.addColorStop(0, '#183872');
    ocean.addColorStop(0.52, '#102753');
    ocean.addColorStop(1, '#07142f');
    context.fillStyle = ocean;
    context.fillRect(0, 0, width, height);

    context.beginPath();
    for (var longitude = -150; longitude <= 150; longitude += 30) {
      var gridX = (longitude + 180) / 360 * width;
      context.moveTo(gridX, 0);
      context.lineTo(gridX, height);
    }
    for (var latitude = -60; latitude <= 60; latitude += 30) {
      var gridY = (90 - latitude) / 180 * height;
      context.moveTo(0, gridY);
      context.lineTo(width, gridY);
    }
    context.strokeStyle = 'rgba(145,186,255,.105)';
    context.lineWidth = 0.8;
    context.stroke();

    var land = context.createLinearGradient(width * 0.1, 0, width * 0.9, height);
    land.addColorStop(0, '#7699d8');
    land.addColorStop(0.55, '#42679f');
    land.addColorStop(1, '#263f72');

    var dotTile = document.createElement('canvas');
    dotTile.width = dotTile.height = 8;
    var dots = dotTile.getContext('2d');
    dots.fillStyle = 'rgba(201,220,255,.42)';
    dots.beginPath();
    dots.arc(4, 4, 1, 0, Math.PI * 2);
    dots.fill();
    var pattern = context.createPattern(dotTile, 'repeat');

    polygons.forEach(function (polygon) {
      [-720, -360, 0, 360, 720].forEach(function (shift) {
        context.beginPath();
        polygon.forEach(function (ring) { traceRing(context, ring, shift, width, height); });
        context.fillStyle = land;
        context.fill('evenodd');
        context.fillStyle = pattern;
        context.globalAlpha = 0.58;
        context.fill('evenodd');
        context.globalAlpha = 1;
        context.strokeStyle = 'rgba(170,202,248,.28)';
        context.lineWidth = 0.75;
        context.stroke();
      });
    });
    return textureCanvas;
  }

  function makeMesh(latitudeSteps, longitudeSteps) {
    var positions = [], uvs = [], indices = [];
    for (var latitudeIndex = 0; latitudeIndex <= latitudeSteps; latitudeIndex += 1) {
      var latitude = -Math.PI / 2 + latitudeIndex / latitudeSteps * Math.PI;
      var cosLatitude = Math.cos(latitude);
      for (var longitudeIndex = 0; longitudeIndex <= longitudeSteps; longitudeIndex += 1) {
        var longitude = -Math.PI + longitudeIndex / longitudeSteps * Math.PI * 2;
        positions.push(cosLatitude * Math.sin(longitude), Math.sin(latitude), cosLatitude * Math.cos(longitude));
        uvs.push(longitudeIndex / longitudeSteps, latitudeIndex / latitudeSteps);
      }
    }
    for (var y = 0; y < latitudeSteps; y += 1) {
      for (var x = 0; x < longitudeSteps; x += 1) {
        var first = y * (longitudeSteps + 1) + x;
        var second = first + longitudeSteps + 1;
        indices.push(first, first + 1, second, second, first + 1, second + 1);
      }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
  }

  function buffer(data, target) {
    var value = gl.createBuffer();
    gl.bindBuffer(target, value);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return value;
  }

  function start(topology) {
    var globeProgram = program();
    if (!globeProgram) return;
    var polygons = decodeTopology(topology);
    var textureCanvas = makeTexture(polygons);
    var mesh = makeMesh(56, 112);
    var positionBuffer = buffer(mesh.positions, gl.ARRAY_BUFFER);
    var uvBuffer = buffer(mesh.uvs, gl.ARRAY_BUFFER);
    buffer(mesh.indices, gl.ELEMENT_ARRAY_BUFFER);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.useProgram(globeProgram);
    var positionLocation = gl.getAttribLocation(globeProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    var uvLocation = gl.getAttribLocation(globeProgram, 'a_uv');
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(globeProgram, 'u_map'), 0);

    var rotationLocation = gl.getUniformLocation(globeProgram, 'u_rotation');
    var tiltLocation = gl.getUniformLocation(globeProgram, 'u_tilt');
    gl.uniform1f(tiltLocation, -8 * Math.PI / 180);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0, 0, 0, 0);

    function resize() {
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      var width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      var height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    var startTime = performance.now();
    var initialRotation = -93 * Math.PI / 180;
    var cycle = 96000;
    function draw(now) {
      resize();
      var progress = reducedMotion && reducedMotion.matches ? 0 : ((now - startTime) % cycle) / cycle;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(rotationLocation, initialRotation - progress * Math.PI * 2);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      if (!(reducedMotion && reducedMotion.matches) && !document.hidden) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !(reducedMotion && reducedMotion.matches)) {
        startTime = performance.now();
        requestAnimationFrame(draw);
      }
    });
  }

  fetch('countries-50m.json')
    .then(function (response) {
      if (!response.ok) throw new Error('Natural Earth data unavailable');
      return response.json();
    })
    .then(start)
    .catch(function (error) {
      console.warn('UniEarth globe fallback:', error.message);
    });
}());
