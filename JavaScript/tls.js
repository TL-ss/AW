// ========== 功能1：访问次数统计（替换为CounterDev API，稳定无跨域） ==========
(function() {
    const countElement = document.getElementById('sss');
    if (!countElement) return;

    // 【关键】替换为你的唯一标识（格式：任意字符串，建议github-用户名-项目名）
    // 示例：const COUNTER_ID = 'github-timeless-wuzhong-resource';
    const COUNTER_ID = 'github-timeless-wuzhong-resource';
    // CounterDev 官方API（稳定、无跨域、无需注册）
    const API_URL = `https://api.countapi.xyz/hit/${COUNTER_ID}/visits`;

    // 初始化显示加载状态
    countElement.innerText = '总访问次数：加载中...';

    // 发起计数请求（处理跨域，兼容所有浏览器）
    fetch(API_URL, {
        method: 'GET',
        mode: 'cors', // 明确开启跨域
        cache: 'no-cache' // 禁用缓存，确保计数准确
    })
    .then(res => {
        if (!res.ok) throw new Error(`请求失败：${res.status}`);
        return res.json();
    })
    .then(data => {
        // CounterDev 返回格式：{ value: 累计计数 }
        if (typeof data.value === 'number') {
            countElement.innerText = `总访问次数：${data.value}`;
        } else {
            throw new Error(`数据格式异常：${JSON.stringify(data)}`);
        }
    })
    .catch(err => {
        console.error('计数API请求失败：', err);
        // 失败时显示加载失败
        countElement.innerText = '总访问次数：加载失败';
    });
})();

// ========== 功能2：PC端等比缩放（保留原有逻辑，无修改） ==========
function scaleApp() {
    const app = document.getElementById('app');
    const animationContainer = document.querySelector('.animation-container');
    if (!app || !animationContainer) return;

    const baseWidth = 1800;
    const containerWidth = animationContainer.clientWidth;
    const scale = Math.min(1, containerWidth / baseWidth);

    app.style.transform = `scale(${scale})`;
    app.style.transformOrigin = 'top center';
    app.style.width = `${baseWidth}px`;
    app.style.left = '0';
    app.style.margin = '0 auto';
}

// 防抖优化
let resizeTimer = null;
function debounceScale() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scaleApp, 50);
}

// 初始化执行
window.addEventListener('DOMContentLoaded', scaleApp);
window.addEventListener('resize', debounceScale);
window.addEventListener('load', scaleApp);
