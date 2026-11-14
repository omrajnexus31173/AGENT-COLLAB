'use client';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
const CanvasScene = dynamic(() => Promise.resolve(NexusCanvas), { ssr: false, loading: () => null });
const NODE_COLORS = ['#b49aff', '#65a7ff', '#4ed9e8', '#c7b4ff', '#7c65c9'];
function OrbitalNode({
  index,
  selected,
  onSelect,
}: {
  index: number;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const angle = (index / 5) * Math.PI * 2 + 0.35;
  const radius = index % 2 ? 2.45 : 2.15;
  const position: [number, number, number] = [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.83,
    Math.sin(angle) * 0.65,
  ];
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...position),
      new THREE.Vector3(0, 0, 0),
    ]);
    return new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: NODE_COLORS[index], transparent: true, opacity: 0.22 }),
    );
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );
  return (
    <group>
      <primitive object={line} />
      <mesh
        position={position}
        scale={selected === index ? 1.35 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <octahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial
          color={NODE_COLORS[index]}
          metalness={0.7}
          roughness={0.2}
          emissive={NODE_COLORS[index]}
          emissiveIntensity={selected === index ? 0.8 : 0.2}
        />
      </mesh>
      <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.29, 0.009, 6, 32]} />
        <meshBasicMaterial color={NODE_COLORS[index]} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
function Sculpture({
  selected,
  onSelect,
  mobile,
}: {
  selected: number;
  onSelect: (index: number) => void;
  mobile: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Group>(null);
  const particles = useMemo(() => {
    const positions = new Float32Array((mobile ? 35 : 100) * 3);
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < positions.length; i++) positions[i] = (random() - 0.5) * 9;
    return positions;
  }, [mobile]);
  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const outer = group.current;
    const inner = core.current;
    if (!outer || !inner) return;
    inner.rotation.y += d * 0.16;
    inner.rotation.x += d * 0.06;
    outer.rotation.y = THREE.MathUtils.damp(outer.rotation.y, mobile ? 0 : state.pointer.x * 0.16, 3, d);
    outer.rotation.x = THREE.MathUtils.damp(outer.rotation.x, mobile ? 0 : -state.pointer.y * 0.1, 3, d);
    outer.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.06;
  });
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={4} color="#e5d9ff" />
      <pointLight position={[-3, -1, 2]} intensity={18} color="#7c3aed" />
      <pointLight position={[3, 2, -2]} intensity={12} color="#3b82f6" />
      <group ref={group}>
        <group ref={core}>
          <mesh>
            <icosahedronGeometry args={[0.87, 0]} />
            <meshStandardMaterial
              color="#6d3bb5"
              metalness={0.72}
              roughness={0.19}
              emissive="#5b21b6"
              emissiveIntensity={0.5}
            />
          </mesh>
          <mesh scale={1.07}>
            <icosahedronGeometry args={[0.87, 0]} />
            <meshBasicMaterial color="#d8c7ff" wireframe transparent opacity={0.42} />
          </mesh>
          <mesh rotation={[0.6, 0.4, 0.2]}>
            <torusGeometry args={[1.3, 0.028, 12, 100]} />
            <meshStandardMaterial
              color="#b9a0e6"
              metalness={0.85}
              roughness={0.24}
              emissive="#7c3aed"
              emissiveIntensity={0.35}
            />
          </mesh>
          <mesh rotation={[1.4, -0.55, 0.5]}>
            <torusGeometry args={[1.56, 0.018, 10, 100]} />
            <meshStandardMaterial
              color="#8d7bb4"
              metalness={0.8}
              roughness={0.2}
              emissive="#6d28d9"
              emissiveIntensity={0.4}
            />
          </mesh>
          <mesh rotation={[0.2, 1.2, -0.4]}>
            <torusGeometry args={[1.8, 0.014, 8, 100]} />
            <meshStandardMaterial color="#7191c7" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
        <mesh position={[0, 0, -0.8]} rotation={[0.12, 0.15, 0]}>
          <torusGeometry args={[2.6, 0.012, 8, 150]} />
          <meshBasicMaterial color="#8b5cf6" transparent opacity={0.45} />
        </mesh>
        <mesh position={[0, 0, -0.85]} rotation={[0.12, 0.15, 0]}>
          <torusGeometry args={[2.68, 0.004, 6, 150]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.25} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <OrbitalNode key={i} index={i} selected={selected} onSelect={onSelect} />
        ))}
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[particles, 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.018} color="#b6a2dd" transparent opacity={0.55} sizeAttenuation />
        </points>
      </group>
    </>
  );
}
function NexusCanvas({
  selected,
  onSelect,
  mobile,
}: {
  selected: number;
  onSelect: (index: number) => void;
  mobile: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8.4], fov: 43 }}
      dpr={mobile ? 1 : [1, 1.5]}
      gl={{ alpha: true, antialias: !mobile, powerPreference: 'low-power' }}
      aria-hidden="true"
    >
      <Sculpture selected={selected} onSelect={onSelect} mobile={mobile} />
    </Canvas>
  );
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function NexusHero() {
  const [selected, setSelected] = useState(0);
  const [supported, setSupported] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(window.matchMedia('(max-width: 760px)').matches);
    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.motion === 'reduce';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (gl && !reduced) {
        setSupported(true);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      /* Static artwork is the intentional fallback. */
    }
    return () => {
      document.body.style.cursor = '';
    };
  }, []);
  const names = ['Atlas', 'Aegis', 'Forge', 'Spectre', 'Sentinel'];
  const roles = [
    'Research & discovery',
    'Systems & architecture',
    'Code & creation',
    'Review & refinement',
    'Quality & resilience',
  ];
  return (
    <div className="nexus-hero-visual">
      <div className="hero-aura" />
      <img
        className="nexus-fallback"
        src="/images/nexus-fallback.webp"
        alt="An amethyst Nexus core connecting independent intelligences through orbital rings"
        width="960"
        height="640"
        fetchPriority="high"
      />
      {supported && (
        <div className="nexus-canvas">
          <SceneBoundary>
            <CanvasScene selected={selected} onSelect={setSelected} mobile={mobile} />
          </SceneBoundary>
        </div>
      )}
      <div className="core-label">
        <span className="eyebrow">THE NEXUS CORE</span>
        <strong>
          {names[selected]}
          <span className="node-number">0{selected + 1}</span>
        </strong>
        <small>{roles[selected]}</small>
      </div>
      <div className="hero-node-tabs" aria-label="Explore the conceptual AI entities">
        {names.slice(0, 3).map((name, i) => (
          <button
            key={name}
            onClick={() => setSelected(i)}
            className={selected === i ? 'selected' : ''}
            aria-pressed={selected === i}
          >
            <span style={{ background: NODE_COLORS[i] }} />
            {name}
          </button>
        ))}
      </div>
      <span className="concept-label">
        {supported ? 'INTERACTIVE CONCEPT' : 'STATIC CONCEPT'} · NOT LIVE AGENT STATUS
      </span>
    </div>
  );
}
