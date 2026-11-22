const svgNamespace = 'http://www.w3.org/2000/svg';
const formats = {
  square: { width: 800, height: 800 },
  landscape: { width: 960, height: 600 },
  portrait: { width: 600, height: 960 },
};
const paintAttributes = ['fill', 'stroke', 'stop-color'];
const paletteRoles = {
  background: '#d7cdf5',
  accentLight: '#f9ecb0',
  backgroundMid: '#aa9bf0',
  accent: '#f9a3aa',
  backgroundDark: '#7864d7',
  accentSoft: '#ffe3e1',
  ink: '#181817',
  paper: '#ffffff',
};
const baseColors = Object.values(paletteRoles);
const palettes = {
  original: baseColors,
  peach: ['#fdd7b9', '#f9ecb0', '#fac896', '#80dada', '#d27532', '#beebeb', '#181817', '#ffffff'],
  mint: ['#beebeb', '#ffd4f2', '#80dada', '#6d7bfc', '#5abebe', '#b6c6fe', '#181817', '#ffffff'],
};
const size = document.querySelector('#size');
const format = document.querySelector('#format');
const role = document.querySelector('#role');
const assets = document.querySelector('#assets');
const preview = document.querySelector('#preview');
const artboard = document.querySelector('#artboard');
const empty = document.querySelector('#empty');
const download = document.querySelector('#download');
const layers = document.querySelector('#layers');
const status = document.querySelector('#status');
const objectControls = document.querySelector('#object-controls');
const selectedName = document.querySelector('#selected-name');
const coordinates = {
  x: document.querySelector('#object-x'),
  y: document.querySelector('#object-y'),
  angle: document.querySelector('#object-angle'),
};
const forward = document.querySelector('#forward');
const backward = document.querySelector('#backward');
const duplicate = document.querySelector('#duplicate');
const palette = document.querySelector('#palette');
const customOption = palette.querySelector('option[value="custom"]');
const paletteFile = document.querySelector('#palette-file');
const paletteResult = document.querySelector('#palette-result');
const swatches = document.querySelector('#swatches');
const assembly = document.querySelector('#assembly');
const assemblyMode = document.querySelector('#assembly-mode');
const assemblyLabel = document.querySelector('#assembly-label');
const assemblyQuery = document.querySelector('#assembly-query');
const assemblyHelp = document.querySelector('#assembly-help');
const assemblyResult = document.querySelector('#assembly-result');
const serializer = new XMLSerializer();
const parser = new DOMParser();
const objects = [];
const measuredAssets = new Map();
let nextObjectId = 1;
let colors = new Map();
let customColors = new Map();
let paletteRequest = 0;
let assemblySource;
let selectedId;
let manualLayout = false;
let sceneScale = 1;
let drag;
let stage = formats[format.value];

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  return element;
}

