import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './styles.css';
import { createBouquetGeometry } from './geometry.js';
import { createGlassBurstGeometry, createGlassCase } from './glassCase.js';
import { LOVE_MESSAGES } from './loveMessages.js';
import {
    createBackdropMaterial,
    createFallingPetalMaterial,
    createFinalGradeShader,
    createFloorMaterial,
    createParticleMaterial,
    createSparkMaterial
} from './materials.js';
import {
    PointCloudBuilder,
    createRandom,
    easeOutCubic,
    lerp,
    smoothstep
} from './utils.js';

const CANVAS_ID = 'stage';
const MAX_PIXEL_RATIO = 1.75;
const MOBILE_PIXEL_RATIO = 1.45;

const isMobile = window.matchMedia('(max-width: 720px)').matches
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const quality = isMobile ? 0.62 : 1;
const singleRoseMode = new URLSearchParams(window.location.search).has('rose');

const clock = {
    startedAt: performance.now() / 1000,
    last: performance.now() / 1000,
    elapsedTime: 0
};
const animatedMaterials = new Set();
const state = {
    mode: 'loading',
    time: 0,
    openProgress: 0,
    rotation: 0,
    spinVelocity: 0,
    dragging: false,
    lastPointerX: 0,
    pointerX: 0,
    pointerY: 0,
    burstVisible: false
};

let renderer;
let scene;
let camera;
let composer;
let bloomPass;
let gradePass;
let bouquetGroup;
let bouquetMaterials;
let glassCase;
let sparkMaterial;
let motesMaterial;
let fallingPetalMaterial;
let openStateTime = 0;
let fitDistance = 9;
let projectionScale = 1200;
let statusElement;
let hintElement;
let hintButton;
let replayButton;
let cursorElement;
let loveRibbonLayer;
let lastOpeningMessage = '';
let loveDeck = [];

/**
 * 创建金属底座所需的环境反射
 * @returns {THREE.Texture} 环境贴图
 */
function createEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentScene = new RoomEnvironment();
    const environment = pmremGenerator.fromScene(environmentScene, 0.04).texture;
    pmremGenerator.dispose();
    environmentScene.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        if (child.material) {
            child.material.dispose();
        }
    });
    return environment;
}

/**
 * 创建舞台背景与地面
 * @returns {object} 舞台材质集合
 */
function createStage() {
    const backdropMaterial = createBackdropMaterial();
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), backdropMaterial);
    backdrop.position.set(0, 2.15, -13);
    backdrop.renderOrder = -100;
    backdrop.name = 'backdrop';
    scene.add(backdrop);

    const floorMaterial = createFloorMaterial();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 96), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.012;
    floor.renderOrder = 1;
    floor.name = 'floor';
    scene.add(floor);

    const ambient = new THREE.AmbientLight(0x2b1b15, 0.7);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffd2a1, 3.4);
    keyLight.position.set(-4.5, 7.2, 5.6);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7596c7, 1.5);
    rimLight.position.set(5.2, 3.4, -6.2);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xff775c, 8, 9, 2);
    fillLight.position.set(2.7, 2.4, 3.2);
    scene.add(fillLight);

    return { backdropMaterial, floorMaterial };
}

/**
 * 创建花束与配套材质
 * @returns {object} 粒子材质与数量信息
 */
