import React, {useEffect, useState} from 'react';
import {motion, cubicBezier} from 'framer-motion';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const INK = '#202522';
const BG = '#f7f7f3';
const TEAL = '#087f71';
const TIMES = [0, 7, 17, 26, 37, 48, 56, 60];
const smoothCamera = cubicBezier(0.42, 0, 0.58, 1);
const softEntrance = cubicBezier(0.22, 0.61, 0.36, 1);
const clamp = (n) => Math.max(0, Math.min(1, n));

// Continuous camera keyframes preserve the illustrated scene crossfades.
// Small pushes reveal the graph; gentle pulls restore the wider context.
const CAMERA = [
  {t: 0, scale: 1.015, x: 0, y: 0, ox: 0.5, oy: 0.44},
  {t: 6.65, scale: 1.070, x: 6, y: -10, ox: 0.5, oy: 0.44},
  {t: 7.55, scale: 1.035, x: 4, y: 0, ox: 0.51, oy: 0.44},
  {t: 16.65, scale: 1.085, x: 8, y: -12, ox: 0.51, oy: 0.44},
  {t: 17.55, scale: 1.045, x: 0, y: 0, ox: 0.5, oy: 0.46},
  {t: 25.65, scale: 1.110, x: 0, y: -8, ox: 0.5, oy: 0.46},
  {t: 26.55, scale: 1.100, x: 0, y: -8, ox: 0.5, oy: 0.46},
  {t: 36.65, scale: 1.035, x: 0, y: 0, ox: 0.5, oy: 0.46},
  {t: 37.55, scale: 1.035, x: 0, y: 0, ox: 0.5, oy: 0.44},
  {t: 47.65, scale: 1.088, x: 0, y: -10, ox: 0.5, oy: 0.44},
  {t: 48.55, scale: 1.080, x: 8, y: -6, ox: 0.505, oy: 0.46},
  {t: 55.65, scale: 1.035, x: 0, y: 0, ox: 0.5, oy: 0.46},
  {t: 56.55, scale: 1.075, x: 0, y: -8, ox: 0.5, oy: 0.46},
  {t: 60, scale: 1.020, x: 0, y: 0, ox: 0.5, oy: 0.46},
];

export function cameraAt(t) {
  const last = CAMERA[CAMERA.length - 1];
  if (t >= last.t) return last;
  const index = CAMERA.findIndex((point, i) => i < CAMERA.length - 1 && t >= point.t && t < CAMERA[i + 1].t);
  const a = CAMERA[Math.max(0, index)];
  const b = CAMERA[Math.max(0, index) + 1];
  const p = smoothCamera(clamp((t - a.t) / (b.t - a.t)));
  return Object.fromEntries(['scale', 'x', 'y', 'ox', 'oy'].map((key) => [key, a[key] + (b[key] - a[key]) * p]));
}

function Caption({cue, time}) {
  if (!cue) return null;
  const enter = softEntrance(clamp((time - cue.start) / 0.12));
  const exit = softEntrance(clamp((cue.end - time) / 0.09));
  return <motion.div initial={false} style={{
    position: 'absolute', bottom: 94, left: 230, right: 230,
    display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    opacity: Math.min(enter, exit), y: 5 * (1 - enter),
  }}>
    <div style={{
      backgroundColor: 'rgba(236, 239, 232, 0.98)',
      border: '2px solid rgba(220, 226, 220, 0.8)', borderRadius: 36,
      padding: '22px 76px 25px', maxWidth: 3220, textAlign: 'center',
      color: INK, fontSize: 64, lineHeight: 1.23, fontWeight: 400,
      whiteSpace: 'pre-line', boxShadow: '0 6px 22px rgba(32, 37, 34, 0.035)',
    }}>{cue.text}</div>
  </motion.div>;
}

const panel = {background: '#fff', border: '3px solid #dce2dc', borderRadius: 42, boxShadow: '0 18px 55px #2025220a'};
const easeIn = (time, at, duration = 0.6) => softEntrance(clamp((time - at) / duration));
const typed = (text, time, at, duration) => text.slice(0, Math.floor(text.length * clamp((time - at) / duration)));

