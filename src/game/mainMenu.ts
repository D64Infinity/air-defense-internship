import Phaser from 'phaser';
import { GAME_CONFIG } from './gameConfig';

/**
 * Конфигурация стартовых 0–3 секунд главного меню (живой дежурный радар и отклик приборов)
 */
const MENU_STANDBY_CONFIG = {
  sectorTagText: 'СЕКТОР «РУБЕЖ»',
  stencilDefaultText:
    'ПОСТ ВКО-44 // АППАРАТНАЯ СТОЙКА 1РЛ-134 // СТАНЦИЯ ОБНАРУЖЕНИЯ «ОБЗОР» // ГОСТ 14254-80',
  stencilEasterText:
    'ПОСТ ВКО-44 // СПЕЦКАНАЛ 1РЛ-134 // ПЕРЕХВАТ: БОРТ «ОМЕГА-77» // ЧАСТОТА 134.7 МГц',
  contactMinRFrac: 0.2, // минимальная дистанция подхода метки к центру (доля радиуса)
  contactMaxRFrac: 0.9, // внешняя граница появления метки на краю экрана
  contactAlertThreshold: 0.5, // порог дистанции, ближе которого контакт подсвечивается тревогой
  contactFadeSpeed: 0.48, // скорость затухания люминофора дежурной метки (1/сек)
  sweepTriggerSpan: 0.16, // угловой сектор мгновенной засветки при проходе луча (рад)
  needleHoverBoostRad: 0.11, // скачок стрелки вольтметра при наведении на тумблер меню
  needleSwitchKickRad: 0.22, // импульс стрелки вольтметра при щелчке тумблера/лимба
  needleEasterSpikeRad: 0.44, // зашкал стрелки при обнаружении секретного сигнала
  needleBoostDecaySpeed: 4.5, // скорость возврата стрелки вольтметра (1/сек)

  // Интерактивные органы управления тумбой и ЭЛТ
  gainLevels: [0.65, 0.82, 1.0, 1.24, 1.48] as readonly number[],
  defaultGainIndex: 2,
  gainMaxIndex: 4,
  gainDialStepRad: 0.56, // шаг поворота риски лимба относительно вертикали
  pingDurationSec: 0.95, // время затухания калибровочного эхо-круга по клику на экран
  pingHitRadiusPx: 26, // радиус подсветки дрейфующего контакта от клика по ЭЛТ
  easterPingThreshold: 5, // количество простуков по стеклу для активации пасхалки
  easterOmegaOrbitRFrac: 0.72, // радиус орбиты секретного борта «ОМЕГА-77»
  easterOmegaAngularSpeed: 0.48, // угловая скорость секретного борта (рад/сек)
  crtNoiseMaxSpecks: 5, // лёгкие микро-помехи ЭЛТ в дежурном режиме

  // Главная кнопка пуска [1] и эффекты наведения / нажатия
  startSheenDurationMs: 320, // время пробега светового блика по стеклу при наведении
  startSheenWidth: 54, // ширина световой полосы блика (px)
  startSheenSlant: 22, // наклон блика (px)
  startBracketExpandPx: 4, // раздвижение угловых скобок наружу при наведении (px)
  startPressHoldMs: 105, // короткая фиксация вспышки перед разлётом меню (мс)
  startWaveDurationMs: 280, // время расхождения импульсной волны пуска (мс)
  startZoomOutScale: 1.07, // масштаб приближения кнопки старта навстречу камере
} as const;

type PhosphorMode = 'emerald' | 'amber';

interface StandbyContact {
  angle: number;
  rFrac: number;
  radialSpeed: number;
  angularSpeed: number;
  alpha: number;
  echoRingProgress: number;
  isAlert: boolean;
}

interface StandbyPing {
  nx: number; // нормализованное смещение от центра (-1..1 по X)
  ny: number; // нормализованное смещение от центра (-1..1 по Y)
  progress: number; // 0..1
}

