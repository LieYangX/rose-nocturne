import * as THREE from 'three';

const PARTICLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uProjectionScale;
uniform float uSize;
uniform float uOpacity;
uniform float uSway;
uniform float uDrift;
uniform float uTwinkle;
uniform float uIntensity;
uniform float uSwirl;
uniform vec3 uKeyDir;
uniform vec3 uRimDir;
uniform vec3 uRimColor;

attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
attribute float aAlpha;

varying vec3 vColor;
varying float vAlpha;

void main() {
    vec3 transformed = position;
    float phase = aSeed * 6.2831853;
    float slow = uTime * 0.52;
    vec2 radialDirection = normalize(position.xz + vec2(0.0001));
    vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);
    float quick = uTime * 1.5 + phase * 2.1;

    transformed.x += sin(slow + phase + position.y * 1.7) * uSway;
    transformed.z += cos(slow * 0.86 + phase + position.y * 1.1) * uSway * 0.72;
    transformed.y += sin(uTime * 0.34 + phase * 1.6) * uDrift;
    transformed.xz += tangentDirection * sin(uTime * 0.38 + phase * 1.3 + position.y * 1.6) * uSwirl;
    transformed.xz += radialDirection * sin(uTime * 0.75 + phase + position.y * 1.1) * uSway * 0.35;
    transformed.x += sin(quick + position.y * 2.0) * uSway * 0.22;
    transformed.z += cos(quick * 0.87 + position.y * 1.3) * uSway * 0.18;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 viewDirection = normalize(-mvPosition.xyz);

    float key = max(dot(worldNormal, normalize(uKeyDir)), 0.0);
    float rim = max(dot(worldNormal, normalize(uRimDir)), 0.0);
    float fresnel = pow(1.0 - abs(dot(viewDirection, worldNormal)), 2.0);
    float flicker = 1.0 + uTwinkle * sin(uTime * 1.9 + phase * 9.0);

    vec3 lit = aColor * (0.18 + key * 1.08);
    lit += aColor * fresnel * 0.22;
    lit += uRimColor * rim * 0.18;
    lit *= flicker * uIntensity;

    vColor = lit;
    vAlpha = uOpacity * aAlpha;

    gl_PointSize = aSize * uSize * uProjectionScale * uPixelRatio;
    gl_PointSize /= max(0.12, -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 0.65, 38.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float distanceToCenter = length(centered) * 2.0;
    if (distanceToCenter > 1.0) {
        discard;
    }

    float edge = smoothstep(1.0, 0.34, distanceToCenter);
    float core = pow(max(0.0, 1.0 - distanceToCenter), 3.0);
    vec3 color = vColor + core * 0.14;
    float alpha = edge * vAlpha;

    if (alpha < 0.004) {
        discard;
    }

    gl_FragColor = vec4(color, alpha);
}
`;

const SPARK_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uOriginTime;
uniform float uLife;
uniform float uPixelRatio;
uniform float uProjectionScale;
uniform float uOpacity;
uniform float uIntensity;

attribute vec3 aVelocity;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
attribute float aDelay;

varying vec3 vColor;
varying float vAlpha;

void main() {
    if (uOriginTime < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    float age = uTime - uOriginTime - aDelay;
    if (age < 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        return;
    }

    float progress = clamp(age / uLife, 0.0, 1.0);
    float damping = 1.0 - exp(-age * 2.35);
    vec3 transformed = position;
    transformed += aVelocity * damping * 0.58;
    transformed.y += 0.14 * age - 0.022 * age * age;
    transformed.x += sin(age * 1.45 + aSeed * 6.2831853) * 0.035 * progress;
    transformed.z += cos(age * 1.18 + aSeed * 6.2831853) * 0.035 * progress;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vColor = aColor * (1.35 - progress * 0.45) * uIntensity;
    vAlpha = smoothstep(0.0, 0.1, progress) * pow(1.0 - progress, 1.7) * uOpacity;

    gl_PointSize = aSize * uProjectionScale * uPixelRatio;
    gl_PointSize /= max(0.12, -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 0.6, 26.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const PETAL_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uProjectionScale;
uniform float uOpacity;

attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;

varying vec3 vColor;
varying float vAlpha;
varying float vRotation;

void main() {
    float cycle = fract(uTime * 0.018 + aSeed);
    float angle = aSeed * 6.2831853 + uTime * 0.1 + cycle * 1.8;
    vec3 transformed = position;
    transformed.x += sin(angle) * 0.34;
    transformed.z += cos(angle * 0.83 + aSeed * 2.0) * 0.28;
    transformed.y = mix(4.05, 0.95, cycle)
        + sin(uTime * 0.42 + aSeed * 6.2831853) * 0.08;

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vColor = aColor;
    vAlpha = uOpacity
        * smoothstep(0.0, 0.14, cycle)
        * (1.0 - smoothstep(0.78, 1.0, cycle));
    vRotation = angle * 1.6;

    gl_PointSize = aSize * uProjectionScale * uPixelRatio;
    gl_PointSize /= max(0.12, -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 44.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const PETAL_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vRotation;

void main() {
    vec2 point = gl_PointCoord - 0.5;
    float cosine = cos(vRotation);
    float sine = sin(vRotation);
    point = mat2(cosine, -sine, sine, cosine) * point;
    point.y *= 1.85;

    float distanceToCenter = length(point) * 2.0;
    if (distanceToCenter > 1.0) {
        discard;
    }

    float alpha = smoothstep(1.0, 0.3, distanceToCenter) * vAlpha;
    vec3 color = vColor + vec3(0.055) * (1.0 - distanceToCenter);
    gl_FragColor = vec4(color, alpha);
}
`;