function Cursor({x, y, time, clickAt}) {
  const click = Math.max(0, 1 - Math.abs(time - clickAt) / 0.5);
  return <div style={{position: 'absolute', left: x, top: y, zIndex: 8, transform: `scale(${1 - click * 0.2})`}}>
    {click > 0 && <div style={{position: 'absolute', left: -36, top: -36, width: 90 + click * 60, height: 90 + click * 60, border: '5px solid #087f7180', borderRadius: '50%', opacity: click}} />}
    <svg width="88" height="108" viewBox="0 0 44 54"><path d="M4 3L38 30L22 33L17 49L4 3Z" fill={INK} stroke="white" strokeWidth="3"/></svg>
  </div>;
}

function SharedGraph({time, scene, top = 620, left = 1680, width = 1920}) {
  const forgotten = scene >= 3 && time >= 32;
  const britishAt = scene === 0 ? 0.8 : 13.2;
  const dashAt = scene === 0 ? 2.4 : 14.4;
  const nodes = [
    {id: 'english', x: 385, y: 250, label: 'British English', kind: 'Writing preference', at: britishAt, origin: 'From your prompt'},
    {id: 'dash', x: 1430, y: 265, label: 'Use em dashes', kind: 'Writing preference', at: dashAt, origin: 'From your prompt', removed: forgotten},
    {id: 'concise', x: 1430, y: 860, label: 'Prefer concise replies', kind: 'Communication', at: 50.05, origin: 'From another chat'},
    {id: 'friday', x: 380, y: 850, label: 'Deploy on Fridays', kind: 'Workflow', at: 52.0, origin: 'From your CLI prompt'},
  ];
  const root = {x: 920, y: 560};
  const present = nodes.filter(n => time >= n.at && !n.removed);
  const selected = scene === 5 && time >= 51 ? 'concise' : scene === 3 && time >= 30 && time < 32 ? 'dash' : 'english';
  return <motion.div initial={false} style={{...panel, position: 'absolute', left, top, width, height: 1160, overflow: 'hidden', opacity: easeIn(time, TIMES[scene] + 0.15), y: 24 * (1 - easeIn(time, TIMES[scene] + 0.15))}}>
    <div style={{height: 122, padding: '32px 48px', borderBottom: '2px solid #e6ebe5', display: 'flex', alignItems: 'center', gap: 20}}>
      <span style={{width: 18, height: 18, background: TEAL, borderRadius: '50%', opacity: 0.55 + 0.45 * Math.sin(time * 3) ** 2}}/>
      <strong style={{fontSize: 43}}>Agent memory</strong>
      <span style={{fontSize: 31, color: '#707872', marginLeft: 'auto'}}>One shared graph · {present.length} memories</span>
    </div>
    <svg width="1920" height="1020" viewBox="0 0 1920 1020" style={{position: 'absolute', top: 110, left: 0, width: '100%'}}>
      <defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="2.3" fill="#dfe6df"/></pattern></defs>
      <rect width="1920" height="1020" fill="url(#grid)"/>
      {nodes.map((n, i) => {
        const a = easeIn(time, n.at); const hide = n.removed ? 1 - easeIn(time, 32, 0.8) : 1;
        const px = root.x + (n.x - root.x) * a, py = root.y + (n.y - root.y) * a;
        const p = (time * 0.28 + i * 0.21) % 1;
        return <g key={n.id} opacity={a * hide}>
          <path d={`M${root.x} ${root.y} Q${(root.x + n.x) / 2} ${root.y} ${n.x} ${n.y}`} fill="none" stroke="#8cbdb2" strokeWidth="5" strokeDasharray={n.removed ? '15 12' : undefined}/>
          <circle cx={(1 - p) ** 2 * root.x + 2 * (1 - p) * p * ((root.x + n.x) / 2) + p * p * n.x} cy={(1 - p) ** 2 * root.y + 2 * (1 - p) * p * root.y + p * p * n.y} r="11" fill={TEAL} opacity="0.85"/>
          <g transform={`translate(${px} ${py + Math.sin(time * 1.1 + i) * 5}) scale(${0.8 + a * 0.2})`}>
            <rect x="-270" y="-85" width="540" height="170" rx="29" fill={selected === n.id ? '#e7f5ef' : 'white'} stroke={selected === n.id ? TEAL : '#aebfb5'} strokeWidth={selected === n.id ? 5 : 3}/>
            <text x="-232" y="-34" fontSize="27" fill="#707872">{n.kind}</text>
            <text x="-232" y="15" fontSize="39" fontWeight="700" fill={INK}>{n.label}</text>
            <text x="-232" y="60" fontSize="25" fill="#707872">{n.origin}</text>
          </g>
        </g>;
      })}
      <circle cx={root.x} cy={root.y} r={175 + Math.sin(time * 1.6) * 7} fill="none" stroke="#087f7117" strokeWidth="30"/>
      <circle cx={root.x} cy={root.y} r="155" fill={TEAL}/>
      <text x={root.x} y={root.y - 21} textAnchor="middle" fontSize="43" fontWeight="700" fill="white">Your memory</text>
      <text x={root.x} y={root.y + 35} textAnchor="middle" fontSize="29" fill="#d5eee5">Across chats & tools</text>
    </svg>
    <div style={{position: 'absolute', left: 48, bottom: 28, fontSize: 29, color: '#707872'}}>Prompt evidence retained · Inspect and edit every memory</div>
    {scene === 5 && time >= 50.6 && <Cursor x={1330 + 140 * (1 - easeIn(time, 50.6))} y={875} time={time} clickAt={51.2}/>}
  </motion.div>;
}

