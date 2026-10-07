// draw.io import (#120): an architecture diagram drawn in draw.io, turned
// into an architecture spec (scripts/diagram-arch-schema.mjs) that keeps the
// picture exactly as drawn, so it can be walked through in either look.
//
// A .drawio file holds pages of mxGraph cells: vertices with geometry
// relative to their parent container, edges between them with waypoints in
// their parent's coordinates, and styles as "key=value;" strings. This reads
// them into absolute coordinates and sorts them into the spec's parts:
// components (icons or plain shapes), boundaries, routes in lanes, numbered
// steps with their text, a legend, grey tiles and free labels. Anything it
// had to guess is listed in the report, for a person to check.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {XMLParser} from 'fast-xml-parser';

const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, textNodeName: '#text', isArray: (name) => ['diagram', 'mxCell', 'UserObject', 'object', 'mxPoint'].includes(name)});

/** A page's model, uncompressing draw.io's deflate + base64 + URI encoding when the page is stored compressed. */
const pageModel = (diagram) => {
  if (diagram.mxGraphModel) return diagram.mxGraphModel;
  const text = String(diagram['#text'] ?? '').trim();
  if (!text) return undefined;
  const xml = decodeURIComponent(zlib.inflateRawSync(Buffer.from(text, 'base64')).toString('latin1'));
  return parser.parse(xml).mxGraphModel;
};

/** The pages of a .drawio file (or a bare mxGraphModel): [{name, model}]. */
export const drawioPages = (xml) => {
  const doc = parser.parse(xml);
  if (doc.mxGraphModel) return [{name: 'Page-1', model: doc.mxGraphModel}];
  if (!doc.mxfile) throw new Error('This isn\'t a draw.io file: it has no <mxfile> or <mxGraphModel>.');
  return doc.mxfile.diagram.map((diagram, index) => ({name: diagram.name ?? `Page-${index + 1}`, model: pageModel(diagram)})).filter((page) => page.model);
};

/** A draw.io style string as a map; bare tokens ("text", "ellipse", "image") are true. */
export const parseStyle = (style = '') => Object.fromEntries(String(style).split(';').filter(Boolean).map((token) => {
  const at = token.indexOf('=');
  return at < 0 ? [token, true] : [token.slice(0, at), token.slice(at + 1)];
}));

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', '#39': '\''};
/** A cell's value as plain lines: HTML labels lose their tags, keep their line breaks. */
export const plainText = (value) => String(value ?? '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#?\w+);/g, (match, code) => ENTITIES[code] ?? (code.startsWith('#') ? String.fromCharCode(Number(code.slice(1))) : match))
  .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

const num = (value, fallback = 0) => (value === undefined || value === '' ? fallback : Number(value));
const asArray = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Every cell of a model, with its value, style, geometry and waypoints read out. */
const readCells = (model) => {
  const root = model.root ?? {};
  const wrapped = [...asArray(root.UserObject), ...asArray(root.object)].map((object) => ({...asArray(object.mxCell)[0], id: object.id, value: object.label ?? object.value ?? ''}));
  return [...asArray(root.mxCell), ...wrapped].map((cell) => {
    const geo = cell.mxGeometry ?? {};
    const points = asArray(geo.mxPoint);
    const named = (as) => points.find((point) => point.as === as);
    const pair = (point) => (point ? [num(point.x), num(point.y)] : undefined);
    return {
      id: String(cell.id), parent: cell.parent === undefined ? undefined : String(cell.parent), value: cell.value ?? '', style: parseStyle(cell.style),
      vertex: cell.vertex === '1', edge: cell.edge === '1', source: cell.source, target: cell.target,
      geo: {x: num(geo.x), y: num(geo.y), w: num(geo.width), h: num(geo.height)},
      waypoints: asArray(geo.Array?.mxPoint).map(pair), sourcePoint: pair(named('sourcePoint')), targetPoint: pair(named('targetPoint')),
    };
  });
};

/** Each cell's absolute origin: the sum of its containers' positions (layers sit at 0, 0). */
const origins = (cells) => {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const memo = new Map();
  const origin = (id) => {
    if (memo.has(id)) return memo.get(id);
    const cell = byId.get(id);
    // The root (no parent) and layers (children of the root) have no position of their own.
    const result = !cell || cell.parent === undefined || !byId.get(cell.parent)?.parent ? [0, 0] : (() => {
      const [px, py] = origin(cell.parent);
      return cell.vertex ? [px + cell.geo.x, py + cell.geo.y] : [px, py];
    })();
    memo.set(id, result);
    return result;
  };
  return (id) => {
    const cell = byId.get(id);
    return cell?.parent === undefined ? [0, 0] : origin(cell.parent);
  };
};

const hex = (color) => (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined);
const rgb = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
/** Which lane a colour reads as: green for reads, blue for writes, grey for telemetry, anything else plain. */
export const laneOf = (color) => {
  const value = hex(color);
  if (!value) return 'plain';
  const [r, g, b] = rgb(value);
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  if (max - min < 24) return max > 110 ? 'telemetry' : 'plain';
  if (g > r + 30 && g >= b) return 'read';
  if (b > r + 30 && b > g) return 'write';
  return 'plain';
};

const filled = (style) => {
  const fill = hex(style.fillColor);
  return Boolean(fill && fill !== '#ffffff');
};

const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 3).join('-');
/** draw.io's generated ids ("Xk3_aB-12") say nothing; a readable one ("app-service") is kept. */
const readable = (id) => /^[a-z][a-z0-9-]{1,30}$/.test(id) && !/-\d+$/.test(id) && !/\d{3,}/.test(id);

