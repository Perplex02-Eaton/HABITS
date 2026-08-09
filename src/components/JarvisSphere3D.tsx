import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type JarvisSphereMode = "idle" | "listening" | "thinking" | "speaking";

interface JarvisSphere3DProps {
  mode: JarvisSphereMode;
}

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDistortion;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    float distortion = sin(position.y * 8.0 + position.x * 5.0) * 0.025;
    distortion += sin(position.z * 13.0 - position.y * 3.0) * 0.012;
    distortion += smoothstep(0.32, 0.95, position.x) * 0.065;
    vDistortion = distortion;
    vec3 fracturedPosition = position + normal * distortion;
    fracturedPosition.x += sin(position.y * 5.0) * 0.018;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(fracturedPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBeat;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDistortion;

  void main() {
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(normal, vec3(0.0, 0.0, 1.0))), 2.2);
    float longitudeAngle = atan(vPosition.z, vPosition.x);
    float latitudeAngle = asin(clamp(vPosition.y, -1.0, 1.0));
    float traceA = pow(abs(sin(longitudeAngle * 8.0 + vPosition.y * 17.0 + sin(latitudeAngle * 5.0))), 30.0);
    float traceB = pow(abs(sin(latitudeAngle * 14.0 - longitudeAngle * 3.0 + uTime * 0.035)), 28.0);
    float traceNodes = step(0.86, sin(longitudeAngle * 19.0) * sin(latitudeAngle * 23.0));
    float circuits = clamp(traceA + traceB + traceNodes * 0.82, 0.0, 1.0);
    float largePanels = step(0.1, sin(longitudeAngle * 3.0 + latitudeAngle * 7.0 + 0.8));
    float brokenSectors = step(-0.18, sin(longitudeAngle * 5.0 - latitudeAngle * 4.0));
    float scanFragments = step(0.62, sin(longitudeAngle * 17.0 + latitudeAngle * 11.0));
    float structure = max(circuits, max(largePanels * 0.34, scanFragments * 0.56));
    structure *= mix(0.12, 1.0, brokenSectors);
    float missingWedge = step(-0.3, cos(longitudeAngle + 1.45)) * step(-0.72, vPosition.y);
    structure *= mix(0.16, 1.0, missingWedge);
    float innerPulse = 0.28 + 0.16 * sin(uTime * 2.1 + length(vPosition) * 8.0);
    vec3 deepBlue = vec3(0.005, 0.16, 0.72);
    vec3 cyan = vec3(0.05, 0.78, 1.0);
    vec3 ice = vec3(0.62, 0.96, 1.0);
    vec3 color = mix(deepBlue, cyan, fresnel + innerPulse);
    color = mix(color, ice, circuits * 0.72 + uBeat * 0.22 + abs(vDistortion) * 2.0);
    float alpha = structure * 0.62 + fresnel * structure * 0.55 + circuits * 0.28;
    alpha *= uEnergy;
    if (alpha < 0.105) discard;
    gl_FragColor = vec4(color, min(alpha, 0.94));
  }
