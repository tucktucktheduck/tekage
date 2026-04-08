// ═══════════════════════════════════════════════════════════
//  DEFAULT SKIN
//  Built-in blue/orange theme. Exported as a plain object
//  that SkinManager loads on startup.
// ═══════════════════════════════════════════════════════════

export const defaultSkin = {
  name: 'Tekage Default',
  author: 'Tekage',
  version: '1.0',
  colors: {
    primary: '#3b9eff',    // blue  — left hand
    secondary: '#ff8a2b',  // orange — right hand
    accent: '#9333ea',     // purple
  },
  // No image overrides — everything uses color-derived defaults
  pages: {},
};
