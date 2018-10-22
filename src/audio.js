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
        this.sound = null;
        this.decoder = null;
        this.gainOut = null;
        this.cameraStartDirection = null;
    }

    // function to load samples
    loadSample(context, url, maxOrder, doAfterLoading) {
      if (maxOrder != 1) {
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


            this.channel_order = vrParams.audio.channel_order;
            // FuMa to ACN converter
            if (this.channel_order == 'fuma') {
              var converterF2A = new ambisonics.converters.wxyz2acn(this.context); // eslint-disable-line
              console.log(converterF2A);
              converterF2A.out.connect(this.rotator.in);
            }

            // output gain
            this.gainOut = this.context.createGain();

            // connect graph
            if (vrParams.audio.multichannel_out) {
              this.decoder = new jsonDecoder(this.context, this.order);
              console.log(this.decoder);

              this.decoder.loadDecoderMtx(vrParams.audio.decoder_file);
            } else {
              // initialize ambisonic binaural decoder
              this.decoder = new ambisonics.binDecoder(this.context, this.order); // eslint-disable-line
              console.log(this.decoder);
            }

            this.audioSrc = vrParams.audio.src;
            this.cameraStartDirection = vrParams.camera.direction;

        }
    }

    initAudio() {
        // problem: audio wird gestartet bzw. routing wird gemacht, bevor decoder geladen
        this.rotator.out.connect(this.decoder.in);
        this.decoder.out.connect(this.gainOut);
        this.gainOut.connect(this.context.destination);

        // load the audio
        this.loadSample(this.context, this.audioSrc, this.order, decodedBuffer => {
            this.sound = this.context.createBufferSource();
            this.sound.buffer = decodedBuffer;
            this.sound.loop = true;
            if (this.channel_order == 'fuma') {
              this.sound.connect(converterF2A.in);
            } else {
              this.sound.connect(this.rotator.in);
            }
      })
    }

    startAudio() {
      this.sound.start(0);
      this.sound.isPlaying = true;
    }

    changeOrientation(cameraDirection) {
        var cameraCenterDirection = this.cameraStartDirection;
        // calc azim angle
        var directionOnXZPlane = (new THREE.Vector3())
            .copy(cameraDirection)
            .projectOnPlane(new THREE.Vector3(0, 1, 0));
        var azimAngle = directionOnXZPlane.angleTo(cameraCenterDirection);
        var azimCross = (new THREE.Vector3())
            .crossVectors(directionOnXZPlane, cameraCenterDirection);
        var signedAzimAngle = (azimCross.y > 0) ? (azimAngle) : (0 - azimAngle);
        let azimAngleDegrees = -signedAzimAngle / Math.PI * 180;
        // calc elev angle
        var directionOnXYPlane = (new THREE.Vector3())
            .copy(cameraDirection)
            .projectOnPlane(new THREE.Vector3(0, 0, 1));
        var elevAngle = directionOnXYPlane.angleTo(cameraCenterDirection);
        // -90..90
        if (elevAngle > Math.PI/2)
          elevAngle = Math.PI - elevAngle;
        var elevCross = (new THREE.Vector3())
            .crossVectors(directionOnXYPlane, cameraCenterDirection);
        var signedElevAngle = (elevCross.z > 0) ? (elevAngle) : (0 - elevAngle);
        let elevAngleDegrees = signedElevAngle / Math.PI * 180;

        this.rotator.yaw = azimAngleDegrees;
        this.rotator.pitch = elevAngleDegrees;
        this.rotator.updateRotMtx();
    }

}

module.exports = Audio;
