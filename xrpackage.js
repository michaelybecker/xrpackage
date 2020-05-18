import * as THREE from './xrpackage/three.module.js';
import * as XR from './xrpackage/XR.js';
import symbols from './xrpackage/symbols.js';
import {getExports} from './xrpackage/Graphics.js';
const {getContext, CanvasRenderingContext2D, WebGLRenderingContext, WebGL2RenderingContext} = getExports();
import GlobalContext from './xrpackage/GlobalContext.js';
import wbn from './xrpackage/wbn.js';
import {GLTFLoader} from './xrpackage/GLTFLoader.js';
import {VOXLoader} from './xrpackage/VOXLoader.js';
import {OrbitControls} from './xrpackage/OrbitControls.js';
import Avatar from './xrpackage/avatars/avatars.js';
import utils from './xrpackage/utils.js';
const {requestSw} = utils;
export const apiHost = `https://ipfs.exokit.org/ipfs`;

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localArray = Array(16);

const _removeUrlTail = u => u.replace(/(?:\?|\#).*$/, '');

const _initSw = async () => {
  await navigator.serviceWorker.register('/sw.js', {
    // type: 'module',
  });
  if (!navigator.serviceWorker.controller) {
    await new Promise((accept, reject) => {
      const _controllerchange = () => {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.removeEventListener('controllerchange', _controllerchange);
          clearTimeout(timeout);
          accept();
        }
      };
      navigator.serviceWorker.addEventListener('controllerchange', _controllerchange);
      const timeout = setTimeout(() => {
        console.warn('sw registration timed out');
        debugger;
      }, 10 * 1000);
    });
  }
  console.log('sw registration', window.registration);
};
const swLoadPromise = _initSw().then(() => {});

const xrState = (() => {
  const _makeSab = size => {
    const sab = new ArrayBuffer(size);
    let index = 0;
    return (c, n) => {
      const result = new c(sab, index, n);
      index += result.byteLength;
      return result;
    };
  };
  const _makeTypedArray = _makeSab(32*1024);

  const result = {};
  result.isPresenting = _makeTypedArray(Uint32Array, 1);
  result.isPresentingReal = _makeTypedArray(Uint32Array, 1);
  result.renderWidth = _makeTypedArray(Float32Array, 1);
  result.renderWidth[0] = window.innerWidth / 2 * window.devicePixelRatio;
  result.renderHeight = _makeTypedArray(Float32Array, 1);
  result.renderHeight[0] = window.innerHeight * window.devicePixelRatio;
  result.metrics = _makeTypedArray(Uint32Array, 2);
  result.metrics[0] = window.innerWidth;
  result.metrics[1] = window.innerHeight;
  result.devicePixelRatio = _makeTypedArray(Float32Array, 1);
  result.devicePixelRatio[0] = window.devicePixelRatio;
  result.stereo = _makeTypedArray(Uint32Array, 1);
  // result.stereo[0] = 1;
  result.canvasViewport = _makeTypedArray(Float32Array, 4);
  result.canvasViewport.set(Float32Array.from([0, 0, window.innerWidth, window.innerHeight]));
  result.depthNear = _makeTypedArray(Float32Array, 1);
  result.depthNear[0] = 0.1;
  result.depthFar = _makeTypedArray(Float32Array, 1);
  result.depthFar[0] = 2000.0;
  result.position = _makeTypedArray(Float32Array, 3);
  result.orientation = _makeTypedArray(Float32Array, 4);
  result.orientation[3] = 1;
  result.leftViewMatrix = _makeTypedArray(Float32Array, 16);
  result.leftViewMatrix.set(Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  result.rightViewMatrix = _makeTypedArray(Float32Array, 16);
  result.rightViewMatrix.set(result.leftViewMatrix);
  // new THREE.PerspectiveCamera(110, 2, 0.1, 2000).projectionMatrix.toArray()
  result.leftProjectionMatrix = _makeTypedArray(Float32Array, 16);
  result.leftProjectionMatrix.set(Float32Array.from([0.3501037691048549, 0, 0, 0, 0, 0.7002075382097098, 0, 0, 0, 0, -1.00010000500025, -1, 0, 0, -0.200010000500025, 0]));
  result.rightProjectionMatrix = _makeTypedArray(Float32Array, 16);
  result.rightProjectionMatrix.set(result.leftProjectionMatrix);
  result.leftOffset = _makeTypedArray(Float32Array, 3);
  result.leftOffset.set(Float32Array.from([-0.625/2, 0, 0]));
  result.rightOffset = _makeTypedArray(Float32Array, 3);
  result.leftOffset.set(Float32Array.from([0.625/2, 0, 0]));
  result.leftFov = _makeTypedArray(Float32Array, 4);
  result.leftFov.set(Float32Array.from([45, 45, 45, 45]));
  result.rightFov = _makeTypedArray(Float32Array, 4);
  result.rightFov.set(result.leftFov);
  result.offsetEpoch = _makeTypedArray(Uint32Array, 1);
  const _makeGamepad = () => ({
    connected: _makeTypedArray(Uint32Array, 1),
    position: _makeTypedArray(Float32Array, 3),
    orientation: (() => {
      const result = _makeTypedArray(Float32Array, 4);
      result[3] = 1;
      return result;
    })(),
    direction: (() => { // derived
      const result = _makeTypedArray(Float32Array, 4);
      result[2] = -1;
      return result;
    })(),
    transformMatrix: (() => { // derived
      const result = _makeTypedArray(Float32Array, 16);
      result.set(Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
      return result;
    })(),
    buttons: (() => {
      const result = Array(10);
      for (let i = 0; i < result.length; i++) {
        result[i] = {
          pressed: _makeTypedArray(Uint32Array, 1),
          touched: _makeTypedArray(Uint32Array, 1),
          value: _makeTypedArray(Float32Array, 1),
        };
      }
      return result;
    })(),
    axes: _makeTypedArray(Float32Array, 10),
  });
  result.gamepads = (() => {
    const result = Array(2);
    for (let i = 0; i < result.length; i++) {
      result[i] = _makeGamepad();
    }
    return result;
  })();
  // result.id = _makeTypedArray(Uint32Array, 1);
  // result.hmdType = _makeTypedArray(Uint32Array, 1);
  // result.tex = _makeTypedArray(Uint32Array, 1);
  // result.depthTex = _makeTypedArray(Uint32Array, 1);
  // result.msTex = _makeTypedArray(Uint32Array, 1);
  // result.msDepthTex = _makeTypedArray(Uint32Array, 1);
  // result.aaEnabled = _makeTypedArray(Uint32Array, 1);
  // result.fakeVrDisplayEnabled = _makeTypedArray(Uint32Array, 1);
  // result.blobId = _makeTypedArray(Uint32Array, 1);

  return result;
})();
GlobalContext.xrState = xrState;
const xrOffsetMatrix = new THREE.Matrix4();
GlobalContext.getXrOffsetMatrix = () => xrOffsetMatrix;
GlobalContext.xrFramebuffer = null;

const xrTypeLoaders = {
  'webxr-site@0.0.1': async function(p) {
    const iframe = document.createElement('iframe');
    iframe.src = '/' + p.main;
    iframe.style.position = 'absolute';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    await new Promise((accept, reject) => {
      iframe.addEventListener('load', accept);
      iframe.addEventListener('error', reject);
    });
    p.context.iframe = iframe;
  },
  'gltf@0.0.1': async function(p) {
    const mainPath = '/' + p.main;
    const indexFile = p.files.find(file => new URL(file.url).pathname === mainPath);
    const indexBlob = new Blob([indexFile.response.body], {
      type: 'application/octet-stream',
    });
    const u = URL.createObjectURL(indexBlob);
    const {scene} = await new Promise((accept, reject) => {
      const loader = new GLTFLoader();
      loader.load(u, accept, function onProgress() {}, reject);
    });
    URL.revokeObjectURL(u);

    p.context.object = scene;

    if (p.details.script) {
      const scriptPath = '/' + p.details.script;
      const scriptFile = p.files.find(file => new URL(file.url).pathname === scriptPath);
      const scriptBlob = new Blob([scriptFile.response.body], {
        type: 'text/javascript',
      });
      const scriptUrl = URL.createObjectURL(scriptBlob);
      const worker = new Worker(scriptPath, {
        type: 'module',
      });
      worker.postMessage({
        method: 'init',
        scriptUrl,
      });
      worker.addEventListener('message', e => {
        const j = e.data;
        const {method} = j;
        switch (method) {
          case 'update': {
            const {matrix} = j;
            scene.matrix
              .fromArray(matrix)
              .decompose(scene.position, scene.quaternion, scene.scale);
            break;
          }
          case 'message': {
            const {data} = j;
            console.log('got message bus payload', data);
            break;
          }
          default: {
            console.warn('major message debugging');
            break;
          }
        }
      });
      p.context.worker = worker;
    }
  },
  'vrm@0.0.1': async function(p) {
    const mainPath = '/' + p.main;
    const indexFile = p.files.find(file => new URL(file.url).pathname === mainPath);
    const indexBlob = new Blob([indexFile.response.body], {
      type: 'application/octet-stream',
    });
    const u = URL.createObjectURL(indexBlob);
    const o = await new Promise((accept, reject) => {
      const loader = new GLTFLoader();
      loader.load(u, accept, function onProgress() {}, reject);
    });
    URL.revokeObjectURL(u);

    p.context.object = o.scene;
    p.context.model = o;
    o.scene.traverse(o => {
      o.frustumCulled = false;
    });
  },
  'vox@0.0.1': async function(p) {
    const mainPath = '/' + p.main;
    const indexFile = p.files.find(file => new URL(file.url).pathname === mainPath);
    const indexBlob = new Blob([indexFile.response.body]);
    const u = URL.createObjectURL(indexBlob);
    const o = await new Promise((accept, reject) => {
      const loader = new VOXLoader();
      loader.load(u, accept, function onProgress() {}, reject);
    });
    URL.revokeObjectURL(u);

    p.context.object = o;
  },
  'xrpackage-scene@0.0.1': async function(p) {
    const mainPath = '/' + p.main;
    const indexFile = p.files.find(file => new URL(file.url).pathname === mainPath);
    const j = JSON.parse(indexFile.response.body.toString('utf8'));

    p.context.json = j;
  },
};
const xrTypeAdders = {
  'webxr-site@0.0.1': async function(p) {
    const mainPath = '/' + _removeUrlTail(p.main);
    const indexFile = p.files.find(file => new URL(file.url).pathname === mainPath);
    const indexHtml = indexFile.response.body.toString('utf-8');
    await p.context.iframe.contentWindow.xrpackage.iframeInit({
      engine: this,
      indexHtml,
      context: GlobalContext.proxyContext,
      id: p.id,
      xrState,
    });
  },
  'gltf@0.0.1': async function(p) {
    this.scene.add(p.context.object);
  },
  'vrm@0.0.1': async function(p) {
    this.scene.add(p.context.object);
  },
  'vox@0.0.1': async function(p) {
    this.scene.add(p.context.object);
  },
};
const xrTypeRemovers = {
  'webxr-site@0.0.1': function(p) {
    this.rafs = this.rafs.filter(raf => {
      const rafWindow = raf[symbols.windowSymbol];
      const rafPackage = this.packages.find(p => p.context.iframe && p.context.iframe.contentWindow === rafWindow);
      return rafPackage !== p;
    });

    p.context.iframe.parentNode.removeChild(p.context.iframe);
  },
  'gltf@0.0.1': function(p) {
    this.scene.remove(p.context.object);
  },
  'vrm@0.0.1': function(p) {
    this.scene.remove(p.context.object);
  },
  'vox@0.0.1': function(p) {
    this.scene.remove(p.context.object);
  },
};

export class XRPackageEngine extends EventTarget {
  constructor(options) {
    super();

    this.options = options || {};

    const canvas = document.createElement('canvas');
    canvas.style.outline = 'none';
    this.domElement = canvas;
    // this.context = GlobalContext.proxyContext;

    GlobalContext.proxyContext = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      xrCompatible: true,
    });
    GlobalContext.contexts = [];

    const context = this.getContext('webgl2');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      // preserveDrawingBuffer: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // renderer.setClearAlpha(0);
    renderer.autoClear = false;
    // renderer.sortObjects = false;
    renderer.physicallyCorrectLights = true;
    renderer.xr.enabled = true;
    this.renderer = renderer;
    window.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 1);
    camera.rotation.order = 'YXZ';
    this.camera = camera;

    const orbitControls = new OrbitControls(camera, canvas, document);
    orbitControls.screenSpacePanning = true;
    orbitControls.enableMiddleZoom = false;
    orbitControls.update();
    this.orbitControls = orbitControls;

    const ambientLight = new THREE.AmbientLight(0xFFFFFF);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 3);
    directionalLight.position.set(10, 10, 10)
    scene.add(directionalLight);
    const directionalLight2 = new THREE.DirectionalLight(0xFFFFFF, 3);
    scene.add(directionalLight2);

    this.fakeSession = new XR.XRSession();
    this.fakeSession.onrequestanimationframe = this.requestAnimationFrame.bind(this);
    this.fakeSession.oncancelanimationframe = this.cancelAnimationFrame.bind(this);

    window.OldXR = {
      XR: window.XR,
      XRSession: window.XRSession,
      XRRenderState: window.XRRenderState,
      XRWebGLLayer: window.XRWebGLLayer,
      XRFrame: window.XRFrame,
      XRView: window.XRView,
      XRViewport: window.XRViewport,
      XRPose: window.XRPose,
      XRViewerPose: window.XRViewerPose,
      XRInputSource: window.XRInputSource,
      // XRRay,
      // XRInputPose,
      XRInputSourceEvent: window.XRInputSourceEvent,
      XRSpace: window.XRSpace,
      XRReferenceSpace: window.XRReferenceSpace,
      XRBoundedReferenceSpace: window.XRBoundedReferenceSpace,
    };

    window.XR = XR.XR;
    window.XRSession = XR.XRSession;
    window.XRRenderState = XR.XRRenderState;
    window.XRWebGLLayer = XR.XRWebGLLayer;
    window.XRFrame = XR.XRFrame;
    window.XRView = XR.XRView;
    window.XRViewport = XR.XRViewport;
    window.XRPose = XR.XRPose;
    window.XRViewerPose = XR.XRViewerPose;
    window.XRInputSource = XR.XRInputSource;
    window.XRRay = XR.XRRay;
    // window.XRInputPose = XR.XRInputPose;
    window.XRInputSourceEvent = XR.XRInputSourceEvent;
    window.XRSpace = XR.XRSpace;
    window.XRReferenceSpace = XR.XRReferenceSpace;
    window.XRBoundedReferenceSpace = XR.XRBoundedReferenceSpace;

    renderer.xr.setSession(this.fakeSession);

    this.packages = [];
    this.ids = 0;
    this.rafs = [];
    this.rig = null;
    this.rigMatrix = new THREE.Matrix4();
    this.rigMatrixEnabled = false;
    this.avatar = null;
    this.realSession = null;
    this.referenceSpace = null;
    this.loadReferenceSpaceInterval = 0;
    this.cancelFrame = null;
    
    const animate = timestamp => {
      const frameId = window.requestAnimationFrame(animate);
      this.cancelFrame = () => {
        window.cancelAnimationFrame(frameId);
      };
      this.tick(timestamp);
    };
    window.requestAnimationFrame(animate);
  }
  getContext(type, opts) {
    return getContext.call(this.domElement, type, opts);
  }
  async add(p) {
    p.parent = this;
    this.packages.push(p);

    this.dispatchEvent(new MessageEvent('packageadd', {
      data: p,
    }));

    await p.waitForLoad();

    const {type} = p;
    const adder = xrTypeAdders[type];
    if (adder) {
      await adder.call(this, p);
    } else {
      this.remove(p);
      throw new Error(`unknown xr_type: ${type}`);
    }
  }
  remove(p) {
    const index = this.packages.indexOf(p);
    if (index !== -1) {
      const {type} = p;
      const remover = xrTypeRemovers[type];
      if (remover) {
        remover.call(this, p);
        p.parent = null;

        this.packages.splice(index, 1);

        this.dispatchEvent(new MessageEvent('packageremove', {
          data: p,
        }));
      }
    } else {
      throw new Error(`unknown xr_type: ${type}`);
    }
  }
  async setSession(realSession) {
    if (this.loadReferenceSpaceInterval !== 0) {
      clearInterval(this.loadReferenceSpaceInterval);
      this.loadReferenceSpaceInterval = 0;
    }
    if (realSession) {
      this.cancelFrame();
      this.cancelFrame = null;
      
      let referenceSpaceType = '';
      const _loadReferenceSpace = async () => {
        const lastReferenceSpaceType = referenceSpaceType;
        let referenceSpace;
        try {
          referenceSpace = await realSession.requestReferenceSpace('local-floor');
          referenceSpaceType = 'local-floor';
        } catch (err) {
          referenceSpace = await realSession.requestReferenceSpace('local');
          referenceSpaceType = 'local';
        }

        if (referenceSpaceType !== lastReferenceSpaceType) {
          console.log(`referenceSpace changed to ${referenceSpaceType}`);
          this.referenceSpace = referenceSpace;
        }
      };
      await _loadReferenceSpace();
      this.loadReferenceSpaceInterval = setInterval(_loadReferenceSpace, 1000);

      const baseLayer = new window.OldXR.XRWebGLLayer(realSession, GlobalContext.proxyContext);
      realSession.updateRenderState({baseLayer});

      await new Promise((accept, reject) => {
        realSession.requestAnimationFrame((timestamp, frame) => {
          const pose = frame.getViewerPose(this.referenceSpace);
          const viewport = baseLayer.getViewport(pose.views[0]);
          const width = viewport.width;
          const height = viewport.height;
          const fullWidth = (() => {
            let result = 0;
            for (let i = 0; i < pose.views.length; i++) {
              result += baseLayer.getViewport(pose.views[i]).width;
            }
            return result;
          })();

          GlobalContext.xrState.isPresentingReal[0] = 1;
          GlobalContext.xrState.stereo[0] = 1;
          GlobalContext.xrState.renderWidth[0] = width;
          GlobalContext.xrState.renderHeight[0] = height;
          
          GlobalContext.xrFramebuffer = realSession.renderState.baseLayer.framebuffer;

          const animate = (timestamp, frame) => {
            const frameId = realSession.requestAnimationFrame(animate);
            this.cancelFrame = () => {
              realSession.cancelAnimationFrame(frameId);
            };
            this.tick(timestamp, frame);
          };
          realSession.requestAnimationFrame(animate);

          /* win.canvas.width = fullWidth;
          win.canvas.height = height;

          await win.runAsync({
            method: 'enterXr',
          }); */

          accept();

          console.log('XR setup complete');
        });
        // core.setSession(realSession);
        // core.setReferenceSpace(referenceSpace);
      });
    }
    this.realSession = realSession;
    
    this.packages.forEach(p => {
      p.setSession(realSession);
    });
  }
  tick(timestamp, frame) {
    this.renderer.clear(true, true, true);

    if (!this.session) {
      this.orbitControls.enabled && this.orbitControls.update();
      this.setCamera(this.camera);
    }

    // emit event
    this.dispatchEvent(new CustomEvent('tick'));

    // update pose
    const {realSession} = this;
    if (realSession) {
      // console.log('animate session', realSession, frame, referenceSpace);
      // debugger;
      const pose = frame.getViewerPose(this.referenceSpace);
      if (pose) {
        const inputSources = Array.from(realSession.inputSources);
        const gamepads = navigator.getGamepads();

        const _loadHmd = () => {
          const {views} = pose;

          xrState.leftViewMatrix.set(views[0].transform.inverse.matrix);
          xrState.leftProjectionMatrix.set(views[0].projectionMatrix);

          xrState.rightViewMatrix.set(views[1].transform.inverse.matrix);
          xrState.rightProjectionMatrix.set(views[1].projectionMatrix);
          
          // console.log('load hmd', frame, pose, views, xrState.leftViewMatrix);

          localMatrix
            .fromArray(xrState.leftViewMatrix)
            .getInverse(localMatrix)
            .decompose(localVector, localQuaternion, localVector2)
          localVector.toArray(xrState.position);
          localQuaternion.toArray(xrState.orientation);
        };
        _loadHmd();

        const _loadGamepad = i => {
          const inputSource = inputSources[i];
          const xrGamepad = xrState.gamepads[i];

          let pose, gamepad;
          if (inputSource && (pose = frame.getPose(inputSource.targetRaySpace, referenceSpace)) && (gamepad = inputSource.gamepad || gamepads[i])) {
            const {transform} = pose;
            const {position, orientation, matrix} = transform;
            if (position) { // new WebXR api
              xrGamepad.position[0] = position.x;
              xrGamepad.position[1] = position.y;
              xrGamepad.position[2] = position.z;

              xrGamepad.orientation[0] = orientation.x;
              xrGamepad.orientation[1] = orientation.y;
              xrGamepad.orientation[2] = orientation.z;
              xrGamepad.orientation[3] = orientation.w;
            } else if (matrix) { // old WebXR api
              localMatrix
                .fromArray(transform.matrix)
                .decompose(localVector, localQuaternion, localVector2);

              xrGamepad.position[0] = localVector.x;
              xrGamepad.position[1] = localVector.y;
              xrGamepad.position[2] = localVector.z;

              xrGamepad.orientation[0] = localQuaternion.x;
              xrGamepad.orientation[1] = localQuaternion.y;
              xrGamepad.orientation[2] = localQuaternion.z;
              xrGamepad.orientation[3] = localQuaternion.w;
            }
            
            for (let j = 0; j < gamepad.buttons.length; j++) {
              const button = gamepad.buttons[j];
              const xrButton = xrGamepad.buttons[j];
              xrButton.pressed[0] = button.pressed;
              xrButton.touched[0] = button.touched;
              xrButton.value[0] = button.value;
            }
            
            for (let j = 0; j < gamepad.axes.length; j++) {
              xrGamepad.axes[j] = gamepad.axes[j];
            }
            
            xrGamepad.connected[0] = 1;
          } else {
            xrGamepad.connected[0] = 0;
          }
        };
        _loadGamepad(0);
        _loadGamepad(1);
      }
    }

    const _computeDerivedGamepadsData = () => {
      const _deriveGamepadData = gamepad => {
        localQuaternion.fromArray(gamepad.orientation);
        localVector
          .set(0, 0, -1)
          .applyQuaternion(localQuaternion)
          .toArray(gamepad.direction);
        localVector.fromArray(gamepad.position);
        localVector2.set(1, 1, 1);
        localMatrix
          .compose(localVector, localQuaternion, localVector2)
          .toArray(gamepad.transformMatrix);
      };
      for (let i = 0; i < xrState.gamepads.length; i++) {
        _deriveGamepadData(xrState.gamepads[i]);
      }
    };
    _computeDerivedGamepadsData();

    {
      const {rig, camera} = this;
      if (rig) {
        if (this.rigMatrixEnabled) {
          this.rigMatrix.decompose(localVector, localQuaternion, localVector2);
        } else {
          const m = new THREE.Matrix4().fromArray(xrState.leftViewMatrix);
          m.getInverse(m);
          m.decompose(localVector, localQuaternion, localVector2);
        }
        // camera.position.add(localVector2.set(0, -0.5, -2).applyQuaternion(camera.quaternion));
        rig.inputs.hmd.position.copy(localVector);
        rig.inputs.hmd.quaternion.copy(localQuaternion);
        rig.inputs.leftGamepad.position.copy(localVector).add(localVector2.set(0.3, -0.15, -0.5).applyQuaternion(localQuaternion));
        rig.inputs.leftGamepad.quaternion.copy(localQuaternion);
        rig.inputs.rightGamepad.position.copy(localVector).add(localVector2.set(-0.3, -0.15, -0.5).applyQuaternion(localQuaternion));
        rig.inputs.rightGamepad.quaternion.copy(localQuaternion);
        // camera.position.sub(localVector2);

        rig.update();
      }
    }

    /* for (let i = 0; i < GlobalContext.contexts.length; i++) {
      const context =  GlobalContext.contexts[i];
      context._exokitClearEnabled && context._exokitClearEnabled(true);
      if (context._exokitBlendEnabled) {
        if (highlight) {
          context._exokitBlendEnabled(false);
          context._exokitEnable(context.BLEND);
          context._exokitBlendFuncSeparate(context.CONSTANT_COLOR, context.ONE_MINUS_SRC_ALPHA, context.CONSTANT_COLOR, context.ONE_MINUS_SRC_ALPHA);
          context._exokitBlendEquationSeparate(context.FUNC_ADD, context.FUNC_ADD);
          context._exokitBlendColor(highlight[0], highlight[1], highlight[2], highlight[3]);
        } else {
          context._exokitBlendEnabled(true);
        }
      }
    }
    const layerContext = layered ? vrPresentState.glContext : null;
    if (layerContext) {
      layerContext._exokitClearEnabled(false);
    } */
    for (let i = 0; i < this.packages.length; i++) {
      const p = this.packages[i];
      if (p.context.iframe && p.context.iframe.contentWindow.xrpackage.session && p.context.iframe.contentWindow.xrpackage.session.renderState.baseLayer) {
        p.context.iframe.contentWindow.xrpackage.session.renderState.baseLayer.context._exokitClearEnabled(false);
        // console.log('got iframe', p.context.iframe.contentWindow.xrpackage.session.renderState.baseLayer.context.canvas.transferToImageBitmap());
        // debugger;
      }
      if (p.context.worker) {
        p.context.worker.postMessage({
          method: 'tick',
        });
      }
    }

    // tick rafs
    const _tickRafs = () => {
      const rafs = this.rafs.slice();
      this.rafs.length = 0;
      for (let i = 0; i < rafs.length; i++) {
        const raf = rafs[i];
        const rafWindow = raf[symbols.windowSymbol];
        const rafPackage = this.packages.find(p => p.context.iframe && p.context.iframe.contentWindow === rafWindow);
        if (!rafPackage || rafPackage.visible) {
          raf();
        } else {
          this.rafs.push(raf);
        }
      }
    };
    _tickRafs();

    // console.log('render context 1');
    this.renderer.render(this.scene, this.camera);
    // console.log('render context 2', GlobalContext.proxyContext.getError());
  }
  requestAnimationFrame(fn, win) {
    this.rafs.push(fn);

    const id = ++this.ids;
    fn[symbols.rafCbsSymbol] = id;
    fn[symbols.windowSymbol] = win;
    return id;
  }
  cancelAnimationFrame(id) {
    const index = this.rafs.findIndex(fn => fn[symbols.rafCbsSymbol].id === id);
    if (index !== -1) {
      this.rafs.splice(index, 1);
    }
  }
  setCamera(camera) {
    camera.matrixWorldInverse.toArray(xrState.leftViewMatrix);
    camera.projectionMatrix.toArray(xrState.leftProjectionMatrix);

    xrState.rightViewMatrix.set(xrState.leftViewMatrix);
    xrState.rightProjectionMatrix.set(xrState.leftProjectionMatrix);
  }
  setRigMatrix(rigMatrix) {
    if (rigMatrix) {
      this.rigMatrix.copy(rigMatrix);
      this.rigMatrixEnabled = true;
    } else {
      this.rigMatrixEnabled = false;
    }
  }
  async wearAvatar(p) {
    if (!p.loaded) {
      await new Promise((accept, reject) => {
        p.addEventListener('load', e => {
          accept();
        }, {once: true});
      });
    }

    if (this.rig) {
      this.scene.remove(this.rig.model);
      this.rig.destroy();
      this.rig = null;
    }

    const {model} = p.context;
    if (model) {
      model.scene.traverse(o => {
        o.frustumCulled = false;
      });
      this.rig = new Avatar(model, {
        fingers: true,
        hair: true,
        visemes: true,
        decapitate: true,
        microphoneMediaStream: null,
        // debug: !newModel,
      });
      this.scene.add(this.rig.model);

      this.avatar = p;
    }

    this.dispatchEvent(new MessageEvent('avatarchange', {
      data: this.avatar,
    }));
  }
  defaultAvatar() {
    if (this.rig) {
      this.scene.remove(this.rig.model);
      this.rig.destroy();
      this.rig = null;
    }

    this.rig = new Avatar(null, {
      fingers: true,
      hair: true,
      visemes: true,
      debug: true,
    });
    this.scene.add(this.rig.model);

    this.avatar = null;

    this.dispatchEvent(new MessageEvent('avatarchange', {
      data: this.avatar,
    }));
  }
  reset() {
    const ps = this.packages.slice();
    for (let i = 0; i < ps.length; i++) {
      this.remove(ps[i]);
    }
  }
  async importScene(uint8Array) {
    const p = new XRPackage(uint8Array);
    await p.waitForLoad();
    if (p.type === 'xrpackage-scene@0.0.1') {
      this.reset();

      const j = p.context.json;
      const {xrpackage_scene: xrPackageScene} = j;
      const {children} = xrPackageScene;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const {id, hash} = child;
        if (hash) {
          const p = await XRPackage.download(hash);
          p.id = id;
          this.add(p);
        } else {
          const primaryUrl = `https://xrpackage.org`;
          const idUrl = primaryUrl + '/' + id + '.wbn';
          const file = p.files.find(f => f.url === idUrl);
          if (file) {
            const p = new XRPackage(file.response.body);
            p.id = id;
            this.add(p);
          } else {
            console.warn('unknown file id', id);
          }
        }
      }
    } else {
      throw new Error('invalid type: ' + p.type);
    }
  }
  async exportScene() {
    const primaryUrl = `https://xrpackage.org`;
    const manifestJsonPath = primaryUrl + '/manifest.json';
    const builder = new wbn.BundleBuilder(manifestJsonPath);
    const manifestJson = {
      name: 'XRPackage Scene',
      description: 'XRPackage scene exported with the browser frontend.',
      xr_type: 'xrpackage-scene@0.0.1',
      start_url: 'manifest.json',
      xrpackage_scene: {
        children: this.packages.map(p => {
          return {
            id: p.id,
            // hash: p.hash,
            matrix: p.matrix.toArray(),
          };
        }),
      },
    };
    builder.addExchange(manifestJsonPath, 200, {
      'Content-Type': 'application/json',
    }, JSON.stringify(manifestJson, null, 2));
    for (let i = 0; i < this.packages.length; i++) {
      const p = this.packages[i];
      builder.addExchange(primaryUrl + '/' + p.id + '.wbn', 200, {
        'Content-Type': 'application/json',
      }, p.data);
    }
    return builder.createBundle();
  }
  async uploadScene() {
    const primaryUrl = `https://xrpackage.org`;
    const manifestJsonPath = primaryUrl + '/manifest.json';
    const builder = new wbn.BundleBuilder(manifestJsonPath);
    const hashes = await Promise.all(this.packages.map(p => p.upload()));
    const manifestJson = {
      name: 'XRPackage Scene',
      description: 'XRPackage scene exported with the browser frontend.',
      xr_type: 'xrpackage-scene@0.0.1',
      start_url: 'manifest.json',
      xrpackage_scene: {
        children: this.packages.map((p, i) => {
          return {
            id: p.id,
            hash: hashes[i],
            matrix: p.matrix.toArray(),
          };
        }),
      },
    };
    builder.addExchange(manifestJsonPath, 200, {
      'Content-Type': 'application/json',
    }, JSON.stringify(manifestJson, null, 2));
    return builder.createBundle();
  }
  static async downloadScene(hash) {
    const res = await fetch(`${apiHost}/${hash}.wbn`);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const p = new XRPackage(uint8Array);
      await this.importScene(p);
    } else {
      if (res.status === 404) {
        return null;
      } else {
        throw new Error('download failed: ' + res.status);
      }
    }
  }
}