function createBouquet() {
    const geometry = createBouquetGeometry({
        quality,
        seed: 20261020,
        singleRose: singleRoseMode
    });
    bouquetGroup = new THREE.Group();
    bouquetGroup.name = 'bouquet';
    bouquetGroup.scale.setScalar(1.05);
    scene.add(bouquetGroup);

    const solidMaterial = createParticleMaterial({
        opacity: 1,
        size: isMobile ? 1.18 : 1,
        twinkle: 0.015,
        sway: 0.004,
        drift: 0.003,
        rimColor: new THREE.Color(0.72, 0.46, 0.3)
    });
    const solidPoints = new THREE.Points(geometry.solids, solidMaterial);
    solidPoints.name = 'bouquet-solids';
    solidPoints.renderOrder = 10;
    bouquetGroup.add(solidPoints);

    const glowMaterial = createParticleMaterial({
        opacity: 0.72,
        size: 1.1,
        intensity: 1.25,
        twinkle: 0.16,
        sway: 0.003,
        drift: 0.003,
        blending: THREE.AdditiveBlending
    });
    const glowPoints = new THREE.Points(geometry.glow, glowMaterial);
    glowPoints.name = 'bouquet-glow';
    glowPoints.renderOrder = 11;
    bouquetGroup.add(glowPoints);

    return {
        solidMaterial,
        glowMaterial,
        solidCount: geometry.solidCount,
        glowCount: geometry.glowCount
    };
}

/**
 * 创建游离在空气中的尘埃粒子
 * @param {() => number} random 随机函数
 * @param {number} count 数量
 * @param {number} innerRadius 内半径
 * @param {number} outerRadius 外半径
 * @param {number} minY 最低高度
 * @param {number} maxY 最高高度
 * @returns {THREE.BufferGeometry} 尘埃几何体
 */
function createDustGeometry(random, count, innerRadius, outerRadius, minY, maxY) {
    const builder = new PointCloudBuilder();
    const warm = new THREE.Color('#e2bd83');
    const cool = new THREE.Color('#9db7d4');
    const normal = new THREE.Vector3(0, 1, 0);

    for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(
            lerp(innerRadius * innerRadius, outerRadius * outerRadius, random())
        );
        const position = new THREE.Vector3(
            Math.cos(angle) * radius,
            lerp(minY, maxY, Math.pow(random(), 0.8)),
            Math.sin(angle) * radius
        );
        const color = warm.clone().lerp(cool, random() * 0.45);
        color.multiplyScalar(0.42 + random() * 0.38);
        builder.add(
            position,
            normal,
            color,
            0.0035 + Math.pow(random(), 3.2) * 0.016,
            random(),
            0.2 + random() * 0.5
        );
    }

    return builder.build();
}

/**
 * 创建粒子尘埃对象
 * @returns {object} 尘埃材质
 */
function createAtmosphere() {
    const random = createRandom(77123);
    const dustMaterial = createParticleMaterial({
        opacity: 0.48,
        size: 1,
        intensity: 0.66,
        twinkle: 0.5,
        sway: 0.05,
        drift: 0.02,
        swirl: 0.025,
        blending: THREE.AdditiveBlending,
        rimColor: new THREE.Color(0.62, 0.52, 0.66)
    });
    const dustPoints = new THREE.Points(
        createDustGeometry(random, isMobile ? 700 : 1500, 0.2, 4.6, 0.18, 5.5),
        dustMaterial
    );
    dustPoints.name = 'dust';
    dustPoints.renderOrder = 16;
    scene.add(dustPoints);

    motesMaterial = createParticleMaterial({
        opacity: 0,
        size: 1.2,
        intensity: 1.55,
        twinkle: 0.65,
        sway: 0.1,
        drift: 0.035,
        swirl: 0.08,
        blending: THREE.AdditiveBlending
    });
    const motePoints = new THREE.Points(
        createDustGeometry(random, isMobile ? 520 : 1150, 0.6, 2.2, 1.1, 4.1),
        motesMaterial
    );
    motePoints.name = 'motes';
    motePoints.renderOrder = 17;
    scene.add(motePoints);

    return { dustMaterial, motesMaterial };
}

/**
 * 创建缓慢飘落的花瓣
 * @returns {object} 花瓣材质
 */
