export const BETA_MODE = typeof window !== 'undefined'
  && localStorage.getItem('qadr110-beta-mode') === 'true';
