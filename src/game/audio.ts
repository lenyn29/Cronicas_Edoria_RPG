export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private stepIdx = 0;
  public enabled = true;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.36 : 0;
    this.master.connect(this.ctx.destination);
    this.startAmbientMusic();
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.36 : 0, this.ctx.currentTime, 0.05);
    }
    return this.enabled;
  }

  public dispose(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private playTone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.2,
    slideTo: number | null = null,
    attack = 0.01
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playNoise(dur: number, filterFreq = 800, vol = 0.18, q = 1.2): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
  }

  public footstep(): void {
    this.playNoise(0.06, 360 + Math.random() * 140, 0.06, 1.6);
  }

  public sword(): void {
    this.playNoise(0.14, 1500, 0.24, 0.9);
    this.playTone(420, 0.12, 'triangle', 0.14, 150);
  }

  public hit(): void {
    this.playNoise(0.11, 500, 0.22, 1.0);
    this.playTone(150, 0.12, 'sawtooth', 0.18, 55);
  }

  public crit(): void {
    this.playNoise(0.14, 1850, 0.24, 0.8);
    this.playTone(580, 0.14, 'triangle', 0.2, 860);
    this.playTone(220, 0.15, 'sawtooth', 0.16, 90);
  }

  public spellCast(kind: 'arcane_pulse' | 'frost_nova' | 'astral_lance'): void {
    if (kind === 'frost_nova') {
      this.playNoise(0.28, 2400, 0.2, 0.9);
      this.playTone(760, 0.24, 'sine', 0.18, 320);
    } else if (kind === 'astral_lance') {
      this.playNoise(0.2, 1900, 0.22, 0.75);
      this.playTone(880, 0.22, 'triangle', 0.18, 420);
    } else {
      this.playNoise(0.18, 1250, 0.18, 0.9);
      this.playTone(620, 0.18, 'sine', 0.16, 280);
    }
  }

  public explosion(): void {
    this.playNoise(0.32, 320, 0.32, 0.6);
    this.playTone(110, 0.28, 'sawtooth', 0.22, 36);
  }

  public dash(): void {
    this.playNoise(0.16, 1800, 0.14, 0.7);
  }

  public pickup(): void {
    this.playTone(660, 0.1, 'sine', 0.14, 880);
    window.setTimeout(() => this.playTone(990, 0.14, 'sine', 0.14, 1320), 65);
  }

  public hurt(): void {
    this.playTone(190, 0.18, 'square', 0.2, 75);
  }

  public talk(): void {
    this.playTone(420 + Math.random() * 110, 0.05, 'triangle', 0.08);
  }

  public levelUp(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => window.setTimeout(() => this.playTone(n, 0.26, 'triangle', 0.2), i * 95));
  }

  public questDone(): void {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => window.setTimeout(() => this.playTone(n, 0.28, 'sine', 0.2), i * 110));
  }

  private startAmbientMusic(): void {
    const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    const pattern = [0, 2, 4, 3, 5, 4, 2, 1, 0, 4, 6, 5, 4, 2, 3, 0];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
      const idx = pattern[this.stepIdx % pattern.length];
      const freq = scale[idx] * (this.stepIdx % 16 === 0 ? 0.5 : 1);
      this.playTone(freq, 1.35, 'triangle', 0.045, null, 0.04);
      if (this.stepIdx % 4 === 0) {
        this.playTone(scale[0] * 0.5, 2.1, 'sine', 0.04, null, 0.08);
      }
      this.stepIdx++;
    }, 680);
  }
}