function createFallingPetals() {
    const random = createRandom(31801);
    const count = isMobile ? 42 : 76;
    const positions = [];
    const colors = [];
    const sizes = [];
    const seeds = [];
    const rose = new THREE.Color('#a11a31');
    const deep = new THREE.Color('#5f0c1b');
    const gold = new THREE.Color('#d8b37a');

    for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2;
        const radius = 0.35 + Math.pow(random(), 0.7) * 1.35;
        positions.push(
            Math.cos(angle) * radius,
            1.0 + random() * 2.9,
            Math.sin(angle) * radius
        );
        const color = deep.clone().lerp(rose, 0.3 + random() * 0.6);
        if (random() < 0.12) {
            color.lerp(gold, 0.5);
        }
        colors.push(color.r, color.g, color.b);
        sizes.push(0.035 + Math.pow(random(), 1.4) * 0.055);
        seeds.push(random());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.computeBoundingSphere();

    fallingPetalMaterial = createFallingPetalMaterial();
    const petals = new THREE.Points(geometry, fallingPetalMaterial);
    petals.name = 'falling-petals';
    petals.renderOrder = 19;
    petals.frustumCulled = false;
    scene.add(petals);

    return fallingPetalMaterial;
}

/**
 * 创建玻璃罩与边缘飞散粒子
 * @returns {object} 玻璃罩和飞散粒子
 */
function createCaseAndBurst() {
    glassCase = createGlassCase();
    glassCase.group.name = 'glass-case';
    glassCase.group.visible = !singleRoseMode;
    scene.add(glassCase.group);

    const burstGeometry = createGlassBurstGeometry({ seed: 4455, count: isMobile ? 850 : 1800 });
    sparkMaterial = createSparkMaterial();
    sparkMaterial.uniforms.uLife.value = 2.8;
    sparkMaterial.uniforms.uIntensity.value = 0.9;
    sparkMaterial.uniforms.uOpacity.value = 0.82;
    const burst = new THREE.Points(burstGeometry, sparkMaterial);
    burst.name = 'glass-burst';
    burst.renderOrder = 25;
    burst.frustumCulled = false;
    scene.add(burst);

    return burst;
}

/**
 * 初始化后处理
 */
function createPostProcessing() {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.36,
        0.55,
        0.58
    );
    composer.addPass(bloomPass);

    gradePass = new ShaderPass(createFinalGradeShader());
    composer.addPass(gradePass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);
}

/**
 * 计算让展示罩完整入镜的相机距离
 * @returns {number} 相机距离
 */
function computeFitDistance() {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = 5.55 / (2 * Math.tan(verticalFov / 2));
    const fitWidth = 5.05 / (2 * Math.tan(verticalFov / 2) * camera.aspect);
    return Math.max(fitHeight, fitWidth) * 1.035;
}

/**
 * 根据视口更新尺寸、投影比例和相机
 */
function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        isMobile ? MOBILE_PIXEL_RATIO : MAX_PIXEL_RATIO
    );

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    projectionScale = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    fitDistance = computeFitDistance();
    camera.position.z = fitDistance;

    if (composer) {
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);
    }
}

/**
 * 收集需要每帧更新 uniform 的材质
 */
function registerAnimatedMaterials() {
    animatedMaterials.clear();
    scene.traverse((child) => {
        if (child.material && child.material.uniforms && child.material.uniforms.uTime) {
            animatedMaterials.add(child.material);
        }
    });
}

/**
 * 更新所有粒子材质的公共 uniform
 * @param {number} elapsed 当前时间
 * @param {number} pixelRatio 像素比
 * @param {number} scale 投影比例
 */
function updateParticleUniforms(elapsed, pixelRatio, scale) {
    for (const material of animatedMaterials) {
        if (material.uniforms.uTime) {
            material.uniforms.uTime.value = elapsed;
        }
        if (material.uniforms.uPixelRatio) {
            material.uniforms.uPixelRatio.value = pixelRatio;
        }
        if (material.uniforms.uProjectionScale) {
            material.uniforms.uProjectionScale.value = scale;
        }
    }
    if (gradePass) {
        gradePass.uniforms.uTime.value = elapsed;
    }
}

/**
 * 切换界面状态
 * @param {string} mode 状态名称
 */
