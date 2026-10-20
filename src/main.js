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
    pointerDown: false,
    pointerStartX: 0,
    pointerStartY: 0,
    pointerMoved: false,
    lastPointerMove: 0,
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
let fingerPetalLayer;
let dragHintElement;
let loveLetterElement;
let dragHintShowTimer;
let dragHintHideTimer;
let letterTimer;
let lastOpeningMessage = '';
let loveDeck = [];
let bouquetLayout = [];
let roseProgressElement;
let roseCountElement;
let roseBarElement;
let roseNoteElement;
let roseNoteTimer;
let goldenMarker;
let goldenMarkerMaterial;
let roseMarkSprites = [];
let roseMarkTexture;
let roseMessageDeck = [];
let roseState = {
    discovered: new Set(),
    goldenIndex: -1,
    goldenFound: false,
    allFound: false,
    messages: []
};
let secretLetterElement;
let secretLetterCloseButton;
let secretLetterOpen = false;
let musicToggleElement;
let backgroundMusic;
let musicFadeTimer;
let musicEnabled = true;
let musicAutoplayBlocked = false;
let lightControlElement;
let lightOrbElement;
let lightDragging = false;
let lightDragStartX = 0;
let lightDragStartY = 0;
let lightStartAzimuth = 0;
let lightStartElevation = 0;
let lightAzimuth = 2.33;
let lightElevation = 0.96;
let stageLights;
let taglineElement;
let loveLetterTextElement;
let loveLetterBackElement;
let loveLetterEyebrowElement;
let loveLetterDailyElement;
let loveLetterCloseButton;
let letterToggleElement;
let letterToggleTextElement;
let guideToggleElement;
let guideModalElement;
let guideCloseButton;
let typewriterTimer;
let typewriterIndex = 0;
let lastFingerPetalTime = 0;
let activeRoseBursts = 0;
const pointerNdc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane();
const pointerWorld = new THREE.Vector3();
const pointerLocal = new THREE.Vector3();
const pointerCameraDirection = new THREE.Vector3();
const roseHitPoint = new THREE.Vector3();
const roseSphere = new THREE.Sphere();
const roseRay = new THREE.Ray();
const roseInverseMatrix = new THREE.Matrix4();

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

    return { backdropMaterial, floorMaterial, keyLight, rimLight, fillLight };
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
        layout: geometry.layout,
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
    const portraitMobile = isMobile && window.innerHeight > window.innerWidth;
    const heightTarget = portraitMobile ? 5.8 : 5.55;
    const widthTarget = portraitMobile ? 3.2 : 5.05;
    const fitHeight = heightTarget / (2 * Math.tan(verticalFov / 2));
    const fitWidth = widthTarget / (2 * Math.tan(verticalFov / 2) * camera.aspect);
    return Math.max(fitHeight, fitWidth) * 1.02;
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
 * 根据当前时间段取一句每日情话
 * @returns {string} 今日结尾文案
 */
function getDailyLine() {
    const now = new Date();
    const hour = now.getHours();
    const daySeed = Math.floor(
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000
    );
    let period = 'evening';
    if (hour < 5) {
        period = 'late';
    } else if (hour < 11) {
        period = 'morning';
    } else if (hour < 17) {
        period = 'afternoon';
    } else if (hour >= 22) {
        period = 'late';
    }

    const lines = {
        morning: [
            '刘烨，早安，今天也要开心。',
            '刘烨，醒来有花，今天会很好。',
            '刘烨，把清晨的第一束光送给你。'
        ],
        afternoon: [
            '刘烨，午后的花，和想你的心一样明亮。',
            '刘烨，今天也偷偷想你了。',
            '刘烨，愿这束花点亮你的下午。'
        ],
        evening: [
            '刘烨，今夜玫瑰替我说话。',
            '刘烨，今晚的浪漫专属于你。',
            '刘烨，忙完一天，来看看花吧。'
        ],
        late: [
            '刘烨，晚安，梦里也要有花香。',
            '刘烨，夜深了，花替你守着好梦。',
            '刘烨，今天辛苦了，晚安。'
        ]
    };

    const pool = lines[period];
    return pool[daySeed % pool.length];
}

/**
 * 更新底部的每日情话
 */
function updateDailyLine() {
    const line = getDailyLine();
    if (taglineElement) {
        taglineElement.textContent = line;
    }
    if (loveLetterDailyElement) {
        loveLetterDailyElement.textContent = line;
    }
}

/**
 * 从情话牌堆中抽取玫瑰点击文案
 * @param {number} count 数量
 * @returns {string[]} 不重复的情话
 */
function drawRoseMessages(count) {
    if (roseMessageDeck.length < count) {
        roseMessageDeck = roseMessageDeck.concat(shuffleLoveMessages());
    }
    return roseMessageDeck.splice(0, count);
}

/**
 * 隐藏拖拽提示
 */
function hideDragHint() {
    clearTimeout(dragHintHideTimer);
    if (dragHintElement) {
        dragHintElement.classList.remove('is-visible');
        dragHintElement.setAttribute('aria-hidden', 'true');
    }
}

/**
 * 清除开盒后的提示与信卡
 */
function clearOpenOverlays() {
    clearTimeout(dragHintShowTimer);
    clearTimeout(dragHintHideTimer);
    clearTimeout(letterTimer);
    hideDragHint();
    resetLoveLetterCard();
}

/**
 * 等彩条飘起后显示拖拽提示，最后落下一封信
 */
