import { CanvasSourceTransform, LiveStream, User } from '../types';
import { GoalWidgetConfig, GamePreset } from '../components/live/LiveStreamCanvas';
import { getSupabaseClient, toUuid } from '../lib/supabase';

export interface BroadcastState {
  isBroadcasting: boolean;
  streamId: string | null;
  hostUser: User | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  compositeStream: MediaStream | null;
  cameraSource: 'webcam' | 'preset';
  gameSource: GamePreset;
  cameraEnabled: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
  canvasAspectRatio: '9:16' | '16:9';
  cameraTransform: CanvasSourceTransform;
  screenTransform: CanvasSourceTransform;
  goalWidgetConfig: GoalWidgetConfig;
  streamTitle: string;
  streamTopic: string;
  streamAbout: string;
  viewersCount: number;
  lastSnapshotUrl: string | null;
  isMobileStream?: boolean;
}

const isDesktopClient = typeof window !== 'undefined' && window.innerWidth >= 768;

const DEFAULT_CAMERA_TRANSFORM: CanvasSourceTransform = {
  id: 'camera',
  name: 'Camera (Facecam)',
  type: 'camera',
  x: isDesktopClient ? 72 : 56,
  y: isDesktopClient ? 64 : 68,
  width: isDesktopClient ? 26 : 38,
  height: isDesktopClient ? 32 : 26,
  zIndex: 20,
  visible: true,
  locked: false,
  mirrored: false,
  borderRadius: 16,
  borderStyle: 'pink',
  opacity: 1,
};

const DEFAULT_SCREEN_TRANSFORM: CanvasSourceTransform = {
  id: 'screen',
  name: 'Screen & Game Display',
  type: 'screen',
  x: 0,
  y: 0,
  width: 100,
  height: isDesktopClient ? 100 : 32, // Full 100% on 16:9 desktop, 32% on 9:16 mobile canvas
  zIndex: 10,
  visible: true,
  locked: false,
  borderRadius: 0,
  borderStyle: 'none',
  opacity: 1,
};

const DEFAULT_GOAL_CONFIG: GoalWidgetConfig = {
  enabled: true,
  title: 'Follower Goal',
  current: 0,
  target: 100,
  posX: 22,
  posY: 13,
  widthPercent: 56,
  theme: 'pink',
};

class LiveBroadcastService {
  private state: BroadcastState = {
    isBroadcasting: false,
    streamId: null,
    hostUser: null,
    cameraStream: null,
    screenStream: null,
    compositeStream: null,
    cameraSource: 'preset',
    gameSource: 'genshin',
    cameraEnabled: true,
    micEnabled: true,
    screenShareEnabled: true,
    canvasAspectRatio: isDesktopClient ? '16:9' : '9:16',
    cameraTransform: { ...DEFAULT_CAMERA_TRANSFORM },
    screenTransform: { ...DEFAULT_SCREEN_TRANSFORM },
    goalWidgetConfig: { ...DEFAULT_GOAL_CONFIG },
    streamTitle: 'TikTok Live',
    streamTopic: 'Gaming',
    streamAbout: '',
    viewersCount: 0,
    lastSnapshotUrl: null,
    isMobileStream: !isDesktopClient,
  };

  private listeners = new Set<(state: BroadcastState) => void>();

  // Host WebRTC resources
  private hostPeerConnections = new Map<string, RTCPeerConnection>();
  private pendingCandidatesMap = new Map<string, RTCIceCandidateInit[]>();
  private hostRealtimeChannel: any = null;
  private hostBroadcastChannel: BroadcastChannel | null = null;
  private compositorCanvas: HTMLCanvasElement | null = null;
  private thumbnailCanvas: HTMLCanvasElement | null = null;
  private compositorAnimFrame: number | null = null;
  private snapshotInterval: number | null = null;
  private hostAudioContext: AudioContext | null = null;

