import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig';

/**
 * Колбэки действий главного меню
 */
export interface MainMenuCallbacks {
  onStartCombat: () => void;
  onOpenBriefing: () => void;
  onToggleSound: () => boolean;
  isMuted: () => boolean;
  getHighScore: () => number;
  playHoverSound?: () => void;
  playSelectSound?: () => void;
  playDegauss?: () => void;
  isBriefingOpen?: () => boolean;
}

/**
 * Интерфейс управления главным меню
 */
export interface MainMenuManager {
  readonly container: Phaser.GameObjects.Container;
  show: () => void;
  hide: (onComplete?: () => void) => void;
  startTransition: (onComplete: () => void) => void;
  update: (dt: number) => void;
  isVisible: () => boolean;
}

/**
 * Фабрика высокодетализированного главного меню:
 * 1. Глубокий 2.5D радар РЛС-поста с тумбой, вольтметром, тумблерами и гофрой бленды;
 * 2. Живой дежурный луч и дыхание люминофора;
 * 3. Меню перед радаром, механически разбегающееся при старте;
 * 4. Бесшовный наплыв камеры с размагничиванием ЭЛТ и растворением вспышки без рывков.
 */
export function createMainMenu(
  scene: Phaser.Scene,
  callbacks: MainMenuCallbacks,
): MainMenuManager {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0);
  container.setDepth(45);
  container.setVisible(true);

  // 1. АМБИЕНТ БУНКЕРА: металлический стол, световой конус настольной лампы, кабель питания
  const bgGfx = scene.add.graphics();
  bgGfx.fillStyle(0x02070e, 1.0);
  bgGfx.fillRect(0, 0, width, height);

  // Световой конус операторской лампы над аппаратурой
  bgGfx.fillStyle(0x06181b, 0.55);
  bgGfx.fillEllipse(500, 285, 680, 460);
  bgGfx.fillStyle(0x0a2422, 0.28);
  bgGfx.fillEllipse(500, 285, 520, 340);
  bgGfx.fillStyle(0x133832, 0.12);
  bgGfx.fillEllipse(500, 285, 360, 240);

  // Окантовка металлического стола
  bgGfx.lineStyle(1.5, 0x1e293b, 0.75);
  bgGfx.strokeRect(12, 12, width - 24, height - 24);

  // Заклёпки по углам
  const cornerRivets = [
    { x: 24, y: 24 },
    { x: width - 24, y: 24 },
    { x: 24, y: height - 24 },
    { x: width - 24, y: height - 24 },
  ];
  for (const r of cornerRivets) {
    bgGfx.fillStyle(0x334155, 0.9);
    bgGfx.fillCircle(r.x, r.y, 4.5);
    bgGfx.fillStyle(0x0f172a, 0.95);
    bgGfx.fillCircle(r.x, r.y, 2);
  }

  // Гофрированный толстый кабель питания, уходящий влево-вниз
  const cablePoints = [
    { x: 330, y: 430 },
    { x: 280, y: 450 },
    { x: 220, y: 485 },
    { x: 150, y: 525 },
    { x: 80, y: 555 },
    { x: 30, y: 570 },
  ];
  bgGfx.lineStyle(8, 0x050d10, 0.9);
  bgGfx.beginPath();
  bgGfx.moveTo(cablePoints[0].x, cablePoints[0].y);
  for (let i = 1; i < cablePoints.length; i++) {
    bgGfx.lineTo(cablePoints[i].x, cablePoints[i].y);
  }
  bgGfx.strokePath();

  bgGfx.lineStyle(5.5, 0x0c1e22, 0.85);
  bgGfx.beginPath();
  bgGfx.moveTo(cablePoints[0].x, cablePoints[0].y);
  for (let i = 1; i < cablePoints.length; i++) {
    bgGfx.lineTo(cablePoints[i].x, cablePoints[i].y);
  }
  bgGfx.strokePath();

  // Хомуты крепления кабеля
  const cableClamps = [
    { x: 250, y: 472 },
    { x: 150, y: 524 },
  ];
  for (const c of cableClamps) {
    bgGfx.fillStyle(0x334155, 0.9);
    bgGfx.fillRect(c.x - 3, c.y - 7, 6, 14);
    bgGfx.lineStyle(1, 0x0f172a, 0.9);
    bgGfx.strokeRect(c.x - 3, c.y - 7, 6, 14);
  }

  // Трафаретная маркировка стойки
  const stencilText = scene.add.text(
    28,
    height - 28,
    'ПОСТ ВКО-44 // АППАРАТНАЯ СТОЙКА 1РЛ-134 // СТАНЦИЯ ОБНАРУЖЕНИЯ «ОБЗОР» // ГОСТ 14254-80',
    {
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: '10px',
      color: '#334155',
      fontStyle: 'bold',
      letterSpacing: 1.5,
    },
  );

  container.add([bgGfx, stencilText]);

  // 2. СЛОЙ 2.5D ОБЪЁМНОГО РАДАРА
  const radar3dGfx = scene.add.graphics();
  container.add(radar3dGfx);

  // Отдельный верхний слой для вспышки зажигания катода (перекрывает момент передачи управления)
  const ignitionFlashGfx = scene.add.graphics();
  container.add(ignitionFlashGfx);

  // Стартовые параметры 2.5D геометрии
  const menuRadarX = 500;
  const menuRadarY = 285;
  const menuRx = 230;
  const menuRy = 132;
  const menuVisorDepth = 32;

  // Боевые параметры (строго по центру боевого сектора)
  const combatRadarX = GAME_CONFIG.radarX;
  const combatRadarY = GAME_CONFIG.radarY;
  const combatRadarRadius = GAME_CONFIG.radarRadius;

  let currentCenterX = menuRadarX;
  let currentCenterY = menuRadarY;
  let currentRx = menuRx;
  let currentRy = menuRy;
  let currentVisorDepth = menuVisorDepth;
  let currentPedestalAlpha = 1.0;
  let currentIgnitionProgress = 0.0;
  let isTransitioning = false;
  let hasTriggeredDegauss = false;
  let standbySweepAngle = 0;

  /**
   * Отрисовка детализированной военной станции 1РЛ-134:
   * - Чугунная приборная тумба со скошенными углами;
   * - Стрелочный вольтметр напряжения накала ЭЛТ (с микро-дрожанием стрелки);
   * - Лимб плавной регулировки усиления ПРД с засечками;
   * - Два металлических тумблера П2Т со светодиодными индикаторами;
   * - Гофрированная резиновая бленда тубуса с 3 складками глубины;
   * - Сферическое выпуклое стекло кинескопа с сеткой шкал дальности, азимутальными рисками и живым вращающимся лучом.
   */
  const renderVolumetricRadar = (timeNow: number, sweepAngle: number) => {
    radar3dGfx.clear();
    ignitionFlashGfx.clear();

    const cx = currentCenterX;
    const cy = currentCenterY;
    const rx = currentRx;
    const ry = currentRy;
    const depth = currentVisorDepth;
    const pedestalA = currentPedestalAlpha;

    // «Дыхание» фосфора ЭЛТ в дежурном режиме
    const breathing = 0.85 + 0.15 * Math.sin(timeNow * 0.0035);

    // ==========================================
    // A. ПРИБОРНАЯ ТУМБА И АНАЛОГОВЫЕ ПРИБОРЫ (ШАССИ)
    // ==========================================
    if (pedestalA > 0.02) {
      // 1. Тень аппарата на металлическом столе
      radar3dGfx.fillStyle(0x010508, 0.85 * pedestalA);
      radar3dGfx.fillRoundedRect(cx - rx * 1.3, cy + ry * 0.45, rx * 2.6, ry * 1.6, 14);

      // 2. Чугунная плита шасси (трапеция в перспективе)
      radar3dGfx.fillStyle(0x071216, 0.98 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.18, cy - ry * 0.28);
      radar3dGfx.lineTo(cx + rx * 1.18, cy - ry * 0.28);
      radar3dGfx.lineTo(cx + rx * 1.28, cy + ry * 1.48);
      radar3dGfx.lineTo(cx - rx * 1.28, cy + ry * 1.48);
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Окантовка плиты с фаской
      radar3dGfx.lineStyle(2, 0x16332e, 0.9 * pedestalA);
      radar3dGfx.strokePath();

      // Лицевая приборная панель цвета тёмно-оливковой военной эмали
      radar3dGfx.fillStyle(0x0a1c1a, 0.96 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.14, cy - ry * 0.22);
      radar3dGfx.lineTo(cx + rx * 1.14, cy - ry * 0.22);
      radar3dGfx.lineTo(cx + rx * 1.23, cy + ry * 1.42);
      radar3dGfx.lineTo(cx - rx * 1.23, cy + ry * 1.42);
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      radar3dGfx.lineStyle(1.2, 0x1f443d, 0.75 * pedestalA);
      radar3dGfx.strokePath();

      // Вентиляционные прорези магнетрона (6 жалюзи с тенями)
      for (let i = 0; i < 5; i++) {
        const slotY = cy + ry * 0.72 + i * 8.5;
        radar3dGfx.fillStyle(0x03080b, 0.9 * pedestalA);
        radar3dGfx.fillRoundedRect(cx - 65, slotY, 130, 4.5, 2);
        radar3dGfx.lineStyle(1, 0x1b3b33, 0.6 * pedestalA);
        radar3dGfx.strokeRoundedRect(cx - 65, slotY, 130, 4.5, 2);
      }

      // 4 массивных крепёжных болта по углам плиты
      const bolts = [
        { x: cx - rx * 1.14, y: cy + ry * 1.35 },
        { x: cx + rx * 1.14, y: cy + ry * 1.35 },
        { x: cx - rx * 1.06, y: cy - ry * 0.14 },
        { x: cx + rx * 1.06, y: cy - ry * 0.14 },
      ];
      for (const b of bolts) {
        radar3dGfx.fillStyle(0x334155, 0.9 * pedestalA);
        radar3dGfx.fillCircle(b.x, b.y, 4.5);
        radar3dGfx.lineStyle(1, 0x0f172a, 0.95 * pedestalA);
        radar3dGfx.strokeCircle(b.x, b.y, 4.5);
        // Шлиц
        radar3dGfx.lineBetween(b.x - 2.5, b.y - 0.5, b.x + 2.5, b.y + 0.5);
      }

      // 3. АНАЛОГОВЫЙ СТРЕЛОЧНЫЙ ВОЛЬТМЕТР (Слева внизу на панели)
      const gaugeX = cx - rx * 0.72;
      const gaugeY = cy + ry * 1.02;
      const gaugeR = 21;

      // Ободок прибора
      radar3dGfx.fillStyle(0x0e1f24, 0.95 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR + 2);
      radar3dGfx.lineStyle(1.8, 0x334155, 0.85 * pedestalA);
      radar3dGfx.strokeCircle(gaugeX, gaugeY, gaugeR + 2);

      // Циферблат прибора
      radar3dGfx.fillStyle(0x04130d, 0.98 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR);

      // Шкала (зелёная дуга номинала 6.3V)
      radar3dGfx.lineStyle(2, 0x166534, 0.7 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX, gaugeY, gaugeR - 4, Math.PI * 0.8, Math.PI * 1.8, false);
      radar3dGfx.strokePath();

      // Стрелка прибора с лёгким аналоговым дрожанием
      const needleJitter = Math.sin(timeNow * 0.012) * 0.04;
      const needleAngle = Math.PI * 1.32 + needleJitter;
      radar3dGfx.lineStyle(1.5, 0xf59e0b, 0.95 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(gaugeX, gaugeY + 2);
      radar3dGfx.lineTo(
        gaugeX + Math.cos(needleAngle) * (gaugeR - 5),
        gaugeY + Math.sin(needleAngle) * (gaugeR - 5),
      );
      radar3dGfx.strokePath();

      radar3dGfx.fillStyle(0xf8fafc, 0.95 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY + 2, 2.5);

      // 4. ЛИМБ РЕГУЛИРОВКИ УСИЛЕНИЯ ПРД (Справа внизу на панели)
      const dialX = cx + rx * 0.72;
      const dialY = cy + ry * 1.02;
      const dialR = 19;

      radar3dGfx.fillStyle(0x0e1f24, 0.95 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR + 3);
      radar3dGfx.lineStyle(1.8, 0x334155, 0.85 * pedestalA);
      radar3dGfx.strokeCircle(dialX, dialY, dialR + 3);

      radar3dGfx.fillStyle(0x061413, 0.98 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR);

      // Засечки лимба
      radar3dGfx.lineStyle(1.2, 0x475569, 0.75 * pedestalA);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        radar3dGfx.lineBetween(
          dialX + Math.cos(a) * (dialR - 4),
          dialY + Math.sin(a) * (dialR - 4),
          dialX + Math.cos(a) * dialR,
          dialY + Math.sin(a) * dialR,
        );
      }
      // Указательная риска на ручке
      radar3dGfx.lineStyle(2, 0x38bdf8, 0.95 * pedestalA);
      radar3dGfx.lineBetween(dialX, dialY, dialX + 11, dialY - 11);

      // 5. ДВА ТУМБЛЕРА П2Т С ХРОМИРОВАННЫМИ РЫЧАЖКАМИ (Внизу по центру)
      const switches = [
        { x: cx - 28, y: cy + ry * 1.25, ledColor: 0x22c55e, isOn: true },
        { x: cx + 28, y: cy + ry * 1.25, ledColor: 0xf59e0b, isOn: true },
      ];
      for (const sw of switches) {
        // База тумблера
        radar3dGfx.fillStyle(0x0f172a, 0.95 * pedestalA);
        radar3dGfx.fillRect(sw.x - 12, sw.y - 10, 24, 20);
        radar3dGfx.lineStyle(1.2, 0x334155, 0.8 * pedestalA);
        radar3dGfx.strokeRect(sw.x - 12, sw.y - 10, 24, 20);

        // Светодиодный индикатор над тумблером
        radar3dGfx.fillStyle(sw.ledColor, 0.85 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y - 15, 2.5);
        radar3dGfx.lineStyle(1, 0xffffff, 0.6 * pedestalA);
        radar3dGfx.strokeCircle(sw.x, sw.y - 15, 2.5);

        // Хромированный рычажок тумблера
        radar3dGfx.lineStyle(3, 0x94a3b8, 0.95 * pedestalA);
        radar3dGfx.lineBetween(sw.x, sw.y + 4, sw.x, sw.y - 5);
        radar3dGfx.fillStyle(0xe2e8f0, 0.95 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y - 5, 2.5);
      }
    }

    // ==========================================
    // B. ГОФРИРОВАННАЯ РЕЗИНОВАЯ БЛЕНДА ТУБУСА (3D ОБЪЁМ)
    // ==========================================
    if (depth > 1.5) {
      // 3 складки гофры резинового тубуса (гармошка бленды)
      const foldOffsets = [
        { yOff: -depth * 0.55, scale: 1.10, color: 0x050e12 },
        { yOff: -depth * 0.20, scale: 1.05, color: 0x09171b },
        { yOff: depth * 0.15, scale: 1.02, color: 0x0d2126 },
      ];

      for (const f of foldOffsets) {
        radar3dGfx.fillStyle(f.color, 0.96);
        radar3dGfx.fillEllipse(cx, cy + f.yOff, rx * f.scale, ry * f.scale);
        radar3dGfx.lineStyle(1.2, 0x16353b, 0.75);
        radar3dGfx.strokeEllipse(cx, cy + f.yOff, rx * f.scale, ry * f.scale);
      }

      // Боковая коническая поверхность бленды (соединяет складки в один объёмный раструб)
      radar3dGfx.fillStyle(0x0e2328, 0.96);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.10, cy - depth * 0.55);
      radar3dGfx.lineTo(cx - rx, cy + depth * 0.5);
      radar3dGfx.arc(cx, cy + depth * 0.5, rx, Math.PI, 0, false);
      radar3dGfx.lineTo(cx + rx * 1.10, cy - depth * 0.55);
      radar3dGfx.arc(cx, cy - depth * 0.55, rx * 1.10, 0, Math.PI, true);
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Внутренняя тень в глубине раструба (Ambient Occlusion)
      radar3dGfx.fillStyle(0x010507, 0.88);
      radar3dGfx.fillEllipse(cx, cy - depth * 0.1, rx * 1.02, ry * 1.02);
    } else {
      // При виде строго сверху (боевой режим) — плоский круглый козырёк
      radar3dGfx.fillStyle(0x0c1e22, 0.95);
      radar3dGfx.fillCircle(cx, cy, rx * 1.04);
      radar3dGfx.lineStyle(2, 0x1e3a35, 0.85);
      radar3dGfx.strokeCircle(cx, cy, rx * 1.04);
    }

    // Лицевое рельефное резиновое кольцо наглазника (Front Bezel Ring)
    radar3dGfx.lineStyle(3.5, 0x1f3438, 0.98);
    radar3dGfx.strokeEllipse(cx, cy, rx, ry);
    // Светлая фаска отблеска на резине сверху
    radar3dGfx.lineStyle(1.8, 0x64748b, 0.45);
    radar3dGfx.beginPath();
    radar3dGfx.arc(cx, cy, rx * 0.99, Math.PI * 1.15, Math.PI * 1.85, false);
    radar3dGfx.strokePath();

    // ==========================================
    // C. СТЕКЛО КИНЕСКОПА ЭЛТ И ШКАЛЫ ДАЛЬНОСТИ
    // ==========================================
    const glassRx = rx * 0.95;
    const glassRy = ry * 0.95;

    // Холодный матовый люминофор ЭЛТ
    radar3dGfx.fillStyle(0x021109, 0.98);
    radar3dGfx.fillEllipse(cx, cy, glassRx, glassRy);

    // Сетка шкал дальности (в перспективе — эллипсы 25%, 50%, 75%, 100%)
    const ringAlphas = currentIgnitionProgress > 0 ? 0.95 : 0.35 * breathing;
    const ringColor = currentIgnitionProgress > 0 ? 0x22c55e : 0x14532d;

    const ringFractions = [0.25, 0.5, 0.75, 0.98];
    for (const rf of ringFractions) {
      radar3dGfx.lineStyle(1.2, ringColor, ringAlphas);
      radar3dGfx.strokeEllipse(cx, cy, glassRx * rf, glassRy * rf);
    }

    // Перспективные визирные оси с засечками дальности
    radar3dGfx.lineStyle(1.0, ringColor, ringAlphas * 0.75);
    radar3dGfx.beginPath();
    radar3dGfx.moveTo(cx - glassRx * 0.98, cy);
    radar3dGfx.lineTo(cx + glassRx * 0.98, cy);
    radar3dGfx.moveTo(cx, cy - glassRy * 0.98);
    radar3dGfx.lineTo(cx, cy + glassRy * 0.98);
    radar3dGfx.strokePath();

    // Азимутальные риски по периметру экрана (каждые 30 градусов)
    radar3dGfx.lineStyle(1.0, ringColor, ringAlphas * 0.6);
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = Phaser.Math.DegToRad(deg);
      const innerX = cx + Math.cos(rad) * glassRx * 0.93;
      const innerY = cy + Math.sin(rad) * glassRy * 0.93;
      const outerX = cx + Math.cos(rad) * glassRx * 0.98;
      const outerY = cy + Math.sin(rad) * glassRy * 0.98;
      radar3dGfx.lineBetween(innerX, innerY, outerX, outerY);
    }

    // ==========================================
    // D. ЖИВОЙ ДЕЖУРНЫЙ ЛУЧ РАЗВЁРТКИ ЭЛТ
    // ==========================================
    if (currentIgnitionProgress <= 0.05) {
      const beamAngle = sweepAngle;
      const beamX = cx + Math.cos(beamAngle) * glassRx * 0.97;
      const beamY = cy + Math.sin(beamAngle) * glassRy * 0.97;

      // Мягкий широкий сектор послесвечения люминофора по дуге эллипса
      const trailSpan = 0.55;
      const trailSteps = 8;
      radar3dGfx.fillStyle(0x166534, 0.16 * breathing);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx, cy);
      for (let s = trailSteps; s >= 0; s--) {
        const a = beamAngle - (trailSpan * s) / trailSteps;
        const px = cx + Math.cos(a) * glassRx * 0.97;
        const py = cy + Math.sin(a) * glassRy * 0.97;
        radar3dGfx.lineTo(px, py);
      }
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Сам луч развёртки с яркой световой кромкой
      radar3dGfx.lineStyle(1.6, 0x4ade80, 0.65 * breathing);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx, cy);
      radar3dGfx.lineTo(beamX, beamY);
      radar3dGfx.strokePath();

      // Накал нити катода в центре кинескопа
      const dotPulse = 0.5 + 0.5 * Math.sin(timeNow * 0.005);
      radar3dGfx.fillStyle(0x22c55e, 0.45 * dotPulse);
      radar3dGfx.fillCircle(cx, cy, 7 * dotPulse + 2);
      radar3dGfx.fillStyle(0x86efac, 0.9);
      radar3dGfx.fillCircle(cx, cy, 2.4);
    }

    // Отблеск выпуклой стеклянной линзы кинескопа
    radar3dGfx.lineStyle(2, 0xffffff, 0.12 * breathing);
    radar3dGfx.beginPath();
    radar3dGfx.arc(cx - 10, cy - 8, glassRx * 0.85, Math.PI * 1.1, Math.PI * 1.6, false);
    radar3dGfx.strokePath();

    // ==========================================
    // E. ОТОБРАЖЕНИЕ ВСПЫШКИ ПУСКА (IGNITION FLASH)
    // ==========================================
    if (currentIgnitionProgress > 0) {
      const ign = currentIgnitionProgress;
      const lineLen = glassRx * Math.min(1.0, ign * 1.8);
      const lineH = Math.max(2, glassRy * ign * 0.95);

      // Зелёный ореол вокруг катодной линии
      ignitionFlashGfx.fillStyle(0x4ade80, 0.6 * ign);
      ignitionFlashGfx.fillEllipse(cx, cy, lineLen, lineH);

      // Яркий белый сердечник вспышки
      ignitionFlashGfx.fillStyle(0xffffff, Math.min(1.0, ign * 1.2));
      ignitionFlashGfx.fillRect(cx - lineLen * 0.9, cy - 2, lineLen * 1.8, 4);

      // Полное сияние фосфорного диска на пике
      ignitionFlashGfx.fillStyle(0x22c55e, 0.4 * ign);
      ignitionFlashGfx.fillEllipse(cx, cy, glassRx, glassRy);
    }
  };

  renderVolumetricRadar(0, 0);

  // 3. ПЕРЕДНИЙ ПЛАН: ГЛАВНОЕ МЕНЮ (РАЗБЕГАЕТСЯ ПРИ СТАРТЕ)
  const menuCenterX = 500;

  // А. Контейнер заголовка (шильдик с названием игры)
  const titleContainer = scene.add.container(menuCenterX, 76);
  container.add(titleContainer);

  const titleBoxW = 510;
  const titleBoxH = 74;

  const titlePlaque = scene.add.graphics();
  titlePlaque.fillStyle(0x0b1320, 0.96);
  titlePlaque.fillRoundedRect(-titleBoxW / 2, -titleBoxH / 2, titleBoxW, titleBoxH, 6);
  titlePlaque.lineStyle(2, 0x334155, 0.9);
  titlePlaque.strokeRoundedRect(-titleBoxW / 2, -titleBoxH / 2, titleBoxW, titleBoxH, 6);

  // 4 винта по углам шильдика
  const screwInset = 8;
  const screws = [
    { x: -titleBoxW / 2 + screwInset, y: -titleBoxH / 2 + screwInset },
    { x: titleBoxW / 2 - screwInset, y: -titleBoxH / 2 + screwInset },
    { x: -titleBoxW / 2 + screwInset, y: titleBoxH / 2 - screwInset },
    { x: titleBoxW / 2 - screwInset, y: titleBoxH / 2 - screwInset },
  ];
  for (const s of screws) {
    titlePlaque.fillStyle(0x64748b, 0.85);
    titlePlaque.fillCircle(s.x, s.y, 3.8);
    titlePlaque.lineStyle(1.5, 0x0f172a, 0.95);
    titlePlaque.beginPath();
    titlePlaque.moveTo(s.x - 3, s.y - 1);
    titlePlaque.lineTo(s.x + 3, s.y + 1);
    titlePlaque.strokePath();
  }

  const placeholderTag = scene.add.text(0, -19, '// МЕСТО ДЛЯ НАЗВАНИЯ ИГРЫ //', {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '11px',
    color: '#f59e0b',
    fontStyle: 'bold',
    letterSpacing: 2,
  }).setOrigin(0.5);

  const mainTitleText = scene.add.text(0, 3, 'РАДИОЛОКАЦИОННЫЙ ПОСТ «ОБЗОР»', {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '18px',
    color: '#f8fafc',
    fontStyle: 'bold',
    letterSpacing: 2.5,
  }).setOrigin(0.5);

  const titleSubText = scene.add.text(0, 23, 'ТЕРМИНАЛ БОЕВОГО УПРАВЛЕНИЯ ПВО • РЕЖИМ ОЖИДАНИЯ', {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: '10px',
    color: '#64748b',
    fontStyle: 'bold',
    letterSpacing: 1,
  }).setOrigin(0.5);

  titleContainer.add([titlePlaque, placeholderTag, mainTitleText, titleSubText]);

  // Б. Контейнеры клавиш управления (Вариант А)
  interface IndicatorButton {
    hotkey: string;
    label: string;
    sublabel: string;
    colorHex: number;
    colorText: string;
    action: () => void;
  }

  const buttonsData: IndicatorButton[] = [
    {
      hotkey: '1',
      label: '[ 1 ] ЗАСТУПИТЬ НА ДЕЖУРСТВО',
      sublabel: 'ПУСК КОМПЛЕКСА РЛС • СТАРТ БОЕВОЙ СМЕНЫ',
      colorHex: 0x22c55e,
      colorText: '#4ade80',
      action: () => triggerStart(),
    },
    {
      hotkey: '2',
      label: '[ 2 ] БОЕВОЙ РЕГЛАМЕНТ',
      sublabel: 'ИНСТРУКЦИЯ ОПЕРАТОРА • ТАКТИЧЕСКИЕ ПРАВИЛА',
      colorHex: 0xf59e0b,
      colorText: '#fbbf24',
      action: () => callbacks.onOpenBriefing(),
    },
    {
      hotkey: '3',
      label: '[ 3 ] АРХИВ ДЕЖУРСТВ',
      sublabel: `ЛУЧШИЙ РЕКОРД СТАНЦИИ: ${callbacks.getHighScore()} ОЧК`,
      colorHex: 0x0ea5e9,
      colorText: '#38bdf8',
      action: () => {},
    },
    {
      hotkey: '4',
      label: '[ 4 ] ЗВУКОВОЙ ТРАКТ: [ВКЛ]',
      sublabel: 'ТУМБЛЕР АКУСТИЧЕСКОГО КОНТРОЛЯ СВЯЗИ',
      colorHex: 0xa855f7,
      colorText: '#c084fc',
      action: () => {
        const isMuted = callbacks.onToggleSound();
        updateSoundButtonLabel(!isMuted);
      },
    },
  ];

  const btnW = 460;
  const btnH = 58;
  const startBtnY = 168;
  const btnGap = 68;

  const btnContainers: Phaser.GameObjects.Container[] = [];
  let soundBtnLabelRef: Phaser.GameObjects.Text | null = null;
  let recordSubLabelRef: Phaser.GameObjects.Text | null = null;

  const updateSoundButtonLabel = (isEnabled: boolean) => {
    if (soundBtnLabelRef) {
      soundBtnLabelRef.setText(
        isEnabled ? '[ 4 ] ЗВУКОВОЙ ТРАКТ: [ВКЛ]' : '[ 4 ] ЗВУКОВОЙ ТРАКТ: [ОТКЛ]',
      );
    }
  };

  buttonsData.forEach((btn, index) => {
    const btnY = startBtnY + index * btnGap;
    const btnContainer = scene.add.container(menuCenterX, btnY);
    container.add(btnContainer);
    btnContainers.push(btnContainer);

    const btnGfx = scene.add.graphics();
    const glowGfx = scene.add.graphics();

    const drawButton = (isHovered: boolean, isPressed: boolean) => {
      btnGfx.clear();
      glowGfx.clear();

      const halfW = btnW / 2;
      const halfH = btnH / 2;
      const yOffset = isPressed ? 2 : 0;

      if (isHovered) {
        glowGfx.fillStyle(btn.colorHex, 0.24);
        glowGfx.fillRoundedRect(-halfW - 6, -halfH - 6 + yOffset, btnW + 12, btnH + 12, 8);
        glowGfx.fillStyle(btn.colorHex, 0.38);
        glowGfx.fillRoundedRect(-halfW, -halfH + yOffset, btnW, btnH, 5);
      }

      // Тёмная основа кнопки с лёгкой прозрачностью (чтобы сквозь неё угадывался живой радар)
      const baseColor = isHovered ? 0x0f241d : 0x0b1320;
      btnGfx.fillStyle(baseColor, 0.94);
      btnGfx.fillRoundedRect(-halfW, -halfH + yOffset, btnW, btnH, 5);

      const strokeColor = isHovered ? btn.colorHex : 0x334155;
      btnGfx.lineStyle(1.8, strokeColor, isHovered ? 0.95 : 0.75);
      btnGfx.strokeRoundedRect(-halfW, -halfH + yOffset, btnW, btnH, 5);

      // Левый светосигнальный флажок
      btnGfx.fillStyle(btn.colorHex, isHovered ? 1.0 : 0.6);
      btnGfx.fillRect(-halfW + 3, -halfH + 4 + yOffset, 5, btnH - 8);

      // Верхняя светлая фаска 3D-объёма
      btnGfx.lineStyle(1.2, 0xffffff, isHovered ? 0.4 : 0.15);
      btnGfx.beginPath();
      btnGfx.moveTo(-halfW + 5, -halfH + 1 + yOffset);
      btnGfx.lineTo(halfW - 5, -halfH + 1 + yOffset);
      btnGfx.strokePath();
    };

    drawButton(false, false);

    const mainLabel = scene.add.text(0, -9, btn.label, {
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: '14px',
      color: '#f8fafc',
      fontStyle: 'bold',
      letterSpacing: 1.5,
    }).setOrigin(0.5);

    const subLabel = scene.add.text(0, 12, btn.sublabel, {
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: '10px',
      color: btn.colorText,
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0.5);

    if (btn.hotkey === '3') {
      recordSubLabelRef = subLabel;
    }

    if (btn.hotkey === '4') {
      soundBtnLabelRef = mainLabel;
      updateSoundButtonLabel(!callbacks.isMuted());
    }

    const hitZone = scene.add.rectangle(0, 0, btnW, btnH, 0x000000, 0);
    hitZone.setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      if (isTransitioning) return;
      drawButton(true, false);
      callbacks.playHoverSound?.();
    });

    hitZone.on('pointerout', () => {
      drawButton(false, false);
    });

    hitZone.on('pointerdown', () => {
      if (isTransitioning) return;
      drawButton(true, true);
      callbacks.playSelectSound?.();
    });

    hitZone.on('pointerup', () => {
      if (isTransitioning) return;
      drawButton(true, false);
      btn.action();
    });

    btnContainer.add([glowGfx, btnGfx, mainLabel, subLabel, hitZone]);
  });

  // В. Подвал с подсказками клавиш
  const footerText = scene.add.text(
    menuCenterX,
    height - 30,
    '[ НАЖМИТЕ 1 ДЛЯ ПУСКА СТАНЦИИ • КЛАВИШИ 1–4 НА КЛАВИАТУРЕ • SPACE / ENTER ]',
    {
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: '10px',
      color: '#64748b',
      fontStyle: 'bold',
      letterSpacing: 1,
    },
  ).setOrigin(0.5);

  container.add(footerText);

  // =========================================================================
  // 4. АНИМАЦИЯ: МЕХАНИЧЕСКОЕ «РАЗБЕГАНИЕ» МЕНЮ И БЕСШОВНЫЙ НАПЛЫВ КАМЕРЫ НА ЭКРАН
  // =========================================================================
  const startTransition = (onComplete: () => void) => {
    if (isTransitioning) return;
    isTransitioning = true;
    hasTriggeredDegauss = false;

    callbacks.playSelectSound?.();

    // 1. МЕНЮ РАЗБЕГАЕТСЯ В СТОРОНЫ (380 мс)
    scene.tweens.add({
      targets: titleContainer,
      y: -140,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[0],
      x: menuCenterX - 340,
      y: btnContainers[0].y - 20,
      alpha: 0,
      duration: 380,
      ease: 'Back.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[1],
      x: menuCenterX + 340,
      y: btnContainers[1].y - 20,
      alpha: 0,
      duration: 400,
      ease: 'Back.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[2],
      x: menuCenterX - 380,
      y: btnContainers[2].y + 40,
      alpha: 0,
      duration: 420,
      ease: 'Back.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[3],
      x: menuCenterX + 380,
      y: btnContainers[3].y + 40,
      alpha: 0,
      duration: 440,
      ease: 'Back.easeIn',
    });

    scene.tweens.add({
      targets: footerText,
      y: height + 50,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeIn',
    });

    // 2. НАПЛЫВ КАМЕРЫ К РАДАРУ И РАСКРЫТИЕ ЭЛЛИПСА В КРУГ
    const transitionObj = { progress: 0 };
    scene.tweens.add({
      targets: transitionObj,
      progress: 1.0,
      duration: 1350,
      ease: 'Cubic.easeInOut',
      onUpdate: () => {
        const p = transitionObj.progress;

        // Плавная интерполяция центра и радиусов
        currentCenterX = Phaser.Math.Linear(menuRadarX, combatRadarX, p);
        currentCenterY = Phaser.Math.Linear(menuRadarY, combatRadarY, p);
        currentRx = Phaser.Math.Linear(menuRx, combatRadarRadius, p);
        currentRy = Phaser.Math.Linear(menuRy, combatRadarRadius, p);
        currentVisorDepth = Phaser.Math.Linear(menuVisorDepth, 0, p);
        currentPedestalAlpha = Math.max(0, 1.0 - p * 1.6);

        // Фаза зажигания катода и звука размагничивания ЭЛТ (на 78% пути)
        if (p >= 0.78) {
          if (!hasTriggeredDegauss) {
            hasTriggeredDegauss = true;
            callbacks.playDegauss?.();
          }
          // Вспышка нарастает к 1.0 ровно в момент финала пути
          currentIgnitionProgress = (p - 0.78) / 0.22;
        }

        renderVolumetricRadar(scene.time.now, standbySweepAngle);
      },
      onComplete: () => {
        // В момент финала вспышка на 100% заливает экран белым люминофором.
        // Здесь мы мгновенно активируем боевую сцену, а саму вспышку плавно растворяем,
        // что даёт 100% БЕСШОВНЫЙ переход без единого видимого рывка!
        onComplete();

        // Скрываем менюшную графику тумбы
        radar3dGfx.clear();
        container.setVisible(false);

        // Создаём отдельный оверлей растворения вспышки поверх боевого радара
        const dissolveFlash = scene.add.graphics();
        dissolveFlash.setDepth(35);
        dissolveFlash.fillStyle(0x4ade80, 0.45);
        dissolveFlash.fillCircle(combatRadarX, combatRadarY, combatRadarRadius);
        dissolveFlash.fillStyle(0xffffff, 0.85);
        dissolveFlash.fillRect(combatRadarX - combatRadarRadius * 0.9, combatRadarY - 2, combatRadarRadius * 1.8, 4);

        scene.tweens.add({
          targets: dissolveFlash,
          alpha: 0,
          duration: 320,
          ease: 'Quad.easeOut',
          onComplete: () => {
            dissolveFlash.destroy();
          },
        });
      },
    });
  };

  const triggerStart = () => {
    startTransition(() => {
      callbacks.onStartCombat();
    });
  };

  // Обработчик клавиш
  const onKeyDown = (e: KeyboardEvent) => {
    if (!container.visible || container.alpha < 0.5 || isTransitioning) return;
    if (callbacks.isBriefingOpen && callbacks.isBriefingOpen()) return;

    if (e.key === '1' || e.key === 'Enter' || e.code === 'Space') {
      triggerStart();
    } else if (e.key === '2') {
      callbacks.playSelectSound?.();
      callbacks.onOpenBriefing();
    } else if (e.key === '4' || e.key.toLowerCase() === 'm') {
      callbacks.playSelectSound?.();
      const isMuted = callbacks.onToggleSound();
      updateSoundButtonLabel(!isMuted);
    }
  };

  window.addEventListener('keydown', onKeyDown);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener('keydown', onKeyDown);
  });
  scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
    window.removeEventListener('keydown', onKeyDown);
  });

  const show = () => {
    isTransitioning = false;
    hasTriggeredDegauss = false;
    currentCenterX = menuRadarX;
    currentCenterY = menuRadarY;
    currentRx = menuRx;
    currentRy = menuRy;
    currentVisorDepth = menuVisorDepth;
    currentPedestalAlpha = 1.0;
    currentIgnitionProgress = 0.0;

    // Сброс позиций заголовка и клавиш
    titleContainer.setY(76);
    titleContainer.setAlpha(1);

    btnContainers.forEach((bc, idx) => {
      bc.setX(menuCenterX);
      bc.setY(startBtnY + idx * btnGap);
      bc.setAlpha(1);
    });

    footerText.setY(height - 30);
    footerText.setAlpha(1);

    container.setVisible(true);
    container.setAlpha(1);
    updateSoundButtonLabel(!callbacks.isMuted());

    if (recordSubLabelRef) {
      const best = callbacks.getHighScore();
      recordSubLabelRef.setText(
        best > 0 ? `ЛУЧШИЙ РЕКОРД СТАНЦИИ: ${best} ОЧК` : 'АРХИВ ПУСТ • НЕТ ДАННЫХ ДЕЖУРСТВ',
      );
    }

    renderVolumetricRadar(scene.time.now, standbySweepAngle);
  };

  const hide = (onComplete?: () => void) => {
    scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        container.setVisible(false);
        onComplete?.();
      },
    });
  };

  const update = (dt: number) => {
    // Вращение дежурного луча и дыхание люминофора
    standbySweepAngle = (standbySweepAngle + dt * 1.15) % (Math.PI * 2);

    if (!isTransitioning) {
      renderVolumetricRadar(scene.time.now, standbySweepAngle);
      placeholderTag.setAlpha(0.65 + 0.35 * Math.sin(scene.time.now * 0.004));
    }
  };

  const isVisible = () => container.visible && container.alpha > 0.05;

  return {
    container,
    show,
    hide,
    startTransition,
    update,
    isVisible,
  };
}
