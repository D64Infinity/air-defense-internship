import './style.css';
import { createGame } from './game/config';
import { track } from './analytics';

createGame('game');

track('game_start');