function scheduleOpenOverlays() {
    clearOpenOverlays();

    dragHintShowTimer = setTimeout(() => {
        if (state.mode !== 'opening' && state.mode !== 'open') {
            return;
        }
        if (state.hasDragged) {
            return;
        }
        if (dragHintElement) {
            dragHintElement.classList.add('is-visible');
            dragHintElement.setAttribute('aria-hidden', 'false');
        }
        dragHintHideTimer = setTimeout(hideDragHint, 4200);
    }, 2400);

    letterTimer = setTimeout(() => {
        if (state.mode !== 'open') {
            return;
        }
        showLetterPrompt(false);
    }, reduceMotion ? 5600 : 8200);
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
    const baseCount = reduceMotion ? 6 : (isMobile ? 12 : 18);
    const count = baseCount + Math.floor(Math.random() * 3);
    const messages = drawLoveMessages(count);

    if (messages[0] === lastOpeningMessage && messages.length > 1) {
        [messages[0], messages[1]] = [messages[1], messages[0]];
    }
    lastOpeningMessage = messages[0];

    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width * 0.5;
    const centerY = height * (isMobile ? 0.38 : 0.42);
    const edgePadding = isMobile ? 14 : 32;

    for (let index = 0; index < count; index += 1) {
        const message = messages[index % messages.length];
        const tone = tones[Math.floor(Math.random() * tones.length)];
        const element = document.createElement('div');
        element.className = `love-ribbon love-ribbon--${tone}`;
        if (Math.random() < 0.26) {
            element.classList.add('is-accent');
        }
        element.textContent = message;
        loveRibbonLayer.appendChild(element);

        const halfWidth = element.offsetWidth / 2;
        const halfHeight = element.offsetHeight / 2;
        const startAngle = Math.random() * Math.PI * 2;
        const startRadiusX = width * (isMobile ? 0.11 : 0.1)
            + Math.random() * width * 0.06;
        const startRadiusY = height * (isMobile ? 0.045 : 0.05)
            + Math.random() * height * 0.035;
        const startX = Math.max(
            halfWidth + edgePadding,
            Math.min(
                width - halfWidth - edgePadding,
                centerX + Math.cos(startAngle) * startRadiusX
            )
        );
        const startY = Math.max(
            halfHeight + edgePadding,
            Math.min(height * 0.63, centerY + Math.sin(startAngle) * startRadiusY)
        );
        element.style.left = `${startX}px`;
        element.style.top = `${startY}px`;

        const wave = index % 3;
        const waveStart = [160, 1350, 2600][wave];
        const delay = reduceMotion ? 160 + Math.random() * 400 : waveStart + Math.random() * 420;
        const duration = reduceMotion ? 3600 : 4400 + Math.random() * 2200;
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

        const travelAngle = startAngle + (Math.random() - 0.5) * 0.55;
        const distance = width * (isMobile ? 0.15 : 0.14)
            + Math.random() * width * (isMobile ? 0.12 : 0.14);
        let travelX = Math.cos(travelAngle) * distance;
        let travelY = Math.sin(travelAngle) * distance * 0.38
            - height * (0.08 + Math.random() * 0.18);
        const endX = Math.max(
            halfWidth + edgePadding,
            Math.min(width - halfWidth - edgePadding, startX + travelX)
        );
        const endY = Math.max(
            halfHeight + edgePadding,
            Math.min(height - halfHeight - edgePadding, startY + travelY)
        );
        travelX = endX - startX;
        travelY = endY - startY;

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
 * 获取玫瑰花朵的局部中心
 * @param {object} head 玫瑰布局
 * @param {THREE.Vector3} target 复用目标向量
 * @returns {THREE.Vector3} 局部中心
 */
function roseHeadLocalCenter(head, target = new THREE.Vector3()) {
    return target
        .set(0, 0.22, 0)
        .applyQuaternion(head.quaternion)
        .multiplyScalar(head.scale)
        .add(head.position);
}

/**
 * 判断点击位置命中了哪一朵玫瑰
 * @param {number} clientX 屏幕横坐标
 * @param {number} clientY 屏幕纵坐标
 * @returns {number} 玫瑰索引，未命中返回 -1
 */
function pickRoseAt(clientX, clientY) {
    if (!camera || !bouquetGroup || state.mode !== 'open' || bouquetLayout.length === 0) {
        return -1;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);

    bouquetGroup.updateMatrixWorld(true);
    roseInverseMatrix.copy(bouquetGroup.matrixWorld).invert();
    roseRay.copy(raycaster.ray).applyMatrix4(roseInverseMatrix);

    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < bouquetLayout.length; index += 1) {
        const head = bouquetLayout[index];
        const center = roseHeadLocalCenter(head);
        roseSphere.set(center, 0.52 * head.scale);
        if (roseRay.intersectSphere(roseSphere, roseHitPoint)) {
            const distance = roseHitPoint.distanceToSquared(roseRay.origin);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        }
    }
    return bestIndex;
}

/**
 * 创建金色玫瑰的微光标记
 */
function createGoldenMarker() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 236, 188, 0.9)');
    gradient.addColorStop(0.22, 'rgba(243, 203, 130, 0.48)');
    gradient.addColorStop(0.55, 'rgba(209, 148, 72, 0.12)');
    gradient.addColorStop(1, 'rgba(120, 60, 20, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    goldenMarkerMaterial = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffd79a,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    goldenMarker = new THREE.Sprite(goldenMarkerMaterial);
    goldenMarker.visible = false;
    goldenMarker.renderOrder = 22;
    bouquetGroup.add(goldenMarker);
}

/**
 * 把金色微光移动到随机选中的玫瑰上
 */
function positionGoldenMarker() {
    if (!goldenMarker || roseState.goldenIndex < 0 || !bouquetLayout[roseState.goldenIndex]) {
        return;
    }
    const head = bouquetLayout[roseState.goldenIndex];
    roseHeadLocalCenter(head, goldenMarker.position);
    const scale = 1.0 * head.scale;
    goldenMarker.scale.set(scale, scale, 1);
    goldenMarker.visible = true;
    goldenMarkerMaterial.opacity = 0.38;
}

/**
 * 创建玫瑰轮廓环贴图
 * @returns {THREE.CanvasTexture} 环形贴图
 */
function createRoseMarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 248, 225, 1)');
    gradient.addColorStop(0.18, 'rgba(255, 222, 160, 0.92)');
    gradient.addColorStop(0.48, 'rgba(230, 170, 90, 0.24)');
    gradient.addColorStop(1, 'rgba(120, 60, 20, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * 给每朵玫瑰建立一个小金色光点
 */
function buildRoseHalos() {
    roseMarkSprites = [];
    roseMarkTexture = createRoseMarkTexture();

    for (const head of bouquetLayout) {
        const material = new THREE.SpriteMaterial({
            map: roseMarkTexture,
            color: 0xffd79a,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false
        });
        const sprite = new THREE.Sprite(material);
        roseHeadLocalCenter(head, sprite.position);
        sprite.position.y += 0.08;
        const scale = 0.14 * head.scale;
        sprite.scale.set(scale, scale, 1);
        sprite.renderOrder = 12;
        bouquetGroup.add(sprite);
        roseMarkSprites.push(sprite);
    }
}

/**
 * 把已经听过的玫瑰标记恢复为未听状态
 */
function resetRoseHalos() {
    for (const sprite of roseMarkSprites) {
        sprite.material.opacity = 0;
    }
}

/**
 * 在一朵玫瑰上留下小小的金色光点
 * @param {number} index 玫瑰索引
 */
function markRoseHalo(index) {
    const sprite = roseMarkSprites[index];
    if (!sprite) {
        return;
    }
    sprite.material.opacity = 0.9;
}

/**
 * 重置寻花彩蛋
 */
function resetRoseHunt() {
    clearTimeout(roseNoteTimer);
    roseState.discovered.clear();
    roseState.goldenIndex = Math.floor(Math.random() * bouquetLayout.length);
    roseState.goldenFound = false;
    roseState.allFound = false;
    roseState.messages = drawRoseMessages(bouquetLayout.length);

    if (roseNoteElement) {
        roseNoteElement.classList.remove('is-visible', 'is-golden');
        roseNoteElement.replaceChildren();
    }
    if (roseProgressElement) {
        roseProgressElement.classList.remove('is-visible', 'is-complete');
        roseProgressElement.setAttribute('aria-hidden', 'true');
    }
    if (roseCountElement) {
        roseCountElement.textContent = '0';
    }
    if (roseBarElement) {
        roseBarElement.style.width = '0%';
    }

    resetRoseHalos();
    resetLoveLetterCard();
    positionGoldenMarker();
}

/**
 * 隐藏寻花进度和标记
 */
function hideRoseHuntUI() {
    clearTimeout(roseNoteTimer);
    resetRoseHalos();
    if (roseNoteElement) {
        roseNoteElement.classList.remove('is-visible', 'is-golden');
    }
    if (roseProgressElement) {
        roseProgressElement.classList.remove('is-visible');
        roseProgressElement.setAttribute('aria-hidden', 'true');
    }
    if (goldenMarker) {
        goldenMarker.visible = false;
    }
    closeSecretLetter();
}

/**
 * 在玫瑰位置生成一小簇粒子
 * @param {number} index 玫瑰索引
 * @param {boolean} golden 是否为金色玫瑰
 */
function spawnRoseBurst(index, golden = false) {
    if (!bouquetLayout[index] || activeRoseBursts >= 6) {
        return;
    }
    activeRoseBursts += 1;

    bouquetGroup.updateMatrixWorld(true);
    roseHeadLocalCenter(bouquetLayout[index], pointerLocal);
    pointerLocal.applyMatrix4(bouquetGroup.matrixWorld);

    const count = golden ? 110 : (isMobile ? 46 : 64);
    const positions = [];
    const velocities = [];
    const colors = [];
    const sizes = [];
    const seeds = [];
    const delays = [];
    const gold = new THREE.Color('#f6d9a2');
    const rose = new THREE.Color('#d95468');
    const deep = new THREE.Color('#7d142a');

    for (let particle = 0; particle < count; particle += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const radius = 0.08 + Math.random() * 0.38;
        const offset = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * radius,
            Math.cos(phi) * radius * 0.7 + 0.1,
            Math.sin(phi) * Math.sin(theta) * radius
        );
        positions.push(
            pointerLocal.x + offset.x,
            pointerLocal.y + offset.y,
            pointerLocal.z + offset.z
        );

        const speed = 0.2 + Math.random() * 0.65;
        velocities.push(
            offset.x * speed * 2.4,
            0.18 + Math.random() * 0.5,
            offset.z * speed * 2.4
        );

        const color = golden || Math.random() < 0.3
            ? gold.clone().lerp(rose, Math.random() * 0.28)
            : rose.clone().lerp(deep, Math.random() * 0.55);
        colors.push(color.r, color.g, color.b);
        sizes.push(0.008 + Math.random() * 0.014);
        seeds.push(Math.random());
        delays.push(Math.random() * 0.08);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocities, 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(delays, 1));
    geometry.computeBoundingSphere();

    const material = createSparkMaterial();
    material.uniforms.uLife.value = golden ? 1.8 : 1.25;
    material.uniforms.uIntensity.value = golden ? 1.7 : 1.15;
    material.uniforms.uOpacity.value = 0.9;
    material.uniforms.uOriginTime.value = clock.elapsedTime;
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    material.uniforms.uProjectionScale.value = projectionScale;

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 26;
    points.frustumCulled = false;
    scene.add(points);
    animatedMaterials.add(material);

    setTimeout(() => {
        scene.remove(points);
        animatedMaterials.delete(material);
        geometry.dispose();
        material.dispose();
        activeRoseBursts = Math.max(0, activeRoseBursts - 1);
    }, golden ? 2400 : 1800);
}

/**
 * 在点击的玫瑰上方显示一句情话
 * @param {number} index 玫瑰索引
 * @param {string} message 情话
 * @param {boolean} golden 是否为金色玫瑰
 * @param {boolean} repeat 是否为重复点击
 */
