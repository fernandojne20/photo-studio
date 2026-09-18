import { describe, expect, it } from 'vitest';
import { buildLightboxOptions } from './lightbox-options';

describe('buildLightboxOptions', () => {
  it('adds no animation keys at all when reduced motion is not requested', () => {
    const result = buildLightboxOptions({ labels: {}, prefersReducedMotion: false });

    expect('showAnimationDuration' in result).toBe(false);
    expect('hideAnimationDuration' in result).toBe(false);
    expect('zoomAnimationDuration' in result).toBe(false);
    expect('showHideAnimationType' in result).toBe(false);
  });

  it('sets the three durations to 0 and the animation type to none when reduced motion is requested', () => {
    const result = buildLightboxOptions({ labels: {}, prefersReducedMotion: true });

    expect(result.showHideAnimationType).toBe('none');
    expect(result.showAnimationDuration).toBe(0);
    expect(result.hideAnimationDuration).toBe(0);
    expect(result.zoomAnimationDuration).toBe(0);
  });

  it('omits a label that was not present, instead of passing it through as undefined', () => {
    const result = buildLightboxOptions({
      labels: { closeTitle: undefined, zoomTitle: 'Ampliar o reducir' },
      prefersReducedMotion: false,
    });

    expect('closeTitle' in result).toBe(false);
    expect(result.zoomTitle).toBe('Ampliar o reducir');
  });

  it('passes every present label through unchanged', () => {
    const labels = {
      closeTitle: 'Cerrar',
      zoomTitle: 'Ampliar o reducir',
      arrowPrevTitle: 'Foto anterior',
      arrowNextTitle: 'Foto siguiente',
      errorMsg: 'No se pudo cargar la foto',
      indexIndicatorSep: ' de ',
    };

    const result = buildLightboxOptions({ labels, prefersReducedMotion: true });

    expect(result.closeTitle).toBe(labels.closeTitle);
    expect(result.zoomTitle).toBe(labels.zoomTitle);
    expect(result.arrowPrevTitle).toBe(labels.arrowPrevTitle);
    expect(result.arrowNextTitle).toBe(labels.arrowNextTitle);
    expect(result.errorMsg).toBe(labels.errorMsg);
    expect(result.indexIndicatorSep).toBe(labels.indexIndicatorSep);
  });

  it('never returns a key with an undefined value, in either motion mode', () => {
    const labels = { closeTitle: undefined, zoomTitle: 'Ampliar o reducir' };

    [false, true].forEach((prefersReducedMotion) => {
      const result = buildLightboxOptions({ labels, prefersReducedMotion });
      expect(Object.values(result).every((value) => value !== undefined)).toBe(true);
    });
  });
});
