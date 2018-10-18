////////////////////////////////////////////////////////////////////
//  Archontis Politis
//  archontis.politis@aalto.fi
//  David Poirier-Quinot
//  davipoir@ircam.fr
////////////////////////////////////////////////////////////////////
//
//  JSAmbisonics a JavaScript library for higher-order Ambisonics
//  The library implements Web Audio blocks that perform
//  typical ambisonic processing operations on audio signals.
//
////////////////////////////////////////////////////////////////////

///////////////////////////
/* HOA AMBISONIC DECODER */
///////////////////////////

class jsonDecoder {

    constructor(audioCtx, order) {

        // locals
        this.ctx = audioCtx;
        this.order = order;
        this.nCh = (order + 1) * (order + 1);
        this.nSpk = 0;
        this.decodingMatrix = [];

        // Input and output nodes
        this.in = this.ctx.createChannelSplitter(this.nCh);
        this.out = this.ctx.createChannelMerger(1); // dummy
        
    }

    loadDecoderMtx(file){
      var self = this;

      $.getJSON(file)
        .done(function(dec) {
          self.decodingMatrix = dec.Decoder.Matrix;
          console.log("Set decoding matrix from file.");
          console.log(self.decodingMatrix);
          self.initDecoder();
        })
        .fail(function(jqxhr, textStatus, error) {
          var err = textStatus + ", " + error;
          console.log("Loading decoder failed: " + err);
          throw err;
        });
    }

    initDecoder(){
      // update output
      this.nSpk = this.decodingMatrix.length;
      this.out = this.ctx.createChannelMerger(this.nSpk);
      console.log('max channel in AudioContext:', this.ctx.destination.maxChannelCount, 'required:', this.nSpk);
      this.ctx.destination.channelCount = this.nSpk;

      // assign ambisonic gains to gain matrix + connect new graph
      this.mtxGain = new Array(this.nCh);
      for (let i = 0; i < this.nCh; i++) {
        this.mtxGain[i] = new Array(this.nSpk);
        for (let j = 0; j < this.nSpk; j++) {
            // create / setup gain
            let g = this.ctx.createGain();
            g.gain.value = this.decodingMatrix[j][i];
            // connect graph
            this.in.connect(g, i, 0);
            g.connect(this.out, 0, j);
            // save to local
            this.mtxGain[i][j] = g;
        }
      }
    }
}
