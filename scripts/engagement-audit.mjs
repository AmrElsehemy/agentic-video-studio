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

const countRoles = (scenes, roles) => scenes.filter((scene) => roles.includes(scene.role)).length;

for (const manifestPath of manifests) {
  const video = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (requested && video.id !== requested) continue;

  const scenes = video.scenes;
  const duration = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const distinctShots = new Set(scenes.map((scene) => scene.shot)).size;
  const pattern = video.direction?.storyPattern ?? 'profile';

  const commonChecks = [
    ['Short hook copy', scenes[0]?.headline.trim().split(/\s+/).length <= 8, 10],
    ['Open loop', Boolean(video.direction?.openLoop && video.direction?.payoff), 10],
    ['Pattern interrupts', scenes.every((scene) => scene.beatEverySeconds <= 1.2), 15],
    ['Shot variety', distinctShots >= Math.min(5, scenes.length), 10],
    ['Natural narration pace', scenes.every((scene) => scene.durationSeconds <= 6.5 && scene.narration.trim().split(/\s+/).length / scene.durationSeconds <= 2.8), 10],
    ['Debatable interaction', scenes.at(-1)?.role === 'interaction' && /\?|pick|or|which|worth|best/i.test(`${scenes.at(-1)?.headline} ${scenes.at(-1)?.narration}`), 10],
    ['Story breathing room', duration >= 24 && duration <= 45, 5],
  ];

  const patternChecks = {
    profile: [
      ['Immediate tension', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8, 15],
      ['Evidence chain', countRoles(scenes, ['evidence', 'escalation']) >= 3, 15],
      ['Subject restraint', scenes.filter((scene) => scene.subjectFocus === 'primary').length <= Math.ceil(scenes.length / 2), 10],
      ['Counterpoint', scenes.some((scene) => scene.role === 'twist'), 10],
    ],
    mechanic: [
      ['Immediate mechanic', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8, 15],
      ['Mechanic escalation', countRoles(scenes, ['evidence', 'escalation', 'payoff']) >= 3, 15],
      ['Clear payoff', countRoles(scenes, ['payoff']) >= 1, 10],
      ['Subject-led visual story', scenes.filter((scene) => ['primary', 'secondary'].includes(scene.subjectFocus)).length >= Math.ceil(scenes.length / 2), 10],
    ],
    transformation: [
      ['Immediate change promise', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8, 15],
      ['State escalation', countRoles(scenes, ['escalation', 'payoff']) >= 3, 15],
      ['Transformation payoff', countRoles(scenes, ['payoff']) >= 2, 10],
      ['Before/after visual grammar', scenes.some((scene) => ['comparison', 'impact'].includes(scene.shot)), 10],
    ],
    mystery: [
      ['Immediate mystery', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8 && ['absent', 'hidden'].includes(scenes[0]?.subjectFocus), 15],
      ['Clue escalation', countRoles(scenes, ['evidence', 'escalation']) >= 2, 15],
      ['Layered reveal', countRoles(scenes, ['payoff']) >= 2, 10],
      ['Reveal contrast', scenes.some((scene) => ['comparison', 'impact'].includes(scene.shot)), 10],
    ],
    comparison: [
      ['Immediate contrast', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8, 15],
      ['Comparison evidence', countRoles(scenes, ['evidence', 'escalation']) >= 3, 15],
      ['Contrast shots', scenes.filter((scene) => scene.shot === 'comparison').length >= 1, 10],
      ['Counterpoint', scenes.some((scene) => scene.role === 'twist'), 10],
    ],
    reveal: [
      ['Immediate mystery', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8 && ['absent', 'hidden'].includes(scenes[0]?.subjectFocus), 15],
      ['Layered escalation', countRoles(scenes, ['escalation', 'payoff']) >= 3, 15],
      ['Multiple reveals', countRoles(scenes, ['payoff']) >= 2, 10],
      ['Final consequence', scenes.some((scene) => scene.role === 'payoff'), 10],
    ],
    debate: [
      ['Immediate claim', scenes[0]?.role === 'hook' && scenes[0].durationSeconds <= 4.8, 15],
      ['Evidence chain', countRoles(scenes, ['evidence', 'escalation']) >= 3, 15],
      ['Counterpoint', scenes.some((scene) => scene.role === 'twist'), 10],
      ['Debate close', scenes.at(-1)?.role === 'interaction', 10],
    ],
  };

  const checks = [...commonChecks, ...(patternChecks[pattern] ?? patternChecks.profile)];
  const available = checks.reduce((sum, [, , points]) => sum + points, 0);
  const earned = checks.reduce((sum, [, passed, points]) => sum + (passed ? points : 0), 0);
  const score = Math.round(earned / available * 100);
  console.log(`\n${video.id} [${pattern}] — engagement score ${score}/100`);
  for (const [label, passed, points] of checks) console.log(`${passed ? '✓' : '✗'} ${label} (${points})`);
  if (score < 80) {
    console.error(`\nRejected: ${video.id} must score at least 80/100 before rendering.`);
    process.exitCode = 1;
  } else {
    console.log(`\nDirector approved: ${video.direction.premise}`);
  }
}