  // Offscreen Video elements for canvas compositing
  private screenVideoEl: HTMLVideoElement | null = null;
  private cameraVideoEl: HTMLVideoElement | null = null;
  private onViewerJoinedCallback: ((viewer: { id: string; username: string; displayName: string; avatar: string }) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.screenVideoEl = document.createElement('video');
      this.screenVideoEl.muted = true;
      this.screenVideoEl.autoplay = true;
      this.screenVideoEl.playsInline = true;

      this.cameraVideoEl = document.createElement('video');
      this.cameraVideoEl.muted = true;
      this.cameraVideoEl.autoplay = true;
      this.cameraVideoEl.playsInline = true;

      this.ensureOffscreenVideosMounted();
    }
  }

  private ensureOffscreenVideosMounted() {
    if (typeof document === 'undefined') return;
    try {
      if (this.cameraVideoEl && !this.cameraVideoEl.isConnected && document.body) {
        this.cameraVideoEl.style.position = 'fixed';
        this.cameraVideoEl.style.top = '-9999px';
        this.cameraVideoEl.style.left = '-9999px';
        this.cameraVideoEl.style.width = '160px';
        this.cameraVideoEl.style.height = '90px';
        this.cameraVideoEl.style.opacity = '0.001';
        this.cameraVideoEl.style.pointerEvents = 'none';
        document.body.appendChild(this.cameraVideoEl);
      }
      if (this.screenVideoEl && !this.screenVideoEl.isConnected && document.body) {
        this.screenVideoEl.style.position = 'fixed';
        this.screenVideoEl.style.top = '-9999px';
        this.screenVideoEl.style.left = '-9999px';
        this.screenVideoEl.style.width = '160px';
        this.screenVideoEl.style.height = '90px';
        this.screenVideoEl.style.opacity = '0.001';
        this.screenVideoEl.style.pointerEvents = 'none';
        document.body.appendChild(this.screenVideoEl);
      }
    } catch {}
  }

  public setOnViewerJoined(cb: ((viewer: { id: string; username: string; displayName: string; avatar: string }) => void) | null) {
    this.onViewerJoinedCallback = cb;
  }

  public getOnViewerJoined() {
    return this.onViewerJoinedCallback;
  }

  public getState(): BroadcastState {
    return { ...this.state };
  }

  public subscribe(listener: (state: BroadcastState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach(l => {
      try {
        l(currentState);
      } catch (err) {
        console.warn('Listener error in LiveBroadcastService', err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Host Stream Registration & Management
  // ---------------------------------------------------------------------------
  public setCameraStream(stream: MediaStream | null, source: 'webcam' | 'preset' = 'webcam') {
    this.state.cameraStream = stream;
    this.state.cameraSource = stream ? source : 'preset';
    this.state.cameraEnabled = true;

    this.ensureOffscreenVideosMounted();

    if (this.cameraVideoEl) {
      if (stream) {
        this.cameraVideoEl.srcObject = stream;
        this.cameraVideoEl.play().catch(() => {});
      } else {
        this.cameraVideoEl.srcObject = null;
      }
    }

    this.updateCompositeStream();
    this.notify();
  }

  public setScreenStream(stream: MediaStream | null, source: GamePreset = 'custom_screen') {
    this.state.screenStream = stream;
    this.state.gameSource = stream ? source : 'genshin';
    this.state.screenShareEnabled = true;

    this.ensureOffscreenVideosMounted();

    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.setScreenStream(null, 'genshin');
        };
      }
    }

    if (this.screenVideoEl) {
      if (stream) {
        this.screenVideoEl.srcObject = stream;
        this.screenVideoEl.onloadedmetadata = () => {
          this.autoFlexScreenTransform();
        };
        this.screenVideoEl.play().catch(() => {});
      } else {
        this.screenVideoEl.srcObject = null;
      }
    }

    this.updateCompositeStream();
    this.notify();
  }

  public autoFlexScreenTransform() {
    if (!this.screenVideoEl) return;
    const vw = this.screenVideoEl.videoWidth || 1920;
    const vh = this.screenVideoEl.videoHeight || 1080;
    if (!vw || !vh) return;

    const isPortrait = this.state.canvasAspectRatio === '9:16';
    if (isPortrait) {
      // In 9:16 portrait (720x1280), full width (720) corresponds to natural height:
      const flexH = Math.min(100, Math.max(25, Math.round(((720 * (vh / vw)) / 1280) * 100)));
      this.state.screenTransform = {
        ...this.state.screenTransform,
        x: 0,
        y: 0,
        width: 100,
        height: flexH,
        visible: true,
      };
      // If camera is positioned in the top area, place below screen share
      if (this.state.cameraTransform.y < flexH && this.state.cameraTransform.x < 40) {
        this.state.cameraTransform = {
          ...this.state.cameraTransform,
          x: 58,
          y: Math.min(72, flexH + 4),
        };
      }
    } else {
      this.state.screenTransform = {
        ...this.state.screenTransform,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visible: true,
      };
      // Keep facecam nicely sized in corner over screen share
      this.state.cameraTransform = {
        ...this.state.cameraTransform,
        x: 72,
        y: 64,
        width: 26,
        height: 32,
        visible: this.state.cameraEnabled,
        zIndex: 20,
      };
    }
    this.notify();
  }

  public updateStudioConfig(config: {
    title?: string;
    topic?: string;
    aboutMe?: string;
    aspectRatio?: '9:16' | '16:9';
    cameraTransform?: Partial<CanvasSourceTransform>;
    screenTransform?: Partial<CanvasSourceTransform>;
    goalConfig?: Partial<GoalWidgetConfig>;
    cameraEnabled?: boolean;
    micEnabled?: boolean;
    screenShareEnabled?: boolean;
    isMobileStream?: boolean;
  }) {
    if (config.title !== undefined) this.state.streamTitle = config.title;
    if (config.topic !== undefined) this.state.streamTopic = config.topic;
    if (config.aboutMe !== undefined) this.state.streamAbout = config.aboutMe;
    if (config.aspectRatio !== undefined) this.state.canvasAspectRatio = config.aspectRatio;
    if (config.isMobileStream !== undefined) this.state.isMobileStream = config.isMobileStream;
    if (config.cameraTransform) {
      this.state.cameraTransform = { ...this.state.cameraTransform, ...config.cameraTransform };
    }
    if (config.screenTransform) {
      this.state.screenTransform = { ...this.state.screenTransform, ...config.screenTransform };
    }
    if (config.goalConfig) {
      this.state.goalWidgetConfig = { ...this.state.goalWidgetConfig, ...config.goalConfig };
    }
    if (config.cameraEnabled !== undefined) this.state.cameraEnabled = config.cameraEnabled;
    if (config.micEnabled !== undefined) this.state.micEnabled = config.micEnabled;
    if (config.screenShareEnabled !== undefined) this.state.screenShareEnabled = config.screenShareEnabled;

    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Canvas Compositor: Blends Screen + Camera + Overlays into single 30fps MediaStream
  // ---------------------------------------------------------------------------
  private updateCompositeStream() {
    if (typeof window === 'undefined') return;

    if (!this.compositorCanvas) {
      this.compositorCanvas = document.createElement('canvas');
    }

    const isPortrait = this.state.canvasAspectRatio === '9:16';
    const targetW = isPortrait ? 720 : 1280;
    const targetH = isPortrait ? 1280 : 720;

    if (this.compositorCanvas.width !== targetW || this.compositorCanvas.height !== targetH) {
      this.compositorCanvas.width = targetW;
      this.compositorCanvas.height = targetH;
    }

    if (!this.state.compositeStream || !this.state.compositeStream.active || this.state.compositeStream.getVideoTracks().length === 0) {
      try {
        const stream = this.compositorCanvas.captureStream(30);
        this.state.compositeStream = stream;
      } catch (e) {
        console.warn('captureStream failed', e);
      }
    }

    // Start render loop if not running
    if (!this.compositorAnimFrame) {
      this.renderCompositeLoop();
    }
  }

  private renderCompositeLoop = () => {
    if (!this.compositorCanvas) return;
    const ctx = this.compositorCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.compositorCanvas.width;
    const h = this.compositorCanvas.height;

    // 1. Clear background (modern dark broadcast studio backdrop)
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, w, h);

    const isCameraOnly =
      Boolean(this.state.isMobileStream) ||
      !this.state.screenShareEnabled ||
      !this.state.screenTransform.visible;

    if (isCameraOnly && this.state.cameraEnabled) {
      // Full portrait or full-screen camera mode (e.g. mobile host broadcast)
      if (this.cameraVideoEl && this.state.cameraStream && (this.cameraVideoEl.videoWidth > 0 || this.cameraVideoEl.readyState >= 1)) {
        if (this.cameraVideoEl.paused) this.cameraVideoEl.play().catch(() => {});
        this.drawVideoCover(ctx, this.cameraVideoEl, 0, 0, w, h, this.state.cameraTransform.mirrored);
      } else {
        ctx.fillStyle = '#101018';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ff007a';
        ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Host Live Camera', w / 2, h / 2);
      }
    } else {
      // 2. Render Screen / Game Display Layer
      const scr = this.state.screenTransform;
      if (scr.visible && this.state.screenShareEnabled) {
        const scrX = (scr.x / 100) * w;
        const scrY = (scr.y / 100) * h;
        const scrW = (scr.width / 100) * w;
        const scrH = (scr.height / 100) * h;

        if (this.screenVideoEl && this.state.screenStream && (this.screenVideoEl.videoWidth > 0 || this.screenVideoEl.readyState >= 1)) {
          if (this.screenVideoEl.paused) this.screenVideoEl.play().catch(() => {});
          ctx.save();
          ctx.beginPath();
          if (scr.borderRadius && scr.borderRadius > 0) {
            const r = (scr.borderRadius / 100) * Math.min(scrW, scrH);
            ctx.roundRect(scrX, scrY, scrW, scrH, r);
            ctx.clip();
          } else {
            ctx.rect(scrX, scrY, scrW, scrH);
            ctx.clip();
          }
          this.drawVideoContain(ctx, this.screenVideoEl, scrX, scrY, scrW, scrH);
          ctx.restore();
        } else {
          // Fallback graphical display for game/screen
          ctx.fillStyle = '#0f1422';
          ctx.fillRect(scrX, scrY, scrW, scrH);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
          ctx.lineWidth = 2;
          ctx.strokeRect(scrX + 1, scrY + 1, scrW - 2, scrH - 2);

          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Screen & Game Capture', scrX + scrW / 2, scrY + scrH / 2 - 10);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '16px "Plus Jakarta Sans", sans-serif';
          ctx.fillText('Real Window / Display Active', scrX + scrW / 2, scrY + scrH / 2 + 20);
        }
      }

      // 3. Render Camera Feed (Facecam) Layer in Custom/Multi-Source Box
      const cam = this.state.cameraTransform;
      if (cam.visible && this.state.cameraEnabled) {
        const camX = (cam.x / 100) * w;
        const camY = (cam.y / 100) * h;
        const camW = (cam.width / 100) * w;
        const camH = (cam.height / 100) * h;

        ctx.save();
        const radius = cam.borderRadius ? Math.min(cam.borderRadius, 24) : 16;
        ctx.beginPath();
        ctx.roundRect(camX, camY, camW, camH, radius);
        ctx.clip();

        if (this.cameraVideoEl && this.state.cameraStream && (this.cameraVideoEl.videoWidth > 0 || this.cameraVideoEl.readyState >= 1)) {
          if (this.cameraVideoEl.paused) this.cameraVideoEl.play().catch(() => {});
          this.drawVideoCover(ctx, this.cameraVideoEl, camX, camY, camW, camH, cam.mirrored);
        } else {
          // Default avatar or camera badge fallback
          ctx.fillStyle = '#1e1b2e';
          ctx.fillRect(camX, camY, camW, camH);
          ctx.fillStyle = '#ff007a';
          ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Camera Feed', camX + camW / 2, camY + camH / 2);
        }
        ctx.restore();

        // Border glow
        if (cam.borderStyle === 'pink') {
          ctx.save();
          ctx.strokeStyle = '#ff007a';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(camX, camY, camW, camH, radius);
          ctx.stroke();
          ctx.restore();
        } else if (cam.borderStyle === 'cyan') {
          ctx.save();
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(camX, camY, camW, camH, radius);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. Render Goal Bar Widget Overlay (only in multi-source studio mode)
      const goal = this.state.goalWidgetConfig;
      if (goal && goal.enabled) {
        const goalW = (Math.max(20, Math.min(100, goal.widthPercent ?? 56)) / 100) * w;
        const defaultGoalX = (w - goalW) / 2;
        const goalX = goal.posX !== undefined ? ((goal.posX) / 100) * w : defaultGoalX;
        const goalY = ((goal.posY ?? 13) / 100) * h;
        const goalH = 50;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(goalX, goalY, goalW, goalH, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Title & numbers
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(goal.title || 'Follower Goal', goalX + 16, goalY + 22);

        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ff007a';
        const curFollowers = Math.max(0, goal.current ?? 0);
        const tgtFollowers = Math.min(999999, Math.max(1, goal.target ?? 100));
        ctx.fillText(`${curFollowers.toLocaleString()} / ${tgtFollowers.toLocaleString()}`, goalX + goalW - 16, goalY + 22);

        // Progress bar track
        const barX = goalX + 16;
        const barY = goalY + 30;
        const barW = goalW - 32;
        const barH = 8;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.fill();

        // Progress bar fill
        const pct = Math.min(1, Math.max(0, curFollowers / tgtFollowers));
        ctx.fillStyle = '#ff007a';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 4);
        ctx.fill();
        ctx.restore();
      }
    }

    this.compositorAnimFrame = requestAnimationFrame(this.renderCompositeLoop);
  };

  private drawVideoCover(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    mirrored = false
  ) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      if (mirrored) {
        ctx.save();
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(video, dx, dy, dw, dh);
      }
      return;
    }

    const videoRatio = vw / vh;
    const dstRatio = dw / dh;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (videoRatio > dstRatio) {
      sw = vh * dstRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / dstRatio;
      sy = (vh - sh) / 2;
    }

    if (mirrored) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  private drawVideoContain(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      ctx.drawImage(video, dx, dy, dw, dh);
      return;
    }

    const videoRatio = vw / vh;
    const dstRatio = dw / dh;
    let rw = dw;
    let rh = dh;
    let rx = dx;
    let ry = dy;

    if (videoRatio > dstRatio) {
      // Source is wider than destination: fit width, letterbox vertically
      rh = dw / videoRatio;
      ry = dy + (dh - rh) / 2;
    } else {
      // Source is taller than destination: fit height, letterbox horizontally
      rw = dh * videoRatio;
      rx = dx + (dw - rw) / 2;
    }

    ctx.drawImage(video, 0, 0, vw, vh, rx, ry, rw, rh);
  }

  // ---------------------------------------------------------------------------
  // Start Broadcasting: Initializes Realtime WebSockets & WebRTC Signaling
  // ---------------------------------------------------------------------------
  public startBroadcasting(streamId: string, hostUser: User) {
    this.state.isBroadcasting = true;
    this.state.streamId = streamId;
    this.state.hostUser = hostUser;
    this.state.viewersCount = 0;

    // Ensure composite stream is generating
    this.updateCompositeStream();

    // 1. Cross-tab same-device signaling via BroadcastChannel
    try {
      this.hostBroadcastChannel = new BroadcastChannel(`live_webrtc_${streamId}`);
      this.hostBroadcastChannel.onmessage = event => {
        this.handleHostSignal(event.data);
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported', e);
    }

    // 2. Cross-device signaling via Supabase Realtime Broadcast (Zero Disk IO!)
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        this.hostRealtimeChannel = supabase.channel(`live_webrtc_${streamId}`, {
          config: { broadcast: { ack: false, self: false } },
        });

        this.hostRealtimeChannel
          .on('broadcast', { event: 'signal' }, ({ payload }: { payload: any }) => {
            this.handleHostSignal(payload);
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              this.sendBroadcastSignal({
                type: 'stream_started',
                streamId,
                hostId: hostUser.id,
                title: this.state.streamTitle,
                aspectRatio: this.state.canvasAspectRatio,
                isMobileStream: this.state.isMobileStream,
              });
              // Send immediate initial snapshot
              this.captureAndBroadcastSnapshot();
            }
          });
      } catch (err) {
        console.warn('Supabase Realtime channel error', err);
      }
    }

    // 3. Periodic low-overhead canvas snapshot (scaled down to ~12KB, completely safe for Realtime WebSocket)
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.snapshotInterval = window.setInterval(() => {
      this.captureAndBroadcastSnapshot();
    }, 2200);

    this.notify();
  }

  public endBroadcasting() {
    this.state.isBroadcasting = false;
    this.sendBroadcastSignal({ type: 'stream_ended', streamId: this.state.streamId });

    // Close all viewer peer connections
    this.hostPeerConnections.forEach(pc => {
      try {
        pc.close();
      } catch {}
    });
    this.hostPeerConnections.clear();
    this.pendingCandidatesMap.clear();

    if (this.hostRealtimeChannel) {
      try {
        this.hostRealtimeChannel.unsubscribe();
      } catch {}
      this.hostRealtimeChannel = null;
    }

    if (this.hostBroadcastChannel) {
      try {
        this.hostBroadcastChannel.close();
      } catch {}
      this.hostBroadcastChannel = null;
    }

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    if (this.compositorAnimFrame) {
      cancelAnimationFrame(this.compositorAnimFrame);
      this.compositorAnimFrame = null;
    }

    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Host WebRTC Negotiation Handler
  // ---------------------------------------------------------------------------
  private async handleHostSignal(signal: any) {
    if (!signal || !this.state.isBroadcasting) return;

    const { type, viewerId } = signal;
    if (!viewerId) return;

    if (type === 'viewer_join') {
      if (signal.viewerUser && this.onViewerJoinedCallback) {
        try {
          this.onViewerJoinedCallback(signal.viewerUser);
        } catch {}
      }
      // Viewer wants to connect! Create WebRTC PeerConnection for this viewer
      await this.createHostPeerConnectionForViewer(viewerId);
    } else if (type === 'answer') {
      const pc = this.hostPeerConnections.get(viewerId);
      if (pc && signal.answer) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          // Flush pending buffered ICE candidates for this viewer
          const pending = this.pendingCandidatesMap.get(viewerId);
          if (pending && pending.length > 0) {
            for (const cand of pending) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('Error flushing buffered candidate on host', e);
              }
            }
            this.pendingCandidatesMap.delete(viewerId);
          }
        } catch (err) {
          console.warn('Failed to set remote description on host', err);
        }
      }
    } else if (type === 'ice_candidate') {
      const pc = this.hostPeerConnections.get(viewerId);
      if (pc && signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.warn('Failed to add ICE candidate on host', err);
          }
        } else {
          // Buffer candidate until answer/remoteDescription is set
          const list = this.pendingCandidatesMap.get(viewerId) || [];
          list.push(signal.candidate);
          this.pendingCandidatesMap.set(viewerId, list);
        }
      }
    } else if (type === 'viewer_leave') {
      const pc = this.hostPeerConnections.get(viewerId);
      if (pc) {
        try { pc.close(); } catch {}
        this.hostPeerConnections.delete(viewerId);
        this.pendingCandidatesMap.delete(viewerId);
        this.state.viewersCount = Math.max(0, this.hostPeerConnections.size);
        this.notify();
      }
    }
  }

  private async createHostPeerConnectionForViewer(viewerId: string) {
    try {
      // Close any existing connection for this viewerId
      const existing = this.hostPeerConnections.get(viewerId);
      if (existing) {
        try { existing.close(); } catch {}
      }
      this.pendingCandidatesMap.delete(viewerId);

      const pc = new RTCPeerConnection({
        iceServers: GLOBAL_ICE_SERVERS,
      });

      this.hostPeerConnections.set(viewerId, pc);
      this.state.viewersCount = this.hostPeerConnections.size;
      this.notify();

      // Send immediate snapshot frame to this newly joined viewer so they see the live display instantly (<100ms)
      if (this.state.lastSnapshotUrl) {
        this.sendBroadcastSignal({
          type: 'snapshot',
          streamId: this.state.streamId,
          dataUrl: this.state.lastSnapshotUrl,
          aspectRatio: this.state.canvasAspectRatio,
          targetViewerId: viewerId,
        });
      }

      // Add composite video and audio tracks
      if (this.state.compositeStream) {
        this.state.compositeStream.getTracks().forEach(track => {
          try {
            pc.addTrack(track, this.state.compositeStream!);
          } catch (e) {
            console.warn('addTrack failed on host', e);
          }
        });
      }

      // Add microphone audio if available
      if (this.state.cameraStream && this.state.micEnabled) {
        this.state.cameraStream.getAudioTracks().forEach(track => {
          try {
            pc.addTrack(track, this.state.compositeStream!);
          } catch {}
        });
      }

      pc.onicecandidate = event => {
        if (event.candidate) {
          this.sendBroadcastSignal({
            type: 'ice_candidate',
            candidate: event.candidate,
            targetViewerId: viewerId,
            fromHost: true,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.hostPeerConnections.delete(viewerId);
          this.pendingCandidatesMap.delete(viewerId);
          this.state.viewersCount = this.hostPeerConnections.size;
          this.notify();
        }
      };

      // Create and send SDP Offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      this.sendBroadcastSignal({
        type: 'offer',
        offer,
        targetViewerId: viewerId,
      });
    } catch (err) {
      console.warn('Error creating host peer connection for viewer', err);
    }
  }

  private sendBroadcastSignal(payload: any) {
    // 1. Send via local BroadcastChannel
    if (this.hostBroadcastChannel) {
      try {
        this.hostBroadcastChannel.postMessage(payload);
      } catch {}
    }

    // 2. Send via Supabase Realtime WebSocket (in-memory broadcast, 0 disk IO)
    if (this.hostRealtimeChannel) {
      try {
        this.hostRealtimeChannel.send({
          type: 'broadcast',
          event: 'signal',
          payload,
        });
      } catch {}
    }
  }

  private captureAndBroadcastSnapshot() {
    if (!this.compositorCanvas || !this.state.isBroadcasting) return;
    try {
      if (!this.thumbnailCanvas) {
        this.thumbnailCanvas = document.createElement('canvas');
      }
      const isPortrait = this.state.canvasAspectRatio === '9:16';
      // Compact thumbnail dimensions: 270x480 (portrait) or 480x270 (landscape)
      const thumbW = isPortrait ? 270 : 480;
      const thumbH = isPortrait ? 480 : 270;
      if (this.thumbnailCanvas.width !== thumbW || this.thumbnailCanvas.height !== thumbH) {
        this.thumbnailCanvas.width = thumbW;
        this.thumbnailCanvas.height = thumbH;
      }
      const thumbCtx = this.thumbnailCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.drawImage(this.compositorCanvas, 0, 0, thumbW, thumbH);
        // Quality 0.4 keeps payload under 15KB — 100% safe within Supabase Realtime 128KB limit!
        const dataUrl = this.thumbnailCanvas.toDataURL('image/jpeg', 0.4);
        this.state.lastSnapshotUrl = dataUrl;
        if (this.state.streamId && typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`viralhub_livestream_thumb_${this.state.streamId}`, dataUrl);
          } catch {}
        }
        this.sendBroadcastSignal({
          type: 'snapshot',
          streamId: this.state.streamId,
          dataUrl,
          aspectRatio: this.state.canvasAspectRatio,
          isMobileStream: this.state.isMobileStream,
        });
      }
    } catch {}
  }
}

