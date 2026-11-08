/**
 * The 3D view of a LEGO model (ADR 0017, step 10a-2): three.js (MIT) and its LDraw loader draw the
 * packed model (./pack.ts), stood on the floor in the ROBOT frame the robot was worked out in,
 * with the motors and sensors outlined and tagged as in the dialog's list. Loaded only when the
 * dialog shows a model: three.js is imported here and nowhere else.
 *
 * Frames: the model is drawn in millimetres with three.js's +Y up; the ROBOT frame (x forward, y
 * left, z up) goes to three.js as (x, z, −y), a rotation, so nothing is mirrored.
 */
import type { Vec3 } from './model';
import type { ModelRobot } from './robot-from-model';

export interface Outline {
  readonly tag: string;
  readonly kind: 'motor' | 'sensor';
  /** The part's box corners in the ROBOT frame, mm, in ./parts.ts `boxCorners` order. */
  readonly corners: readonly Vec3[];
}

export interface ModelView {
  /** Stands the model in another ROBOT frame (the front turned round) with its outlines. */
  readonly place: (frame: ModelRobot['frame'], outlines: readonly Outline[]) => void;
  readonly dispose: () => void;
}

/** ROBOT frame (mm) to three.js. */
const toThree = (p: Vec3): [number, number, number] => [p[0], p[2], -p[1]];

/**
 * Draws `packed` (an LDraw text from ./pack.ts) on `canvas`, with the tags in `labels` (an
 * element over the canvas). Throws when the browser cannot draw 3D.
 */
export async function createModelView(
  canvas: HTMLCanvasElement,
  labels: HTMLElement,
  packed: string,
  ldconfigUrl: string,
): Promise<ModelView> {
  const THREE = await import('three');
  const { LDrawLoader } = await import('three/addons/loaders/LDrawLoader.js');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { LDrawConditionalLineMaterial } =
    await import('three/addons/materials/LDrawConditionalLineMaterial.js');

  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    throw new Error('This browser cannot draw in 3D (WebGL is off or not supported).');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const loader = new LDrawLoader();
  // The loader needs the material for its "conditional" edges (the outlines of curved surfaces).
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  await loader.preloadMaterials(ldconfigUrl);
  const model = await new Promise<InstanceType<typeof THREE.Group>>((resolve, reject) =>
    loader.parse(packed, resolve, reject),
  );

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(300, 600, 400);
  scene.add(sun);
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  holder.add(model);
  scene.add(holder);
  const extras = new THREE.Group();
  scene.add(extras);

  const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;

  let tags: { element: HTMLElement; at: InstanceType<typeof THREE.Vector3> }[] = [];
  const render = () => {
    renderer.render(scene, camera);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    for (const tag of tags) {
      const p = tag.at.clone().project(camera);
      const visible = p.z < 1;
      tag.element.style.display = visible ? '' : 'none';
      tag.element.style.left = `${((p.x + 1) / 2) * width}px`;
      tag.element.style.top = `${((1 - p.y) / 2) * height}px`;
    }
  };
  controls.addEventListener('change', render);

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const disposeGroup = (group: InstanceType<typeof THREE.Object3D>) => {
    group.traverse((object) => {
      const mesh = object as Partial<InstanceType<typeof THREE.Mesh>>;
      mesh.geometry?.dispose();
    });
  };

  const place: ModelView['place'] = (frame, outlines) => {
    // LDraw (LDU) → ROBOT frame (mm) → three.js: rows forward, up, −left; scaled to mm.
    const k = 0.4;
    const o = frame.origin;
    const dotO = (v: Vec3) => v[0] * o[0] + v[1] * o[1] + v[2] * o[2];
    const { forward: f, up: u, left: l } = frame;
    holder.matrix.set(
      k * f[0],
      k * f[1],
      k * f[2],
      -k * dotO(f),
      k * u[0],
      k * u[1],
      k * u[2],
      k * (frame.floor - dotO(u)),
      -k * l[0],
      -k * l[1],
      -k * l[2],
      k * dotO(l),
      0,
      0,
      0,
      1,
    );
    holder.matrixWorldNeedsUpdate = true;

    disposeGroup(extras);
    extras.clear();
    labels.replaceChildren();
    tags = [];
    // Each outline's twelve edges: corners that differ in one of x, y, z (boxCorners order).
    for (const outline of outlines) {
      const points: number[] = [];
      for (let a = 0; a < 8; a += 1) {
        for (const bit of [4, 2, 1]) {
          const b = a | bit;
          if (b === a) continue;
          points.push(...toThree(outline.corners[a]!), ...toThree(outline.corners[b]!));
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const colour = outline.kind === 'motor' ? 0x2a78d6 : 0xeb6834;
      extras.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colour })));
      const middle = outline.corners
        .reduce((sum, c) => [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]], [0, 0, 0])
        .map((v) => v / outline.corners.length) as unknown as Vec3;
      const element = document.createElement('span');
      element.className = `model-3d-tag model-3d-tag-${outline.kind}`;
      element.textContent = outline.tag;
      labels.append(element);
      tags.push({ element, at: new THREE.Vector3(...toThree(middle)) });
    }

    // The floor, and an arrow to the front.
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const reach = Math.max(size.x, size.z, 100);
    const grid = new THREE.GridHelper(
      Math.ceil((reach * 1.6) / 40) * 40,
      Math.ceil((reach * 1.6) / 40) * 2,
      0x9aa3ad,
      0xd0d5db,
    );
    extras.add(grid);
    extras.add(
      new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(Math.max(box.max.x, 0) + 10, 1, 0),
        40,
        0x1f5fbf,
        14,
        10,
      ),
    );

    // Look from the front, the robot's right and above.
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 50);
    const distance = radius / Math.sin(((camera.fov / 2) * Math.PI) / 180);
    camera.position
      .copy(centre)
      .add(new THREE.Vector3(0.75, 0.55, 0.65).normalize().multiplyScalar(distance * 1.05));
    camera.near = Math.max(1, distance / 50);
    camera.far = distance * 20;
    controls.target.copy(centre);
    controls.update();
    resize();
  };

  return {
    place,
    dispose: () => {
      observer.disconnect();
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      labels.replaceChildren();
    },
  };
}
