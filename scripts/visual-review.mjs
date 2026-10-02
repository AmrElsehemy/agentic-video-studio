// Visual review (#88): render the same frames before and after a change and
// put them side by side for a person to approve. The frames are each scene's
// review frame (the one the critic and contact sheet read) plus the cover,
// rendered from the base ref (a temporary git worktree) and from the working
// tree, on the same machine, so unchanged code gives identical pixels.
//   npm run review:visual                         golden PokePulses episodes + every Geographica episode, against origin/master
//   npm run review:visual -- lesotho-enclave      chosen episodes
//   npm run review:visual -- --all                every episode
//   --base=<ref>            compare against another ref
//   --strict=<show,...>     shows that must stay pixel-identical (default: pokepulses)
//   --allow-change          report changes in strict shows without failing
//   --no-render             rebuild the page from the last run's frames
// Writes out/visual-review/index.html (open it, or publish it for review) and
// exits non-zero when a strict show changed.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {episodeIds, findManifest, repoRoot as root, resolveEpisodeId} from './catalog.mjs';

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = option('base') ?? 'origin/master';
const strictShows = (option('strict') ?? 'pokepulses').split(',').filter(Boolean);
const allowChange = args.includes('--allow-change');
const outDir = path.join(root, 'out', 'visual-review');
const worktree = path.join(outDir, 'base-tree');

const showOf = (dir, id) => {
  const videos = path.join(dir, 'videos');
  const show = fs.existsSync(videos) ? fs.readdirSync(videos).find((name) => fs.existsSync(path.join(videos, name, id, 'video.json'))) : undefined;
  return show;
};

