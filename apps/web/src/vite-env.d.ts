/// <reference types="vite/client" />

declare module '@fontsource/fraunces';
declare module '@fontsource/inter';

// Vite ?url imports — resolves to the asset URL string at build time
declare module '*?url' {
  const url: string;
  export default url;
}
