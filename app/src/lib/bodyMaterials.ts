/**
 * Materials for the realistic body, and the one shader hook they share.
 *
 * The body is one mesh with four geometry groups (skin, brief, top, eyes). Data
 * layers, hover and selection are all written into an RGBA vertex-colour attribute:
 * rgb is the tint, alpha how much of it shows over the material's own colour. Alpha 0
 * is pure skin. One attribute write, one draw call, nothing to sort.
 */
import * as THREE from 'three';
import type { HumanMesh } from './humanMesh';

/** Six skin tones, sRGB. Numbered in the UI; never described by ethnicity. */
export const SKIN_TONES = ['#f3d5c0', '#e6b9a0', '#cf9a78', '#a86e4e', '#7a4a30', '#4a2c1c'] as const;
export const DEFAULT_SKIN_TONE = SKIN_TONES[2];

/** Replaces three's `diffuseColor *= vColor` with an alpha-weighted mix. */
function overlayHook(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#if defined( USE_COLOR_ALPHA )
  diffuseColor.rgb = mix( diffuseColor.rgb, vColor.rgb, vColor.a );
#endif`,
  );
}

export function skinMaterial(tone: string): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(tone);
  const sheen = color.clone().lerp(new THREE.Color('#ffffff'), 0.2);
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.7,
    sheenColor: sheen,
    clearcoat: 0,
    envMapIntensity: 0.6,
    vertexColors: true,
  });
  m.onBeforeCompile = overlayHook;
  return m;
}

/**
 * Cloth is cut from a full bodysuit helper, so the hem is decided per fragment: anything
 * outside the band (metres, model space) is discarded. That keeps the edge a clean line
 * however the body underneath is shaped.
 */
export function clothMaterial(): THREE.MeshPhysicalMaterial {
  const uniforms = { uBand: { value: new THREE.Vector4(-1e3, 1e3, 1e3, 0) } };
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1f2430'),
    roughness: 0.9,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#3a4152'),
    envMapIntensity: 0.5,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    overlayHook(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClothPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize( objectNormal ) * 0.0025;\nvClothPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClothPos;\nuniform vec4 uBand;')
      .replace(
        '#include <clipping_planes_fragment>',
        'if ( vClothPos.y < uBand.x || vClothPos.y > uBand.y || abs( vClothPos.x ) > uBand.z ) discard;\n#include <clipping_planes_fragment>',
      );
  };
  return m;
}

/** Point the cloth hems and the eye centres at the body as currently shaped. */
export function syncBodyMaterials(materials: THREE.Material[], human: HumanMesh): void {
  const cloth = human.asset.manifest.cloth;
  const band = (lo: number, hi: number, xMax: number) => {
    const a = human.toMetres([0, lo, 0]), b = human.toMetres([xMax, hi, 0]);
    return new THREE.Vector4(a.y, b.y, b.x, 1);
  };
  (materials[1].userData.uniforms.uBand.value as THREE.Vector4).copy(band(cloth.brief[0], cloth.brief[1], 1e3));
  (materials[2].userData.uniforms.uBand.value as THREE.Vector4).copy(band(cloth.top[0], cloth.top[1], cloth.topX));
  const eye = materials[3].userData.uniforms;
  const centres = human.eyeCentres();
  eye.uEyeL.value.copy(centres.left);
  eye.uEyeR.value.copy(centres.right);
}

/**
 * Eyeballs: white with an iris and pupil drawn in the shader by the angle between
 * the surface point and each eye's forward axis. Iris colour is fixed — it is not data.
 */
export function eyeMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e9e6e2'),
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.6,
  });
  const uniforms = {
    uEyeL: { value: new THREE.Vector3() },
    uEyeR: { value: new THREE.Vector3() },
    uForward: { value: new THREE.Vector3(0, 0, 1) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyePos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEyePos = (modelMatrix * vec4( transformed, 1.0 )).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vEyePos;\nuniform vec3 uEyeL;\nuniform vec3 uEyeR;\nuniform vec3 uForward;',
      )
      .replace(
        '#include <color_fragment>',
        `{
  vec3 c = distance( vEyePos, uEyeL ) < distance( vEyePos, uEyeR ) ? uEyeL : uEyeR;
  float ang = acos( clamp( dot( normalize( vEyePos - c ), normalize( uForward ) ), -1.0, 1.0 ) );
  float iris = 1.0 - smoothstep( 0.40, 0.46, ang );
  float pupil = 1.0 - smoothstep( 0.15, 0.19, ang );
  float ring = smoothstep( 0.30, 0.42, ang );
  vec3 irisColor = mix( vec3( 0.20, 0.11, 0.05 ), vec3( 0.07, 0.04, 0.02 ), ring );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( irisColor, vec3( 0.005 ), pupil ), iris );
}`,
      );
  };
  return m;
}

/** Group order in the asset: skin, brief, top, eyes. */
export function bodyMaterials(tone: string) {
  return [skinMaterial(tone), clothMaterial(), clothMaterial(), eyeMaterial()];
}
