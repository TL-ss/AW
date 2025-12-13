// ========== 功能1：访问次数统计（替换为「不蒜子」API，国内稳定无跨域） ==========
(function() {
    const countElement = document.getElementById('sss');
    if (!countElement) return;

    // 初始化显示加载状态
    countElement.innerText = '总访问次数：加载中...';

    // 不蒜子API（国内CDN加速，无跨域，无需注册）
    // 格式：https://busuanzi.ibruce.info/busuanzi?jsonpCallback=回调函数
    const script = document.createElement('script');
    script.src = 'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=handleBusuanziCount';
    document.body.appendChild(script);

    // 回调函数：接收计数数据并显示
    window.handleBusuanziCount = function(data) {
        // data.site_uv：独立访客数（不同设备/IP算1个）
        // data.site_pv：总访问次数（同一设备多次访问累加）
        if (data && typeof data.site_pv === 'number') {
            countElement.innerText = `总访问次数：${data.site_pv}`;
        } else {
            throw new Error('计数数据异常');
        }
    };

    // 超时处理：5秒未加载成功则显示失败
    setTimeout(() => {
        if (countElement.innerText === '总访问次数：加载中...') {
            countElement.innerText = '总访问次数：加载失败';
        }
    }, 5000);
})();

// ========== 功能2：PC端等比缩放（保留原有逻辑） ==========
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
