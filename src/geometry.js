import * as THREE from 'three';
import {
    PointCloudBuilder,
    clamp,
    createRandom,
    lerp,
    smoothstep
} from './utils.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const COLORS = {
    roseDeep: new THREE.Color('#25040b'),
    roseMid: new THREE.Color('#6f0a1d'),
    roseRed: new THREE.Color('#b01e37'),
    roseEdge: new THREE.Color('#d95365'),
    roseDew: new THREE.Color('#ffd0a8'),
    stemDark: new THREE.Color('#122719'),
    stemGreen: new THREE.Color('#29442d'),
    leafDeep: new THREE.Color('#15281a'),
    leafGreen: new THREE.Color('#34502f'),
    leafLight: new THREE.Color('#74845a'),
    champagneShadow: new THREE.Color('#57432d'),
    champagne: new THREE.Color('#bda37a'),
    champagneLight: new THREE.Color('#f0ddb9'),
    gold: new THREE.Color('#e6c28a'),
    wine: new THREE.Color('#560918'),
    wineLight: new THREE.Color('#a52a3f')
};

/**
 * 创建玫瑰的排列布局
 * @param {() => number} random 随机函数
 * @returns {Array<object>} 玫瑰位置和朝向
 */
function createRoseLayout(random) {
    const layout = [];
    const rings = [
        { count: 1, radius: 0, height: 3.64, tilt: 0.06, minScale: 0.96, maxScale: 1.0, offset: 0 },
        { count: 6, radius: 0.72, height: 3.4, tilt: 0.27, minScale: 0.9, maxScale: 0.98, offset: 0.38 },
        { count: 12, radius: 1.42, height: 3.08, tilt: 0.55, minScale: 0.84, maxScale: 0.92, offset: 0.14 }
    ];

    let roseIndex = 0;
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
        const ring = rings[ringIndex];
        for (let index = 0; index < ring.count; index += 1) {
            const angle = ring.offset
                + (index / ring.count) * Math.PI * 2
                + (random() - 0.5) * 0.12;
            const radius = ring.radius + (ring.radius > 0 ? (random() - 0.5) * 0.08 : 0);
            const position = new THREE.Vector3(
                Math.cos(angle) * radius,
                ring.height + (random() - 0.5) * 0.045,
                Math.sin(angle) * radius
            );
            const tilt = ring.tilt + (random() - 0.5) * 0.08;
            const axis = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize();
            const tiltRotation = new THREE.Quaternion().setFromAxisAngle(axis, -tilt);
            const yaw = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, random() * Math.PI * 2);
            layout.push({
                position,
                quaternion: tiltRotation.multiply(yaw),
                scale: ring.minScale + random() * (ring.maxScale - ring.minScale),
                radius,
                ringIndex,
                roseIndex
            });
            roseIndex += 1;
        }
    }

    return layout;
}

/**
 * 生成单片花瓣的曲面函数
 * @param {object} petal 花瓣参数
 * @returns {(u: number, v: number) => THREE.Vector3} 曲面函数
 */
function createPetalSurface(petal) {
    return (u, v) => {
        const radial = lerp(petal.inner, petal.outer, Math.pow(u, 0.92));
        const width = petal.width
            * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.45)
            * (1 - 0.12 * u);
        const angularOffset = clamp(
            (width * v * petal.wrap) / Math.max(radial, 0.12),
            -1.22,
            1.22
        );
        const angle = petal.angle
            + angularOffset
            + petal.swirl * Math.pow(u, 1.5);

        let height = petal.baseY
            + petal.arch * Math.sin(Math.PI * Math.pow(u, 0.78) * 0.9)
            - petal.tipDrop * Math.pow(u, 3);
        height += petal.cup * v * v * (0.35 + 0.65 * u);
        height += petal.tipCurl * Math.pow(u, 3) * v * v;
        height += petal.fold * Math.sin(v * Math.PI * 2 + petal.phase) * u;

        const ripple = Math.sin(v * Math.PI * 1.7 + petal.phase) * petal.fold * u;
        const radius = radial + ripple;

        return new THREE.Vector3(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
    };
}

