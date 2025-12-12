// ========== 功能1：访问次数统计（TinyAPI + 本地存储兜底） ==========
(function() {
    const countElement = document.getElementById('sss');
    if (!countElement) return;

    // 替换为你的唯一标识（避免重复）
    const COUNT_ID = 'github-timeless-wuzhong-resource';
    const API_URL = `https://tinyapi.cn/apis/count/${COUNT_ID}`;

    // 发起计数请求
    fetch(API_URL, { method: 'GET' })
        .then(res => res.json())
        .then(data => {
            if (data.code === 200 && typeof data.data === 'number') {
                const totalCount = data.data + 819;
                countElement.innerText = `总访问次数：${totalCount}`;
            } else {
                throw new Error('计数数据异常');
            }
        })
        .catch(err => {
            console.log('计数API失败，降级到本地存储：', err);
            const STORAGE_KEY = 'static_site_count';
            let localCount = parseInt(localStorage.getItem(STORAGE_KEY)) || 820;
            localCount += 1;
            localStorage.setItem(STORAGE_KEY, localCount);
            countElement.innerText = `总访问次数：${localCount}`;
        });
})();

// ========== 功能2：PC端等比缩放（修复偏右问题） ==========
function scaleApp() {
    const app = document.getElementById('app');
    const animationContainer = document.querySelector('.animation-container');
    if (!app || !animationContainer) return;

    const baseWidth = 1800;
    // 仅基于PC端容器宽度计算缩放比例
    const containerWidth = animationContainer.clientWidth;
    const scale = Math.min(1, containerWidth / baseWidth);

    // 强制居中，消除偏右
    app.style.transform = `scale(${scale})`;
    app.style.transformOrigin = 'top center';
    app.style.width = `${baseWidth}px`;
    app.style.left = '0';
    app.style.margin = '0 auto';
}

// 防抖优化：避免频繁缩放
let resizeTimer = null;
function debounceScale() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scaleApp, 50);
}

// 初始化执行（仅PC端）
window.addEventListener('DOMContentLoaded', scaleApp);
window.addEventListener('resize', debounceScale);
window.addEventListener('load', scaleApp);