function setInterfaceMode(mode) {
    const body = document.body;
    body.classList.toggle('is-opening', mode === 'opening' || mode === 'open');
    body.classList.toggle('is-open', mode === 'open');
    body.classList.toggle('is-closing', mode === 'closing');
    body.classList.toggle('is-revealed', mode === 'open');
    if (hintElement) {
        hintElement.setAttribute('aria-hidden', mode === 'closed' ? 'false' : 'true');
    }
    if (hintButton) {
        hintButton.disabled = mode !== 'closed';
    }
    if (replayButton) {
        replayButton.tabIndex = mode === 'open' ? 0 : -1;
        replayButton.setAttribute('aria-hidden', mode === 'open' ? 'false' : 'true');
    }
    if (statusElement) {
        if (mode === 'open') {
            statusElement.textContent = '玻璃罩已打开，花束开始缓慢旋转。';
        } else if (mode === 'closed') {
            statusElement.textContent = '玻璃罩已合拢，可以再次轻触开启。';
        }
    }
}

/**
 * 打乱情话顺序
 * @returns {string[]} 随机排序后的情话
 */
function shuffleLoveMessages() {
    const messages = LOVE_MESSAGES.slice();
    for (let index = messages.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [messages[index], messages[target]] = [messages[target], messages[index]];
    }
    return messages;
}

/**
 * 从情话牌堆中抽取本次要飘出的内容
 * @param {number} count 数量
 * @returns {string[]} 不重复的情话
 */
function drawLoveMessages(count) {
    if (loveDeck.length < count) {
        loveDeck = loveDeck.concat(shuffleLoveMessages());
    }
    return loveDeck.splice(0, count);
}

/**
 * 清除正在飘动的文字彩条
 */
function clearLoveRibbons() {
    if (loveRibbonLayer) {
        loveRibbonLayer.replaceChildren();
    }
}

/**
 * 开盒时随机飘出写给刘烨的文字彩条
 */
function spawnLoveRibbons() {
    if (!loveRibbonLayer) {
        return;
    }

    clearLoveRibbons();

    const tones = ['rose', 'blush', 'gold', 'wine'];
    const baseCount = reduceMotion ? 7 : (isMobile ? 14 : 22);
    const count = baseCount + Math.floor(Math.random() * 4);
    const messages = drawLoveMessages(count);

    if (messages[0] === lastOpeningMessage && messages.length > 1) {
        [messages[0], messages[1]] = [messages[1], messages[0]];
    }
    lastOpeningMessage = messages[0];

    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width * 0.5;
    const centerY = height * (isMobile ? 0.4 : 0.43);

    for (let index = 0; index < count; index += 1) {
        const message = messages[index % messages.length];
        const tone = tones[Math.floor(Math.random() * tones.length)];
        const element = document.createElement('div');
        element.className = `love-ribbon love-ribbon--${tone}`;
        if (Math.random() < 0.26) {
            element.classList.add('is-accent');
        }
        element.textContent = message;

        const startAngle = Math.random() * Math.PI * 2;
        const startRadiusX = width * (0.02 + Math.random() * 0.085);
        const startRadiusY = height * (0.012 + Math.random() * 0.055);
        const startX = centerX + Math.cos(startAngle) * startRadiusX;
        const startY = centerY + Math.sin(startAngle) * startRadiusY;
        element.style.left = `${startX}px`;
        element.style.top = `${startY}px`;
        loveRibbonLayer.appendChild(element);

        const stagger = reduceMotion ? 0 : (index / count) * 2400;
        const delay = 160 + stagger + Math.random() * 380;
        const duration = reduceMotion ? 3600 : 4300 + Math.random() * 2500;
        const startRotation = (Math.random() * 2 - 1) * 5;
        const endRotation = startRotation + (Math.random() * 2 - 1) * 16;

        if (reduceMotion) {
            const animation = element.animate([
                {
                    opacity: 0,
                    transform: `translate(-50%, -50%) rotate(${startRotation}deg) scale(0.92)`
                },
                {
                    opacity: 1,
                    offset: 0.16,
                    transform: `translate(-50%, -50%) rotate(${startRotation}deg) scale(1)`
                },
                {
                    opacity: 0,
                    transform: `translate(-50%, -50%) rotate(${endRotation}deg) scale(1)`
                }
            ], {
                duration,
                delay,
                easing: 'ease-out',
                fill: 'both'
            });
            animation.onfinish = () => element.remove();
            continue;
        }

        const travelAngle = startAngle + (Math.random() - 0.5) * 0.65;
        const distance = width * (0.13 + Math.random() * 0.22);
        const travelX = Math.cos(travelAngle) * distance;
        const travelY = Math.sin(travelAngle) * distance * 0.45
            - height * (0.07 + Math.random() * 0.21);

        const animation = element.animate([
            {
                opacity: 0,
                transform: `translate(-50%, -50%) translate(0px, 0px) rotate(${startRotation * 0.4}deg) scale(0.7)`
            },
            {
                opacity: 1,
                offset: 0.18,
                transform: `translate(-50%, -50%) translate(${travelX * 0.16}px, ${travelY * 0.12}px) rotate(${startRotation * 0.65}deg) scale(0.94)`
            },
            {
                opacity: 0.92,
                offset: 0.64,
                transform: `translate(-50%, -50%) translate(${travelX * 0.64}px, ${travelY * 0.7}px) rotate(${endRotation}deg) scale(1)`
            },
            {
                opacity: 0,
                transform: `translate(-50%, -50%) translate(${travelX}px, ${travelY}px) rotate(${endRotation * 1.15}deg) scale(1.03)`
            }
        ], {
            duration,
            delay,
            easing: 'cubic-bezier(0.18, 0.72, 0.24, 1)',
            fill: 'both'
        });
        animation.onfinish = () => element.remove();
    }
}