function showRoseNote(index, message, golden = false, repeat = false) {
    if (!roseNoteElement || !bouquetLayout[index]) {
        return;
    }

    bouquetGroup.updateMatrixWorld(true);
    roseHeadLocalCenter(bouquetLayout[index], pointerLocal);
    pointerLocal.applyMatrix4(bouquetGroup.matrixWorld);
    pointerWorld.copy(pointerLocal).project(camera);

    const screenX = (pointerWorld.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-pointerWorld.y * 0.5 + 0.5) * window.innerHeight;
    const halfWidth = Math.min(window.innerWidth * 0.36, 220);
    const left = window.innerWidth <= 720
        ? window.innerWidth * 0.5
        : Math.max(halfWidth + 16, Math.min(window.innerWidth - halfWidth - 16, screenX));
    const top = Math.max(128, Math.min(window.innerHeight * 0.66, screenY + 22));

    roseNoteElement.style.left = `${left}px`;
    roseNoteElement.style.top = `${top}px`;

    const indexLabel = document.createElement('span');
    indexLabel.className = 'rose-note__index';
    if (repeat) {
        indexLabel.textContent = `第 ${index + 1} 朵 · 已听过`;
    } else if (golden) {
        indexLabel.textContent = `GOLDEN ROSE · 第 ${index + 1} 朵`;
    } else {
        indexLabel.textContent = `第 ${index + 1} 朵 · 已听见`;
    }
    const text = document.createElement('span');
    text.textContent = message;
    roseNoteElement.replaceChildren(indexLabel, text);
    roseNoteElement.classList.toggle('is-golden', golden && !repeat);
    roseNoteElement.classList.toggle('is-repeat', repeat);
    roseNoteElement.classList.add('is-visible');

    clearTimeout(roseNoteTimer);
    roseNoteTimer = setTimeout(() => {
        roseNoteElement.classList.remove('is-visible');
    }, 4200);
}

/**
 * 更新寻花进度
 */
function updateRoseProgress() {
    if (!roseProgressElement) {
        return;
    }
    const found = roseState.discovered.size;
    const total = bouquetLayout.length;
    roseProgressElement.classList.add('is-visible');
    roseProgressElement.setAttribute('aria-hidden', 'false');
    if (roseCountElement) {
        roseCountElement.textContent = String(found);
    }
    if (roseBarElement) {
        roseBarElement.style.width = `${(found / total) * 100}%`;
    }
    roseProgressElement.classList.toggle('is-complete', found === total);
}

/**
 * 处理点击玫瑰
 * @param {number} index 玫瑰索引
 */
function handleRoseClick(index) {
    if (index < 0 || secretLetterOpen || !bouquetLayout[index]) {
        return;
    }

    const message = roseState.messages[index] || '刘烨，这一朵花也听见你了。';
    const isNew = !roseState.discovered.has(index);
    const isGolden = index === roseState.goldenIndex;

    if (!isNew) {
        spawnRoseBurst(index, false);
        showRoseNote(index, '这朵已经听过了，换一朵还没听过的吧。', false, true);
        return;
    }

    roseState.discovered.add(index);
    markRoseHalo(index);
    hideDragHint();

    spawnRoseBurst(index, isGolden);
    showRoseNote(index, message, isGolden);

    if (isGolden && !roseState.goldenFound) {
        roseState.goldenFound = true;
        if (goldenMarker) {
            goldenMarker.visible = false;
        }
        setTimeout(() => {
            if (!secretLetterOpen && state.mode === 'open' && roseState.goldenFound) {
                openSecretLetter();
            }
        }, 650);
    }

    updateRoseProgress();

    if (roseState.discovered.size === bouquetLayout.length && !roseState.allFound) {
        completeRoseHunt();
    }
}

/**
 * 十九朵全部点亮后的完整结尾
 */
function completeRoseHunt() {
    roseState.allFound = true;
    clearTimeout(roseNoteTimer);
    if (roseNoteElement) {
        roseNoteElement.classList.remove('is-visible');
    }
    stopTypewriter();
    if (loveLetterElement) {
        loveLetterElement.classList.remove('is-flipped');
    }
    if (loveLetterBackElement) {
        loveLetterBackElement.textContent = '';
        loveLetterBackElement.classList.remove('is-complete');
    }
    if (roseProgressElement) {
        roseProgressElement.classList.add('is-complete');
    }
    if (loveLetterEyebrowElement) {
        loveLetterEyebrowElement.textContent = 'To 刘烨 · 19 / 19';
    }
    if (loveLetterTextElement) {
        loveLetterTextElement.innerHTML = '十九朵玫瑰，你都听见了。<br>往后的花期，都想和你一起看。';
    }
    if (document.body.classList.contains('is-letter')) {
        showLoveLetter();
    } else {
        showLetterPrompt(true);
    }
    spawnRoseBurst(0, true);
}

/**
 * 打开隐藏长信
 */
function openSecretLetter() {
    if (!secretLetterElement || secretLetterOpen) {
        return;
    }
    secretLetterOpen = true;
    secretLetterElement.hidden = false;
    document.body.classList.add('is-secret');
    if (secretLetterCloseButton) {
        secretLetterCloseButton.focus({ preventScroll: true });
    }
}

/**
 * 关闭隐藏长信
 */
function closeSecretLetter() {
    if (!secretLetterElement || !secretLetterOpen) {
        return;
    }
    secretLetterOpen = false;
    secretLetterElement.hidden = true;
    document.body.classList.remove('is-secret');
    const focusTarget = letterToggleElement && letterToggleElement.classList.contains('is-visible')
        ? letterToggleElement
        : guideToggleElement;
    if (focusTarget) {
        focusTarget.focus({ preventScroll: true });
    }
}

/**
 * 打开玩法说明
 */
function openGuide() {
    if (!guideModalElement) {
        return;
    }
    guideModalElement.hidden = false;
    document.body.classList.add('is-guide');
    if (guideToggleElement) {
        guideToggleElement.classList.add('is-seen');
    }
    if (guideCloseButton) {
        guideCloseButton.focus({ preventScroll: true });
    }
}

/**
 * 关闭玩法说明
 */
function closeGuide() {
    if (!guideModalElement || guideModalElement.hidden) {
        return;
    }
    guideModalElement.hidden = true;
    document.body.classList.remove('is-guide');
    if (guideToggleElement) {
        guideToggleElement.focus({ preventScroll: true });
    }
}

/**
 * 显示“读信”提示
 * @param {boolean} complete 是否已集齐十九朵
 */
function showLetterPrompt(complete = false) {
    if (!letterToggleElement || document.body.classList.contains('is-letter')) {
        return;
    }
    hideDragHint();
    letterToggleElement.classList.add('is-visible');
    letterToggleElement.classList.toggle('is-complete', complete);
    letterToggleElement.setAttribute('aria-hidden', 'false');
    if (letterToggleTextElement) {
        letterToggleTextElement.textContent = complete ? '完整信 · 读信' : '有一封信 · 读信';
    }
}

/**
 * 隐藏“读信”提示
 */