/**
 * 计算花瓣曲面法线
 * @param {(u: number, v: number) => THREE.Vector3} surface 曲面函数
 * @param {number} u 径向参数
 * @param {number} v 横向参数
 * @param {THREE.Vector3} basePoint 当前点
 * @returns {THREE.Vector3} 法线
 */
function petalNormal(surface, u, v, basePoint) {
    const nextU = u < 0.99 ? u + 0.01 : u - 0.01;
    const nextV = v < 0.99 ? v + 0.01 : v - 0.01;
    const tangentU = surface(nextU, v).sub(basePoint);
    const tangentV = surface(u, nextV).sub(basePoint);
    const normal = new THREE.Vector3().crossVectors(tangentU, tangentV).normalize();
    const outward = new THREE.Vector3(basePoint.x, 0.12, basePoint.z);
    if (normal.dot(outward) < 0) {
        normal.negate();
    }
    return normal;
}

/**
 * 计算一个花瓣点的颜色
 * @param {THREE.Vector3} point 玫瑰局部坐标
 * @param {number} u 径向参数
 * @param {number} v 横向参数
 * @param {number} fraction 花瓣由内到外的位置
 * @param {number} petalTint 单片花瓣的色差
 * @returns {THREE.Color} 点颜色
 */
function petalColor(point, u, v, fraction, petalTint) {
    const radial = clamp(Math.hypot(point.x, point.z) / 0.48, 0, 1);
    const height = clamp(point.y / 0.46, 0, 1);
    const edge = smoothstep(0.68, 1, radial);
    const color = COLORS.roseDeep.clone();
    color.lerp(COLORS.roseMid, 0.3 + radial * 0.48);
    color.lerp(COLORS.roseRed, 0.14 + radial * 0.4);
    color.lerp(COLORS.roseEdge, Math.pow(edge, 2.2) * 0.44);
    color.multiplyScalar(0.6 + height * 0.5 + radial * 0.08);
    color.multiplyScalar(petalTint);
    return color;
}