function PromptPanel({time, scene}) {
  const forget = scene === 3;
  const dashboard = scene === 5;
  const prompt = forget ? 'Forget em dashes. That was just for this task.' : dashboard ? 'Remember: I prefer concise replies.' : 'Reply in British English, and use em dashes.';
  const at = forget ? 27.1 : dashboard ? 48.3 : 8.0;
  const duration = forget ? 3.0 : dashboard ? 1.4 : 4.4;
  const clickAt = forget ? 31.0 : dashboard ? 49.8 : 12.9;
  const sent = time >= clickAt;
  const body = scene === 2 ? 'Only your prompts create memories.' : scene === 6 ? 'Memory you can inspect, correct, and control.' : null;
  return <motion.div initial={false} style={{...panel, position: 'absolute', left: 220, top: 620, width: 1320, height: 1160, padding: 66, opacity: easeIn(time, TIMES[scene] + 0.2), x: -36 * (1 - easeIn(time, TIMES[scene] + 0.2))}}>
    <div style={{fontSize: 31, color: TEAL, letterSpacing: 3, fontWeight: 700}}>{dashboard ? 'LOVABLE · MEMORY LENS' : scene === 2 ? 'PROMPT CAPTURE' : scene === 6 ? 'YOUR MEMORY. YOUR CONTROL.' : 'YOUR RUNNING CHAT'}</div>
    <div style={{fontSize: 64, fontWeight: 700, lineHeight: 1.12, marginTop: 46}}>{scene === 0 ? 'A memory you can see.' : forget ? 'Correct it in plain English.' : dashboard ? 'Inspect any node.' : body || 'Give your agent a preference.'}</div>
    {scene === 0 ? <div style={{marginTop: 100}}>{['CLI', 'Coding agent', 'Editor'].map((label, i) => <div key={label} style={{...panel, marginTop: 22, padding: '28px 34px', fontSize: 42, opacity: easeIn(time, 0.6 + i * 0.8), transform: `translateX(${30 * (1 - easeIn(time, 0.6 + i * 0.8))}px)`}}><span style={{color: TEAL}}>●</span> {label}<span style={{float: 'right', color: '#707872', fontSize: 30}}>Same memory</span></div>)}</div> : scene === 2 ? <div style={{marginTop: 80}}><div style={{background: '#e7f5ef', borderRadius: 25, padding: 40, fontSize: 40, lineHeight: 1.4}}>User prompt → Relevant facts → Memory nodes</div><div style={{marginTop: 65, padding: 38, fontSize: 36, color: '#707872', border: '3px dashed #d6ddd5', borderRadius: 25}}>Agent replies stay outside memory creation.</div><div style={{marginTop: 68, color: TEAL, fontSize: 35}}>Captured before the agent starts work ✓</div></div> : scene === 6 ? <div style={{marginTop: 80, fontSize: 43, lineHeight: 1.6}}>One graph across your chats.<br/>Relevant memories for every tool.<br/><span style={{color: TEAL}}>Always under your control.</span><div style={{fontSize: 27, marginTop: 94, color: '#707872'}}>Illustrative product demo · AI narration</div></div> : <>
      <div style={{marginTop: 78, background: '#f4f6f1', borderRadius: 28, border: '3px solid #dae3d9', height: 284, padding: 38, fontSize: 47, lineHeight: 1.35}}>{typed(prompt, time, at, duration)}<span style={{color: TEAL, opacity: Math.floor(time * 2.8) % 2 === 0 ? 1 : 0}}>▏</span></div>
      <div style={{marginTop: 38, marginLeft: 'auto', width: 330, textAlign: 'center', padding: '24px 30px', background: TEAL, color: 'white', borderRadius: 24, fontSize: 37, transform: `scale(${1 - Math.max(0, 1 - Math.abs(time - clickAt) / 0.3) * 0.08})`}}>{forget ? 'Update memory' : 'Send prompt'} ↑</div>
      <div style={{marginTop: 54, fontSize: 34, color: sent ? TEAL : '#707872', opacity: sent ? easeIn(time, clickAt, 0.4) : 0.8}}>{sent ? forget ? time >= 32 ? 'Forgotten globally. British English stays. ✓' : 'Updating your shared memory…' : 'Relevant preferences added to your memory ✓' : 'Your words. Your preferences.'}</div>
      {dashboard && time >= 51.2 && <motion.div initial={false} style={{marginTop: 40, background: '#e7f5ef', borderRadius: 24, padding: 30, opacity: easeIn(time, 51.2), y: 20 * (1 - easeIn(time, 51.2))}}><div style={{fontSize: 31, color: TEAL}}>SELECTED MEMORY</div><div style={{fontSize: 37, marginTop: 15}}>Prefer concise replies</div><div style={{fontSize: 27, marginTop: 12, color: '#707872'}}>Source: your prompt · Edit or forget</div></motion.div>}
      {(!dashboard || time < 50.6) && <Cursor x={1160 - 260 * (1 - easeIn(time, clickAt - 1.0, 0.8))} y={720 - 120 * (1 - easeIn(time, clickAt - 1.0, 0.8))} time={time} clickAt={clickAt}/>}
    </>}
  </motion.div>;
}

