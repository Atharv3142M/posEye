const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const desktopNodeModules = path.resolve('apps/desktop/node_modules');
const THREE = require(path.join(desktopNodeModules, 'three'));

async function run() {
  const loaderUrl = pathToFileURL(path.join(desktopNodeModules, 'three/examples/jsm/loaders/GLTFLoader.js')).href;
  const { GLTFLoader } = await import(loaderUrl);
  console.log('Testing Three.js GLTFLoader on test7.glb...');

  const glbBuffer = fs.readFileSync(path.resolve('testing results/test7.glb'));
  const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

  const loader = new GLTFLoader();

  // Handle unhandled rejections if parse returns or uses promises
  process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
  });

  try {
    loader.parse(
      arrayBuffer,
      '',
      (gltf) => {
        console.log('Successfully parsed GLTF!');
        console.log('Scene meshes:', gltf.scene.children.length);
      },
      (err) => {
        console.error('Parse callback onError triggered:', err);
      }
    );
  } catch (err) {
    console.error('Synchronous throw in loader.parse:', err);
  }
}

run().catch((e) => console.error('Caught error in run:', e));
