import * as THREE from 'three';
import { createGlassMaterial } from './materials.js';
import { clamp, createRandom, easeOutCubic, smoothstep } from './utils.js';

const CASE_SIZE = 4.35;
const CASE_HEIGHT = 4.2;
const CASE_BOTTOM = 0.33;
const CASE_TOP = CASE_BOTTOM + CASE_HEIGHT;
const HALF_SIZE = CASE_SIZE / 2;

/**
 * 创建一个铜牌纹理
 * @returns {THREE.CanvasTexture} 铜牌纹理
 */
function createPlaqueTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#d9bd8c';
    context.font = '300 76px Georgia, serif';
    context.letterSpacing = '12px';
    context.fillText('NOCTURNE  ·  N°19', canvas.width / 2, canvas.height / 2 + 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

/**
 * 创建玻璃展示罩
 * @param {object} options 配置
 * @param {number} options.seed 随机种子
 * @returns {object} 展示罩对象与开合控制方法
 */
export function createGlassCase() {
    const group = new THREE.Group();
    const sideMaterial = createGlassMaterial();
    const topMaterial = createGlassMaterial();
    const sideEdgeMaterial = new THREE.LineBasicMaterial({
        color: 0x9b7d52,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const topEdgeMaterial = new THREE.LineBasicMaterial({
        color: 0xb08e5d,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const panels = [];
    for (let index = 0; index < 4; index += 1) {
        const hinge = new THREE.Group();
        hinge.position.y = CASE_BOTTOM;
        hinge.rotation.y = index * Math.PI * 0.5;
        group.add(hinge);

        const pivot = new THREE.Group();
        pivot.position.z = HALF_SIZE;
        hinge.add(pivot);

        const panel = new THREE.Mesh(new THREE.PlaneGeometry(CASE_SIZE, CASE_HEIGHT), sideMaterial);
        panel.position.y = CASE_HEIGHT / 2;
        panel.renderOrder = 30;
        pivot.add(panel);

        const edgePoints = [];
        const halfWidth = CASE_SIZE / 2;
        const corners = [
            new THREE.Vector3(-halfWidth, 0, 0),
            new THREE.Vector3(halfWidth, 0, 0),
            new THREE.Vector3(halfWidth, CASE_HEIGHT, 0),
            new THREE.Vector3(-halfWidth, CASE_HEIGHT, 0)
        ];
        for (let corner = 0; corner < 4; corner += 1) {
            edgePoints.push(corners[corner].clone(), corners[(corner + 1) % 4].clone());
        }
        const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints);
        const edges = new THREE.LineSegments(edgeGeometry, sideEdgeMaterial);
        edges.renderOrder = 31;
        pivot.add(edges);

        panels.push({ hinge, pivot });
    }

    const lidGroup = new THREE.Group();
    lidGroup.position.y = CASE_TOP;
    group.add(lidGroup);

    const lid = new THREE.Mesh(new THREE.PlaneGeometry(CASE_SIZE, CASE_SIZE), topMaterial);
    lid.rotation.x = -Math.PI / 2;
    lid.renderOrder = 30;
    lidGroup.add(lid);

    const lidEdgePoints = [];
    const lidCorners = [
        new THREE.Vector3(-HALF_SIZE, 0, -HALF_SIZE),
        new THREE.Vector3(HALF_SIZE, 0, -HALF_SIZE),
        new THREE.Vector3(HALF_SIZE, 0, HALF_SIZE),
        new THREE.Vector3(-HALF_SIZE, 0, HALF_SIZE)
    ];
    for (let corner = 0; corner < 4; corner += 1) {
        lidEdgePoints.push(lidCorners[corner].clone(), lidCorners[(corner + 1) % 4].clone());
    }
    const lidEdges = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(lidEdgePoints),
        topEdgeMaterial
    );
    lidEdges.renderOrder = 31;
    lidGroup.add(lidEdges);

    // 顶盖四周的金色细框
    const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0xa47d49,
        metalness: 0.95,
        roughness: 0.26,
        envMapIntensity: 0.7,
        transparent: true,
        opacity: 1
    });
    const rimGeometry = new THREE.BoxGeometry(CASE_SIZE + 0.02, 0.018, 0.018);
    for (let side = 0; side < 4; side += 1) {
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        const angle = side * Math.PI * 0.5;
        rim.position.set(
            Math.sin(angle) * HALF_SIZE,
            0.012,
            Math.cos(angle) * HALF_SIZE
        );
        rim.rotation.y = angle;
        lidGroup.add(rim);
    }

    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x15100d,
        metalness: 0.55,
        roughness: 0.34,
        envMapIntensity: 0.55
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.02, 0.26, 5.02), baseMaterial);
    plinth.position.y = 0.17;
    group.add(plinth);

    const plinthTop = new THREE.Mesh(
        new THREE.BoxGeometry(4.58, 0.07, 4.58),
        new THREE.MeshStandardMaterial({
            color: 0x231a14,
            metalness: 0.4,
            roughness: 0.4,
            envMapIntensity: 0.5
        })
    );
    plinthTop.position.y = 0.305;
    group.add(plinthTop);

    const brassMaterial = new THREE.MeshStandardMaterial({
        color: 0x9d7744,
        metalness: 0.98,
        roughness: 0.24,
        envMapIntensity: 0.85
    });
    const trimGeometry = new THREE.BoxGeometry(5.06, 0.025, 0.045);
    for (let side = 0; side < 4; side += 1) {
        const angle = side * Math.PI * 0.5;
        const trim = new THREE.Mesh(trimGeometry, brassMaterial);
        trim.position.set(
            Math.sin(angle) * 2.53,
            0.292,
            Math.cos(angle) * 2.53
        );
        trim.rotation.y = angle;
        group.add(trim);
    }

    const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 0.26),
        new THREE.MeshBasicMaterial({
            map: createPlaqueTexture(),
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        })
    );
    plaque.position.set(0, 0.175, 2.518);
    group.add(plaque);

    /**
     * 控制玻璃罩开启程度
     * @param {number} progress 0 为关闭，1 为完全打开
     */
    function setOpen(progress) {
        const safeProgress = clamp(progress, 0, 1);
        const eased = easeOutCubic(safeProgress);
        const angle = eased * Math.PI * 0.46;
        for (const panel of panels) {
            panel.pivot.rotation.x = angle;
        }

        const sideFade = 1 - smoothstep(0.5, 1, safeProgress) * 0.72;
        sideMaterial.uniforms.uOpacity.value = sideFade;
        sideEdgeMaterial.opacity = 0.24 * sideFade;
        sideMaterial.uniforms.uGlow.value = 1 + Math.sin(safeProgress * Math.PI) * 1.2;

        const lidFade = 1 - smoothstep(0.06, 0.72, safeProgress);
        topMaterial.uniforms.uOpacity.value = lidFade;
        topEdgeMaterial.opacity = 0.3 * lidFade;
        topMaterial.uniforms.uGlow.value = 1 + Math.sin(safeProgress * Math.PI) * 1.5;
        rimMaterial.opacity = lidFade;
        rimMaterial.depthWrite = lidFade > 0.01;
        lidGroup.position.y = CASE_TOP + eased * 1.5;
        lidGroup.rotation.x = eased * 0.13;
    }

    setOpen(0);

    return {
        group,
        setOpen,
        materials: {
            sideMaterial,
            topMaterial,
            sideEdgeMaterial,
            topEdgeMaterial
        },
        bounds: {
            size: CASE_SIZE,
            height: CASE_HEIGHT,
            bottom: CASE_BOTTOM,
            top: CASE_TOP
        }
    };
}

