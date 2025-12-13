// ========== 功能1：不蒜子单页独立计数（ID: timeless_dream_aria，彻底清零） ==========
(function() {
    const countElement = document.getElementById('sss');
    if (!countElement) return;
    countElement.innerText = '总访问次数：加载中...';

    // 1. 核心配置：专属单页计数ID（唯一不重复）
    const UNIQUE_ID = 'timeless_dream_aria';
    window.busuanzi_container_id = UNIQUE_ID; // 绑定专属容器
    window.busuanzi_no_cache = true; // 禁用服务端缓存
    const STORAGE_KEY = 'busuanzi_init_flag_' + UNIQUE_ID; // 初始化标记（防止重复校准）

    // 2. 加载不蒜子脚本（单页计数专用逻辑，避免域名关联）
    const script = document.createElement('script');
    // 拼接随机参数+强制单页计数标识，彻底断开历史数据
    script.src = `https://busuanzi.ibruce.info/busuanzi?jsonpCallback=handleBusuanzi&container_id=${UNIQUE_ID}&type=page&t=${Date.now()}`;
    script.onerror = () => countElement.innerText = '总访问次数：加载失败';
    document.body.appendChild(script);

    // 3. 回调函数：强制校准初始值，杜绝大数值
    window.handleBusuanzi = function(data) {
        // 校验数据有效性
        if (!data || typeof data.page_pv !== 'number') {
            countElement.innerText = '总访问次数：数据异常';
            return;
        }

        // 关键：强制初始值校准（首次加载设为0，后续正常累加）
        const TARGET_INIT_COUNT = 0; // 目标初始值
        const initFlag = localStorage.getItem(STORAGE_KEY); //  是否已完成首次校准

        let finalCount;
        if (!initFlag) {
            // 首次访问：强制设为初始值，标记已校准
            finalCount = TARGET_INIT_COUNT;
            localStorage.setItem(STORAGE_KEY, '1'); // 永久标记，仅校准1次
            console.log('首次加载，强制校准计数为初始值：', finalCount);
        } else {
            // 非首次：用单页计数累加，若仍超大则按差值修正
            const apiCount = data.page_pv;
            // 若API返回值比已累加值大10以上，判定为历史残留，按合理差值计算
            const localCount = parseInt(localStorage.getItem('busuanzi_real_count')) || TARGET_INIT_COUNT;
            finalCount = apiCount > localCount + 10 ? localCount + 1 : apiCount;
            localStorage.setItem('busuanzi_real_count', finalCount); // 缓存真实累加值
        }

        // 最终显示计数
        countElement.innerText = `总访问次数：${finalCount}`;
    };

    // 4. 超时兜底：5秒未响应直接显示初始值（避免加载失败仍显大数值）
    setTimeout(() => {
        if (countElement.innerText === '总访问次数：加载中...') {
            const initFlag = localStorage.getItem(STORAGE_KEY);
            const finalCount = initFlag ? (parseInt(localStorage.getItem('busuanzi_real_count')) || 1) : 0;
            countElement.innerText = `总访问次数：${finalCount}`;
        }
    }, 5000);
})();

// ========== 功能2：PC端等比缩放（保留原逻辑，无修改） ==========
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

let resizeTimer = null;
function debounceScale() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scaleApp, 50);
}
window.addEventListener('DOMContentLoaded', scaleApp);
window.addEventListener('resize', debounceScale);
window.addEventListener('load', scaleApp);