"use strict";

var px = require("px");
var fs = require("fs");
var AppSceneContext = require('rcvrcore/AppSceneContext');

var Logger = require('rcvrcore/Logger').Logger;
var log = new Logger('XModule');

var CTRL_CODE = 0x100;
var ALT_CODE = 0x200;

var VirtualKeyCode = {UNKNOWN:0, ENTER:13, PAGE_UP:33, PAGE_DOWN:34, LEFT:37, RIGHT:39, DOWN:40, UP: 38,
  PREV:'L'.charCodeAt(0)+CTRL_CODE,
  GUIDE:'G'.charCodeAt(0)+CTRL_CODE,
  ACCELERATOR_BROWSER:'H'.charCodeAt(0)+CTRL_CODE+ALT_CODE,
  ACCELERATOR_SCENE_OUTLINES:'O'.charCodeAt(0)+CTRL_CODE+ALT_CODE,
  ACCELERATOR_RELOAD_ORIG_URL:'R'.charCodeAt(0)+CTRL_CODE+ALT_CODE,
  ACCELERATOR_SCREENSHOT:'S'.charCodeAt(0)+CTRL_CODE,
  ACCELERATOR_FPS:'Y'.charCodeAt(0)+CTRL_CODE+ALT_CODE
};


// The singleton instance of pxRoot
var pxRoot = null;

// The public XRE system APIs
var XreSysApis = {
  getIt: function()  {
    return "The XRE system";
  }
}

function PxRoot(baseUri) {
  this.rootScene = null;
  // only one child scene at the root level for now
  this.childScene = null;
  this.originalUrl = 'browser.js';
  this.fpsBg = null;
}

PxRoot.prototype.initialize = function(x, y, width, height) {
  this.rootScene = px.getScene(x, y, width, height);

  this.rootScene.root.on('onPreKeyDown', function (e) {
    log.message(2, "PxRoot: got pre-key " + e.keyCode);
    switch( getVirtualKeyCode(e.keyCode, e.flags) ) {
      case VirtualKeyCode.ACCELERATOR_SCENE_OUTLINES:
        this.rootScene.showOutlines = !this.rootScene.showOutlines;
        break;
      case VirtualKeyCode.ACCELERATOR_BROWSER:
        var homeURL = "browser.js";
        console.log("loading home url: ", homeURL);
        this.childScene.url = homeURL;
        break;
      case VirtualKeyCode.ACCELERATOR_RELOAD_ORIG_URL:
        console.log("Reloading url: ", this.originalURL);
        this.childScene.url = this.originalUrl;
        break;
      case VirtualKeyCode.ACCELERATOR_FPS:
        this.showFpsView(this.fpsBg === null || this.fpsBg.a==0);
        break;
      case VirtualKeyCode.ACCELERATOR_SCREENSHOT:
        // This returns a data URI string with the image data
        var dataURI = this.rootScene.screenshot('image/png;base64');
        // convert the data URI by stripping off the scheme and type information
        // to a base64 encoded string with just the PNG image data
        var base64PNGData = dataURI.slice(dataURI.indexOf(',')+1);
        // decode the base64 data and write it to a file
        fs.writeFile("screenshot.png", new Buffer(base64PNGData, 'base64'), function(err) {
          if (err)
            console.log("Error creating screenshot.png");
          else
            console.log("Created screenshot.png");
        });
      default:
        return;
    }

    e.stopPropagation();

  }.bind(this));

  this.rootScene.root.on("onPreKeyUp", function(e) {
    switch( getVirtualKeyCode(e.keyCode, e.flags) ) {
      case VirtualKeyCode.ACCELERATOR_SCENE_OUTLINES:
      case VirtualKeyCode.ACCELERATOR_BROWSER:
      case VirtualKeyCode.ACCELERATOR_RELOAD_ORIG_URL:
      case VirtualKeyCode.ACCELERATOR_FPS:
      case VirtualKeyCode.ACCELERATOR_SCREENSHOT:
        e.stopPropagation();
        break;
    }
  });

  this.rootScene.setFocus(this.rootScene.root);


  var self = this;
// register a "global" hook that gets invoked whenever a child scene is created
  this.rootScene.onScene = function (container, innerscene, url) {
    // TODO part of an experiment to eliminate intermediate rendering of the scene
    // while it is being set up
    // container when returned here has it's painting property set to false.
    // it won't start rendering until we set painting to true which we do
    // after the script has loaded

    setTimeout(function () {
      if( container.parent === self.rootScene.root ) {
        log.info("\n\nTJC: New scene is top level: url=" + url);
      } else {
        log.info("\n\nTJC: New scene is second level: url=" + url);
      }

      self.createNewAppContext({
        rootScene: self.rootScene, sceneContainer: container, scene: innerscene, packageUrl: url, xreSysApis: XreSysApis});

    }, 10);
  }


  this.rootScene.on("onResize", function(e) {
    if( this.childScene !== null ) {
      this.childScene.w = e.w;
      this.childScene.h = e.h;
    }
  }.bind(this));

};

PxRoot.prototype.showFpsView = function(show) {
  if( show && this.fpsBg === null ) {
    this.fpsBg = this.rootScene.createRectangle({fillColor: 0x00000080, lineColor: 0xffff0080,lineWidth: 3,x: 10,y: 10,a: 0, parent: this.rootScene.root });
    var fpsCounter = this.rootScene.createText({x: 5,textColor: 0xffffffff,pixelSize: 24,text: "0fps",parent: this.fpsBg });
    this.fpsBg.w = fpsCounter.w + 16;
    this.fpsBg.h = fpsCounter.h;
    this.fpsBg.a = 1.0;

    this.rootScene.on("onFPS", function (e) {
      if (this.fpsBg.a) {
        fpsCounter.text = "" + Math.floor(e.fps) + "fps";
        this.fpsBg.w = fpsCounter.w + 16;
        this.fpsBg.h = fpsCounter.h;
      }
    }.bind(this));
  } else if( show == true ) {
    this.fpsBg.a = 1.0;
  } else {
    this.fpsBg.a = 0;
  }
}

PxRoot.prototype.createNewAppContext = function(params) {
  log.message(2, "Create New Scene Context: url=" + params.packageUrl);

  var appSceneContext = new AppSceneContext(params);

  appSceneContext.loadScene();
  if( params.sceneContainer.parent === params.rootScene.root ) {
    // It's a top level app
    params.rootScene.setFocus(params.sceneContainer);
  }
}


function getVirtualKeyCode(keyCode, flags) {
  var vkCode = keyCode;
  if (typeof flags !== 'undefined ') {
    if (flags & 0x10) {
      vkCode += CTRL_CODE;
    }
    if (flags & 0x20) {
      vkCode += ALT_CODE;
    }
  }

  return vkCode;
}


PxRoot.prototype.addScene = function(params) {
  if( this.rootScene == null ) {
    console.error("Root scene has not been created.  Has PxRoot been initialized?");
    return null;
  }

  if( typeof params.w === 'undefined') {
    params.w = this.rootScene.w;
  }
  if( typeof params.h === 'undefined') {
    params.h = this.rootScene.h;
  }

  params['parent'] = this.rootScene.root;

  this.childScene =  this.rootScene.createScene(params);
  return this.childScene;
};

PxRoot.prototype.setOriginalUrl = function(origUrl) {
  this.originalUrl = origUrl;
}

module.exports = function(x, y, width, height) {
  pxRoot = new PxRoot();
  pxRoot.initialize(x, y, width, height);
  return pxRoot;
};


