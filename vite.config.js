export default {
  // GitHub Pages 是子路徑 https://sssunwl.github.io/han/,不設 base 資源會 404
  base: '/han/',
  build: {
    rollupOptions: {
      input: {
        lobby: 'index.html',
        kidcraft: 'games/kidcraft/index.html',
        pinball: 'games/pinball/index.html',
      },
    },
  },
};