/**
 * 用连续黄金角螺旋的方式生成一朵玫瑰
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {PointCloudBuilder} glow 发光粒子
 * @param {object} head 玫瑰位置
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 */
function addSpiralRose(solids, glow, head, random, quality) {
    const matrix = new THREE.Matrix4().compose(
        head.position,
        head.quaternion,
        new THREE.Vector3(head.scale, head.scale, head.scale)
    );
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

    // 花心暗部，避免透视时看到花瓣之间的空洞
    for (let index = 0; index < 120; index += 1) {
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(random() * 2 - 1);
        const radius = Math.pow(random(), 0.4);
        const point = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * 0.16 * radius,
            0.13 + Math.cos(phi) * 0.12 * radius,
            Math.sin(phi) * Math.sin(theta) * 0.16 * radius
        );
        const normal = new THREE.Vector3(point.x, (point.y - 0.13) * 1.5, point.z).normalize();
        const color = COLORS.roseDeep.clone();
        color.lerp(COLORS.roseMid, 0.12 + random() * 0.2);
        color.multiplyScalar(0.72);
        solids.addTransformed(
            point,
            normal,
            color,
            0.011 + random() * 0.005,
            random(),
            matrix,
            normalMatrix,
            1
        );
    }

    const petalCount = 40;
    for (let petalIndex = 0; petalIndex < petalCount; petalIndex += 1) {
        const fraction = petalIndex / (petalCount - 1);
        const petal = {
            angle: petalIndex * GOLDEN_ANGLE + 0.34 + (random() - 0.5) * 0.05,
            inner: 0.01 + fraction * 0.025,
            outer: 0.1 + fraction * 0.38,
            width: 0.085 + fraction * 0.19,
            baseY: 0.12 * (1 - fraction) + 0.006,
            arch: 0.31 - fraction * 0.11,
            tipDrop: 0.012 + fraction * 0.075,
            cup: 0.06 - fraction * 0.025,
            wrap: 0.84 - fraction * 0.3,
            swirl: (1.28 * (1 - fraction) + 0.12) * (0.9 + random() * 0.2),
            fold: 0.007 + fraction * 0.009,
            phase: random() * Math.PI * 2,
            tipCurl: (0.35 - fraction) * 0.035
        };
        const surface = createPetalSurface(petal);
        const rowCount = Math.max(7, Math.round((8 + fraction * 3) * quality));
        const cellCount = Math.max(6, Math.round((6 + fraction * 3) * quality));
        const petalTint = 0.94 + random() * 0.08;
        const petalSize = 0.0115 + fraction * 0.003;

        for (let row = 0; row < rowCount; row += 1) {
            for (let column = 0; column < cellCount; column += 1) {
                const rowJitter = (random() - 0.5) * 0.55;
                const columnJitter = (random() - 0.5) * 0.55;
                const u = clamp((row + 0.5 + rowJitter) / rowCount, 0.01, 0.995);
                const v = clamp(
                    ((column + 0.5 + columnJitter) / cellCount) * 2 - 1,
                    -0.995,
                    0.995
                );
                const point = surface(u, v);
                const normal = petalNormal(surface, u, v, point);
                point.addScaledVector(normal, (random() - 0.5) * 0.003);

                const color = petalColor(point, u, v, fraction, petalTint);
                solids.addTransformed(
                    point,
                    normal,
                    color,
                    petalSize,
                    random(),
                    matrix,
                    normalMatrix,
                    1
                );

                if (random() < 0.0045) {
                    const dew = COLORS.roseDew.clone().lerp(COLORS.gold, random() * 0.35);
                    glow.addTransformed(
                        point,
                        normal,
                        dew,
                        0.007 + random() * 0.005,
                        random(),
                        matrix,
                        normalMatrix,
                        0.5
                    );
                }
            }
        }

        const rimCount = Math.max(8, Math.round(12 * quality));
        for (let rimIndex = 0; rimIndex < rimCount; rimIndex += 1) {
            const u = 0.3 + (rimIndex / rimCount) * 0.68;
            for (const side of [-1, 1]) {
                const v = side * (0.93 + random() * 0.05);
                const point = surface(u, v);
                const normal = petalNormal(surface, u, v, point);
                point.addScaledVector(normal, 0.007);
                const color = COLORS.roseEdge.clone();
                color.lerp(COLORS.champagneLight, 0.16 + random() * 0.14);
                color.multiplyScalar(0.95 + random() * 0.12);
                solids.addTransformed(
                    point,
                    normal,
                    color,
                    petalSize * 0.9,
                    random(),
                    matrix,
                    normalMatrix,
                    0.95
                );

                if (rimIndex % 3 === 0) {
                    glow.addTransformed(
                        point,
                        normal,
                        COLORS.gold.clone().lerp(COLORS.roseEdge, 0.42),
                        petalSize * 0.55,
                        random(),
                        matrix,
                        normalMatrix,
                        0.3
                    );
                }
            }
        }
    }

    // 花心最内层的一小簇螺旋花瓣，形成玫瑰特有的旋心
    for (let petalIndex = 0; petalIndex < 5; petalIndex += 1) {
        const angle = petalIndex * 2.2 + 0.4;
        const petal = {
            angle,
            inner: 0.004,
            outer: 0.075,
            width: 0.055,
            baseY: 0.12,
            arch: 0.16,
            tipDrop: 0.0,
            cup: 0.055,
            wrap: 0.7,
            swirl: 2.1,
            fold: 0.003,
            phase: random() * Math.PI * 2,
            tipCurl: 0.01
        };
        const surface = createPetalSurface(petal);
        for (let row = 0; row < 8; row += 1) {
            for (let column = 0; column < 7; column += 1) {
                const u = (row + 0.5) / 8;
                const v = ((column + 0.5) / 7) * 2 - 1;
                const point = surface(u, v);
                const normal = petalNormal(surface, u, v, point);
                const color = COLORS.roseMid.clone().lerp(COLORS.roseRed, 0.35);
                solids.addTransformed(
                    point,
                    normal,
                    color,
                    petalSizeForCore(random),
                    random(),
                    matrix,
                    normalMatrix,
                    1
                );
            }
        }
    }

    // 用一条贴伏在花心的螺旋暗线强化玫瑰的旋心结构
    const spiralCount = Math.round(230 * quality);
    const spiralOffset = random() * Math.PI * 2;
    for (let index = 0; index < spiralCount; index += 1) {
        const t = index / spiralCount;
        const radius = 0.014 + t * 0.18;
        const angle = spiralOffset + t * Math.PI * 4.6;
        const fraction = clamp((radius - 0.1) / 0.38, 0, 1);
        const top = 0.12 * (1 - fraction) + (0.31 - fraction * 0.11) + 0.012;
        const point = new THREE.Vector3(
            Math.cos(angle) * radius,
            top,
            Math.sin(angle) * radius
        );
        const normal = new THREE.Vector3(0, 1, 0);
        const color = COLORS.roseDeep.clone().lerp(COLORS.roseMid, 0.2);
        solids.addTransformed(
            point,
            normal,
            color,
            0.0125,
            random(),
            matrix,
            normalMatrix,
            1
        );

        if (index % 3 === 0) {
            const highlight = new THREE.Vector3(
                Math.cos(angle + 0.16) * (radius + 0.008),
                top + 0.002,
                Math.sin(angle + 0.16) * (radius + 0.008)
            );
            const glowColor = COLORS.gold.clone().lerp(COLORS.roseEdge, 0.46);
            glow.addTransformed(
                highlight,
                normal,
                glowColor,
                0.0065,
                random(),
                matrix,
                normalMatrix,
                0.34
            );
        }
    }
}