`;

function createOrbitalLines(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0x61dcff,
    transparent: true,
    opacity: 0.13,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  for (let latitude = -4; latitude <= 4; latitude += 2) {
    const phi = (latitude / 10) * Math.PI;
    const radius = Math.cos(phi) * (1.025 + Math.sin(latitude * 4.7) * 0.035);
    const y = Math.sin(phi) * 1.025 + Math.cos(latitude * 2.3) * 0.018;
    const start = ((latitude * 1.73) % 2) * Math.PI;
    const arc = Math.PI * (0.32 + ((latitude + 8) % 3) * 0.12);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 54; index++) {
      const angle = start + (index / 54) * arc;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let longitude = 0; longitude < 10; longitude++) {
    const theta = (longitude / 10) * Math.PI + Math.sin(longitude * 2.1) * 0.035;
    const start = longitude % 3 === 0 ? 0.18 : 0.72 + (longitude % 4) * 0.18;
    const arc = Math.PI * (0.38 + (longitude % 4) * 0.12);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 58; index++) {
      const phi = start + (index / 58) * arc;
      const radius = 1.01 + Math.sin(longitude * 5.31) * 0.035;
      points.push(new THREE.Vector3(
        Math.cos(phi) * Math.cos(theta) * radius,
        Math.sin(phi) * radius,
        Math.cos(phi) * Math.sin(theta) * radius
      ));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
  return group;
}

function createBrokenFramework(): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = new THREE.LineBasicMaterial({
    color: 0x28c8ff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const brightMaterial = frameMaterial.clone();
  brightMaterial.color.setHex(0x9cefff);
  brightMaterial.opacity = 0.72;

  const pseudoRandom = (seed: number) => {
    const value = Math.sin(seed * 91.173 + 17.71) * 43758.5453;
    return value - Math.floor(value);
  };

  for (let index = 0; index < 82; index++) {
    const longitude = pseudoRandom(index + 1) * Math.PI * 2;
    const latitude = (pseudoRandom(index + 19) - 0.5) * Math.PI * 0.92;
    const missingTopRight = latitude > 0.42 && Math.cos(longitude) > 0.25;
    const missingLowerLeft = latitude < -0.5 && Math.sin(longitude) < -0.15;
    if (missingTopRight || missingLowerLeft || index % 11 === 0) continue;

    const detached = index % 13 === 0 ? 0.14 : 0;
    const radius = 1.02 + pseudoRandom(index + 41) * 0.16 + detached;
    const width = 0.06 + pseudoRandom(index + 73) * 0.16;
    const height = 0.05 + pseudoRandom(index + 101) * 0.14;
    const depth = 0.012 + pseudoRandom(index + 137) * 0.026;
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth));
    const panel = new THREE.LineSegments(geometry, index % 7 === 0 ? brightMaterial : frameMaterial);
    panel.position.set(
      Math.cos(latitude) * Math.cos(longitude) * radius,
      Math.sin(latitude) * radius,
      Math.cos(latitude) * Math.sin(longitude) * radius
    );
    panel.lookAt(0, 0, 0);
    panel.rotateZ(pseudoRandom(index + 211) * Math.PI);
    group.add(panel);

    if (index % 3 === 0) {
      const direction = panel.position.clone().normalize();
      const inner = direction.clone().multiplyScalar(0.82 + pseudoRandom(index) * 0.12);
      const outer = direction.clone().multiplyScalar(1.2 + pseudoRandom(index + 5) * 0.2);
      const beam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([inner, outer]),
        index % 6 === 0 ? brightMaterial : frameMaterial
      );
      group.add(beam);
    }
  }

  return group;
}

function createMechanicalArcs(): THREE.Group {
  const group = new THREE.Group();
  const random = (seed: number) => {
    const value = Math.sin(seed * 43.77 + 8.13) * 12741.371;
    return value - Math.floor(value);
  };
  const cyan = new THREE.MeshBasicMaterial({
    color: 0x24c8ff,
    transparent: true,
    opacity: 0.46,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const ice = cyan.clone();
  ice.color.setHex(0xa8f3ff);
  ice.opacity = 0.7;

  for (let index = 0; index < 22; index++) {
    const radius = 0.42 + random(index + 2) * 0.91;
    const tube = 0.0035 + random(index + 31) * 0.009;
    const arc = 0.42 + random(index + 57) * 3.05;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 6, 72, arc),
      index % 6 === 0 ? ice : cyan
    );
    ring.rotation.set(
      random(index + 79) * Math.PI,
      random(index + 103) * Math.PI,
      random(index + 149) * Math.PI * 2
    );
    ring.position.set(
      (random(index + 181) - 0.5) * 0.11,
      (random(index + 211) - 0.5) * 0.11,
      (random(index + 251) - 0.5) * 0.08
    );
    group.add(ring);
  }

  const spokeMaterial = new THREE.LineBasicMaterial({
    color: 0x50d9ff,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (let index = 0; index < 26; index++) {
    const direction = new THREE.Vector3(
      random(index + 307) - 0.5,
      random(index + 347) - 0.5,
      random(index + 389) - 0.5
    ).normalize();
    const innerRadius = 0.28 + random(index + 419) * 0.48;
    const outerRadius = 0.82 + random(index + 457) * 0.48;
    const offset = new THREE.Vector3(
      (random(index + 491) - 0.5) * 0.12,
      (random(index + 521) - 0.5) * 0.12,
      0
    );
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        direction.clone().multiplyScalar(innerRadius).add(offset),
        direction.clone().multiplyScalar(outerRadius).add(offset)
      ]),
      spokeMaterial
    ));
  }

  return group;
}

function createArchitecturalRibs(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0x22bfff,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const highlight = material.clone();
  highlight.color.setHex(0xb2f5ff);
  highlight.opacity = 0.78;

  [
    [1.31, 0.018, 1.7, 0.08, 0.2, 1.18],
    [1.24, 0.014, 0.15, 1.48, 0.45, 1.62],
    [1.15, 0.022, 1.12, 0.48, 2.3, 0.86],
    [1.35, 0.01, 0.76, 1.05, 3.8, 1.42],
    [0.94, 0.016, 1.45, 0.82, 1.6, 1.08],
    [1.08, 0.012, 0.38, 1.26, 5.1, 0.72],
    [1.28, 0.009, 1.22, 1.5, 4.45, 1.95],
    [0.82, 0.013, 0.65, 0.32, 0.85, 1.34]
  ].forEach(([radius, tube, x, y, start, arc], index) => {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 7, 84, arc),
      index % 3 === 0 ? highlight : material
    );
    rib.rotation.set(x, y, start);
    rib.position.set(
      Math.sin(index * 1.9) * 0.055,
      Math.cos(index * 2.4) * 0.045,
      Math.sin(index * 0.9) * 0.04
    );
    group.add(rib);
  });

  const railMaterial = new THREE.LineBasicMaterial({
    color: 0x76e5ff,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (let index = 0; index < 14; index++) {
    const angle = index * 1.71 + 0.28;
    const y = -0.82 + (index % 7) * 0.27;
    const radial = Math.sqrt(Math.max(0.08, 1.12 * 1.12 - y * y));
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const center = new THREE.Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial);
    const halfLength = 0.05 + (index % 4) * 0.022;
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        center.clone().addScaledVector(tangent, -halfLength),
        center.clone().addScaledVector(tangent, halfLength)
      ]),
      railMaterial
    ));
  }

  return group;
}

export default function JarvisSphere3D({ mode }: JarvisSphere3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const [failed, setFailed] = useState(false);
  modeRef.current = mode;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "jarvis-webgl-canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 4.65);

    const sphereGroup = new THREE.Group();
    sphereGroup.scale.set(1.06, 0.98, 1);
    scene.add(sphereGroup);

    const uniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0.72 },
      uBeat: { value: 0 }
    };
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 72, 48),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    sphereGroup.add(shell);

    const wireframe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.045, 4),
      new THREE.MeshBasicMaterial({
        color: 0x18aef2,
        wireframe: true,
        transparent: true,
        opacity: 0.018,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    sphereGroup.add(wireframe);

    const orbitalLines = createOrbitalLines();
    sphereGroup.add(orbitalLines);

    const brokenFramework = createBrokenFramework();
    brokenFramework.rotation.set(-0.08, 0.18, -0.06);
    sphereGroup.add(brokenFramework);

    const mechanicalArcs = createMechanicalArcs();
    mechanicalArcs.rotation.set(0.14, -0.24, 0.08);
    sphereGroup.add(mechanicalArcs);

    const architecturalRibs = createArchitecturalRibs();
    architecturalRibs.rotation.set(-0.12, 0.2, 0.04);
    sphereGroup.add(architecturalRibs);

    const particlePositions = new Float32Array(780 * 3);
    for (let index = 0; index < 780; index++) {
      const y = 1 - (index / 779) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = Math.PI * (3 - Math.sqrt(5)) * index;
      const exposedFragment = index % 11 === 0 ? 0.16 + (index % 5) * 0.035 : 0;
      const shellRadius = 1.01 + Math.sin(index * 12.9898) * 0.038 + exposedFragment;
      particlePositions[index * 3] = Math.cos(theta) * radius * shellRadius;
      particlePositions[index * 3 + 1] = y * shellRadius;
      particlePositions[index * 3 + 2] = Math.sin(theta) * radius * shellRadius;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xa4efff,
        size: 0.014,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    sphereGroup.add(particles);

    const rings = new THREE.Group();
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x36c8ff,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    [
      [1.14, 0.006, 0.24, 0.08, 2.2],
      [1.21, 0.008, 1.05, 0.42, 1.5],
      [1.3, 0.005, 0.58, 1.18, 3.1],
      [1.08, 0.004, 1.42, 0.7, 1.1]
    ].forEach(([radius, tube, x, y, arc], index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 128, arc), ringMaterial.clone());
      ring.rotation.set(x, y, 0);
      ring.position.set(Math.sin(index * 2.7) * 0.06, Math.cos(index * 1.8) * 0.045, Math.sin(index) * 0.035);
      rings.add(ring);
    });
    sphereGroup.add(rings);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x67dcff,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), coreMaterial);
    sphereGroup.add(core);

    const coreMechanism = new THREE.Group();
    [
      [0.2, 0.014, 0.2, 0.75, 4.7],
      [0.29, 0.01, 1.12, 0.25, 3.8],
      [0.39, 0.008, 0.68, 1.3, 2.7],
      [0.48, 0.006, 1.45, 0.58, 1.8]
    ].forEach(([radius, tube, x, y, arc], index) => {
      const mechanismMaterial = new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xb8f5ff : 0x27c5ff,
        transparent: true,
        opacity: 0.82 - index * 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const mechanismRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 8, 96, arc),
        mechanismMaterial
      );
      mechanismRing.rotation.set(x, y, index * 0.42);
      coreMechanism.add(mechanismRing);
    });
    sphereGroup.add(coreMechanism);

    const axisMaterial = new THREE.MeshBasicMaterial({
      color: 0x8cecff,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const energyAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.78, 10), axisMaterial);
    energyAxis.rotation.z = Math.PI / 2;
    coreMechanism.add(energyAxis);
    const axisTip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.012, 0.28, 10), axisMaterial.clone());
    axisTip.rotation.z = -Math.PI / 2;
    axisTip.position.x = 0.48;
    coreMechanism.add(axisTip);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (() => {
        const glowCanvas = document.createElement("canvas");
        glowCanvas.width = glowCanvas.height = 128;
        const context = glowCanvas.getContext("2d")!;
        const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.16, "rgba(104,224,255,.95)");
        gradient.addColorStop(0.48, "rgba(20,136,255,.32)");
        gradient.addColorStop(1, "rgba(0,70,255,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(glowCanvas);
      })(),
      color: 0x8beaff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.88
    }));
    glow.scale.setScalar(1.25);
    scene.add(glow);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let targetCameraX = 0;
    let targetCameraY = 0;
    const handlePointerMove = (event: PointerEvent) => {
      if (reduceMotion) return;
      const bounds = host.getBoundingClientRect();
      targetCameraX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 0.22;
      targetCameraY = -((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 0.16;
    };
    const resetPointer = () => {
      targetCameraX = 0;
      targetCameraY = 0;
    };
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerleave", resetPointer);

    let frame = 0;
    let previous = performance.now();
    let energy = 0.72;
    const animate = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const time = now / 1000;
      const currentMode = modeRef.current;
      const targetEnergy = currentMode === "speaking" ? 1.16 : currentMode === "listening" ? 1.03 : currentMode === "thinking" ? 1.08 : 0.72;
      energy += (targetEnergy - energy) * Math.min(delta * 4.5, 1);
      const beat = currentMode === "speaking" ? Math.pow((Math.sin(time * 9.2) + 1) * 0.5, 7) : 0;

      uniforms.uTime.value = time;
      uniforms.uEnergy.value = energy;
      uniforms.uBeat.value = beat;
      sphereGroup.rotation.y += delta * (currentMode === "thinking" ? 0.7 : 0.28);
      sphereGroup.rotation.x = Math.sin(time * 0.42) * 0.12;
      wireframe.rotation.y -= delta * 0.18;
      orbitalLines.rotation.y += delta * 0.11;
      brokenFramework.rotation.y -= delta * 0.075;
      brokenFramework.rotation.z = -0.06 + Math.sin(time * 0.24) * 0.045;
      mechanicalArcs.rotation.x = 0.14 + Math.sin(time * 0.31) * 0.07;
      mechanicalArcs.rotation.y += delta * 0.12;
      mechanicalArcs.children.forEach((part, index) => {
        if (part instanceof THREE.Mesh) {
          part.rotation.z += delta * (0.08 + (index % 5) * 0.025) * (index % 2 ? -1 : 1);
        }
      });
      architecturalRibs.rotation.y -= delta * 0.055;
      architecturalRibs.children.forEach((part, index) => {
        if (part instanceof THREE.Mesh) {
          part.rotation.z += delta * (0.025 + index * 0.006) * (index % 2 ? -1 : 1);
        }
      });
      rings.children.forEach((ring, index) => {
        ring.rotation.z += delta * (0.12 + index * 0.07) * (index % 2 ? -1 : 1);
      });
      coreMechanism.children.forEach((ring, index) => {
        if (index < 4) {
          ring.rotation.z += delta * (0.32 + index * 0.13) * (index % 2 ? -1 : 1);
        }
      });
      const scale = 1 + Math.sin(time * 1.7) * 0.018 + beat * 0.12;
      core.scale.setScalar(scale);
      glow.scale.setScalar(1.2 + Math.sin(time * 1.7) * 0.06 + beat * 0.38);
      (glow.material as THREE.SpriteMaterial).opacity = 0.66 + energy * 0.18 + beat * 0.16;
      camera.position.x += (targetCameraX - camera.position.x) * Math.min(delta * 3.4, 1);
      camera.position.y += (targetCameraY - camera.position.y) * Math.min(delta * 3.4, 1);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      if (!reduceMotion) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", resetPointer);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
          object.geometry?.dispose();
          const material = object.material;
          (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose());
        }
      });
      (glow.material as THREE.SpriteMaterial).map?.dispose();
      (glow.material as THREE.SpriteMaterial).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (failed) {
    return <img className="jarvis-3d-fallback" src="/images/jarvis-core-blue-v3.webp" alt="" aria-hidden="true" />;
  }

  return <div className="jarvis-3d-host" ref={hostRef} aria-hidden="true" />;
}