const chosen = () => {
  const named = args.filter((arg) => !arg.startsWith('--')).map((arg) => resolveEpisodeId(arg));
  if (named.length) return named;
  if (args.includes('--all')) return episodeIds().filter((id) => showOf(root, id));
  const golden = JSON.parse(fs.readFileSync(path.join(root, '.github', 'golden-episodes.json'), 'utf8')).episodes;
  return [...golden, ...episodeIds().filter((id) => showOf(root, id) === 'geographica')];
};

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options});
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed:\n${(result.stderr || result.stdout || '').slice(-1500)}`);
  return result.stdout;
};

/** Render review frames + cover for `ids` in `dir`, and copy them to out/visual-review/<side>/<id>/. */
const renderSide = (dir, side, ids) => {
  if (!ids.length) return;
  console.log(`▶ rendering ${ids.length} episode(s) at ${side === 'base' ? base : 'the working tree'}`);
  const result = spawnSync(process.execPath, ['scripts/frame-check.mjs', ...ids, '--voice=none'], {cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
  if (result.status !== 0) console.warn(`⚠ some ${side} renders failed:\n${(result.stderr || '').split('\n').filter((line) => line.includes('✗')).join('\n')}`);
  for (const id of ids) {
    const target = path.join(outDir, side, id);
    fs.mkdirSync(target, {recursive: true});
    const frames = path.join(dir, 'out', `${id}-frames`);
    if (fs.existsSync(frames)) for (const file of fs.readdirSync(frames)) fs.copyFileSync(path.join(frames, file), path.join(target, file));
    const cover = path.join(dir, 'out', `${id}-cover.png`);
    if (fs.existsSync(cover)) fs.copyFileSync(cover, path.join(target, 'cover.png'));
  }
};

/** Frames around each scene change, relative to the first frame of the next scene: the motion across the seam. */
export const STRIP_OFFSETS = [-12, -6, -1, 0, 6, 12, 24, 45];

/** Scene changes between two map scenes, as [index of the next scene, its first frame]. */
const mapSeams = (manifest) => {
  const seams = [];
  let start = 0;
  manifest.scenes.forEach((scene, index) => {
    if (index > 0 && scene.primitive?.kind === 'geo-map' && manifest.scenes[index - 1].primitive?.kind === 'geo-map') seams.push([index, start]);
    start += Math.round(scene.durationSeconds * manifest.format.fps);
  });
  return seams;
};

/** Render the frames around every map scene change, from the props frame-check wrote in `dir`. */
const renderStrips = async (dir, side, ids) => {
  const withSeams = ids.filter((id) => fs.existsSync(path.join(dir, 'out', `${id}.props.json`)))
    .map((id) => ({id, manifest: JSON.parse(fs.readFileSync(path.join(dir, 'out', `${id}.props.json`), 'utf8')).manifest}))
    .filter(({manifest}) => mapSeams(manifest).length);
  if (!withSeams.length) return;
  console.log(`▶ rendering scene-change strips at ${side === 'base' ? base : 'the working tree'}`);
  const serveUrl = await bundle({entryPoint: path.join(dir, 'src', 'index.ts'), rootDir: dir, publicDir: path.join(dir, 'public')});
  const browser = await openBrowser('chrome', {browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null});
  try {
    for (const {id, manifest} of withSeams) {
      const inputProps = {manifest};
      const composition = await selectComposition({serveUrl, id: 'VerticalEpisode', inputProps, puppeteerInstance: browser});
      const target = path.join(outDir, side, id, 'strips');
      fs.mkdirSync(target, {recursive: true});
      for (const [index, first] of mapSeams(manifest)) {
        for (const offset of STRIP_OFFSETS) {
          const frame = Math.max(0, Math.min(composition.durationInFrames - 1, first + offset));
          await renderStill({composition, serveUrl, inputProps, frame, output: path.join(target, `${String(index).padStart(2, '0')}_${offset}.png`), imageFormat: 'png', scale: .5, puppeteerInstance: browser, overwrite: true});
        }
      }
    }
  } finally {
    await browser.close({silent: true});
  }
};

const pixels = (file) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'md5', '-'], {}).trim();
const ssim = (a, b) => Number(spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], {encoding: 'utf8'}).stderr.match(/All:([\d.]+)/)?.[1] ?? 0);
const thumb = (file, filters = 'scale=360:-2') => {
  const data = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', filters, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', '-'], {maxBuffer: 64 * 1024 * 1024}).stdout;
  return `data:image/jpeg;base64,${data.toString('base64')}`;
};
/** The absolute difference of two frames, brightened so small shifts show. */
const diffThumb = (a, b) => {
  const data = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', a, '-i', b, '-filter_complex', '[0][1]blend=all_mode=difference,format=gray,eq=contrast=6:brightness=0.05,scale=360:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', '-'], {maxBuffer: 64 * 1024 * 1024}).stdout;
  return `data:image/jpeg;base64,${data.toString('base64')}`;
};

const compareEpisode = (id) => {
  const before = path.join(outDir, 'base', id);
  const after = path.join(outDir, 'head', id);
  const files = [...new Set([...(fs.existsSync(before) ? fs.readdirSync(before) : []), ...(fs.existsSync(after) ? fs.readdirSync(after) : [])])].filter((file) => file.endsWith('.png')).sort((x, y) => (x === 'cover.png') - (y === 'cover.png') || x.localeCompare(y));
  const manifest = JSON.parse(fs.readFileSync(findManifest(id).manifestPath, 'utf8'));
  const frames = files.map((file) => {
    const a = path.join(before, file);
    const b = path.join(after, file);
    const index = Number.parseInt(file, 10);
    const label = file === 'cover.png' ? 'Cover' : `Scene ${index + 1} · ${manifest.scenes[index]?.id ?? '?'}`;
    if (!fs.existsSync(a)) return {label, status: 'new', after: thumb(b)};
    if (!fs.existsSync(b)) return {label, status: 'removed', before: thumb(a)};
    if (pixels(a) === pixels(b)) return {label, status: 'identical', after: thumb(b)};
    return {label, status: 'changed', ssim: ssim(a, b), before: thumb(a), after: thumb(b), diff: diffThumb(a, b)};
  });
  const show = manifest.show.id;
  // Scene-change strips: the same moments before and after, one row each.
  const strips = mapSeams(manifest).map(([index]) => {
    const name = (offset) => `${String(index).padStart(2, '0')}_${offset}.png`;
    const cells = STRIP_OFFSETS.map((offset) => {
      const [a, b] = [path.join(before, 'strips', name(offset)), path.join(after, 'strips', name(offset))];
      const has = [fs.existsSync(a), fs.existsSync(b)];
      return {offset, before: has[0] ? thumb(a, 'scale=180:-2') : null, after: has[1] ? thumb(b, 'scale=180:-2') : null, same: has[0] && has[1] && pixels(a) === pixels(b)};
    });
    return {label: `Scene ${index} → ${index + 1} (${manifest.scenes[index - 1].id} → ${manifest.scenes[index].id})`, cells, changed: cells.some((cell) => !cell.same)};
  });
  const status = !fs.existsSync(before) ? 'new' : frames.some((frame) => frame.status !== 'identical') || strips.some((strip) => strip.changed) ? 'changed' : 'identical';
  return {id, show, title: manifest.title, status, strict: strictShows.includes(show), frames, strips};
};

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

const page = ({episodes, head, baseCommit}) => {
  const counts = (status) => episodes.filter((episode) => episode.status === status).length;
  const strictBroken = episodes.filter((episode) => episode.strict && episode.status === 'changed');
  const verdict = strictBroken.length
    ? `<p class="verdict bad">${strictBroken.length} ${strictShows.join('/')} episode(s) changed. These must stay pixel-identical unless the change is intended.</p>`
    : `<p class="verdict good">${strictShows.join(', ')}: every checked frame is pixel-identical to ${escape(base)}.</p>`;
  const frame = (f) => {
    const cells = f.status === 'changed'
      ? `<figure><img src="${f.before}" alt="Before: ${escape(f.label)}"><figcaption>Before</figcaption></figure><figure><img src="${f.after}" alt="After: ${escape(f.label)}"><figcaption>After</figcaption></figure><figure><img src="${f.diff}" alt="Difference: ${escape(f.label)}"><figcaption>Difference · SSIM ${f.ssim.toFixed(4)}</figcaption></figure>`
      : `<figure><img src="${f.after ?? f.before}" alt="${escape(f.label)}"><figcaption>${f.status === 'identical' ? 'Identical to before' : f.status === 'new' ? 'New' : 'Removed'}</figcaption></figure>`;
    return `<div class="frame ${f.status}"><h4>${escape(f.label)} <span class="chip ${f.status}">${f.status}</span></h4><div class="cells">${cells}</div></div>`;
  };
  const stripHtml = (strip) => {
    const row = (side) => `<div class="strip-row"><span class="side">${side === 'before' ? 'Before' : 'After'}</span>${strip.cells.map((cell) => `<figure>${cell[side] ? `<img src="${cell[side]}" alt="${side} ${cell.offset} frames">` : '<div class="missing">—</div>'}<figcaption>${cell.offset > 0 ? '+' : ''}${cell.offset}</figcaption></figure>`).join('')}</div>`;
    return `<div class="strip"><h4>${escape(strip.label)} <span class="chip ${strip.changed ? 'changed' : 'identical'}">${strip.changed ? 'changed' : 'identical'}</span></h4><div class="strip-scroll">${row('before')}${row('after')}</div></div>`;
  };
  return `<title>Visual Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a proof sheet. Summary first, then one strip of frames per episode; changed frames show before, after and difference. */