/**
 * 打开玻璃罩
 */
function openCase() {
    if (state.mode !== 'closed') {
        return;
    }
    state.mode = 'opening';
    state.time = 0;
    state.openProgress = 0.001;
    state.openStartedAt = performance.now() / 1000;
    openStateTime = 0;
    state.dragging = false;
    state.spinVelocity = 0;
    state.burstVisible = true;
    sparkMaterial.uniforms.uOriginTime.value = clock.elapsedTime + 0.14;
    setInterfaceMode('opening');
    spawnLoveRibbons();
}

/**
 * 合拢玻璃罩
 */
function closeCase() {
    if (state.mode !== 'open' && state.mode !== 'opening') {
        return;
    }
    state.mode = 'closing';
    state.time = 0;
    state.closeStartedAt = performance.now() / 1000;
    state.closeStartProgress = state.openProgress;
    state.dragging = false;
    state.spinVelocity = 0;
    state.burstVisible = false;
    sparkMaterial.uniforms.uOriginTime.value = -1;
    clearLoveRibbons();
    setInterfaceMode('closing');
}

/**
 * 绑定鼠标、键盘和按钮事件
 */
function bindInteraction() {
    const canvas = document.getElementById(CANVAS_ID);

    canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
            return;
        }
        if (state.mode === 'closed') {
            openCase();
            return;
        }
        if (state.mode === 'open') {
            state.dragging = true;
            state.lastPointerX = event.clientX;
            canvas.setPointerCapture(event.pointerId);
        }
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!state.dragging) {
            return;
        }
        const delta = event.clientX - state.lastPointerX;
        state.lastPointerX = event.clientX;
        state.rotation += delta * 0.0052;
        state.spinVelocity = delta * 0.0036;
    });

    const endDrag = (event) => {
        if (!state.dragging) {
            return;
        }
        state.dragging = false;
        if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    hintButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openCase();
    });

    replayButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeCase();
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            if (state.mode === 'closed') {
                event.preventDefault();
                openCase();
            }
        }
        if (event.key === 'Escape') {
            closeCase();
        }
    });

    window.addEventListener('pointermove', (event) => {
        state.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
        state.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
        if (cursorElement && document.body.classList.contains('has-fine-pointer')) {
            cursorElement.style.left = `${event.clientX}px`;
            cursorElement.style.top = `${event.clientY}px`;
            cursorElement.classList.add('is-visible');
        }
    });

    window.addEventListener('pointerdown', () => {
        if (cursorElement) {
            cursorElement.classList.add('is-pressed');
        }
    });

    window.addEventListener('pointerup', () => {
        if (cursorElement) {
            cursorElement.classList.remove('is-pressed');
        }
    });

    window.addEventListener('pointerleave', () => {
        if (cursorElement) {
            cursorElement.classList.remove('is-visible');
        }
    });

    if (window.matchMedia('(pointer: fine)').matches) {
        document.body.classList.add('has-fine-pointer');
    }
}

