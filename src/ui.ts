import type { UIToPluginMessage, PluginToUIMessage, ModelType, PresetName, NodePluginData } from './types';
import type { FixedSettings, AdaptiveSettings, SmartAdaptiveSettings, ConstraintParams } from './types';
import { PRESETS, DEFAULT_CONSTRAINTS } from './models';

// ─── State ────────────────────────────────────────────────────────────────────

let currentModel: ModelType = 'smartAdaptive';
let currentPreset: PresetName | null = 'Balanced';
let hasReceivedStatus = false;
let lastStatusAt = 0;
let lastHydratedManagedNodeId: string | null = null;
let hasSupportedSelection = false;
let statusMsgTimer: ReturnType<typeof setTimeout> | null = null;
let liveApplyTimer: ReturnType<typeof setTimeout> | null = null;
let managedSelectionCount = 0;
let removeConfirmResolver: ((confirmed: boolean) => void) | null = null;
let removeConfirmSkipPref = false;
const PANEL_PREF_KEY_PREFIX = 'squircle-panel-collapsed-';
type CollapsiblePanelId = 'mode' | 'settings' | 'constraints' | 'actions';
const KNOWN_PREF_KEYS = [
  `${PANEL_PREF_KEY_PREFIX}mode`,
  `${PANEL_PREF_KEY_PREFIX}settings`,
  `${PANEL_PREF_KEY_PREFIX}constraints`,
  `${PANEL_PREF_KEY_PREFIX}actions`,
] as const;

// ─── Messaging ────────────────────────────────────────────────────────────────

function send(msg: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function updateBridgeIndicator(): void {
  const el = document.getElementById('bridge-indicator') as HTMLElement;
  if (!el) return;

  if (!hasReceivedStatus) {
    el.textContent = 'Bridge: UI script loaded, waiting for plugin...';
    return;
  }

  const ageMs = Date.now() - lastStatusAt;
  el.textContent = ageMs < 5000
    ? `Bridge: connected (${Math.round(ageMs / 1000)}s ago)`
    : `Bridge: stale (${Math.round(ageMs / 1000)}s since status)`;
}

function setEditableState(enabled: boolean): void {
  hasSupportedSelection = enabled;

  const sectionIds = ['mode-section', 'settings-section', 'constraints-section'];
  for (const id of sectionIds) {
    const section = document.getElementById(id) as HTMLElement | null;
    if (!section) continue;
    section.classList.toggle('section-disabled', !enabled);
  }

  const modeControls = [
    'tab-fixed',
    'tab-adaptive',
    'tab-smartAdaptive',
    'preset-subtle',
    'preset-balanced',
    'preset-bold',
    'preset-pill-adaptive',
  ];
  for (const id of modeControls) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = !enabled;
  }

  const settingsRoot = document.getElementById('settings-section');
  if (settingsRoot) {
    settingsRoot.querySelectorAll('input, select, button, textarea').forEach((el) => {
      (el as HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement).disabled = !enabled;
    });
  }

  const constraintsRoot = document.getElementById('constraints-section');
  if (constraintsRoot) {
    constraintsRoot.querySelectorAll('input, select, button, textarea').forEach((el) => {
      (el as HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement).disabled = !enabled;
    });
  }

  const applyButton = document.getElementById('btn-apply') as HTMLButtonElement | null;
  if (applyButton) applyButton.disabled = !enabled;
  const refreshSelectionButton = document.getElementById('btn-refresh-sel') as HTMLButtonElement | null;
  if (refreshSelectionButton) refreshSelectionButton.disabled = !enabled;
}

function setPanelPref(panelId: CollapsiblePanelId, collapsed: boolean): void {
  try {
    localStorage.setItem(`${PANEL_PREF_KEY_PREFIX}${panelId}`, collapsed ? 'true' : 'false');
  } catch {
    // Ignore storage errors and continue without persistence.
  }
}

function getPanelPref(panelId: CollapsiblePanelId): boolean | null {
  try {
    const value = localStorage.getItem(`${PANEL_PREF_KEY_PREFIX}${panelId}`);
    if (value === null) return null;
    return value === 'true';
  } catch {
    return null;
  }
}