const GLASS_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const GLASS_FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uEdgeTint;
uniform float uOpacity;
uniform float uGlow;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vViewDirection;

void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(vViewDirection);
    float fresnel = pow(1.0 - abs(dot(normal, viewDirection)), 2.1);

    vec2 border = abs(vUv - 0.5) * 2.0;
    float edgeDistance = max(border.x, border.y);
    float edge = smoothstep(0.986, 1.0, edgeDistance);
    float streak = smoothstep(0.045, 0.0, abs(vUv.x + vUv.y * 0.72 - 0.8));

    vec3 color = uTint * (0.18 + fresnel * 0.62 + edge * 1.1);
    color += uEdgeTint * (edge * 0.85 + streak * 0.12) * uGlow;
    color += uTint * streak * 0.08;

    float alpha = (0.008 + fresnel * 0.052 + edge * 0.2 + streak * 0.02) * uOpacity;
    alpha *= uGlow;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BACKDROP_FRAGMENT = /* glsl */ `
uniform float uTime;

varying vec2 vUv;

float hash(vec2 value) {
    return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 point = vUv - vec2(0.5, 0.5);
    point.x *= 1.12;
    float distanceFromCenter = length(point);

    vec3 base = vec3(0.0025, 0.0018, 0.0022);
    vec3 middle = vec3(0.018, 0.007, 0.009);
    vec3 warmGlow = vec3(0.095, 0.037, 0.018);

    vec3 color = mix(base, middle, smoothstep(0.92, 0.08, distanceFromCenter));
    color += warmGlow * pow(max(0.0, 1.0 - distanceFromCenter * 1.62), 4.2);

    float shaft = smoothstep(0.32, 0.0, abs(point.x + 0.13));
    shaft *= smoothstep(0.1, 0.55, point.y);
    color += vec3(0.07, 0.036, 0.015) * shaft * 0.18;

    float grain = hash(gl_FragCoord.xy * 0.5 + uTime * 0.03);
    color += (grain - 0.5) * 0.007;

    gl_FragColor = vec4(color, 1.0);
}
`;

const FLOOR_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLOOR_FRAGMENT = /* glsl */ `
varying vec2 vUv;

void main() {
    vec2 point = vUv - 0.5;
    float distanceFromCenter = length(point) * 2.0;
    float alpha = smoothstep(1.0, 0.15, distanceFromCenter);

    vec3 color = mix(vec3(0.012, 0.008, 0.007), vec3(0.11, 0.052, 0.032), 
        smoothstep(0.82, 0.0, distanceFromCenter));
    color += vec3(0.32, 0.19, 0.1) * pow(max(0.0, 1.0 - distanceFromCenter), 5.0) * 0.18;

    float ring = smoothstep(0.012, 0.0, abs(distanceFromCenter - 0.58));
    color += vec3(0.28, 0.17, 0.09) * ring * 0.18;

    gl_FragColor = vec4(color, alpha * 0.72);
}
`;

