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
  const menuCenterX = Math.round(width / 2); // Строгий геометрический центр экрана (480 при 960x640)
  const menuCenterY = 280; // Единый вертикальный центр для кнопок меню и экрана радара

  const container = scene.add.container(0, 0);
  container.setDepth(45);
  container.setVisible(true);

  // 1. АМБИЕНТ БУНКЕРА: металлический стол, световой конус настольной лампы, кабель питания
  const solidBgGfx = scene.add.graphics();
  solidBgGfx.fillStyle(0x02070e, 1.0);
  solidBgGfx.fillRect(0, 0, width, height);

  const ambientRoomGfx = scene.add.graphics();

  // Мягкий рассеянный свет лампы на металлическом столе
  ambientRoomGfx.fillStyle(0x06181b, 0.25);
  ambientRoomGfx.fillEllipse(menuCenterX, menuCenterY + 5, 620, 390);
  ambientRoomGfx.fillStyle(0x08201f, 0.12);
  ambientRoomGfx.fillEllipse(menuCenterX, menuCenterY + 5, 440, 270);

  // Окантовка металлического стола
  ambientRoomGfx.lineStyle(1.5, 0x1e293b, 0.75);
  ambientRoomGfx.strokeRect(12, 12, width - 24, height - 24);

  // Заклёпки по углам
  const cornerRivets = [
    { x: 24, y: 24 },
    { x: width - 24, y: 24 },
    { x: 24, y: height - 24 },
    { x: width - 24, y: height - 24 },
  ];
  for (const r of cornerRivets) {
    ambientRoomGfx.fillStyle(0x334155, 0.9);
    ambientRoomGfx.fillCircle(r.x, r.y, 4.5);
    ambientRoomGfx.fillStyle(0x0f172a, 0.95);
    ambientRoomGfx.fillCircle(r.x, r.y, 2);
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
  ambientRoomGfx.lineStyle(8, 0x050d10, 0.9);
  ambientRoomGfx.beginPath();
  ambientRoomGfx.moveTo(cablePoints[0].x, cablePoints[0].y);
  for (let i = 1; i < cablePoints.length; i++) {
    ambientRoomGfx.lineTo(cablePoints[i].x, cablePoints[i].y);
  }
  ambientRoomGfx.strokePath();

  ambientRoomGfx.lineStyle(5.5, 0x0c1e22, 0.85);
  ambientRoomGfx.beginPath();
  ambientRoomGfx.moveTo(cablePoints[0].x, cablePoints[0].y);
  for (let i = 1; i < cablePoints.length; i++) {
    ambientRoomGfx.lineTo(cablePoints[i].x, cablePoints[i].y);
  }
  ambientRoomGfx.strokePath();

  // Хомуты крепления кабеля
  const cableClamps = [
    { x: 250, y: 472 },
    { x: 150, y: 524 },
  ];
  for (const c of cableClamps) {
    ambientRoomGfx.fillStyle(0x334155, 0.9);
    ambientRoomGfx.fillRect(c.x - 3, c.y - 7, 6, 14);
    ambientRoomGfx.lineStyle(1, 0x0f172a, 0.9);
    ambientRoomGfx.strokeRect(c.x - 3, c.y - 7, 6, 14);
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

  container.add([solidBgGfx, ambientRoomGfx, stencilText]);

  // 2. СЛОЙ 2.5D ОБЪЁМНОГО РАДАРА
  const radar3dGfx = scene.add.graphics();
  container.add(radar3dGfx);

  // Отдельный верхний слой для вспышки зажигания катода (перекрывает момент передачи управления)
  const ignitionFlashGfx = scene.add.graphics();
  container.add(ignitionFlashGfx);

  // Стартовые параметры 2.5D геометрии
  const menuRadarX = menuCenterX;
  const menuRadarY = menuCenterY;
  const menuRx = 230;
  const menuRy = 135;
  const menuVisorDepth = 36;

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
   * Отрисовка детализированной военной станции 1РЛ-134 (Mike Klubnika aesthetic):
   * - Чугунная приборная тумба с направленной светотенью, верхними фасками и шильдиком;
   * - Стрелочный вольтметр накала 6.3V с тёплой янтарной подсветкой шкалы и трепещущей стрелкой;
   * - Лимб плавной регулировки усиления ПРД с радиальными засечками и светящимся маркером;
   * - Два металлических тумблера П2Т со светящимися индикаторами (зелёный «СЕТЬ», янтарный «НАКАЛ»);
   * - Коническая резиновая бленда тубуса с 3 рельефными складками и глубокой внутренней тенью шахты;
   * - Сферическое выпуклое оптическое стекло кинескопа с виньетированием, дуговым бликом, сеткой и живым сканирующим лучом;
   * - Дежурные фосфорные эхо-метки целей в эфире.
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
    if (pedestalA > 0.01) {
      // 1. Мягкая диффузная тень аппарата на металлическом столе
      radar3dGfx.fillStyle(0x000305, 0.45 * pedestalA);
      radar3dGfx.fillEllipse(cx, cy + ry * 1.58, rx * 2.8, ry * 1.5);
      radar3dGfx.fillStyle(0x010508, 0.75 * pedestalA);
      radar3dGfx.fillRoundedRect(cx - rx * 1.28, cy + ry * 0.45, rx * 2.56, ry * 1.55, 14);

      // 2. Чугунная плита шасси (трапеция в перспективе)
      // Тёмная сторона корпуса со скосами
      radar3dGfx.fillStyle(0x040d10, 0.98 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.25, cy - ry * 0.35);
      radar3dGfx.lineTo(cx + rx * 1.25, cy - ry * 0.35);
      radar3dGfx.lineTo(cx + rx * 1.35, cy + ry * 1.58);
      radar3dGfx.lineTo(cx - rx * 1.35, cy + ry * 1.58);
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Верхняя светлая фаска (отблеск от настольной лампы)
      radar3dGfx.lineStyle(2.2, 0x224942, 0.95 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.25, cy - ry * 0.35);
      radar3dGfx.lineTo(cx + rx * 1.25, cy - ry * 0.35);
      radar3dGfx.strokePath();

      // Тёмная окантовка боковин плиты
      radar3dGfx.lineStyle(1.8, 0x0f2420, 0.85 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.25, cy - ry * 0.35);
      radar3dGfx.lineTo(cx - rx * 1.35, cy + ry * 1.58);
      radar3dGfx.lineTo(cx + rx * 1.35, cy + ry * 1.58);
      radar3dGfx.lineTo(cx + rx * 1.25, cy - ry * 0.35);
      radar3dGfx.strokePath();

      // Лицевая приборная панель (глубокий военный оливково-серый металл)
      radar3dGfx.fillStyle(0x081917, 0.96 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.20, cy - ry * 0.25);
      radar3dGfx.lineTo(cx + rx * 1.20, cy - ry * 0.25);
      radar3dGfx.lineTo(cx + rx * 1.28, cy + ry * 1.52);
      radar3dGfx.lineTo(cx - rx * 1.28, cy + ry * 1.52);
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Верхняя световая грань панели
      radar3dGfx.lineStyle(1.4, 0x2d5c53, 0.85 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.20, cy - ry * 0.25);
      radar3dGfx.lineTo(cx + rx * 1.20, cy - ry * 0.25);
      radar3dGfx.strokePath();

      // Заводская металлическая табличка (Шильдик 1РЛ-134)
      const plaqueW = 140;
      const plaqueH = 18;
      const plaqueY = cy + ry * 1.03;
      radar3dGfx.fillStyle(0x0e2420, 0.95 * pedestalA);
      radar3dGfx.fillRect(cx - plaqueW / 2, plaqueY, plaqueW, plaqueH);
      radar3dGfx.lineStyle(1.2, 0x334d47, 0.9 * pedestalA);
      radar3dGfx.strokeRect(cx - plaqueW / 2, plaqueY, plaqueW, plaqueH);
      // Заклёпки таблички
      radar3dGfx.fillStyle(0x94a3b8, 0.85 * pedestalA);
      radar3dGfx.fillCircle(cx - plaqueW / 2 + 5, plaqueY + plaqueH / 2, 1.8);
      radar3dGfx.fillCircle(cx + plaqueW / 2 - 5, plaqueY + plaqueH / 2, 1.8);

      // Вентиляционные жалюзи магнетрона (4 горизонтальных прорези с тенями)
      for (let i = 0; i < 4; i++) {
        const slotY = cy + ry * 1.20 + i * 8.5;
        // Глубокая внутренняя щель
        radar3dGfx.fillStyle(0x010507, 0.95 * pedestalA);
        radar3dGfx.fillRoundedRect(cx - 70, slotY, 140, 4.5, 2);
        // Металлическая фаска снизу щели
        radar3dGfx.lineStyle(1.0, 0x1f473e, 0.7 * pedestalA);
        radar3dGfx.lineBetween(cx - 70, slotY + 4.5, cx + 70, slotY + 4.5);
      }

      // 4 массивных крепёжных болта по углам плиты с глубокими шлицами
      const bolts = [
        { x: cx - rx * 1.22, y: cy + ry * 1.48 },
        { x: cx + rx * 1.22, y: cy + ry * 1.48 },
        { x: cx - rx * 1.15, y: cy - ry * 0.20 },
        { x: cx + rx * 1.15, y: cy - ry * 0.20 },
      ];
      for (const b of bolts) {
        // Тень под шляпкой
        radar3dGfx.fillStyle(0x020709, 0.8 * pedestalA);
        radar3dGfx.fillCircle(b.x + 1, b.y + 1, 5);
        // Металлическая шляпка
        radar3dGfx.fillStyle(0x334155, 0.95 * pedestalA);
        radar3dGfx.fillCircle(b.x, b.y, 4.5);
        radar3dGfx.lineStyle(1.2, 0x0f172a, 0.95 * pedestalA);
        radar3dGfx.strokeCircle(b.x, b.y, 4.5);
        // Крестовой шлиц
        radar3dGfx.lineBetween(b.x - 2.5, b.y, b.x + 2.5, b.y);
        radar3dGfx.lineBetween(b.x, b.y - 2.5, b.x, b.y + 2.5);
      }

      // 3. АНАЛОГОВЫЙ СТРЕЛОЧНЫЙ ВОЛЬТМЕТР 6.3V (Слева внизу на панели)
      const gaugeX = cx - rx * 0.76;
      const gaugeY = cy + ry * 1.15;
      const gaugeR = 23;

      // Тень прибора
      radar3dGfx.fillStyle(0x020608, 0.7 * pedestalA);
      radar3dGfx.fillCircle(gaugeX + 1.5, gaugeY + 2, gaugeR + 2);

      // Массивный карболитовый ободок прибора
      radar3dGfx.fillStyle(0x0c1a1e, 0.98 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR + 2.5);
      radar3dGfx.lineStyle(1.8, 0x334155, 0.9 * pedestalA);
      radar3dGfx.strokeCircle(gaugeX, gaugeY, gaugeR + 2.5);

      // Внутреннее тёплое янтарное свечение шкалы (лампа накаливания СМН-6.3)
      radar3dGfx.fillStyle(0x04130d, 0.98 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR);
      radar3dGfx.fillStyle(0xd97706, 0.15 * pedestalA * breathing);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR - 2);

      // Калибровочная дуга шкалы
      radar3dGfx.lineStyle(1.2, 0x475569, 0.75 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX, gaugeY, gaugeR - 5, Math.PI * 0.82, Math.PI * 1.78, false);
      radar3dGfx.strokePath();

      // Зелёная рабочая зона номинала (6.3V)
      radar3dGfx.lineStyle(2.2, 0x22c55e, 0.85 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX, gaugeY, gaugeR - 5, Math.PI * 1.25, Math.PI * 1.55, false);
      radar3dGfx.strokePath();

      // Деления шкалы
      for (let a = Math.PI * 0.85; a <= Math.PI * 1.75; a += Math.PI * 0.18) {
        radar3dGfx.lineStyle(1.0, 0x94a3b8, 0.7 * pedestalA);
        radar3dGfx.lineBetween(
          gaugeX + Math.cos(a) * (gaugeR - 7),
          gaugeY + Math.sin(a) * (gaugeR - 7),
          gaugeX + Math.cos(a) * (gaugeR - 4),
          gaugeY + Math.sin(a) * (gaugeR - 4),
        );
      }

      // Стрелка прибора с лёгким аналоговым дрожанием (гальванометр)
      const needleJitter = Math.sin(timeNow * 0.016) * 0.045;
      const needleAngle = Math.PI * 1.38 + needleJitter;
      radar3dGfx.lineStyle(1.6, 0xf59e0b, 0.98 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(gaugeX, gaugeY + 2);
      radar3dGfx.lineTo(
        gaugeX + Math.cos(needleAngle) * (gaugeR - 6),
        gaugeY + Math.sin(needleAngle) * (gaugeR - 6),
      );
      radar3dGfx.strokePath();

      // Центр стрелки (колпачок)
      radar3dGfx.fillStyle(0xf8fafc, 0.95 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY + 2, 2.8);

      // Стеклянный сферический отблеск на стекле прибора
      radar3dGfx.lineStyle(1.5, 0xffffff, 0.28 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX - 3, gaugeY - 3, gaugeR - 6, Math.PI * 1.1, Math.PI * 1.6, false);
      radar3dGfx.strokePath();

      // 4. ЛИМБ РЕГУЛИРОВКИ УСИЛЕНИЯ ПРД (Справа внизу на панели)
      const dialX = cx + rx * 0.76;
      const dialY = cy + ry * 1.15;
      const dialR = 21;

      // Тень ручки
      radar3dGfx.fillStyle(0x020608, 0.75 * pedestalA);
      radar3dGfx.fillCircle(dialX + 2, dialY + 2, dialR + 3);

      // Металлическое основание лимба
      radar3dGfx.fillStyle(0x0c1a1e, 0.98 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR + 3);
      radar3dGfx.lineStyle(1.8, 0x334155, 0.85 * pedestalA);
      radar3dGfx.strokeCircle(dialX, dialY, dialR + 3);

      // Рифлёная карболитовая ручка
      radar3dGfx.fillStyle(0x061413, 0.98 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR);

      // Засечки лимба по окружности
      radar3dGfx.lineStyle(1.2, 0x475569, 0.75 * pedestalA);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        radar3dGfx.lineBetween(
          dialX + Math.cos(a) * (dialR - 4),
          dialY + Math.sin(a) * (dialR - 4),
          dialX + Math.cos(a) * dialR,
          dialY + Math.sin(a) * dialR,
        );
      }
      // Указательная риска на ручке с подсветкой
      radar3dGfx.lineStyle(2.2, 0x38bdf8, 0.95 * pedestalA);
      radar3dGfx.lineBetween(dialX, dialY, dialX + 12, dialY - 12);
      radar3dGfx.fillStyle(0x38bdf8, 0.9 * pedestalA);
      radar3dGfx.fillCircle(dialX + 12, dialY - 12, 1.5);

      // 5. ДВА ТУМБЛЕРА П2Т СО СВЕТОДИОДАМИ (Внизу по центру)
      const switches = [
        { x: cx - 32, y: cy + ry * 1.44, ledColor: 0x22c55e },
        { x: cx + 32, y: cy + ry * 1.44, ledColor: 0xf59e0b },
      ];
      for (const sw of switches) {
        // Литая металлическая база тумблера
        radar3dGfx.fillStyle(0x0c1626, 0.95 * pedestalA);
        radar3dGfx.fillRect(sw.x - 14, sw.y - 10, 28, 20);
        radar3dGfx.lineStyle(1.4, 0x334155, 0.85 * pedestalA);
        radar3dGfx.strokeRect(sw.x - 14, sw.y - 10, 28, 20);

        // Шестигранная гайка в основании рычажка
        radar3dGfx.fillStyle(0x1e293b, 0.9 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y + 1, 5.5);

        // Светодиодный индикатор с мягким ореолом
        radar3dGfx.fillStyle(sw.ledColor, 0.35 * pedestalA * breathing);
        radar3dGfx.fillCircle(sw.x, sw.y - 16, 6);
        radar3dGfx.fillStyle(sw.ledColor, 0.95 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y - 16, 2.8);
        radar3dGfx.fillStyle(0xffffff, 0.85 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y - 16, 1.2);

        // Хромированный рычажок тумблера со световым бликом
        radar3dGfx.lineStyle(3.2, 0x64748b, 0.95 * pedestalA);
        radar3dGfx.lineBetween(sw.x, sw.y + 4, sw.x, sw.y - 6);
        radar3dGfx.lineStyle(1.5, 0xf1f5f9, 0.95 * pedestalA);
        radar3dGfx.lineBetween(sw.x - 0.5, sw.y + 3, sw.x - 0.5, sw.y - 5);
        radar3dGfx.fillStyle(0xf8fafc, 0.95 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y - 6, 2.8);
      }
    }

    // ==========================================
    // B. ГОФРИРОВАННАЯ РЕЗИНОВАЯ БЛЕНДА ТУБУСА (3D ОБЪЁМ)
    // ==========================================
    if (depth > 1.5) {
      // Глубокий конический раструб тубуса:
      const folds = [
        { yOff: -depth * 0.65, scale: 1.15, baseColor: 0x020709, highlightColor: 0x163430 },
        { yOff: -depth * 0.30, scale: 1.09, baseColor: 0x061417, highlightColor: 0x1c443e },
        { yOff: depth * 0.08, scale: 1.04, baseColor: 0x091c20, highlightColor: 0x23524b },
      ];

      for (const f of folds) {
        // Тёмное тело складки резины
        radar3dGfx.fillStyle(f.baseColor, 0.96);
        radar3dGfx.fillEllipse(cx, cy + f.yOff, rx * f.scale * 2, ry * f.scale * 2);
        // Рельефное ребро складки с хайлайтом
        radar3dGfx.lineStyle(1.4, f.highlightColor, 0.85);
        radar3dGfx.strokeEllipse(cx, cy + f.yOff, rx * f.scale * 2, ry * f.scale * 2);
      }

      // Лицевое массивное резиновое кольцо наглазника (Front Bezel Rim)
      radar3dGfx.lineStyle(4.5, 0x162624, 0.98);
      radar3dGfx.strokeEllipse(cx, cy, rx * 1.02 * 2, ry * 1.02 * 2);

      // Верхняя фаска отблеска на резине от потолочной лампы
      radar3dGfx.lineStyle(2.0, 0x64748b, 0.65 * (depth / menuVisorDepth));
      radar3dGfx.beginPath();
      const rimSteps = 12;
      for (let i = 0; i <= rimSteps; i++) {
        const a = Math.PI * 1.15 + (Math.PI * 0.70 * i) / rimSteps;
        const hx = cx + Math.cos(a) * rx * 1.01;
        const hy = cy + Math.sin(a) * ry * 1.01;
        if (i === 0) radar3dGfx.moveTo(hx, hy);
        else radar3dGfx.lineTo(hx, hy);
      }
      radar3dGfx.strokePath();
    }

    // ==========================================
    // C. СТЕКЛО КИНЕСКОПА ЭЛТ, ШКАЛЫ ДАЛЬНОСТИ И БЕЗЕЛЬ (СИНХРОНИЗИРОВАНО С БОЕВЫМ РАДАРОМ)
    // ==========================================
    const colors = GAME_CONFIG.colors;

    // 1. Постоянное мягкое рассеивание люминофора наружу (Ambient Glass Halo, из background.ts)
    const haloSteps = [
      { d: 40, alpha: 0.008 },
      { d: 26, alpha: 0.02 },
      { d: 15, alpha: 0.04 },
      { d: 6, alpha: 0.07 },
    ];
    for (const h of haloSteps) {
      const hRx = rx + h.d * (rx / combatRadarRadius);
      const hRy = ry + h.d * (ry / combatRadarRadius);
      radar3dGfx.lineStyle(6, colors.blipHalo, h.alpha);
      radar3dGfx.strokeEllipse(cx, cy, hRx * 2, hRy * 2);
    }

    // 2. Заглублённая круглая ниша под колбу (Bezel Recess, из background.ts)
    const recessSteps = [
      { d: 14, alpha: 0.35, color: 0x010502 },
      { d: 8, alpha: 0.55, color: 0x010502 },
      { d: 3, alpha: 0.80, color: 0x010301 },
    ];
    for (const rec of recessSteps) {
      const recRx = rx + rec.d * (rx / combatRadarRadius);
      const recRy = ry + rec.d * (ry / combatRadarRadius);
      radar3dGfx.lineStyle(4, rec.color, rec.alpha);
      radar3dGfx.strokeEllipse(cx, cy, recRx * 2, recRy * 2);
    }

    // 3. Тонкий металлический прижимной обод вокруг стекла (из background.ts)
    const rimRx = rx + 2 * (rx / combatRadarRadius);
    const rimRy = ry + 2 * (ry / combatRadarRadius);
    radar3dGfx.lineStyle(1.5, colors.hudBorder, 0.85);
    radar3dGfx.strokeEllipse(cx, cy, rimRx * 2, rimRy * 2);

    // 4. Холодный матовый люминофор ЭЛТ (colors.radarBg, из radarRender.ts)
    radar3dGfx.fillStyle(colors.radarBg, 0.95);
    radar3dGfx.fillEllipse(cx, cy, rx * 2, ry * 2);

    // Внутреннее мягкое фосфорное сияние колбы
    radar3dGfx.fillStyle(0x062816, 0.35 * breathing);
    radar3dGfx.fillEllipse(cx, cy, rx * 0.88 * 2, ry * 0.88 * 2);

    // 5. Концентрические кольца дальности (25%, 50%, 75%, 100%, из radarRender.ts)
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach((fraction, index) => {
      const isOuter = index === ringSteps.length - 1;
      radar3dGfx.lineStyle(
        isOuter ? 2 : 1,
        isOuter ? colors.radarBorder : colors.gridRing,
        isOuter ? 0.90 : 0.22 * breathing,
      );
      radar3dGfx.strokeEllipse(cx, cy, rx * fraction * 2, ry * fraction * 2);
    });

    // 6. Зона ближней опасности (Danger Close Ring, radius 70, из radarRender.ts)
    const dangerFrac = 70 / combatRadarRadius;
    radar3dGfx.lineStyle(1, colors.dangerRing, 0.32 * breathing);
    radar3dGfx.strokeEllipse(cx, cy, rx * dangerFrac * 2, ry * dangerFrac * 2);

    // 7. Перспективные визирные оси (из radarRender.ts)
    radar3dGfx.lineStyle(1, colors.gridAxis, 0.24 * breathing);
    radar3dGfx.beginPath();
    radar3dGfx.moveTo(cx - rx, cy);
    radar3dGfx.lineTo(cx + rx, cy);
    radar3dGfx.moveTo(cx, cy - ry);
    radar3dGfx.lineTo(cx, cy + ry);
    radar3dGfx.strokePath();

    // 8. Азимутальные риски по периметру (крупные на 90°, мелкие на 30°, из radarRender.ts)
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = Phaser.Math.DegToRad(deg);
      const isMajor = deg % 90 === 0;
      const tickLenFrac = (isMajor ? 10 : 5) / combatRadarRadius;

      const x1 = cx + Math.cos(rad) * rx * (1 - tickLenFrac);
      const y1 = cy + Math.sin(rad) * ry * (1 - tickLenFrac);
      const x2 = cx + Math.cos(rad) * rx;
      const y2 = cy + Math.sin(rad) * ry;

      radar3dGfx.lineStyle(1, colors.gridRing, (isMajor ? 0.70 : 0.30) * breathing);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(x1, y1);
      radar3dGfx.lineTo(x2, y2);
      radar3dGfx.strokePath();
    }

    // ==========================================
    // D. ЖИВОЙ ДЕЖУРНЫЙ ЛУЧ РАЗВЁРТКИ ЭЛТ И ФОСФОРНЫЕ ЭХО
    // ==========================================
    if (currentIgnitionProgress <= 0.05) {
      const beamAngle = sweepAngle;
      const trailSpan = 0.50;
      const trailSteps = 12;

      // Мягкий широкий сектор послесвечения люминофора по дуге эллипса
      radar3dGfx.fillStyle(colors.trail, 0.18 * breathing);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx, cy);
      for (let s = trailSteps; s >= 0; s--) {
        const a = beamAngle - (trailSpan * s) / trailSteps;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        radar3dGfx.lineTo(px, py);
      }
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Сам луч развёртки с изумрудной кромкой
      const beamX = cx + Math.cos(beamAngle) * rx;
      const beamY = cy + Math.sin(beamAngle) * ry;
      radar3dGfx.lineStyle(2, colors.beam, 0.90 * breathing);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx, cy);
      radar3dGfx.lineTo(beamX, beamY);
      radar3dGfx.strokePath();

      // Дежурные фосфорные метки целей в режиме ожидания
      const standbyEchoes = [
        { angle: 0.85, rFrac: 0.65 },
        { angle: 2.45, rFrac: 0.42 },
        { angle: 4.15, rFrac: 0.78 },
      ];
      for (const echo of standbyEchoes) {
        const diff = Math.abs(Phaser.Math.Angle.ShortestBetween(beamAngle, echo.angle));
        if (diff < 0.6) {
          const echoAlpha = (1 - diff / 0.6) * 0.85 * breathing;
          const ex = cx + Math.cos(echo.angle) * rx * echo.rFrac;
          const ey = cy + Math.sin(echo.angle) * ry * echo.rFrac;
          radar3dGfx.fillStyle(colors.blipCore, echoAlpha);
          radar3dGfx.fillCircle(ex, ey, 2.2);
          radar3dGfx.fillStyle(colors.blipHalo, echoAlpha * 0.4);
          radar3dGfx.fillCircle(ex, ey, 5.0);
        }
      }

      // Накал нити катода в центре кинескопа
      const dotPulse = 0.5 + 0.5 * Math.sin(timeNow * 0.005);
      radar3dGfx.fillStyle(colors.radarBorder, 0.55 * dotPulse);
      radar3dGfx.fillCircle(cx, cy, 7 * dotPulse + 2);
      radar3dGfx.fillStyle(colors.blipCore, 0.95);
      radar3dGfx.fillCircle(cx, cy, 2.5);
    }

    // Сферический отблеск выпуклой стеклянной линзы кинескопа (только при виде в объёме)
    if (depth > 2) {
      radar3dGfx.lineStyle(2.0, 0xffffff, 0.18 * breathing * (depth / menuVisorDepth));
      radar3dGfx.beginPath();
      const lensSteps = 12;
      for (let i = 0; i <= lensSteps; i++) {
        const a = Math.PI * 1.10 + (Math.PI * 0.48 * i) / lensSteps;
        const lx = cx - 5 + Math.cos(a) * rx * 0.82;
        const ly = cy - 3 + Math.sin(a) * ry * 0.82;
        if (i === 0) radar3dGfx.moveTo(lx, ly);
        else radar3dGfx.lineTo(lx, ly);
      }
      radar3dGfx.strokePath();
    }

    // ==========================================
    // E. ОТОБРАЖЕНИЕ ВСПЫШКИ ПУСКА (IGNITION FLASH)
    // ==========================================
    if (currentIgnitionProgress > 0) {
      const ign = currentIgnitionProgress;
      const lineLen = rx * Math.min(1.0, ign * 1.8);
      const lineH = Math.max(3, ry * ign * 0.95);

      // Зелёный ореол вокруг катодной линии
      ignitionFlashGfx.fillStyle(0x4ade80, 0.65 * ign);
      ignitionFlashGfx.fillEllipse(cx, cy, lineLen * 2, lineH * 2);

      // Яркий белый сердечник вспышки
      ignitionFlashGfx.fillStyle(0xffffff, Math.min(1.0, ign * 1.3));
      ignitionFlashGfx.fillRect(cx - lineLen * 0.9, cy - 2.5, lineLen * 1.8, 5);

      // Полное сияние фосфорного диска на пике
      ignitionFlashGfx.fillStyle(colors.radarBorder, 0.45 * ign);
      ignitionFlashGfx.fillEllipse(cx, cy, rx * 2, ry * 2);
    }
  };

  renderVolumetricRadar(0, 0);

  // 3. ПЕРЕДНИЙ ПЛАН: ГЛАВНОЕ МЕНЮ (РАЗБЕГАЕТСЯ ПРИ СТАРТЕ)
  // А. Контейнер заголовка (шильдик с названием игры)
  const titleContainer = scene.add.container(menuCenterX, 76);
  container.add(titleContainer);

  const titleBoxW = 510;
  const titleBoxH = 74;

  const titlePlaque = scene.add.graphics();
  titlePlaque.fillStyle(0x0b1320, 0.88);
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
  const startBtnY = menuCenterY - 102; // 178: центрирует группу кнопок ровно по menuCenterY (280)
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
      btnGfx.fillStyle(baseColor, isHovered ? 0.92 : 0.86);
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

    // Растворение настольной лампы, кабелей и трафарета при зуме к экрану
    scene.tweens.add({
      targets: [ambientRoomGfx, stencilText],
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
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
        // Тумба сохраняет осязаемость на протяжении всего наезда и растворяется только в самом финале
        currentPedestalAlpha = Math.max(0, 1.0 - Math.pow(p, 2.2));

        // Фаза зажигания катода и звука размагничивания ЭЛТ (на 72% пути)
        if (p >= 0.72) {
          if (!hasTriggeredDegauss) {
            hasTriggeredDegauss = true;
            callbacks.playDegauss?.();
          }
          // Вспышка нарастает к 1.0 ровно в момент финала пути
          currentIgnitionProgress = (p - 0.72) / 0.28;
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

        // Создаём отдельный оверлей растворения вспышки поверх боевого радара (плавное 420мс затухание)
        const dissolveFlash = scene.add.graphics();
        dissolveFlash.setDepth(35);
        dissolveFlash.fillStyle(0x4ade80, 0.55);
        dissolveFlash.fillCircle(combatRadarX, combatRadarY, combatRadarRadius);
        dissolveFlash.fillStyle(0xffffff, 0.92);
        dissolveFlash.fillRect(
          combatRadarX - combatRadarRadius * 0.9,
          combatRadarY - 2.5,
          combatRadarRadius * 1.8,
          5,
        );

        scene.tweens.add({
          targets: dissolveFlash,
          alpha: 0,
          duration: 420,
          ease: 'Cubic.easeOut',
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

    ambientRoomGfx.setAlpha(1);
    stencilText.setAlpha(1);

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
