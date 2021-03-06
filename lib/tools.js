var fs = require('fs-extra');
var DecompressZip = require('decompress-zip');
var archiver = require('archiver');
var request = require('request');
var Download = require('download');
var Q = require('q');
var checksum = require('checksum');
var isOnline = require('is-online');

var tools = {};
module.exports = tools;


/**
 * Zip folder
 * @param {string} source - Filesystem path of the folder
 * @param {string} dest - Filesystem path of the archive, its name included
 * @returns {string} Filesystem path of the archive, its name included
 */
tools.zipFolder = function(source, dest) {
  var deferred = Q.defer();

  var output = fs.createWriteStream(dest);
  var zipArchive = archiver('zip');
  output.on('close', function() {
    deferred.resolve(dest);
  });
  zipArchive.pipe(output);
  zipArchive.bulk([
    { src: [ '**/*' ], cwd: source, expand: true }
  ]);
  zipArchive.finalize(function(err) {
    if (err) {
      deferred.reject(err);
    }
  });

  return deferred.promise;
};


/**
 * Unzip file
 * @param {string} archive - Filesystem path of the file
 * @param {string} dest - Filesystem path where to extract files
 * @returns {string} Filesystem path of the extracted files
 */
tools.unzipFile = function(archive, dest) {
  var deferred = Q.defer();
  var unzipper = new DecompressZip(archive);

  unzipper.on('error', function(err) {
    deferred.reject(err);
  });

  unzipper.on('extract', function() {
    deferred.resolve(dest);
  });

  // unzipper.on('progress', function(index, count) {
  // });

  unzipper.extract({
    path: dest,
    filter: function(file) {
      return file.type !== 'SymbolicLink';
    }
  });

  return deferred.promise;
};


/**
 * Add http:// to the url if missing
 * @param {string} url
 * @returns {string} url
 */
tools.addhttp = function(url) {
  if (!/^(f|ht)tps?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url;
};


/**
 * Resolve url
 * We have to expand the url to get the proper final file name
 * Or if we want an error when the url doesn't exist
 * Example from http://www.2ality.com/2012/04/expand-urls.html 
 * @param {string} url - URL to download
 * @returns {string} Resolved url
 */
tools.resolveUrl = function(url) {
  var deferred = Q.defer();
  request({ method: 'HEAD', url: url, followAllRedirects: true }, function (err, response) {
    if (err) {
      deferred.reject(err);
    }
    else {
      if (response.statusCode === 404) {
        deferred.reject(new Error('404 Error File Not Found'));
      }
      else {
        deferred.resolve(response.request.href);
      }
    }
  });
  return deferred.promise;
};


/**
 * Removes a file or directory. The directory can have contents.
 * @param {string} fsPath
 * @returns {string} Path of removed file/directory
 */
tools.removeFiles = function(fsPath) {
  var deferred = Q.defer();
  fs.remove(fsPath, function(err) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(fsPath);
    }
  });
  return deferred.promise;
};


/**
 * Create sha1 checksum of the file
 * @param {string} file - Filesystem path of the file
 * @returns {string} checksum
 */
tools.checksumFile = Q.denodeify(checksum.file);


/**
 * Check if the internet connection is up
 * @returns {boolean} True if online
 */
tools.checkOnline = Q.denodeify(isOnline);


/**
 * Reads a JSON file and then parses it into an object
 * @param {string} file - Filesystem path of the file
 * @returns {object} JSON object
 */
tools.readJson = Q.denodeify(fs.readJson);


/**
 * Move and rename folder
 * @param {string} source - Filesystem path of the folder to move
 * @param {string} dest - Filesystem path where to move the folder to
 * @param {boolean} overwrite - Overwrite existing folder - default false
 * @returns {string} Filesystem path of the destination
 */
tools.moveFolder = function(source, dest, overwrite) {
  var deferred = Q.defer();
  if (overwrite == null) {
    overwrite = false;
  }
  // mkdirp: creates all the necessary directories
  // clobber: if dest exists, an error is returned
  fs.move(source, dest, { mkdirp: true, clobber: overwrite }, function(err) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(dest);
    }
  });
  return deferred.promise;
};


/**
 * Copy a file or directory
 * @param {string} source - Filesystem path of the file/folder to copy
 * @param {string} dest - Filesystem path and name of the new file/folder
 * @returns {string} Filesystem path and name of the new file/folder
 */
tools.copyFs = function(source, dest) {
  var deferred = Q.defer();
  fs.copy(source, dest, function(err) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(dest);
    }
  });
  return deferred.promise;
};


/**
 * Download file
 * @param {string} url - URL to download
 * @param {string} dest - Destination folder
 * @param {string} newName - Rename file to this - optional
 * @returns {string} Filesystem path of the downloaded file
 */
tools.downloadFile = function(url, dest, newName) {
  var deferred = Q.defer();
  new Download().get(url).dest(dest).rename(newName).run(function(err, files) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(files[0].history[ files[0].history.length - 1 ]);
    }
  });
  return deferred.promise;
};


/**
 * Check if file or directory exists
 * @param {string} fsPath - Path in the filesystem to test
 * @returns {boolean} true if it exists
 */
tools.exists = function(fsPath) {
  try {
    fs.statSync(fsPath);
    return true;
  }
  catch (e) {
    return false;
  }
};


/**
 * Convert size in bytes to KB, MB, GB
 * from http://stackoverflow.com/a/18650828/471720
 * @param {number} bytes - Int number of bytes
 * @param {number} decimals - Number of decimals to show - not required
 * @returns {string} Formatted value
 */
tools.formatBytes = function(bytes, decimals) {
  if (bytes === 0) {
    return '0 Byte';
  }
  var k = 1024;
  // on Mac OS X use this
  // http://www.macworld.com/article/1142471/snow_leopard_math.html
  if (process.platform === 'darwin') {
    k = 1000;
  }
  var dm = decimals + 1 || 3;
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toPrecision(dm) + ' ' + sizes[i];
};


/**
 * Check if page is called from app or external browser
 * @param {object} req - Request
 * @returns {boolean} True if called from the app
 */
tools.isInternal = function(req) {
  var internal = false;
  if (req.headers['user-agent'] === 'elcx-web-reader') {
    internal = true;
  }
  return internal;
};