function paintKey(value) {
  const color = value?.toLowerCase();
  if (color === 'white') return '#ffffff';
  if (color === 'black') return '#000000';
  if (/^#[a-f0-9]{6}$/.test(color)) return color;
  if (/^#[a-f0-9]{3}$/.test(color)) return '#' + [...color.slice(1)].map(char => char.repeat(2)).join('');
  return null;
}

function readPalette(text) {
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Не удалось прочитать JSON. Проверьте синтаксис файла.');
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('Палитра должна быть JSON-объектом из шаблона.');
  }
  const roles = Object.entries(paletteRoles);
  const invalid = roles.filter(([role]) =>
    !Object.hasOwn(data, role) || typeof data[role] !== 'string' ||
    !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(data[role].trim())
  );
  if (invalid.length) {
    throw new Error(`Укажите HEX-цвет для полей: ${invalid.map(([role]) => role).join(', ')}.`);
  }
  const unknown = Object.keys(data).filter(role => !Object.hasOwn(paletteRoles, role));
  if (unknown.length) throw new Error(`Неизвестные поля: ${unknown.join(', ')}.`);
  return new Map(roles.map(([role, source]) => [source, paintKey(data[role].trim())]));
}

function setCustomColors(nextColors) {
  customColors = nextColors;
  colors = nextColors;
  customOption.disabled = false;
  palette.value = 'custom';
}

function showPaletteResult(message, error = false) {
  paletteResult.textContent = message;
  paletteResult.hidden = !message;
  paletteResult.dataset.error = String(error);
}

function getAsset(key, detail, layerRole) {
  const cacheKey = `${key}/${detail}/${layerRole}`;
  if (measuredAssets.has(cacheKey)) return measuredAssets.get(cacheKey);

  const markup = illustrationLibrary[key][detail][layerRole];
  const xml = parser.parseFromString(`<svg xmlns="${svgNamespace}">${markup}</svg>`, 'image/svg+xml');
  const group = document.importNode(xml.documentElement.firstElementChild, true);
  const measurement = svgElement('svg', { class: 'measurement', 'aria-hidden': 'true', fill: 'none' });
  measurement.append(group);
  document.body.append(measurement);
  const { x, y, width, height } = group.getBBox();
  measurement.remove();
  const asset = { group, x, y, width, height };
  measuredAssets.set(cacheKey, asset);
  return asset;
}

function renderLibrary() {
  const buttons = Object.entries(illustrationLibrary).map(([key, entry]) => {
    const asset = getAsset(key, size.value, role.value);
    const icon = svgElement('svg', {
      viewBox: [asset.x, asset.y, asset.width, asset.height].join(' '),
      fill: 'none',
      'aria-hidden': 'true',
    });
    icon.append(asset.group.cloneNode(true));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset';
    button.append(icon, entry.name);
    button.addEventListener('click', () => {
      const offset = objects.length % 5 * 20;
      const object = newObject(key, role.value, stage.width / 2 + offset, stage.height / 2 + offset);
      objects.push(object);
      selectedId = object.id;
      if (!manualLayout) arrangeObjects();
      render();
    });
    return button;
  });
  assets.replaceChildren(...buttons);
}

function recolor(group) {
  for (const element of [group, ...group.querySelectorAll('*')]) {
    for (const attribute of paintAttributes) {
      const color = colors.get(paintKey(element.getAttribute(attribute)));
      if (color) element.setAttribute(attribute, color);
    }
  }
}

function newObject(key, role, x = 0, y = 0) {
  return { key, role, id: nextObjectId++, x, y, angle: 0 };
}

function arrangeObjects() {
  if (!objects.length) return;
  const dimensions = objects.map(object => objectDimensions(object));
  const columnLimit = format.value === 'landscape' || objects.length > 6 ? 3
    : format.value === 'portrait' && objects.length <= 3 ? 1 : 2;
  const columns = Math.min(objects.length, columnLimit);
  const rows = Math.ceil(objects.length / columns);
  const cellWidth = stage.width / columns;
  const cellHeight = stage.height / rows;
  sceneScale = Math.min(
    cellWidth * 0.82 / Math.max(...dimensions.map(asset => asset.width)),
    cellHeight * 0.76 / Math.max(...dimensions.map(asset => asset.height)),
  );
  objects.forEach((object, index) => {
    const row = Math.floor(index / columns);
    const itemsInRow = Math.min(columns, objects.length - row * columns);
    object.x = (stage.width - itemsInRow * cellWidth) / 2 + (index % columns + 0.5) * cellWidth;
    object.y = (row + 0.5) * cellHeight;
  });
}

function objectDimensions(object) {
  const large = getAsset(object.key, 'L', object.role);
  const small = getAsset(object.key, 'S', object.role);
  return { width: large.width, height: Math.max(large.height, small.height * large.width / small.width) };
}

function compositionBounds() {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const object of objects) {
    const { width, height } = objectDimensions(object);
    const angle = object.angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const halfWidth = (width * cos + height * sin) * sceneScale / 2;
    const halfHeight = (width * sin + height * cos) * sceneScale / 2;
    bounds.left = Math.min(bounds.left, object.x - halfWidth);
    bounds.right = Math.max(bounds.right, object.x + halfWidth);
    bounds.top = Math.min(bounds.top, object.y - halfHeight);
    bounds.bottom = Math.max(bounds.bottom, object.y + halfHeight);
  }
  return bounds;
}