function hideLetterPrompt() {
    if (!letterToggleElement) {
        return;
    }
    letterToggleElement.classList.remove('is-visible');
    letterToggleElement.setAttribute('aria-hidden', 'true');
}

/**
 * 显示结尾信卡
 */
function showLoveLetter() {
    if (!loveLetterElement) {
        return;
    }
    clearTimeout(letterTimer);
    hideLetterPrompt();
    clearTimeout(roseNoteTimer);
    if (roseNoteElement) {
        roseNoteElement.classList.remove('is-visible');
    }
    hideDragHint();
    document.body.classList.add('is-letter');
    loveLetterElement.setAttribute('aria-hidden', 'false');
    loveLetterElement.tabIndex = 0;
    loveLetterElement.focus({ preventScroll: true });
}

/**
 * 收起结尾信卡
 */
function hideLoveLetter() {
    if (!loveLetterElement || !document.body.classList.contains('is-letter')) {
        return;
    }
    document.body.classList.remove('is-letter');
    loveLetterElement.setAttribute('aria-hidden', 'true');
    loveLetterElement.tabIndex = -1;
    stopTypewriter();
    loveLetterElement.classList.remove('is-flipped');
    if (loveLetterBackElement) {
        loveLetterBackElement.textContent = '';
        loveLetterBackElement.classList.remove('is-complete');
    }
    showLetterPrompt(roseState.allFound);
    if (letterToggleElement) {
        letterToggleElement.focus({ preventScroll: true });
    }
}

/**
 * 停止打字机效果
 */
function stopTypewriter() {
    if (typewriterTimer) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
    }
}

/**
 * 在信卡背面逐字打出长信
 */
function startTypewriter() {
    stopTypewriter();
    if (!loveLetterBackElement) {
        return;
    }

    const letter = [
        '刘烨：',
        '',
        '花会开也会谢，但我想陪你，把每个普通日子都过成花期。',
        '',
        '今晚这束玫瑰，替我说一句：很喜欢你。'
    ].join('\n');

    typewriterIndex = 0;
    loveLetterBackElement.textContent = '';
    loveLetterBackElement.classList.remove('is-complete');
    typewriterTimer = setInterval(() => {
        typewriterIndex += 1;
        loveLetterBackElement.textContent = letter.slice(0, typewriterIndex);
        if (typewriterIndex >= letter.length) {
            stopTypewriter();
            loveLetterBackElement.classList.add('is-complete');
        }
    }, 38);
}

/**
 * 翻面信卡
 */
function toggleLoveLetter() {
    if (!loveLetterElement || !document.body.classList.contains('is-letter')) {
        return;
    }
    const flipped = loveLetterElement.classList.toggle('is-flipped');
    if (flipped) {
        startTypewriter();
    } else {
        stopTypewriter();
        if (loveLetterBackElement) {
            loveLetterBackElement.textContent = '';
            loveLetterBackElement.classList.remove('is-complete');
        }
    }
}

/**
 * 重置信卡内容与翻面状态
 */
function resetLoveLetterCard() {
    stopTypewriter();
    hideLetterPrompt();
    if (!loveLetterElement) {
        return;
    }
    loveLetterElement.classList.remove('is-flipped');
    loveLetterElement.tabIndex = -1;
    loveLetterElement.setAttribute('aria-hidden', 'true');
    if (loveLetterEyebrowElement) {
        loveLetterEyebrowElement.textContent = 'To 刘烨';
    }
    if (loveLetterTextElement) {
        loveLetterTextElement.innerHTML = '花会替我，<br>把没说完的话慢慢说完。';
    }
    if (loveLetterBackElement) {
        loveLetterBackElement.textContent = '';
        loveLetterBackElement.classList.remove('is-complete');
    }
    document.body.classList.remove('is-letter');
}

/**
 * 更新主光方向
 */
function applyLightDirection() {
    const direction = new THREE.Vector3(
        Math.cos(lightElevation) * Math.cos(lightAzimuth),
        Math.sin(lightElevation),
        Math.cos(lightElevation) * Math.sin(lightAzimuth)
    ).normalize();

    for (const material of animatedMaterials) {
        if (material.uniforms.uKeyDir) {
            material.uniforms.uKeyDir.value.copy(direction);
        }
    }
    if (glassCase) {
        const sideMaterial = glassCase.materials.sideMaterial;
        const topMaterial = glassCase.materials.topMaterial;
        if (sideMaterial.uniforms.uLightDir) {
            sideMaterial.uniforms.uLightDir.value.copy(direction);
        }
        if (topMaterial.uniforms.uLightDir) {
            topMaterial.uniforms.uLightDir.value.copy(direction);
        }
    }
    if (stageLights && stageLights.keyLight) {
        stageLights.keyLight.position.copy(direction).multiplyScalar(14);
    }
    if (lightControlElement) {
        const value = Math.round(((lightElevation - 0.18) / 1.2) * 100);
        lightControlElement.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, value))));
    }
}

/**
 * 切换主光方向
 * @param {number} azimuth 方位角
 * @param {number} elevation 高度角
 */
function setLightDirection(azimuth, elevation) {
    lightAzimuth = azimuth;
    lightElevation = Math.max(0.18, Math.min(1.38, elevation));
    applyLightDirection();
}

/**
 * 更新音乐开关文案
 */
function updateMusicButton() {
    if (!musicToggleElement) {
        return;
    }
    musicToggleElement.textContent = musicEnabled ? '音乐 开' : '音乐 关';
    musicToggleElement.setAttribute('aria-pressed', String(musicEnabled));
}

/**
 * 淡入或淡出背景音乐
 * @param {number} target 目标音量
 * @param {number} duration 时长（毫秒）
 * @param {Function} onDone 完成回调
 */
function fadeMusicVolume(target, duration, onDone) {
    if (!backgroundMusic) {
        return;
    }
    clearInterval(musicFadeTimer);
    const startVolume = backgroundMusic.volume;
    const startedAt = performance.now();
    musicFadeTimer = setInterval(() => {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        const volume = startVolume + (target - startVolume) * progress;
        backgroundMusic.volume = Math.max(0, Math.min(1, volume));
        if (progress >= 1) {
            clearInterval(musicFadeTimer);
            musicFadeTimer = null;
            if (onDone) {
                onDone();
            }
        }
    }, 40);
}