/**
 * The icon a draw.io image refers to, by its file name: draw.io's azure2 and
 * mscae stencils name the same services as the official icon set
 * (Cache_Redis, Azure_Cache_for_Redis, Azure_Managed_Redis are all Redis).
 */
export const AZURE_ICONS = {
  appservices: 'azure/app-service', appservice: 'azure/app-service', webapp: 'azure/app-service',
  azurecosmosdb: 'azure/cosmos-db', cosmosdb: 'azure/cosmos-db',
  cacheredis: 'azure/managed-redis', azurecacheforredis: 'azure/managed-redis', azuremanagedredis: 'azure/managed-redis', rediscache: 'azure/managed-redis', cacheredisproduct: 'azure/managed-redis',
  functionapps: 'azure/function-app', functionapp: 'azure/function-app', functions: 'azure/function-app',
  privateendpoint: 'azure/private-endpoint', privateendpoints: 'azure/private-endpoint',
  monitor: 'azure/monitor', azuremonitor: 'azure/monitor',
  virtualnetworks: 'azure/virtual-network', virtualnetwork: 'azure/virtual-network',
  browser: 'azure/browser',
};
export const FALLBACK_ICON = 'generic/component';

/** An image reference resolved to an icon: a known stencil, an embedded SVG to save, or the fallback. */
const resolveIcon = (image, assets, report) => {
  if (image.startsWith('data:image/svg+xml')) {
    const [, meta = '', data = ''] = /^data:image\/svg\+xml([^,]*),(.*)$/s.exec(image) ?? [];
    const svg = meta.includes('base64') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data);
    const name = crypto.createHash('sha1').update(svg).digest('hex').slice(0, 10);
    assets.set(`icons/drawio/${name}.svg`, svg);
    return `drawio/${name}`;
  }
  if (image.startsWith('data:')) {
    report.guesses.push(`an embedded ${image.slice(5, image.indexOf(';'))} image can't be used (SVG only); drew the generic icon instead`);
    return FALLBACK_ICON;
  }
  const stem = image.split(/[/\\]/).at(-1).replace(/\.[a-z]+$/i, '').replace(/^\d+-icon-service-/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (AZURE_ICONS[stem]) return AZURE_ICONS[stem];
  report.unmappedIcons.push(image);
  return FALLBACK_ICON;
};

const round = (value) => Math.round(value * 10) / 10;
const center = (box) => [box.x + box.w / 2, box.y + box.h / 2];
const inside = (box, [x, y]) => x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
const contains = (outer, inner) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;
/** The gap between two boxes (0 when they touch or overlap). */
const gap = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));