let packageIds = Date.now();
export class XRPackage extends EventTarget {
  constructor(a) {
    super();

    this.id = (packageIds++) + '';
    this.name = '';
    this.loaded = false;

    this.matrix = a instanceof XRPackage ? a.matrix.clone() : new THREE.Matrix4();
    this._visible = true;
    this.parent = null;
    this.context = {};

    if (a instanceof XRPackage) {
      this.data = a.data;
      this.files = a.files.slice();
    } else {
      this.data = a;

      const bundle = new wbn.Bundle(a);
      const files = [];
      for (const url of bundle.urls) {
        const response = bundle.getResponse(url);
        files.push({
          url,
          // status: response.status,
          // headers: response.headers,
          response,
          // body: response.body.toString('utf-8')
        });
      }
      this.files = files;
    }

    this.load();
  }
  load() {
    const manifestJsonFile = this.files.find(file => new URL(file.url).pathname === '/manifest.json');
    if (manifestJsonFile) {
      const s = manifestJsonFile.response.body.toString('utf-8');
      const j = JSON.parse(s);
      if (j && typeof j.xr_type === 'string' && typeof j.start_url === 'string') {
        let {
          name,
          xr_type: xrType,
          start_url: startUrl,
          xr_details: xrDetails,
        } = j;
        if (xrDetails === undefined || (typeof xrDetails === 'object' && !Array.isArray(xrDetails))) {
          xrDetails = xrDetails || {};
        } else {
          throw new Error('invalid xr_details in manifest.json');
        }
        const loader = xrTypeLoaders[xrType];
        if (loader) {
          this.name = name;
          this.type = xrType;
          this.main = startUrl;
          this.details = xrDetails;

          swLoadPromise
            .then(() => requestSw({
              method: 'hijack',
              id: this.id,
              startUrl: _removeUrlTail(startUrl),
              script: xrDetails ? xrDetails.script : null,
              files: this.files.map(f => ({
                pathname: new URL(f.url).pathname,
                headers: f.response.headers,
                body: f.response.body,
              })),
            }))
            .then(() => loader(this))
            .then(o => {
              this.loaded = true;
              this.dispatchEvent(new MessageEvent('load', {
                data: {
                  type: this.type,
                  object: o,
                },
              }));
            });
        } else {
          throw new Error(`unknown xr_type: ${xrType}`);
        }
      } else {
        throw new Error('could not find xr_type and start_url in manifest.json');
      }
    } else {
      throw new Error('no manifest.json in pack');
    }
  }
  clone() {
    return new XRPackage(this);
  }
  async waitForLoad() {
    if (!this.loaded) {
      await new Promise((accept, reject) => {
        this.addEventListener('load', e => {
          accept();
        }, {once: true});
      });
    }
  }
  get visible() {
    return this._visible;
  }
  set visible(visible) {
    this._visible = visible;

    const o = this.getObject();
    if (o) {
      o.visible = visible;
    }
  }
  static async compileFromFile(file) {
    const _createFile = async (file, xrType, mimeType) => {
      const fileData = await new Promise((accept, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          accept(new Uint8Array(reader.result));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
      return this.compileRaw(
        [
          {
            url: '/' + file.name,
            type: mimeType,
            data: fileData,
          },
          {
            url: '/manifest.json',
            type: 'application/json',
            data: JSON.stringify({
              xr_type: xrType,
              start_url: file.name,
            }, null, 2),
          }
        ]
      );
    };

    if (/\.gltf$/.test(file.name)) {
      return await _createFile(file, 'gltf@0.0.1', 'model/gltf+json');
    } else if (/\.glb$/.test(file.name)) {
      return await _createFile(file, 'gltf@0.0.1', 'application/octet-stream')
    } else if (/\.vrm$/.test(file.name)) {
      return await _createFile(file, 'vrm@0.0.1', 'application/octet-stream');
    } else if (/\.html$/.test(file.name)) {
      return await _createFile(file, 'webxr-site@0.0.1', 'text/html');
    } else if (/\.wbn$/.test(file.name)) {
      const arrayBuffer = await new Promise((accept, reject) => {
        const fr = new FileReader();
        fr.readAsArrayBuffer(file);
        fr.onload = () => {
          accept(fr.result);
        };
        fr.onerror = reject;
      });
      const uint8Array = new Uint8Array(arrayBuffer);
      return uint8Array;
    } else {
      throw new Error(`unknown file type: ${file.type}`);
    }
  }
  static compileRaw(files) {
    const manifestFile = files.find(file => file.url === '/manifest.json');
    const j = JSON.parse(manifestFile.data);
    const {start_url: startUrl} = j;

    const primaryUrl = `https://xrpackage.org`;
    // const manifestUrl = primaryUrl + '/manifest.json';
    const builder = new wbn.BundleBuilder(primaryUrl + '/' + startUrl);
      // .setManifestURL(manifestUrl);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const {url, type, data} = file;
      builder.addExchange(primaryUrl + url, 200, {
        'Content-Type': type,
      }, data);
    }
    return builder.createBundle();
  }
  getObject() {
    return this.context.object;
  }
  setMatrix(m) {
    this.matrix.copy(m);
    this.context.object &&
      this.context.object.matrix
        .copy(m)
        .decompose(this.context.object.position, this.context.object.quaternion, this.context.object.scale);
    this.context.iframe && this.context.iframe.contentWindow.xrpackage.setMatrix(this.matrix.toArray(localArray));
    this.dispatchEvent(new MessageEvent('matrixupdate', {
      data: this.matrix,
    }));
  }
  setSession(session) {
    this.context.iframe && this.context.iframe.contentWindow.xrpackage.setSession(session);
  }
  async upload() {
    const res = await fetch(`${apiHost}/`, {
      method: 'PUT',
      body: this.data,
    });
    if (res.ok) {
      const j = await res.json();
      const {hash} = j;
      return hash;
    } else {
      throw new Error('upload failed: ' + res.status);
    }
  }
  static async download(hash) {
    const res = await fetch(`${apiHost}/${hash}.wbn`);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      return new XRPackage(uint8Array);
    } else {
      if (res.status === 404) {
        return null;
      } else {
        throw new Error('download failed: ' + res.status);
      }
    }
  }
}

window.XRPackage = XRPackage;