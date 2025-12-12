// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreNum = document.getElementById('scoreNum');
    const gameOver = document.getElementById('gameOver');
    const restartBtn = document.getElementById('restartBtn');
    
    // 手机端操控按钮
    const upBtn = document.querySelector('.up-btn');
    const downBtn = document.querySelector('.down-btn');
    const leftBtn = document.querySelector('.left-btn');
    const rightBtn = document.querySelector('.right-btn');

    // 游戏配置
    const gridSize = 20; // 格子大小
    const gridCount = canvas.width / gridSize; // 20x20网格

    // 蛇的状态：初始3段（常规长度），位置调整为更易触发自噬
    let snake = [
        { x: 10, y: 10 }, // 蛇头
        { x: 10, y: 11 }, // 身体1
        { x: 10, y: 12 }  // 身体2
    ];
    let direction = 'up'; // 初始方向改为向上，更易操作触发自噬
    let nextDirection = 'up';
    let food = generateFood();
    let score = 0;
    let gameSpeed = 180; // 适中速度，方便操作
    let gameLoop;

    // 生成食物（避免出现在蛇身上）
    function generateFood() {
        let newFood;
        while (!newFood || snake.some(s => s.x === newFood.x && s.y === newFood.y)) {
            newFood = {
                x: Math.floor(Math.random() * gridCount),
                y: Math.floor(Math.random() * gridCount)
            };
        }
        return newFood;
    }

    // 绘制网格
    function drawGrid() {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    // 绘制蛇
    function drawSnake() {
        snake.forEach((seg, i) => {
            // 蛇头蓝色，身体绿色，自噬后身体段减少视觉明显
            ctx.fillStyle = i === 0 ? '#3498db' : '#2ecc71';
            // 留1px间隙，网格更清晰
            ctx.fillRect(seg.x * gridSize, seg.y * gridSize, gridSize - 1, gridSize - 1);
        });
    }

    // 绘制食物
    function drawFood() {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 1, gridSize - 1);
    }

    // 移动蛇+核心自噬逻辑（完全重构）
    function moveSnake() {
        // 更新方向（禁止180度反向）
        direction = getValidDirection(nextDirection);
        const head = { ...snake[0] };

        // 蛇头移动
        switch (direction) {
            case 'up': head.y--; break;
            case 'down': head.y++; break;
            case 'left': head.x--; break;
            case 'right': head.x++; break;
        }

        // 穿墙逻辑（极简写法）
        head.x = (head.x + gridCount) % gridCount;
        head.y = (head.y + gridCount) % gridCount;

        // 第一步：添加新蛇头（自噬检测的关键，先加后判）
        snake.unshift(head);

        // 第二步：检测自噬（蛇头与身体任意段重合）
        let eatSelfIndex = -1;
        // 从第1段开始检测（跳过新蛇头）
        for (let i = 1; i < snake.length; i++) {
            if (head.x === snake[i].x && head.y === snake[i].y) {
                eatSelfIndex = i;
                break;
            }
        }

        // 第三步：根据状态调整蛇身
        if (eatSelfIndex > -1) {
            // 触发自噬：移除被吃到的那一个块（核心需求）
            snake.splice(eatSelfIndex, 1);
        } else if (head.x !== food.x || head.y !== food.y) {
            // 未自噬且未吃食物：移除蛇尾，保持长度
            snake.pop();
        } else {
            // 吃到食物：加分、生成新食物、提速
            score += 10;
            scoreNum.textContent = score;
            food = generateFood();
            if (gameSpeed > 80) gameSpeed -= 10;
            clearInterval(gameLoop);
            gameLoop = setInterval(gameUpdate, gameSpeed);
        }

        // 游戏结束条件：只剩蛇头（长度=1）
        if (snake.length === 1) {
            endGame();
        }
    }

    // 验证方向（禁止180度反向）
    function getValidDirection(newDir) {
        const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
        return newDir === opposite[direction] ? direction : newDir;
    }

    // 游戏结束处理
    function endGame() {
        clearInterval(gameLoop);
        gameOver.style.display = 'block';
        restartBtn.style.display = 'block';
    }

    // 重新开始游戏
    function restartGame() {
        // 重置为初始3段蛇身
        snake = [
            { x: 10, y: 10 },
            { x: 10, y: 11 },
            { x: 10, y: 12 }
        ];
        direction = 'up';
        nextDirection = 'up';
        food = generateFood();
        score = 0;
        scoreNum.textContent = score;
        gameSpeed = 180;
        gameOver.style.display = 'none';
        restartBtn.style.display = 'none';
        clearInterval(gameLoop);
        gameLoop = setInterval(gameUpdate, gameSpeed);
    }

    // 游戏每一帧更新
    function gameUpdate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid(); // 先画网格
        moveSnake(); // 再移动蛇
        drawSnake(); // 再画蛇
        drawFood(); // 最后画食物
    }

    // 键盘控制方向
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowUp': nextDirection = 'up'; break;
            case 'ArrowDown': nextDirection = 'down'; break;
            case 'ArrowLeft': nextDirection = 'left'; break;
            case 'ArrowRight': nextDirection = 'right'; break;
        }
    });

    // 手机端控件绑定方向控制
    upBtn.addEventListener('click', () => { nextDirection = 'up'; });
    downBtn.addEventListener('click', () => { nextDirection = 'down'; });
    leftBtn.addEventListener('click', () => { nextDirection = 'left'; });
    rightBtn.addEventListener('click', () => { nextDirection = 'right'; });

    // 绑定重新开始按钮
    restartBtn.addEventListener('click', restartGame);

    // 初始化游戏
    gameLoop = setInterval(gameUpdate, gameSpeed);
});