/** Where a route leaves (or enters) a box: a fixed connection point if the style names one, else the side facing `toward`. */
const attach = (box, style, prefix, toward) => {
  const fx = style[`${prefix}X`];
  const fy = style[`${prefix}Y`];
  if (fx !== undefined && fy !== undefined) return {point: [box.x + num(fx) * box.w + num(style[`${prefix}Dx`]), box.y + num(fy) * box.h + num(style[`${prefix}Dy`])], vertical: num(fy) === 0 || num(fy) === 1};
  const [cx, cy] = center(box);
  const [tx, ty] = toward;
  // Straight across when the other end lines up with the box; otherwise from the middle of the facing side.
  if (tx >= box.x && tx <= box.x + box.w && Math.abs(ty - cy) > box.h / 2) return {point: [tx, ty < cy ? box.y : box.y + box.h], vertical: true};
  if (ty >= box.y && ty <= box.y + box.h && Math.abs(tx - cx) > box.w / 2) return {point: [tx < cx ? box.x : box.x + box.w, ty], vertical: false};
  const vertical = Math.abs(ty - cy) / box.h > Math.abs(tx - cx) / box.w;
  return {point: vertical ? [cx, ty < cy ? box.y : box.y + box.h] : [tx < cx ? box.x : box.x + box.w, cy], vertical};
};

/** Corners added so every segment of an orthogonal route is horizontal or vertical. */
const orthogonalize = (points, leaveVertical, arriveVertical) => {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [out.at(-1), points[i]];
    if (Math.abs(a[0] - b[0]) > .5 && Math.abs(a[1] - b[1]) > .5) {
      const last = i === points.length - 1;
      const first = i === 1;
      // Leave the source the way it faces, and arrive at the target the way it faces.
      const verticalFirst = first ? leaveVertical : last ? !arriveVertical : Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
      out.push(verticalFirst ? [a[0], b[1]] : [b[0], a[1]]);
    }
    out.push(b);
  }
  // Drop repeated points and corners that lie on a straight run.
  return out.filter((point, i) => i === 0 || Math.hypot(point[0] - out[i - 1][0], point[1] - out[i - 1][1]) > .5)
    .filter((point, i, list) => i === 0 || i === list.length - 1 || !((point[0] === list[i - 1][0] && point[0] === list[i + 1][0]) || (point[1] === list[i - 1][1] && point[1] === list[i + 1][1])));
};

/**
 * A draw.io page as an architecture spec. Returns {spec, assets, report}:
 * `assets` are embedded icons to save under public/ (path → SVG), `report`
 * counts what was found and lists every guess and unmapped icon.
 */
