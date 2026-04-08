// ═══════════════════════════════════════════════════════════
//  BEGINNER SCENE — Hub with 4 beginner mode selections
//  Each mode delegates to its own module in beginner/.
//  
//  FIX: Proper cleanup on shutdown + before mode launch
// ═══════════════════════════════════════════════════════════

import Phaser from 'phaser';
import colors from '../core/colors.js';
import { resetBeginnerState } from '../core/state.js';

export default class BeginnerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BeginnerScene' });
    this.activeMode = null;
    this._updateHandler = null;
    this._keydownHandler = null;
    this._keyupHandler = null;
  }

  create() {
    // ── Clean slate: reset shared state that holds Phaser object refs ──
    resetBeginnerState();

    this.cameras.main.setBackgroundColor('#000');

    this.add.text(960, 80, 'BEGINNER HUB', {
      fontFamily: 'Orbitron', fontSize: '48px', color: '#fff',
    }).setOrigin(0.5).setShadow(0, 0, '#9333ea', 20, false, true);

    this.add.text(960, 140, 'Choose a practice mode', {
      fontFamily: 'Rajdhani', fontSize: '20px', color: '#94a3b8',
    }).setOrigin(0.5);

    const modes = [
      { label: '🐢 AUTO SLOW DOWN', desc: 'Notes slow down until you press them', key: 'autoSlowDown', color: colors.left },
      { label: '🎯 PRACTICE SHIFTING', desc: 'Get to the Dot / Random Shift Blocks', key: 'practiceShifting', color: colors.right },
      { label: '🎲 PLAY RANDOM NOTES', desc: 'Random falling notes — free play', key: 'playRandomNotes', color: colors.left },
      { label: '🤲 ONE HAND MODE', desc: 'One hand plays, the other shifts', key: 'oneHandMode', color: colors.right },
    ];

    modes.forEach((mode, i) => {
      const y = 250 + i * 110;
      const btn = this.add.rectangle(960, y, 600, 85, 0x0f0f1e).setInteractive();
      btn.setStrokeStyle(3, mode.color);

      this.add.text(960, y - 14, mode.label, {
        fontFamily: 'Rajdhani', fontSize: '26px', color: '#fff', fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(960, y + 18, mode.desc, {
        fontFamily: 'Rajdhani', fontSize: '16px', color: '#94a3b8',
      }).setOrigin(0.5);

      btn.on('pointerover', () => btn.setFillStyle(0x1a1a2e));
      btn.on('pointerout', () => btn.setFillStyle(0x0f0f1e));
      btn.on('pointerdown', () => {
        this.launchMode(mode.key);
      });
    });

    // Back button
    const backBtn = this.add.rectangle(960, 720, 200, 55, 0x000000).setInteractive();
    backBtn.setStrokeStyle(3, 0x9333ea);
    this.add.text(960, 720, '← BACK', {
      fontFamily: 'Rajdhani', fontSize: '24px', color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    backBtn.on('pointerdown', () => this.scene.start('MainScene'));

    // ── Cleanup when this scene shuts down (transition to MainScene or elsewhere) ──
    this.events.once('shutdown', () => {
      this.cleanupMode();
    });
  }

  /**
   * Remove all event listeners that beginner modes may have attached.
   * This is the KEY fix — prevents listener stacking.
   */
  cleanupMode() {
    // Remove update listener if any mode attached one
    if (this._updateHandler) {
      this.events.off('update', this._updateHandler);
      this._updateHandler = null;
    }
    // Remove keyboard listeners if any mode attached them
    if (this._keydownHandler) {
      this.input.keyboard.off('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._keyupHandler) {
      this.input.keyboard.off('keyup', this._keyupHandler);
      this._keyupHandler = null;
    }
    this.activeMode = null;
  }

  async launchMode(modeKey) {
    // ── Clean up previous mode first ──
    this.cleanupMode();
    resetBeginnerState();

    // Remove all visual children, then re-launch
    this.children.removeAll();

    this.activeMode = modeKey;

    // Dynamic import so each mode is its own file
    switch (modeKey) {
      case 'autoSlowDown': {
        const { startAutoSlowDown } = await import('../beginner/autoSlowDown.js');
        startAutoSlowDown(this);
        break;
      }
      case 'practiceShifting': {
        const { startPracticeShifting } = await import('../beginner/practiceShifting.js');
        startPracticeShifting(this);
        break;
      }
      case 'playRandomNotes': {
        const { startPlayRandomNotes } = await import('../beginner/playRandomNotes.js');
        startPlayRandomNotes(this);
        break;
      }
      case 'oneHandMode': {
        const { startOneHandMode } = await import('../beginner/oneHandMode.js');
        startOneHandMode(this);
        break;
      }
    }
  }
}
