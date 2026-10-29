import * as THREE from 'three';

/** Infinite-looking technical floor grid with anti-aliased lines and radial fade. */
export function createGridMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color('#4a6075') },
      uMajor: { value: new THREE.Color('#6d8fb2') },
      uOpacity: { value: 0.5 },
      uFade: { value: 9.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uMajor;
      uniform float uOpacity;
      uniform float uFade;
      varying vec3 vWorld;
      float gridLine(vec2 p, float spacing, float width) {
        vec2 c = p / spacing;
        vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        return 1.0 - min(min(g.x, g.y) / width, 1.0);
      }
      void main() {
        vec2 p = vWorld.xz;
        float minor = gridLine(p, 0.25, 1.0);
        float major = gridLine(p, 1.0, 1.2);
        float r = length(p);
        float fade = 1.0 - smoothstep(1.0, uFade, r);
        float a = (minor * 0.14 + major * 0.42) * fade * fade * uOpacity;
        vec3 col = mix(uColor, uMajor, clamp(major, 0.0, 1.0));
        if (a < 0.002) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}
