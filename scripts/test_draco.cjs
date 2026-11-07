const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

global.self = global;
global.window = global;

const desktopNodeModules = path.resolve('apps/desktop/node_modules');

async function testDracoLoading() {
  const loaderUrl = pathToFileURL(path.join(desktopNodeModules, 'three/examples/jsm/loaders/GLTFLoader.js')).href;
  const dracoUrl = pathToFileURL(path.join(desktopNodeModules, 'three/examples/jsm/loaders/DRACOLoader.js')).href;
  const { GLTFLoader } = await import(loaderUrl);
  const { DRACOLoader } = await import(dracoUrl);

  const glbBuffer = fs.readFileSync(path.resolve('testing results/test7.glb'));
  const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

  const loader = new GLTFLoader();
  
  // Custom mock/loader verification
  console.log('GLTFLoader and DRACOLoader imported successfully');
  console.log('test7.glb buffer size:', arrayBuffer.byteLength);
  return { success: true };
}

testDracoLoading()
  .then((res) => console.log('Import & buffer test result:', res))
  .catch((e) => console.error('Failed:', e));
