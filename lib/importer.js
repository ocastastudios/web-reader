var fs = require('fs-extra');
var path = require('path');
var osenv = require('osenv');
var Q = require('q');
var Download = require('download');
var tools = require('./tools');

var HOME_DIR = osenv.home();
// var TMP_DIR = osenv.tmpdir();
var TMP_DIR = path.join(HOME_DIR, 'Desktop', 'xxx1');
var LIB_DIR = path.join(HOME_DIR, 'Desktop', 'xxx');
var PROJECT_EXT = '.elcx';
var COVER_EXT = '.png';
var COVER = 'cover' + COVER_EXT;
var COMIC_JSON = 'comic.json';
var LIBRARY_JSON = 'comics.json';
var library = {};
var promisesLoadComics = [];
var counter = 0;

var list = [
  'http://j.mp/elcx-hammer',
  'http://j.mp/elcx-mirror',
  'http://www.larsschwednygard.com/wp-content/uploads/birds_of_twilight_park.elcxproject.elcx',
  'http://j.mp/elcx-traume',
  'http://j.mp/elcx-thisman',
  'http://j.mp/elcx-samurai',
  'http://j.mp/elcx-thearcane',
  'http://j.mp/elcx-eagleno4',
  'http://biblicalcomix.com/Pureblood.elcx',
  'http://biblicalcomix.com/Babel.elcxproject.elcx',
  'https://dl.dropboxusercontent.com/s/lr5up35ekkte7vc/A.elcx',
  'http://dave.sunwheeltech.com/electricomics/sleep_well/sleep_well.elcxproject.elcx',
  'https://dl.dropboxusercontent.com/u/15028274/frankenstein_for_kids.elcx',
  'https://www.dropbox.com/s/t85rs71o2bry89r/Monster.elcxproject.elcx?dl=1',
  'https://j.mp/elcx-hello',
  'https://www.dropbox.com/s/j88t208w6d7rnev/thornwand.elcxproject.elcx?dl=1',
  'http://j.mp/elcx-stoners101',
  'http://biblicalcomix.com/Stoners102.elcx',
  'http://j.mp/elcx-whenold',
  'http://j.mp/elcx-sfumato'
];


/**
 * Download file
 * @param {string} url - URL to download
 * @param {string} dest - Destination folder
 * @param {string} newName - Rename file to this
 * @returns {string} Filesystem path of the downloaded file
 */
var downloadFile = function(url, dest, newName) {
  var deferred = Q.defer();
  new Download().get(url).dest(dest).rename(newName).run(function(err, files) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(files[0].history[2]);
    }
  });
  return deferred.promise;
};


/**
 * Copy cover image
 * @param {string} source - Filesystem path of the file to copy
 * @param {string} dest - Filesystem path and name of the new file
 * @returns {string/boolean} Filesystem path and name of the new file or false if not found
 */
var copyCover = function(source, dest) {
  var deferred = Q.defer();
  fs.copy(source, dest, function(err) {
    if (err) {
      deferred.resolve(false);
    }
    else {
      deferred.resolve(dest);
    }
  });
  return deferred.promise;
};


/**
 * @param {string} url - URL to import
 */
var importSingleUrl = function(url) {
  counter++;
  var myUrl = tools.addhttp(url);
  var tmpName = counter + '' + Date.now();
  var newName = tmpName + PROJECT_EXT;
  var archive = path.join(TMP_DIR, newName);
  var tmpPath = path.join(TMP_DIR, tmpName);
  var checksum;
  var comicJson;
  var ourCover;

  // download archive
  return downloadFile(myUrl, TMP_DIR, newName)
  // checksum archive
    .then(tools.checksumFile)
  // unzip archive in tmp dir
    .then(function(res) {
      checksum = res;
      return tools.unzipFile(archive, tmpPath);
    })
  // delete archive
    .then(function() {
      return tools.removeFiles(archive);
    })
  // copy cover
    .then(function() {
      var tmpCoverPath = path.join(tmpPath, COVER);
      var ourCoverPath = path.join(LIB_DIR, checksum + COVER_EXT);
      return copyCover(tmpCoverPath, ourCoverPath);
    })
  // read comic.json
    .then(function(res) {
      ourCover = res;
      return tools.readJson(path.join(tmpPath, COMIC_JSON));
    })
  // delete tmp dir
    .then(function(res) {
      comicJson = res;
      return tools.removeFiles(tmpPath);
    })
  // add entry
    .then(function() {
      var c = checksum + COVER_EXT;
      if (ourCover === false) {
        c = false;
      }
      library[checksum] = {
        cover: c,
        url: myUrl
      };
      library[checksum].data = comicJson;
      return checksum;
    },
  // handle errors
    function(err) {
      console.error(url, err);
      // delete tmp archive and folder
      // we are checking they exist because it depends on when the error was fired
      if (tools.exists(archive)) {
        tools.removeFiles(archive);
      }
      if (tools.exists(tmpPath)) {
        tools.removeFiles(tmpPath);
      }
      if (tools.exists(ourCover)) {
        tools.removeFiles(ourCover);
      }
    });
};


/**
 * @param {array} list - List of url string
 */
var importAllUrl = function(list) {
  for (var i = 0; i < list.length; i++) {
    promisesLoadComics.push(importSingleUrl( list[i] ));
  }
};


/**
 * @param {array} list - List of url string
 */
var init = function(list) {
  var jsonFile = path.join(LIB_DIR, LIBRARY_JSON);
  importAllUrl(list);
  return Q.all(promisesLoadComics)
    .then(function() {
      var str;
      try {
        str = JSON.stringify(library);
        fs.writeJSONSync(jsonFile, library);
      }
      catch(err) {
        console.log(err);
      }
    },
  // handle errors
    function(err) {
      console.error(err);
    });
};


init(list);