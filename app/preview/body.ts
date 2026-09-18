// Dev-only preview of the realistic body: /preview/body.html?g=0&a=0&w=0.5&m=0.5&tone=2&view=front&h=1.65
// Any target name can be given as a query parameter too, e.g. ?l-upperarm-fat-incr=0.8
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadHumanAsset, HumanMesh } from '../src/lib/humanMesh';
import { bodyMaterials, syncBodyMaterials, SKIN_TONES } from '../src/lib/bodyMaterials';
import { macroWeights } from '../src/lib/bodyFit';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const el = document.getElementById('c')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(el.clientWidth, el.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
el.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0d12');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2.5, 3.5, 3);
scene.add(key, new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.3));

const cam = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 100);
const controls = new OrbitControls(cam, renderer.domElement);

const asset = await loadHumanAsset('/body/');
const human = new HumanMesh(asset);
const g = num('g', 0), a = num('a', 0), w = num('w', 0.5), m = num('m', 0.5), h = num('h', 1.65);
const weights = macroWeights({ gender: g, age: a, size: w, muscle: m });
for (const t of asset.targets.keys()) if (q.has(t)) weights[t] = Number(q.get(t));
const meas = human.setShape(weights, h);
console.log('measure', JSON.stringify(meas));

const tone = SKIN_TONES[num('tone', 2)];
const mats = bodyMaterials(tone);
if (g >= 0.5) mats[2].visible = false;
const mesh = new THREE.Mesh(human.geometry, mats);
syncBodyMaterials(mats, human);
scene.add(mesh);

const view = q.get('view') ?? 'front';
const d = (h * 1.28) / (2 * Math.tan((32 * Math.PI) / 360));
const zoom = num('zoom', 1);
const target = new THREE.Vector3(0, num('ty', h / 2), 0);
const dist = d / zoom;
cam.position.set(view === 'left' ? -dist : view === 'right' ? dist : 0, target.y, view === 'front' ? dist : view === 'back' ? -dist : 0);
controls.target.copy(target);
controls.update();
renderer.render(scene, cam);
(window as unknown as { ready: boolean }).ready = true;
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, cam); });
(window as unknown as { mats: unknown }).mats = mats;
(window as unknown as { renderer: unknown }).renderer = renderer;
(window as unknown as { THREE: unknown; mesh: unknown }).THREE = THREE;
(window as unknown as { THREE: unknown; mesh: unknown }).mesh = mesh;