export const importDrawio = (xml, {page, look = 'clean', file = 'diagram.drawio'} = {}) => {
  const pages = drawioPages(xml);
  const chosen = page === undefined ? pages[0] : pages.find((item) => item.name === page) ?? pages[Number(page)];
  if (!chosen) throw new Error(`No page "${page}" in ${file}. Pages: ${pages.map((item) => item.name).join(', ')}`);
  const report = {page: chosen.name, pages: pages.map((item) => item.name), guesses: [], unmappedIcons: []};
  const assets = new Map();
  const cells = readCells(chosen.model);
  const originOf = origins(cells);
  const vertices = cells.filter((cell) => cell.vertex && cell.geo.w > 0 && cell.geo.h > 0).map((cell) => {
    const [ox, oy] = originOf(cell.id);
    return {...cell, box: {x: ox + cell.geo.x, y: oy + cell.geo.y, w: cell.geo.w, h: cell.geo.h}, text: plainText(cell.value)};
  });
  const childrenOf = (id) => vertices.filter((cell) => cell.parent === id);

  const isImage = (cell) => typeof cell.style.image === 'string';
  const isText = (cell) => !isImage(cell) && (cell.style.text === true || (!filled(cell.style) && cell.style.strokeColor === 'none' && cell.text));
  const isBadge = (cell) => !isImage(cell) && !isText(cell) && cell.box.w <= 40 && cell.box.h <= 40 && filled(cell.style) && (cell.text === '' || /^\d{1,2}$/.test(cell.text));
  const icons = vertices.filter(isImage);
  const isTile = (cell) => !isImage(cell) && !isText(cell) && !isBadge(cell) && !cell.text && filled(cell.style) && childrenOf(cell.id).length === 0
    && icons.filter((icon) => inside(cell.box, center(icon.box))).length === 1 && !vertices.some((other) => other !== cell && !isImage(other) && !isText(other) && contains(cell.box, other.box) && !isBadge(other));
  const isGroup = (cell) => !isImage(cell) && !isText(cell) && !isBadge(cell) && !isTile(cell)
    && (cell.style.container === '1' || cell.style.swimlane === true || cell.style.group === true || childrenOf(cell.id).length > 0 || (!filled(cell.style) && vertices.some((other) => other !== cell && contains(cell.box, other.box))));

  const used = new Set();
  const ids = new Set();
  const nameFor = (cell, fallback) => {
    let base = readable(cell.id) ? cell.id : slug(fallback) || 'item';
    if (!/^[a-z]/.test(base)) base = `n-${base}`;
    let name = base;
    for (let i = 2; ids.has(name); i++) name = `${base}-${i}`;
    ids.add(name);
    return name;
  };
  const texts = vertices.filter(isText);
  /** The nearest unclaimed text box within `reach` of `box`, preferring text to the right of or below it. */
  const claimText = (box, reach) => {
    const options = texts.filter((cell) => !used.has(cell.id) && gap(box, cell.box) <= reach)
      .map((cell) => ({cell, score: gap(box, cell.box) + (cell.box.x + 2 >= box.x + box.w || cell.box.y + 2 >= box.y + box.h ? 0 : 6)}))
      .sort((a, b) => a.score - b.score);
    if (!options.length) return undefined;
    used.add(options[0].cell.id);
    return options[0].cell;
  };

  // Steps and the legend first: their text sits closest to them.
  const steps = [];
  const legend = [];
  const laneOfBadge = (cell) => {
    const lane = laneOf(cell.style.fillColor);
    if (lane === 'read' || lane === 'write') return lane;
    const guess = cell.style.ellipse === true || cell.style.shape === 'ellipse' ? 'read' : 'write';
    report.guesses.push(`badge "${cell.text || cell.id}" isn't green or blue; read it as a ${guess} step from its shape`);
    return guess;
  };
  for (const cell of vertices.filter(isBadge).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    used.add(cell.id);
    const lane = laneOfBadge(cell);
    const text = claimText(cell.box, 24);
    const at = center(cell.box).map(round);
    if (!cell.text) {
      if (text) legend.push({lane, text: text.text.split('\n')[0].slice(0, 30), at});
      else report.guesses.push(`an unnumbered badge at ${at.join(', ')} has no text beside it; left out`);
      continue;
    }
    const n = Number(cell.text);
    let id = `${lane[0]}${n}`;
    for (let i = 2; ids.has(id); i++) id = `${lane[0]}${n}-${i}`;
    ids.add(id);
    if (!text) report.guesses.push(`step ${lane} ${n} has no text beside it; wrote "Step ${n}"`);
    steps.push({id, n, lane, at, text: (text?.text ?? `Step ${n}`).slice(0, 80), textAt: text ? center(text.box).map(round) : [round(at[0] + 50), at[1]]});
  }
  if (legend.length > 2) legend.splice(2);

  // Boundaries, and the grey tiles behind single icons.
  const groups = [];
  const tiles = vertices.filter(isTile);
  for (const cell of vertices.filter(isGroup)) {
    const dashed = cell.style.dashed === '1';
    const pattern = String(cell.style.dashPattern ?? '');
    const dotted = dashed && /^\s*[0-3](\s|$)/.test(pattern);
    const label = cell.text ? cell.text.split('\n').join(' ').slice(0, 80) : undefined;
    const left = cell.style.align === undefined || cell.style.align === 'left';
    groups.push({
      id: nameFor(cell, label ?? 'group'),
      ...(label ? {label, labelAt: [round(left ? cell.box.x + num(cell.style.spacingLeft, 4) + 2 : cell.box.x + cell.box.w / 2 - label.length * 3.5), round(cell.box.y + num(cell.style.spacingTop, 4) + 11)]} : {}),
      box: {x: round(cell.box.x), y: round(cell.box.y), w: round(cell.box.w), h: round(cell.box.h)},
      style: dotted ? 'dotted' : 'dashed',
      color: hex(cell.style.strokeColor) ?? '#7f7f7f',
      cell: cell.id,
    });
    if (!dashed) report.guesses.push(`"${label ?? cell.id}" is a solid box holding other shapes; drew it as a dashed boundary`);
  }

  // Components: icons, then plain shapes. A label is the cell's own text, or a text box right beside it.
  const nodes = [];
  const nodeOfCell = new Map();
  const edgeCells = cells.filter((cell) => cell.edge);
  const connected = new Set(edgeCells.flatMap((cell) => [cell.source, cell.target]).filter(Boolean));
  for (const cell of icons) {
    // A small unlabelled icon on a boundary's edge is that boundary's badge (the virtual network sign).
    const group = groups.find((item) => !item.icon && gap(item.box, cell.box) < 30 && !inside({...item.box, x: item.box.x + 30, y: item.box.y + 30, w: item.box.w - 60, h: item.box.h - 60}, center(cell.box)));
    if (!cell.text && !connected.has(cell.id) && group && Math.max(cell.box.w, cell.box.h) <= 48) {
      Object.assign(group, {icon: resolveIcon(cell.style.image, assets, report), iconAt: center(cell.box).map(round)});
      continue;
    }
    const own = cell.text;
    const text = own ? undefined : claimText(cell.box, 24);
    const label = own || text?.text || '';
    if (!label) report.guesses.push(`the ${cell.style.image.split('/').at(-1)} icon has no label`);
    const lines = Math.max(1, label.split('\n').length);
    const position = cell.style.labelPosition;
    const vertical = cell.style.verticalLabelPosition ?? 'bottom';
    const [cx, cy] = center(cell.box);
    let labelAt = text ? center(text.box) : vertical === 'top' ? [cx, cell.box.y - 4 - lines * 9] : position === 'left' ? [cell.box.x - 8, cy] : position === 'right' ? [cell.box.x + cell.box.w + 8, cy] : [cx, cell.box.y + cell.box.h + 4 + lines * 9];
    const align = text ? 'center' : position === 'left' ? 'right' : position === 'right' ? 'left' : 'center';
    const tile = tiles.find((item) => inside(item.box, [cx, cy]));
    const name = nameFor(cell, label.split('\n')[0] || cell.style.image.split('/').at(-1).replace(/\.\w+$/, ''));
    nodes.push({
      id: name, label: (label || name).slice(0, 80), icon: resolveIcon(cell.style.image, assets, report), at: [round(cx), round(cy)], size: round(Math.min(160, Math.max(16, Math.max(cell.box.w, cell.box.h)))),
      labelAt: labelAt.map(round), align, ...(tile ? {tile: {x: round(tile.box.x), y: round(tile.box.y), w: round(tile.box.w), h: round(tile.box.h)}} : {}),
    });
    nodeOfCell.set(cell.id, name);
    if (tile) nodeOfCell.set(tile.id, name);
  }
  const groupCells = new Set(groups.map((group) => group.cell));
  for (const cell of vertices) {
    if (isImage(cell) || isText(cell) || isBadge(cell) || isTile(cell) || groupCells.has(cell.id) || used.has(cell.id)) continue;
    const label = cell.text || claimText(cell.box, 12)?.text || '';
    const kind = cell.style.ellipse === true || cell.style.shape === 'ellipse' ? 'ellipse' : 'rect';
    const name = nameFor(cell, label.split('\n')[0] || kind);
    nodes.push({
      id: name, label: (label || name).slice(0, 80), at: center(cell.box).map(round), labelAt: center(cell.box).map(round), align: 'center',
      shape: {kind, w: round(cell.box.w), h: round(cell.box.h), fill: hex(cell.style.fillColor) ?? 'none', stroke: cell.style.strokeColor === 'none' ? 'none' : hex(cell.style.strokeColor) ?? '#1b1b1b', rounded: cell.style.rounded === '1'},
    });
    nodeOfCell.set(cell.id, name);
  }

  // Routes: absolute points from the edge's container, the ends at their boxes' sides or fixed points.
  const boxOfCell = (id) => vertices.find((cell) => cell.id === id)?.box;
  const edges = [];
  for (const cell of edgeCells) {
    const [ox, oy] = originOf(cell.id);
    const shift = ([x, y]) => [x + ox, y + oy];
    const waypoints = cell.waypoints.map(shift);
    const [sourceBox, targetBox] = [boxOfCell(cell.source), boxOfCell(cell.target)];
    const sourceEnd = !sourceBox && cell.sourcePoint ? shift(cell.sourcePoint) : undefined;
    const targetEnd = !targetBox && cell.targetPoint ? shift(cell.targetPoint) : undefined;
    if ((!sourceBox && !sourceEnd) || (!targetBox && !targetEnd)) {
      report.guesses.push(`an edge (${cell.id}) isn't attached at one end and has no end point; left out`);
      continue;
    }
    const towardStart = waypoints[0] ?? (targetBox ? center(targetBox) : targetEnd);
    const towardEnd = waypoints.at(-1) ?? (sourceBox ? center(sourceBox) : sourceEnd);
    const start = sourceBox ? attach(sourceBox, cell.style, 'exit', towardStart) : {point: sourceEnd, vertical: false};
    const end = targetBox ? attach(targetBox, cell.style, 'entry', towardEnd) : {point: targetEnd, vertical: false};
    const orthogonal = /orthogonal|elbow/i.test(String(cell.style.edgeStyle ?? ''));
    let points = [start.point, ...waypoints, end.point];
    if (orthogonal) points = orthogonalize(points, start.vertical, end.vertical);
    if (orthogonal && !waypoints.length && points.length > 2) report.guesses.push(`route ${cell.id} had no waypoints; drew draw.io's elbow as best matched`);
    const from = nodeOfCell.get(cell.source) ?? groups.find((group) => group.cell === cell.source)?.id ?? 'start';
    const to = nodeOfCell.get(cell.target) ?? groups.find((group) => group.cell === cell.target)?.id ?? 'end';
    let id = readable(cell.id) ? cell.id : `${from}-to-${to}`.slice(0, 40).replace(/-+$/, '');
    for (let i = 2; ids.has(id); i++) id = `${from}-to-${to}-${i}`;
    ids.add(id);
    edges.push({id, points: points.map(([x, y]) => [round(x), round(y)]), lane: laneOf(cell.style.strokeColor ?? '#000000'), arrow: cell.style.endArrow !== 'none'});
    if (plainText(cell.value)) report.guesses.push(`route ${id}'s label "${plainText(cell.value).slice(0, 30)}" was kept as a free label at its middle`) ;
    if (plainText(cell.value)) texts.push({id: `${cell.id}-label`, box: {x: points[Math.floor(points.length / 2)][0] - 30, y: points[Math.floor(points.length / 2)][1] - 9, w: 60, h: 18}, text: plainText(cell.value)});
  }

  // What's left of the text is free labels.
  const labels = texts.filter((cell) => !used.has(cell.id)).map((cell) => ({id: nameFor(cell, cell.text.split('\n')[0]), text: cell.text.slice(0, 80), at: center(cell.box).map(round)}));

  // Shift everything so the picture starts a margin from the top left, and size the source to fit.
  const allPoints = [
    ...nodes.flatMap((node) => [node.at, node.labelAt]), ...nodes.filter((node) => node.tile).flatMap((node) => [[node.tile.x, node.tile.y], [node.tile.x + node.tile.w, node.tile.y + node.tile.h]]),
    ...groups.flatMap((group) => [[group.box.x, group.box.y], [group.box.x + group.box.w, group.box.y + group.box.h]]),
    ...edges.flatMap((edge) => edge.points), ...steps.flatMap((step) => [step.at, step.textAt]), ...labels.map((label) => label.at), ...legend.map((item) => item.at),
  ];
  const MARGIN = 40;
  const [minX, minY] = [Math.min(...allPoints.map(([x]) => x)) - MARGIN, Math.min(...allPoints.map(([, y]) => y)) - MARGIN];
  const move = ([x, y]) => [round(x - minX), round(y - minY)];
  const moveBox = (box) => ({...box, x: round(box.x - minX), y: round(box.y - minY)});
  const spec = {
    theme: 'architecture', look,
    source: {kind: 'drawio', file, width: Math.ceil(Math.max(...allPoints.map(([x]) => x)) - minX + MARGIN), height: Math.ceil(Math.max(...allPoints.map(([, y]) => y)) - minY + MARGIN)},
    nodes: nodes.map((node) => ({...node, at: move(node.at), labelAt: move(node.labelAt), ...(node.tile ? {tile: moveBox(node.tile)} : {})})),
    groups: groups.map(({cell, ...group}) => ({...group, box: moveBox(group.box), ...(group.labelAt ? {labelAt: move(group.labelAt)} : {}), ...(group.iconAt ? {iconAt: move(group.iconAt)} : {})})),
    edges: edges.map((edge) => ({...edge, points: edge.points.map(move)})),
    steps: steps.map((step) => ({...step, at: move(step.at), textAt: move(step.textAt)})),
    labels: labels.map((label) => ({...label, at: move(label.at)})),
    legend: legend.map((item) => ({...item, at: move(item.at)})),
  };
  Object.assign(report, {nodes: spec.nodes.length, groups: spec.groups.length, edges: spec.edges.length, steps: spec.steps.length, labels: spec.labels.length, legend: spec.legend.length, icons: assets.size});
  return {spec, assets: Object.fromEntries(assets), report};
};
