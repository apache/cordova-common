/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

const fs = require('fs-extra');
const deepFreeze = require('deep-freeze');
const detectIndent = require('detect-indent');
const detectNewline = require('detect-newline');
const stringifyPackage = require('stringify-package');
const writeFileAtomic = require('write-file-atomic');

/**
 * @typedef {{[name: string] : object}} PluginConfiguration
 */
/**
 * @typedef {object} CordovaMetadata
 * @property {Array<string>} platforms
 * @property {PluginConfiguration} plugins
 */
/**
 * @typedef {object} PackageData
 * @property {string} name
 * @property {string} version
 * @property {{[name: string]: string}} dependencies
 * @property {{[name: string]: string}} devDependencies
 * @property {CordovaMetadata} cordova
 */

/**
 * A helper class for managing Cordova-specific metadata in package files, such
 * as the list of installed platforms and plugins.
 */
class PackageHelper {
    /**
     * Creates a new package metadata management helper for handling
     * Cordova-specific metadata in the package file.
     *
     * @param {string} path - The path to the package file.
     */
    constructor (path) {
        /** @type {PackageData} The package data. */
        this.pkgfile = {};

        /** @private @type {string} The path to the package file. */
        this.filepath = path;

        if (fs.existsSync(path)) {
            const fileData = fs.readFileSync(path, 'utf8');

            /** @private @type {number|undefined} */
            this.indent = detectIndent(fileData).indent;
            /** @private @type {string|undefined} */
            this.newline = detectNewline(fileData);

            this.pkgfile = JSON.parse(fileData);
        }
    }

    /**
     * Return the package identifier name, if it exists.
     *
     * @returns {string|undefined} The package identifier.
     */
    get packageID () {
        return this.pkgfile.name;
    }

    /**
     * Returns the package version number as a string, if it exists.
     *
     * @returns {string|undefined} The package version number.
     */
    get version () {
        return this.pkgfile.version;
    }

    /**
     * Returns the Cordova-specific section of the package, namely the list of
     * platforms and plugins.
     *
     * @returns {CordovaMetadata} The Cordova project metadata.
     */
    get cordova () {
        // This is a poor way to deeply clone the data, but it's fast and since
        // it's package.json we can guarantee that it's safe to stringify and
        // parse again without losing anything
        return deepFreeze(JSON.parse(JSON.stringify(this.pkgfile.cordova || {})));
    }

    /**
     * Returns an object keyed by the name of Cordova dependencies and their
     * requested versions.
     *
     * @returns {{[name: string] : string}} The Cordova dependencies.
     */
    get cordovaDependencies () {
        return deepFreeze(
            this.cordovaPlatforms
                .map(p => p.startsWith('cordova-') ? p : `cordova-${p}`)
                .concat(this.cordovaPlugins)
                .reduce((deps, cur) => {
                    deps[cur] = this.pkgfile.devDependencies[cur] || this.pkgfile.dependencies[cur];
                    return deps;
                }, {})
        );
    }

    /**
     * Retrieves the list of Cordova platforms for the project.
     *
     * @returns {Array<string>} The list of packages.
     */
    get cordovaPlatforms () {
        return deepFreeze(this.cordova.platforms || []);
    }

    /**
     * Retrieves the list of Cordova plugins for the project.
     *
     * @returns {Array<string>} The list of plugins.
     */
    get cordovaPlugins () {
        return deepFreeze(Object.keys(this.cordova.plugins || {}));
    }

    /**
     * Retrieves the configuration variables for a particular plugin.
     *
     * @param {string} pluginName - The plugin for which to retrieve variables.
     * @returns {{[name: string] : string}} The plugin variables.
     */
    getPluginVariables (pluginName) {
        const plugins = this.cordova.plugins || {};

        return deepFreeze(JSON.parse(JSON.stringify(plugins[pluginName] || {})));
    }

    /**
     * Adds the specified plugin to the Cordova section of the package file.
     *
     * @param {string} platform - The platform to add to the package.
     */
    addPlatform (platform) {
        if (!this.cordovaPlatforms.includes(platform)) {
            this.pkgfile.cordova = this.pkgfile.cordova || {};
            this.pkgfile.cordova.platforms = this.pkgfile.cordova.platforms || [];

            this.pkgfile.cordova.platforms.push(platform);
        }
    }

    /**
     * Adds the specified plugin and configuration variables to the Cordova section of the package file.
     *
     * @param {string} plugin - The plugin to add to the package.
     * @param {object} vars - The plugin configuration variables (optional).
     */
    addPlugin (plugin, vars = {}) {
        if (this.cordovaPlugins.includes(plugin)) {
            // Already have the plugin installed, but might need to merge vars
            let existing_vars = this.pkgfile.cordova.plugins[plugin];

            this.pkgfile.cordova.plugins[plugin] = Object.assign({}, existing_vars, vars);
        } else {
            this.pkgfile.cordova = this.pkgfile.cordova || {};
            this.pkgfile.cordova.plugins = this.pkgfile.cordova.plugins || {};

            // Make a copy of vars for immutability
            this.pkgfile.cordova.plugins[plugin] = Object.assign({}, vars);
        }
    }

    /**
     * Writes the modified package file to disk.
     *
     * @returns {Promise<this>} The instance, for chaining.
     */
    write () {
        return new Promise((resolve) => {
            writeFileAtomic(this.filepath, stringifyPackage(this.pkgfile, this.indent, this.newline), () => resolve(this));
        });
    }

    /**
     * Writes the modified package file to disk synchronously.
     */
    writeSync () {
        writeFileAtomic.sync(this.filepath, stringifyPackage(this.pkgfile, this.indent, this.newline));
    }
}

module.exports = PackageHelper;
