import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Matter from 'matter-js';
import { supabase } from '@/integrations/supabase/client';
import { getPlatformVisuals } from '@/lib/social-platforms';

interface SocialLink {
  id: string;
  name: string;
  handle: string;
  url: string;
  description: string | null;
  display_order: number;
}

type Piece =
  | {
      id: 'coah-name';
      kind: 'name';
      label: string;
    }
  | (SocialLink & {
      kind: 'link';
    });

const GITHUB_SOCIAL_LINK: SocialLink = {
  id: 'github-coah80',
  name: 'GitHub',
  handle: 'coah80',
  url: 'https://github.com/coah80',
  description: 'my github',
  display_order: 1,
};

const FALLBACK_SOCIAL_LINKS: SocialLink[] = [
  {
    id: 'fallback-kofi',
    name: 'Ko-Fi',
    handle: 'colevr',
    url: 'https://ko-fi.com/colevr',
    description: 'Donate to me, Commission me, or check out my portfolio!',
    display_order: 0,
  },
  {
    id: 'fallback-twitch',
    name: 'Twitch',
    handle: '@coahlive',
    url: 'https://www.twitch.tv/coahlive',
    description: 'i go live here sometimes',
    display_order: 2,
  },
  {
    id: 'fallback-youtube',
    name: 'YouTube',
    handle: 'coah80',
    url: 'https://www.youtube.com/@coah80',
    description: 'my youtube, maybe ill post some day...',
    display_order: 3,
  },
  {
    id: 'fallback-steam',
    name: 'Steam',
    handle: 'colevr',
    url: 'https://steamcommunity.com/id/colevryt/',
    description: 'my steam',
    display_order: 4,
  },
  {
    id: 'fallback-tiktok',
    name: 'TikTok',
    handle: 'coah.80',
    url: 'https://www.tiktok.com/@coah.80',
    description: 'my tiktok',
    display_order: 5,
  },
  {
    id: 'fallback-twitter',
    name: 'Twitter',
    handle: 'coah80',
    url: 'https://x.com/coah80',
    description: 'my twitter',
    display_order: 6,
  },
  {
    id: 'fallback-discord',
    name: 'Discord',
    handle: 'coah80',
    url: 'https://discord.gg/VZKzu63qJ3',
    description: 'my discord server',
    display_order: 7,
  },
  {
    id: 'fallback-email',
    name: 'Email',
    handle: 'coah@coah80.com',
    url: 'mailto:coah@coah80.com',
    description: 'business, sponsors, and questions',
    display_order: 8,
  },
];

const getPlatformColors = (name: string, url: string) => {
  const key = `${name} ${url}`.toLowerCase();

  if (key.includes('youtube')) return { solid: '#ff0000', accent: '#ff4b4b' };
  if (key.includes('twitch')) return { solid: '#9146ff', accent: '#a970ff' };
  if (key.includes('github')) return { solid: '#c9d1d9', accent: '#8b949e' };
  if (key.includes('discord')) return { solid: '#5865f2', accent: '#7983f5' };
  if (key.includes('steam')) return { solid: '#66c0f4', accent: '#86cef7' };
  if (key.includes('tiktok')) return { solid: '#fe2c55', accent: '#ff6f8c' };
  if (key.includes('ko-fi') || key.includes('kofi')) return { solid: '#13c3ff', accent: '#64d9ff' };
  if (key.includes('twitter') || key.includes('x.com')) return { solid: '#1d9bf0', accent: '#63b9f7' };
  if (key.includes('mail')) return { solid: '#0ea5e9', accent: '#67c7f4' };

  return { solid: '#bac2de', accent: '#7f849c' };
};

const WALL_SIZE = 200;
const MAX_SPEED = 40;
const MAX_ANGULAR_SPEED = 0.42;
const DESKTOP_GRAVITY_Y = 0.74;
const MOBILE_GRAVITY_SCALE = 0.56;
const MOBILE_GRAVITY_LIMIT = 0.72;
const WINDOW_SHAKE_THRESHOLD = 5.5;
const WINDOW_SHAKE_COOLDOWN = 85;
const WINDOW_SHAKE_VECTOR_SCALE = 32;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

type BodyMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

type DragState = {
  activeId: string;
  body: Matter.Body | null;
  offsetX: number;
  offsetY: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  velocityX: number;
  velocityY: number;
};

