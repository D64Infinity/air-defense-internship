import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { GAME_CONFIG } from './gameConfig';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    roundPixels: true,
    backgroundColor: GAME_CONFIG.colors.canvasBg,
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}
