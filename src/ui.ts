import type { UIToPluginMessage, PluginToUIMessage, ModelType, PresetName, NodePluginData } from './types';
import type { FixedSettings, AdaptiveSettings, SmartAdaptiveSettings, ConstraintParams } from './types';
import { PRESETS, DEFAULT_CONSTRAINTS } from './models';

// ─── State ────────────────────────────────────────────────────────────────────

let currentModel: ModelType = 'smartAdaptive';
let currentPreset: PresetName | null = 'Balanced';

// ─── Messaging ────────────────────────────────────────────────────────────────

function send(msg: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ─── Model / Preset selection ─────────────────────────────────────────────────

function selectModel(model: ModelType): void {
  currentModel = model;
  currentPreset = null;
  updateModelUI();
  clearPresetActive();
}

function applyPreset(name: PresetName): void {
  const preset = PRESETS[name];
  currentModel = preset.model;
  currentPreset = name;
  loadSettingsIntoUI(preset.model, preset.settings as NodePluginData['settings']);
  updateModelUI();
  updatePresetActive(name);
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
  send({ type: 'remove-management' });
}

function showStatusMsg(text: string, success: boolean): void {
  const el = document.getElementById('status-msg') as HTMLElement;
  el.textContent = text;
  el.className = `status-msg ${success ? 'success' : 'error'}`;
  setTimeout(() => { el.className = 'status-msg hidden'; }, 4000);
}

// ─── Plugin messages ──────────────────────────────────────────────────────────

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginToUIMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'selection-status': {
      const { supportedCount, managedCount, unsupportedCount, firstManagedData } = msg.status;
      const hint = document.getElementById('empty-hint') as HTMLElement;
      const badgeSupported = document.getElementById('badge-supported') as HTMLElement;
      const badgeManaged = document.getElementById('badge-managed') as HTMLElement;
      const badgeUnsupported = document.getElementById('badge-unsupported') as HTMLElement;

      badgeSupported.textContent = `${supportedCount} frame${supportedCount !== 1 ? 's' : ''}`;
      badgeManaged.textContent = `${managedCount} managed`;
      badgeManaged.style.display = managedCount > 0 ? 'inline-block' : 'none';
      badgeUnsupported.textContent = `${unsupportedCount} unsupported`;
      badgeUnsupported.style.display = unsupportedCount > 0 ? 'inline-block' : 'none';

      hint.style.display = supportedCount === 0 ? 'block' : 'none';

      // Load settings from first managed frame
      if (firstManagedData) {
        currentModel = firstManagedData.model;
        currentPreset = firstManagedData.preset;
        loadSettingsIntoUI(firstManagedData.model, firstManagedData.settings);
        updateModelUI();
        if (firstManagedData.preset) updatePresetActive(firstManagedData.preset);
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
  }
};

// Make functions available globally for inline HTML onclick handlers
const win = window as unknown as Record<string, unknown>;
win['selectModel'] = selectModel;
win['applyPreset'] = applyPreset;
win['onFixedLinkedChange'] = onFixedLinkedChange;
win['onRadiusModeChange'] = onRadiusModeChange;
win['onSmartLinkedChange'] = onSmartLinkedChange;
win['doApply'] = doApply;
win['doRefreshSelection'] = doRefreshSelection;
win['doRefreshPage'] = doRefreshPage;
win['doRemove'] = doRemove;

// Initial request
send({ type: 'get-selection-status' });