function Pipeline({time}) {
  const cards = [
    {title: '01 · Your memory', subtitle: 'British English', body: 'Personal preferences', color: TEAL, at: 37.5},
    {title: '02 · Existing code graph', subtitle: 'Relevant code context', body: 'Your original graph stays intact', color: '#5c6f99', at: 39.8},
    {title: '03 · Agent work', subtitle: 'Context-aware execution', body: 'Memory first. Code second.', color: INK, at: 42.2},
  ];
  return <div style={{position: 'absolute', top: 660, left: 220, width: 3380}}>
    {cards.map((card, i) => <motion.div key={card.title} initial={false} style={{...panel, position: 'absolute', left: i * 1160, width: 1050, height: 815, padding: 62, opacity: easeIn(time, card.at), y: 50 * (1 - easeIn(time, card.at)), borderColor: time >= card.at && time < card.at + 2.2 ? card.color : '#dce2dc'}}>
      <div style={{fontSize: 40, color: card.color, fontWeight: 700}}>{card.title}</div>
      <svg width="840" height="330" viewBox="0 0 840 330" style={{marginTop: 50}}>{[[140,160],[360,85],[570,210],[730,100]].map(([x,y], j, arr) => <g key={j}>{j > 0 && <line x1={arr[j-1][0]} y1={arr[j-1][1]} x2={x} y2={y} stroke={`${card.color}55`} strokeWidth="7"/>}<circle cx={x} cy={y + Math.sin(time * 1.5 + j) * 6} r={j === 1 ? 50 : 35} fill={card.color} opacity={0.72 + 0.28 * Math.sin(time * 2 + j) ** 2}/></g>)}</svg>
      <div style={{fontSize: 50, fontWeight: 700, marginTop: 28}}>{card.subtitle}</div><div style={{fontSize: 33, color: '#707872', marginTop: 38}}>{card.body}</div><div style={{fontSize: 30, color: card.color, marginTop: 68, opacity: easeIn(time, card.at + 1)}}>Retrieved ✓</div>
    </motion.div>)}
    {[0,1].map(i => {const p = (time * 0.65 + i * 0.3) % 1;return <svg key={i} width="110" height="160" style={{position: 'absolute', left: 1050 + i * 1160, top: 310, opacity: easeIn(time, 39.5 + i * 2)}}><path d="M8 80H98M73 58L98 80L73 102" stroke="#829b8e" strokeWidth="6" fill="none"/><circle cx={10 + p * 85} cy="80" r="10" fill={TEAL}/></svg>;})}
    <div style={{position: 'absolute', top: 910, left: 0, right: 0, fontSize: 39, textAlign: 'center', color: '#707872'}}>Separate knowledge graphs · Temporary retrieval flow · No permanent cross-graph edges</div>
  </div>;
}