/**
 * 每帧更新场景
 */
function updateScene() {
    const now = performance.now() / 1000;
    const delta = Math.min(now - clock.last, 0.1);
    clock.last = now;
    clock.elapsedTime = now - clock.startedAt;
    const elapsed = clock.elapsedTime;
    state.time += delta;

    if (state.mode === 'opening') {
        openStateTime = Math.max(0, now - state.openStartedAt);
        state.openProgress = Math.min(1, openStateTime / 1.42);
        if (openStateTime > 1.08 && !document.body.classList.contains('is-revealed')) {
            document.body.classList.add('is-revealed');
            replayButton.tabIndex = 0;
            replayButton.setAttribute('aria-hidden', 'false');
            if (statusElement) {
                statusElement.textContent = '玻璃罩已打开，花束开始缓慢旋转。';
            }
        }
        if (state.openProgress >= 1) {
            state.mode = 'open';
            setInterfaceMode('open');
        }
    } else if (state.mode === 'closing') {
        const closingElapsed = Math.max(0, now - state.closeStartedAt);
        const closeProgress = Math.max(0, 1 - closingElapsed / 1.05);
        state.openProgress = state.closeStartProgress * closeProgress;
        if (state.openProgress <= 0.001) {
            state.openProgress = 0;
            state.mode = 'closed';
            state.rotation = 0;
            setInterfaceMode('closed');
        }
    }

    glassCase.setOpen(state.openProgress);

    const openEase = easeOutCubic(state.openProgress);
    const autoSpin = reduceMotion ? 0.018 : 0.088;
    if (state.mode === 'open' || state.mode === 'opening') {
        if (!state.dragging) {
            state.rotation += autoSpin * delta * (0.2 + openEase * 0.8);
            state.rotation += state.spinVelocity * delta;
            state.spinVelocity *= Math.exp(-delta * 3.1);
        }
    } else if (state.mode === 'closing') {
        state.rotation = lerp(state.rotation, 0, Math.min(1, delta * 1.9));
    }

    bouquetGroup.rotation.y = state.rotation;
    bouquetGroup.rotation.z = reduceMotion ? 0 : Math.sin(elapsed * 0.32) * 0.004;
    const breath = reduceMotion ? 0 : Math.sin(elapsed * 0.55) * 0.006;
    bouquetGroup.position.y = breath;

    // 玻璃打开后让花束向外舒展，最终略宽于底座
    const bloomEase = smoothstep(0.55, 1, state.openProgress);
    const bloomScale = 1 + bloomEase * 0.32;
    bouquetGroup.scale.set(1.05 * bloomScale, 1.05, 1.05 * bloomScale);

    if (bouquetMaterials) {
        const materialMotion = state.mode === 'open' || state.mode === 'opening' ? bloomEase : 0;
        bouquetMaterials.solidMaterial.uniforms.uSway.value = 0.003 + materialMotion * 0.008;
        bouquetMaterials.solidMaterial.uniforms.uDrift.value = 0.002 + materialMotion * 0.0045;
        bouquetMaterials.glowMaterial.uniforms.uSway.value = 0.004 + materialMotion * 0.014;
        bouquetMaterials.glowMaterial.uniforms.uDrift.value = 0.003 + materialMotion * 0.007;
        bouquetMaterials.glowMaterial.uniforms.uSwirl.value = 0.003 + materialMotion * 0.01;
    }

    const targetDistance = fitDistance * (1 + openEase * 0.06);
    const driftX = reduceMotion ? 0 : Math.sin(elapsed * 0.18) * 0.08;
    const targetX = state.pointerX * 0.16 + driftX;
    const targetY = 5.4 - openEase * 0.16 + state.pointerY * 0.045
        + (reduceMotion ? 0 : Math.sin(elapsed * 0.23) * 0.018);
    const follow = Math.min(1, delta * 2.2);

    camera.position.x = lerp(camera.position.x, targetX, follow);
    camera.position.y = lerp(camera.position.y, targetY, follow);
    camera.position.z = lerp(camera.position.z, targetDistance, Math.min(1, delta * 2.8));
    camera.lookAt(0, 2.4 + openEase * 0.03, 0);

    motesMaterial.uniforms.uOpacity.value = lerp(
        motesMaterial.uniforms.uOpacity.value,
        state.mode === 'open' ? 0.78 : 0.1,
        Math.min(1, delta * 3.0)
    );

    if (fallingPetalMaterial) {
        fallingPetalMaterial.uniforms.uOpacity.value = lerp(
            fallingPetalMaterial.uniforms.uOpacity.value,
            state.mode === 'open' ? 0.68 : 0,
            Math.min(1, delta * 2.2)
        );
    }

    if (state.burstVisible && sparkMaterial.uniforms.uOriginTime.value < 0) {
        state.burstVisible = false;
    }

    updateParticleUniforms(
        elapsed,
        renderer.getPixelRatio(),
        projectionScale
    );

    if (gradePass) {
        gradePass.uniforms.uAmount.value = 1;
    }

    composer.render();
}