/**
 * 生成花心粒子的尺寸
 * @param {() => number} random 随机函数
 * @returns {number} 粒子尺寸
 */
function petalSizeForCore(random) {
    return 0.0095 + random() * 0.003;
}

/**
 * 添加花茎
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {Array<object>} layout 玫瑰布局
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 */
function addStems(solids, layout, random, quality) {
    for (const head of layout) {
        const start = head.position.clone();
        start.y -= 0.12;
        const end = new THREE.Vector3(
            (random() - 0.5) * 0.1,
            0.44 + random() * 0.08,
            (random() - 0.5) * 0.1
        );
        const curve = new THREE.CatmullRomCurve3([
            start,
            new THREE.Vector3(start.x * 0.82, lerp(start.y, end.y, 0.3), start.z * 0.82),
            new THREE.Vector3(start.x * 0.34, lerp(start.y, end.y, 0.7), start.z * 0.34),
            end
        ]);
        const segmentCount = Math.round(82 * quality);
        const radialCount = 4;

        for (let segment = 0; segment <= segmentCount; segment += 1) {
            const t = segment / segmentCount;
            const center = curve.getPoint(t);
            const tangent = curve.getTangent(t).normalize();
            const side = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize();
            if (side.lengthSq() < 0.001) {
                side.set(1, 0, 0);
            }
            const up = new THREE.Vector3().crossVectors(side, tangent).normalize();
            const radius = 0.008 + 0.003 * (1 - t);

            for (let radial = 0; radial < radialCount; radial += 1) {
                const angle = (radial / radialCount) * Math.PI * 2 + random() * 0.35;
                const offset = new THREE.Vector3()
                    .addScaledVector(side, Math.cos(angle) * radius)
                    .addScaledVector(up, Math.sin(angle) * radius);
                const position = center.clone().add(offset);
                const normal = offset.clone().normalize();
                const color = COLORS.stemDark.clone().lerp(COLORS.stemGreen, random() * 0.5);
                solids.add(position, normal, color, 0.009 + random() * 0.003, random(), 1);
            }
        }

        if (random() < 0.55) {
            const t = 0.35 + random() * 0.3;
            const point = curve.getPoint(t);
            const thornDirection = new THREE.Vector3(random() - 0.5, 0.2, random() - 0.5).normalize();
            for (let index = 0; index < 7; index += 1) {
                const position = point.clone().addScaledVector(thornDirection, index * 0.008);
                const color = COLORS.champagneShadow.clone().lerp(COLORS.stemGreen, 0.45);
                solids.add(position, thornDirection, color, 0.007, random(), 0.9);
            }
        }
    }
}

