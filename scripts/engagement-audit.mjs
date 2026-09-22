import fs from 'node:fs';
import path from 'node:path';

const requested = process.argv[2];
const manifests = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === 'video.json') manifests.push(target);
  }
};
walk(path.resolve('videos'));

for (const manifestPath of manifests) {
  const video = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (requested && video.id !== requested) continue;

  const scenes = video.scenes;
  const duration = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const checks = [
    ['Immediate tension', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 2.5, 15],
    ['Short hook copy', scenes[0]?.headline.trim().split(/\s+/).length <= 8, 10],
    ['Open loop', Boolean(video.direction?.openLoop && video.direction?.payoff), 10],
    ['Evidence chain', scenes.filter((scene) => ['evidence', 'escalation'].includes(scene.role)).length >= 3, 15],
    ['Pattern interrupts', scenes.every((scene) => scene.beatEverySeconds <= 1.2), 15],
    ['No dead scene', scenes.every((scene) => scene.durationSeconds <= 3.1), 10],
    ['Counterpoint', scenes.some((scene) => scene.role === 'twist'), 10],
    ['Debatable interaction', scenes.at(-1)?.role === 'interaction' && /\?|pick|or/i.test(`${scenes.at(-1)?.headline} ${scenes.at(-1)?.narration}`), 10],
    ['Short-form velocity', duration >= 12 && duration <= 20, 5],
  ];
  const score = checks.reduce((sum, [, passed, points]) => sum + (passed ? points : 0), 0);
  console.log(`\n${video.id} — engagement score ${score}/100`);
  for (const [label, passed, points] of checks) console.log(`${passed ? '✓' : '✗'} ${label} (${points})`);
  if (score < 80) {
    console.error(`\nRejected: ${video.id} must score at least 80/100 before rendering.`);
    process.exitCode = 1;
  } else {
    console.log(`\nDirector approved: ${video.direction.premise}`);
  }
}