/**
 * 启动背景音乐并淡入
 */
function startBackgroundMusic() {
    if (!backgroundMusic) {
        return;
    }
    musicEnabled = true;
    updateMusicButton();
    if (backgroundMusic.paused) {
        backgroundMusic.volume = 0;
    }
    const playPromise = backgroundMusic.play();
    if (playPromise && playPromise.then) {
        playPromise.then(() => {
            musicAutoplayBlocked = false;
            fadeMusicVolume(0.34, 1800);
        }).catch(() => {
            musicAutoplayBlocked = true;
        });
    } else {
        fadeMusicVolume(0.34, 1800);
    }
}

/**
 * 页面加载时先尝试自动播放；被浏览器拦截时等待开盒手势
 */
function attemptBackgroundMusicAutoplay() {
    if (!backgroundMusic || !musicEnabled) {
        return;
    }
    backgroundMusic.volume = 0;
    const playPromise = backgroundMusic.play();
    if (playPromise && playPromise.then) {
        playPromise.then(() => {
            musicAutoplayBlocked = false;
            fadeMusicVolume(0.34, 1800);
        }).catch(() => {
            musicAutoplayBlocked = true;
        });
    } else {
        fadeMusicVolume(0.34, 1800);
    }
}

/**
 * 开启或关闭背景音乐
 */
function toggleMusic() {
    if (!backgroundMusic) {
        return;
    }

    if (!musicEnabled) {
        startBackgroundMusic();
        return;
    }

    musicEnabled = false;
    updateMusicButton();
    fadeMusicVolume(0, 650, () => {
        if (!musicEnabled) {
            backgroundMusic.pause();
        }
    });
}

/**
 * 打开玻璃罩
 */
function openCase() {
    if (state.mode !== 'closed') {
        return;
    }
    if (musicEnabled && backgroundMusic && (musicAutoplayBlocked || backgroundMusic.paused)) {
        startBackgroundMusic();
    }
    state.mode = 'opening';
    state.time = 0;
    state.openProgress = 0.001;
    state.openStartedAt = performance.now() / 1000;
    openStateTime = 0;
    state.dragging = false;
    state.spinVelocity = 0;
    state.hasDragged = false;
    state.burstVisible = true;
    sparkMaterial.uniforms.uOriginTime.value = clock.elapsedTime + 0.14;
    resetRoseHunt();
    updateDailyLine();
    setInterfaceMode('opening');
    spawnLoveRibbons();
    scheduleOpenOverlays();
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
    hideRoseHuntUI();
    closeGuide();
    clearOpenOverlays();
    setInterfaceMode('closing');
}

/**
 * 把指针位置映射到花束局部坐标，驱动粒子避让
 * @param {number} clientX 屏幕横坐标
 * @param {number} clientY 屏幕纵坐标
 */