/**
 * 添加一片叶子
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {PointCloudBuilder} glow 发光粒子
 * @param {THREE.Vector3} origin 叶子根部
 * @param {THREE.Vector3} direction 叶片朝向
 * @param {number} length 叶片长度
 * @param {number} width 叶片宽度
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 */
function addLeaflet(solids, glow, origin, direction, length, width, random, quality) {
    const forward = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
    if (right.lengthSq() < 0.001) {
        right.set(1, 0, 0);
    }
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const matrix = new THREE.Matrix4().makeBasis(forward, up, right);
    matrix.setPosition(origin);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

    const surface = (u, v) => {
        const serration = 1 + 0.035 * Math.sin(u * 38 + 1.4);
        const leafWidth = width * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.82)), 0.72) * serration;
        const height = -0.2 * u * u + 0.035 * Math.sin(Math.PI * u);
        return new THREE.Vector3(
            u * length,
            height + 0.035 * v * v * u,
            v * leafWidth
        );
    };

    const sampleCount = Math.round(270 * quality);
    for (let sample = 0; sample < sampleCount; sample += 1) {
        const u = Math.pow(random(), 0.9);
        const v = random() * 2 - 1;
        const point = surface(u, v);
        const nextU = u < 0.99 ? u + 0.01 : u - 0.01;
        const nextV = v < 0.99 ? v + 0.01 : v - 0.01;
        const normal = new THREE.Vector3()
            .crossVectors(
                surface(nextU, v).sub(point),
                surface(u, nextV).sub(point)
            )
            .normalize();
        if (normal.y < 0) {
            normal.negate();
        }

        const vein = smoothstep(0.12, 0, Math.abs(v));
        const edge = smoothstep(0.72, 1, Math.abs(v));
        const color = COLORS.leafDeep.clone();
        color.lerp(COLORS.leafGreen, 0.22 + u * 0.38 + random() * 0.1);
        color.lerp(COLORS.leafLight, vein * 0.32 + edge * 0.08);
        solids.addTransformed(
            point,
            normal,
            color,
            0.012 + random() * 0.006,
            random(),
            matrix,
            normalMatrix,
            1
        );

        if (vein > 0.45 && random() < 0.1) {
            glow.addTransformed(
                point,
                normal,
                COLORS.champagneLight.clone(),
                0.006 + random() * 0.004,
                random(),
                matrix,
                normalMatrix,
                0.22
            );
        }
    }
}

/**
 * 添加围绕花束的叶簇
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {PointCloudBuilder} glow 发光粒子
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 */
function addLeaves(solids, glow, random, quality) {
    const sprigAngles = [0.35, 1.2, 2.05, 2.95, 3.85, 4.8, 5.7];
    for (let sprigIndex = 0; sprigIndex < sprigAngles.length; sprigIndex += 1) {
        const angle = sprigAngles[sprigIndex];
        const radius = 0.98 + random() * 0.2;
        const base = new THREE.Vector3(
            Math.cos(angle) * radius,
            2.68 + random() * 0.5,
            Math.sin(angle) * radius
        );
        const outward = new THREE.Vector3(
            Math.cos(angle),
            0.08 + random() * 0.14,
            Math.sin(angle)
        ).normalize();

        const rachisLength = 0.4 + random() * 0.18;
        const stemEnd = base.clone().addScaledVector(outward, rachisLength);
        const stemCurve = new THREE.LineCurve3(base, stemEnd);
        for (let step = 0; step < 36; step += 1) {
            const point = stemCurve.getPoint(step / 36);
            const normal = new THREE.Vector3(-outward.z, 0.4, outward.x).normalize();
            solids.add(point, normal, COLORS.stemGreen.clone(), 0.009, random(), 1);
        }

        addLeaflet(
            solids,
            glow,
            stemEnd.clone().addScaledVector(outward, 0.025),
            outward.clone().add(new THREE.Vector3(0, 0.02, 0)).normalize(),
            0.32 + random() * 0.13,
            0.17 + random() * 0.07,
            random,
            quality
        );

        const sidePositions = [0.5, 0.76];
        for (let sideIndex = 0; sideIndex < sidePositions.length; sideIndex += 1) {
            const position = base.clone().addScaledVector(outward, rachisLength * sidePositions[sideIndex]);
            for (const side of [-1, 1]) {
                const direction = outward.clone()
                    .applyAxisAngle(WORLD_UP, side * (0.56 + random() * 0.1));
                direction.y += 0.02 + random() * 0.08;
                direction.normalize();
                addLeaflet(
                    solids,
                    glow,
                    position.clone(),
                    direction,
                    0.27 + random() * 0.11,
                    0.15 + random() * 0.06,
                    random,
                    quality
                );
            }
        }
    }
}

