/**
 * 游戏主壳：启动世界、驱动主循环，并把渲染器、玩家、实体、物品栏、
 * 交互与 HUD 连接起来。
 *
 * 循环结构与原版一致（每秒 20 刻）：
 *   每帧 -> 在时间预算内流式生成区块 -> 读取输入 -> 以固定 50 毫秒为一刻
 *   推进物理与 AI -> 渲染 -> HUD。
 */
import { Renderer } from '../render/renderer.js';
import { Hud, stackDisplayName } from '../render/hud.js';
import { World } from '../world/world.js';
import { Player, PLAYER } from './player.js';
import { Input } from './input.js';
import { starterInventory, craft, availableRecipes, RECIPES, HOTBAR_SIZE } from './inventory.js';
import { EntityManager, buildMobGeometry } from './mobs.js';
import { Interaction } from './interaction.js';
import { BLOCK, BLOCKS, CREATIVE_BLOCKS } from '../world/blocks.js';
import { SEA_LEVEL, CHUNK_SIZE } from '../world/constants.js';
import { clamp } from '../core/math.js';
import { playSfx, initAudio, setVolume, resumeAudio } from '../audio/sfx.js';

/** 一刻的时长。固定步长让物理与帧率无关。 */
const TICK = 1 / 20;

/** 没有输入时的意图对象，复用可避免每帧分配。 */
const IDLE_INTENT = {
  forward: false, backward: false, left: false, right: false,
  jump: false, sneak: false, sprint: false,
};

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ui = {
      loading: document.getElementById('loading'),
      loadingText: document.getElementById('loading-text'),
      loadingBar: document.getElementById('loading-bar'),
      menu: document.getElementById('menu'),
      menuTitle: document.getElementById('menu-title'),
      menuBody: document.getElementById('menu-body'),
      menuButtons: document.getElementById('menu-buttons'),
      hint: document.getElementById('hint'),
      debug: document.getElementById('debug'),
      toast: document.getElementById('toast'),
      inventory: document.getElementById('inventory-panel'),
      inventoryGrid: document.getElementById('inventory-grid'),
      recipeList: document.getElementById('recipe-list'),
      options: document.getElementById('options-panel'),
      hudScale: document.getElementById('opt-hud-scale'),
      sensitivity: document.getElementById('opt-sensitivity'),
      fov: document.getElementById('opt-fov'),
      volume: document.getElementById('opt-volume'),
      renderDistance: document.getElementById('opt-render-distance'),
      mobileControls: document.getElementById('mobile-controls'),
      joystick: document.getElementById('mobile-joystick'),
      joystickKnob: document.getElementById('mobile-joystick-knob'),
      crosshair: document.getElementById('crosshair'),
    };

    this.clock = { last: performance.now(), accumulator: 0, fps: 0, frames: 0, fpsTimer: 0 };
    this.running = false;
    this.paused = true;
    this.isMobile = window.matchMedia?.('(pointer: coarse) and (hover: none)').matches === true;
    this._touchLookPointer = null;
    this._touchHoldTimer = null;
    this._touchHoldActive = false;
    this._touchDragged = false;
    this._touchPlaceTimer = 0;
    this._joystickPointer = null;
    this._previousPlayerPosition = null;

    // ?seed=123 可以固定世界种子，便于复现问题与截图。
    const seedParam = new URLSearchParams(location.search).get('seed');
    this.seed = seedParam !== null ? (Number(seedParam) >>> 0) : ((Math.random() * 0xffffffff) >>> 0);

    // 默认渲染距离刻意保守：渲染在主线程上，远景越大帧率越低。
    this.renderDistance = 4;
    this.hudScale = 1;
    this.sensitivity = 0.0022;
    this.fov = 70;
    this.volume = 0.7;
    this.showDebug = false;
    this.toastTimer = 0;
    this.heldNameTimer = 0;
    this.damageFlash = 0;
    this.doubleTapTimer = 0;
    this.doubleTapSprint = false;
    this.deathShown = false;
    this._frameSample = null;

    this.input = new Input(this.canvas, {
      sensitivity: this.sensitivity,
      onKey: (code, event, isUp) => this._onKey(code, event, isUp),
      onLockChange: (locked) => this._onLockChange(locked),
      onWheel: (delta) => {
        if (!this.running || this.paused) return;
        this.inventory.cycleHotbar(delta);
        this._toast(stackDisplayName(this.inventory.held?.id ?? BLOCK.AIR), 1.2);
      },
    });

    this.inventory = starterInventory();
    document.getElementById('inv-close')?.addEventListener('click', () => this.resume());
    this._bindOptionControls();
    this._setupMobileControls();
  }

  _clearTouchInput() {
    if (!this.input) return;
    this._setJoystickKeys(0, 0);
    this.input.setTouchKey('jump', false);
    this.input.setTouchKey('sneak', false);
    this.input.setTouchButton(0, false);
    this.input.setTouchButton(2, false);
    clearTimeout(this._touchHoldTimer);
    this._touchHoldTimer = null;
    this._touchHoldActive = false;
    this._touchPlaceTimer = 0;
    this.input.setTouchMove(0, 0);
    this.input.touchLook.dx = 0;
    this.input.touchLook.dy = 0;
    this._joystickPointer = null;
    this._touchLookPointer = null;
    if (this.ui.joystickKnob) this.ui.joystickKnob.style.transform = '';
  }

  /* ---------------- 启动 ---------------- */

  async boot() {
    this._setLoading('正在生成贴图…', 0.05);
    await nextFrame();

    const iconIds = [...new Set([...CREATIVE_BLOCKS, ...this.inventory.slots.filter(Boolean).map((s) => s.id)])];
    this.renderer = new Renderer(this.canvas, { iconBlockIds: iconIds });

    this._setLoading('正在准备世界…', 0.2);
    await nextFrame();

    this.world = new World({
      seed: this.seed,
      renderDistance: this.renderDistance,
      onMesh: (cx, cz, section, mesh) => this.renderer.setSectionMesh(cx, cz, section, mesh),
    });

    this.player = new Player({ x: 0.5, y: SEA_LEVEL + 20, z: 0.5 });
    this.mobs = new EntityManager(this.world, { maxMobs: 16 });
    this.interaction = new Interaction({
      world: this.world,
      player: this.player,
      inventory: this.inventory,
      mobs: this.mobs,
      playSound: (name, opts) => playSfx(name, opts),
    });
    this.hud = new Hud(this.renderer, { iconUv: this.renderer.iconAtlas.uvs });

    this.ui.hint.addEventListener('click', () => {
      if (!this.paused) { resumeAudio(); initAudio(); this.input.requestLock(); }
    });
    this._restoreSave();
    this._applyOptions();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    await this._waitForWorld();
    await this._settlePlayer();
    this.ui.loading.classList.add('hidden');
    this.showMenu('title');
    this.running = true;
    this._loop();
  }

  /** 在出生点附近流式生成区块，直到脚下确实有地面。 */
  async _waitForWorld() {
    const start = performance.now();
    for (;;) {
      this.world.update(this.player.x, this.player.z, 8);
      const elapsed = (performance.now() - start) / 1000;
      const chunk = this.world.getChunk(0, 0);
      const neighboursReady = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        .every(([dx, dz]) => this.world.getChunk(dx, dz)?.state === 'ready');
      if (chunk?.state === 'ready' && neighboursReady) {
        const spawn = this.world.findSpawn(0, 0);
        this.player.x = spawn.x;
        this.player.y = spawn.y + 1;
        this.player.z = spawn.z;
        break;
      }
      this._setLoading(
        `正在生成地形… ${this.world.chunks.size} 个区块`,
        Math.min(0.75, 0.2 + elapsed * 0.25),
      );
      if (elapsed > 30) {
        console.warn('[game] 地形生成超时，改为在海面上方出生');
        break;
      }
      await nextFrame();
    }
  }

  /**
   * 让玩家落到地面上，并等到附近区块真正完成网格化。
   *
   * 只判断“网格队列为空”是不够的：新区块生成会让队列重新填满，所以这里按
   * 实际覆盖率等待，否则第一帧会看到千疮百孔的世界。
   */
  async _settlePlayer() {
    const fallDeadline = performance.now() + 6000;
    while (performance.now() < fallDeadline) {
      this.world.update(this.player.x, this.player.z, 10);
      // 用固定步长模拟下落，落地结果与帧率无关。
      for (let i = 0; i < 3; i++) this.player.update(this.world, IDLE_INTENT, TICK);
      if (this.player.onGround) break;
      await nextFrame();
    }

    const meshDeadline = performance.now() + 20000;
    let quietFrames = 0;
    while (performance.now() < meshDeadline) {
      this.world.update(this.player.x, this.player.z, 12);
      this._setLoading(
        `正在生成地形… 已就绪 ${this._loadedChunkCount()} 个区块`,
        Math.min(0.99, 0.75 + this._loadedChunkCount() / 200),
      );
      if (this.world.meshQueue.length === 0 && this.world.genQueue.length === 0) {
        quietFrames++;
        if (quietFrames > 30) break;
      } else {
        quietFrames = 0;
      }
      await nextFrame();
    }
    this.player.spawnPoint = { x: this.player.x, y: this.player.y, z: this.player.z };
  }

  /** 已经生成、并且至少有一个区块段完成网格化的区块数量。 */
  _loadedChunkCount() {
    let count = 0;
    for (const chunk of this.world.chunks.values()) {
      if (chunk.state === 'ready' && chunk.meshes.size > 0) count++;
    }
    return count;
  }

  _setLoading(text, progress) {
    this.ui.loadingText.textContent = text;
    this.ui.loadingBar.style.width = `${Math.round(progress * 100)}%`;
  }

  /* ---------------- 菜单 ---------------- */

  showMenu(kind) {
    const ui = this.ui;
    this.paused = true;
    this._clearTouchInput();
    this.input.exitLock();
    ui.menu.classList.remove('hidden');
    ui.menuButtons.innerHTML = '';
    ui.menuBody.innerHTML = '';
    ui.inventory.classList.add('hidden');
    ui.options.classList.add('hidden');
    this._updateMobileControls();

    if (kind === 'title') {
      ui.menuTitle.textContent = '我的世界 · 网页版';
      ui.menuBody.innerHTML = `
        <p>用 WebGL2 从零写的体素沙盒，单文件即可运行，不需要服务器。</p>
        <p class="dim">世界种子：${this.seed}</p>`;
      this._addButton('开始游戏', () => this.resume());
      this._addButton('读取存档', () => {
        if (this._restoreSave()) this.resume();
        else this._toast('没有找到存档', 2);
      });
      this._addButton('操作说明', () => this.showMenu('controls'));
      this._addButton('选项', () => this.showMenu('options'));
      this._addButton('新的世界', () => this.newWorld());
    } else if (kind === 'pause') {
      ui.menuTitle.textContent = '游戏菜单';
      this._addButton('返回游戏', () => this.resume());
      this._addButton('物品栏', () => this.openInventory());
      this._addButton('选项', () => this.showMenu('options'));
      this._addButton('保存世界', () => {
        if (this.saveWorld()) this._toast('世界已保存', 1.5);
        else this._toast('保存失败', 2);
      });
      this._addButton('操作说明', () => this.showMenu('controls'));
      this._addButton('新的世界', () => this.newWorld());
    } else if (kind === 'controls') {
      ui.menuTitle.textContent = '操作说明';
      ui.menuBody.innerHTML = `
        <ul class="controls">
          <li><b>W A S D</b><span>前后左右移动</span></li>
          <li><b>手机触控</b><span>左侧摇杆移动，拖动屏幕转向</span></li>
          <li><b>点击 / 长按画面</b><span>点击放置方块，长按挖掘或攻击</span></li>
          <li><b>手机按钮</b><span>跳跃、潜行、物品栏、暂停</span></li>
          <li><b>点击快捷栏</b><span>手机上点击底部物品切换</span></li>
          <li><b>空格</b><span>跳跃 / 上浮 / 上升</span></li>
          <li><b>Shift</b><span>潜行 / 下降</span></li>
          <li><b>Ctrl 或双击 W</b><span>疾跑</span></li>
          <li><b>移动鼠标</b><span>转动视角</span></li>
          <li><b>鼠标左键</b><span>挖掘方块 / 攻击生物</span></li>
          <li><b>鼠标右键</b><span>放置方块</span></li>
          <li><b>鼠标中键</b><span>复制准星所指的方块</span></li>
          <li><b>1 - 9 / 滚轮</b><span>切换快捷栏</span></li>
          <li><b>E</b><span>打开物品栏与合成</span></li>
          <li><b>F</b><span>切换创造模式飞行</span></li>
          <li><b>G</b><span>切换生存 / 创造模式</span></li>
          <li><b>R</b><span>创造模式下回到地面</span></li>
          <li><b>F3</b><span>显示调试信息</span></li>
          <li><b>Esc</b><span>暂停菜单</span></li>
        </ul>`;
      this._addButton('返回', () => this.showMenu('pause'));
    } else if (kind === 'options') {
      ui.menuTitle.textContent = '选项';
      // 选项就嵌在本面板内，直接显示即可，它不再是独立浮层。
      ui.options.classList.remove('hidden');
      this._syncOptionControls();
      this._addButton('完成', () => this.showMenu(this.player.dead ? 'death' : 'pause'));
    } else if (kind === 'death') {
      ui.menuTitle.textContent = '你死了！';
      ui.menuBody.innerHTML = `<p>死因：${this.deathCause()}</p>`;
      this._addButton('重生', () => this.respawn());
      this._addButton('新的世界', () => this.newWorld());
    }
    this._updateHint();
  }

  /** 把记录下来的死因翻译成中文。 */
  deathCause() {
    const causes = {
      fall: '摔落伤害',
      drown: '溺水',
      lava: '被岩浆烧死',
      starve: '饿死',
      cactus: '被仙人掌扎死',
      zombie: '被僵尸杀死',
    };
    return causes[this.player.lastDamageCause] ?? '未知原因';
  }

  _addButton(label, onClick) {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => {
      resumeAudio();
      initAudio();
      onClick();
    });
    this.ui.menuButtons.appendChild(button);
    return button;
  }

  resume() {
    this.paused = false;
    this.ui.menu.classList.add('hidden');
    this.ui.inventory.classList.add('hidden');
    this.ui.options.classList.add('hidden');
    if (!this.isMobile) this.input.requestLock();
    this._updateHint();
    this._updateMobileControls();
  }

  newWorld() {
    try { localStorage.removeItem('mc-web-save'); } catch { /* 存储被禁用 */ }
    location.reload();
  }

  respawn() {
    this.player.respawn();
    this.mobs.mobs.length = 0;
    this.deathShown = false;
    this.resume();
  }

  saveWorld() {
    try {
      localStorage.setItem('mc-web-save', JSON.stringify({
        world: this.world.serialize(),
        inventory: this.inventory.serialize(),
        player: {
          x: this.player.x, y: this.player.y, z: this.player.z,
          yaw: this.player.yaw, pitch: this.player.pitch,
          health: this.player.health, hunger: this.player.hunger,
          mode: this.player.gameMode,
          spawn: this.player.spawnPoint,
        },
      }));
      return true;
    } catch (err) {
      console.error('[game] 保存失败', err);
      return false;
    }
  }

  _restoreSave() {
    let raw;
    try { raw = localStorage.getItem('mc-web-save'); } catch { return false; }
    if (!raw) return false;
    try {
      const save = JSON.parse(raw);
      if (!save?.world) return false;
      this.world.loadSave(save.world);
      if (save.inventory) this.inventory.load(save.inventory);
      if (save.player) {
        this.player.x = save.player.x;
        this.player.y = save.player.y;
        this.player.z = save.player.z;
        this.player.yaw = save.player.yaw ?? 0;
        this.player.pitch = save.player.pitch ?? 0;
        this.player.health = save.player.health ?? PLAYER.maxHealth;
        this.player.hunger = save.player.hunger ?? PLAYER.maxHunger;
        this.player.setGameMode(save.player.mode ?? 'survival');
        if (save.player.spawn) this.player.spawnPoint = save.player.spawn;
      }
      return true;
    } catch (err) {
      console.warn('[game] 存档无法解析', err);
      return false;
    }
  }

  /* ---------------- 物品栏界面 ---------------- */

  openInventory() {
    this.paused = true;
    this._clearTouchInput();
    this.input.exitLock();
    this.ui.menu.classList.add('hidden');
    this.ui.inventory.classList.remove('hidden');
    this._renderInventoryGrid();
    this._renderRecipes();
    this._updateHint();
    this._updateMobileControls();
  }

  _renderInventoryGrid() {
    const grid = this.ui.inventoryGrid;
    grid.innerHTML = '';
    // 创造模式下这里会变成方块选择面板，和原版一样。
    const palette = this.player.gameMode === 'creative' ? CREATIVE_BLOCKS : null;
    const entries = palette
      ? palette.map((id) => ({ id, palette: true }))
      : this.inventory.slots.map((stack, index) => ({ stack, index }));

    entries.forEach((entry) => {
      const cell = document.createElement('button');
      cell.className = 'inv-slot';
      const id = entry.palette ? entry.id : entry.stack?.id;
      const count = entry.palette ? null : entry.stack?.count;
      if (id !== undefined && id !== null) {
        cell.title = stackDisplayName(id);
        const icon = this.renderer.iconCanvas(id);
        if (icon) cell.appendChild(icon);
        if (count && count > 1) {
          const badge = document.createElement('span');
          badge.className = 'count';
          badge.textContent = String(count);
          cell.appendChild(badge);
        }
      }
      cell.addEventListener('click', () => {
        if (entry.palette) {
          this.inventory.slots[this.inventory.selected] = { id: entry.id, count: 64 };
        } else if (entry.stack) {
          this.inventory.selected = entry.index % HOTBAR_SIZE;
          this.inventory.slots[this.inventory.selected] = entry.stack;
        }
        this._renderInventoryGrid();
      });
      grid.appendChild(cell);
    });
  }

  _renderRecipes() {
    const list = this.ui.recipeList;
    list.innerHTML = '';
    const affordable = availableRecipes(this.inventory);
    for (const recipe of RECIPES) {
      const button = document.createElement('button');
      button.className = 'recipe';
      if (!affordable.includes(recipe)) button.classList.add('disabled');
      button.innerHTML = `<span>${recipe.out.count} × ${stackDisplayName(recipe.out.id)}</span>`
        + `<small>消耗 ${recipe.cost.count} × ${stackDisplayName(recipe.cost.id)}</small>`;
      button.addEventListener('click', () => {
        if (craft(this.inventory, recipe)) {
          playSfx('item.pickup');
          this._renderInventoryGrid();
          this._renderRecipes();
        } else {
          playSfx('click', { volume: 0.3 });
        }
      });
      list.appendChild(button);
    }
  }

  /* ---------------- 选项 ---------------- */

  _bindOptionControls() {
    const { hudScale, sensitivity, fov, volume, renderDistance } = this.ui;
    hudScale?.addEventListener('input', () => {
      this.hudScale = Number(hudScale.value);
      this._syncOptionControls();
      this._resize();
    });
    sensitivity?.addEventListener('input', () => {
      this.sensitivity = Number(sensitivity.value) / 1000;
      this.input.sensitivity = this.sensitivity;
      this._syncOptionControls();
    });
    fov?.addEventListener('input', () => {
      this.fov = Number(fov.value);
      if (this.renderer) this.renderer.fov = this.fov;
      this._syncOptionControls();
    });
    volume?.addEventListener('input', () => {
      this.volume = Number(volume.value) / 100;
      setVolume(this.volume);
      this._syncOptionControls();
    });
    renderDistance?.addEventListener('change', () => {
      this.renderDistance = Number(renderDistance.value);
      if (this.world) {
        this.world.renderDistance = this.renderDistance;
        this.renderer.renderDistanceBlocks = this.renderDistance * CHUNK_SIZE;
      }
    });
  }

  /** 把当前设置写回控件，并刷新旁边的数值标签。 */
  _syncOptionControls() {
    const { hudScale, sensitivity, fov, volume, renderDistance } = this.ui;
    if (hudScale) hudScale.value = String(this.hudScale);
    if (sensitivity) sensitivity.value = String(Math.round(this.sensitivity * 1000));
    if (fov) fov.value = String(this.fov);
    if (volume) volume.value = String(Math.round(this.volume * 100));
    if (renderDistance) renderDistance.value = String(this.renderDistance);

    const label = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    label('opt-fov-value', String(this.fov));
    label('opt-sensitivity-value', this.sensitivity.toFixed(3));
    label('opt-hud-scale-value', String(this.hudScale));
    label('opt-volume-value', String(Math.round(this.volume * 100)));
  }

  _applyOptions() {
    setVolume(this.volume);
    this.renderer.fov = this.fov;
    this.renderer.renderDistanceBlocks = this.renderDistance * CHUNK_SIZE;
    this.input.sensitivity = this.sensitivity;
  }

  /* ---------------- 输入 ---------------- */

  _onKey(code, event, isUp) {
    if (isUp || !this.running) return;

    // 双击 W 疾跑，和原版一致。
    if (code === 'KeyW' && !this.paused) {
      const now = performance.now();
      if (now - this.doubleTapTimer < 320) this.doubleTapSprint = true;
      this.doubleTapTimer = now;
    } else if (code !== 'KeyW') {
      this.doubleTapSprint = false;
    }

    if (code === 'Escape') {
      if (!this.ui.inventory.classList.contains('hidden')) this.resume();
      else if (this.paused) this.showMenu('title');
      else this.showMenu('pause');
      return;
    }
    if (this.paused) {
      if (code === 'KeyE' && !this.ui.inventory.classList.contains('hidden')) this.resume();
      return;
    }

    switch (code) {
      case 'KeyE':
        this.openInventory();
        break;
      case 'F3':
        this.showDebug = !this.showDebug;
        this.ui.debug.classList.toggle('hidden', !this.showDebug);
        break;
      case 'KeyF':
        if (this.player.gameMode === 'creative') {
          this.player.flying = !this.player.flying;
          this._toast(`飞行：${this.player.flying ? '开' : '关'}`, 1.4);
        }
        break;
      case 'KeyG': {
        const mode = this.player.gameMode === 'creative' ? 'survival' : 'creative';
        this.player.setGameMode(mode);
        this._toast(`游戏模式：${mode === 'creative' ? '创造' : '生存'}`, 1.6);
        break;
      }
      case 'KeyR':
        if (this.player.gameMode === 'creative') {
          this.player.y = this.world.surfaceY(Math.floor(this.player.x), Math.floor(this.player.z)) + 1;
          this.player.vy = 0;
        }
        break;
      default:
        if (/^Digit[1-9]$/.test(code)) {
          this.inventory.selectHotbar(Number(code.slice(5)) - 1);
          this._toast(stackDisplayName(this.inventory.held?.id ?? BLOCK.AIR), 1.2);
        }
    }
  }

  _onLockChange(locked) {
    if (!locked && this.running && !this.paused && !this.player.dead) this.showMenu('pause');
    this._updateHint();
  }

  _updateHint() {
    const hint = this.ui.hint;
    if (!this.isMobile && this.running && !this.paused && !this.input.locked) {
      hint.classList.remove('hidden');
      hint.textContent = '点击开始游戏';
    } else {
      hint.classList.add('hidden');
    }
  }

  _toast(message, seconds = 1.5) {
    if (!message) return;
    this.ui.toast.textContent = message;
    this.ui.toast.classList.remove('hidden');
    this.toastTimer = seconds;
    this.heldNameTimer = 2.0;
  }

  /* ---------------- 主循环 ---------------- */

  _loop() {
    requestAnimationFrame(() => this._frame());
  }

  _frame() {
    const now = performance.now();
    // 上限 0.25 秒：从后台切回来时不会因为累积时间而瞬移。
    const dt = Math.min((now - this.clock.last) / 1000, 0.25);
    this.clock.last = now;

    this.clock.frames++;
    this.clock.fpsTimer += dt;
    if (this.clock.fpsTimer >= 0.5) {
      this.clock.fps = Math.round(this.clock.frames / this.clock.fpsTimer);
      this.clock.frames = 0;
      this.clock.fpsTimer = 0;
    }

    if (this.running) {
      this.world.update(this.player.x, this.player.z, this.paused ? 10 : 3);
      if (!this.paused) {
        this.input.enabled = this.isMobile || this.input.locked;
        this._applyLook();
        this._tick(dt);
      }
      this._render();
    }
    this.input.endFrame();
    this._loop();
  }

  _applyLook() {
    const look = this.input.lookDelta();
    if (look.yaw || look.pitch) {
      this.player.yaw += look.yaw;
      this.player.pitch = clamp(this.player.pitch + look.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    }
  }

  _setupMobileControls() {
    document.body.classList.toggle('mobile-device', this.isMobile);
    if (!this.ui.mobileControls) return;

    this.ui.mobileControls.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-touch-action]')) event.preventDefault();
    });

    this.ui.mobileControls.querySelectorAll('[data-touch-key]').forEach((button) => {
      const pointerIds = new Set();
      const setPressed = (pressed) => this.input.setTouchKey(button.dataset.touchKey, pressed);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        pointerIds.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
        setPressed(true);
      });
      const release = (event) => {
        if (!pointerIds.delete(event.pointerId)) return;
        if (!pointerIds.size) setPressed(false);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });

    this.ui.mobileControls.querySelector('[data-touch-action="inventory"]')
      ?.addEventListener('click', () => this.openInventory());
    this.ui.mobileControls.querySelector('[data-touch-action="pause"]')
      ?.addEventListener('click', () => this.showMenu('pause'));

    const joystick = this.ui.joystick;
    joystick?.addEventListener('pointerdown', (event) => {
      if (this.paused || this._joystickPointer !== null) return;
      event.preventDefault();
      this._joystickPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      this._updateJoystick(event);
    });
    joystick?.addEventListener('pointermove', (event) => {
      if (event.pointerId === this._joystickPointer) this._updateJoystick(event);
    });
    const releaseJoystick = (event) => {
      if (event.pointerId !== this._joystickPointer) return;
      this._joystickPointer = null;
      this._setJoystickKeys(0, 0);
      this.ui.joystickKnob.style.transform = '';
    };
    joystick?.addEventListener('pointerup', releaseJoystick);
    joystick?.addEventListener('pointercancel', releaseJoystick);
    joystick?.addEventListener('lostpointercapture', releaseJoystick);

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.isMobile || this.paused || event.pointerType === 'mouse') return;
      const slot = this._hotbarSlotAt(event.offsetX, event.offsetY);
      if (slot >= 0) {
        this.inventory.selectHotbar(slot);
        event.preventDefault();
        return;
      }
      if (this._touchLookPointer !== null) return;
      this._touchLookPointer = event.pointerId;
      this._touchDragged = false;
      this._touchHoldActive = false;
      this._touchStartPosition = { x: event.clientX, y: event.clientY };
      this._lastTouchPosition = { x: event.clientX, y: event.clientY };
      this._touchPlaceTimer = 0;
      this.canvas.setPointerCapture(event.pointerId);
      this._touchHoldTimer = setTimeout(() => {
        if (this._touchLookPointer !== event.pointerId || this._touchDragged) return;
        this._touchHoldActive = true;
        this.input.setTouchButton(0, true);
      }, 350);
      event.preventDefault();
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this._touchLookPointer) return;
      const previous = this._lastTouchPosition;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      const start = this._touchStartPosition;
      if (!this._touchDragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
        this._touchDragged = true;
        clearTimeout(this._touchHoldTimer);
        this._touchHoldTimer = null;
      }
      if (this._touchDragged) this.input.addTouchLook(dx, dy);
      this._lastTouchPosition = { x: event.clientX, y: event.clientY };
    });
    const releaseTouch = (event, cancelled = false) => {
      if (event.pointerId !== this._touchLookPointer) return;
      clearTimeout(this._touchHoldTimer);
      this._touchHoldTimer = null;
      if (this._touchHoldActive) this.input.setTouchButton(0, false);
      else if (!cancelled && !this._touchDragged) this._touchPlaceTimer = 0.12;
      this._touchHoldActive = false;
      this._touchLookPointer = null;
    };
    this.canvas.addEventListener('pointerup', (event) => releaseTouch(event));
    this.canvas.addEventListener('pointercancel', (event) => releaseTouch(event, true));
    this.canvas.addEventListener('lostpointercapture', (event) => releaseTouch(event, true));
  }

  _updateJoystick(event) {
    const rect = this.ui.joystick.getBoundingClientRect();
    const radius = rect.width * 0.36;
    const dx = clamp(event.clientX - (rect.left + rect.width / 2), -radius, radius);
    const dy = clamp(event.clientY - (rect.top + rect.height / 2), -radius, radius);
    const x = dx / radius, y = dy / radius;
    this._setJoystickKeys(x, y);
    this.ui.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _setJoystickKeys(x, y) {
    const magnitude = Math.hypot(x, y);
    const deadZone = 0.12;
    const strength = magnitude > deadZone
      ? Math.min(1, (magnitude - deadZone) / (1 - deadZone))
      : 0;
    const scale = magnitude > 0 ? strength / magnitude : 0;
    this.input.setTouchMove(x * scale, -y * scale);
  }

  _hotbarSlotAt(x, y) {
    const scale = this.hudScale;
    const slot = Math.round(22 * scale);
    const gap = Math.round(2 * scale);
    const totalWidth = slot * 9 + gap * 8;
    const startX = Math.round((this.canvas.clientWidth - totalWidth) / 2);
    const top = Math.round(this.canvas.clientHeight - slot - 6 * scale) - 4 * scale;
    if (y < top || y > top + slot + 8 * scale) return -1;
    const index = Math.floor((x - startX) / (slot + gap));
    if (index < 0 || index >= 9 || x > startX + index * (slot + gap) + slot) return -1;
    return index;
  }

  _updateMobileControls() {
    this.ui.mobileControls?.classList.toggle(
      'hidden',
      !this.isMobile || !this.running || this.paused
        || !this.ui.inventory.classList.contains('hidden'),
    );
    this.ui.crosshair?.classList.toggle('hidden', !this.running || this.paused);
    this._updateHint();
  }

  _tick(dt) {
    const input = this.input;
    const player = this.player;
    const intent = {
      forward: input.isDown('KeyW'),
      backward: input.isDown('KeyS'),
      left: input.isDown('KeyA'),
      right: input.isDown('KeyD'),
      moveX: input.touchMove.x,
      moveY: input.touchMove.y,
      jump: input.isDown('jump'),
      sneak: input.isDown('sneak'),
      sprint: input.isDown('sprint') || this.doubleTapSprint,
    };

    this.clock.accumulator += dt;
    let steps = 0;
    while (this.clock.accumulator >= TICK && steps < 10) {
      this.clock.accumulator -= TICK;
      steps++;
      this.world.time = (this.world.time + 1) % 24000;
      this._previousPlayerPosition = { x: player.x, y: player.y, z: player.z };

      player.update(this.world, intent, TICK, {
        onStep: (world, x, y, z) => {
          const id = world.getBlock(x, y, z);
          if (id !== 0) {
            playSfx(`step.${BLOCKS[id]?.walkSound ?? 'stone'}`, { rate: 0.9 + Math.random() * 0.2, volume: 0.35 });
          }
        },
        onSwim: () => { if (Math.random() < 0.25) playSfx('splash', { volume: 0.3 }); },
        onHurt: () => { playSfx('player.hurt', { volume: 0.8 }); this.damageFlash = 1; },
      });

      this.mobs.update(player, TICK, {
        onPlayerHurt: () => { this.damageFlash = 1; },
        onPickup: (blockId, count) => {
          const leftover = this.inventory.add(blockId, count);
          if (leftover < count) playSfx('item.pickup', { rate: 1 + Math.random() * 0.2, volume: 0.5 });
          return leftover;
        },
      });

      if (player.dead && !this.deathShown) {
        this.deathShown = true;
        playSfx('player.death');
        setTimeout(() => { if (player.dead) this.showMenu('death'); }, 900);
      }
    }

    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);

    // 左键在够得着生物时是攻击，否则是挖掘。
    const mining = input.mouseButton(0);
    const placing = input.mouseButton(2) || this._touchPlaceTimer > 0;
    this._touchPlaceTimer = Math.max(0, this._touchPlaceTimer - dt);
    const aimingAtMob = mining && !!this.mobs.nearest(player, 3.4);
    this.interaction.update({ mine: mining && !aimingAtMob, place: placing, attack: aimingAtMob }, dt);

    for (const button of input.consumeClicks()) {
      if (button === 1 && this.interaction.target) {
        const id = this.world.getBlock(
          this.interaction.target.x, this.interaction.target.y, this.interaction.target.z,
        );
        if (id) {
          this.inventory.slots[this.inventory.selected] = { id, count: 64 };
          this._toast(stackDisplayName(id), 1.2);
        }
      }
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.ui.toast.classList.add('hidden');
    }
    if (this.heldNameTimer > 0) this.heldNameTimer -= dt;
  }

  _render() {
    const player = this.player;
    let previous = this._previousPlayerPosition ?? player;
    if (Math.hypot(player.x - previous.x, player.y - previous.y, player.z - previous.z) > 3) {
      previous = player;
    }
    const alpha = Math.min(1, this.clock.accumulator / TICK);
    const renderX = previous.x + (player.x - previous.x) * alpha;
    const renderY = previous.y + (player.y - previous.y) * alpha;
    const renderZ = previous.z + (player.z - previous.z) * alpha;
    const eyeOffset = player.eyeY - player.y;
    this.renderer.updateSky(this.world.time, 24000);
    this.renderer.updateCamera({
      x: renderX, y: renderY + eyeOffset, z: renderZ, yaw: player.yaw, pitch: player.pitch,
    });
    this.renderer.render({ x: renderX, y: renderY + eyeOffset, z: renderZ });

    const target = this.interaction.target;
    if (target) {
      this.renderer.drawSelection({ x: target.x, y: target.y, z: target.z }, this.interaction.breakProgress);
    }

    const geometry = buildMobGeometry(this.mobs.mobs);
    this.renderer.drawEntities(geometry.vertices, geometry.count, geometry.boxes);
    this.renderer.drawItems(this.mobs.items, { x: renderX, y: renderY + eyeOffset, z: renderZ });

    this.hud.resize(this.canvas.clientWidth, this.canvas.clientHeight, this.hudScale);
    this.hud.render({
      player,
      inventory: this.inventory,
      damageFlash: this.damageFlash,
      underwater: player.headInWater,
      mode: player.gameMode,
      aimingAtEntity: !!this.mobs.nearest(player, 3.4),
      showHotbar: !this.paused,
      heldNameAlpha: this.heldNameTimer > 0 ? Math.min(1, this.heldNameTimer) : 0,
      showHeldName: !this.paused,
    });

    if (this.showDebug) this._updateDebug();
    this._deliverFrameSample();
  }

  _updateDebug() {
    const p = this.player;
    const stats = this.renderer.stats;
    const world = this.world;
    const target = this.interaction.target;
    this.ui.debug.textContent = [
      `我的世界 · 网页版    ${this.clock.fps} 帧/秒`,
      `坐标：${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `区块：${Math.floor(p.x / CHUNK_SIZE)} ${Math.floor(p.z / CHUNK_SIZE)}    世界时间：${Math.floor(world.time)}`,
      `朝向：${facingName(p.yaw)}   偏航 ${(p.yaw * 57.2958).toFixed(1)}°   俯仰 ${(p.pitch * 57.2958).toFixed(1)}°`,
      `生物群系：${world.biomeNameAt(Math.floor(p.x), Math.floor(p.z))}`,
      `区块段：绘制 ${stats.sections}，剔除 ${stats.culled}   绘制调用 ${stats.drawCalls}   三角面 ${Math.round(stats.triangles)}`,
      `已加载区块：${world.chunks.size}   待处理 ${world.meshQueue.length + world.genQueue.length}`,
      `实体：${this.mobs.mobs.length} 个生物，${this.mobs.items.length} 个掉落物`,
      `准星目标：${target ? `${target.x} ${target.y} ${target.z}（${BLOCKS[target.id]?.display ?? target.id}）` : '无'}`,
      `状态：${p.onGround ? '在地面' : '在空中'}${p.inWater ? ' 水中' : ''}${p.flying ? ' 飞行' : ''}`
        + `   模式 ${p.gameMode === 'creative' ? '创造' : '生存'}   种子 ${this.seed}`,
    ].join('\n');
  }

  _resize() {
    if (!this.renderer) return;
    this.renderer.resize();
    this.hud.resize(this.canvas.clientWidth, this.canvas.clientHeight, this.hudScale);
  }

  /* ---------------- 截图与自检支持 ---------------- */

  /**
   * 让地形流入 `seconds` 秒后画一帧，并把画面编码成 PNG data URL。
   *
   * 供 `?shot=1` 使用：软件渲染下合成器截图会得到空图，而 gl.readPixels
   * 能读到真实像素，所以由页面自己导出画面。
   */
  async captureFrame(seconds = 8, scale = 1) {
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until) {
      this.world.update(this.player.x, this.player.z, 12);
      // 继续模拟，保证相机处于真实的站立高度。
      for (let i = 0; i < 3; i++) this.player.update(this.world, IDLE_INTENT, TICK);
      await nextFrame();
    }

    // 等网格补齐，避免截到满是空洞的画面。
    const meshUntil = performance.now() + 8000;
    let quietFrames = 0;
    while (performance.now() < meshUntil && quietFrames < 45) {
      this.world.update(this.player.x, this.player.z, 12);
      quietFrames = (this.world.meshQueue.length === 0 && this.world.genQueue.length === 0)
        ? quietFrames + 1
        : 0;
      await nextFrame();
    }

    this._render();
    this._render();

    const gl = this.renderer.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(4 * w * h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL 原点在左下角，翻成左上角原点的 ImageData。
    const flipped = new Uint8ClampedArray(pixels.length);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      flipped.set(pixels.subarray(y * rowBytes, y * rowBytes + rowBytes), (h - 1 - y) * rowBytes);
    }
    const full = document.createElement('canvas');
    full.width = w;
    full.height = h;
    full.getContext('2d').putImageData(new ImageData(flipped, w, h), 0, 0);

    const factor = Math.max(0.1, Math.min(1, Number(scale) || 1));
    let source = full;
    if (factor < 1) {
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(w * factor));
      small.height = Math.max(1, Math.round(h * factor));
      const ctx = small.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(full, 0, 0, small.width, small.height);
      source = small;
    }
    return source.toDataURL('image/png');
  }

  /**
   * 从 WebGL 上下文读回画面中部的统计信息，用来判断“画面是不是又黑又平”。
   * 必须在画完这一帧、缓冲区被提交之前读取。
   */
  sampleFramebuffer(timeoutMs = 15000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._frameSample = null;
        resolve({ ok: false, detail: `等待 ${timeoutMs} 毫秒仍没有渲染出帧` });
      }, timeoutMs);
      this._frameSample = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
    });
  }

  /** 一帧渲染结束后，如果有采样请求就交付统计结果。 */
  _deliverFrameSample() {
    const deliver = this._frameSample;
    if (!deliver) return;
    this._frameSample = null;

    const gl = this.renderer.gl;
    const width = Math.min(gl.drawingBufferWidth, 200);
    const height = Math.min(Math.max(40, Math.floor(gl.drawingBufferHeight * 0.25)), 200);
    const x0 = Math.floor((gl.drawingBufferWidth - width) / 2);
    const y0 = Math.floor((gl.drawingBufferHeight - height) / 2);
    const pixels = new Uint8Array(4 * width * height);
    gl.readPixels(x0, y0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let sum = 0;
    const colors = new Set();
    const bands = new Array(8).fill(0);
    const total = width * height;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      sum += luma;
      bands[Math.min(7, Math.floor(luma / 32))]++;
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    const meanLuma = sum / total;
    const usedBands = bands.filter((count) => count > total * 0.01).length;
    deliver({
      ok: meanLuma > 40 && colors.size > 24 && usedBands >= 2,
      detail: `中部 ${width}×${height}：平均亮度 ${meanLuma.toFixed(1)}，`
        + `${colors.size} 种颜色，${usedBands} 个亮度区间`,
    });
  }
}

function facingName(yaw) {
  const deg = ((yaw * 57.2958) % 360 + 360) % 360;
  if (deg < 45 || deg >= 315) return '北 (-Z)';
  if (deg < 135) return '西 (-X)';
  if (deg < 225) return '南 (+Z)';
  return '东 (+X)';
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

const QUERY = new URLSearchParams(location.search);
const game = new Game();
window.game = game;

game.boot().then(async () => {
  if (QUERY.has('test')) runSelfTest(game);

  // ?shot=1 只渲染一帧并把 PNG 放进 DOM，便于无头运行抓图检查渲染。
  if (QUERY.has('shot')) {
    document.getElementById('menu')?.classList.add('hidden');
    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('hint')?.classList.add('hidden');
    if (QUERY.has('yaw')) game.player.yaw = Number(QUERY.get('yaw'));
    if (QUERY.has('pitch')) game.player.pitch = Number(QUERY.get('pitch'));
    if (QUERY.has('time')) game.world.time = Number(QUERY.get('time'));
    if (QUERY.has('fly')) {
      game.player.setGameMode('creative');
      game.player.flying = true;
      game.player.y += Number(QUERY.get('up') || 14);
    }
    if (QUERY.has('nocull')) game.renderer.cullEnabled = false;

    const png = await game.captureFrame(
      Number(QUERY.get('settle') || 10),
      Number(QUERY.get('scale') || 1),
    );
    const holder = document.createElement('pre');
    holder.id = 'shot-data';
    holder.textContent = png;
    document.body.appendChild(holder);

    const info = document.createElement('pre');
    info.id = 'shot-info';
    const p = game.player;
    info.textContent = JSON.stringify({
      camera: {
        x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1),
        yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
        eyeY: +p.eyeY.toFixed(2), onGround: p.onGround, flying: p.flying,
      },
      groundY: game.world.heightAt(Math.floor(p.x), Math.floor(p.z)),
      chunks: game.world.chunks.size,
      meshedChunks: game._loadedChunkCount(),
      pending: game.world.meshQueue.length + game.world.genQueue.length,
      sections: game.renderer.stats.sections,
      culled: game.renderer.stats.culled,
      calls: game.renderer.stats.drawCalls,
    });
    document.body.appendChild(info);
    document.title = 'SHOT-READY';
  }
}).catch((err) => {
  console.error('[game] 启动失败', err);
  const box = document.getElementById('loading-text');
  if (box) {
    box.textContent = `无法启动：${err?.message || err}`;
    if (/WebGL2/i.test(String(err?.message))) {
      box.textContent += ' —— 当前浏览器不支持 WebGL2。';
    }
  }
  document.getElementById('loading')?.classList.remove('hidden');
  document.title = 'BOOT-FAILED';
  writeTestResult([`FAIL 启动 :: ${err?.message || err}`]);
});

/**
 * 自检：把 PASS/FAIL 列表写进 #test-output，供 tools/smoke-test.mjs 读取。
 * 覆盖世界生成、网格化、渲染、物理与玩法链路。
 */
function writeTestResult(lines) {
  let output = document.getElementById('test-output');
  if (!output) {
    output = document.createElement('pre');
    output.id = 'test-output';
    output.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;';
    document.body.appendChild(output);
  }
  output.textContent = `${lines.join('\n')}\n`;
}

async function runSelfTest(instance) {
  const results = [];
  const record = (name, ok, detail = '') => {
    results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
    writeTestResult(results);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    instance.paused = false;
    instance._updateMobileControls();
    await wait(3000);

    const world = instance.world;
    const renderer = instance.renderer;
    const input = instance.input;
    input.keys.clear();
    const fakeKeyEvent = (code, ctrlKey = false) => ({
      code, ctrlKey, metaKey: false, altKey: false, target: instance.canvas,
      preventDefault() {},
    });
    input._onKeyDown(fakeKeyEvent('ControlLeft', true));
    input._onKeyDown(fakeKeyEvent('Space', true));
    record('ctrl-space-input', input.isDown('sprint') && input.isDown('jump'),
      'Ctrl 疾跑与空格跳跃同时生效');
    input.keys.clear();

    const crosshair = document.getElementById('crosshair');
    const crosshairRect = crosshair?.getBoundingClientRect();
    record('crosshair-visible', !!crosshair && !crosshair.classList.contains('hidden')
      && Math.abs(crosshairRect.x + crosshairRect.width / 2 - innerWidth / 2) < 1
      && Math.abs(crosshairRect.y + crosshairRect.height / 2 - innerHeight / 2) < 1,
    '可见且位于屏幕中心');
    record('webgl2', !!renderer.gl, renderer.gl?.getParameter(renderer.gl.VERSION));
    record('textures', renderer.atlasMissing.length === 0,
      `缺失：${renderer.atlasMissing.join(',') || '无'}`);
    record('world-generated', world.chunks.size > 20, `${world.chunks.size} 个区块`);
    record('sections-meshed', world.stats.meshed > 20, `${world.stats.meshed} 个区块段`);
    record('rendered', renderer.stats.drawCalls > 0 && renderer.stats.sections > 0,
      `绘制 ${renderer.stats.sections} 段 / ${renderer.stats.drawCalls} 次调用 / ${Math.round(renderer.stats.triangles)} 三角面`);
    record('player-on-ground', instance.player.onGround, `y=${instance.player.y.toFixed(1)}`);

    const groundY = world.heightAt(Math.floor(instance.player.x), Math.floor(instance.player.z));
    record('terrain-solid', groundY !== null && groundY > 1, `地表 y=${groundY}`);

    const bx = Math.floor(instance.player.x);
    const by = groundY ?? 60;
    const bz = Math.floor(instance.player.z);
    const before = world.getBlock(bx, by, bz);
    world.setBlock(bx, by, bz, 0);
    record('block-edit', before !== 0 && world.getBlock(bx, by, bz) === 0, `${before} -> 0`);
    world.setBlock(bx, by, bz, before);

    const hit = world.raycast([instance.player.x, instance.player.y + 1, instance.player.z], [0, -1, 0], 12);
    record('raycast', !!hit, hit ? `命中地面 y=${hit.y}` : '没有命中');

    for (let i = 0; i < 30; i++) instance.mobs.trySpawnAround(instance.player);
    record('mob-spawn', instance.mobs.mobs.length > 0, `${instance.mobs.mobs.length} 个生物`);
    const geometry = buildMobGeometry(instance.mobs.mobs);
    record('mob-geometry', geometry.count > 0, `${geometry.count} 个顶点`);

    instance.inventory.clear();
    instance.inventory.add(BLOCK.OAK_LOG, 2);
    record('crafting', craft(instance.inventory, RECIPES[0])
      && instance.inventory.countOf(BLOCK.OAK_PLANKS) === 4,
    `木板=${instance.inventory.countOf(BLOCK.OAK_PLANKS)}`);

    let missingIcons = 0;
    for (const id of CREATIVE_BLOCKS) if (!renderer.iconAtlas.uvs.has(id)) missingIcons++;
    record('icons', missingIcons === 0, `${missingIcons} 个方块缺少图标`);

    // 画面必须明亮且有色阶：纯黑或纯色说明贴图或光照链路坏了，
    // 而“没有抛异常”是发现不了这种问题的。
    const sample = await instance.sampleFramebuffer();
    record('frame-content', sample.ok, sample.detail);
  } catch (err) {
    record('exception', false, String((err && err.stack) || err));
  }
}
