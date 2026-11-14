globalThis.PhotoFlowEffects = Object.freeze({
  modes: Object.freeze(['smear','swirl','bulge','disperse','paint','water','smoke','particle','fragment','wind','dissolve','glitch','mirror','pointcloud']),
  videoModes: Object.freeze(['smear','swirl','bulge','disperse','paint','water','smoke','glitch','mirror']),
  shader: `#version 300 es
    precision highp float;
    uniform sampler2D uImage;
    uniform sampler2D uStrokeImage;
    uniform sampler2D uBrushMask;
    uniform int uUseBrushMask;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform vec2 uDelta;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uSeed;
    uniform float uStrokeSeed;
    uniform vec2 uDirection;
    uniform int uMode;
    uniform int uGlow;
    out vec4 fragColor;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
    float noise(vec2 p) {
      vec2 cell = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
                 mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), f.x), f.y);
    }
    float waterHeight(vec2 p) {
      vec2 q = p * 0.018 + vec2(uStrokeSeed * 0.17, uStrokeSeed * 0.11);
      float flow = noise(q * 0.9 + vec2(uSeed * 0.008, -uSeed * 0.006));
      float broad = noise(q * 1.8 + vec2(flow * 1.7, -flow * 0.9));
      float fine = noise(q * 4.0 - vec2(flow * 0.7));
      float wave = sin(dot(p, vec2(0.04, 0.023)) + flow * 5.0 - uSeed * 0.09);
      return broad * 0.7 + fine * 0.2 + wave * 0.18;
    }
    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 diff = p - uCenter;
      float d = length(diff);
      float falloff = pow(max(0.0, 1.0 - d / max(1.0, uRadius)), 1.7);
      if (uUseBrushMask == 1) {
        vec2 maskUV = diff / (2.0 * max(1.0, uRadius)) + 0.5;
        float inside = step(0.0, maskUV.x) * step(maskUV.x, 1.0) * step(0.0, maskUV.y) * step(maskUV.y, 1.0);
        falloff = inside * texture(uBrushMask, clamp(maskUV, vec2(0.0), vec2(1.0))).a;
      }
      vec2 source = p;
      if (uMode == 0) {
        source -= uDelta * falloff * uStrength * 1.6;
      } else if (uMode == 1) {
        float angle = -uStrength * falloff * (0.35 + min(length(uDelta) / 30.0, 1.5));
        float c = cos(angle), s = sin(angle);
        source = uCenter + mat2(c, -s, s, c) * diff;
      } else if (uMode == 2) {
        source = uCenter + diff * (1.0 - 0.42 * uStrength * falloff);
      } else if (uMode == 3) {
        vec2 cell = floor(p / 4.0);
        vec2 jitter = vec2(hash(cell + uSeed), hash(cell.yx + uSeed * 1.37)) * 2.0 - 1.0;
        source -= (uDelta * 0.8 + jitter * uRadius * 0.22) * falloff * uStrength;
      } else if (uMode == 4) {
        vec2 axis = normalize(uDirection);
        vec2 side = vec2(-axis.y, axis.x);
        vec2 texturePoint = p + vec2(uStrokeSeed * 23.7, uStrokeSeed * 11.3);
        float broad = noise(texturePoint * 0.025);
        float fine = noise(texturePoint * 0.16);
        float edge = falloff + (broad - 0.5) * 0.42 + (fine - 0.5) * 0.14;
        float coverage = smoothstep(0.035, 0.28, edge);
        float ribbons = sin(dot(diff, side) * 0.12 + broad * 3.0);
        float ribbonMask = smoothstep(-0.65, 0.35, ribbons);
        float shards = noise(texturePoint * 0.09 + broad * 2.0);
        float streaks = noise(vec2(dot(texturePoint, side) * 0.08, dot(texturePoint, axis) * 0.012));
        float brokenEdge = smoothstep(0.02, 0.18, falloff) * (1.0 - smoothstep(0.2, 0.55, falloff));
        coverage = max(coverage * smoothstep(0.18, 0.42, shards), brokenEdge * smoothstep(0.65, 0.83, shards) * 0.85);
        coverage *= mix(0.5, 1.0, ribbonMask) * mix(0.35, 1.0, streaks);
        float pull = (length(uDelta) * 3.0 + uRadius * 0.1) * uStrength * coverage;
        vec2 pulledPoint = p - axis * pull - side * (broad - 0.5) * uRadius * 0.12 * uStrength;
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        vec4 dragged = texture(uStrokeImage, clamp(pulledPoint / uResolution, vec2(0.0), vec2(1.0)));
        float flecks = smoothstep(0.78, 0.9, fine) * coverage * uStrength * 0.25;
        fragColor = mix(base, dragged, clamp(coverage * uStrength * 1.45 + flecks, 0.0, 1.0));
        return;
      } else if (uMode == 5) {
        vec2 gradient = vec2(
          waterHeight(p + vec2(2.0, 0.0)) - waterHeight(p - vec2(2.0, 0.0)),
          waterHeight(p + vec2(0.0, 2.0)) - waterHeight(p - vec2(0.0, 2.0))
        );
        vec2 warp = (gradient * uRadius * 0.22 + uDelta * 0.65) * uStrength * falloff;
        vec2 refracted = clamp((p - warp) / uResolution, vec2(0.0), vec2(1.0));
        vec2 fringe = normalize(gradient + vec2(0.0001)) * min(length(gradient) * 10.0, 2.5) * uStrength * falloff / uResolution;
        vec4 color = texture(uImage, refracted);
        color.r = texture(uImage, clamp(refracted + fringe, vec2(0.0), vec2(1.0))).r;
        color.b = texture(uImage, clamp(refracted - fringe, vec2(0.0), vec2(1.0))).b;
        float glint = smoothstep(0.75, 1.05, waterHeight(p)) * falloff * uStrength * 0.04;
        fragColor = vec4(min(color.rgb + vec3(glint * 0.8, glint, glint * 1.2), vec3(1.0)), color.a);
        return;
      } else if (uMode == 6) {
        vec2 axis = normalize(uDirection);
        vec2 side = vec2(-axis.y, axis.x);
        vec2 q = p * 0.027 + vec2(uStrokeSeed * 0.19, uSeed * 0.015);
        float curl = noise(q * 0.8);
        float tendril = sin(dot(diff, side) * 0.12 + curl * 7.0 + dot(diff, axis) * 0.025);
        float thinTendril = sin(dot(diff, side) * 0.23 - curl * 9.0 + dot(diff, axis) * 0.04);
        float filaments = max(smoothstep(0.58, 0.95, tendril * 0.5 + 0.5), smoothstep(0.75, 0.98, thinTendril * 0.5 + 0.5) * 0.6);
        float gaps = smoothstep(0.22, 0.75, noise(q * 2.3 + curl));
        float haze = noise(q * 1.2 + vec2(3.1, 7.7)) * 0.12;
        float envelope = uUseBrushMask == 1 ? falloff : pow(max(0.0, 1.0 - d / max(1.0, uRadius)), 0.8);
        float density = clamp((filaments * gaps + haze) * envelope * uStrength * 1.35, 0.0, 0.85);
        vec2 pull = axis * (uRadius * 0.4 + length(uDelta) * 1.8) * uStrength * envelope;
        pull += side * (curl - 0.5) * uRadius * 0.24 * envelope;
        vec2 sourceUV = clamp((p - pull) / uResolution, vec2(0.0), vec2(1.0));
        vec3 carried = texture(uStrokeImage, sourceUV).rgb;
        vec3 soft = texture(uStrokeImage, clamp(sourceUV + side * 3.0 / uResolution, vec2(0.0), vec2(1.0))).rgb;
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        fragColor = vec4(mix(base.rgb, mix(carried, soft, 0.35), density), base.a);
        return;
      } else if (uMode == 7 || uMode == 8) {
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        float textureBreak = noise(p * 0.08 + uStrokeSeed * 0.17);
        float fade = uMode == 7 ? 0.34 : 0.7;
        float veil = smoothstep(0.04, 0.5, falloff + (textureBreak - 0.5) * 0.1);
        fragColor = vec4(base.rgb * (1.0 - veil * uStrength * fade), base.a);
        return;
      } else if (uMode == 9) {
        vec2 axis = normalize(uDirection);
        vec2 side = vec2(-axis.y, axis.x);
        float grain = noise(vec2(dot(p, side) * 0.065, dot(p, axis) * 0.011) + uStrokeSeed * 0.13);
        float ribbon = smoothstep(0.18, 0.85, grain);
        float distance = (uRadius * 0.32 + length(uDelta) * 2.5) * uStrength * falloff;
        vec2 shift = side * (grain - 0.5) * uRadius * 0.045 * falloff;
        vec3 trail = vec3(0.0);
        for (int i = 0; i < 4; i++) {
          float t = float(i) / 3.0;
          vec2 samplePoint = p - axis * (distance + t * uRadius * 0.24 * uStrength * falloff) + shift;
          trail += texture(uStrokeImage, clamp(samplePoint / uResolution, vec2(0.0), vec2(1.0))).rgb / 4.0;
        }
        vec2 sourcePoint = p - axis * distance + shift;
        vec2 fringe = side * (1.5 + uRadius * 0.012) * uStrength * falloff;
        vec3 sharp = texture(uStrokeImage, clamp(sourcePoint / uResolution, vec2(0.0), vec2(1.0))).rgb;
        sharp.r = texture(uStrokeImage, clamp((sourcePoint + fringe) / uResolution, vec2(0.0), vec2(1.0))).r;
        sharp.b = texture(uStrokeImage, clamp((sourcePoint - fringe) / uResolution, vec2(0.0), vec2(1.0))).b;
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        float veil = falloff * uStrength * (0.45 + ribbon * 0.35);
        vec3 color = mix(base.rgb, mix(trail, sharp, 0.32), veil);
        if (uGlow == 1) {
          vec3 lightA = texture(uStrokeImage, clamp((sourcePoint + side * 4.0) / uResolution, vec2(0.0), vec2(1.0))).rgb;
          vec3 lightB = texture(uStrokeImage, clamp((sourcePoint - side * 4.0) / uResolution, vec2(0.0), vec2(1.0))).rgb;
          float edge = length(lightA - lightB);
          float halo = smoothstep(0.28, 0.82, luminance(trail)) * (0.16 + smoothstep(0.04, 0.35, edge) * 0.32);
          color = min(color + vec3(1.0, 0.7, 0.38) * halo * falloff * uStrength, vec3(1.0));
        }
        fragColor = vec4(color, base.a);
        return;
      } else if (uMode == 10) {
        vec2 axis = normalize(uDirection);
        vec2 side = vec2(-axis.y, axis.x);
        vec2 q = p + vec2(uStrokeSeed * 19.3, uStrokeSeed * 9.7);
        float broad = noise(q * 0.035);
        float grain = noise(vec2(dot(q, side) * 0.15, dot(q, axis) * 0.035));
        float broken = smoothstep(0.36, 0.65, broad * 0.65 + grain * 0.35);
        float veil = falloff * uStrength * (0.16 + broken * 0.38);
        vec2 dragged = p - axis * (uRadius * 0.1 + length(uDelta) * 1.2) * falloff * uStrength;
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        vec3 carried = texture(uStrokeImage, clamp(dragged / uResolution, vec2(0.0), vec2(1.0))).rgb;
        fragColor = vec4(mix(base.rgb, carried * (1.0 - broken * 0.28), veil), base.a);
        return;
      } else if (uMode == 11) {
        float cellSize = mix(4.0, 12.0, clamp(uRadius / 200.0, 0.0, 1.0));
        vec2 cell = floor(p / cellSize);
        float strip = floor(p.y / (cellSize * 0.7));
        float burst = hash(vec2(floor(cell.x / 3.0), floor(cell.y / 2.0)) + uStrokeSeed * 11.7);
        float line = hash(vec2(strip, uStrokeSeed * 7.3));
        float block = smoothstep(0.53, 0.8, burst);
        float shift = (hash(vec2(strip * 0.37, uStrokeSeed * 3.9)) - 0.5) * uRadius * 0.75;
        shift *= step(0.48, line) * (0.3 + block * 0.7);
        vec2 samplePoint = floor((p - vec2(shift, block * cellSize * 0.9)) / cellSize) * cellSize + cellSize * 0.5;
        vec2 uv = clamp(samplePoint / uResolution, vec2(0.0), vec2(1.0));
        vec3 color = texture(uStrokeImage, uv).rgb;
        float split = cellSize * (0.35 + block * 0.55) * uStrength;
        color.r = texture(uStrokeImage, clamp((samplePoint + vec2(split, 0.0)) / uResolution, vec2(0.0), vec2(1.0))).r;
        color.b = texture(uStrokeImage, clamp((samplePoint - vec2(split, 0.0)) / uResolution, vec2(0.0), vec2(1.0))).b;
        float gap = step(0.86, burst) * step(0.56, line);
        color *= 1.0 - gap * 0.75;
        float accent = step(0.91, hash(cell + uStrokeSeed * 8.1)) * block;
        color = mix(color, vec3(0.25, 0.92, 0.9), accent * 0.28);
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        float coverage = (0.3 + block * 0.7) * falloff * uStrength;
        fragColor = vec4(mix(base.rgb, color, coverage), base.a);
        return;
      } else if (uMode == 12) {
        float paneWidth = max(20.0, uRadius * 0.42);
        float pane = floor((p.x - uCenter.x) / paneWidth + 0.5);
        float paneCenter = uCenter.x + pane * paneWidth;
        float localX = p.x - paneCenter;
        float side = hash(vec2(pane, uStrokeSeed * 0.13)) > 0.5 ? 1.0 : -1.0;
        float reflectedX = paneCenter + side * abs(localX);
        float slowWave = noise(vec2(p.y * 0.018, pane * 2.7 + uStrokeSeed * 0.11));
        float fineWave = noise(vec2(p.y * 0.065, pane * 5.3 - uStrokeSeed * 0.07));
        float bend = (slowWave - 0.5) * uRadius * 0.24 + (fineWave - 0.5) * uRadius * 0.055;
        float ripple = sin(p.y * 0.085 + pane * 2.6 + slowWave * 5.0) * uRadius * 0.025;
        vec2 samplePoint = vec2(reflectedX + bend + ripple - uDelta.x * 0.65,
                                p.y + (slowWave - 0.5) * uRadius * 0.075 - uDelta.y * 0.25);
        vec4 reflected = texture(uStrokeImage, clamp(samplePoint / uResolution, vec2(0.0), vec2(1.0)));
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        float seam = smoothstep(paneWidth * 0.5 - 2.0, paneWidth * 0.5, abs(localX));
        vec3 glass = reflected.rgb * (1.0 - seam * 0.085);
        fragColor = vec4(mix(base.rgb, glass, clamp(falloff * uStrength * 1.35, 0.0, 1.0)), base.a);
        return;
      } else if (uMode == 13) {
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        float veil = clamp(falloff * uStrength * 1.25, 0.0, 0.92);
        fragColor = vec4(base.rgb * (1.0 - veil), base.a);
        return;
      }
      fragColor = texture(uImage, clamp(source / uResolution, vec2(0.0), vec2(1.0)));
    }`
});