/**
 * 采样一张包装纸曲面
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {PointCloudBuilder} glow 发光粒子
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 * @param {object} config 纸张曲面参数
 */
function addPaperSurface(solids, glow, random, quality, config) {
    const surface = (u, v) => {
        const angle = lerp(config.angleStart, config.angleEnd, v);
        const seam = Math.pow(Math.abs(v * 2 - 1), 6);
        const pleat = Math.sin(v * Math.PI * config.folds + config.phase + u * 2.1);
        const seamFlare = config.seamFlare ?? 0.16;
        const seamHeight = config.seamHeight ?? 0.2;
        const radius = lerp(
            config.innerRadius,
            config.outerRadius + seam * seamFlare,
            Math.pow(u, config.curve ?? 1.35)
        ) + pleat * 0.042 * (0.35 + 0.65 * u);
        const height = lerp(config.baseY, config.topY + seam * seamHeight, u)
            + Math.cos(v * Math.PI * 4 + config.phase) * 0.03 * u;
        return new THREE.Vector3(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
    };

    const sampleCount = Math.round(config.count * quality);
    for (let sample = 0; sample < sampleCount; sample += 1) {
        const u = Math.pow(random(), 0.88);
        const v = random();
        const point = surface(u, v);
        const nextU = u < 0.99 ? u + 0.01 : u - 0.01;
        const nextV = v < 0.99 ? v + 0.005 : v - 0.005;
        const normal = new THREE.Vector3()
            .crossVectors(
                surface(nextU, v).sub(point),
                surface(u, nextV).sub(point)
            )
            .normalize();
        const outward = new THREE.Vector3(point.x, 0.1, point.z);
        if (normal.dot(outward) < 0) {
            normal.negate();
        }

        const seam = Math.pow(Math.abs(v * 2 - 1), 5);
        const colorT = config.reverseColor ? 1 - u : u;
        const edge = smoothstep(0.72, 1, colorT);
        const color = COLORS.champagneShadow.clone();
        color.lerp(COLORS.champagne, 0.22 + colorT * 0.7);
        color.lerp(COLORS.champagneLight, edge * 0.24 + seam * 0.2);
        color.multiplyScalar(0.88 + random() * 0.18);

        solids.add(
            point,
            normal,
            color,
            config.pointSize + random() * config.pointSize * 0.7,
            random(),
            config.alpha + random() * 0.12
        );

        const topEdge = u > 0.982;
        const bottomEdge = u < 0.018 && config.trimBottom;
        const sideEdge = v < 0.012 || v > 0.988;
        if ((topEdge || bottomEdge || sideEdge) && random() < 0.32) {
            const gold = COLORS.gold.clone().lerp(COLORS.champagneLight, random() * 0.5);
            glow.add(
                point,
                normal,
                gold,
                config.pointSize * 0.72,
                random(),
                0.52
            );
        }
    }
}

/**
 * 添加包装纸
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {PointCloudBuilder} glow 发光粒子
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 */
function addPaper(solids, glow, random, quality) {
    const frontGap = 0.23;
    // 下半部裙摆：底部宽、腰部收窄，形成外扩的礼物包装轮廓
    addPaperSurface(solids, glow, random, quality, {
        angleStart: -Math.PI,
        angleEnd: Math.PI,
        innerRadius: 1.08,
        outerRadius: 0.58,
        baseY: 0.42,
        topY: 1.34,
        curve: 0.78,
        folds: 9.0,
        phase: 0.4,
        count: 22000,
        pointSize: 0.014,
        alpha: 0.56,
        reverseColor: true,
        trimBottom: true,
        seamFlare: 0.02,
        seamHeight: 0
    });

    // 腰部以上重新展开，承托花束
    addPaperSurface(solids, glow, random, quality, {
        angleStart: Math.PI * 0.5 + frontGap,
        angleEnd: Math.PI * 0.5 - frontGap + Math.PI * 2,
        innerRadius: 0.58,
        outerRadius: 1.02,
        baseY: 1.32,
        topY: 2.36,
        curve: 1.4,
        folds: 6.5,
        phase: 1.4,
        count: 16000,
        pointSize: 0.014,
        alpha: 0.52
    });

    // 背后的大张衬纸，从腰部向上舒展
    addPaperSurface(solids, glow, random, quality, {
        angleStart: Math.PI * 1.5 - 1.42,
        angleEnd: Math.PI * 1.5 + 1.42,
        innerRadius: 0.64,
        outerRadius: 1.5,
        baseY: 1.24,
        topY: 2.9,
        curve: 1.48,
        folds: 4.2,
        phase: 2.1,
        count: 11000,
        pointSize: 0.015,
        alpha: 0.46
    });

    // 正面叠一层短折纸，遮住花茎并让腰部更有层次
    addPaperSurface(solids, glow, random, quality, {
        angleStart: Math.PI * 0.5 - 0.8,
        angleEnd: Math.PI * 0.5 + 0.8,
        innerRadius: 1.02,
        outerRadius: 0.6,
        baseY: 0.44,
        topY: 1.3,
        curve: 0.8,
        folds: 3.4,
        phase: 4.6,
        count: 6500,
        pointSize: 0.014,
        alpha: 0.54,
        reverseColor: true,
        trimBottom: true,
        seamFlare: 0.02,
        seamHeight: 0
    });
}

/**
 * 添加一条丝带面
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {Array<THREE.Vector3>} points 丝带中心线
 * @param {number} width 丝带宽度
 * @param {number} count 采样数量
 * @param {() => number} random 随机函数
 * @param {number} taper 末端收窄程度
 */
function addRibbonStrip(solids, points, width, count, random, taper = 0.25) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.32);
    const planeNormal = new THREE.Vector3(0, 0, 1);

    for (let index = 0; index < count; index += 1) {
        const t = random();
        const center = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, planeNormal).normalize();
        if (side.lengthSq() < 0.001) {
            side.set(1, 0, 0);
        }
        const across = random() * 2 - 1;
        const currentWidth = width * (1 - taper * t);
        const thickness = (random() - 0.5) * 0.006;
        const position = center.clone()
            .addScaledVector(side, across * currentWidth * 0.5)
            .addScaledVector(planeNormal, thickness);
        const normal = planeNormal.clone();
        const highlight = 1 - Math.abs(across);
        const color = COLORS.wine.clone();
        color.lerp(COLORS.wineLight, 0.18 + highlight * 0.62 + random() * 0.08);
        color.multiplyScalar(0.82 + highlight * 0.4);
        solids.add(
            position,
            normal,
            color,
            0.015 + random() * 0.007,
            random(),
            1
        );
    }
}