/**
 * 创建玻璃罩边缘的飞散粒子
 * @param {object} options 配置
 * @param {number} options.seed 随机种子
 * @param {number} options.count 粒子数量
 * @returns {THREE.BufferGeometry} 飞散粒子几何体
 */
export function createGlassBurstGeometry({ seed = 4455, count = 1800 } = {}) {
    const random = createRandom(seed);
    const positions = [];
    const velocities = [];
    const colors = [];
    const sizes = [];
    const seeds = [];
    const delays = [];
    const gold = new THREE.Color('#f3d59d');
    const rose = new THREE.Color('#e78086');
    const ice = new THREE.Color('#bcd8ea');

    for (let index = 0; index < count; index += 1) {
        let start;
        const edgeChoice = random();
        if (edgeChoice < 0.46) {
            // 顶盖的四条边
            const side = Math.floor(random() * 4);
            const along = (random() * 2 - 1) * HALF_SIZE;
            const topY = CASE_BOTTOM + CASE_HEIGHT + random() * 0.05;
            if (side === 0) {
                start = new THREE.Vector3(along, topY, HALF_SIZE);
            } else if (side === 1) {
                start = new THREE.Vector3(along, topY, -HALF_SIZE);
            } else if (side === 2) {
                start = new THREE.Vector3(HALF_SIZE, topY, along);
            } else {
                start = new THREE.Vector3(-HALF_SIZE, topY, along);
            }
        } else if (edgeChoice < 0.78) {
            // 四根立柱
            const corner = Math.floor(random() * 4);
            const y = CASE_BOTTOM + random() * CASE_HEIGHT;
            start = new THREE.Vector3(
                corner < 2 ? HALF_SIZE : -HALF_SIZE,
                y,
                corner % 2 === 0 ? HALF_SIZE : -HALF_SIZE
            );
        } else {
            // 玻璃表面偶尔泛起的光点
            const side = Math.floor(random() * 4);
            const along = (random() * 2 - 1) * HALF_SIZE;
            const y = CASE_BOTTOM + random() * CASE_HEIGHT;
            if (side === 0) {
                start = new THREE.Vector3(along, y, HALF_SIZE);
            } else if (side === 1) {
                start = new THREE.Vector3(along, y, -HALF_SIZE);
            } else if (side === 2) {
                start = new THREE.Vector3(HALF_SIZE, y, along);
            } else {
                start = new THREE.Vector3(-HALF_SIZE, y, along);
            }
        }

        const outward = new THREE.Vector3(start.x, 0, start.z);
        if (outward.lengthSq() < 0.01) {
            const angle = random() * Math.PI * 2;
            outward.set(Math.cos(angle), 0, Math.sin(angle));
        }
        outward.normalize();
        const speed = 0.24 + random() * 0.74;
        const lift = 0.1 + random() * 0.46;
        const velocity = outward.multiplyScalar(speed);
        velocity.y += lift;

        positions.push(start.x, start.y, start.z);
        velocities.push(velocity.x, velocity.y, velocity.z);
        const color = gold.clone().lerp(rose, random() * 0.24);
        color.lerp(ice, random() * 0.16);
        colors.push(color.r, color.g, color.b);
        sizes.push(0.006 + random() * 0.012);
        seeds.push(random());
        delays.push(random() * 0.45);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocities, 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(delays, 1));
    geometry.computeBoundingSphere();
    return geometry;
}