function fitManualLayout(previousStage) {
  const { left, top, right, bottom } = compositionBounds();
  const fitScale = ({ width, height }) => Math.min(
    width * 0.9 / (right - left),
    height * 0.9 / (bottom - top),
  );
  const scale = fitScale(stage) / Math.max(1, fitScale(previousStage));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  for (const object of objects) {
    object.x = stage.width / 2 + (object.x - centerX) * scale;
    object.y = stage.height / 2 + (object.y - centerY) * scale;
  }
  sceneScale *= scale;
}

function transformFor(object, asset) {
  const reference = getAsset(object.key, 'L', object.role);
  const scale = sceneScale * reference.width / asset.width;
  const centerX = asset.x + asset.width / 2;
  const centerY = asset.y + asset.height / 2;
  return `translate(${object.x} ${object.y}) rotate(${object.angle}) scale(${scale}) translate(${-centerX} ${-centerY})`;
}

function createScene() {
  const scene = svgElement('svg', {
    width: stage.width, height: stage.height, viewBox: `0 0 ${stage.width} ${stage.height}`, fill: 'none',
  });
  scene.append(svgElement('rect', {
    id: 'canvas-background', width: stage.width, height: stage.height,
    fill: colors.get(paletteRoles.background) ?? paletteRoles.background,
  }));

  for (const object of objects) {
    const asset = getAsset(object.key, size.value, object.role);
    const group = svgElement('g', {
      id: `${object.key}-${object.id}`,
      transform: transformFor(object, asset),
    });
    group.append(asset.group.cloneNode(true));
    recolor(group);
    scene.append(group);
  }
  return scene;
}

function renderCanvas() {
  if (download.hasAttribute('href')) URL.revokeObjectURL(download.href);
  preview.toggleAttribute('hidden', objects.length === 0);
  empty.hidden = objects.length > 0;
  download.setAttribute('aria-disabled', String(objects.length === 0));
  if (objects.length === 0) {
    download.removeAttribute('href');
    download.removeAttribute('download');
    preview.replaceChildren();
    return;
  }
  const scene = createScene();
  const svg = serializer.serializeToString(scene);
  const sceneUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const children = [...scene.children];
  children[0].removeAttribute('id');
  objects.forEach((object, index) => {
    children[index + 1].removeAttribute('id');
    children[index + 1].dataset.objectId = object.id;
  });
  preview.replaceChildren(...children);
  renderOutline();
  download.href = sceneUrl;
  const filename = assemblySource ? `illustration-${assemblySource}` : 'illustration';
  download.download = `${filename}-${format.value}-${size.value.toLowerCase()}.svg`;
}

