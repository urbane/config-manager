'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.HANDLERS = exports.needsUpdate = exports.createBackupFile = exports.ensureConfig = exports.getUpdatedConfig = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _deepmerge = require('deepmerge');

var _deepmerge2 = _interopRequireDefault(_deepmerge);

var _diff = require('diff');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var debug = require('debug')('config-manager');

var HANDLERS = [{
    name: 'json',
    ext: ['json'],
    parse: function parse(data) {
        return JSON.parse(data);
    },
    stringify: function stringify(obj) {
        return JSON.stringify(obj, null, 2);
    }
}, {
    name: 'yaml',
    ext: ['yml', 'yaml'],
    parse: function parse(data) {
        return require('js-yaml').load(data);
    },
    stringify: function stringify(obj) {
        return require('js-yaml').dump(obj);
    }
}, {
    name: 'properties',
    ext: ['ini', 'properties'],
    parse: function parse(data) {
        return require('properties').parse(data);
    },
    stringify: function stringify(data) {
        return require('properties').stringify(data);
    }
}, {
    name: 'xml',
    ext: ['xml'],
    parse: function parse(data) {
        var x2js = new require('x2js')();
        return x2js.xml2js(data);
    },
    stringify: function stringify(data) {
        var x2js = new require('x2js')();
        return x2js.js2xml(data);
    }
}];

/**
 * Gets the config obj from the passed file.  It uses the parser based on the handler.  You may use fileType to
 * override extension based filtering.
 * @param filePath
 * @param [fileType]
 * @param {{}} [options]
 * @param {string} [options.default] The default file contents.  If this is omitted, an error will be thrown if the
 *     file does not exist.
 * @return {Promise}
 */
function getConfig(filePath, fileType, options) {
    if (fileType !== null && (typeof fileType === 'undefined' ? 'undefined' : _typeof(fileType)) === 'object') {
        options = fileType;
        fileType = null;
    }
    return new Promise(function (resolve, reject) {
        _fs2.default.readFile(filePath, 'utf8', function (err, data) {
            if (err) {
                if (options && typeof options.default === 'string' && err.code === 'EEXIST') {
                    data = options.default;
                } else {
                    return reject(err);
                }
            }
            var extension = fileType || _path2.default.extname(filePath).substr(1),
                handler = HANDLERS.find(function (handler) {
                return handler.ext && handler.ext.indexOf(extension) > -1 || handler.test && handler.test(filePath, extension, data);
            });
            if (!handler) {
                return reject(new Error('Could not find suitable handler for ' + filePath + '.'));
            }
            debug('Using handler \'' + handler.name + '\' for file \'' + filePath + '\'.');
            resolve({
                config: handler.parse(data),
                handler: handler,
                data: data
            });
        });
    });
}

/**
 * Checks if the passed config object needs updating.  Note this is atomic.
 * @param existing
 * @param config
 * @return {boolean}
 */
function needsUpdate(existing, config) {
    for (var key in config) {
        var value = config[key];
        if (value && (typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object') {
            if (existing[key] === null || _typeof(existing[key]) !== 'object' || needsUpdate(existing[key], value)) {
                return true;
            }
        } else if (value != existing[key]) {
            return true;
        }
    }
    return false;
}

/**
 * Reads the configuration file, applies the changes and returns a string of the updated. Preserves comments, but not
 * necessarily all formatting.
 * @param filePath
 * @param [fileType] - Use this identifier instead of the file extension for finding the proper file handler
 * @param {{}} config - The config values to update.
 * @param {{}} [options]
 * @param {boolean} [options.replaceConfig=false]
 * @param {boolean} [options.deepMerge=true]
 * @param {boolean} [options.check=false]
 * @param {string} [options.default='']
 * @return {Promise.<string|null>}
 */
function getUpdatedConfig(filePath, fileType, config, options) {
    if (fileType !== null && (typeof fileType === 'undefined' ? 'undefined' : _typeof(fileType)) === 'object') {
        options = config;
        config = fileType;
        fileType = null;
    }
    options = Object.assign({
        replaceConfig: false,
        deepMerge: true,
        check: false,
        default: ''
    }, options);
    var _options = options,
        replaceConfig = _options.replaceConfig,
        deepMerge = _options.deepMerge,
        check = _options.check;


    return getConfig(filePath, fileType, options).then(function (existing) {
        if (check && !needsUpdate(existing, config)) {
            return null;
        }
        var newString = existing.handler.stringify(replaceConfig ? config : deepMerge ? (0, _deepmerge2.default)(existing.config, config) : Object.assign(existing.config, config));
        var diff = (0, _diff.diffLines)(existing.data, newString);
        var resultingString = '';
        diff.forEach(function (diff) {
            if (diff.removed && (diff.value.startsWith('#') || diff.value.startsWith(';') || diff.value.startsWith(';'))) {
                diff.removed = false;
            }
            if (!diff.removed) {
                resultingString += diff.value;
            }
        });
        return resultingString;
    });
}

/**
 * Creates a backup of the file (if file exists) in the format of 'fileName.YYYYMMDD.bak'.  If a existing backup
 * exists, appends .# to backup file.
 * @param {string} filePath
 * @return {Promise}
 */
function createBackupFile(filePath) {
    return new Promise(function (resolve, reject) {
        _fs2.default.readdir(_path2.default.dirname(filePath), function (err, files) {
            if (err) {
                return reject(err);
            }
            var fileNum = 0,
                fileName = _path2.default.parse(filePath).base,
                date = new Date().toISOString().substr(0, 12).replace(/-/g, ''),
                backupName = void 0;
            while (files.indexOf(backupName = fileName + ('.' + date + '.bak') + (fileNum > 0 ? '.' + fileNum : '')) > -1) {
                fileNum++;
            }

            if (files.indexOf(fileName) === -1) {
                debug('\'' + filePath + '\' does not exist, so skipping backup.');
                return resolve();
            }

            _fs2.default.createReadStream(filePath).pipe(_fs2.default.createWriteStream(_path2.default.dirname(filePath) + '/' + backupName)).on('error', function (err) {
                return reject(err);
            }).on('end', function () {
                return resolve();
            });
        });
    });
}

function ensureConfig(filePath, fileType, config) {
    return getUpdatedConfig(filePath, fileType, config, { check: true }).then(function (updatedConfig) {
        if (updatedConfig !== null) {
            return createBackupFile(filePath).then(function () {
                return new Promise(function (resolve, reject) {
                    _fs2.default.writeFile(filePath, updatedConfig, function (err) {
                        return err ? reject(err) : resolve({ filePath: filePath, updatedConfig: updatedConfig });
                    });
                });
            });
        }
        return false;
    });
}

exports.getUpdatedConfig = getUpdatedConfig;
exports.ensureConfig = ensureConfig;
exports.createBackupFile = createBackupFile;
exports.needsUpdate = needsUpdate;
exports.HANDLERS = HANDLERS;