function updateRosePointerInfluence(clientX, clientY) {
    if (!bouquetMaterials || state.mode !== 'open' || secretLetterOpen) {
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
    camera.getWorldDirection(pointerCameraDirection);
    pointerPlane.setFromNormalAndCoplanarPoint(
        pointerCameraDirection,
        new THREE.Vector3(0, 2.3, 0)
    );

    if (raycaster.ray.intersectPlane(pointerPlane, pointerWorld)) {
        pointerLocal.copy(pointerWorld);
        bouquetGroup.worldToLocal(pointerLocal);
        for (const material of [bouquetMaterials.solidMaterial, bouquetMaterials.glowMaterial]) {
            material.uniforms.uPointer.value.copy(pointerLocal);
            material.uniforms.uPointerStrength.value = 1;
        }
        state.lastPointerMove = performance.now() / 1000;
    }
}

/**
 * 指尖拂过时飘出几片小花瓣
 * @param {number} clientX 屏幕横坐标
 * @param {number} clientY 屏幕纵坐标
 */
function spawnFingerPetals(clientX, clientY) {
    if (!fingerPetalLayer || state.mode !== 'open' || secretLetterOpen || reduceMotion) {
        return;
    }

    const now = performance.now();
    if (now - lastFingerPetalTime < 95) {
        return;
    }
    lastFingerPetalTime = now;

    const count = 1 + Math.floor(Math.random() * 2);
    while (fingerPetalLayer.childElementCount > 36) {
        fingerPetalLayer.firstElementChild.remove();
    }

    for (let index = 0; index < count; index += 1) {
        const petal = document.createElement('span');
        petal.className = 'finger-petal';
        const size = 6 + Math.random() * 6;
        petal.style.left = `${clientX + (Math.random() - 0.5) * 18}px`;
        petal.style.top = `${clientY + (Math.random() - 0.5) * 14}px`;
        petal.style.width = `${size}px`;
        petal.style.height = `${size * 0.55}px`;
        fingerPetalLayer.appendChild(petal);

        const driftX = (Math.random() - 0.5) * 90;
        const driftY = -35 - Math.random() * 80;
        const rotation = (Math.random() * 2 - 1) * 120;
        const animation = petal.animate([
            {
                opacity: 0,
                transform: 'translate(-50%, -50%) rotate(0deg) scale(0.7)'
            },
            {
                opacity: 0.82,
                offset: 0.18,
                transform: 'translate(-50%, -50%) rotate(20deg) scale(1)'
            },
            {
                opacity: 0,
                transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${driftY}px)) rotate(${rotation}deg) scale(0.55)`
            }
        ], {
            duration: 850 + Math.random() * 650,
            easing: 'cubic-bezier(0.18, 0.7, 0.28, 1)',
            fill: 'both'
        });
        animation.onfinish = () => petal.remove();
    }
}

/**
 * 绑定鼠标、键盘和按钮事件
 */
function bindInteraction() {
    const canvas = document.getElementById(CANVAS_ID);
    const coarsePointer = window.matchMedia('(pointer: coarse)');

    // 移动端长按不呼出系统菜单，整页也不允许进入文字选择状态
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('contextmenu', (event) => {
        if (coarsePointer.matches) {
            event.preventDefault();
        }
    });
    document.addEventListener('selectstart', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
            return;
        }
        if (state.mode === 'closed') {
            openCase();
            return;
        }
        if (state.mode === 'open') {
            state.pointerDown = true;
            state.pointerStartX = event.clientX;
            state.pointerStartY = event.clientY;
            state.pointerMoved = false;
            state.dragging = false;
            state.lastPointerX = event.clientX;
            canvas.setPointerCapture(event.pointerId);
        }
    });

    canvas.addEventListener('pointermove', (event) => {
        if (state.mode === 'open') {
            updateRosePointerInfluence(event.clientX, event.clientY);
            spawnFingerPetals(event.clientX, event.clientY);
        }

        if (!state.pointerDown) {
            return;
        }

        const distance = Math.hypot(
            event.clientX - state.pointerStartX,
            event.clientY - state.pointerStartY
        );
        if (!state.dragging && distance > 6) {
            state.dragging = true;
            state.hasDragged = true;
            state.lastPointerX = event.clientX;
            hideDragHint();
            if (roseNoteElement) {
                roseNoteElement.classList.remove('is-visible');
            }
        }

        if (state.dragging) {
            const delta = event.clientX - state.lastPointerX;
            state.lastPointerX = event.clientX;
            state.rotation += delta * 0.0052;
            state.spinVelocity = delta * 0.0036;
        }
    });

    const endPointer = (event, cancelled = false) => {
        if (!state.pointerDown) {
            return;
        }
        const wasDragging = state.dragging;
        state.pointerDown = false;
        state.dragging = false;

        if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }

        if (!cancelled && !wasDragging) {
            const index = pickRoseAt(event.clientX, event.clientY);
            if (index >= 0) {
                handleRoseClick(index);
            }
        }
    };

    canvas.addEventListener('pointerup', (event) => endPointer(event, false));
    canvas.addEventListener('pointercancel', (event) => endPointer(event, true));
    canvas.addEventListener('pointerleave', () => {
        if (bouquetMaterials) {
            bouquetMaterials.solidMaterial.uniforms.uPointerStrength.value = 0;
            bouquetMaterials.glowMaterial.uniforms.uPointerStrength.value = 0;
        }
    });

    hintButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openCase();
    });

    replayButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeCase();
    });

    if (musicToggleElement) {
        musicToggleElement.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleMusic();
        });
    }

    if (loveLetterElement) {
        loveLetterElement.addEventListener('click', (event) => {
            if (event.target.closest('.love-letter__close')) {
                return;
            }
            event.stopPropagation();
            toggleLoveLetter();
        });
        loveLetterElement.addEventListener('keydown', (event) => {
            if (event.target.closest('.love-letter__close')) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleLoveLetter();
            }
        });
    }

    if (loveLetterCloseButton) {
        loveLetterCloseButton.addEventListener('click', (event) => {
            event.stopPropagation();
            hideLoveLetter();
        });
    }

    if (letterToggleElement) {
        letterToggleElement.addEventListener('click', (event) => {
            event.stopPropagation();
            showLoveLetter();
        });
    }

    if (guideToggleElement) {
        guideToggleElement.addEventListener('click', (event) => {
            event.stopPropagation();
            openGuide();
        });
    }
    if (guideCloseButton) {
        guideCloseButton.addEventListener('click', closeGuide);
    }
    if (guideModalElement) {
        const guideBackdrop = guideModalElement.querySelector('[data-guide-close]');
        if (guideBackdrop) {
            guideBackdrop.addEventListener('click', closeGuide);
        }
    }

    if (secretLetterCloseButton) {
        secretLetterCloseButton.addEventListener('click', closeSecretLetter);
    }
    if (secretLetterElement) {
        const backdrop = secretLetterElement.querySelector('[data-secret-close]');
        if (backdrop) {
            backdrop.addEventListener('click', closeSecretLetter);
        }
    }

    if (lightControlElement) {
        lightControlElement.addEventListener('pointerdown', (event) => {
            if (state.mode !== 'open') {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            lightDragging = true;
            lightDragStartX = event.clientX;
            lightDragStartY = event.clientY;
            lightStartAzimuth = lightAzimuth;
            lightStartElevation = lightElevation;
            lightControlElement.classList.add('is-dragging');
            lightControlElement.setPointerCapture(event.pointerId);
        });

        lightControlElement.addEventListener('pointermove', (event) => {
            if (!lightDragging) {
                return;
            }
            event.preventDefault();
            const deltaX = event.clientX - lightDragStartX;
            const deltaY = event.clientY - lightDragStartY;
            setLightDirection(
                lightStartAzimuth + deltaX * 0.011,
                lightStartElevation - deltaY * 0.008
            );
            if (lightOrbElement) {
                const offsetX = Math.max(-12, Math.min(12, deltaX * 0.18));
                const offsetY = Math.max(-12, Math.min(12, deltaY * 0.18));
                lightOrbElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            }
        });

        const endLightDrag = (event) => {
            if (!lightDragging) {
                return;
            }
            lightDragging = false;
            lightControlElement.classList.remove('is-dragging');
            if (lightOrbElement) {
                lightOrbElement.style.transform = '';
            }
            if (event.pointerId !== undefined && lightControlElement.hasPointerCapture(event.pointerId)) {
                lightControlElement.releasePointerCapture(event.pointerId);
            }
        };

        lightControlElement.addEventListener('pointerup', endLightDrag);
        lightControlElement.addEventListener('pointercancel', endLightDrag);
        lightControlElement.addEventListener('keydown', (event) => {
            const step = 0.08;
            if (event.key === 'ArrowLeft') {
                setLightDirection(lightAzimuth - step, lightElevation);
            } else if (event.key === 'ArrowRight') {
                setLightDirection(lightAzimuth + step, lightElevation);
            } else if (event.key === 'ArrowUp') {
                setLightDirection(lightAzimuth, lightElevation + step);
            } else if (event.key === 'ArrowDown') {
                setLightDirection(lightAzimuth, lightElevation - step);
            } else {
                return;
            }
            event.preventDefault();
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (!backgroundMusic) {
            return;
        }
        if (document.hidden) {
            backgroundMusic.pause();
        } else if (musicEnabled) {
            const playPromise = backgroundMusic.play();
            if (playPromise && playPromise.catch) {
                playPromise.catch(() => {});
            }
        }
    });

    window.addEventListener('keydown', (event) => {
        if (guideModalElement && !guideModalElement.hidden) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeGuide();
            }
            return;
        }
        if (secretLetterOpen) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeSecretLetter();
            }
            return;
        }
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
    const bloomAmount = isMobile ? 0.05 : 0.32;
    const bloomScale = 1 + bloomEase * bloomAmount;
    bouquetGroup.scale.set(1.05 * bloomScale, 1.05, 1.05 * bloomScale);

    if (bouquetMaterials) {
        const materialMotion = state.mode === 'open' || state.mode === 'opening' ? bloomEase : 0;
        bouquetMaterials.solidMaterial.uniforms.uSway.value = 0.003 + materialMotion * 0.008;
        bouquetMaterials.solidMaterial.uniforms.uDrift.value = 0.002 + materialMotion * 0.0045;
        bouquetMaterials.glowMaterial.uniforms.uSway.value = 0.004 + materialMotion * 0.014;
        bouquetMaterials.glowMaterial.uniforms.uDrift.value = 0.003 + materialMotion * 0.007;
        bouquetMaterials.glowMaterial.uniforms.uSwirl.value = 0.003 + materialMotion * 0.01;

        const pointerIdle = state.mode !== 'open' || now - state.lastPointerMove > 0.16;
        if (pointerIdle) {
            const decay = Math.min(1, delta * 5.5);
            bouquetMaterials.solidMaterial.uniforms.uPointerStrength.value = lerp(
                bouquetMaterials.solidMaterial.uniforms.uPointerStrength.value,
                0,
                decay
            );
            bouquetMaterials.glowMaterial.uniforms.uPointerStrength.value = lerp(
                bouquetMaterials.glowMaterial.uniforms.uPointerStrength.value,
                0,
                decay
            );
        }
    }

    if (goldenMarker && goldenMarker.visible && goldenMarkerMaterial) {
        goldenMarkerMaterial.opacity = 0.3 + Math.sin(elapsed * 1.5) * 0.09;
    }

    const targetDistance = fitDistance * (1 + openEase * (isMobile ? 0 : 0.06));
    const driftX = reduceMotion ? 0 : Math.sin(elapsed * 0.18) * 0.08;
    const targetX = state.pointerX * 0.16 + driftX;
    const targetY = 5.4 - openEase * 0.16 + state.pointerY * 0.045
        + (reduceMotion ? 0 : Math.sin(elapsed * 0.23) * 0.018);
    const follow = Math.min(1, delta * 2.2);

    camera.position.x = lerp(camera.position.x, targetX, follow);
    camera.position.y = lerp(camera.position.y, targetY, follow);
    camera.position.z = lerp(camera.position.z, targetDistance, Math.min(1, delta * 2.8));
    camera.lookAt(0, (isMobile ? 2.05 : 2.4) + openEase * 0.025, 0);

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
    fingerPetalLayer = document.getElementById('finger-petals');
    dragHintElement = document.getElementById('drag-hint');
    loveLetterElement = document.getElementById('love-letter');
    loveLetterTextElement = document.getElementById('love-letter-text');
    loveLetterBackElement = document.getElementById('love-letter-back');
    loveLetterEyebrowElement = document.getElementById('love-letter-eyebrow');
    loveLetterDailyElement = document.getElementById('love-letter-daily');
    loveLetterCloseButton = document.getElementById('love-letter-close');
    letterToggleElement = document.getElementById('letter-toggle');
    letterToggleTextElement = letterToggleElement
        ? letterToggleElement.querySelector('.letter-toggle__text')
        : null;
    guideToggleElement = document.getElementById('guide-toggle');
    guideModalElement = document.getElementById('guide-modal');
    guideCloseButton = document.getElementById('guide-close');
    roseProgressElement = document.getElementById('rose-progress');
    roseCountElement = document.getElementById('rose-count');
    roseBarElement = document.getElementById('rose-bar');
    roseNoteElement = document.getElementById('rose-note');
    secretLetterElement = document.getElementById('secret-letter');
    secretLetterCloseButton = document.getElementById('secret-letter-close');
    musicToggleElement = document.getElementById('music-toggle');
    backgroundMusic = document.getElementById('background-music');
    if (backgroundMusic) {
        backgroundMusic.volume = 0;
        backgroundMusic.addEventListener('error', () => {
            musicEnabled = false;
            updateMusicButton();
            if (musicToggleElement) {
                musicToggleElement.textContent = '音乐不可用';
                musicToggleElement.disabled = true;
            }
        });
    }
    updateMusicButton();
    attemptBackgroundMusicAutoplay();
    lightControlElement = document.getElementById('light-control');
    lightOrbElement = lightControlElement
        ? lightControlElement.querySelector('.light-control__orb')
        : null;
    taglineElement = document.getElementById('tagline');

    stageLights = createStage();
    const bouquetInfo = createBouquet();
    bouquetMaterials = bouquetInfo;
    bouquetLayout = bouquetInfo.layout;
    createGoldenMarker();
    buildRoseHalos();
    createAtmosphere();
    createFallingPetals();
    createCaseAndBurst();
    handleResize();
    createPostProcessing();
    bindInteraction();
    registerAnimatedMaterials();
    applyLightDirection();
    updateDailyLine();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    state.mode = 'closed';
    setInterfaceMode('closed');
    resetLoveLetterCard();
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
            bouquetMaterials,
            bouquetLayout,
            glassCase,
            sparkMaterial,
            motesMaterial,
            stageLights,
            roseState,
            state,
            openCase,
            closeCase,
            handleRoseClick,
            completeRoseHunt,
            resetRoseHunt,
            showLoveLetter,
            toggleLoveLetter,
            applyLightDirection,
            getRoseScreenPositions: () => bouquetLayout.map((head, index) => {
                const projected = roseHeadLocalCenter(head)
                    .applyMatrix4(bouquetGroup.matrixWorld)
                    .project(camera);
                return {
                    index,
                    x: (projected.x * 0.5 + 0.5) * window.innerWidth,
                    y: (-projected.y * 0.5 + 0.5) * window.innerHeight
                };
            })
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