/**
 * 添加丝带、蝴蝶结和飘带
 * @param {PointCloudBuilder} solids 实体粒子
 * @param {() => number} random 随机函数
 * @param {number} quality 画质系数
 */
function addRibbon(solids, random, quality) {
    const bandCount = Math.round(6500 * quality);
    for (let index = 0; index < bandCount; index += 1) {
        const angle = random() * Math.PI * 2;
        const height = 1.23 + random() * 0.17;
        const radius = 0.74 + Math.sin(angle * 3 + 0.8) * 0.018 + Math.cos(height * 8) * 0.006;
        const position = new THREE.Vector3(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
        const normal = new THREE.Vector3(Math.cos(angle), 0.06, Math.sin(angle)).normalize();
        const centerShade = 1 - Math.abs(height - 1.315) / 0.085;
        const color = COLORS.wine.clone();
        color.lerp(COLORS.wineLight, clamp(centerShade, 0, 1) * 0.66 + random() * 0.08);
        solids.add(
            position,
            normal,
            color,
            0.015 + random() * 0.007,
            random(),
            1
        );
    }

    const leftLoop = [
        new THREE.Vector3(0.0, 1.34, 0.76),
        new THREE.Vector3(-0.18, 1.53, 0.82),
        new THREE.Vector3(-0.43, 1.54, 0.84),
        new THREE.Vector3(-0.46, 1.36, 0.82),
        new THREE.Vector3(-0.25, 1.23, 0.8),
        new THREE.Vector3(-0.01, 1.31, 0.77)
    ];
    const rightLoop = leftLoop.map((point) => new THREE.Vector3(-point.x, point.y, point.z));
    addRibbonStrip(solids, leftLoop, 0.19, Math.round(3000 * quality), random, 0.12);
    addRibbonStrip(solids, rightLoop, 0.19, Math.round(3000 * quality), random, 0.12);

    const leftTail = [
        new THREE.Vector3(0.0, 1.32, 0.78),
        new THREE.Vector3(-0.12, 1.12, 0.9),
        new THREE.Vector3(-0.26, 0.9, 1.02),
        new THREE.Vector3(-0.24, 0.7, 1.1),
        new THREE.Vector3(-0.34, 0.54, 1.14)
    ];
    const rightTail = [
        new THREE.Vector3(0.0, 1.32, 0.78),
        new THREE.Vector3(0.14, 1.1, 0.91),
        new THREE.Vector3(0.28, 0.88, 1.03),
        new THREE.Vector3(0.22, 0.7, 1.11),
        new THREE.Vector3(0.3, 0.52, 1.15)
    ];
    addRibbonStrip(solids, leftTail, 0.17, Math.round(2600 * quality), random, 0.34);
    addRibbonStrip(solids, rightTail, 0.15, Math.round(2400 * quality), random, 0.38);

    const knotCount = Math.round(700 * quality);
    for (let index = 0; index < knotCount; index += 1) {
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(random() * 2 - 1);
        const radius = 0.06;
        const position = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * radius,
            1.335 + Math.sin(phi) * Math.sin(theta) * radius * 1.25,
            0.79 + Math.cos(phi) * radius * 0.75
        );
        const normal = position.clone().sub(new THREE.Vector3(0, 1.335, 0.79)).normalize();
        const color = COLORS.wine.clone().lerp(COLORS.wineLight, 0.35 + random() * 0.3);
        solids.add(position, normal, color, 0.017, random(), 1);
    }
}

/**
 * 生成完整花束的点云
 * @param {object} options 配置
 * @param {number} options.quality 画质系数
 * @param {number} options.seed 随机种子
 * @param {boolean} options.singleRose 是否只生成一朵玫瑰用于调试
 * @returns {object} 花束点云与布局数据
 */
export function createBouquetGeometry({ quality = 1, seed = 20261020, singleRose = false } = {}) {
    const random = createRandom(seed);
    const solids = new PointCloudBuilder();
    const glow = new PointCloudBuilder();
    const layout = createRoseLayout(random);

    if (singleRose) {
        addSpiralRose(solids, glow, layout[0], random, quality);
    } else {
        addStems(solids, layout, random, quality);
        addPaper(solids, glow, random, quality);
        addRibbon(solids, random, quality);
        addLeaves(solids, glow, random, quality);
        for (const head of layout) {
            addSpiralRose(solids, glow, head, random, quality);
        }
    }

    return {
        solids: solids.build(),
        glow: glow.build(),
        layout,
        solidCount: solids.sizes.length,
        glowCount: glow.sizes.length
    };
}
