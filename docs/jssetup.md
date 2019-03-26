---
id: js-setup
title: JavaScript Setup
sidebar_label: JavaScript Setup
---

## Creating the plugin UI

To create the desktop part of your plugin, initiate a new JavaScript project using `yarn init` and make sure your package name starts with `flipper-plugin-` and a file called `index.js`, which is the entry point to your plugin. A sample `package.json`-file could look like this:

```
{
  "name": "flipper-plugin-myplugin",
  "version": "1.0.0",
  "main": "index.js",
  "license": "MIT",
  "dependencies": {}
}
```

In `index.js` you can now create your plugin. Take a look at [Writing a plugin](writing-a-plugin.md) to learn how a plugin can look like. Also, make sure to check out [Flipper's UI components](ui-components.md) when building your plugin.

### Dynamically loading plugins

Once a plugin is created, Flipper can load it from its folder. The path from where the plugins are loaded is specified in `~/.flipper/config.json`. Add the parent folder of your plugin to `pluginPaths` and start Flipper.

### npm dependencies

If you need any dependencies in your plugin, you can install them using `yarn add`. The Flipper UI components exported from `flipper`, as well as `react` and `react-dom` don't need to be installed as dependencies. Our plugin-loader makes these dependencies available to your plugin.

### ES6, babel-transforms and bundling

Our plugin-loader is capable of all ES6 goodness, flow annotations and JSX and applies the required babel-transforms without you having to care about this. Also you don't need to bundle your plugin, you can simply use ES6 imports and it will work out of the box.

## Working on the core

If you only want to work on a plugin, you don't need to run the development build of Flipper, but you can use the production release. However, if you want to contribute to Flipper's core, add additional UI components, or do anything outside the scope of a single plugins this is how you run the development version of Flipper.

Make sure you have a recent version of node.js and yarn installed on your system (node ≥ 8, yarn ≥ 1.5). Then run the following commands:

```
git clone https://github.com/facebook/flipper.git
cd flipper
yarn
yarn start
```
