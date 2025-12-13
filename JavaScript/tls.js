// ========== 功能1：访问次数统计（仅依赖TinyAPI，失败显示加载失败） ==========
(function() {
    const countElement = document.getElementById('sss');
    if (!countElement) return;

    // 替换为你的唯一标识（确保全网唯一）
    const COUNT_ID = 'github-timeless-wuzhong-resource';
    // 添加随机参数避免浏览器缓存，提升计数准确性
    const API_URL = `https://tinyapi.cn/apis/count/${COUNT_ID}?t=${Date.now()}`;

    // 初始化显示加载状态
    countElement.innerText = '总访问次数：加载中...';

    // 发起计数请求
    fetch(API_URL, { method: 'GET' })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP错误：${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.code === 200 && typeof data.data === 'number') {
                // 直接使用API返回的累计计数（从0开始）
                countElement.innerText = `总访问次数：${data.data}`;
            } else {
                throw new Error(`数据异常：${JSON.stringify(data)}`);
            }
        })
        .catch(err => {
            console.error('计数请求失败：', err);
            // API失败时显示加载失败，不再使用本地存储兜底
            countElement.innerText = '总访问次数：加载失败';
        });
})();

// ========== 功能2：PC端等比缩放（修复偏右问题） ==========
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