const normalizeSocialLinks = (links: SocialLink[]) =>
  links.map((link) => {
    const key = `${link.name} ${link.url}`.toLowerCase();
    if (key.includes('discord')) {
      return {
        ...link,
        url: 'https://discord.gg/VZKzu63qJ3',
      };
    }

    if (!key.includes('tiktok')) return link;

    return {
      ...link,
      handle: 'coah.80',
      url: 'https://www.tiktok.com/@coah.80',
    };
  });

const HomePage = () => {
  const sceneRef = useRef<HTMLElement | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const bodiesByIdRef = useRef(new Map<string, Matter.Body>());
  const physicsBodiesRef = useRef<Matter.Body[]>([]);
  const bodyMetricsRef = useRef(new Map<string, BodyMetrics>());
  const dragStateRef = useRef<DragState>({
    activeId: '',
    body: null,
    offsetX: 0,
    offsetY: 0,
    lastX: 0,
    lastY: 0,
    lastAt: 0,
    velocityX: 0,
    velocityY: 0,
  });
  const tiltPermissionRequestedRef = useRef(false);
  const motionGravityActiveRef = useRef(false);
  const lastHapticAtRef = useRef(0);
  const lastMotionSampleRef = useRef<{ x: number; y: number; z: number; at: number } | null>(null);
  const lastGravityVectorRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastTiltKickAtRef = useRef(0);
  const lastShakeAtRef = useRef(0);
  const clickStateRef = useRef({
    activeId: '',
    startX: 0,
    startY: 0,
    dragged: false,
    lastDraggedId: '',
    lastDraggedAt: 0,
    lastOpenedId: '',
    lastOpenedAt: 0,
  });
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(normalizeSocialLinks(FALLBACK_SOCIAL_LINKS));
  const [sceneVersion, setSceneVersion] = useState(0);

  const rotateForScreen = useCallback((rawX: number, rawY: number) => {
    const legacyOrientation = (window as Window & { orientation?: number }).orientation;
    const screenAngle = window.screen.orientation?.angle ?? legacyOrientation ?? 0;
    const normalizedAngle = ((screenAngle % 360) + 360) % 360;
    let x = rawX;
    let y = rawY;

    if (normalizedAngle === 90) {
      x = -rawY;
      y = rawX;
    } else if (normalizedAngle === 270) {
      x = rawY;
      y = -rawX;
    } else if (normalizedAngle === 180) {
      x = -rawX;
      y = -rawY;
    }

    return { x, y };
  }, []);

  const kickBodies = useCallback(
    (rawX: number, rawY: number, rawZ: number, strength: number, rotateWithScreen = true) => {
      const bodies = physicsBodiesRef.current;
      if (!bodies.length) return;

      const { x, y } = rotateWithScreen ? rotateForScreen(rawX, rawY) : { x: rawX, y: rawY };
      const impulseX = clamp(-x, -1.35, 1.35) * 14.5 * strength;
      const impulseY = clamp(-y, -1.35, 1.35) * 14.5 * strength;
      const zLift = -clamp(Math.abs(rawZ), 0, 1.35) * 7 * strength;

      for (const body of bodies) {
        const jitterX = (Math.random() - 0.5) * 3.9 * strength;
        const jitterY = (Math.random() - 0.5) * 3.9 * strength;

        Matter.Body.setVelocity(body, {
          x: clamp(body.velocity.x + impulseX + jitterX, -MAX_SPEED, MAX_SPEED),
          y: clamp(body.velocity.y + impulseY + zLift + jitterY, -MAX_SPEED, MAX_SPEED),
        });
        Matter.Body.setAngularVelocity(
          body,
          clamp(body.angularVelocity + (Math.random() - 0.5) * 0.36 * strength, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED),
        );
      }
    },
    [rotateForScreen],
  );

  useEffect(() => {
    let isMounted = true;

    const fetchLinks = async () => {
      const { data, error } = await supabase
        .from('social_links')
        .select('*')
        .eq('is_published', true)
        .order('display_order', { ascending: true });

      if (!isMounted || error || !data?.length) return;
      setSocialLinks(normalizeSocialLinks(data));
    };

    fetchLinks();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent | MouseEvent) => {
      const state = clickStateRef.current;
      if (!state.activeId) return;

      const moved = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (moved > 7) {
        state.dragged = true;
      }
    };

    const handleUp = () => {
      const state = clickStateRef.current;
      if (state.activeId && state.dragged) {
        state.lastDraggedId = state.activeId;
        state.lastDraggedAt = performance.now();
      }

      state.activeId = '';
      state.dragged = false;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let resizeTimer = window.setTimeout(() => undefined, 0);
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setSceneVersion((version) => version + 1);
      }, 140);
    });

    observer.observe(scene);

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    document.fonts?.ready.then(() => {
      if (!cancelled) {
        setSceneVersion((version) => version + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    const canUseMotion = 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
    if (!isTouchDevice || !canUseMotion) return;

    const applyScreenGravity = (rawX: number, rawY: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      const { x, y } = rotateForScreen(rawX, rawY);
      const nextGravity = {
        x: clamp(-x * MOBILE_GRAVITY_SCALE, -MOBILE_GRAVITY_LIMIT, MOBILE_GRAVITY_LIMIT),
        y: clamp(-y * MOBILE_GRAVITY_SCALE, -MOBILE_GRAVITY_LIMIT, MOBILE_GRAVITY_LIMIT),
      };
      const now = performance.now();
      const previousGravity = lastGravityVectorRef.current;

      engine.gravity.x = nextGravity.x;
      engine.gravity.y = nextGravity.y;

      if (previousGravity) {
        const deltaX = nextGravity.x - previousGravity.x;
        const deltaY = nextGravity.y - previousGravity.y;
        const delta = Math.hypot(deltaX, deltaY);

        if (delta > 0.14 && now - lastTiltKickAtRef.current > 70) {
          lastTiltKickAtRef.current = now;
          kickBodies(deltaX * 2.55, deltaY * 2.55, 0, clamp(delta * 3.25, 0.3, 1.45));
        }
      }

      lastGravityVectorRef.current = { ...nextGravity, at: now };
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      const gravity = event.accelerationIncludingGravity;
      if (!gravity || gravity.x == null || gravity.y == null) return;

      motionGravityActiveRef.current = true;
      applyScreenGravity(clamp(gravity.x / 9.8, -1, 1), clamp(-gravity.y / 9.8, -1, 1));

      const acceleration = event.acceleration;
      if (!acceleration || acceleration.x == null || acceleration.y == null) return;

      const now = performance.now();
      const x = acceleration.x;
      const y = acceleration.y;
      const z = acceleration.z ?? 0;
      const previous = lastMotionSampleRef.current;
      const movement = Math.hypot(x, y, z);
      const jerk = previous ? Math.hypot(x - previous.x, y - previous.y, z - previous.z) : 0;
      const shake = Math.max(movement, jerk * 0.85);
      const impulseSource = previous && jerk > movement * 0.75
        ? {
            x: x - previous.x,
            y: y - previous.y,
            z: z - previous.z,
          }
        : { x, y, z };

      lastMotionSampleRef.current = { x, y, z, at: now };

      if (shake < 4.1 || now - lastShakeAtRef.current < 65) return;

      lastShakeAtRef.current = now;
      kickBodies(
        impulseSource.x / 9.8,
        -impulseSource.y / 9.8,
        impulseSource.z / 9.8,
        clamp((shake - 3) / 9, 0.48, 2.15),
      );
      if ('vibrate' in navigator) {
        navigator.vibrate(12);
      }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (motionGravityActiveRef.current || event.beta == null || event.gamma == null) return;

      applyScreenGravity(
        Math.sin(event.gamma * (Math.PI / 180)),
        Math.sin(Math.PI / 4 + event.beta * (Math.PI / 180)),
      );
    };

    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('deviceorientation', handleOrientation);
      motionGravityActiveRef.current = false;
      lastMotionSampleRef.current = null;
      lastGravityVectorRef.current = null;
    };
  }, [kickBodies, rotateForScreen]);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    let frameId = 0;
    let lastSample: { x: number; y: number; vx: number; vy: number; at: number } | null = null;
    let lastKickAt = 0;
    const getWindowPosition = () => {
      const positionedWindow = window as Window & {
        screenLeft?: number;
        screenTop?: number;
      };

      return {
        x: positionedWindow.screenX ?? positionedWindow.screenLeft ?? 0,
        y: positionedWindow.screenY ?? positionedWindow.screenTop ?? 0,
      };
    };

    const sampleWindowMotion = () => {
      const { x, y } = getWindowPosition();
      const now = performance.now();

      if (lastSample) {
        const dt = Math.max(16, now - lastSample.at);
        const vx = ((x - lastSample.x) / dt) * 16.67;
        const vy = ((y - lastSample.y) / dt) * 16.67;
        const jerkX = vx - lastSample.vx;
        const jerkY = vy - lastSample.vy;
        const movement = Math.hypot(vx, vy);
        const jerk = Math.hypot(jerkX, jerkY);
        const shake = Math.max(movement * 0.65, jerk);

        if (shake > WINDOW_SHAKE_THRESHOLD && now - lastKickAt > WINDOW_SHAKE_COOLDOWN) {
          const useJerk = jerk > movement * 0.7;
          const sourceX = useJerk ? jerkX : vx;
          const sourceY = useJerk ? jerkY : vy;
          const strength = clamp((shake - 4) / 22, 0.32, 1.45);

          lastKickAt = now;
          kickBodies(
            sourceX / WINDOW_SHAKE_VECTOR_SCALE,
            sourceY / WINDOW_SHAKE_VECTOR_SCALE,
            shake / 48,
            strength,
            false,
          );
        }

        lastSample = { x, y, vx, vy, at: now };
      } else {
        lastSample = { x, y, vx: 0, vy: 0, at: now };
      }

      frameId = window.requestAnimationFrame(sampleWindowMotion);
    };

    frameId = window.requestAnimationFrame(sampleWindowMotion);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [kickBodies]);

  const requestDeviceTilt = useCallback(async () => {
    if (tiltPermissionRequestedRef.current) return;
    tiltPermissionRequestedRef.current = true;

    const MotionEvent = window.DeviceMotionEvent as DeviceMotionEventWithPermission | undefined;
    const OrientationEvent = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission | undefined;

    try {
      await Promise.all([
        MotionEvent?.requestPermission?.(),
        OrientationEvent?.requestPermission?.(),
      ].filter(Boolean));
    } catch {
      tiltPermissionRequestedRef.current = false;
    }
  }, []);

  const displayedSocialLinks = useMemo(() => {
    const hasGithub = socialLinks.some((link) => {
      const key = `${link.name} ${link.url}`.toLowerCase();
      return key.includes('github');
    });

    if (hasGithub) return socialLinks;

    return [...socialLinks, GITHUB_SOCIAL_LINK].sort((a, b) => a.display_order - b.display_order);
  }, [socialLinks]);

  const pieces = useMemo<Piece[]>(
    () => [
      { id: 'coah-name', kind: 'name', label: 'coah.' },
      ...displayedSocialLinks.map((link) => ({ ...link, kind: 'link' as const })),
    ],
    [displayedSocialLinks],
  );

  const registerElement = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) {
        elementsRef.current.set(id, node);
        return;
      }

      elementsRef.current.delete(id);
    },
    [],
  );

  const linkUrlById = useMemo(
    () => new Map(displayedSocialLinks.map((link) => [link.id, link.url])),
    [displayedSocialLinks],
  );

  const getScenePoint = (clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    if (!scene) return null;

    const sceneRect = scene.getBoundingClientRect();
    return {
      x: clientX - sceneRect.left,
      y: clientY - sceneRect.top,
    };
  };

  const findMetricsHit = (clientX: number, clientY: number, allowedIds: Set<string>, padding = 6) => {
    const point = getScenePoint(clientX, clientY);
    if (!point) return '';

    let bestHit: { id: string; distance: number } | null = null;

    bodyMetricsRef.current.forEach((metrics, id) => {
      if (!allowedIds.has(id)) return;

      const dx = point.x - metrics.x;
      const dy = point.y - metrics.y;
      const cos = Math.cos(-metrics.angle);
      const sin = Math.sin(-metrics.angle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;
      const inside =
        Math.abs(localX) <= metrics.width / 2 + padding &&
        Math.abs(localY) <= metrics.height / 2 + padding;

      if (!inside) return;

      const distance = Math.hypot(dx, dy);
      if (!bestHit || distance < bestHit.distance) {
        bestHit = {
          id,
          distance,
        };
      }
    });

    return bestHit?.id || '';
  };

  const findDraggableHit = (clientX: number, clientY: number) => {
    const point = getScenePoint(clientX, clientY);
    if (!point) return '';

    let bestHit: { id: string; distance: number } | null = null;

    bodiesByIdRef.current.forEach((body, id) => {
      const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
      if (!Matter.Query.point(parts, point).length) return;

      const distance = Math.hypot(point.x - body.position.x, point.y - body.position.y);
      if (!bestHit || distance < bestHit.distance) {
        bestHit = { id, distance };
      }
    });

    if (bestHit) return bestHit.id;

    return findMetricsHit(clientX, clientY, new Set(pieces.map((piece) => piece.id)), 8);
  };

  const clearDragState = () => {
    dragStateRef.current = {
      activeId: '',
      body: null,
      offsetX: 0,
      offsetY: 0,
      lastX: 0,
      lastY: 0,
      lastAt: 0,
      velocityX: 0,
      velocityY: 0,
    };
  };

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const engine = Matter.Engine.create({
      gravity: {
        x: 0,
        y: DESKTOP_GRAVITY_Y,
      },
    });
    engineRef.current = engine;
    const runner = Matter.Runner.create();
    const bounds = scene.getBoundingClientRect();
    const width = Math.max(bounds.width, 320);
    const height = Math.max(bounds.height, 420);
    const floorInset = window.matchMedia('(pointer: coarse)').matches ? 22 : 0;
    const playHeight = Math.max(360, height - floorInset);
    const wallOptions: Matter.IChamferableBodyDefinition = {
      isStatic: true,
      restitution: 0,
      friction: 0.2,
      render: { visible: false },
    };
    const walls = [
      Matter.Bodies.rectangle(width / 2, playHeight + WALL_SIZE / 2, width + WALL_SIZE * 2, WALL_SIZE, wallOptions),
      Matter.Bodies.rectangle(width / 2, -WALL_SIZE / 2, width + WALL_SIZE * 2, WALL_SIZE, wallOptions),
      Matter.Bodies.rectangle(-WALL_SIZE / 2, playHeight / 2, WALL_SIZE, playHeight + WALL_SIZE * 2, wallOptions),
      Matter.Bodies.rectangle(width + WALL_SIZE / 2, playHeight / 2, WALL_SIZE, playHeight + WALL_SIZE * 2, wallOptions),
    ];
    const bodiesById = new Map<string, Matter.Body>();
    const bodySizesById = new Map<string, { width: number; height: number }>();
    const visualOffsetsById = new Map<string, { x: number; y: number }>();

    const createNameBody = (x: number, y: number, pieceWidth: number, pieceHeight: number) => {
      const stroke = Math.max(13, pieceHeight * 0.12);
      const letterHeight = pieceHeight * 0.54;
      const letterWidth = pieceWidth * 0.15;
      const topY = y - letterHeight * 0.28;
      const midY = y + letterHeight * 0.02;
      const bottomY = y + letterHeight * 0.31;
      const verticalHeight = letterHeight * 0.78;
      const horizontalWidth = letterWidth * 0.74;
      const dotSize = Math.max(16, pieceHeight * 0.15);
      const letterCenters = [
        x - pieceWidth * 0.38,
        x - pieceWidth * 0.19,
        x + pieceWidth * 0.01,
        x + pieceWidth * 0.22,
      ];
      const letterOptions: Matter.IChamferableBodyDefinition = {
        chamfer: { radius: Math.min(9, stroke / 2) },
        density: 0.001,
        friction: 0.2,
        frictionAir: 0.01,
        restitution: 0,
      };
      const createVertical = (centerX: number, centerY = midY, height = verticalHeight) =>
        Matter.Bodies.rectangle(centerX, centerY, stroke, height, letterOptions);
      const createHorizontal = (centerX: number, centerY: number, width = horizontalWidth) =>
        Matter.Bodies.rectangle(centerX, centerY, width, stroke, letterOptions);
      const parts = [
        createVertical(letterCenters[0] - letterWidth * 0.3),
        createHorizontal(letterCenters[0] + letterWidth * 0.06, topY),
        createHorizontal(letterCenters[0] + letterWidth * 0.06, bottomY),

        createVertical(letterCenters[1] - letterWidth * 0.32),
        createVertical(letterCenters[1] + letterWidth * 0.32),
        createHorizontal(letterCenters[1], topY),
        createHorizontal(letterCenters[1], bottomY),

        createVertical(letterCenters[2] + letterWidth * 0.32),
        createVertical(letterCenters[2] - letterWidth * 0.26, y + letterHeight * 0.12, letterHeight * 0.42),
        createHorizontal(letterCenters[2], topY),
        createHorizontal(letterCenters[2] + letterWidth * 0.02, midY),
        createHorizontal(letterCenters[2] + letterWidth * 0.02, bottomY),

        createVertical(letterCenters[3] - letterWidth * 0.33),
        createVertical(letterCenters[3] + letterWidth * 0.28, y + letterHeight * 0.13, letterHeight * 0.52),
        createHorizontal(letterCenters[3], midY),

        Matter.Bodies.circle(x + pieceWidth * 0.43, y + letterHeight * 0.36, dotSize / 2, {
          density: 0.001,
          friction: 0.2,
          frictionAir: 0.01,
          restitution: 0,
        }),
      ];

      const body = Matter.Body.create({
        parts,
        label: 'coah-name',
        density: 0.001,
        friction: 0.2,
        frictionAir: 0.01,
        restitution: 0,
      });

      return {
        body,
        visualOffset: {
          x: x - body.position.x,
          y: y - body.position.y,
        },
      };
    };

    const bodies = pieces
      .map((piece, index) => {
        const element = elementsRef.current.get(piece.id);
        if (!element) return null;

        element.style.opacity = '0';
        element.style.left = '0px';
        element.style.top = '0px';
        element.style.transform = 'none';
        const rect = element.getBoundingClientRect();
        const measuredWidth = element.offsetWidth || rect.width;
        const measuredHeight = element.offsetHeight || rect.height;
        const pieceWidth = piece.kind === 'name' ? Math.max(measuredWidth, 230) : Math.max(measuredWidth, 56);
        const pieceHeight = piece.kind === 'name' ? Math.max(measuredHeight, 92) : Math.max(measuredHeight, 56);
        const column = index % 3;
        const row = Math.floor(index / 3);
        const xBase = width * (0.28 + column * 0.22);
        const x = clamp(xBase + (row % 2 === 0 ? -18 : 18), pieceWidth / 2 + 12, width - pieceWidth / 2 - 12);
        const y = piece.kind === 'name' ? Math.min(120, playHeight * 0.2) : 120 + row * 72 + column * 14;
        let body: Matter.Body;

        if (piece.kind === 'name') {
          const nameBody = createNameBody(x, y, pieceWidth, pieceHeight);
          body = nameBody.body;
          visualOffsetsById.set(piece.id, nameBody.visualOffset);
        } else {
          body = Matter.Bodies.rectangle(x, y, pieceWidth, pieceHeight, {
                chamfer: { radius: 8 },
                density: 0.001,
                friction: 0.2,
                frictionAir: 0.01,
                restitution: 0,
                label: piece.id,
              });
          visualOffsetsById.set(piece.id, { x: 0, y: 0 });
        }

        Matter.Body.setAngle(body, (index % 2 === 0 ? -1 : 1) * (0.06 + index * 0.008));
        Matter.Body.setVelocity(body, {
          x: (column - 1) * 1.4,
          y: -1.2 + row * 0.35,
        });
        Matter.Body.setAngularVelocity(body, (index % 2 === 0 ? -1 : 1) * 0.025);
        bodiesById.set(piece.id, body);
        bodySizesById.set(piece.id, { width: pieceWidth, height: pieceHeight });

        return body;
      })
      .filter(Boolean) as Matter.Body[];

    physicsBodiesRef.current = bodies;
    bodiesByIdRef.current = bodiesById;

    const pulseHaptic = (event: Matter.IEventCollision<Matter.Engine>) => {
      const canVibrate = window.matchMedia('(pointer: coarse)').matches && 'vibrate' in navigator;
      if (!canVibrate) return;

      const hasImpact = event.pairs.some((pair) => {
        const bodyA = pair.bodyA.parent || pair.bodyA;
        const bodyB = pair.bodyB.parent || pair.bodyB;
        const hitsWall = bodyA.isStatic || bodyB.isStatic;
        const hitsBlock = !bodyA.isStatic && !bodyB.isStatic;
        if (!hitsWall && !hitsBlock) return false;

        const relativeSpeed = Math.hypot(
          bodyA.velocity.x - bodyB.velocity.x,
          bodyA.velocity.y - bodyB.velocity.y,
        );

        return relativeSpeed > (hitsWall ? 1.15 : 1.75);
      });

      if (!hasImpact) return;

      const now = performance.now();
      if (now - lastHapticAtRef.current < 85) return;

      lastHapticAtRef.current = now;
      navigator.vibrate(12);
    };

    const limitVelocity = () => {
      for (const body of bodies) {
        if (body.speed > MAX_SPEED) {
          const scale = MAX_SPEED / body.speed;
          Matter.Body.setVelocity(body, {
            x: body.velocity.x * scale,
            y: body.velocity.y * scale,
          });
        }

        if (Math.abs(body.angularVelocity) > MAX_ANGULAR_SPEED) {
          Matter.Body.setAngularVelocity(body, Math.sign(body.angularVelocity) * MAX_ANGULAR_SPEED);
        }
      }
    };

    Matter.Events.on(engine, 'beforeUpdate', limitVelocity);
    Matter.Events.on(engine, 'collisionStart', pulseHaptic);
    Matter.Composite.add(engine.world, [...walls, ...bodies]);
    Matter.Runner.run(runner, engine);

    let frameId = 0;
    const syncElements = () => {
      bodiesById.forEach((body, id) => {
        const element = elementsRef.current.get(id);
        if (!element) return;

        const offset = visualOffsetsById.get(id) ?? { x: 0, y: 0 };
        const cos = Math.cos(body.angle);
        const sin = Math.sin(body.angle);
        const visualX = body.position.x + offset.x * cos - offset.y * sin;
        const visualY = body.position.y + offset.x * sin + offset.y * cos;
        const size = bodySizesById.get(id);
        const renderedWidth = element.offsetWidth || size?.width || 0;
        const renderedHeight = element.offsetHeight || size?.height || 0;

        element.style.left = `${visualX - renderedWidth / 2}px`;
        element.style.top = `${visualY - renderedHeight / 2}px`;
        element.style.transform = `rotate(${body.angle}rad)`;
        element.style.opacity = '1';

        if (size) {
          bodyMetricsRef.current.set(id, {
            x: visualX,
            y: visualY,
            width: renderedWidth || size.width,
            height: renderedHeight || size.height,
            angle: body.angle,
          });
        }
      });

      frameId = window.requestAnimationFrame(syncElements);
    };

    frameId = window.requestAnimationFrame(syncElements);

    return () => {
      window.cancelAnimationFrame(frameId);
      Matter.Events.off(engine, 'beforeUpdate', limitVelocity);
      Matter.Events.off(engine, 'collisionStart', pulseHaptic);
      Matter.Runner.stop(runner);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      clearDragState();
      bodiesByIdRef.current.clear();
      physicsBodiesRef.current = [];
      bodyMetricsRef.current.clear();
    };
  }, [pieces, sceneVersion]);

  const openLink = (url: string) => {
    if (url.startsWith('mailto:')) {
      window.location.href = url;
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleScenePointerDownCapture = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      requestDeviceTilt();
    }

    const id = findDraggableHit(event.clientX, event.clientY);
    if (!id) return;

    const point = getScenePoint(event.clientX, event.clientY);
    const body = bodiesByIdRef.current.get(id) ?? null;
    if (point && body) {
      dragStateRef.current = {
        activeId: id,
        body,
        offsetX: body.position.x - point.x,
        offsetY: body.position.y - point.y,
        lastX: body.position.x,
        lastY: body.position.y,
        lastAt: performance.now(),
        velocityX: 0,
        velocityY: 0,
      };
      Matter.Sleeping.set(body, false);
      Matter.Body.setAngularVelocity(body, body.angularVelocity * 0.4);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    clickStateRef.current.activeId = id;
    clickStateRef.current.startX = event.clientX;
    clickStateRef.current.startY = event.clientY;
    clickStateRef.current.dragged = false;
    event.preventDefault();
  };

  const handleScenePointerMoveCapture = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState.body) return;

    const point = getScenePoint(event.clientX, event.clientY);
    if (!point) return;

    const nextX = point.x + dragState.offsetX;
    const nextY = point.y + dragState.offsetY;
    const now = performance.now();
    const dt = Math.max(16, now - dragState.lastAt);
    const velocityX = clamp(((nextX - dragState.lastX) / dt) * 16.67, -MAX_SPEED, MAX_SPEED);
    const velocityY = clamp(((nextY - dragState.lastY) / dt) * 16.67, -MAX_SPEED, MAX_SPEED);
    const clickState = clickStateRef.current;

    if (Math.hypot(event.clientX - clickState.startX, event.clientY - clickState.startY) > 7) {
      clickState.dragged = true;
    }

    Matter.Body.setPosition(dragState.body, { x: nextX, y: nextY });
    Matter.Body.setVelocity(dragState.body, { x: velocityX, y: velocityY });

    dragState.lastX = nextX;
    dragState.lastY = nextY;
    dragState.lastAt = now;
    dragState.velocityX = velocityX;
    dragState.velocityY = velocityY;

    event.preventDefault();
  };

  const maybeOpenSceneLink = (
    event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => {
    const state = clickStateRef.current;
    const moved = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    const url = linkUrlById.get(state.activeId);
    const recentlyOpened = state.lastOpenedId === state.activeId && performance.now() - state.lastOpenedAt < 700;

    if (url && !recentlyOpened && !state.dragged && moved <= 9) {
      event.preventDefault();
      event.stopPropagation();
      state.lastOpenedId = state.activeId;
      state.lastOpenedAt = performance.now();
      openLink(url);
    }
  };

  const handleScenePointerUpCapture = (event: React.PointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (dragState.body) {
      Matter.Body.setVelocity(dragState.body, {
        x: dragState.velocityX,
        y: dragState.velocityY,
      });
      clearDragState();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    maybeOpenSceneLink(event);
  };

  const handleScenePointerCancelCapture = (event: React.PointerEvent<HTMLElement>) => {
    clearDragState();
    clickStateRef.current.activeId = '';
    clickStateRef.current.dragged = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleLinkClick = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    const state = clickStateRef.current;
    const recentlyDragged = state.lastDraggedId === id && performance.now() - state.lastDraggedAt < 450;
    const recentlyOpened = state.lastOpenedId === id && performance.now() - state.lastOpenedAt < 700;

    if (state.dragged || recentlyDragged || recentlyOpened) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <main
      ref={sceneRef}
      aria-label="coah links gravity scene"
      onPointerDownCapture={handleScenePointerDownCapture}
      onPointerMoveCapture={handleScenePointerMoveCapture}
      onPointerUpCapture={handleScenePointerUpCapture}
      onPointerCancelCapture={handleScenePointerCancelCapture}
      className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full overflow-hidden overscroll-none bg-ctp-base text-ctp-text touch-none select-none"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 bottom-10 h-px bg-ctp-surface1/50" />
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-ctp-crust/35" />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center whitespace-nowrap font-heading text-2xl font-black text-ctp-text/15 sm:text-4xl md:text-5xl"
      >
        18 - bad coder
      </div>

      {pieces.map((piece) => {
        if (piece.kind === 'name') {
          return (
            <div
              key={piece.id}
              ref={registerElement(piece.id)}
              className="pointer-events-none absolute left-0 top-0 z-10 cursor-grab whitespace-nowrap font-heading text-7xl font-black leading-none text-ctp-text opacity-0 active:cursor-grabbing sm:text-8xl md:text-9xl lg:text-[10rem]"
            >
              coah<span className="text-ctp-mauve">.</span>
            </div>
          );
        }

        const { icon: IconComponent } = getPlatformVisuals(piece.name, piece.url);
        const colors = getPlatformColors(piece.name, piece.url);

        return (
          <a
            key={piece.id}
            ref={registerElement(piece.id)}
            href={piece.url}
            target={piece.url.startsWith('mailto:') ? undefined : '_blank'}
            rel={piece.url.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
            onClick={handleLinkClick(piece.id)}
            onDragStart={(event) => event.preventDefault()}
            className="pointer-events-none group absolute left-0 top-0 z-10 grid h-14 w-14 cursor-grab place-items-center rounded-lg border bg-ctp-mantle text-left opacity-0 transition-colors hover:bg-ctp-surface0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ctp-mauve active:cursor-grabbing sm:flex sm:h-auto sm:min-h-[4.5rem] sm:w-[21rem] sm:items-center sm:gap-3 sm:px-3 sm:py-3"
            aria-label={`${piece.name}: ${piece.handle}`}
            data-gravity-link-id={piece.id}
            draggable={false}
            style={{
              borderColor: colors.accent,
            }}
          >
            <span className="pointer-events-none grid h-9 w-9 flex-none place-items-center">
              <IconComponent className="h-5 w-5" style={{ color: colors.solid }} />
            </span>
            <span className="pointer-events-none hidden min-w-0 flex-1 sm:block">
              <span className="block truncate font-data text-base font-bold leading-tight text-ctp-text">
                {piece.name}
              </span>
              <span className="block truncate font-body text-sm leading-tight text-ctp-overlay1">
                {piece.handle}
              </span>
            </span>
          </a>
        );
      })}
    </main>
  );
};

export default HomePage;
