
export const CSS_PAINT_WORKLETS_SUPPORTED = 'paintWorklet' in CSS;

const canvas = document.createElement('canvas');
const wgl2 = canvas.getContext('webgl2', {
  failIfMajorPerformanceCaveat: true,
});

export const WEBGL2_SUPPORTED = Boolean(wgl2);

wgl2?.getExtension('WEBGL_lose_context')?.loseContext();

export const CSS_CUSTOM_PROPERTIES_SUPPORTED = 'registerProperty' in CSS;

export const CSS_TYPED_OBJECT_MODEL_SUPPORTED = 'CSSStyleValue' in window;

export const CSS_ELEMENT_IMAGE_FUNC = (
  CSS.supports('background-image', 'element(#id)') ? 'element'
  : CSS.supports('background-image', '-moz-element(#id)') ? '-moz-element'
  : null
);
