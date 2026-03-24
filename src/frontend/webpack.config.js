const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => ({
  entry: './src/main.jsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    clean: true,
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: 'defaults' }],
              ['@babel/preset-react', { runtime: 'automatic' }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
      title: 'OSP Demo Agent'
    })
  ],
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    ]
  },
  performance: {
    hints: false
  }
});
