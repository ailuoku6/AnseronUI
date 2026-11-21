import { expect, it } from 'vitest';
import { validProps } from '../src/index.js';

it('validates reader roles, labels and state at the protocol boundary', () => {
  for (const accessibilityRole of ['button', 'text', 'image', 'checkbox', 'search', 'none']) {
    expect(validProps({ accessibilityRole, accessibilityLabel: '目标', accessibilityHint: '提示', accessibilityValue: '50%',
      accessible: true, accessibilityHidden: false, accessibilityChecked: false, accessibilitySelected: true,
      accessibilityClickable: true, accessibilityLongClickable: false })).toBe(true);
  }
  for (const props of [{ accessibilityRole: 'invalid' }, { accessible: 1 }, { accessibilityHidden: 'true' },
    { accessibilityChecked: null }, { accessibilitySelected: 1 }, { accessibilityHint: 2 },
    { accessibilityValue: {} }, { accessibilityClickable: 'false' }, { accessibilityLongClickable: 0 }]) expect(validProps(props)).toBe(false);
});
