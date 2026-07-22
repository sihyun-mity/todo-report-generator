import type { BackdropEffectFactory } from '@/hooks';

// 커밋 그래프 성좌 이펙트.
// git 그래프의 커밋 점/merge 링 노드들이 부유하며 가까운 노드끼리 브랜치 컬러 선으로 이어진다.
// 커서 = HEAD(인력 + 연결선), 클릭 = commit(리플 + 랜덤 해시), 몇 초마다 임의 노드가 펄스를 낸다.

type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseVx: number;
  baseVy: number;
  radius: number;
  hollow: boolean;
  branchIndex: number;
  twinklePhase: number;
};

type Ripple = { x: number; y: number; age: number };

type HashLabel = { x: number; y: number; text: string; age: number };

type Palette = {
  branches: ReadonlyArray<string>;
  nodeAlpha: number;
  linkAlpha: number;
  cursorLinkAlpha: number;
  glow: string;
  label: string;
};

const LIGHT_PALETTE: Palette = {
  branches: ['37,99,235', '5,150,105', '124,58,237', '217,119,6'],
  nodeAlpha: 0.38,
  linkAlpha: 0.14,
  cursorLinkAlpha: 0.3,
  glow: '37,99,235',
  label: '100,116,139',
};

const DARK_PALETTE: Palette = {
  branches: ['96,165,250', '52,211,153', '167,139,250', '251,191,36'],
  nodeAlpha: 0.55,
  linkAlpha: 0.2,
  cursorLinkAlpha: 0.42,
  glow: '96,165,250',
  label: '148,163,184',
};

const LINK_DISTANCE = 110;
const CURSOR_LINK_DISTANCE = 160;
const CURSOR_PULL_DISTANCE = 180;
const WRAP_MARGIN = 40;
const MAX_NODES = 80;
const MIN_NODES = 24;
const AREA_PER_NODE = 26000;
const HASH_CHARS = '0123456789abcdef';

function randomHash(): string {
  let hash = '';
  for (let i = 0; i < 7; i += 1) {
    hash += HASH_CHARS[Math.floor(Math.random() * HASH_CHARS.length)];
  }
  return hash;
}

function createNode(width: number, height: number): Node {
  const angle = Math.random() * Math.PI * 2;
  const speed = 6 + Math.random() * 12; // px/s — 아주 느린 부유
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    baseVx: Math.cos(angle) * speed,
    baseVy: Math.sin(angle) * speed,
    radius: 1.4 + Math.random() * 1.8,
    hollow: Math.random() < 0.22,
    branchIndex: Math.floor(Math.random() * LIGHT_PALETTE.branches.length),
    twinklePhase: Math.random() * Math.PI * 2,
  };
}

export const createCommitConstellation: BackdropEffectFactory = (env) => {
  const { ctx, size, pointer } = env;
  let nodes: Array<Node> = [];
  const ripples: Array<Ripple> = [];
  const hashLabels: Array<HashLabel> = [];
  let nextAmbientPulse = 2 + Math.random() * 3;

  const syncNodeCount = () => {
    const targetCount = Math.max(
      MIN_NODES,
      Math.min(MAX_NODES, Math.round((size.width * size.height) / AREA_PER_NODE))
    );
    while (nodes.length < targetCount) nodes.push(createNode(size.width, size.height));
    if (nodes.length > targetCount) nodes = nodes.slice(0, targetCount);
  };

  syncNodeCount();

  return {
    resize: syncNodeCount,

    pointerDown: (x, y) => {
      ripples.push({ x, y, age: 0 });
      hashLabels.push({ x, y, text: randomHash(), age: 0 });
      for (const node of nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < 140) {
          const impulse = ((140 - dist) / 140) * 110;
          node.vx += (dx / dist) * impulse;
          node.vy += (dy / dist) * impulse;
        }
      }
    },

    frame: (dt, elapsed) => {
      const palette = env.theme() === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
      const { width, height } = size;

      for (const node of nodes) {
        // 기본 부유 속도로 서서히 복원 (커서 인력·클릭 반동에서 회복)
        const relax = Math.min(1, dt * 0.8);
        node.vx += (node.baseVx - node.vx) * relax;
        node.vy += (node.baseVy - node.vy) * relax;

        if (pointer.active) {
          const dx = pointer.x - node.x;
          const dy = pointer.y - node.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1 && dist < CURSOR_PULL_DISTANCE) {
            const pull = 42 * (1 - dist / CURSOR_PULL_DISTANCE);
            node.vx += (dx / dist) * pull * dt;
            node.vy += (dy / dist) * pull * dt;
          }
        }

        node.x += node.vx * dt;
        node.y += node.vy * dt;

        if (node.x < -WRAP_MARGIN) node.x = width + WRAP_MARGIN;
        if (node.x > width + WRAP_MARGIN) node.x = -WRAP_MARGIN;
        if (node.y < -WRAP_MARGIN) node.y = height + WRAP_MARGIN;
        if (node.y > height + WRAP_MARGIN) node.y = -WRAP_MARGIN;
      }

      // 몇 초에 한 번 임의의 노드가 스스로 "커밋" 펄스를 낸다 — 커서가 없어도 살아있는 느낌
      nextAmbientPulse -= dt;
      if (nextAmbientPulse <= 0 && nodes.length > 0) {
        const node = nodes[Math.floor(Math.random() * nodes.length)];
        ripples.push({ x: node.x, y: node.y, age: 0 });
        nextAmbientPulse = 2.5 + Math.random() * 3.5;
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.abs(dx) > LINK_DISTANCE || Math.abs(dy) > LINK_DISTANCE) continue;
          const dist = Math.hypot(dx, dy);
          if (dist >= LINK_DISTANCE) continue;
          const alpha = (1 - dist / LINK_DISTANCE) * palette.linkAlpha;
          ctx.strokeStyle = `rgba(${palette.branches[a.branchIndex]},${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      if (pointer.active) {
        // 커서(HEAD) 주변 소프트 글로우
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 90);
        glow.addColorStop(0, `rgba(${palette.glow},0.06)`);
        glow.addColorStop(1, `rgba(${palette.glow},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(pointer.x - 90, pointer.y - 90, 180, 180);

        for (const node of nodes) {
          const dist = Math.hypot(node.x - pointer.x, node.y - pointer.y);
          if (dist >= CURSOR_LINK_DISTANCE) continue;
          const alpha = (1 - dist / CURSOR_LINK_DISTANCE) * palette.cursorLinkAlpha;
          ctx.strokeStyle = `rgba(${palette.branches[node.branchIndex]},${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(node.x, node.y);
          ctx.stroke();
        }
      }

      for (const node of nodes) {
        const twinkle = 0.75 + 0.25 * Math.sin(elapsed * 1.3 + node.twinklePhase);
        const alpha = palette.nodeAlpha * twinkle;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        if (node.hollow) {
          ctx.strokeStyle = `rgba(${palette.branches[node.branchIndex]},${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${palette.branches[node.branchIndex]},${alpha})`;
          ctx.fill();
        }
      }

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const ripple = ripples[i];
        ripple.age += dt;
        const progress = ripple.age / 1.1;
        if (progress >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${palette.glow},${0.3 * (1 - progress)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, 6 + progress * 42, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      for (let i = hashLabels.length - 1; i >= 0; i -= 1) {
        const label = hashLabels[i];
        label.age += dt;
        const progress = label.age / 1.4;
        if (progress >= 1) {
          hashLabels.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(${palette.label},${0.7 * (1 - progress)})`;
        ctx.fillText(label.text, label.x, label.y - 14 - progress * 26);
      }
    },
  };
};
