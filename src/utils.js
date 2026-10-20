import * as THREE from 'three';

/**
 * 创建可复现的伪随机数生成器
 * @param {number} seed 随机种子
 * @returns {() => number} 返回 0 到 1 的随机数
 */
export function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/**
 * 数值区间映射
 * @param {number} value 当前值
 * @param {number} min 输入下界
 * @param {number} max 输入上界
 * @param {number} outMin 输出下界
 * @param {number} outMax 输出上界
 * @returns {number} 映射后的数值
 */
export function mapRange(value, min, max, outMin, outMax) {
    if (max === min) {
        return outMin;
    }
    const t = clamp((value - min) / (max - min), 0, 1);
    return outMin + (outMax - outMin) * t;
}

/**
 * 将数值限制在区间内
 * @param {number} value 当前值
 * @param {number} min 下界
 * @param {number} max 上界
 * @returns {number} 限制后的数值
 */
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * 线性插值
 * @param {number} a 起点
 * @param {number} b 终点
 * @param {number} t 插值系数
 * @returns {number} 插值结果
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * 平滑阶跃函数
 * @param {number} edge0 下边界
 * @param {number} edge1 上边界
 * @param {number} value 输入值
 * @returns {number} 0 到 1 的平滑值
 */
export function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * 缓出三次曲线
 * @param {number} t 0 到 1 的进度
 * @returns {number} 缓动结果
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

/**
 * 缓入缓出三次曲线
 * @param {number} t 0 到 1 的进度
 * @returns {number} 缓动结果
 */
export function easeInOutCubic(t) {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * 缓出回弹曲线
 * @param {number} t 0 到 1 的进度
 * @returns {number} 缓动结果
 */
export function easeOutBack(t) {
    const x = clamp(t, 0, 1);
    const c1 = 1.18;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * 将十六进制颜色转换为线性工作色彩空间
 * @param {string} hex 十六进制颜色
 * @returns {THREE.Color} 颜色对象
 */
export function colorFromHex(hex) {
    return new THREE.Color(hex);
}

const TEMP_RADIAL = new THREE.Vector3();
const TEMP_NORMAL = new THREE.Vector3();
const TEMP_A = new THREE.Vector3();
const TEMP_B = new THREE.Vector3();
const TEMP_C = new THREE.Vector3();

/**
 * 粒子点云收集器，统一生成 BufferGeometry
 */
export class PointCloudBuilder {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.colors = [];
        this.sizes = [];
        this.seeds = [];
        this.alphas = [];
    }

    /**
     * 直接加入一个点
     * @param {THREE.Vector3} position 位置
     * @param {THREE.Vector3} normal 法线
     * @param {THREE.Color} color 颜色
     * @param {number} size 世界尺寸
     * @param {number} seed 随机种子
     * @param {number} alpha 点透明度
     */
    add(position, normal, color, size, seed, alpha = 1) {
        this.positions.push(position.x, position.y, position.z);
        this.normals.push(normal.x, normal.y, normal.z);
        this.colors.push(color.r, color.g, color.b);
        this.sizes.push(size);
        this.seeds.push(seed);
        this.alphas.push(alpha);
    }

    /**
     * 将局部点变换后加入
     * @param {THREE.Vector3} position 局部位置
     * @param {THREE.Vector3} normal 局部法线
     * @param {THREE.Color} color 颜色
     * @param {number} size 世界尺寸
     * @param {number} seed 随机种子
     * @param {THREE.Matrix4} matrix 变换矩阵
     * @param {THREE.Matrix3} normalMatrix 法线矩阵
     * @param {number} alpha 点透明度
     */
    addTransformed(position, normal, color, size, seed, matrix, normalMatrix, alpha = 1) {
        TEMP_A.copy(position).applyMatrix4(matrix);
        TEMP_B.copy(normal).applyMatrix3(normalMatrix).normalize();
        this.add(TEMP_A, TEMP_B, color, size, seed, alpha);
    }

    /**
     * 计算表面点的法线
     * @param {(u: number, v: number) => THREE.Vector3} surface 曲面函数
     * @param {number} u 径向参数
     * @param {number} v 横向参数
     * @returns {THREE.Vector3} 归一化法线
     */
    surfaceNormal(surface, u, v) {
        const point = surface(u, v).clone();
        const du = surface(u + 0.012, v).sub(point);
        const dv = surface(u, v + 0.012).sub(point);
        TEMP_NORMAL.crossVectors(du, dv).normalize();
        TEMP_RADIAL.set(point.x, 0.08, point.z);
        if (TEMP_NORMAL.dot(TEMP_RADIAL) < 0) {
            TEMP_NORMAL.negate();
        }
        return TEMP_NORMAL.clone();
    }

    /**
     * 构建几何体
     * @returns {THREE.BufferGeometry} 点云几何体
     */
    build() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(this.colors, 3));
        geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(this.sizes, 1));
        geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seeds, 1));
        geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(this.alphas, 1));
        geometry.computeBoundingSphere();
        return geometry;
    }
}

/**
 * 合并多个点云构建器
 * @param {PointCloudBuilder[]} builders 待合并的构建器
 * @returns {PointCloudBuilder} 合并后的构建器
 */
export function mergeBuilders(builders) {
    const merged = new PointCloudBuilder();
    for (const builder of builders) {
        merged.positions.push(...builder.positions);
        merged.normals.push(...builder.normals);
        merged.colors.push(...builder.colors);
        merged.sizes.push(...builder.sizes);
        merged.seeds.push(...builder.seeds);
        merged.alphas.push(...builder.alphas);
    }
    return merged;
}

/**
 * 构造绕 Y 轴旋转的矩阵
 * @param {number} angle 旋转角度
 * @returns {THREE.Matrix4} 旋转矩阵
 */
export function rotationY(angle) {
    return new THREE.Matrix4().makeRotationY(angle);
}

/**
 * 计算向量叉积
 * @param {THREE.Vector3} a 第一个向量
 * @param {THREE.Vector3} b 第二个向量
 * @returns {THREE.Vector3} 叉积结果
 */
export function cross(a, b) {
    return new THREE.Vector3().crossVectors(a, b).normalize();
}