interface StandbyNoiseSpeck {
  nx: number;
  ny: number;
  width: number;
  life: number;
  maxLife: number;
}

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
  hide: (onComplete?: () => void, immediate?: boolean) => void;
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

  // Единый базовый стиль текста меню (чёткий рендер и запас под жирные глифы)
  const menuTextStyle = {
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    padding: { left: 3, right: 3, top: 2, bottom: 2 },
    resolution: GAME_CONFIG.textResolution,
  };

  const formatHighScoreLabel = (best: number): string =>
    best > 0 ? `ЛУЧШИЙ РЕКОРД СТАНЦИИ: ${best} ОЧК` : 'АРХИВ ПУСТ • НЕТ ДАННЫХ ДЕЖУРСТВ';

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

  // Гофрированный толстый кабель питания, выходящий из гермоввода на левом боку тумбы
  const cablePoints = [
    { x: 149, y: 462 },
    { x: 112, y: 494 },
    { x: 70, y: 528 },
    { x: 30, y: 560 },
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

  // Хомут крепления кабеля на видимом участке стола
  ambientRoomGfx.fillStyle(0x334155, 0.9);
  ambientRoomGfx.fillRect(81, 511, 6, 14);
  ambientRoomGfx.lineStyle(1, 0x0f172a, 0.9);
  ambientRoomGfx.strokeRect(81, 511, 6, 14);

  // Трафаретная маркировка стойки (выровнена по оси нижних заклёпок с отступом от левой)
  const stencilText = scene.add.text(
    38,
    height - 24,
    MENU_STANDBY_CONFIG.stencilDefaultText,
    {
      ...menuTextStyle,
      fontSize: '10px',
      color: '#334155',
      fontStyle: 'bold',
      letterSpacing: 1.5,
    },
  ).setOrigin(0, 0.5);

  container.add([solidBgGfx, ambientRoomGfx, stencilText]);

  // 2. СЛОЙ 2.5D ОБЪЁМНОГО РАДАРА
  const radar3dGfx = scene.add.graphics();
  container.add(radar3dGfx);

  // Отдельный слой гравировки шасси тумбы (растворяется вместе с тумбой при старте)
  const chassisLabelsContainer = scene.add.container(0, 0);
  container.add(chassisLabelsContainer);

  // Отдельный верхний слой для вспышки зажигания катода (перекрывает момент передачи управления)
  const ignitionFlashGfx = scene.add.graphics();
  container.add(ignitionFlashGfx);

  // Стартовые параметры 2.5D геометрии (экран шире кнопок по бокам и сверху, чтобы его было видно и удобно кликать)
  const menuRadarX = menuCenterX;
  const menuRadarY = menuCenterY;
  const menuRx = 248;
  const menuRy = 142;
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
  let needleHoverOffset = 0;

  // Интерактивное состояние тумбы и пасхалки
  let phosphorMode: PhosphorMode = 'emerald';
  let gainIndex: number = MENU_STANDBY_CONFIG.defaultGainIndex;
  let screenPingCount = 0;
  let isEasterEggActive = false;
  let easterOmegaAngle = 1.25;
  let activePings: StandbyPing[] = [];
  let crtSpecks: StandbyNoiseSpeck[] = [];

  // Координаты элементов управления на шасси (единая сетка без перекрытий)
  const gaugePos = { x: menuRadarX - menuRx * 0.76, y: menuRadarY + menuRy * 1.13, r: 21 };
  const dialPos = { x: menuRadarX + menuRx * 0.76, y: menuRadarY + menuRy * 1.13, r: 20 };
  const modeSwitchPos = { x: menuRadarX - 52, y: menuRadarY + menuRy * 1.33 };
  const soundSwitchPos = { x: menuRadarX + 52, y: menuRadarY + menuRy * 1.33 };

  const chassisLabelStyle = {
    ...menuTextStyle,
    fontSize: '8.5px',
    color: '#475569',
    fontStyle: 'bold',
    letterSpacing: 0.8,
  };

  const gaugeChassisLabel = scene.add.text(
    gaugePos.x,
    gaugePos.y + 33,
    '6.3V НАКАЛ',
    chassisLabelStyle,
  ).setOrigin(0.5);
  const dialChassisLabel = scene.add.text(
    dialPos.x,
    dialPos.y + 33,
    'УСИЛ. ПРД',
    chassisLabelStyle,
  ).setOrigin(0.5);
  const modeSwitchLabel = scene.add.text(
    modeSwitchPos.x,
    modeSwitchPos.y + 16,
    'РЕЖИМ',
    chassisLabelStyle,
  ).setOrigin(0.5);
  const soundSwitchLabel = scene.add.text(
    soundSwitchPos.x,
    soundSwitchPos.y + 16,
    'ЗВУК',
    chassisLabelStyle,
  ).setOrigin(0.5);
  const centerPlaqueLabel = scene.add.text(
    menuRadarX,
    modeSwitchPos.y,
    '1РЛ-134',
    {
      ...menuTextStyle,
      fontSize: '8.5px',
      color: '#64748b',
      fontStyle: 'bold',
      letterSpacing: 1,
    },
  ).setOrigin(0.5);

  chassisLabelsContainer.add([
    gaugeChassisLabel,
    dialChassisLabel,
    modeSwitchLabel,
    soundSwitchLabel,
    centerPlaqueLabel,
  ]);

  const createInitialContacts = (): StandbyContact[] => [
    { angle: 0.85, rFrac: 0.62, radialSpeed: 0.022, angularSpeed: 0.035, alpha: 0.85, echoRingProgress: 1, isAlert: true },
    { angle: 2.45, rFrac: 0.44, radialSpeed: 0.015, angularSpeed: -0.02, alpha: 0.5, echoRingProgress: 1, isAlert: false },
    { angle: 4.15, rFrac: 0.80, radialSpeed: 0.019, angularSpeed: 0.025, alpha: 0.35, echoRingProgress: 1, isAlert: false },
  ];
  let standbyContacts: StandbyContact[] = createInitialContacts();

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
    const gain = MENU_STANDBY_CONFIG.gainLevels[gainIndex] ?? 1.0;
    const isAmberMode = phosphorMode === 'amber' && currentIgnitionProgress < 0.25;

    chassisLabelsContainer.setAlpha(pedestalA);
    chassisLabelsContainer.setVisible(pedestalA > 0.02);

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
      radar3dGfx.fillStyle(0x040d10, 0.98 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx - rx * 1.25, cy - ry * 0.35);
      radar3dGfx.lineTo(cx + rx * 1.25, cy - ry * 0.35);
      radar3dGfx.lineTo(cx + rx * 1.35, cy + ry * 1.58);
      radar3dGfx.lineTo(cx - rx * 1.35, cy + ry * 1.58);
      radar3dGfx.closePath();
      radar3dGfx.fillPath();

      // Гермоввод (сальник) кабеля на левом торце шасси
      const glandX = cx - rx * 1.32;
      const glandY = cy + ry * 1.28;
      radar3dGfx.fillStyle(0x1e293b, 0.96 * pedestalA);
      radar3dGfx.fillRoundedRect(glandX - 5, glandY - 7, 10, 14, 3);
      radar3dGfx.lineStyle(1.2, 0x475569, 0.85 * pedestalA);
      radar3dGfx.strokeRoundedRect(glandX - 5, glandY - 7, 10, 14, 3);

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

      // Вентиляционные жалюзи магнетрона (чисто между 4-й кнопкой и блоком тумблеров)
      for (let i = 0; i < 3; i++) {
        const slotY = cy + ry * 1.02 + i * 7;
        radar3dGfx.fillStyle(0x010507, 0.95 * pedestalA);
        radar3dGfx.fillRoundedRect(cx - 72, slotY, 144, 3.8, 1.8);
        radar3dGfx.lineStyle(1.0, 0x1f473e, 0.7 * pedestalA);
        radar3dGfx.lineBetween(cx - 72, slotY + 3.8, cx + 72, slotY + 3.8);
      }

      // Компактная заводская табличка по центру между тумблерами
      const plaqueW = 68;
      const plaqueH = 16;
      const plaqueY = cy + ry * 1.33 - plaqueH / 2;
      radar3dGfx.fillStyle(isEasterEggActive ? 0x271a07 : 0x0b1d1a, 0.96 * pedestalA);
      radar3dGfx.fillRect(cx - plaqueW / 2, plaqueY, plaqueW, plaqueH);
      radar3dGfx.lineStyle(1.2, isEasterEggActive ? 0xd97706 : 0x334d47, 0.9 * pedestalA);
      radar3dGfx.strokeRect(cx - plaqueW / 2, plaqueY, plaqueW, plaqueH);
      radar3dGfx.fillStyle(0x94a3b8, 0.85 * pedestalA);
      radar3dGfx.fillCircle(cx - plaqueW / 2 + 4, plaqueY + plaqueH / 2, 1.4);
      radar3dGfx.fillCircle(cx + plaqueW / 2 - 4, plaqueY + plaqueH / 2, 1.4);

      // 4 массивных крепёжных болта по углам плиты с глубокими шлицами
      const bolts = [
        { x: cx - rx * 1.22, y: cy + ry * 1.48 },
        { x: cx + rx * 1.22, y: cy + ry * 1.48 },
        { x: cx - rx * 1.15, y: cy - ry * 0.20 },
        { x: cx + rx * 1.15, y: cy - ry * 0.20 },
      ];
      for (const b of bolts) {
        radar3dGfx.fillStyle(0x020709, 0.8 * pedestalA);
        radar3dGfx.fillCircle(b.x + 1, b.y + 1, 5);
        radar3dGfx.fillStyle(0x334155, 0.95 * pedestalA);
        radar3dGfx.fillCircle(b.x, b.y, 4.5);
        radar3dGfx.lineStyle(1.2, 0x0f172a, 0.95 * pedestalA);
        radar3dGfx.strokeCircle(b.x, b.y, 4.5);
        radar3dGfx.lineBetween(b.x - 2.5, b.y, b.x + 2.5, b.y);
        radar3dGfx.lineBetween(b.x, b.y - 2.5, b.x, b.y + 2.5);
      }

      // 3. АНАЛОГОВЫЙ СТРЕЛОЧНЫЙ ВОЛЬТМЕТР 6.3V (Слева внизу на панели)
      const gaugeX = cx - rx * 0.76;
      const gaugeY = cy + ry * 1.13;
      const gaugeR = gaugePos.r;

      radar3dGfx.fillStyle(0x020608, 0.7 * pedestalA);
      radar3dGfx.fillCircle(gaugeX + 1.5, gaugeY + 2, gaugeR + 2);

      radar3dGfx.fillStyle(0x0c1a1e, 0.98 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR + 2.5);
      radar3dGfx.lineStyle(1.8, 0x334155, 0.9 * pedestalA);
      radar3dGfx.strokeCircle(gaugeX, gaugeY, gaugeR + 2.5);

      radar3dGfx.fillStyle(0x04130d, 0.98 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR);
      radar3dGfx.fillStyle(0xd97706, (0.12 + 0.04 * gain) * pedestalA * breathing);
      radar3dGfx.fillCircle(gaugeX, gaugeY, gaugeR - 2);

      radar3dGfx.lineStyle(1.2, 0x475569, 0.75 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX, gaugeY, gaugeR - 5, Math.PI * 0.82, Math.PI * 1.78, false);
      radar3dGfx.strokePath();

      // Зелёная рабочая зона и красный сектор перегрузки справа
      radar3dGfx.lineStyle(2.2, 0x22c55e, 0.85 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX, gaugeY, gaugeR - 5, Math.PI * 1.20, Math.PI * 1.52, false);
      radar3dGfx.strokePath();
      radar3dGfx.lineStyle(2.2, 0xef4444, 0.85 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX, gaugeY, gaugeR - 5, Math.PI * 1.60, Math.PI * 1.78, false);
      radar3dGfx.strokePath();

      for (let a = Math.PI * 0.85; a <= Math.PI * 1.75; a += Math.PI * 0.18) {
        radar3dGfx.lineStyle(1.0, 0x94a3b8, 0.7 * pedestalA);
        radar3dGfx.lineBetween(
          gaugeX + Math.cos(a) * (gaugeR - 7),
          gaugeY + Math.sin(a) * (gaugeR - 7),
          gaugeX + Math.cos(a) * (gaugeR - 4),
          gaugeY + Math.sin(a) * (gaugeR - 4),
        );
      }

      // Стрелка прибора (учитывает уровень усиления ПРД, режим пасхалки и отклики)
      const needleJitter = Math.sin(timeNow * 0.016) * 0.038;
      const gainLoadOffset = (gainIndex - MENU_STANDBY_CONFIG.defaultGainIndex) * 0.055;
      const easterOffset = isEasterEggActive ? 0.24 : 0;
      const needleAngle = Phaser.Math.Clamp(
        Math.PI * 1.36 + needleJitter + gainLoadOffset + easterOffset + needleHoverOffset,
        Math.PI * 0.88,
        Math.PI * 1.76,
      );
      radar3dGfx.lineStyle(1.6, isEasterEggActive ? 0xf87171 : 0xf59e0b, 0.98 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(gaugeX, gaugeY + 2);
      radar3dGfx.lineTo(
        gaugeX + Math.cos(needleAngle) * (gaugeR - 5),
        gaugeY + Math.sin(needleAngle) * (gaugeR - 5),
      );
      radar3dGfx.strokePath();

      radar3dGfx.fillStyle(0xf8fafc, 0.95 * pedestalA);
      radar3dGfx.fillCircle(gaugeX, gaugeY + 2, 2.8);

      radar3dGfx.lineStyle(1.5, 0xffffff, 0.28 * pedestalA);
      radar3dGfx.beginPath();
      radar3dGfx.arc(gaugeX - 3, gaugeY - 3, gaugeR - 6, Math.PI * 1.1, Math.PI * 1.6, false);
      radar3dGfx.strokePath();

      // 4. ЛИМБ РЕГУЛИРОВКИ УСИЛЕНИЯ ПРД (Справа внизу на панели, 5 положений)
      const dialX = cx + rx * 0.76;
      const dialY = cy + ry * 1.13;
      const dialR = dialPos.r;

      radar3dGfx.fillStyle(0x020608, 0.75 * pedestalA);
      radar3dGfx.fillCircle(dialX + 2, dialY + 2, dialR + 3);

      radar3dGfx.fillStyle(0x0c1a1e, 0.98 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR + 3);
      radar3dGfx.lineStyle(1.8, 0x334155, 0.85 * pedestalA);
      radar3dGfx.strokeCircle(dialX, dialY, dialR + 3);

      radar3dGfx.fillStyle(0x061413, 0.98 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR);

      // 5 позиционных засечек усиления вокруг лимба
      for (let lvl = 0; lvl < MENU_STANDBY_CONFIG.gainLevels.length; lvl++) {
        const notchA = -Math.PI / 2 + (lvl - 2) * MENU_STANDBY_CONFIG.gainDialStepRad;
        const isCurrent = lvl === gainIndex;
        const dotColor = isCurrent ? (isAmberMode ? 0xfbbf24 : 0x4ade80) : 0x64748b;
        radar3dGfx.fillStyle(dotColor, (isCurrent ? 0.95 : 0.65) * pedestalA);
        radar3dGfx.fillCircle(
          dialX + Math.cos(notchA) * (dialR + 5.5),
          dialY + Math.sin(notchA) * (dialR + 5.5),
          isCurrent ? 2.0 : 1.3,
        );
      }

      // Рифление ручки лимба и фаска
      radar3dGfx.lineStyle(1.1, 0x334155, 0.65 * pedestalA);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        radar3dGfx.lineBetween(
          dialX + Math.cos(a) * (dialR - 4),
          dialY + Math.sin(a) * (dialR - 4),
          dialX + Math.cos(a) * dialR,
          dialY + Math.sin(a) * dialR,
        );
      }
      radar3dGfx.fillStyle(0x0b1f1c, 0.98 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, dialR - 5);
      radar3dGfx.lineStyle(1.2, 0x475569, 0.6 * pedestalA);
      radar3dGfx.strokeCircle(dialX, dialY, dialR - 5);

      const dialAngle = -Math.PI / 2 + (gainIndex - 2) * MENU_STANDBY_CONFIG.gainDialStepRad;
      const pointerColor = isAmberMode ? 0xfbbf24 : 0x86efac;
      radar3dGfx.lineStyle(2.2, pointerColor, 0.95 * pedestalA);
      radar3dGfx.lineBetween(
        dialX + Math.cos(dialAngle) * 3,
        dialY + Math.sin(dialAngle) * 3,
        dialX + Math.cos(dialAngle) * (dialR - 3),
        dialY + Math.sin(dialAngle) * (dialR - 3),
      );
      radar3dGfx.fillStyle(0xe2e8f0, 0.9 * pedestalA);
      radar3dGfx.fillCircle(dialX, dialY, 2.5);

      // 5. ДВА ИНТЕРАКТИВНЫХ ТУМБЛЕРА П2Т (Левый: РЕЖИМ ЭЛТ, Правый: ЗВУК)
      const isSoundOn = !callbacks.isMuted();
      const switches = [
        {
          x: cx - 52,
          y: cy + ry * 1.33,
          ledColor: phosphorMode === 'amber' ? 0xf59e0b : 0x22c55e,
          isUp: phosphorMode === 'emerald',
          isLit: true,
        },
        {
          x: cx + 52,
          y: cy + ry * 1.33,
          ledColor: 0xf59e0b,
          isUp: isSoundOn,
          isLit: isSoundOn,
        },
      ];
      for (const sw of switches) {
        // Литая металлическая база тумблера на чистой панели ниже жалюзи
        radar3dGfx.fillStyle(0x0c1626, 0.95 * pedestalA);
        radar3dGfx.fillRect(sw.x - 13, sw.y - 8, 26, 16);
        radar3dGfx.lineStyle(1.3, 0x334155, 0.85 * pedestalA);
        radar3dGfx.strokeRect(sw.x - 13, sw.y - 8, 26, 16);

        // Шестигранная гайка в основании рычажка
        radar3dGfx.fillStyle(0x1e293b, 0.9 * pedestalA);
        radar3dGfx.fillCircle(sw.x, sw.y, 4.8);

        // Светодиодный индикатор с отражённым бликом на панели
        if (sw.isLit) {
          radar3dGfx.fillStyle(sw.ledColor, 0.16 * pedestalA * breathing);
          radar3dGfx.fillCircle(sw.x, sw.y - 14, 9);
          radar3dGfx.fillStyle(sw.ledColor, 0.42 * pedestalA * breathing);
          radar3dGfx.fillCircle(sw.x, sw.y - 14, 5.2);
          radar3dGfx.fillStyle(sw.ledColor, 0.95 * pedestalA);
          radar3dGfx.fillCircle(sw.x, sw.y - 14, 2.5);
          radar3dGfx.fillStyle(0xffffff, 0.85 * pedestalA);
          radar3dGfx.fillCircle(sw.x, sw.y - 14, 1.0);
        } else {
          radar3dGfx.fillStyle(0x1e293b, 0.95 * pedestalA);
          radar3dGfx.fillCircle(sw.x, sw.y - 14, 2.5);
          radar3dGfx.lineStyle(1.0, 0x334155, 0.8 * pedestalA);
          radar3dGfx.strokeCircle(sw.x, sw.y - 14, 2.5);
        }

        // Хромированный рычажок тумблера (вверх или вниз по состоянию)
        const leverEndY = sw.isUp ? sw.y - 7 : sw.y + 7;
        radar3dGfx.lineStyle(3.0, 0x64748b, 0.95 * pedestalA);
        radar3dGfx.lineBetween(sw.x, sw.y, sw.x, leverEndY);
        radar3dGfx.lineStyle(1.4, 0xf1f5f9, 0.95 * pedestalA);
        radar3dGfx.lineBetween(sw.x - 0.5, sw.y, sw.x - 0.5, leverEndY);
        radar3dGfx.fillStyle(0xf8fafc, 0.95 * pedestalA);
        radar3dGfx.fillCircle(sw.x, leverEndY, 2.6);
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
    const baseColors = GAME_CONFIG.colors;
    const screenColors = isAmberMode
      ? {
          radarBg: 0x100a03,
          glowTint: 0x2b1804,
          radarBorder: 0xf59e0b,
          hudBorder: 0xb45309,
          gridRing: 0xd97706,
          gridAxis: 0x92400e,
          dangerRing: 0xef4444,
          beam: 0xfbbf24,
          trail: 0xd97706,
          blipHalo: 0xf59e0b,
          blipCore: 0xfef3c7,
        }
      : {
          radarBg: baseColors.radarBg,
          glowTint: 0x062816,
          radarBorder: baseColors.radarBorder,
          hudBorder: baseColors.hudBorder,
          gridRing: baseColors.gridRing,
          gridAxis: baseColors.gridAxis,
          dangerRing: baseColors.dangerRing,
          beam: baseColors.beam,
          trail: baseColors.trail,
          blipHalo: baseColors.blipHalo,
          blipCore: baseColors.blipCore,
        };

    // 1. Постоянное мягкое рассеивание люминофора наружу (Ambient Glass Halo)
    const haloSteps = [
      { d: 40, alpha: 0.008 },
      { d: 26, alpha: 0.02 },
      { d: 15, alpha: 0.04 },
      { d: 6, alpha: 0.07 },
    ];
    for (const h of haloSteps) {
      const hRx = rx + h.d * (rx / combatRadarRadius);
      const hRy = ry + h.d * (ry / combatRadarRadius);
      radar3dGfx.lineStyle(6, screenColors.blipHalo, Math.min(0.14, h.alpha * gain));
      radar3dGfx.strokeEllipse(cx, cy, hRx * 2, hRy * 2);
    }

    // 2. Заглублённая круглая ниша под колбу
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

    // 3. Тонкий металлический прижимной обод вокруг стекла
    const rimRx = rx + 2 * (rx / combatRadarRadius);
    const rimRy = ry + 2 * (ry / combatRadarRadius);
    radar3dGfx.lineStyle(1.5, screenColors.hudBorder, 0.85);
    radar3dGfx.strokeEllipse(cx, cy, rimRx * 2, rimRy * 2);

    // 4. Холодный матовый люминофор ЭЛТ
    radar3dGfx.fillStyle(screenColors.radarBg, 0.95);
    radar3dGfx.fillEllipse(cx, cy, rx * 2, ry * 2);

    // Внутреннее мягкое фосфорное сияние колбы (усиливается ручкой УСИЛ. ПРД)
    radar3dGfx.fillStyle(screenColors.glowTint, Math.min(0.55, 0.35 * breathing * gain));
    radar3dGfx.fillEllipse(cx, cy, rx * 0.88 * 2, ry * 0.88 * 2);

    // 5. Концентрические кольца дальности (25%, 50%, 75%, 100%)
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ringSteps.forEach((fraction, index) => {
      const isOuter = index === ringSteps.length - 1;
      radar3dGfx.lineStyle(
        isOuter ? 2 : 1,
        isOuter ? screenColors.radarBorder : screenColors.gridRing,
        isOuter ? 0.90 : Math.min(0.45, 0.22 * breathing * gain),
      );
      radar3dGfx.strokeEllipse(cx, cy, rx * fraction * 2, ry * fraction * 2);
    });

    // 6. Зона ближней опасности (Danger Close Ring)
    const dangerFrac = GAME_CONFIG.dangerCloseRadius / combatRadarRadius;
    radar3dGfx.lineStyle(1, screenColors.dangerRing, 0.32 * breathing);
    radar3dGfx.strokeEllipse(cx, cy, rx * dangerFrac * 2, ry * dangerFrac * 2);

    // 7. Перспективные визирные оси
    radar3dGfx.lineStyle(1, screenColors.gridAxis, 0.24 * breathing);
    radar3dGfx.beginPath();
    radar3dGfx.moveTo(cx - rx, cy);
    radar3dGfx.lineTo(cx + rx, cy);
    radar3dGfx.moveTo(cx, cy - ry);
    radar3dGfx.lineTo(cx, cy + ry);
    radar3dGfx.strokePath();

    // 8. Азимутальные риски по периметру (крупные на 90°, мелкие на 30°)
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = Phaser.Math.DegToRad(deg);
      const isMajor = deg % 90 === 0;
      const tickLenFrac = (isMajor ? 10 : 5) / combatRadarRadius;

      const x1 = cx + Math.cos(rad) * rx * (1 - tickLenFrac);
      const y1 = cy + Math.sin(rad) * ry * (1 - tickLenFrac);
      const x2 = cx + Math.cos(rad) * rx;
      const y2 = cy + Math.sin(rad) * ry;

      radar3dGfx.lineStyle(1, screenColors.gridRing, (isMajor ? 0.70 : 0.30) * breathing);
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(x1, y1);
      radar3dGfx.lineTo(x2, y2);
      radar3dGfx.strokePath();
    }

    // ==========================================
    // D. ЖИВОЙ ДЕЖУРНЫЙ ЛУЧ РАЗВЁРТКИ ЭЛТ, МИКРО-ШУМ И ФОСФОРНЫЕ ЭХО
    // ==========================================
    if (currentIgnitionProgress <= 0.05) {
      const beamAngle = sweepAngle;
      const trailSpan = 0.45 + 0.14 * (gain - 1.0);
      const trailSteps = 12;

      // Мягкий широкий сектор послесвечения люминофора по дуге эллипса
      radar3dGfx.fillStyle(screenColors.trail, Math.min(0.32, 0.18 * breathing * gain));
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

      // Сам луч развёртки
      const beamX = cx + Math.cos(beamAngle) * rx;
      const beamY = cy + Math.sin(beamAngle) * ry;
      radar3dGfx.lineStyle(2, screenColors.beam, Math.min(1, 0.90 * breathing * gain));
      radar3dGfx.beginPath();
      radar3dGfx.moveTo(cx, cy);
      radar3dGfx.lineTo(beamX, beamY);
      radar3dGfx.strokePath();

      // Деликатные микро-помехи эфира (интенсивность зависит от усиления ПРД)
      for (const speck of crtSpecks) {
        const lifeFrac = speck.life / speck.maxLife;
        const sx = cx + speck.nx * rx;
        const sy = cy + speck.ny * ry;
        radar3dGfx.fillStyle(screenColors.blipCore, 0.24 * lifeFrac * gain);
        radar3dGfx.fillRect(sx - speck.width / 2, sy, speck.width, 1.4);
      }

      // Калибровочные эхо-волны от кликов по экрану ЭЛТ
      for (const ping of activePings) {
        const fade = 1 - ping.progress;
        const px = cx + ping.nx * rx;
        const py = cy + ping.ny * ry;
        const maxPingR = 46 * (rx / menuRx);
        const pingR = 6 + ping.progress * maxPingR;
        radar3dGfx.lineStyle(1.6, screenColors.beam, 0.65 * fade);
        radar3dGfx.strokeEllipse(px, py, pingR * 2, pingR * 2 * (ry / rx));
      }

      // Живые дрейфующие фосфорные эхо-контакты и расходящееся эхо-кольцо
      for (const contact of standbyContacts) {
        const ex = cx + Math.cos(contact.angle) * rx * contact.rFrac;
        const ey = cy + Math.sin(contact.angle) * ry * contact.rFrac;
        const isDanger = contact.isAlert && contact.rFrac <= MENU_STANDBY_CONFIG.contactAlertThreshold;
        const haloColor = isDanger ? screenColors.dangerRing : screenColors.blipHalo;
        const coreColor = isDanger ? 0xfca5a5 : screenColors.blipCore;

        if (contact.echoRingProgress < 1) {
          const ringFade = 1 - contact.echoRingProgress;
          const ringR = 4 + contact.echoRingProgress * 15 * gain;
          radar3dGfx.lineStyle(1.2, haloColor, 0.55 * ringFade);
          radar3dGfx.strokeEllipse(ex, ey, ringR * 2, ringR * 2 * (ry / rx));
        }

        if (contact.alpha <= 0.03) continue;
        const echoAlpha = Math.min(1, contact.alpha * breathing * gain);
        radar3dGfx.fillStyle(haloColor, echoAlpha * (isDanger ? 0.55 : 0.4));
        radar3dGfx.fillCircle(ex, ey, (isDanger ? 6.5 : 5.0) * Math.min(1.25, gain));
        radar3dGfx.fillStyle(coreColor, echoAlpha);
        radar3dGfx.fillCircle(ex, ey, 2.3);
      }

      // ПАСХАЛКА: секретный призрачный борт «ОМЕГА-77» на орбите
      if (isEasterEggActive) {
        const ox = cx + Math.cos(easterOmegaAngle) * rx * MENU_STANDBY_CONFIG.easterOmegaOrbitRFrac;
        const oy = cy + Math.sin(easterOmegaAngle) * ry * MENU_STANDBY_CONFIG.easterOmegaOrbitRFrac;
        const omegaPulse = 0.55 + 0.45 * Math.sin(timeNow * 0.009);

        radar3dGfx.lineStyle(1.4, 0xfbbf24, 0.7 * omegaPulse);
        radar3dGfx.strokeEllipse(ox, oy, 22, 22 * (ry / rx));
        radar3dGfx.lineStyle(1.0, 0xfef3c7, 0.55 * (1 - omegaPulse * 0.5));
        radar3dGfx.strokeEllipse(ox, oy, 32, 32 * (ry / rx));
        radar3dGfx.fillStyle(0xf59e0b, 0.5 * omegaPulse);
        radar3dGfx.fillCircle(ox, oy, 6);
        radar3dGfx.fillStyle(0xffffff, 0.95);
        radar3dGfx.fillCircle(ox, oy, 2.6);
      }

      // Накал нити катода в центре кинескопа
      const dotPulse = 0.5 + 0.5 * Math.sin(timeNow * 0.005);
      radar3dGfx.fillStyle(screenColors.radarBorder, 0.55 * dotPulse);
      radar3dGfx.fillCircle(cx, cy, 7 * dotPulse + 2);
      radar3dGfx.fillStyle(screenColors.blipCore, 0.95);
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
      ignitionFlashGfx.fillStyle(baseColors.radarBorder, 0.45 * ign);
      ignitionFlashGfx.fillEllipse(cx, cy, rx * 2, ry * 2);
    }
  };

  renderVolumetricRadar(0, 0);

  // Активация скрытой пасхалки станции «ОМЕГА-77» и хелперы интерактива тумбы
  const activateEasterEgg = () => {
    if (isEasterEggActive) return;
    isEasterEggActive = true;
    needleHoverOffset = MENU_STANDBY_CONFIG.needleEasterSpikeRad;
    stencilText.setText(MENU_STANDBY_CONFIG.stencilEasterText);
    stencilText.setColor('#f59e0b');
    centerPlaqueLabel.setText('ОМЕГА-77');
    centerPlaqueLabel.setColor('#fbbf24');
    callbacks.playSelectSound?.();
  };

  const checkEasterEggTrigger = () => {
    if (
      (phosphorMode === 'amber' && gainIndex === MENU_STANDBY_CONFIG.gainMaxIndex) ||
      screenPingCount >= MENU_STANDBY_CONFIG.easterPingThreshold
    ) {
      activateEasterEgg();
    }
  };

  // Интерактивное стекло ЭЛТ (размещается ПОД кнопками меню, срабатывает по открытому стеклу)
  const radarScreenHitZone = scene.add.rectangle(
    menuRadarX,
    menuRadarY,
    menuRx * 2,
    menuRy * 2,
    0x000000,
    0,
  );
  radarScreenHitZone.setInteractive();
  container.add(radarScreenHitZone);

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

  const sectorTag = scene.add.text(0, -21, MENU_STANDBY_CONFIG.sectorTagText, {
    ...menuTextStyle,
    fontSize: '11px',
    color: '#f59e0b',
    fontStyle: 'bold',
    letterSpacing: 2,
  }).setOrigin(0.5);

  const mainTitleText = scene.add.text(0, 0, 'РАДИОЛОКАЦИОННЫЙ ПОСТ «ОБЗОР»', {
    ...menuTextStyle,
    fontSize: '18px',
    color: '#f8fafc',
    fontStyle: 'bold',
    letterSpacing: 2.5,
  }).setOrigin(0.5);

  const titleSubText = scene.add.text(0, 21, 'ТЕРМИНАЛ БОЕВОГО УПРАВЛЕНИЯ ПВО • РЕЖИМ ОЖИДАНИЯ', {
    ...menuTextStyle,
    fontSize: '10px',
    color: '#64748b',
    fontStyle: 'bold',
    letterSpacing: 1,
  }).setOrigin(0.5);

  titleContainer.add([titlePlaque, sectorTag, mainTitleText, titleSubText]);

  // Б. Контейнеры клавиш управления (Вариант А)
  interface IndicatorButton {
    hotkey: string;
    label: string;
    sublabel: string;
    colorHex: number;
    colorText: string;
    readonly?: boolean;
    action: () => void;
  }

  const formatMenuLabel = (hotkey: string, title: string): string =>
    GAME_CONFIG.isMobile ? title : `[ ${hotkey} ] ${title}`;

  const buttonsData: IndicatorButton[] = [
    {
      hotkey: '1',
      label: formatMenuLabel('1', 'ЗАСТУПИТЬ НА ДЕЖУРСТВО'),
      sublabel: 'ПУСК КОМПЛЕКСА РЛС • СТАРТ БОЕВОЙ СМЕНЫ',
      colorHex: 0x22c55e,
      colorText: '#4ade80',
      action: () => triggerStart(),
    },
    {
      hotkey: '2',
      label: formatMenuLabel('2', 'БОЕВОЙ РЕГЛАМЕНТ'),
      sublabel: 'ИНСТРУКЦИЯ ОПЕРАТОРА • ТАКТИЧЕСКИЕ ПРАВИЛА',
      colorHex: 0xf59e0b,
      colorText: '#fbbf24',
      action: () => callbacks.onOpenBriefing(),
    },
    {
      hotkey: '3',
      label: 'АРХИВ ДЕЖУРСТВ',
      sublabel: formatHighScoreLabel(callbacks.getHighScore()),
      colorHex: 0x0ea5e9,
      colorText: '#38bdf8',
      readonly: true,
      action: () => {},
    },
    {
      hotkey: '4',
      label: formatMenuLabel('4', 'ЗВУКОВОЙ ТРАКТ: [ВКЛ]'),
      sublabel: 'ТУМБЛЕР АКУСТИЧЕСКОГО КОНТРОЛЯ СВЯЗИ',
      colorHex: 0xa855f7,
      colorText: '#c084fc',
      action: () => {
        const isMuted = callbacks.onToggleSound();
        updateSoundButtonLabel(!isMuted);
      },
    },
  ];

  const btnW = 420;
  const btnH = 58;
  const startBtnY = menuCenterY - 102; // 178: центрирует группу кнопок ровно по menuCenterY (280)
  const btnGap = 68;

  const btnContainers: Phaser.GameObjects.Container[] = [];
  let soundBtnLabelRef: Phaser.GameObjects.Text | null = null;
  let recordSubLabelRef: Phaser.GameObjects.Text | null = null;
  let primaryBtnRedraw: ((isHovered: boolean, isPressed: boolean, isIgnited?: boolean) => void) | null = null;
  let primaryBtnLabelRef: Phaser.GameObjects.Text | null = null;
  let primaryLedGlowGfx: Phaser.GameObjects.Graphics | null = null;
  let primarySheenGfx: Phaser.GameObjects.Graphics | null = null;
  let primarySheenTween: Phaser.Tweens.Tween | null = null;

  const launchWaveGfx = scene.add.graphics();
  container.add(launchWaveGfx);

  /**
   * Отрисовка 4 тактических угловых скобок вокруг прямоугольной кнопки
   */
  const drawCornerBrackets = (
    gfx: Phaser.GameObjects.Graphics,
    halfW: number,
    halfH: number,
    yOffset: number,
    cornerLen: number,
    color: number,
    alpha: number,
  ) => {
    gfx.lineStyle(1.8, color, alpha);
    gfx.beginPath();
    // Левый верхний
    gfx.moveTo(-halfW, -halfH + yOffset + cornerLen);
    gfx.lineTo(-halfW, -halfH + yOffset);
    gfx.lineTo(-halfW + cornerLen, -halfH + yOffset);
    // Правый верхний
    gfx.moveTo(halfW - cornerLen, -halfH + yOffset);
    gfx.lineTo(halfW, -halfH + yOffset);
    gfx.lineTo(halfW, -halfH + yOffset + cornerLen);
    // Левый нижний
    gfx.moveTo(-halfW, halfH + yOffset - cornerLen);
    gfx.lineTo(-halfW, halfH + yOffset);
    gfx.lineTo(-halfW + cornerLen, halfH + yOffset);
    // Правый нижний
    gfx.moveTo(halfW - cornerLen, halfH + yOffset);
    gfx.lineTo(halfW, halfH + yOffset);
    gfx.lineTo(halfW, halfH + yOffset - cornerLen);
    gfx.strokePath();
  };

  /**
   * Отрисовка наклонного светового блика, строго обрезанного по стеклу кнопки
   */
  const drawButtonSheen = (gfx: Phaser.GameObjects.Graphics, progress: number) => {
    gfx.clear();
    const minX = -btnW / 2 + 3;
    const maxX = btnW / 2 - 3;
    const minY = -btnH / 2 + 2;
    const maxY = btnH / 2 - 2;
    const slant = MENU_STANDBY_CONFIG.startSheenSlant;
    const width = MENU_STANDBY_CONFIG.startSheenWidth;

    const travelStart = minX - width - slant;
    const travelEnd = maxX + width + slant;
    const leadX = Phaser.Math.Linear(travelStart, travelEnd, progress);

    const xTopLeft = Phaser.Math.Clamp(leadX - width, minX, maxX);
    const xTopRight = Phaser.Math.Clamp(leadX, minX, maxX);
    const xBotRight = Phaser.Math.Clamp(leadX - slant, minX, maxX);
    const xBotLeft = Phaser.Math.Clamp(leadX - width - slant, minX, maxX);

    if (xTopRight <= xTopLeft && xBotRight <= xBotLeft) return;

    const fade = Math.sin(progress * Math.PI);
    gfx.fillStyle(0xd4ffea, 0.22 * fade);
    gfx.beginPath();
    gfx.moveTo(xTopLeft, minY);
    gfx.lineTo(xTopRight, minY);
    gfx.lineTo(xBotRight, maxY);
    gfx.lineTo(xBotLeft, maxY);
    gfx.closePath();
    gfx.fillPath();
  };

  const updateSoundButtonLabel = (isEnabled: boolean) => {
    if (soundBtnLabelRef) {
      soundBtnLabelRef.setText(
        formatMenuLabel(
          '4',
          isEnabled ? 'ЗВУКОВОЙ ТРАКТ: [ВКЛ]' : 'ЗВУКОВОЙ ТРАКТ: [ОТКЛ]',
        ),
      );
    }
  };

  buttonsData.forEach((btn, index) => {
    const isPrimary = index === 0;
    const btnY = startBtnY + index * btnGap;
    const btnContainer = scene.add.container(menuCenterX, btnY);
    container.add(btnContainer);
    btnContainers.push(btnContainer);

    const btnGfx = scene.add.graphics();
    const glowGfx = scene.add.graphics();
    const ledGlowGfx = isPrimary ? scene.add.graphics() : null;
    const sheenGfx = isPrimary ? scene.add.graphics() : null;

    if (isPrimary) {
      primaryLedGlowGfx = ledGlowGfx;
      primarySheenGfx = sheenGfx;
    }

    const drawButton = (isHovered: boolean, isPressed: boolean, isIgnited = false) => {
      btnGfx.clear();
      glowGfx.clear();
      ledGlowGfx?.clear();

      const halfW = btnW / 2;
      const halfH = btnH / 2;
      const yOffset = isPressed ? 2 : 0;

      if (isPrimary) {
        // Благородный многослойный контурный ореол (rim glow) без грубой сплошной заливки
        if (isIgnited) {
          glowGfx.lineStyle(6, 0x4ade80, 0.45);
          glowGfx.strokeRoundedRect(-halfW - 4, -halfH - 4 + yOffset, btnW + 8, btnH + 8, 8);
          glowGfx.lineStyle(2.5, 0xd4ffea, 0.85);
          glowGfx.strokeRoundedRect(-halfW - 1, -halfH - 1 + yOffset, btnW + 2, btnH + 2, 6);
        } else if (isHovered) {
          glowGfx.lineStyle(5, btn.colorHex, 0.22);
          glowGfx.strokeRoundedRect(-halfW - 4, -halfH - 4 + yOffset, btnW + 8, btnH + 8, 8);
          glowGfx.lineStyle(2.5, 0x4ade80, 0.42);
          glowGfx.strokeRoundedRect(-halfW - 1, -halfH - 1 + yOffset, btnW + 2, btnH + 2, 6);
        } else {
          glowGfx.lineStyle(4, btn.colorHex, 0.12);
          glowGfx.strokeRoundedRect(-halfW - 3, -halfH - 3 + yOffset, btnW + 6, btnH + 6, 7);
        }

        // Тёмно-изумрудное полупрозрачное стекло (ярко выделяется на фоне остальных кнопок)
        const baseColor = isIgnited ? 0x164430 : isHovered ? 0x0f2e21 : 0x0a2118;
        const baseAlpha = isIgnited ? 0.98 : isHovered ? 0.94 : 0.90;
        btnGfx.fillStyle(baseColor, baseAlpha);
        btnGfx.fillRoundedRect(-halfW, -halfH + yOffset, btnW, btnH, 5);

        const borderColor = isIgnited ? 0xd4ffea : isHovered ? 0x4ade80 : btn.colorHex;
        btnGfx.lineStyle(isHovered || isIgnited ? 2.0 : 1.6, borderColor, isHovered || isIgnited ? 0.98 : 0.72);
        btnGfx.strokeRoundedRect(-halfW, -halfH + yOffset, btnW, btnH, 5);

        // Тактические угловые скобки (при наведении изящно раздвигаются наружу)
        const expand = isHovered || isIgnited ? MENU_STANDBY_CONFIG.startBracketExpandPx : 0;
        drawCornerBrackets(
          glowGfx,
          halfW + expand,
          halfH + expand,
          yOffset,
          10,
          isIgnited ? 0xffffff : isHovered ? 0x86efac : 0x4ade80,
          isIgnited ? 1.0 : isHovered ? 0.95 : 0.65,
        );

        // Живой светодиод-индикатор слева (ореол + яркий сердечник)
        if (ledGlowGfx) {
          ledGlowGfx.fillStyle(btn.colorHex, isHovered || isIgnited ? 0.45 : 0.32);
          ledGlowGfx.fillRoundedRect(-halfW + 1, -halfH + 2 + yOffset, 9, btnH - 4, 3);
        }
        btnGfx.fillStyle(isIgnited ? 0xffffff : isHovered ? 0x86efac : btn.colorHex, 1.0);
        btnGfx.fillRoundedRect(-halfW + 4, -halfH + 5 + yOffset, 4, btnH - 10, 2);

        // Чёткая светлая верхняя 3D-фаска
        btnGfx.lineStyle(1.2, 0xd4ffea, isIgnited ? 0.85 : isHovered ? 0.55 : 0.28);
        btnGfx.beginPath();
        btnGfx.moveTo(-halfW + 6, -halfH + 1 + yOffset);
        btnGfx.lineTo(halfW - 6, -halfH + 1 + yOffset);
        btnGfx.strokePath();
        return;
      }

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

    if (isPrimary) {
      primaryBtnRedraw = drawButton;
    }

    drawButton(false, false);

    const mainLabel = scene.add.text(0, -9, btn.label, {
      ...menuTextStyle,
      fontSize: '14px',
      color: isPrimary ? '#ecfdf5' : '#f8fafc',
      fontStyle: 'bold',
      letterSpacing: 1.5,
    }).setOrigin(0.5);

    if (isPrimary) {
      primaryBtnLabelRef = mainLabel;
    }

    const subLabel = scene.add.text(0, 12, btn.sublabel, {
      ...menuTextStyle,
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

    const btnChildren: Phaser.GameObjects.GameObject[] = [glowGfx];
    if (ledGlowGfx) btnChildren.push(ledGlowGfx);
    btnChildren.push(btnGfx);
    if (sheenGfx) btnChildren.push(sheenGfx);
    btnChildren.push(mainLabel, subLabel);

    if (!btn.readonly) {
      const hitZone = scene.add.rectangle(0, 0, btnW, btnH, 0x000000, 0);
      hitZone.setInteractive({ useHandCursor: true });

      hitZone.on('pointerover', () => {
        if (isTransitioning) return;
        drawButton(true, false);
        needleHoverOffset = MENU_STANDBY_CONFIG.needleHoverBoostRad;
        if (isPrimary && sheenGfx) {
          mainLabel.setColor('#ffffff');
          primarySheenTween?.stop();
          const sheenState = { progress: 0 };
          primarySheenTween = scene.tweens.add({
            targets: sheenState,
            progress: 1,
            duration: MENU_STANDBY_CONFIG.startSheenDurationMs,
            ease: 'Cubic.easeOut',
            onUpdate: () => drawButtonSheen(sheenGfx, sheenState.progress),
            onComplete: () => sheenGfx.clear(),
          });
        }
        callbacks.playHoverSound?.();
      });

      hitZone.on('pointerout', () => {
        if (isTransitioning) return;
        drawButton(false, false);
        if (isPrimary) {
          mainLabel.setColor('#ecfdf5');
          primarySheenTween?.stop();
          sheenGfx?.clear();
        }
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

      btnChildren.push(hitZone);
    }

    btnContainer.add(btnChildren);
  });

  // Интерактивные зоны на тумбе и стекле радара
  const isInsideMenuStack = (px: number, py: number): boolean =>
    Math.abs(px - menuCenterX) <= btnW / 2 + 4 &&
    py >= startBtnY - btnH / 2 - 4 &&
    py <= startBtnY + 3 * btnGap + btnH / 2 + 4;

  const isInsideRadarEllipse = (px: number, py: number): boolean => {
    const nx = (px - menuRadarX) / menuRx;
    const ny = (py - menuRadarY) / menuRy;
    return nx * nx + ny * ny <= 0.96;
  };

  radarScreenHitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (isTransitioning) return;
    if (isInsideMenuStack(pointer.x, pointer.y) || !isInsideRadarEllipse(pointer.x, pointer.y)) {
      return;
    }

    const nx = Phaser.Math.Clamp((pointer.x - menuRadarX) / menuRx, -0.92, 0.92);
    const ny = Phaser.Math.Clamp((pointer.y - menuRadarY) / menuRy, -0.92, 0.92);
    activePings.push({ nx, ny, progress: 0 });
    screenPingCount += 1;
    needleHoverOffset = MENU_STANDBY_CONFIG.needleHoverBoostRad * 1.4;
    callbacks.playHoverSound?.();

    // Подсветка ближайшего дежурного контакта при прямом клике рядом на стекле
    for (const contact of standbyContacts) {
      const cxContact = menuRadarX + Math.cos(contact.angle) * menuRx * contact.rFrac;
      const cyContact = menuRadarY + Math.sin(contact.angle) * menuRy * contact.rFrac;
      if (Math.hypot(pointer.x - cxContact, pointer.y - cyContact) <= MENU_STANDBY_CONFIG.pingHitRadiusPx) {
        contact.alpha = 1.0;
        contact.echoRingProgress = 0;
      }
    }

    checkEasterEggTrigger();
  });

  const modeSwitchHitZone = scene.add.rectangle(modeSwitchPos.x, modeSwitchPos.y - 2, 42, 40, 0x000000, 0);
  modeSwitchHitZone.setInteractive({ useHandCursor: true });
  modeSwitchHitZone.on('pointerover', () => {
    if (isTransitioning) return;
    needleHoverOffset = MENU_STANDBY_CONFIG.needleHoverBoostRad;
    callbacks.playHoverSound?.();
  });
  modeSwitchHitZone.on('pointerdown', () => {
    if (isTransitioning) return;
    phosphorMode = phosphorMode === 'emerald' ? 'amber' : 'emerald';
    needleHoverOffset = MENU_STANDBY_CONFIG.needleSwitchKickRad;
    callbacks.playSelectSound?.();
    checkEasterEggTrigger();
  });

  const soundSwitchHitZone = scene.add.rectangle(soundSwitchPos.x, soundSwitchPos.y - 2, 42, 40, 0x000000, 0);
  soundSwitchHitZone.setInteractive({ useHandCursor: true });
  soundSwitchHitZone.on('pointerover', () => {
    if (isTransitioning) return;
    needleHoverOffset = MENU_STANDBY_CONFIG.needleHoverBoostRad;
    callbacks.playHoverSound?.();
  });
  soundSwitchHitZone.on('pointerdown', () => {
    if (isTransitioning) return;
    const isMuted = callbacks.onToggleSound();
    updateSoundButtonLabel(!isMuted);
    needleHoverOffset = MENU_STANDBY_CONFIG.needleSwitchKickRad;
    callbacks.playSelectSound?.();
  });

  const setGainIndex = (nextIdx: number) => {
    gainIndex = Phaser.Math.Clamp(nextIdx, 0, MENU_STANDBY_CONFIG.gainLevels.length - 1);
    needleHoverOffset = MENU_STANDBY_CONFIG.needleSwitchKickRad;
    callbacks.playHoverSound?.();
    checkEasterEggTrigger();
  };

  const gainDialHitZone = scene.add.rectangle(dialPos.x, dialPos.y, 52, 52, 0x000000, 0);
  gainDialHitZone.setInteractive({ useHandCursor: true });
  gainDialHitZone.on('pointerover', () => {
    if (isTransitioning) return;
    needleHoverOffset = MENU_STANDBY_CONFIG.needleHoverBoostRad;
    callbacks.playHoverSound?.();
  });
  gainDialHitZone.on('pointerdown', () => {
    if (isTransitioning) return;
    setGainIndex((gainIndex + 1) % MENU_STANDBY_CONFIG.gainLevels.length);
  });
  gainDialHitZone.on(
    'wheel',
    (_pointer: Phaser.Input.Pointer, _dx: number, deltaY: number) => {
      if (isTransitioning) return;
      setGainIndex(gainIndex + (deltaY < 0 ? 1 : -1));
    },
  );

  const apparatusHitZones = [radarScreenHitZone, modeSwitchHitZone, soundSwitchHitZone, gainDialHitZone];
  container.add([modeSwitchHitZone, soundSwitchHitZone, gainDialHitZone]);

  // =========================================================================
  // 4. АНИМАЦИЯ: МЕХАНИЧЕСКОЕ «РАЗБЕГАНИЕ» МЕНЮ И БЕСШОВНЫЙ НАПЛЫВ КАМЕРЫ НА ЭКРАН
  // =========================================================================
  const startTransition = (onComplete: () => void) => {
    if (isTransitioning) return;
    isTransitioning = true;
    hasTriggeredDegauss = false;
    apparatusHitZones.forEach((zone) => zone.setVisible(false));

    callbacks.playSelectSound?.();

    // 0. ИМПУЛЬС ПУСКА (Вариант 1): короткая вспышка кнопки + энергетическая волна
    primarySheenTween?.stop();
    primarySheenGfx?.clear();
    primaryBtnRedraw?.(true, true, true);
    primaryBtnLabelRef?.setColor('#ffffff');

    const startCenterY = btnContainers[0]?.y ?? startBtnY;
    const waveState = { progress: 0 };
    scene.tweens.add({
      targets: waveState,
      progress: 1,
      duration: MENU_STANDBY_CONFIG.startWaveDurationMs,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const p = waveState.progress;
        const alpha = 1 - p;
        const curW = btnW + 140 * p;
        const curH = btnH + 64 * p;
        launchWaveGfx.clear();
        launchWaveGfx.lineStyle(2.5, 0x4ade80, 0.75 * alpha);
        launchWaveGfx.strokeRoundedRect(
          menuCenterX - curW / 2,
          startCenterY - curH / 2,
          curW,
          curH,
          6 + 8 * p,
        );
        launchWaveGfx.lineStyle(1.2, 0xd4ffea, 0.9 * alpha);
        launchWaveGfx.strokeRoundedRect(
          menuCenterX - (curW - 4) / 2,
          startCenterY - (curH - 4) / 2,
          curW - 4,
          curH - 4,
          5 + 8 * p,
        );
      },
      onComplete: () => launchWaveGfx.clear(),
    });

    const holdDelay = MENU_STANDBY_CONFIG.startPressHoldMs;

    // 1. МЕНЮ РАЗБЕГАЕТСЯ В СТОРОНЫ, А КНОПКА ПУСКА ПРИБЛИЖАЕТСЯ НАВСТРЕЧУ КАМЕРЕ
    scene.tweens.add({
      targets: titleContainer,
      y: -140,
      alpha: 0,
      delay: holdDelay,
      duration: 380,
      ease: 'Quad.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[0],
      scaleX: MENU_STANDBY_CONFIG.startZoomOutScale,
      scaleY: MENU_STANDBY_CONFIG.startZoomOutScale,
      alpha: 0,
      delay: holdDelay,
      duration: 320,
      ease: 'Quad.easeOut',
    });

    scene.tweens.add({
      targets: btnContainers[1],
      x: menuCenterX + 340,
      y: btnContainers[1].y - 20,
      alpha: 0,
      delay: holdDelay,
      duration: 400,
      ease: 'Back.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[2],
      x: menuCenterX - 380,
      y: btnContainers[2].y + 40,
      alpha: 0,
      delay: holdDelay,
      duration: 420,
      ease: 'Back.easeIn',
    });

    scene.tweens.add({
      targets: btnContainers[3],
      x: menuCenterX + 380,
      y: btnContainers[3].y + 40,
      alpha: 0,
      delay: holdDelay,
      duration: 440,
      ease: 'Back.easeIn',
    });

    // Растворение настольной лампы, кабелей и трафарета при зуме к экрану
    scene.tweens.add({
      targets: [ambientRoomGfx, stencilText],
      alpha: 0,
      delay: holdDelay,
      duration: 380,
      ease: 'Quad.easeOut',
    });

    // 2. НАПЛЫВ КАМЕРЫ К РАДАРУ И РАСКРЫТИЕ ЭЛЛИПСА В КРУГ
    const transitionObj = { progress: 0 };
    scene.tweens.add({
      targets: transitionObj,
      progress: 1.0,
      delay: holdDelay,
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
    if (e.repeat) return;
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
    needleHoverOffset = 0;
    phosphorMode = 'emerald';
    gainIndex = MENU_STANDBY_CONFIG.defaultGainIndex;
    screenPingCount = 0;
    isEasterEggActive = false;
    easterOmegaAngle = 1.25;
    activePings = [];
    crtSpecks = [];
    standbyContacts = createInitialContacts();

    // Сброс позиций заголовка и клавиш
    titleContainer.setY(76);
    titleContainer.setAlpha(1);
    chassisLabelsContainer.setAlpha(1);
    chassisLabelsContainer.setVisible(true);
    centerPlaqueLabel.setText('1РЛ-134');
    centerPlaqueLabel.setColor('#64748b');
    stencilText.setText(MENU_STANDBY_CONFIG.stencilDefaultText);
    stencilText.setColor('#334155');
    apparatusHitZones.forEach((zone) => zone.setVisible(true));

    btnContainers.forEach((bc, idx) => {
      bc.setX(menuCenterX);
      bc.setY(startBtnY + idx * btnGap);
      bc.setScale(1);
      bc.setAlpha(1);
    });
    primarySheenTween?.stop();
    primarySheenGfx?.clear();
    launchWaveGfx.clear();
    primaryBtnRedraw?.(false, false);
    primaryBtnLabelRef?.setColor('#ecfdf5');

    ambientRoomGfx.setAlpha(1);
    stencilText.setAlpha(1);

    container.setVisible(true);
    container.setAlpha(1);
    updateSoundButtonLabel(!callbacks.isMuted());

    if (recordSubLabelRef) {
      recordSubLabelRef.setText(formatHighScoreLabel(callbacks.getHighScore()));
    }

    renderVolumetricRadar(scene.time.now, standbySweepAngle);
  };

  const hide = (onComplete?: () => void, immediate = false) => {
    isTransitioning = true;
    if (immediate) {
      container.setVisible(false);
      container.setAlpha(0);
      onComplete?.();
      return;
    }
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
    // Вращение дежурного луча и плавный откат стрелки вольтметра
    standbySweepAngle = (standbySweepAngle + dt * 1.15) % (Math.PI * 2);
    if (needleHoverOffset > 0) {
      needleHoverOffset *= Math.max(0, 1 - dt * MENU_STANDBY_CONFIG.needleBoostDecaySpeed);
      if (needleHoverOffset < 0.001) needleHoverOffset = 0;
    }

    if (!isTransitioning) {
      // Дрейф дежурных контактов, эхо-колец и засветка при проходе луча
      for (const contact of standbyContacts) {
        contact.rFrac -= contact.radialSpeed * dt;
        contact.angle = (contact.angle + contact.angularSpeed * dt) % (Math.PI * 2);
        if (contact.rFrac < MENU_STANDBY_CONFIG.contactMinRFrac) {
          contact.rFrac = MENU_STANDBY_CONFIG.contactMaxRFrac;
          contact.angle = (contact.angle + 2.1) % (Math.PI * 2);
          contact.alpha = 0;
        }

        const sweepDiff = Math.abs(
          Phaser.Math.Angle.ShortestBetween(standbySweepAngle, contact.angle),
        );
        if (sweepDiff < MENU_STANDBY_CONFIG.sweepTriggerSpan) {
          if (contact.alpha < 0.75) {
            contact.echoRingProgress = 0;
          }
          contact.alpha = 1.0;
        } else if (contact.alpha > 0) {
          contact.alpha = Math.max(
            0,
            contact.alpha - dt * MENU_STANDBY_CONFIG.contactFadeSpeed,
          );
        }

        if (contact.echoRingProgress < 1) {
          contact.echoRingProgress = Math.min(1, contact.echoRingProgress + dt * 1.4);
        }
      }

      // Калибровочные пинги от кликов по стеклу ЭЛТ
      for (let i = activePings.length - 1; i >= 0; i--) {
        activePings[i].progress += dt / MENU_STANDBY_CONFIG.pingDurationSec;
        if (activePings[i].progress >= 1) {
          activePings.splice(i, 1);
        }
      }

      // Лёгкие микро-помехи ЭЛТ (чаще при высоком усилении)
      for (let i = crtSpecks.length - 1; i >= 0; i--) {
        crtSpecks[i].life -= dt;
        if (crtSpecks[i].life <= 0) {
          crtSpecks.splice(i, 1);
        }
      }
      const spawnProb = 0.08 + gainIndex * 0.08;
      if (crtSpecks.length < MENU_STANDBY_CONFIG.crtNoiseMaxSpecks && Math.random() < spawnProb) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.92;
        const maxLife = 0.14 + Math.random() * 0.20;
        crtSpecks.push({
          nx: Math.cos(a) * r,
          ny: Math.sin(a) * r,
          width: 4 + Math.random() * 10,
          life: maxLife,
          maxLife,
        });
      }

      if (isEasterEggActive) {
        easterOmegaAngle = (easterOmegaAngle + dt * MENU_STANDBY_CONFIG.easterOmegaAngularSpeed) % (Math.PI * 2);
      }

      renderVolumetricRadar(scene.time.now, standbySweepAngle);
      sectorTag.setAlpha(0.65 + 0.35 * Math.sin(scene.time.now * 0.004));
      primaryLedGlowGfx?.setAlpha(0.65 + 0.35 * Math.sin(scene.time.now * 0.005));
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
