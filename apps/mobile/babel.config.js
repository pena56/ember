module.exports = {
  presets: ['babel-preset-expo'],
  // react-native-reanimated 4.x runs its worklets via react-native-worklets; the plugin must
  // be listed last. Required for the app to bundle (reanimated is pulled in by expo-router).
  plugins: ['react-native-worklets/plugin'],
};