function setPanelCollapsed(panelId: CollapsiblePanelId, collapsed: boolean, persist: boolean): void {
  const section = document.getElementById(`${panelId}-section`) as HTMLElement | null;
  const toggle = document.getElementById(`${panelId}-toggle`) as HTMLButtonElement | null;
  if (!section || !toggle) return;

  section.classList.toggle('collapsed', collapsed);
  toggle.textContent = collapsed ? '+' : '-';
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${panelId[0].toUpperCase()}${panelId.slice(1)}`);

  if (persist) {
    setPanelPref(panelId, collapsed);
  }
}

function togglePanel(panelId: CollapsiblePanelId): void {
  const section = document.getElementById(`${panelId}-section`) as HTMLElement | null;
  if (!section) return;
  const collapsed = !section.classList.contains('collapsed');
  setPanelCollapsed(panelId, collapsed, true);
}

function loadPanelPrefs(): void {
  const modePref = getPanelPref('mode');
  const settingsPref = getPanelPref('settings');
  const constraintsPref = getPanelPref('constraints');
  const actionsPref = getPanelPref('actions');

  setPanelCollapsed('mode', modePref ?? false, false);
  setPanelCollapsed('settings', settingsPref ?? true, false);
  setPanelCollapsed('constraints', constraintsPref ?? true, false);
  setPanelCollapsed('actions', actionsPref ?? true, false);
}

function togglePrefsPanel(): void {
  const panel = document.getElementById('prefs-panel') as HTMLElement;
  panel.classList.toggle('hidden');
}

function reenableRemoveConfirmations(): void {
  setSkipRemoveConfirm(false);
  showStatusMsg('Remove confirmation dialogs re-enabled.', true);
}

function resetUserPreferences(): void {
  try {
    for (const key of KNOWN_PREF_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors and still refresh UI defaults.
  }

  loadPanelPrefs();
  const prefsPanel = document.getElementById('prefs-panel') as HTMLElement;
  prefsPanel.classList.add('hidden');
  showStatusMsg('User preferences reset to defaults.', true);
}

function setSquirclifyViewState(supportedCount: number, managedCount: number): void {
  const hasSelection = supportedCount > 0;
  const hasManagedSelection = managedCount > 0;

  const onboarding = document.getElementById('onboarding-section') as HTMLElement | null;
  if (onboarding) onboarding.classList.toggle('hidden', !hasSelection || hasManagedSelection);

  const configurableSections = [
    'mode-section',
    'settings-section',
    'constraints-section',
    'actions-section',
  ];
  for (const id of configurableSections) {
    const section = document.getElementById(id) as HTMLElement | null;
    if (!section) continue;
    section.style.display = hasManagedSelection ? '' : 'none';
  }

  const chip = document.getElementById('badge-squirclified') as HTMLElement | null;
  if (chip) {
    chip.style.display = hasManagedSelection ? 'inline-flex' : 'none';
    chip.innerHTML = `<span class="glyph">✦</span>Squirclified ${managedCount}`;
  }

  const removeBadge = document.getElementById('badge-remove') as HTMLButtonElement | null;
  if (removeBadge) {
    removeBadge.style.display = hasManagedSelection ? 'inline-block' : 'none';
    removeBadge.disabled = !hasManagedSelection;
  }

  setEditableState(hasManagedSelection);
}

function scheduleLiveApply(immediate = false): void {
  if (!hasSupportedSelection) return;

  if (liveApplyTimer) {
    clearTimeout(liveApplyTimer);
    liveApplyTimer = null;
  }

  const run = (): void => {
    const msg: UIToPluginMessage = {
      type: 'apply-live',
      model: currentModel,
      preset: currentPreset,
      settings: readSettings(),
      constraints: readConstraints(),
    };
    send(msg);
  };

  if (immediate) {
    run();
    return;
  }

  liveApplyTimer = setTimeout(() => {
    liveApplyTimer = null;
    run();
  }, 160);
}

function shouldTriggerLiveApplyFromEvent(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (!target.closest('#mode-section, #settings-section, #constraints-section')) return false;

  if (target instanceof HTMLInputElement && target.type === 'number') {
    if (target.value.trim() === '' || target.validity.badInput) return false;
  }

  return true;
}

function bindLiveApplyTriggers(): void {
  const roots = ['mode-section', 'settings-section', 'constraints-section'];
  const events: Array<[string, boolean]> = [
    ['keyup', true],
    ['change', true],
    ['mouseup', true],
    ['touchend', true],
  ];

  for (const rootId of roots) {
    const root = document.getElementById(rootId);
    if (!root) continue;

    for (const [eventName, useCapture] of events) {
      root.addEventListener(eventName, (event) => {
        if (!shouldTriggerLiveApplyFromEvent(event)) return;
        scheduleLiveApply(false);
      }, useCapture);
    }
  }
}

function getStepPrecision(step: number): number {
  const text = String(step);
  const idx = text.indexOf('.');
  return idx >= 0 ? text.length - idx - 1 : 0;
}

function formatByStep(value: number, step: number): string {
  const precision = getStepPrecision(step);
  if (precision === 0) return String(Math.round(value));
  return value.toFixed(precision);
}

function bindLabelDragControls(): void {
  const rows = Array.from(document.querySelectorAll('.row'));
  for (const row of rows) {
    const label = row.querySelector('label') as HTMLLabelElement | null;
    const input = row.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (!label || !input) continue;

    label.classList.add('draggable-number-label');

    label.addEventListener('mousedown', (downEvent: MouseEvent) => {
      if (downEvent.button !== 0 || input.disabled || !hasSupportedSelection) return;

      downEvent.preventDefault();
      const startX = downEvent.clientX;
      const initialValue = parseFloat(input.value) || 0;
      const step = parseFloat(input.step || '1') || 1;
      const min = input.min !== '' ? parseFloat(input.min) : Number.NEGATIVE_INFINITY;
      const max = input.max !== '' ? parseFloat(input.max) : Number.POSITIVE_INFINITY;

      const onMove = (moveEvent: MouseEvent): void => {
        const deltaSteps = Math.trunc((moveEvent.clientX - startX) / 4);
        let next = initialValue + (deltaSteps * step);
        next = Math.min(max, Math.max(min, next));
        input.value = formatByStep(next, step);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

function handleIncomingMessage(event: MessageEvent): void {
  const msg = (event.data?.pluginMessage ?? event.data) as PluginToUIMessage | undefined;
  if (!msg) {
    updateBridgeIndicator();
    return;
  }

  hasReceivedStatus = true;
  lastStatusAt = Date.now();
  updateBridgeIndicator();

  switch (msg.type) {
    case 'selection-status': {
      const { supportedCount, managedCount, unsupportedCount, firstManagedData, firstManagedNodeId } = msg.status;
      const hint = document.getElementById('empty-hint') as HTMLElement;
      const badgeSupported = document.getElementById('badge-supported') as HTMLElement;
      const badgeUnsupported = document.getElementById('badge-unsupported') as HTMLElement;

      badgeSupported.textContent = `${supportedCount} frame${supportedCount !== 1 ? 's' : ''}`;
      badgeUnsupported.textContent = `${unsupportedCount} unsupported`;
      badgeUnsupported.style.display = unsupportedCount > 0 ? 'inline-block' : 'none';
      managedSelectionCount = managedCount;

      hint.style.display = supportedCount === 0 ? 'block' : 'none';
      setSquirclifyViewState(supportedCount, managedCount);

      // Load settings from first managed frame
      if (firstManagedData && firstManagedNodeId && firstManagedNodeId !== lastHydratedManagedNodeId) {
        currentModel = firstManagedData.model;
        currentPreset = firstManagedData.preset;
        loadSettingsIntoUI(firstManagedData.model, firstManagedData.settings);
        updateModelUI();
        if (firstManagedData.preset) updatePresetActive(firstManagedData.preset);
        lastHydratedManagedNodeId = firstManagedNodeId;
      }

      if (!firstManagedNodeId) {
        lastHydratedManagedNodeId = null;
      }
      break;
    }
    case 'action-result': {
      showStatusMsg(msg.message, msg.success);
      // Refresh selection status after action
      send({ type: 'get-selection-status' });
      break;
    }
    case 'live-update': {
      const indicator = document.getElementById('live-indicator') as HTMLElement;
      indicator.textContent = `Live: monitoring ${msg.managedCount} frame${msg.managedCount !== 1 ? 's' : ''}`;
      break;
    }
    case 'remove-confirm-skip-pref': {
      removeConfirmSkipPref = msg.skip;
      break;
    }
  }
}

// ─── Model / Preset selection ─────────────────────────────────────────────────

function selectModel(model: ModelType): void {
  currentModel = model;
  currentPreset = null;
  updateModelUI();
  clearPresetActive();
  scheduleLiveApply(false);
}

function applyPreset(name: PresetName): void {
  const preset = PRESETS[name];
  currentModel = preset.model;
  currentPreset = name;
  loadSettingsIntoUI(preset.model, preset.settings as NodePluginData['settings']);
  updateModelUI();
  updatePresetActive(name);
  scheduleLiveApply(true);
}

function updateModelUI(): void {
  (document.getElementById('tab-fixed') as HTMLElement).classList.toggle('active', currentModel === 'fixed');
  (document.getElementById('tab-adaptive') as HTMLElement).classList.toggle('active', currentModel === 'adaptive');
  (document.getElementById('tab-smartAdaptive') as HTMLElement).classList.toggle('active', currentModel === 'smartAdaptive');

  (document.getElementById('panel-fixed') as HTMLElement).style.display = currentModel === 'fixed' ? 'block' : 'none';
  (document.getElementById('panel-adaptive') as HTMLElement).style.display = currentModel === 'adaptive' ? 'block' : 'none';
  (document.getElementById('panel-smartAdaptive') as HTMLElement).style.display = currentModel === 'smartAdaptive' ? 'block' : 'none';
}

function clearPresetActive(): void {
  document.querySelectorAll('.preset-btn').forEach((el) => el.classList.remove('active'));
}

function updatePresetActive(name: PresetName): void {
  clearPresetActive();
  document.querySelectorAll('.preset-btn').forEach((el) => {
    if (el.textContent?.trim() === name) el.classList.add('active');
  });
}

function bindUIEvents(): void {
  (document.getElementById('tab-fixed') as HTMLButtonElement).addEventListener('click', () => selectModel('fixed'));
  (document.getElementById('tab-adaptive') as HTMLButtonElement).addEventListener('click', () => selectModel('adaptive'));
  (document.getElementById('tab-smartAdaptive') as HTMLButtonElement).addEventListener('click', () => selectModel('smartAdaptive'));

  (document.getElementById('preset-subtle') as HTMLButtonElement).addEventListener('click', () => applyPreset('Subtle'));
  (document.getElementById('preset-balanced') as HTMLButtonElement).addEventListener('click', () => applyPreset('Balanced'));
  (document.getElementById('preset-bold') as HTMLButtonElement).addEventListener('click', () => applyPreset('Bold'));
  (document.getElementById('preset-pill-adaptive') as HTMLButtonElement).addEventListener('click', () => applyPreset('Pill Adaptive'));

  (document.getElementById('fixed-linked') as HTMLInputElement).addEventListener('change', onFixedLinkedChange);
  (document.getElementById('fixed-radius-mode') as HTMLSelectElement).addEventListener('change', onRadiusModeChange);
  (document.getElementById('smart-linked') as HTMLInputElement).addEventListener('change', onSmartLinkedChange);

  (document.getElementById('btn-apply') as HTMLButtonElement).addEventListener('click', doApply);
  (document.getElementById('btn-squirclify-cta') as HTMLButtonElement).addEventListener('click', doApply);
  (document.getElementById('btn-refresh-sel') as HTMLButtonElement).addEventListener('click', doRefreshSelection);
  (document.getElementById('btn-refresh-page') as HTMLButtonElement).addEventListener('click', doRefreshPage);
  (document.getElementById('badge-remove') as HTMLButtonElement).addEventListener('click', doRemove);
  (document.getElementById('mode-toggle') as HTMLButtonElement).addEventListener('click', () => togglePanel('mode'));
  (document.getElementById('settings-toggle') as HTMLButtonElement).addEventListener('click', () => togglePanel('settings'));
  (document.getElementById('constraints-toggle') as HTMLButtonElement).addEventListener('click', () => togglePanel('constraints'));
  (document.getElementById('actions-toggle') as HTMLButtonElement).addEventListener('click', () => togglePanel('actions'));
  (document.getElementById('remove-confirm-cancel') as HTMLButtonElement).addEventListener('click', () => resolveInlineRemoveConfirm(false));
  (document.getElementById('remove-confirm-continue') as HTMLButtonElement).addEventListener('click', () => resolveInlineRemoveConfirm(true));
  (document.getElementById('prefs-link') as HTMLButtonElement).addEventListener('click', togglePrefsPanel);
  (document.getElementById('prefs-reenable-remove') as HTMLButtonElement).addEventListener('click', reenableRemoveConfirmations);
  (document.getElementById('prefs-reset-all') as HTMLButtonElement).addEventListener('click', resetUserPreferences);
}

// ─── Read settings from UI ────────────────────────────────────────────────────

function n(id: string): number {
  return parseFloat((document.getElementById(id) as HTMLInputElement).value) || 0;
}
function b(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}
function s(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

function readConstraints(): ConstraintParams {
  return {
    minRadius: n('c-min-r'),
    maxRadius: n('c-max-r'),
    minSmoothing: n('c-min-s'),
    maxSmoothing: n('c-max-s'),
    minFrameSize: n('c-min-f'),
    aspectGuard: n('c-aspect'),
    roundingStep: DEFAULT_CONSTRAINTS.roundingStep,
    smoothingStep: DEFAULT_CONSTRAINTS.smoothingStep,
  };
}

function readSettings(): NodePluginData['settings'] {
  switch (currentModel) {
    case 'fixed': {
      const linked = b('fixed-linked');
      const mode = s('fixed-radius-mode') as 'absolute' | 'proportional';
      const baseR = n('fixed-base-radius');
      const factor = n('fixed-factor');
      const settings: FixedSettings = {
        cornersLinked: linked,
        baseRadii: linked
          ? [baseR, baseR, baseR, baseR]
          : [n('fixed-r0'), n('fixed-r1'), n('fixed-r2'), n('fixed-r3')],
        baseSmoothing: n('fixed-smoothing'),
        radiusMode: mode,
        radiusFactor: [factor, factor, factor, factor],
      };
      return settings;
    }
    case 'adaptive': {
      const settings: AdaptiveSettings = {
        radiusScale: n('adap-scale'),
        targetSmoothing: n('adap-smoothing'),
        aspectSensitivity: n('adap-aspect'),
        sizeBasis: s('adap-basis') as AdaptiveSettings['sizeBasis'],
        cornerWeights: [1, 1, 1, 1],
      };
      return settings;
    }
    case 'smartAdaptive': {
      const linked = b('smart-linked');
      const r = n('smart-radius');
      const settings: SmartAdaptiveSettings = {
        cornersLinked: linked,
        designRadii: linked
          ? [r, r, r, r]
          : [n('smart-r0'), n('smart-r1'), n('smart-r2'), n('smart-r3')],
        designSmoothing: n('smart-smoothing'),
        referenceSize: n('smart-ref-size'),
        responseStrength: n('smart-strength'),
        aspectSensitivity: n('smart-aspect'),
      };
      return settings;
    }
  }
}

// ─── Load settings into UI ────────────────────────────────────────────────────

function setVal(id: string, val: string | number): void {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.value = String(val);
}
function setCheck(id: string, val: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.checked = val;
}
function setSel(id: string, val: string): void {
  const el = document.getElementById(id) as HTMLSelectElement;
  if (el) el.value = val;
}

function loadSettingsIntoUI(model: ModelType, settings: NodePluginData['settings']): void {
  switch (model) {
    case 'fixed': {
      const fs = settings as FixedSettings;
      setCheck('fixed-linked', fs.cornersLinked);
      setSel('fixed-radius-mode', fs.radiusMode);
      setVal('fixed-base-radius', fs.baseRadii[0]);
      setVal('fixed-r0', fs.baseRadii[0]);
      setVal('fixed-r1', fs.baseRadii[1]);
      setVal('fixed-r2', fs.baseRadii[2]);
      setVal('fixed-r3', fs.baseRadii[3]);
      setVal('fixed-smoothing', fs.baseSmoothing);
      setVal('fixed-factor', fs.radiusFactor[0]);
      onFixedLinkedChange();
      onRadiusModeChange();
      break;
    }
    case 'adaptive': {
      const as_ = settings as AdaptiveSettings;
      setVal('adap-scale', as_.radiusScale);
      setVal('adap-smoothing', as_.targetSmoothing);
      setVal('adap-aspect', as_.aspectSensitivity);
      setSel('adap-basis', as_.sizeBasis);
      break;
    }
    case 'smartAdaptive': {
      const ss = settings as SmartAdaptiveSettings;
      setCheck('smart-linked', ss.cornersLinked);
      setVal('smart-radius', ss.designRadii[0]);
      setVal('smart-r0', ss.designRadii[0]);
      setVal('smart-r1', ss.designRadii[1]);
      setVal('smart-r2', ss.designRadii[2]);
      setVal('smart-r3', ss.designRadii[3]);
      setVal('smart-smoothing', ss.designSmoothing);
      setVal('smart-ref-size', ss.referenceSize);
      setVal('smart-strength', ss.responseStrength);
      setVal('smart-aspect', ss.aspectSensitivity);
      onSmartLinkedChange();
      break;
    }
  }
}

// ─── UI toggle helpers ────────────────────────────────────────────────────────

function onFixedLinkedChange(): void {
  const linked = b('fixed-linked');
  (document.getElementById('fixed-abs-row') as HTMLElement).style.display = linked ? 'flex' : 'none';
  (document.getElementById('fixed-corners-grid') as HTMLElement).style.display = linked ? 'none' : 'block';
}

function onRadiusModeChange(): void {
  const mode = s('fixed-radius-mode');
  (document.getElementById('fixed-prop-row') as HTMLElement).style.display = mode === 'proportional' ? 'flex' : 'none';
}

function onSmartLinkedChange(): void {
  const linked = b('smart-linked');
  (document.getElementById('smart-single-row') as HTMLElement).style.display = linked ? 'flex' : 'none';
  (document.getElementById('smart-corners-grid') as HTMLElement).style.display = linked ? 'none' : 'block';
}

// ─── Action handlers ──────────────────────────────────────────────────────────

function doApply(): void {
  const msg: UIToPluginMessage = {
    type: 'apply',
    model: currentModel,
    preset: currentPreset,
    settings: readSettings(),
    constraints: readConstraints(),
  };
  send(msg);
}

function doRefreshSelection(): void {
  send({ type: 'refresh-selection' });
}

function doRefreshPage(): void {
  send({ type: 'refresh-page' });
}

function doRemove(): void {
  if (managedSelectionCount <= 0) {
    send({ type: 'remove-management' });
    return;
  }

  if (shouldSkipRemoveConfirm()) {
    send({ type: 'remove-management' });
    return;
  }

  const affected = `${managedSelectionCount} selected managed frame${managedSelectionCount !== 1 ? 's' : ''}`;
  openInlineRemoveConfirm(affected).then((confirmed) => {
    if (!confirmed) return;
    send({ type: 'remove-management' });
  });
}

function shouldSkipRemoveConfirm(): boolean {
  return removeConfirmSkipPref;
}

function setSkipRemoveConfirm(skip: boolean): void {
  removeConfirmSkipPref = skip;
  send({ type: 'set-remove-confirm-skip-pref', skip });
}

function openInlineRemoveConfirm(affectedSummary: string): Promise<boolean> {
  const panel = document.getElementById('remove-confirm-panel') as HTMLElement;
  const title = document.getElementById('remove-confirm-title') as HTMLElement;
  const skipCheck = document.getElementById('remove-confirm-skip') as HTMLInputElement;

  title.textContent = `Remove management from ${affectedSummary}?`;
  skipCheck.checked = false;
  panel.classList.remove('hidden');
  document.body.classList.add('remove-confirm-open');

  return new Promise((resolve) => {
    removeConfirmResolver = resolve;
  });
}

function resolveInlineRemoveConfirm(confirmed: boolean): void {
  const panel = document.getElementById('remove-confirm-panel') as HTMLElement;
  const skipCheck = document.getElementById('remove-confirm-skip') as HTMLInputElement;

  panel.classList.add('hidden');
  document.body.classList.remove('remove-confirm-open');

  if (confirmed && skipCheck.checked) {
    setSkipRemoveConfirm(true);
  }

  const resolver = removeConfirmResolver;
  removeConfirmResolver = null;
  if (resolver) resolver(confirmed);
}

function showStatusMsg(text: string, success: boolean): void {
  const el = document.getElementById('status-msg') as HTMLElement;
  if (statusMsgTimer) {
    clearTimeout(statusMsgTimer);
    statusMsgTimer = null;
  }
  el.textContent = text;
  el.className = `status-msg ${success ? 'success' : 'error'}`;
  statusMsgTimer = setTimeout(() => {
    el.className = 'status-msg hidden';
    statusMsgTimer = null;
  }, 4000);
}

// ─── Plugin messages ──────────────────────────────────────────────────────────

window.addEventListener('message', handleIncomingMessage);
window.onmessage = handleIncomingMessage;

bindUIEvents();
loadPanelPrefs();
bindLabelDragControls();
bindLiveApplyTriggers();
updateModelUI();
onFixedLinkedChange();
onRadiusModeChange();
onSmartLinkedChange();
setSquirclifyViewState(0, 0);
updateBridgeIndicator();

// Initial request
send({ type: 'get-selection-status' });
send({ type: 'get-remove-confirm-skip-pref' });

// Keep requesting status until plugin responds, and continue occasional sync requests.
setInterval(() => {
  send({ type: 'get-selection-status' });
  updateBridgeIndicator();
}, 1000);
