import { escapeHtml } from '@/utils/sanitize';

export interface MapContextMenuItem {
  id?: string;
  label: string;
  summary?: string;
  icon?: string;
  mode?: 'fast' | 'long';
  dependencies?: string[];
  confidenceNote?: string;
  disabled?: boolean;
  action: () => void | Promise<void>;
}

export interface MapContextMenuGroup {
  id: string;
  label: string;
  icon?: string;
  items: MapContextMenuItem[];
}

export interface MapContextMenuCustomAction {
  label: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
}

export interface MapContextMenuOptions {
  title?: string;
  subtitle?: string;
  groups?: MapContextMenuGroup[];
  items?: MapContextMenuItem[];
  customAction?: MapContextMenuCustomAction;
  footerNote?: string;
}

let activeMenu: HTMLElement | null = null;

function getFocusableButtons(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('.map-context-menu-action'));
}

function dismissMapContextMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('keydown', onKeyDown);
  }
}

function moveFocus(menu: HTMLElement, direction: 1 | -1): void {
  const buttons = getFocusableButtons(menu);
  if (buttons.length === 0) return;
  const currentIndex = buttons.findIndex((button) => button === document.activeElement);
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + direction + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus();
}

function onKeyDown(event: KeyboardEvent): void {
  if (!activeMenu) return;
  if (event.key === 'Escape') {
    dismissMapContextMenu();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveFocus(activeMenu, 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveFocus(activeMenu, -1);
  }
}

function renderMenuAction(item: MapContextMenuItem): string {
  const dependencyText = item.dependencies?.length
    ? `<small>نیازمند: ${item.dependencies.map((value) => escapeHtml(value)).join('، ')}</small>`
    : '';
  const confidenceText = item.confidenceNote
    ? `<small>${escapeHtml(item.confidenceNote)}</small>`
    : '';
  const modeText = item.mode
    ? `<span class="map-context-menu-mode ${item.mode}">${item.mode === 'long' ? 'بلند' : 'سریع'}</span>`
    : '';

  return `
    <button type="button" class="map-context-menu-action" ${item.disabled ? 'disabled' : ''}>
      <div class="map-context-menu-action-top">
        <span class="map-context-menu-icon">${item.icon || 'MAP'}</span>
        <span class="map-context-menu-label">${escapeHtml(item.label)}</span>
        ${modeText}
      </div>
      ${item.summary ? `<div class="map-context-menu-summary">${escapeHtml(item.summary)}</div>` : ''}
      ${dependencyText}
      ${confidenceText}
    </button>
  `;
}

function bindActions(menu: HTMLElement, items: MapContextMenuItem[]): void {
  const buttons = getFocusableButtons(menu);
  buttons.forEach((button, index) => {
    const item = items[index];
    if (!item) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (item.disabled) return;
      void item.action();
      dismissMapContextMenu();
    });
  });
}

export { dismissMapContextMenu };

export function showMapContextMenu(x: number, y: number, input: MapContextMenuOptions | MapContextMenuItem[]): void {
  dismissMapContextMenu();

  const options: MapContextMenuOptions = Array.isArray(input)
    ? { items: input }
    : input;
  const groups = options.groups ?? (options.items ? [{ id: 'default', label: 'اقدام‌ها', items: options.items }] : []);
  const flatItems = groups.flatMap((group) => group.items);

  const menu = document.createElement('div');
  menu.className = 'map-context-menu';
  menu.setAttribute('role', 'menu');
  menu.addEventListener('click', (event) => event.stopPropagation());

  const estimatedHeight = 180 + flatItems.length * 96 + (options.customAction ? 132 : 0);
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - 420));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - estimatedHeight));
  menu.style.left = `${clampedX}px`;
  menu.style.top = `${clampedY}px`;

  menu.innerHTML = `
    ${options.title ? `
      <header class="map-context-menu-header">
        <strong>${escapeHtml(options.title)}</strong>
        ${options.subtitle ? `<span>${escapeHtml(options.subtitle)}</span>` : ''}
      </header>
    ` : ''}
    <div class="map-context-menu-groups">
      ${groups.map((group) => `
        <section class="map-context-menu-group">
          <div class="map-context-menu-group-title">
            <span>${group.icon || 'GRP'}</span>
            <strong>${escapeHtml(group.label)}</strong>
          </div>
          <div class="map-context-menu-actions">
            ${group.items.map((item) => renderMenuAction(item)).join('')}
          </div>
        </section>
      `).join('')}
    </div>
    ${options.customAction ? `
      <section class="map-context-menu-custom">
        <label>${escapeHtml(options.customAction.label)}</label>
        <textarea class="map-context-menu-custom-input" placeholder="${escapeHtml(options.customAction.placeholder)}"></textarea>
        <div class="map-context-menu-custom-actions">
          <button type="button" class="map-context-menu-submit">${escapeHtml(options.customAction.submitLabel)}</button>
        </div>
      </section>
    ` : ''}
    ${options.footerNote ? `<footer class="map-context-menu-footer">${escapeHtml(options.footerNote)}</footer>` : ''}
  `;

  bindActions(menu, flatItems);

  const customInput = menu.querySelector<HTMLTextAreaElement>('.map-context-menu-custom-input');
  const customSubmit = menu.querySelector<HTMLButtonElement>('.map-context-menu-submit');
  const customAction = options.customAction;
  if (customInput && customSubmit && customAction) {
    customSubmit.addEventListener('click', (event) => {
      event.stopPropagation();
      const value = customInput.value.trim();
      if (!value) return;
      customAction.onSubmit(value);
      dismissMapContextMenu();
    });
    customInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        customSubmit.click();
      }
    });
  }

  requestAnimationFrame(() => {
    document.addEventListener('click', dismissMapContextMenu, { once: true });
    getFocusableButtons(menu)[0]?.focus();
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(menu);
  activeMenu = menu;
}