:root{--bg:#eef0f3;--paper:#ffffff;--ink:#16191f;--muted:#5d6573;--rule:#d5d9e0;--good:#1d7a4a;--warn:#b25e09;--bad:#b4232c;--new:#2f5fb3;
--display:"Archivo",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#111317;--paper:#1a1d23;--ink:#e8eaee;--muted:#9aa3b2;--rule:#2c313a;--good:#4cc38a;--warn:#f0a050;--bad:#f2707a;--new:#7ea6f0;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#111317;--paper:#1a1d23;--ink:#e8eaee;--muted:#9aa3b2;--rule:#2c313a;--good:#4cc38a;--warn:#f0a050;--bad:#f2707a;--new:#7ea6f0;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.5 var(--display);margin:0}
main{max-width:1180px;margin:0 auto;padding-inline:16px;padding-block:28px 64px;display:grid;gap:28px}
h1{font-size:28px;font-weight:800;margin:0;text-wrap:balance}h2{font-size:20px;margin:0}h4{font-size:13px;font-weight:500;margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.meta{font-family:var(--mono);font-size:12px;color:var(--muted);margin:6px 0 0}
.summary{display:flex;gap:10px;flex-wrap:wrap;font-family:var(--mono);font-size:13px}
.summary span{background:var(--paper);border:1px solid var(--rule);border-radius:6px;padding:6px 10px;font-variant-numeric:tabular-nums}
.verdict{margin:0;padding:12px 14px;border-radius:6px;background:var(--paper);border-left:4px solid}
.verdict.good{border-color:var(--good)}.verdict.bad{border-color:var(--bad)}
.how{color:var(--muted);margin:0;max-width:70ch}
section.episode{background:var(--paper);border:1px solid var(--rule);border-radius:8px;padding:18px;display:grid;gap:14px;min-width:0}
.episode header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.episode header p{margin:0;color:var(--muted);font-size:13px;flex-basis:100%}
.chip{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:999px;border:1px solid currentColor}
.chip.identical{color:var(--good)}.chip.changed{color:var(--warn)}.chip.new{color:var(--new)}.chip.removed{color:var(--bad)}.chip.show{color:var(--muted)}
.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.frame{display:grid;gap:6px;min-width:0}
.frame.changed{grid-column:1/-1}
.strips{display:grid;gap:16px;border-top:1px solid var(--rule);padding-top:14px}
.strips>p{margin:0;color:var(--muted);font-size:13px;max-width:70ch}
.strip{display:grid;gap:8px;min-width:0}.strip-scroll{overflow-x:auto;display:grid;gap:6px;padding-bottom:4px}
.strip-row{display:grid;grid-template-columns:52px repeat(8,96px);gap:6px;align-items:center}
.strip-row .side{font-family:var(--mono);font-size:11px;color:var(--muted)}
.strip-row figcaption{text-align:center}.missing{aspect-ratio:9/16;display:grid;place-items:center;color:var(--muted);border:1px dashed var(--rule);border-radius:4px}
.cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,240px));gap:10px}
figure{margin:0;display:grid;gap:4px}figure img{width:100%;border-radius:4px;border:1px solid var(--rule);background:var(--bg)}
figcaption{font-family:var(--mono);font-size:11px;color:var(--muted)}
</style>
<main>
<header><h1>Visual review</h1><p class="meta">before: ${escape(base)} (${escape(baseCommit)}) · after: working tree on ${escape(head)} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p></header>
<div class="summary"><span>${episodes.length} episodes</span><span>${counts('identical')} identical</span><span>${counts('changed')} changed</span><span>${counts('new')} new</span></div>
${verdict}
<p class="how">Each episode shows the frame of every scene that the video critic reads, plus its cover. Frames that did not change appear once. Changed frames show before, after and the difference (bright = changed pixels). Approve the changes you expect; anything else is a regression.</p>
${episodes.map((episode) => `<section class="episode"><header><h2>${escape(episode.id)}</h2><span class="chip show">${escape(episode.show)}${episode.strict ? ' · must not change' : ''}</span><span class="chip ${episode.status}">${episode.status}</span><p>${escape(episode.title)}</p></header><div class="frames">${episode.frames.map(frame).join('')}</div>${episode.strips.length ? `<div class="strips"><h3 style="margin:0;font-size:15px">Scene changes</h3><p>Eight moments around each change between map scenes, in frames from the first frame of the next scene (30 frames = 1 second).</p>${episode.strips.map(stripHtml).join('')}</div>` : ''}</section>`).join('\n')}
</main>`;
};

const ids = chosen();
const reuse = args.includes('--no-render');
const baseCommit = run('git', ['rev-parse', '--short', base], {cwd: root}).trim();
const head = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {cwd: root}).trim();
if (!reuse) {
  fs.rmSync(path.join(outDir, 'base'), {recursive: true, force: true});
  fs.rmSync(path.join(outDir, 'head'), {recursive: true, force: true});
  spawnSync('git', ['worktree', 'remove', '--force', worktree], {cwd: root});
  fs.rmSync(worktree, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});
  run('git', ['worktree', 'add', '--detach', worktree, base], {cwd: root});
  try {
    // Same lockfile: share the installed dependencies. A different lockfile (a
    // Remotion or font upgrade) can change pixels by itself, so the base gets its own install.
    const lockfile = (dir) => fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8');
    if (lockfile(worktree) === lockfile(root)) {
      fs.symlinkSync(path.join(root, 'node_modules'), path.join(worktree, 'node_modules'), 'dir');
    } else {
      console.log(`▶ package-lock.json differs from ${base}: installing the base's dependencies`);
      run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], {cwd: worktree});
    }
    renderSide(worktree, 'base', ids.filter((id) => showOf(worktree, id)));
    renderSide(root, 'head', ids);
    await renderStrips(worktree, 'base', ids);
    await renderStrips(root, 'head', ids);
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], {cwd: root});
  }
}
const episodes = ids.map(compareEpisode);
fs.writeFileSync(path.join(outDir, 'index.html'), page({episodes, head, baseCommit}));
for (const episode of episodes) console.log(`  ${episode.status === 'identical' ? '✓' : episode.status === 'new' ? '+' : '△'} ${episode.id} (${episode.show}): ${episode.status}${episode.status === 'changed' ? ` — ${episode.frames.filter((f) => f.status !== 'identical').map((f) => f.label).join(', ')}` : ''}`);
console.log(`✓ out/visual-review/index.html (${(fs.statSync(path.join(outDir, 'index.html')).size / 1024 / 1024).toFixed(1)} MB)`);
const broken = episodes.filter((episode) => episode.strict && episode.status === 'changed');
if (broken.length && !allowChange) {
  console.error(`✗ ${broken.map((episode) => episode.id).join(', ')} changed, but ${strictShows.join('/')} must stay pixel-identical. Review the page; if the change is intended, re-run with --allow-change.`);
  process.exit(1);
}