/**
 * 预创建场景并启动渲染循环
 */
async function boot() {
    await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    try {
        renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById(CANVAS_ID),
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
    } catch (error) {
        document.body.classList.add('has-error');
        const fallback = document.querySelector('.fallback');
        if (fallback) {
            fallback.hidden = false;
        }
        return;
    }

    renderer.setClearColor(0x030303, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.shadowMap.enabled = false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030303);
    scene.environment = createEnvironment();
    scene.environmentIntensity = 0.38;

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 5.4, 9.2);
    camera.lookAt(0, 2.4, 0);

    statusElement = document.getElementById('status');
    hintElement = document.getElementById('hint');
    hintButton = document.getElementById('enter');
    replayButton = document.getElementById('replay');
    cursorElement = document.getElementById('cursor');
    loveRibbonLayer = document.getElementById('love-ribbons');

    createStage();
    const bouquetInfo = createBouquet();
    bouquetMaterials = bouquetInfo;
    createAtmosphere();
    createFallingPetals();
    createCaseAndBurst();
    handleResize();
    createPostProcessing();
    bindInteraction();
    registerAnimatedMaterials();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    state.mode = 'closed';
    setInterfaceMode('closed');
    updateParticleUniforms(0, renderer.getPixelRatio(), projectionScale);
    renderer.compile(scene, camera);
    composer.render();

    if (import.meta.env.DEV) {
        window.__NOCTURNE__ = {
            scene,
            camera,
            renderer,
            composer,
            bouquetGroup,
            glassCase,
            sparkMaterial,
            motesMaterial,
            state,
            openCase,
            closeCase
        };
    }

    document.body.classList.add('is-ready');
    setTimeout(() => {
        const veil = document.getElementById('veil');
        if (veil) {
            veil.classList.add('is-gone');
        }
    }, 160);

    if (bouquetInfo.solidCount) {
        document.documentElement.dataset.particles = String(
            bouquetInfo.solidCount + bouquetInfo.glowCount
        );
    }

    clock.startedAt = performance.now() / 1000;
    clock.last = clock.startedAt;
    renderer.setAnimationLoop(updateScene);
}

boot();