export const liveBroadcastService = new LiveBroadcastService();

// Global reliable STUN servers for cross-network NAT traversal
const GLOBAL_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
];

export interface ViewerSessionCallbacks {
  viewerUser?: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  onRemoteStream: (stream: MediaStream) => void;
  onSnapshot?: (dataUrl: string) => void;
  onAspectRatio?: (aspectRatio: '9:16' | '16:9') => void;
  onMobileStream?: (isMobile: boolean) => void;
  onStreamEnded?: () => void;
  onConnectionStateChange?: (state: string) => void;
}

export const createLiveViewerSession = (
  streamId: string,
  callbacks: ViewerSessionCallbacks
): (() => void) => {
  // If host is running on the SAME browser instance/tab, directly deliver composite stream immediately!
  const currentState = liveBroadcastService.getState();
  if (currentState.isBroadcasting && currentState.streamId === streamId && currentState.compositeStream) {
    callbacks.onRemoteStream(currentState.compositeStream);
    if (currentState.lastSnapshotUrl && callbacks.onSnapshot) {
      callbacks.onSnapshot(currentState.lastSnapshotUrl);
    }
    if (currentState.canvasAspectRatio && callbacks.onAspectRatio) {
      callbacks.onAspectRatio(currentState.canvasAspectRatio);
    }
    if (currentState.isMobileStream !== undefined && callbacks.onMobileStream) {
      callbacks.onMobileStream(Boolean(currentState.isMobileStream));
    }
    if (callbacks.viewerUser && liveBroadcastService.getOnViewerJoined()) {
      try {
        liveBroadcastService.getOnViewerJoined()!(callbacks.viewerUser);
      } catch {}
    }
  }

  const viewerId = `viewer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let pc: RTCPeerConnection | null = null;
  let broadcastChan: BroadcastChannel | null = null;
  let realtimeChan: any = null;
  let isCleanedUp = false;
  const pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  let viewerMediaStream: MediaStream | null = null;

  const initPeerConnection = () => {
    if (pc) return pc;
    pc = new RTCPeerConnection({
      iceServers: GLOBAL_ICE_SERVERS,
    });

    pc.ontrack = event => {
      if (event.streams && event.streams[0]) {
        callbacks.onRemoteStream(event.streams[0]);
      } else if (event.track) {
        if (!viewerMediaStream) {
          viewerMediaStream = new MediaStream();
        }
        viewerMediaStream.addTrack(event.track);
        callbacks.onRemoteStream(viewerMediaStream);
      }
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        sendViewerSignal({
          type: 'ice_candidate',
          candidate: event.candidate,
          viewerId,
          fromViewer: true,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      callbacks.onConnectionStateChange?.(pc?.connectionState || 'disconnected');
    };

    return pc;
  };

  const sendViewerSignal = (payload: any) => {
    if (isCleanedUp) return;
    if (broadcastChan) {
      try {
        broadcastChan.postMessage(payload);
      } catch {}
    }
    if (realtimeChan) {
      try {
        realtimeChan.send({
          type: 'broadcast',
          event: 'signal',
          payload,
        });
      } catch {}
    }
  };

  const handleSignal = async (signal: any) => {
    if (isCleanedUp || !signal) return;

    if (signal.type === 'stream_ended' && signal.streamId === streamId) {
      callbacks.onStreamEnded?.();
      return;
    }

    if (signal.aspectRatio && callbacks.onAspectRatio) {
      callbacks.onAspectRatio(signal.aspectRatio);
    }

    if (signal.isMobileStream !== undefined && callbacks.onMobileStream) {
      callbacks.onMobileStream(Boolean(signal.isMobileStream));
    }

    if (signal.type === 'snapshot' && signal.dataUrl) {
      if (!signal.targetViewerId || signal.targetViewerId === viewerId) {
        if (streamId && typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`viralhub_livestream_thumb_${streamId}`, signal.dataUrl);
          } catch {}
        }
        callbacks.onSnapshot?.(signal.dataUrl);
      }
    }

    if (signal.targetViewerId !== viewerId) return;

    if (signal.type === 'offer' && signal.offer) {
      const peer = initPeerConnection();
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendViewerSignal({
          type: 'answer',
          answer,
          viewerId,
        });

        // Flush buffered remote ICE candidates
        if (pendingRemoteCandidates.length > 0) {
          for (const cand of pendingRemoteCandidates) {
            try {
              await peer.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.warn('Viewer failed to add buffered ICE candidate', err);
            }
          }
          pendingRemoteCandidates.length = 0;
        }
      } catch (err) {
        console.warn('Viewer failed to process offer/answer', err);
      }
    } else if (signal.type === 'ice_candidate' && signal.candidate) {
      const peer = initPeerConnection();
      if (peer.remoteDescription && peer.remoteDescription.type) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          console.warn('Viewer failed to add ICE candidate', err);
        }
      } else {
        // Buffer until offer is set
        pendingRemoteCandidates.push(signal.candidate);
      }
    }
  };

  // 1. Setup local BroadcastChannel for same-device cross-tab testing
  try {
    broadcastChan = new BroadcastChannel(`live_webrtc_${streamId}`);
    broadcastChan.onmessage = e => handleSignal(e.data);
  } catch {}

  // 2. Setup Supabase Realtime channel for cross-device testing
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      realtimeChan = supabase.channel(`live_webrtc_${streamId}`, {
        config: { broadcast: { ack: false, self: false } },
      });
      realtimeChan.on('broadcast', { event: 'signal' }, ({ payload }: { payload: any }) => {
        handleSignal(payload);
      });
      realtimeChan.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Announce join to host so host starts WebRTC offer
          sendViewerSignal({ type: 'viewer_join', viewerId, streamId, viewerUser: callbacks.viewerUser });
        }
      });
    } catch (e) {
      console.warn('Viewer realtime channel error', e);
    }
  }

  // Send initial join immediately
  sendViewerSignal({ type: 'viewer_join', viewerId, streamId, viewerUser: callbacks.viewerUser });

  // Retry join handshake up to 4 times every 2.5 seconds if remote stream has not arrived yet
  let joinAttempts = 0;
  let hasReceivedStream = false;
  const originalOnRemoteStream = callbacks.onRemoteStream;
  callbacks.onRemoteStream = (stream: MediaStream) => {
    hasReceivedStream = true;
    originalOnRemoteStream(stream);
  };

  const joinRetryTimer = window.setInterval(() => {
    if (isCleanedUp || hasReceivedStream) {
      clearInterval(joinRetryTimer);
      return;
    }
    joinAttempts++;
    if (joinAttempts <= 4) {
      sendViewerSignal({ type: 'viewer_join', viewerId, streamId, retry: joinAttempts, viewerUser: callbacks.viewerUser });
    } else {
      clearInterval(joinRetryTimer);
    }
  }, 2500);

  // Cleanup function
  return () => {
    isCleanedUp = true;
    clearInterval(joinRetryTimer);
    sendViewerSignal({ type: 'viewer_leave', viewerId, streamId });
    if (pc) {
      try {
        pc.close();
      } catch {}
      pc = null;
    }
    if (broadcastChan) {
      try {
        broadcastChan.close();
      } catch {}
      broadcastChan = null;
    }
    if (realtimeChan) {
      try {
        realtimeChan.unsubscribe();
      } catch {}
      realtimeChan = null;
    }
  };
};
