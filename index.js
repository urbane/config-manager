import fs from 'fs'
import path from 'path'
import merge  from 'deepmerge'
import {diffLines,applyPatch} from 'diff'

const debug = require('debug')('config-manager')

const HANDLERS = [
    {
        name: 'json',
        ext: ['json'],
        parse(data){
            return JSON.parse(data)
        },
        stringify(obj){
            return JSON.stringify(obj, null, 2)
        }
    },
    {
        name: 'yaml',
        ext: ['yml', 'yaml'],
        parse(data){
            return require('js-yaml').load(data)
        },
        stringify(obj){
            return require('js-yaml').dump(obj)
        }
    },
    {
        name: 'properties',
        ext: ['ini', 'properties'],
        parse(data){
            return require('properties').parse(data)
        },
        stringify(data){
            return require('properties').stringify(data)
        }
    },
    {
        name: 'xml',
        ext: ['xml'],
        parse(data){
            var x2js = new require('x2js')();
            return x2js.xml2js(data)
        },
        stringify(data){
            var x2js = new require('x2js')();
            return x2js.js2xml(data)
        }
    }
]

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
    if (fileType !== null && typeof fileType === 'object') {
        options = fileType
        fileType = null
    }
    return new Promise((resolve, reject)=> {
        fs.readFile(filePath, 'utf8', (err, data)=> {
            if (err) {
                if (options && typeof options.default === 'string' && err.code === 'EEXIST') {
                    data = options.default
                } else {
                    return reject(err)
                }
            }
            let extension = fileType || path.extname(filePath).substr(1),
                handler   = HANDLERS.find(handler=>(handler.ext && handler.ext.indexOf(extension) > -1) || (handler.test && handler.test(filePath, extension, data)))
            if (!handler) {
                return reject(new Error(`Could not find suitable handler for ${filePath}.`))
            }
            debug(`Using handler '${handler.name}' for file '${filePath}'.`)
            resolve({
                config: handler.parse(data),
                handler,
                data
            })
        })

    })

}

/**
 * Checks if the passed config object needs updating.  Note this is atomic.
 * @param existing
 * @param config
 * @return {boolean}
 */
function needsUpdate(existing, config) {
    for (let key in config) {
        let value = config[key]
        if (value && typeof value === 'object') {
            if (existing[key] === null || typeof existing[key] !== 'object' || needsUpdate(existing[key], value)) {
                return true
            }
        } else if (value != existing[key]) {
            return true
        }
    }
    return false
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
    if (fileType !== null && typeof fileType === 'object') {
        options = config
        config = fileType
        fileType = null
    }
    options = Object.assign({
        replaceConfig: false,
        deepMerge: true,
        check: false,
        default: ''
    }, options)
    let {replaceConfig,deepMerge,check} = options

    return getConfig(filePath, fileType, options).then(existing=> {
        if (check && !needsUpdate(existing, config)) {
            return null
        }
        let newString = existing.handler.stringify(replaceConfig ? config : (deepMerge ? merge(existing.config, config) : Object.assign(existing.config, config)))
        let diff = diffLines(existing.data, newString)
        let resultingString = ''
        diff.forEach(diff=> {
            if (diff.removed && (diff.value.startsWith('#') || diff.value.startsWith(';') || diff.value.startsWith(';'))) {
                diff.removed = false
            }
            if (!diff.removed) {
                resultingString += diff.value
            }
        })
        return resultingString
    })

}

/**
 * Creates a backup of the file (if file exists) in the format of 'fileName.YYYYMMDD.bak'.  If a existing backup
 * exists, appends .# to backup file.
 * @param {string} filePath
 * @return {Promise}
 */
function createBackupFile(filePath) {
    return new Promise((resolve, reject)=> {
        fs.readdir(path.dirname(filePath), (err, files)=> {
            if (err) {
                return reject(err)
            }
            let fileNum  = 0,
                fileName = path.parse(filePath).base,
                date     = new Date().toISOString().substr(0, 12).replace(/-/g, ''),
                backupName
            while (files.indexOf(backupName = fileName + `.${date}.bak` + (fileNum > 0 ? '.' + fileNum : '')) > -1) {
                fileNum++;
            }

            if (files.indexOf(fileName) === -1) {
                debug(`'${filePath}' does not exist, so skipping backup.`)
                return resolve()
            }

            fs.createReadStream(filePath)
                .pipe(fs.createWriteStream(path.dirname(filePath) + '/' + backupName))
                .on('error', err=>reject(err))
                .on('end', ()=>resolve())
        })
    })
}

function ensureConfig(filePath, fileType, config) {
    return getUpdatedConfig(filePath, fileType, config, {check: true}).then(updatedConfig=> {
        if (updatedConfig !== null) {
            return createBackupFile(filePath).then(()=> {
                return new Promise((resolve, reject)=> {
                    fs.writeFile(filePath, updatedConfig, err =>err ? reject(err) : resolve({filePath, updatedConfig}))
                })
            })
        }
        return false
    })

}

export {
    getUpdatedConfig,
    ensureConfig,
    createBackupFile,
    needsUpdate,
    HANDLERS
}