function renderLayers() {
  const activeId = document.activeElement?.dataset.layerId;
  const items = objects.map((object, index) => {
    const name = illustrationLibrary[object.key].name;
    const item = document.createElement('li');
    item.className = 'layer';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'layer-select';
    title.dataset.layerId = object.id;
    title.setAttribute('aria-pressed', String(object.id === selectedId));
    title.textContent = name;
    title.addEventListener('click', () => selectObject(object.id));
    const layerRole = document.createElement('small');
    layerRole.textContent = object.role === 'primary' ? 'Главный' : 'Фоновый';
    title.append(layerRole);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Удалить ${name}`);
    remove.addEventListener('click', () => {
      objects.splice(index, 1);
      if (selectedId === object.id) selectedId = objects.at(-1)?.id;
      if (!objects.length) manualLayout = false;
      if (!manualLayout) arrangeObjects();
      render();
    });
    item.append(title, remove);
    return item;
  });
  layers.replaceChildren(...items.reverse());
  if (activeId) layers.querySelector(`[data-layer-id="${activeId}"]`)?.focus({ preventScroll: true });
  const dimensions = `${stage.width} × ${stage.height}`;
  status.textContent = objects.length
    ? `${dimensions} · Объекты: ${objects.length} · ${size.value}`
    : `Холст ${dimensions}`;
}

function renderSwatches() {
  const present = new Set([paletteRoles.background]);
  for (const object of objects) {
    const { group } = getAsset(object.key, size.value, object.role);
    for (const element of [group, ...group.querySelectorAll('*')]) {
      for (const attribute of paintAttributes) {
        const color = paintKey(element.getAttribute(attribute));
        if (color) present.add(color);
      }
    }
  }
  const pickers = [...present].map(color => {
    const label = document.createElement('label');
    label.className = 'swatch';
    label.textContent = color.toUpperCase();
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = colors.get(color) ?? color;
    picker.addEventListener('input', () => {
      paletteRequest++;
      const nextColors = new Map(colors);
      nextColors.set(color, picker.value);
      setCustomColors(nextColors);
      showPaletteResult('');
      renderCanvas();
    });
    label.append(picker);
    return label;
  });
  swatches.replaceChildren(...pickers);
}

function render() {
  renderCanvas();
  renderLayers();
  renderSwatches();
  renderObjectControls();
}

function selectedObject() {
  return objects.find(object => object.id === selectedId);
}

function renderOutline() {
  preview.querySelector('[data-selection]')?.remove();
  const object = selectedObject();
  if (!object) return;
  const asset = getAsset(object.key, size.value, object.role);
  preview.append(svgElement('rect', {
    'data-selection': '', x: asset.x, y: asset.y, width: asset.width, height: asset.height,
    transform: transformFor(object, asset), fill: 'none', stroke: '#3666e6',
    'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
  }));
}

function renderObjectControls() {
  const object = selectedObject();
  objectControls.hidden = !object;
  if (!object) return;
  selectedName.textContent = illustrationLibrary[object.key].name;
  for (const [key, input] of Object.entries(coordinates)) {
    input.value = Math.round(object[key] * 100) / 100;
  }
  const index = objects.indexOf(object);
  forward.disabled = index === objects.length - 1;
  backward.disabled = index === 0;
}

function selectObject(id) {
  selectedId = id;
  renderLayers();
  renderObjectControls();
  renderOutline();
}

for (const [key, input] of Object.entries(coordinates)) {
  input.addEventListener('change', () => {
    const object = selectedObject();
    if (!object) return;
    if (Number.isFinite(input.valueAsNumber)) {
      manualLayout = true;
      object[key] = input.valueAsNumber;
    }
    renderCanvas();
    renderObjectControls();
  });
}

function moveLayer(direction) {
  const index = objects.indexOf(selectedObject());
  const neighbor = index + direction;
  if (index < 0 || neighbor < 0 || neighbor >= objects.length) return;
  manualLayout = true;
  [objects[index], objects[neighbor]] = [objects[neighbor], objects[index]];
  renderCanvas();
  renderLayers();
  renderObjectControls();
}

forward.addEventListener('click', () => moveLayer(1));
backward.addEventListener('click', () => moveLayer(-1));
duplicate.addEventListener('click', () => {
  const object = selectedObject();
  if (!object) return;
  const copy = newObject(object.key, object.role, object.x + 20, object.y + 20);
  copy.angle = object.angle;
  objects.splice(objects.indexOf(object) + 1, 0, copy);
  manualLayout = true;
  selectedId = copy.id;
  render();
});

function canvasPoint(event) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(preview.getScreenCTM().inverse());
}

preview.addEventListener('pointerdown', event => {
  if (event.button !== 0 || drag) return;
  const group = event.target.closest('[data-object-id]');
  selectObject(group ? Number(group.dataset.objectId) : undefined);
  if (!group) return;
  const object = selectedObject();
  const point = canvasPoint(event);
  drag = { object, group, pointerId: event.pointerId, dx: point.x - object.x, dy: point.y - object.y };
  preview.setPointerCapture(event.pointerId);
});

preview.addEventListener('pointermove', event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const { object, group, dx, dy } = drag;
  const point = canvasPoint(event);
  object.x = point.x - dx;
  object.y = point.y - dy;
  manualLayout = true;
  artboard.dataset.dragging = '';
  group.setAttribute('transform', transformFor(object, getAsset(object.key, size.value, object.role)));
  renderOutline();
  renderObjectControls();
});

function finishDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag = undefined;
  delete artboard.dataset.dragging;
  renderCanvas();
}

preview.addEventListener('pointerup', finishDrag);
preview.addEventListener('pointercancel', finishDrag);
preview.addEventListener('lostpointercapture', finishDrag);

function showAssemblyResult(message, error = false) {
  assemblyResult.textContent = message;
  assemblyResult.hidden = !message;
  assemblyResult.dataset.error = String(error);
  if (error) assemblyQuery.setAttribute('aria-invalid', 'true');
  else assemblyQuery.removeAttribute('aria-invalid');
}

assemblyMode.addEventListener('change', () => {
  const byNames = assemblyMode.value === 'names';
  assemblyLabel.textContent = byNames ? 'Названия объектов' : 'Заголовок или метафора';
  assemblyQuery.placeholder = byNames ? 'Телефон, пазлы, монета' : 'Вечер за учёбой';
  assemblyHelp.textContent = byNames
    ? 'Введите названия через запятую. Объекты будут размещены в указанном порядке.'
    : 'Подберёт до трёх объектов по тегам и разместит их на холсте.';
  showAssemblyResult('');
});

assemblyQuery.addEventListener('input', () => showAssemblyResult(''));

assembly.addEventListener('submit', event => {
  event.preventDefault();
  const query = assemblyQuery.value.trim();
  const mode = assemblyMode.value;
  if (!query) {
    showAssemblyResult(mode === 'names' ? 'Введите названия объектов.' : 'Введите заголовок или метафору.', true);
    assemblyQuery.focus();
    return;
  }

  let keys;
  if (mode === 'names') {
    const result = matchObjectsByNames(query, illustrationLibrary);
    if (result.unknown.length) {
      showAssemblyResult(`Не найдены в библиотеке: ${result.unknown.join(', ')}.`, true);
      return;
    }
    keys = result.keys;
  } else {
    keys = matchObjectsByIdea(query, illustrationLibrary);
  }
  if (!keys.length) {
    showAssemblyResult(
      mode === 'names' ? 'Укажите хотя бы одно название из библиотеки.'
        : 'По тегам ничего не найдено. Попробуйте тему вроде «Вечер за учёбой» или «Собери идею».',
      true,
    );
    return;
  }

  assemblySource = mode;
  objects.splice(0, objects.length, ...keys.map(key => newObject(key, 'primary')));
  selectedId = undefined;
  manualLayout = false;
  arrangeObjects();
  render();
  showAssemblyResult(`Подобраны: ${keys.map(key => illustrationLibrary[key].name).join(', ')}.`);
});

format.addEventListener('change', () => {
  const previousStage = stage;
  stage = formats[format.value];
  artboard.style.setProperty('--canvas-ratio', stage.width / stage.height);
  preview.setAttribute('viewBox', `0 0 ${stage.width} ${stage.height}`);
  if (objects.length) {
    if (manualLayout) fitManualLayout(previousStage);
    else arrangeObjects();
  }
  render();
});

size.addEventListener('change', () => {
  renderLibrary();
  render();
});
role.addEventListener('change', renderLibrary);
palette.addEventListener('change', () => {
  paletteRequest++;
  showPaletteResult('');
  const selected = palettes[palette.value];
  colors = selected
    ? new Map(baseColors.map((color, index) => [color, selected[index]]))
    : customColors;
  renderCanvas();
  renderSwatches();
});

paletteFile.addEventListener('change', async () => {
  const file = paletteFile.files[0];
  if (!file) return;
  paletteFile.value = '';
  const request = ++paletteRequest;
  showPaletteResult('');
  try {
    const nextColors = readPalette(await file.text());
    if (request !== paletteRequest) return;
    setCustomColors(nextColors);
    renderCanvas();
    renderSwatches();
    showPaletteResult(`Палитра «${file.name}» применена.`);
  } catch (error) {
    if (request !== paletteRequest) return;
    showPaletteResult(error.message, true);
  }
});

renderLibrary();
render();