function MovingProduct({time, scene}) {
  const titles = ['Your agent has a memory. Now you can see it.', 'Say it once. Keep the useful part.', 'From your prompts to visible memories.', 'A correction changes the same graph.', 'Memory first. Then the existing code graph.', 'Across every chat. Inside one graph.', 'See it. Correct it. Keep control.'];
  return <>
    <motion.div initial={false} style={{position: 'absolute', left: 220, top: 315, fontSize: 83, lineHeight: 1.16, fontWeight: 700, letterSpacing: -2.4, maxWidth: 3320, opacity: easeIn(time, TIMES[scene] + 0.15), y: 22 * (1 - easeIn(time, TIMES[scene] + 0.15))}}>{titles[scene]}</motion.div>
    <div style={{position: 'absolute', left: 220, top: 525, color: '#707872', fontSize: 35}}>{scene === 4 ? 'The original code graph keeps its own structure and indexing.' : 'One shared agent memory, with evidence from your prompts.'}</div>
    {scene === 4 ? <Pipeline time={time}/> : <><PromptPanel time={time} scene={scene}/><SharedGraph time={time} scene={scene}/></>}
  </>;
}

export function AgentMemoryFilm({captions = []}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const camera = cameraAt(time);
  const scene = Math.max(0, TIMES.findIndex((start, i) => i < 7 && time >= start && time < TIMES[i + 1]));
  const cue = captions.find((item) => time >= item.start && time < item.end);
  const [fontHandle] = useState(() => delayRender('Load local DM Sans'));
  useEffect(() => {
    Promise.all([document.fonts.load('400 64px "Film Sans"'), document.fonts.load('700 66px "Film Sans"')])
      .then(() => continueRender(fontHandle))
      .catch(() => continueRender(fontHandle));
  }, [fontHandle]);

  return <AbsoluteFill style={{background: BG, overflow: 'hidden', fontFamily: '"Film Sans", Arial, sans-serif'}}>
    <style>{`@font-face {font-family: 'Film Sans'; src: url('${staticFile('DMSans-Regular.ttf')}'); font-weight: 400;} @font-face {font-family: 'Film Sans'; src: url('${staticFile('DMSans-Bold.ttf')}'); font-weight: 700;}`}</style>
    <motion.div initial={false} style={{
      position: 'absolute', inset: 0,
      scale: camera.scale, x: camera.x, y: camera.y,
      transformOrigin: `${camera.ox * 100}% ${camera.oy * 100}%`,
      willChange: 'transform',
    }}>
      <MovingProduct time={time} scene={scene}/>
    </motion.div>

    {/* A steady frame protects the brand, captions and progress from camera motion. */}
    <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 246, background: BG}} />
    <div style={{position: 'absolute', top: 72, left: 200, display: 'flex', alignItems: 'center', gap: 28, color: INK}}>
      <svg width="91" height="80" viewBox="0 0 91 80"><path d="M9 40L44 10L78 40L44 69Z" fill="none" stroke="#707872" strokeWidth="5" />{[[9,40],[44,10],[78,40],[44,69]].map(([cx,cy])=><circle key={`${cx}:${cy}`} cx={cx} cy={cy} r="8" fill={TEAL}/>)}</svg>
      <span style={{fontSize: 64, fontWeight: 700, letterSpacing: -1.2}}>code-review-graph</span>
      <span style={{fontSize: 34, color: '#707872', marginLeft: 10, paddingTop: 6}}>Agent memory</span>
    </div>
    <div style={{position: 'absolute', top: 210, left: 200, fontSize: 36, color: '#707872'}}>{String(scene + 1).padStart(2, '0')} / 07</div>
    <div style={{position: 'absolute', right: 200, top: 84, padding: '16px 35px', borderRadius: 35, background: '#edeee8', color: '#707872', fontSize: 42}}>Illustrative demo</div>
    <div style={{position: 'absolute', top: 202, left: 200, right: 200, height: 3, background: '#dce2dc'}} />
    <Caption cue={cue} time={time} />
    <div style={{position: 'absolute', bottom: 0, height: 10, left: 0, right: 0, background: '#e2e7df'}}>
      <motion.div initial={false} style={{width: `${100 * time / 60}%`, height: '100%', background: TEAL}} />
    </div>
    <Audio src={staticFile('voiceover.wav')} />
  </AbsoluteFill>;
}
