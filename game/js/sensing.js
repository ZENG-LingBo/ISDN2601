// Freeze: body tracking for a real camera, with Google's MediaPipe Pose Landmarker.
// The model runs on this laptop, in the browser. The video isn't recorded or sent anywhere.
// The first time, the browser downloads the MediaPipe code (from jsDelivr) and the model
// (about 6 MB, from Google), then keeps them in its cache.
//
// Sensing.detect turns a camera frame into what the games need, in the same form as the
// practice players (practice.js): each player's body points, and a mask of where people are.
(function (root) {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const MAX_PLAYERS = 6;

  let landmarker = null;
  let loading = null;
  let lastTs = 0;

  function options(delegate) {
    return {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: MAX_PLAYERS,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: true,
    };
  }

  // Load the code and the model once. Uses the graphics chip where it can, else the processor.
  function load() {
    if (landmarker) return Promise.resolve();
    if (!loading) {
      loading = (async () => {
        const vision = await import(CDN + '/vision_bundle.mjs');
        const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
        try {
          landmarker = await vision.PoseLandmarker.createFromOptions(files, options('GPU'));
        } catch (e) {
          landmarker = await vision.PoseLandmarker.createFromOptions(files, options('CPU'));
        }
      })().catch((err) => {
        loading = null; // let the player try again
        throw err;
      });
    }
    return loading;
  }

  // frame: a canvas holding the camera picture, not mirrored. now: a time in milliseconds.
  // Returns { poses, mask }, both mirrored so they line up with what players see:
  //   poses  each player's 33 body points { x, y, v }, x from 0 to width ÷ height, y from 0 to 1
  //   mask   w × h, 1 where a person is
  function detect(frame, now, w, h) {
    const ts = Math.max(Math.round(now), lastTs + 1); // timestamps must keep going up
    lastTs = ts;
    const result = landmarker.detectForVideo(frame, ts);
    const aspect = frame.width / frame.height;
    const poses = (result.landmarks || []).map((pts) => pts.map((p) => ({ x: (1 - p.x) * aspect, y: p.y, v: p.visibility ?? 1 })));
    const mask = new Uint8Array(w * h);
    for (const m of result.segmentationMasks || []) {
      const mw = m.width;
      const mh = m.height;
      const values = m.getAsFloat32Array();
      for (let y = 0; y < h; y++) {
        const sy = Math.min(mh - 1, Math.floor(((y + 0.5) * mh) / h));
        for (let x = 0; x < w; x++) {
          const sx = mw - 1 - Math.min(mw - 1, Math.floor(((x + 0.5) * mw) / w)); // mirror
          if (values[sy * mw + sx] > 0.5) mask[y * w + x] = 1;
        }
      }
      m.close();
    }
    return { poses, mask };
  }

  root.Sensing = { load, detect, ready: () => !!landmarker, MAX_PLAYERS };
})(typeof self !== 'undefined' ? self : this);
