/**
 * Fragment-shader patch injected into every drone material (MeshStandard/Physical)
 * via onBeforeCompile. It drives, entirely on the GPU and without swapping materials:
 *   - hover / selection highlight (fresnel-weighted accent lift)
 *   - dimming of non-selected components
 *   - X-RAY (fresnel rim, translucent) and INTERNAL (ghosted shell) views
 *   - hatched cut caps for CROSS-SECTION mode (back faces exposed by the clip plane)
 *   - smooth fade when components are hidden/shown
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

  // cut caps
  if ( uSection > 0.5 && !gl_FrontFacing ) {
    float kH = step( 0.5, fract( ( gl_FragCoord.x - gl_FragCoord.y ) / 9.0 ) );
    kCol = mix( uCapA, uCapB, 0.18 + 0.22 * kH ) * ( 1.0 - 0.6 * uDim );
    kA = max( kA, uFade );
  }

  gl_FragColor = vec4( kCol, kA );
}
`;