const FINAL_GRADE_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uAmount;

varying vec2 vUv;

float hash(vec2 value) {
    return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 centered = vUv - 0.5;
    float aberration = 0.00085 * uAmount;
    float red = texture2D(tDiffuse, vUv + centered * aberration).r;
    float green = texture2D(tDiffuse, vUv).g;
    float blue = texture2D(tDiffuse, vUv - centered * aberration).b;
    vec3 color = vec3(red, green, blue);

    float vignette = smoothstep(0.92, 0.22, length(centered * vec2(1.08, 0.92)));
    color *= mix(0.52, 1.0, vignette);
    color = pow(color, vec3(0.985, 1.0, 1.025));
    color.rgb += vec3(0.008, 0.003, 0.0);

    float grain = hash(gl_FragCoord.xy + uTime * 2.4);
    color += (grain - 0.5) * 0.016 * uAmount;

    gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * 创建通用粒子材质
 * @param {object} options 材质参数
 * @returns {THREE.ShaderMaterial} 粒子材质
 */
export function createParticleMaterial(options = {}) {
    const {
        opacity = 1,
        size = 1,
        intensity = 1,
        sway = 0,
        drift = 0,
        swirl = 0,
        twinkle = 0.05,
        blending = THREE.NormalBlending,
        rimColor = new THREE.Color(0.55, 0.66, 0.9)
    } = options;

    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: 1 },
            uProjectionScale: { value: 1000 },
            uSize: { value: size },
            uOpacity: { value: opacity },
            uSway: { value: sway },
            uDrift: { value: drift },
            uSwirl: { value: swirl },
            uTwinkle: { value: twinkle },
            uIntensity: { value: intensity },
            uKeyDir: { value: new THREE.Vector3(-0.48, 0.82, 0.5).normalize() },
            uRimDir: { value: new THREE.Vector3(0.7, 0.28, -0.55).normalize() },
            uRimColor: { value: rimColor }
        },
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending
    });
}

/**
 * 创建玻璃边缘光材质
 * @returns {THREE.ShaderMaterial} 玻璃材质
 */
export function createGlassMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTint: { value: new THREE.Color(0.36, 0.52, 0.62) },
            uEdgeTint: { value: new THREE.Color(1.0, 0.78, 0.48) },
            uOpacity: { value: 1 },
            uGlow: { value: 1 }
        },
        vertexShader: GLASS_VERTEX,
        fragmentShader: GLASS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
}

/**
 * 创建玻璃飞散粒子材质
 * @returns {THREE.ShaderMaterial} 飞散粒子材质
 */
export function createSparkMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOriginTime: { value: -1 },
            uLife: { value: 3.2 },
            uPixelRatio: { value: 1 },
            uProjectionScale: { value: 1000 },
            uOpacity: { value: 1 },
            uIntensity: { value: 1.4 }
        },
        vertexShader: SPARK_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending
    });
}

/**
 * 创建背景渐变材质
 * @returns {THREE.ShaderMaterial} 背景材质
 */
export function createBackdropMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }
        },
        vertexShader: BACKDROP_VERTEX,
        fragmentShader: BACKDROP_FRAGMENT,
        depthWrite: false,
        depthTest: false
    });
}

/**
 * 创建地面光晕材质
 * @returns {THREE.ShaderMaterial} 地面材质
 */
export function createFloorMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: FLOOR_VERTEX,
        fragmentShader: FLOOR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true
    });
}

/**
 * 创建缓慢飘落的花瓣材质
 * @returns {THREE.ShaderMaterial} 花瓣材质
 */
export function createFallingPetalMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: 1 },
            uProjectionScale: { value: 1000 },
            uOpacity: { value: 0 }
        },
        vertexShader: PETAL_VERTEX,
        fragmentShader: PETAL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true
    });
}

/**
 * 创建最终调色 ShaderPass
 * @returns {object} ShaderPass 配置
 */
export function createFinalGradeShader() {
    return {
        uniforms: {
            tDiffuse: { value: null },
            uTime: { value: 0 },
            uAmount: { value: 1 }
        },
        vertexShader: /* glsl */ `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: FINAL_GRADE_FRAGMENT
    };
}
