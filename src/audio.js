const THREE = require('three');
const ambisonics = require('./lib/ambisonics.min');

class Audio {

    constructor() {
        this.audio = null;
        this.audioLoader = null;
        this.context = null;
        this.rotator = null;
        this.order = null;
        this.channel_order = null;
    }

    // function to load samples
    loadSample(context, url, maxOrder, doAfterLoading) {
      if (maxOrder == 1) {
        var loader_sound = new ambisonics.HOAloader(context, maxOrder, url, doAfterLoading);
        loader_sound.load();
      } else {
        var fetchSound = new XMLHttpRequest(); // Load the Sound with XMLHttpRequest
        fetchSound.open("GET", url, true); // Path to Audio File
        fetchSound.responseType = "arraybuffer"; // Read as Binary Data
        fetchSound.onload = () => {
            this.context.decodeAudioData(fetchSound.response)
                .then(doAfterLoading);
        };
        fetchSound.onerror = function(err) {
            console.log('error loading sound ' + url);
            console.log(err);
        };
        fetchSound.send();
      }
    }

    setup(vrControl, vrParams) {

        // "positional" mode sets up speakers
        if (vrParams.audio.type === 'positional') {
            vrControl.listener = new THREE.AudioListener();
            vrControl.camera.add(vrControl.listener);

            this.audio = new THREE.PositionalAudio(vrControl.listener);
            this.audio.position.copy(vrParams.audio.position);
            this.audio.up = vrControl.vec3(0, 1, 0);
            this.audioLoader = new THREE.AudioLoader();
            this.audioLoader.load(vrParams.audio.src, buffer => {
                this.audio.setBuffer(buffer);
                this.audio.setLoop(true);
                this.audio.play();
            });
        } else if (vrParams.audio.type === 'ambisonic') {

            // "ambisonic" mode reads an ambisonic audio source
            var AudioContext = window.AudioContext;
            this.context = new AudioContext();
            var sound;

            this.order = vrParams.audio.order;

            if (!this.order)
              this.order = 1;

            // initialize ambisonic rotator
            this.rotator = new ambisonics.sceneRotator(this.context, this.order); // eslint-disable-line
            console.log(this.rotator);

            // initialize ambisonic decoder
            var decoder = new ambisonics.binDecoder(this.context, this.order); // eslint-disable-line
            console.log(decoder);

            this.channel_order = vrParams.audio.channel_order;
            // FuMa to ACN converter
            if (this.channel_order == 'fuma') {
              var converterF2A = new ambisonics.converters.wxyz2acn(this.context); // eslint-disable-line
              console.log(converterF2A);
              converterF2A.out.connect(this.rotator.in);
            }

            // output gain
            var gainOut = this.context.createGain();

            // connect graph
            this.rotator.out.connect(decoder.in);
            decoder.out.connect(gainOut);
            gainOut.connect(this.context.destination);

            // load the audio
            this.loadSample(this.context, vrParams.audio.src, this.order, decodedBuffer => {
                sound = this.context.createBufferSource();
                sound.buffer = decodedBuffer;
                sound.loop = true;
                if (this.channel_order == 'fuma') {
                  sound.connect(converterF2A.in);
                } else {
                  sound.connect(this.rotator.in);
                }
                sound.start(0);
                sound.isPlaying = true;
            });
        }
    }

    changeOrientation(cameraDirection) {
        var cameraCenterDirection = new THREE.Vector3(1, 0, 0);
        var directionOnXZPlane = (new THREE.Vector3())
            .copy(cameraDirection)
            .projectOnPlane(new THREE.Vector3(0, 1, 0));
        var angle = directionOnXZPlane.angleTo(cameraCenterDirection);
        var cross = (new THREE.Vector3())
            .crossVectors(directionOnXZPlane, cameraCenterDirection);
        var signedAngle = (cross.y > 0) ? (angle) : (0 - angle);
        let angleDegrees = -signedAngle / Math.PI * 180;
        this.rotator.yaw = angleDegrees;
        this.rotator.pitch = 0;
        this.rotator.updateRotMtx();
    }

}

module.exports = Audio;
