import type { RenderProps } from '@anseronui/protocol';

/** Apply a complete semantic snapshot so removing a prop also removes its ARIA override. */
export function applyAccessibility(element: HTMLElement, kind: string, props: RenderProps, tap: boolean, longPress: boolean): void {
  const excluded = props.accessible === false || props.accessibilityRole === 'none';
  const namedGroup = ['View', 'Text', 'RichText', 'ScrollView'].includes(kind) && (props.accessible === true || typeof props.accessibilityLabel === 'string');
  const role = excluded ? 'presentation' : props.accessibilityRole === 'image' ? 'img'
    : props.accessibilityRole === 'search' ? 'searchbox' : props.accessibilityRole === 'text' ? (namedGroup ? 'group' : null)
    : props.accessibilityRole ?? (namedGroup ? 'group' : null);
  const attr = (name: string, value: unknown) => {
    if (value === undefined || value === null) element.removeAttribute(name);
    else element.setAttribute(name, String(value));
  };
  attr('role', role);
  attr('aria-label', excluded ? null : props.accessibilityLabel);
  const description = [props.accessibilityValue, props.accessibilityHint].filter(value => typeof value === 'string' && value.length).join('，');
  attr('aria-description', excluded || !description ? null : description);
  attr('aria-hidden', props.accessibilityHidden === true || (excluded && ['Text', 'RichText', 'Image', 'TextInput'].includes(kind)) ? true : null);
  attr('aria-checked', role === 'checkbox' ? props.accessibilityChecked ?? false : null);
  attr('aria-pressed', !excluded && role === 'button' ? props.accessibilitySelected : null);
  attr('aria-current', !excluded && role !== 'button' && props.accessibilitySelected === true ? 'true' : null);
  attr('aria-disabled', !excluded && (role === 'button' || role === 'checkbox') ? props.disabled === true : null);
  const clickable = props.accessibilityClickable ?? tap;
  const longClickable = props.accessibilityLongClickable ?? longPress;
  // Native inputs retain their built-in keyboard interaction and tab order.
  if (kind !== 'TextInput' && kind !== 'Video' && kind !== 'Native') {
    const focusable = !excluded && props.accessibilityHidden !== true && props.disabled !== true
      && (props.accessible === true || role === 'button' || role === 'checkbox' || clickable || longClickable);
    attr('tabindex', focusable ? 0 : null);
    element.onkeydown = focusable ? event => {
      if (event.target !== element || event.repeat || props.disabled === true) return;
      if (clickable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); element.click(); }
      if (longClickable && event.shiftKey && event.key === 'F10') {
        event.preventDefault(); element.dispatchEvent(new Event('anseronui-accessibility-longpress'));
      }
    } : null;
  }
}
