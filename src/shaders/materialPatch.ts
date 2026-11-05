/**
 * Fragment-shader patch injected into every drone material (MeshStandard/Physical)
 * via onBeforeCompile. It drives, entirely on the GPU and without swapping materials:
 *   - hover / selection highlight (fresnel-weighted accent lift)
 *   - dimming of non-selected components
 *   - X-RAY (fresnel rim, translucent) and INTERNAL (ghosted shell) views
 *   - hatched cut caps for CROSS-SECTION mode (back faces exposed by the clip plane)
 *   - smooth fade when components are hidden/shown
 *   - noise dissolve with a glowing edge (fixed-wing configuration drops the VTOL pods)
 * Runs after <opaque_fragment>, i.e. in linear HDR space before tone mapping.
 */
export const MATERIAL_PATCH_UNIFORMS = /* glsl */ `
uniform float uXray;
uniform float uGhost;
uniform float uSection;
uniform vec3 uCapA;
uniform vec3 uCapB;
uniform vec3 uAccent;
uniform vec3 uXrayColor;
uniform float uDim;
uniform float uHi;
uniform float uHov;
uniform float uFade;
uniform float uXrayW;
uniform float uGhostW;
uniform float uDissolve;
varying vec3 vKWorld;
float kHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float kNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( kHash( i ), kHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( kHash( i + vec3( 0, 1, 0 ) ), kHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( kHash( i + vec3( 0, 0, 1 ) ), kHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( kHash( i + vec3( 0, 1, 1 ) ), kHash( i + 1.0 ), f.x ), f.y ), f.z );
}
`;

/** Vertex additions: world position for the dissolve noise. */
export const MATERIAL_PATCH_VERTEX_DECL = /* glsl */ `
varying vec3 vKWorld;
`;
export const MATERIAL_PATCH_VERTEX = /* glsl */ `
vKWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;

export const MATERIAL_PATCH_FRAGMENT = /* glsl */ `
{
  vec3 kCol = gl_FragColor.rgb;
  float kA = gl_FragColor.a;
  vec3 kN = normalize( normal );
  vec3 kV = normalize( vViewPosition );
  float kFres = pow( 1.0 - clamp( abs( dot( kN, kV ) ), 0.0, 1.0 ), 2.2 );

  // highlight
  kCol += uAccent * ( uHi * ( 0.035 + 0.42 * kFres ) + uHov * ( 0.025 + 0.28 * kFres ) );

  // dim others (desaturate + darken)
  float kL = dot( kCol, vec3( 0.2126, 0.7152, 0.0722 ) );
  kCol = mix( kCol, vec3( kL ) * 0.18, uDim );

  // x-ray
  float kX = uXray * uXrayW;
  vec3 kXc = uXrayColor * ( 0.03 + 1.25 * kFres );
  kCol = mix( kCol, kXc, kX );
  kA = mix( kA, clamp( 0.025 + 0.62 * kFres, 0.0, 1.0 ), kX );

  // ghosted shell (internal view)
  float kG = uGhost * uGhostW * ( 1.0 - kX );
  vec3 kGc = vec3( 0.55, 0.62, 0.7 ) * ( 0.02 + 0.5 * kFres );
  kCol = mix( kCol, kGc, kG );
  kA = mix( kA, 0.012 + 0.2 * kFres, kG );

  kA *= uFade;

  // dissolve: world-space noise eats the surface, leaving a glowing rim
  if ( uDissolve > 0.0 ) {
    float kDn = 0.65 * kNoise( vKWorld * 38.0 ) + 0.35 * kNoise( vKWorld * 110.0 );
    float kT = uDissolve * 1.12 - 0.06;
    if ( kDn < kT ) discard;
    kCol += vec3( 0.45, 0.75, 1.0 ) * 4.0 * ( 1.0 - smoothstep( 0.0, 0.05, kDn - kT ) );
  }

  // cut caps
  if ( uSection > 0.5 && !gl_FrontFacing ) {
    float kH = step( 0.5, fract( ( gl_FragCoord.x - gl_FragCoord.y ) / 9.0 ) );
    kCol = mix( uCapA, uCapB, 0.18 + 0.22 * kH ) * ( 1.0 - 0.6 * uDim );
    kA = max( kA, uFade );
  }

  gl_FragColor = vec4( kCol, kA );
}
`;
