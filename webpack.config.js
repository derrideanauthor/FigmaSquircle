const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return [
    // Main plugin code (runs in Figma sandbox)
    {
      entry: './src/main.ts',
      target: 'web',
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
      },
      output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
      },
      devtool: isDev ? 'inline-source-map' : false,
    },
    // UI code (runs in browser iframe)
    {
      entry: './src/ui.ts',
      target: 'web',
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
      },
      output: {
        filename: 'ui.js',
        path: path.resolve(__dirname, 'dist'),
      },
      plugins: [
        new HtmlWebpackPlugin({
          template: './src/ui.html',
          filename: 'ui.html',
          inject: false,
          templateParameters: (compilation) => ({
            inlineUiScript: compilation.assets['ui.js']
              ? compilation.assets['ui.js'].source().toString()
              : '',
          }),
        }),
      ],
      devtool: isDev ? 'inline-source-map' : false,
    },
  ];
};
